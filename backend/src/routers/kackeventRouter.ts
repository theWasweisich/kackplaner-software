// to be mounted on /kackevent
import express, { type Request, type Response, type NextFunction } from "express";
import db from "../db/database.ts";
import {and, eq, gte, asc, desc, sql, SQL} from "drizzle-orm";
import { events as eventsTable } from '../db/schema.ts';
import type {Logger} from "winston";
import type {SQLiteDelete, SQLiteSelect} from "drizzle-orm/sqlite-core/index";

function userIdMiddlewareGuard(req: Request, res: Response, next: NextFunction) {
    const userId = req.userId;
    if (!userId) {
        if (req.logger) req.logger.warn(`Kackevent Router routing without userId!`)
        return res.sendStatus(401);
    }
    next();
}

const kackEventRouter = express.Router();
kackEventRouter.use(userIdMiddlewareGuard);

function withUserFilter<T extends SQLiteSelect>(
    query: T,
    userId: number
) {
    return query.where(eq(eventsTable.userId, userId));
}

function deleteWithUserFilter<T extends SQLiteDelete>(
    queryBuilder: T,
    userId: number
) {
    return queryBuilder.where(eq(eventsTable.userId, userId));
}

interface NetworkEvent {
    id?: string;
    title: string;
    start: string;
    microlax?: boolean;
}

interface KackeventPostBody {
    events: NetworkEvent[]
}

type NewEvent = typeof eventsTable.$inferInsert;
type SelectedEvent = typeof eventsTable.$inferSelect;

function isValidDateString(dateString: string): boolean {
    if (typeof dateString !== "string") return false;

    const isoRegex = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?Z$/;
    if (!isoRegex.test(dateString)) return false;

    const date = new Date(dateString);
    if (isNaN(date.getTime())) return false;

    return date.toISOString() === dateString;

}

function networkToDbEvents(events: NetworkEvent[]): NewEvent[] {
    const dbEvents: NewEvent[] = [];

    for (const event of events) {
        let eventId: number | undefined = parseInt(event.id ? event.id : "");
        if (!eventId) {
            eventId = undefined;
        }
        dbEvents.push({
            id: eventId,
            start: event.start,
            title: event.title,
            microlax: event.microlax ? 1 : 0,
        });
    }
    return dbEvents;
}

function dbEventsToNetwork(events: SelectedEvent[]): NetworkEvent[] {
    const networkEvents: NetworkEvent[] = [];

    for (const event of events) {
        networkEvents.push({
            id: String(event.id),
            title: event.title ?? "",
            start: event.start ?? "",
            microlax: event.microlax == 1
        });
    }

    return networkEvents;
}

async function insertEvents(events: NetworkEvent[], userId: number) {
    if (events.length === 0) return false;
    const dbEvents: NewEvent[] = networkToDbEvents(events);

    dbEvents.forEach(event => event.userId = userId);

    const res = await db.insert(eventsTable).values(dbEvents).returning();

    return res.length == events.length;
}

type EventsValidationFailures = 'title' | 'date' | 'id';
type EventsValidationResult = EventsValidationFailures | 'success';

function validateEvents(events: NetworkEvent[]): EventsValidationResult {
    for (const event of events) {
        const id: string | undefined = event.id;
        const startDate: string = event.start;
        const title: string = event.title;

        if (!isValidDateString(startDate)) {
            return "date";
        }
        if (!title.isWellFormed() || title.trim().length != title.length) {
            return "title";
        }
        if (id && isNaN(parseInt(id, 10))) {
            return "id";
        }
    }
    return "success";
}

function getOrderByDateSQL() {
    return sql`unixepoch(${eventsTable.start})`;
}

async function getEvents(logger: Logger, userId?: number, fromStr?: string, toStr?: string): Promise<NetworkEvent[] | undefined> {
    const filters: SQL[] = [];
    if (fromStr) filters.push(sql`unixepoch(${eventsTable.start}) > unixepoch(${fromStr})`);
    if (toStr) filters.push(sql`unixepoch(${eventsTable.start}) < unixepoch(${toStr})`);

    logger.debug(`Getting events with ${filters.length} filters`, {
        from: fromStr,
        to: toStr
    });

    const query = db
        .select()
        .from(eventsTable)
        .where(and(...filters))
        .orderBy(
            asc(getOrderByDateSQL())
        );

    return dbEventsToNetwork(
        await (userId ? withUserFilter(query.$dynamic(), userId) : query)
    );
}

async function getLatestEventDate(logger: Logger, userId?: number): Promise<string | undefined> {
    const query = db
        .select({
            date: eventsTable.start
        })
        .from(eventsTable)
        .orderBy(desc(getOrderByDateSQL()))
        .limit(1);

    const dbRes = await (userId ? withUserFilter(query.$dynamic(), userId) : query);

    if (dbRes.length !== 1) {
        return;
    }
    const latestEvent = dbRes[0];
    const date = dbRes[0].date ?? undefined;

    if (date) {
        logger.info(`Last event was on ${date}`);
    } else {
        logger.warn("Date of last event could not be found");
    }

    return dbRes[0].date ?? undefined;
}

function cleanDateStringInput(input: string): string {
    if (typeof input !== "string") return "";
    return input;
}

