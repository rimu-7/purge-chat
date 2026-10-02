import { Redis } from "@upstash/redis"

export interface RoomMeta {
  id: string
  ownerId: string
  secretKey?: string | null
  expiresAt: string // ISO string
  isBackedUp: boolean
  createdAt: string
}

let cachedRedis: Redis | null = null
let upstashDisabled = false

// High-performance in-memory cache with exact millisecond TTL
const memoryStore = new Map<string, { data: unknown; expiresAt: number }>()

function getMemoryCache<T>(key: string): T | null {
  const item = memoryStore.get(key)
  if (!item) return null
  if (Date.now() > item.expiresAt) {
    memoryStore.delete(key)
    return null
  }
  return item.data as T
}

function setMemoryCache(key: string, data: unknown, ttlSeconds: number): void {
  memoryStore.set(key, {
    data,
    expiresAt: Date.now() + Math.max(1, ttlSeconds) * 1000,
  })
}

function deleteMemoryCache(key: string): void {
  memoryStore.delete(key)
}

function checkAndHandleUpstashError(err: unknown): void {
  const errorObj = err as { code?: string; cause?: { code?: string } } | null
  if (errorObj?.cause?.code === "ENOTFOUND" || errorObj?.code === "ENOTFOUND") {
    upstashDisabled = true
  }
}

export function getRedis(): Redis | null {
  if (upstashDisabled) return null
  if (cachedRedis) return cachedRedis

  const url = process.env.UPSTASH_REDIS_REST_URL
  const token = process.env.UPSTASH_REDIS_REST_TOKEN

  if (!url || !token) {
    return null
  }

  try {
    cachedRedis = new Redis({ url, token })
    return cachedRedis
  } catch {
    upstashDisabled = true
    return null
  }
}

export function assertRedisConfigured(): Redis | null {
  return getRedis()
}

/**
 * Cache room metadata in memory (0ms) and Redis with native TTL matching room duration.
 */
export async function setRoomMeta(
  roomId: string,
  meta: RoomMeta,
  ttlSeconds: number
): Promise<void> {
  const key = `room:${roomId}:meta`
  setMemoryCache(key, meta, ttlSeconds)

  const client = getRedis()
  if (!client) return

  try {
    await client.set(key, JSON.stringify(meta), { ex: ttlSeconds })
  } catch (err: unknown) {
    checkAndHandleUpstashError(err)
  }
}

/**
 * Get cached room metadata. Instant memory lookup, fallback to Redis.
 */
export async function getRoomMeta(roomId: string): Promise<RoomMeta | null> {
  const key = `room:${roomId}:meta`
  const memData = getMemoryCache<RoomMeta>(key)
  if (memData) return memData

  const client = getRedis()
  if (!client) return null

  try {
    const data = await client.get<RoomMeta | string>(key)
    if (!data) return null
    const parsed: RoomMeta = typeof data === "string" ? JSON.parse(data) : data
    const ttlSeconds = Math.max(
      1,
      Math.floor((new Date(parsed.expiresAt).getTime() - Date.now()) / 1000)
    )
    setMemoryCache(key, parsed, ttlSeconds)
    return parsed
  } catch (err: unknown) {
    checkAndHandleUpstashError(err)
    return null
  }
}

/**
 * Remove room metadata from memory and Redis
 */
export async function deleteRoomMeta(roomId: string): Promise<void> {
  const key = `room:${roomId}:meta`
  deleteMemoryCache(key)

  const client = getRedis()
  if (!client) return

  try {
    await client.del(key)
  } catch (err: unknown) {
    checkAndHandleUpstashError(err)
  }
}

/**
 * Cache room messages with native TTL. Instant in-memory storage.
 */
export async function setCachedMessages<T = unknown>(
  roomId: string,
  msgs: T[],
  ttlSeconds: number
): Promise<void> {
  const key = `room:${roomId}:messages`
  setMemoryCache(key, msgs, ttlSeconds)

  const client = getRedis()
  if (!client) return

  try {
    await client.set(key, JSON.stringify(msgs), { ex: ttlSeconds })
  } catch (err: unknown) {
    checkAndHandleUpstashError(err)
  }
}

/**
 * Get cached messages. Returns instantly from in-memory cache.
 */
export async function getCachedMessages<T = unknown>(
  roomId: string
): Promise<T[] | null> {
  const key = `room:${roomId}:messages`
  const memData = getMemoryCache<T[]>(key)
  if (memData) return memData

  const client = getRedis()
  if (!client) return null

  try {
    const data = await client.get<T[] | string>(key)
    if (!data) return null
    const parsed: T[] = typeof data === "string" ? JSON.parse(data) : data
    setMemoryCache(key, parsed, 300)
    return parsed
  } catch (err: unknown) {
    checkAndHandleUpstashError(err)
    return null
  }
}

/**
 * Append a newly posted message to cache instantly in memory.
 */
