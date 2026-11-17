import { drizzle } from 'drizzle-orm/libsql';
import { relations } from "./relations.js";
const DB_URL = process.env.DB_URL || "file:database.db";
const db = drizzle({
    connection: DB_URL,
    relations: relations
});
await db.run("PRAGMA journal_mode = WAL");
await db.run("PRAGMA busy_timeout = 5000");
export default db;
