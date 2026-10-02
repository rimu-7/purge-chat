import { getDb } from "@/db"
import { encryptedBackups, Message, messages, Room, rooms } from "@/db/schema"
import { generateSecretKey, hashRoomId } from "@/lib/crypto"
import { generateId, generateRoomId } from "@/lib/identity"
import {
  addApprovedParticipant,
  addJoinRequest,
  appendCachedMessage,
  deleteCachedMessages,
  deleteRoomMeta,
  getCachedMessages,
  getPendingJoinRequests,
  getRoomIdBySecretKey,
  getRoomMeta,
  isParticipantApproved,
  JoinRequest,
  removeJoinRequest,
  setCachedMessages,
  setRoomMeta,
  setSecretKeyMapping,
} from "@/lib/redis"
import { eq, inArray, lt, notInArray, or } from "drizzle-orm"

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
    secretKey,
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
      secretKey,
      expiresAt: expiresAt.toISOString(),
      isBackedUp: false,
      createdAt: now.toISOString(),
    },
    ttlSeconds
  )

  // Auto-approve the room creator as participant
  await addApprovedParticipant(roomId, ownerId, ttlSeconds)

  // Also map secretKey -> roomId for seamless entry if a user pastes the secret key
  await setSecretKeyMapping(secretKey, roomId, ttlSeconds)

  // Post system creation message
  const creatorName = ownerAlias?.trim() || "Anonymous Creator"
  await postSystemMessage(
    roomId,
    `👑 ${creatorName} created secret room ${roomId}`
  )

  return { room, secretKey }
}

/**
 * Check if sender has approved access to the room. Room owner is always approved.
 */
export async function checkParticipantAccess(
  roomId: string,
  senderId: string
): Promise<boolean> {
  if (!roomId || !senderId) return false
  const room = await getActiveRoom(roomId)
  if (!room) return false
  if (room.ownerId === senderId) return true
  return isParticipantApproved(room.id, senderId)
}

/**
 * Register a pending join request from an unapproved participant
 */
export async function requestToJoinRoom(
  roomId: string,
  senderId: string,
  senderName: string
): Promise<{ success: boolean; room: Room | null; alreadyApproved: boolean }> {
  const room = await getActiveRoom(roomId)
  if (!room) return { success: false, room: null, alreadyApproved: false }

  if (room.ownerId === senderId) {
    return { success: true, room, alreadyApproved: true }
  }

  const approved = await isParticipantApproved(room.id, senderId)
  if (approved) {
    return { success: true, room, alreadyApproved: true }
  }

  const now = new Date()
  const ttlSeconds = Math.max(
    1,
    Math.floor((room.expiresAt.getTime() - now.getTime()) / 1000)
  )

  await addJoinRequest(
    room.id,
    {
      senderId,
      senderName: senderName?.trim() || "Anonymous Participant",
      createdAt: now.toISOString(),
    },
    ttlSeconds
  )

  return { success: true, room, alreadyApproved: false }
}

/**
 * Creator approves a participant join request
 */
export async function approveJoinRequest(
  roomId: string,
  hostSenderId: string,
  targetSenderId: string
): Promise<boolean> {
  const room = await getActiveRoom(roomId)
  if (!room) return false
  if (room.ownerId !== hostSenderId) {
    throw new Error("Only the room creator can approve participants.")
  }

  const now = new Date()
  const ttlSeconds = Math.max(
    1,
    Math.floor((room.expiresAt.getTime() - now.getTime()) / 1000)
  )

  await addApprovedParticipant(room.id, targetSenderId, ttlSeconds)
  await removeJoinRequest(room.id, targetSenderId)
  return true
}

/**
 * Creator rejects a participant join request
 */
export async function rejectJoinRequest(
  roomId: string,
  hostSenderId: string,
  targetSenderId: string
): Promise<boolean> {
  const room = await getActiveRoom(roomId)
  if (!room) return false
  if (room.ownerId !== hostSenderId) {
    throw new Error("Only the room creator can reject participants.")
  }

  await removeJoinRequest(room.id, targetSenderId)
  return true
}

/**
 * Get all pending join requests for the creator
 */
export async function getRoomJoinRequests(
  roomId: string,
  hostSenderId: string
): Promise<JoinRequest[]> {
  const room = await getActiveRoom(roomId)
  if (!room || room.ownerId !== hostSenderId) {
    return []
  }
  return getPendingJoinRequests(room.id)
}

/**
 * Check if room is active. If expired, instantly purges the room and all messages.
 * Supports looking up by Room ID or Secret Key.
 * Uses Redis/memory cache directly for sub-millisecond lookup.
 */
export async function getActiveRoom(idOrKey: string): Promise<Room | null> {
  if (!idOrKey) return null
  let roomId = idOrKey.trim()

  // If idOrKey is not 16 chars, check if it's a secret key
  if (roomId.length !== 16) {
    const mapped = await getRoomIdBySecretKey(roomId)
    if (mapped) {
      roomId = mapped
    }
  }

  const now = new Date()

  // 1. Check Redis cache first (sub-millisecond)
  const cachedMeta = await getRoomMeta(roomId)
  if (cachedMeta) {
    const expiresAt = new Date(cachedMeta.expiresAt)
    if (now > expiresAt) {
      await purgeRoomInternal(roomId)
      return null
    }
    return {
      id: cachedMeta.id,
      ownerId: cachedMeta.ownerId,
      secretKey: cachedMeta.secretKey ?? null,
      expiresAt,
      isBackedUp: cachedMeta.isBackedUp,
      createdAt: new Date(cachedMeta.createdAt),
    }
  }

  // 2. Query TiDB MySQL on cache miss by room ID or secretKey
  const database = getDb()
  const [room] = await database
    .select()
    .from(rooms)
    .where(or(eq(rooms.id, roomId), eq(rooms.secretKey, roomId)))
    .limit(1)

  if (!room) {
    return null
  }

  if (now > room.expiresAt) {
    await purgeRoomInternal(room.id)
    return null
  }

  // Populate Redis cache for subsequent lightning-fast requests
  const ttlSeconds = Math.max(
    1,
    Math.floor((room.expiresAt.getTime() - now.getTime()) / 1000)
  )
  await setRoomMeta(
    room.id,
    {
      id: room.id,
      ownerId: room.ownerId,
      secretKey: room.secretKey,
      expiresAt: room.expiresAt.toISOString(),
      isBackedUp: room.isBackedUp,
      createdAt: room.createdAt.toISOString(),
    },
    ttlSeconds
  )

  if (room.secretKey) {
    await setSecretKeyMapping(room.secretKey, room.id, ttlSeconds)
  }

  return room
}

