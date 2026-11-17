import { defineRelations } from "drizzle-orm";
import * as schema from "./schema.js";
export const relations = defineRelations(schema, (r) => ({
    events: {
        user: r.one.users({
            from: r.events.userId,
            to: r.users.id
        }),
    },
    users: {
        events: r.many.events(),
    },
}));