async function getLastEvent(logger: Logger, userId: number) {

    logger.info("Fetching latest event");
    const query = db
        .select()
        .from(eventsTable)
        .orderBy(desc(getOrderByDateSQL()))
        .limit(1);
    query.where(gte(sql`timediff('now', ${eventsTable.start})`, 0));

    const dbRes = await withUserFilter(query.$dynamic(), userId);

    if (dbRes.length === 0) {

        logger.info("No latest event found");
        return
    }
    const latestEvent = dbRes[0];

    logger.info(`Found latest event (on ${latestEvent.start})`)

    return latestEvent;

}
async function doesDateExist(dateStr: string) {
    const dbRes = await db
        .select({id: eventsTable.id})
        .from(eventsTable)
        .where(
            eq(
                sql`unixepoch(${eventsTable.start})`,
                sql`unixepoch(${dateStr})`
            )
        );
    return dbRes.length > 0;
}
kackEventRouter.get("/", async (req: Request, res: Response) => {
    const logger = req.logger!;
    const startStr = req.query.start;
    const endStr = req.query.end;
    const userId = req.userId;

    let cleanStart: string | undefined;
    let cleanEnd: string | undefined;

    if (typeof startStr === "string") cleanStart = cleanDateStringInput(startStr);
    if (typeof endStr === "string") cleanEnd = cleanDateStringInput(endStr);

    if ((cleanStart && !isValidDateString(cleanStart)) || (cleanEnd && !isValidDateString(cleanEnd)))
        return res.status(400).json({ error: "Invalid date format", start: startStr, end: endStr});

    const dbRes = await getEvents(logger, userId, cleanStart, cleanEnd) ?? [];

    if (dbRes.length === 0) {
        logger.warn(`No events found between ${startStr} and ${endStr}`);
    }

    return res.json({
        "start": dbRes.length > 0 ? dbRes[0].start : undefined,
        "end": dbRes.length > 0 ? dbRes[dbRes.length - 1].start : undefined,
        "events": dbRes
    });
});

kackEventRouter.post("/", async (req: Request, res: Response) => {
    const logger = req.logger!;
    const postBody = req.body as KackeventPostBody;
    const userId = req.userId;

    if (!userId) {
        logger.error("Missing userId!");
        return res.sendStatus(401);
    }

    if (!("events" in postBody)) {
        return res.status(401).json({
            error: "Invalid payload. Expected events array"
        });
    }

    if (!Array.isArray(postBody.events)) {
        return res.status(401).json({
            error: "Invalid payload. Malformed events property"
        });
    }

    const postedEvents = postBody.events;

    const validationResult = validateEvents(postedEvents);
    if (validationResult !== "success") {
        if (validationResult === "date")
            return res.status(401).json({ error: "Invalid Date format", events: postedEvents });
        if (validationResult === "title")
            return res.status(401).json({ error: "Invalid title", events: postedEvents });
        if (validationResult === "id")
            return res.status(401).json({ error: "Invalid Id", events: postedEvents });
        return res.sendStatus(500);
    }

    const eventsToBeInserted = ([...postedEvents]);

    if (eventsToBeInserted.length !== postedEvents.length) {
        logger.warn(`Unpacked fewer events than were posted.`, {
            posted: postedEvents.length,
            unpacked: eventsToBeInserted.length
        })
    }

    const success = await insertEvents(eventsToBeInserted, userId);

    if (success) {
        return res.status(201).json({
            "events": eventsToBeInserted
        });
    } else {
        logger.error("There was an error while inserting events:", eventsToBeInserted);
    }

    return res.status(400).json({
        "events": postBody.events
    })
});

kackEventRouter.get("/latest", async (req: Request, res: Response) => {
    const logger = req.logger!;
    const userId = req.userId;

    if (!userId) {
        logger.warn("Missing user id");
        return res.sendStatus(401);
    }

    const lastEvent = await getLastEvent(logger, userId);

    if (!lastEvent) {
        return res.sendStatus(204);
    }

    return await res.json({
        latest: lastEvent
    });
})

kackEventRouter.get("/latest/:field", async (req: Request, res: Response) => {
    const logger = req.logger!;
    const requestedField = req.params.field
    const userId = req.userId;

    if (!userId) {
        logger.warn("User id not provided");
        return res.sendStatus(401);
    }

    if (typeof requestedField !== "string") {
        return res.sendStatus(501);
    }

    if (requestedField === "date") {
        const latestDate = await getLatestEventDate(logger, userId);
        return res.json({
            "latestDate": latestDate
        });
    }

    return res.sendStatus(501);
})

kackEventRouter.get("/dump", async (req: Request, res: Response) => {
    const logger = req.logger!;
    const userId = req.userId;
    const dbRes = await getEvents(logger, userId);
    if (dbRes === undefined) return res.sendStatus(204);
    return res.json({
        'events': dbRes
    });
})

kackEventRouter.delete("/", async (req: Request, res: Response) => {
    const dateQuery = req.query.date;

    const dateStr = typeof dateQuery === 'string' ? dateQuery : "";
    const userId = req.userId;

    if (!isValidDateString(dateStr)) {
        return res.status(400).json({ error: "Invalid date format", date: dateQuery });
    }

    if (!userId) {
        return res.sendStatus(401);
    }

    const dateExists: boolean = await doesDateExist(dateStr);

    if (!dateExists) {
        res.status(404).json({ error: "This date does not exist!", date: dateQuery });
        return;
    }

    const deleteQuery = db.delete(eventsTable).where(eq(sql`unixepoch(${eventsTable.start})`, sql`unixepoch(${dateStr})`));

    const dbRes = await deleteWithUserFilter(deleteQuery.$dynamic(), userId);

    if (dbRes.rowsAffected == 1) {
        res.status(200).send();
    } else {
        res.status(500).send();
    }
})

export {
    kackEventRouter
};