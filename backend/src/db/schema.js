import { sqliteTable, foreignKey, primaryKey, unique, integer, text, blob } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";
export const events = sqliteTable("events", {
    id: integer().primaryKey(),
    title: text(),
    start: text(),
    microlax: integer(),
    userId: integer().references(() => users.id),
});
export const apiClients = sqliteTable("api_clients", {
    clientId: text("client_id").primaryKey(),
    clientSecret: blob("client_secret").notNull(),
    description: text(),
    createdAt: text("created_at").default(sql `CURRENT_TIMESTAMP`),
});
export const users = sqliteTable("users", {
    id: integer().primaryKey(),
    username: text(),
    displayName: text("display_name"),
    password: text().notNull(),
}, (table) => [unique("users_username_unique").on(table.username),
]);
