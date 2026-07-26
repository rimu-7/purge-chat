import { Redis } from "@upstash/redis";

export interface RoomMeta {
  id: string;
  ownerId: string;
  expiresAt: string; // ISO string
  isBackedUp: boolean;
  createdAt: string;
}

const url = process.env.UPSTASH_REDIS_REST_URL;
const token = process.env.UPSTASH_REDIS_REST_TOKEN;

if (!url || !token) {
  throw new Error("UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN must be defined");
}

export const redis = new Redis({
  url,
  token,
});

/**
 * Cache room metadata in Redis with native TTL matching room duration.
 * Memory footprint: ~50 bytes per active room.
 */
export async function setRoomMeta(roomId: string, meta: RoomMeta, ttlSeconds: number): Promise<void> {
  const key = `room:${roomId}:meta`;
  await redis.set(key, JSON.stringify(meta), { ex: ttlSeconds });
}

/**
 * Get cached room metadata from Redis
 */
export async function getRoomMeta(roomId: string): Promise<RoomMeta | null> {
  const key = `room:${roomId}:meta`;
  const data = await redis.get<RoomMeta | string>(key);
  if (!data) return null;
  return typeof data === "string" ? JSON.parse(data) : data;
}

/**
 * Remove room metadata from Redis
 */
export async function deleteRoomMeta(roomId: string): Promise<void> {
  const key = `room:${roomId}:meta`;
  await redis.del(key);
}
