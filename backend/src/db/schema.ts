import { sqliteTable, primaryKey, integer, text, blob } from "drizzle-orm/sqlite-core"
import { sql } from "drizzle-orm"

export const events = sqliteTable("events", {
	id: integer().primaryKey(),
	title: text(),
	start: text(),
	microlax: integer(),
});

export const apiClients = sqliteTable("api_clients", {
	clientId: text("client_id").primaryKey(),
	clientSecret: blob("client_secret").notNull(),
	description: text(),
	createdAt: text("created_at").default(sql`CURRENT_TIMESTAMP`),
});

