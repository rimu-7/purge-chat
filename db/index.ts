import { drizzle } from "drizzle-orm/mysql2"
import mysql from "mysql2/promise"
import * as schema from "./schema"

const globalForDb = globalThis as unknown as {
  conn: mysql.Pool | undefined
}

const connectionString = process.env.DATABASE_URL

if (!connectionString) {
  throw new Error("DATABASE_URL environment variable is required")
}

export const pool =
  globalForDb.conn ??
  mysql.createPool({
    uri: connectionString,
    ssl: {
      rejectUnauthorized: true,
    },
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
  })

if (process.env.NODE_ENV !== "production") {
  globalForDb.conn = pool
}

export const db = drizzle(pool, { schema, mode: "default" })
