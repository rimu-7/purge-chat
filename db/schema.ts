import { mysqlTable, varchar, text, timestamp, boolean } from "drizzle-orm/mysql-core";

// Ephemeral Room Table
export const rooms = mysqlTable("rooms", {
  id: varchar("id", { length: 16 }).primaryKey(), // NanoID
  ownerId: varchar("owner_id", { length: 36 }).notNull(), // Sender ID of room creator
  expiresAt: timestamp("expires_at").notNull(),
  isBackedUp: boolean("is_backed_up").default(false).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Ephemeral Messages Table (auto-deleted when room is deleted)
export const messages = mysqlTable("messages", {
  id: varchar("id", { length: 36 }).primaryKey(),
  roomId: varchar("room_id", { length: 16 })
    .notNull()
    .references(() => rooms.id, { onDelete: "cascade" }),
  senderId: varchar("sender_id", { length: 36 }).notNull(),
  senderName: varchar("sender_name", { length: 64 }).notNull(),
  content: text("content").notNull(),
  type: varchar("type", { length: 20 }).default("user").notNull(), // "user" | "system"
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Long-Term Encrypted Backups Table
export const encryptedBackups = mysqlTable("encrypted_backups", {
  id: varchar("id", { length: 36 }).primaryKey(),
  roomIdHash: varchar("room_id_hash", { length: 64 }).notNull().unique(), // SHA-256 of room ID
  encryptedData: text("encrypted_data").notNull(), // AES-GCM Encrypted JSON
  iv: varchar("iv", { length: 64 }).notNull(), // saltHex:ivHex
  createdAt: timestamp("created_at").defaultNow().notNull(),
  lastAccessedAt: timestamp("last_accessed_at").defaultNow().notNull(),
});

export type Room = typeof rooms.$inferSelect;
export type NewRoom = typeof rooms.$inferInsert;
export type Message = typeof messages.$inferSelect;
export type NewMessage = typeof messages.$inferInsert;
export type EncryptedBackup = typeof encryptedBackups.$inferSelect;
export type NewEncryptedBackup = typeof encryptedBackups.$inferInsert;
