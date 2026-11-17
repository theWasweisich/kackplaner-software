import { sqliteTable, primaryKey, integer, text, blob } from "drizzle-orm/sqlite-core"
import { sql } from "drizzle-orm"

export const events = sqliteTable("events", {
	id: integer().primaryKey(),
	title: text(),
	start: text(),
	microlax: integer(),
	userId: integer().references(() => users.id, { onDelete: "no action", onUpdate: "no action" })
});

export const users = sqliteTable("users", {
	id: integer().primaryKey(),
	username: text().unique(),
	display_name: text(),
	password: text()
});

export const apiClients = sqliteTable("api_clients", {
	clientId: text("client_id").primaryKey(),
	clientSecret: blob("client_secret").notNull(),
	description: text(),
	createdAt: text("created_at").default(sql`CURRENT_TIMESTAMP`),
});

