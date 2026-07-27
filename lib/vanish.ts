import { getDb } from "@/db"
import { encryptedBackups, Message, messages, Room, rooms } from "@/db/schema"
import { generateSecretKey, hashRoomId } from "@/lib/crypto"
import { generateId, generateRoomId } from "@/lib/identity"
import { deleteRoomMeta, getRoomMeta, setRoomMeta } from "@/lib/redis"
import { and, eq, lt } from "drizzle-orm"

export interface CreateRoomResult {
  room: Room
  secretKey: string
}

/**
 * Create a new ephemeral room with duration in minutes and assign ownerId
 */
export async function createRoom(
  durationMinutes: number,
  ownerId: string,
  ownerAlias?: string
): Promise<CreateRoomResult> {
  const roomId = generateRoomId()
  const secretKey = generateSecretKey()
  const now = new Date()
  const expiresAt = new Date(now.getTime() + durationMinutes * 60 * 1000)

  const database = getDb()

  // Insert into TiDB MySQL
  await database.insert(rooms).values({
    id: roomId,
    ownerId,
    expiresAt,
    isBackedUp: false,
    createdAt: now,
  })

  const [room] = await database
    .select()
    .from(rooms)
    .where(eq(rooms.id, roomId))
    .limit(1)

  // Cache in Upstash Redis with native TTL matching duration in seconds (~50 bytes)
  const ttlSeconds = Math.max(
    1,
    Math.floor((expiresAt.getTime() - now.getTime()) / 1000)
  )
  await setRoomMeta(
    roomId,
    {
      id: roomId,
      ownerId,
      expiresAt: expiresAt.toISOString(),
      isBackedUp: false,
      createdAt: now.toISOString(),
    },
    ttlSeconds
  )

  // Post system creation message
  const creatorName = ownerAlias?.trim() || "Anonymous Creator"
  await postSystemMessage(
    roomId,
    `👑 ${creatorName} created secret room ${roomId}`
  )

  return { room, secretKey }
}

/**
 * Check if room is active. If expired and not backed up, instantly purges the room and all messages.
 */
export async function getActiveRoom(roomId: string): Promise<Room | null> {
  // Check Redis cache first
  const cachedMeta = await getRoomMeta(roomId)
  const now = new Date()

  if (cachedMeta) {
    const expiresAt = new Date(cachedMeta.expiresAt)
    if (now > expiresAt && !cachedMeta.isBackedUp) {
      await purgeRoomInternal(roomId)
      return null
    }
  }

  const database = getDb()

  // Query TiDB MySQL
  const [room] = await database
    .select()
    .from(rooms)
    .where(eq(rooms.id, roomId))
    .limit(1)
  if (!room) {
    return null
  }

  if (now > room.expiresAt && !room.isBackedUp) {
    await purgeRoomInternal(roomId)
    return null
  }

  return room
}

/**
 * Fetch messages for an active room
 */
export async function getRoomMessages(roomId: string): Promise<Message[]> {
  const room = await getActiveRoom(roomId)
  if (!room) return []

  const database = getDb()

  return database
    .select()
    .from(messages)
    .where(eq(messages.roomId, roomId))
    .orderBy(messages.createdAt)
}

/**
 * Insert a message into TiDB MySQL
 */
export async function postMessage(
  roomId: string,
  senderId: string,
  senderName: string,
  content: string,
  type: "user" | "system" = "user"
): Promise<Message | null> {
  const room = await getActiveRoom(roomId)
  if (!room) return null

  const messageId = generateId()
  const now = new Date()

  const database = getDb()

  await database.insert(messages).values({
    id: messageId,
    roomId,
    senderId,
    senderName,
    content,
    type,
    createdAt: now,
  })

  const [msg] = await database
    .select()
    .from(messages)
    .where(eq(messages.id, messageId))
    .limit(1)
  return msg || null
}

/**
 * Post a system notification message into the room feed
 */
export async function postSystemMessage(
  roomId: string,
  content: string
): Promise<Message | null> {
  return postMessage(roomId, "system", "SYSTEM", content, "system")
}

