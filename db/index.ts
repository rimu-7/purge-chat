import { drizzle, MySql2Database } from "drizzle-orm/mysql2"
import mysql from "mysql2/promise"
import * as schema from "./schema"

type DatabaseInstance = MySql2Database<typeof schema>

const globalForDb = globalThis as unknown as {
  conn: mysql.Pool | undefined
  db: DatabaseInstance | undefined
}

export function getDb(): DatabaseInstance {
  const connectionString = process.env.DATABASE_URL
  if (!connectionString) {
    throw new Error("DATABASE_URL environment variable is required")
  }

  if (globalForDb.db) {
    return globalForDb.db
  }

  let pool = globalForDb.conn
  if (!pool) {
    pool = mysql.createPool({
      uri: connectionString,
      ssl: {
        rejectUnauthorized: true,
      },
      waitForConnections: true,
      connectionLimit: 5,
      queueLimit: 0,
    })
    globalForDb.conn = pool
  }

  const dbInstance = drizzle(pool, { schema, mode: "default" })
  globalForDb.db = dbInstance

  return dbInstance
}

export function assertDatabaseConfigured() {
  const db = getDb()
  return { db }
}