/**
 * Fetch messages for an active room. Checks Redis cache first for lightning performance.
 * If senderId is specified, enforces participant approval.
 */
export async function getRoomMessages(
  idOrKey: string,
  senderId?: string
): Promise<Message[]> {
  const room = await getActiveRoom(idOrKey)
  if (!room) return []
  const roomId = room.id

  // Enforce access control if senderId provided
  if (senderId) {
    const hasAccess = await checkParticipantAccess(roomId, senderId)
    if (!hasAccess) return []
  }

  // Check Redis messages cache
  const cached = await getCachedMessages<Message>(roomId)
  if (cached !== null) {
    return cached
  }

  const database = getDb()
  const msgs = await database
    .select()
    .from(messages)
    .where(eq(messages.roomId, roomId))
    .orderBy(messages.createdAt)

  // Populate Redis cache
  const now = new Date()
  const ttlSeconds = Math.max(
    1,
    Math.floor((room.expiresAt.getTime() - now.getTime()) / 1000)
  )
  await setCachedMessages(roomId, msgs, ttlSeconds)

  return msgs
}

/**
 * Insert a message into Redis cache (instant) and TiDB MySQL.
 * Returns the message immediately without redundant queries.
 * Enforces participant approval for user messages.
 */
export async function postMessage(
  idOrKey: string,
  senderId: string,
  senderName: string,
  content: string,
  type: "user" | "system" = "user"
): Promise<Message | null> {
  const room = await getActiveRoom(idOrKey)
  if (!room) return null
  const roomId = room.id

  // Enforce approval for non-system messages
  if (type !== "system") {
    const hasAccess = await checkParticipantAccess(roomId, senderId)
    if (!hasAccess) return null
  }

  const messageId = generateId()
  const now = new Date()

  const messageRecord: Message = {
    id: messageId,
    roomId,
    senderId,
    senderName,
    content,
    type,
    createdAt: now,
  }

  const ttlSeconds = Math.max(
    1,
    Math.floor((room.expiresAt.getTime() - now.getTime()) / 1000)
  )

  // 1. Append to Redis cache for instant availability
  await appendCachedMessage(roomId, messageRecord, ttlSeconds)

  // 2. Persist to TiDB MySQL
  const database = getDb()
  await database.insert(messages).values(messageRecord)

  return messageRecord
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
 * Internal Purge: Deletes all messages and room from TiDB and purges Redis cache.
 * Guarantees zero residual unencrypted records.
 */
export async function purgeRoomInternal(roomId: string): Promise<void> {
  const database = getDb()
  try {
    // Explicitly delete messages first to guarantee removal even if foreign key cascade is disabled
    await database.delete(messages).where(eq(messages.roomId, roomId))
    await database.delete(rooms).where(eq(rooms.id, roomId))
  } catch (err) {
    console.error(`Error purging room ${roomId} from database:`, err)
  }

  // Purge from Redis
  await deleteRoomMeta(roomId)
  await deleteCachedMessages(roomId)
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
 * 1. Deletes all expired rooms and their messages (regardless of backup status) from TiDB & Redis.
 * 2. Purges any orphaned message rows whose rooms no longer exist.
 * 3. Deletes backups untouched for 60 days.
 */
export async function runVanishPurgeSweep() {
  const now = new Date()
  const sixtyDaysAgo = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000)
  const database = getDb()

  // 1. Purge all expired rooms (and explicitly their messages)
  const expiredRooms = await database
    .select({ id: rooms.id })
    .from(rooms)
    .where(lt(rooms.expiresAt, now))

  const expiredRoomIds = expiredRooms.map((r) => r.id)
  if (expiredRoomIds.length > 0) {
    try {
      await database
        .delete(messages)
        .where(inArray(messages.roomId, expiredRoomIds))
      await database.delete(rooms).where(inArray(rooms.id, expiredRoomIds))
    } catch (err) {
      console.error("Error deleting expired rooms from database:", err)
    }

    for (const rid of expiredRoomIds) {
      await deleteRoomMeta(rid)
      await deleteCachedMessages(rid)
    }
  }

  // 2. Also purge any orphaned messages whose room no longer exists
  try {
    const allActiveRooms = await database.select({ id: rooms.id }).from(rooms)
    const activeRoomIds = allActiveRooms.map((r) => r.id)
    if (activeRoomIds.length > 0) {
      await database
        .delete(messages)
        .where(notInArray(messages.roomId, activeRoomIds))
    } else {
      await database.delete(messages)
    }
  } catch (err) {
    console.error("Error purging orphaned messages:", err)
  }

  // 3. 60-Day Purge for untouched backups
  await database
    .delete(encryptedBackups)
    .where(lt(encryptedBackups.lastAccessedAt, sixtyDaysAgo))

  return { purgedAt: now.toISOString(), purgedRoomCount: expiredRoomIds.length }
}