/**
 * Internal Purge: Deletes room from TiDB (cascading delete on messages) and removes Redis metadata.
 */
async function purgeRoomInternal(roomId: string): Promise<void> {
  const database = getDb()
  await database.delete(rooms).where(eq(rooms.id, roomId))
  await deleteRoomMeta(roomId)
}

/**
 * Manual Purge: Verifies sender is room owner before purging.
 */
export async function purgeRoom(
  roomId: string,
  requestingSenderId?: string
): Promise<boolean> {
  const room = await getActiveRoom(roomId)
  if (!room) return true

  if (requestingSenderId && room.ownerId !== requestingSenderId) {
    throw new Error("Only the room owner has permission to purge this chat.")
  }

  await purgeRoomInternal(roomId)
  return true
}

/**
 * Owner-Only Non-Destructive Backup:
 * Saves encrypted snapshot to encrypted_backups, sets isBackedUp = true in TiDB & Redis,
 * WITHOUT destroying room or interrupting active live chat!
 */
export async function createEncryptedBackup(
  roomId: string,
  requestingSenderId: string,
  encryptedData: string,
  iv: string
): Promise<{ roomIdHash: string; sysMsg: Message | null }> {
  const room = await getActiveRoom(roomId)
  if (!room) {
    throw new Error("Room expired or not found")
  }

  if (room.ownerId !== requestingSenderId) {
    throw new Error("Only the room owner has permission to backup this chat.")
  }

  const backupId = generateId()
  const roomIdHashStr = await hashRoomId(roomId)
  const now = new Date()

  const database = getDb()

  // Insert or update encrypted backup record
  await database.insert(encryptedBackups).values({
    id: backupId,
    roomIdHash: roomIdHashStr,
    encryptedData,
    iv,
    createdAt: now,
    lastAccessedAt: now,
  })

  // Mark room as backed up in TiDB
  await database
    .update(rooms)
    .set({ isBackedUp: true })
    .where(eq(rooms.id, roomId))

  // Update Redis cache metadata
  const cachedMeta = await getRoomMeta(roomId)
  if (cachedMeta) {
    const ttlSeconds = Math.max(
      1,
      Math.floor(
        (new Date(cachedMeta.expiresAt).getTime() - now.getTime()) / 1000
      )
    )
    await setRoomMeta(
      roomId,
      {
        ...cachedMeta,
        isBackedUp: true,
      },
      ttlSeconds
    )
  }

  const sysMsg = await postSystemMessage(
    roomId,
    "🛡️ CHAT IS BACKED UP SECURELY"
  )

  return { roomIdHash: roomIdHashStr, sysMsg }
}

/**
 * Fetch encrypted backup by room ID hash for zero-knowledge decryption
 */
export async function getEncryptedBackup(roomIdHashStr: string) {
  const database = getDb()
  const [backup] = await database
    .select()
    .from(encryptedBackups)
    .where(eq(encryptedBackups.roomIdHash, roomIdHashStr))
    .limit(1)

  if (!backup) return null

  // Touch lastAccessedAt to reset 60-day auto-purge window
  const now = new Date()
  await database
    .update(encryptedBackups)
    .set({ lastAccessedAt: now })
    .where(eq(encryptedBackups.id, backup.id))

  return backup
}

/**
 * Background Cron Purge Worker:
 * 1. Deletes expired rooms from TiDB where expires_at < NOW() and is_backed_up = false (cascades to all messages).
 * 2. Deletes backups untouched for 60 days.
 */
export async function runVanishPurgeSweep() {
  const now = new Date()
  const sixtyDaysAgo = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000)

  // 1. Purge expired non-backed up rooms (cascades to messages)
  const database = getDb()

  await database
    .delete(rooms)
    .where(and(lt(rooms.expiresAt, now), eq(rooms.isBackedUp, false)))

  // 2. 60-Day Purge for untouched backups
  await database
    .delete(encryptedBackups)
    .where(lt(encryptedBackups.lastAccessedAt, sixtyDaysAgo))

  return { purgedAt: now.toISOString() }
}