export async function appendCachedMessage<T extends { id: string }>(
  roomId: string,
  msg: T,
  ttlSeconds?: number
): Promise<void> {
  const key = `room:${roomId}:messages`
  const ttl = ttlSeconds && ttlSeconds > 0 ? ttlSeconds : 3600
  let currentList = getMemoryCache<T[]>(key) || []
  if (!currentList.some((m) => m.id === msg.id)) {
    currentList = [...currentList, msg]
  }
  setMemoryCache(key, currentList, ttl)

  const client = getRedis()
  if (!client) return

  try {
    await client.set(key, JSON.stringify(currentList), { ex: ttl })
  } catch (err: unknown) {
    checkAndHandleUpstashError(err)
  }
}

/**
 * Remove cached messages from memory and Redis
 */
export async function deleteCachedMessages(roomId: string): Promise<void> {
  const key = `room:${roomId}:messages`
  deleteMemoryCache(key)

  const client = getRedis()
  if (!client) return

  try {
    await client.del(key)
  } catch (err: unknown) {
    checkAndHandleUpstashError(err)
  }
}

/**
 * Map secret key to room ID for resilient URL resolution
 */
export async function setSecretKeyMapping(
  secretKey: string,
  roomId: string,
  ttlSeconds: number
): Promise<void> {
  const key = `secret:${secretKey}:room`
  setMemoryCache(key, roomId, ttlSeconds)

  const client = getRedis()
  if (!client) return

  try {
    await client.set(key, roomId, { ex: ttlSeconds })
  } catch (err: unknown) {
    checkAndHandleUpstashError(err)
  }
}

/**
 * Resolve room ID from a secret key
 */
export async function getRoomIdBySecretKey(
  secretKey: string
): Promise<string | null> {
  const key = `secret:${secretKey}:room`
  const memData = getMemoryCache<string>(key)
  if (memData) return memData

  const client = getRedis()
  if (!client) return null

  try {
    const data = await client.get<string>(key)
    if (!data) return null
    setMemoryCache(key, data, 300)
    return data
  } catch (err: unknown) {
    checkAndHandleUpstashError(err)
    return null
  }
}

export interface JoinRequest {
  senderId: string
  senderName: string
  createdAt: string
}

/**
 * Add a participant to the approved list for a room
 */
export async function addApprovedParticipant(
  roomId: string,
  senderId: string,
  ttlSeconds: number
): Promise<void> {
  const key = `room:${roomId}:approved:${senderId}`
  setMemoryCache(key, true, ttlSeconds)

  const client = getRedis()
  if (!client) return

  try {
    await client.set(key, "1", { ex: ttlSeconds })
  } catch (err: unknown) {
    checkAndHandleUpstashError(err)
  }
}

/**
 * Check if a participant is approved for a room
 */
export async function isParticipantApproved(
  roomId: string,
  senderId: string
): Promise<boolean> {
  const key = `room:${roomId}:approved:${senderId}`
  const mem = getMemoryCache<boolean>(key)
  if (mem === true) return true

  const client = getRedis()
  if (!client) return false

  try {
    const val = await client.get<string>(key)
    if (val === "1") {
      setMemoryCache(key, true, 300)
      return true
    }
    return false
  } catch (err: unknown) {
    checkAndHandleUpstashError(err)
    return false
  }
}

/**
 * Add or update a pending join request
 */
export async function addJoinRequest(
  roomId: string,
  request: JoinRequest,
  ttlSeconds: number
): Promise<void> {
  const listKey = `room:${roomId}:requests`
  const existing = (getMemoryCache<JoinRequest[]>(listKey) || []).filter(
    (r) => r.senderId !== request.senderId
  )
  existing.push(request)
  setMemoryCache(listKey, existing, ttlSeconds)

  const client = getRedis()
  if (!client) return

  try {
    await client.set(listKey, JSON.stringify(existing), { ex: ttlSeconds })
  } catch (err: unknown) {
    checkAndHandleUpstashError(err)
  }
}

/**
 * Get all pending join requests for a room
 */
export async function getPendingJoinRequests(
  roomId: string
): Promise<JoinRequest[]> {
  const listKey = `room:${roomId}:requests`
  const mem = getMemoryCache<JoinRequest[]>(listKey)
  if (mem) return mem

  const client = getRedis()
  if (!client) return []

  try {
    const data = await client.get<JoinRequest[] | string>(listKey)
    if (!data) return []
    const parsed: JoinRequest[] =
      typeof data === "string" ? JSON.parse(data) : (data as JoinRequest[])
    setMemoryCache(listKey, parsed, 60)
    return parsed
  } catch (err: unknown) {
    checkAndHandleUpstashError(err)
    return []
  }
}

/**
 * Remove a join request (after approval or rejection)
 */
export async function removeJoinRequest(
  roomId: string,
  senderId: string
): Promise<void> {
  const listKey = `room:${roomId}:requests`
  const existing = (getMemoryCache<JoinRequest[]>(listKey) || []).filter(
    (r) => r.senderId !== senderId
  )
  setMemoryCache(listKey, existing, 3600)

  const client = getRedis()
  if (!client) return

  try {
    await client.set(listKey, JSON.stringify(existing), { ex: 3600 })
  } catch (err: unknown) {
    checkAndHandleUpstashError(err)
  }
}


