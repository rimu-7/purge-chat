import { defineConfig } from "drizzle-kit";

const rawUrl = process.env.DATABASE_URL || "";
const url = rawUrl.includes("ssl=") ? rawUrl : `${rawUrl}?ssl={"rejectUnauthorized":true}`;

export default defineConfig({
  schema: "./db/schema.ts",
  out: "./drizzle",
  dialect: "mysql",
  dbCredentials: {
    url,
  },
});
