import { Redis } from "@upstash/redis"

export interface RoomMeta {
  id: string
  ownerId: string
  expiresAt: string // ISO string
  isBackedUp: boolean
  createdAt: string
}

let cachedRedis: Redis | null = null

export function getRedis(): Redis | null {
  if (cachedRedis) return cachedRedis

  const url = process.env.UPSTASH_REDIS_REST_URL
  const token = process.env.UPSTASH_REDIS_REST_TOKEN

  if (!url || !token) {
    return null
  }

  cachedRedis = new Redis({ url, token })
  return cachedRedis
}

export function assertRedisConfigured(): Redis | null {
  return getRedis()
}

/**
 * Cache room metadata in Redis with native TTL matching room duration.
 */
export async function setRoomMeta(
  roomId: string,
  meta: RoomMeta,
  ttlSeconds: number
): Promise<void> {
  try {
    const client = getRedis()
    if (!client) return
    const key = `room:${roomId}:meta`
    await client.set(key, JSON.stringify(meta), { ex: ttlSeconds })
  } catch (err) {
    console.warn("Failed to set room meta in Redis:", err)
  }
}

/**
 * Get cached room metadata from Redis
 */
export async function getRoomMeta(roomId: string): Promise<RoomMeta | null> {
  try {
    const client = getRedis()
    if (!client) return null
    const key = `room:${roomId}:meta`
    const data = await client.get<RoomMeta | string>(key)
    if (!data) return null
    return typeof data === "string" ? JSON.parse(data) : data
  } catch (err) {
    console.warn("Failed to get room meta from Redis:", err)
    return null
  }
}

/**
 * Remove room metadata from Redis
 */
export async function deleteRoomMeta(roomId: string): Promise<void> {
  try {
    const client = getRedis()
    if (!client) return
    const key = `room:${roomId}:meta`
    await client.del(key)
  } catch (err) {
    console.warn("Failed to delete room meta from Redis:", err)
  }
}
