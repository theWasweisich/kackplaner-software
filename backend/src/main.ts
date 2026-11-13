import express, {type Request, type Response, type NextFunction} from 'express';
import { drizzle } from 'drizzle-orm/libsql';
import {and, eq, sql} from 'drizzle-orm';
import { events as eventsTable } from './db/schema.ts';
import cors from 'cors';
import {exec} from "child_process";
import path from 'path';
import fs from 'fs';
import 'dotenv/config';

const BACKEND_PORT = process.env.BACKEND_PORT || "8090";
// noinspection JSUnusedLocalSymbols
const FRONTEND_PORT = process.env.FRONTEND_PORT || "2222";
const DB_PATH = process.env.DB_PATH || "database.db";

const BACKLIGHT_BASE = '/sys/class/backlight/';
let brightnessFile: string | null = null;

try {
    const folders = fs.readdirSync(BACKLIGHT_BASE);
    if (folders.length > 0) {
        brightnessFile = path.join(BACKLIGHT_BASE, folders[0], 'brightness');
        console.log(`[Display] Bound to backlight file: ${brightnessFile}`);
    }
} catch (e) {
    console.error("Could not find brightness file!");
}


const db = drizzle("file:" + DB_PATH);
db.run("journal_mode = WAL");
db.run("busy_timeout = 5000");

const app = express();

const allowedOrigins = [
    `http://localhost:${FRONTEND_PORT}`,
    `http://127.0.0.1:${FRONTEND_PORT}`,
]

app.use(cors({
    origin: (origin, callback) => {
        if (!origin || allowedOrigins.includes(origin)) {
            callback(null, true);
        } else {
            callback(new Error(`"${origin}" Not allowed by CORS`))
        }
    },
    methods: ["GET", "POST", "PUT", "DELETE"],
    allowedHeaders: ['Content-Type', 'x-client-id', 'x-timestamp', 'x-signature']
}));

interface NetworkEvent {
    id?: string;
    title: string;
    start: string;
    microlax?: boolean;
}

interface DatabaseEvent {
    id?: number;
    title: string;
    start: string;
    microlax: number;
}

interface KackeventPutBody {
    events: NetworkEvent[]
}

function isValidDateString(dateString: string): boolean {
    if (typeof dateString !== "string") return false;

    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateString)) return false;

    const date = new Date(dateString);
    if (isNaN(date.getTime())) return false;

    return date.toISOString().substring(0, 10) === dateString;
}

app.use(express.json());

function networkToDbEvents(events: NetworkEvent[]): typeof eventsTable.$inferInsert[] {
    const dbEvents: typeof eventsTable.$inferInsert[] = [];

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

function dbEventsToNetwork(events: typeof eventsTable.$inferSelect[]): NetworkEvent[] {
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

async function insertEvents(events: NetworkEvent[]) {
    const dbEvents: typeof eventsTable.$inferInsert[] = networkToDbEvents(events);

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

app.put("/kackevent", async (req: Request, res: Response) => {
    const putBody = req.body as KackeventPutBody;

    if (!("events" in putBody)) {
        return res.status(401).json({
            error: "Invalid payload. Expected events array"
        });
    }

    if (!Array.isArray(putBody.events)) {
        return res.status(401).json({
            error: "Invalid payload. Malformed events property"
        });
    }

    const validationResult = validateEvents(putBody.events);
    if (validationResult !== "success") {
        if (validationResult === "date")
            return res.status(401).json({ error: "Invalid Date format", events: putBody.events });
        if (validationResult === "title")
            return res.status(401).json({ error: "Invalid title", events: putBody.events });
        if (validationResult === "id")
            return res.status(401).json({ error: "Invalid Id", events: putBody.events });
        return res.sendStatus(500);
    }

    const eventsToBeInserted = ([...putBody.events]);

    const success = await insertEvents(eventsToBeInserted);

    if (success) {
        return res.status(201).json({
            "events": eventsToBeInserted
        });
    } else {
        console.error("There was an error while inserting events. Rollback occurred");
    }

    return res.status(400).json({
        "events": putBody.events
    })
});

async function getConstrainedEvents(fromStr: string, toStr: string): Promise<typeof eventsTable.$inferSelect[]> {
    const result = await db.select().from(eventsTable).where(
        and(
            sql`unixepoch(${fromStr}) < unixepoch(${eventsTable.start})`,
            sql`unixepoch(${toStr}) > unixepoch(${eventsTable.start})`,
        )
    );

    console.log("DB Res (constrained):", result);

    return result;
}

async function getUnconstrainedEvents(): Promise<typeof eventsTable.$inferSelect[]> {
    const dbRes = await db.select().from(eventsTable);

    console.log("DB Res (unconstrained):", dbRes);

    return dbRes;
}

async function getEvents(fromStr?: string, toStr?: string): Promise<NetworkEvent[] | undefined> {
    if (fromStr != undefined && toStr == undefined) return;

    if (fromStr !== undefined && toStr !== undefined) {
        const dbEvents = await getConstrainedEvents(fromStr, toStr);
        if (dbEvents === undefined) {
            return undefined;
        }
        return dbEventsToNetwork(dbEvents);
    }

    const dbRes = await getUnconstrainedEvents();

    return dbEventsToNetwork(dbRes);
}

function cleanDateStringInput(input: string): string {
    if (typeof input !== "string") return "";
    return input.substring(0, 10);
}

app.get("/kackevent", async (req: Request, res: Response) => {
    const startStr = req.query.start;
    const endStr = req.query.end;

    if (startStr === undefined && endStr === undefined) {

    }

    if (startStr === undefined || endStr === undefined) {
        return res.status(401).json({
            error: "Expected two query parameters: start and end"
        });
    }

    if (typeof startStr !== "string" || typeof endStr !== "string") {
        return res.sendStatus(500);
    }

    const cleanStart = cleanDateStringInput(startStr);
    const cleanEnd = cleanDateStringInput(endStr);

    if (!isValidDateString(cleanStart) || !isValidDateString(cleanEnd)) {
        res.status(400).json({ error: "Invalid date format", start: startStr, end: endStr });
        return;
    }

    const dbRes = await getEvents(cleanStart, cleanEnd) ?? [];

    if (dbRes.length === 0) {
        console.log(`No events found between ${startStr} and ${endStr}`);
    }

    res.json({
        "start": startStr,
        "end": endStr,
        "events": dbRes
    });
});

app.get("/kackevent/dump", async (req: Request, res: Response) => {
    const dbRes = await getEvents();
    if (dbRes === undefined) return res.sendStatus(204);
    return res.json({
        'events': dbRes
    });
})

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

app.delete("/kackevent", async (req: Request, res: Response) => {
    const dateQuery = req.query.date;

    const dateStr = typeof dateQuery === 'string' ? dateQuery.substring(0, 10) : "";

    if (!isValidDateString(dateStr)) {
        res.status(400).json({ error: "Invalid date format", date: dateQuery });
    }

    const dateExists: boolean = await doesDateExist(dateStr);

    if (!dateExists) {
        res.status(404).json({ error: "This date does not exist!", date: dateQuery });
        return;
    }

    const dbRes = await db.delete(eventsTable).where(eq(sql`unixepoch(${eventsTable.start})`, sql`unixepoch(${dateStr})`));

    if (dbRes.rowsAffected == 1) {
        res.status(200).send();
    } else {
        res.status(500).send();
    }
})

app.post('/shutdown', (req: Request, res: Response) => {
    console.log("Shutdown requested via API endpoint");
    res.status(200).json({ message: "Shutting down..." });

    setTimeout(() => {
        exec('sudo /bin/systemctl poweroff', (error) => {
            if (error) {
                console.error(`Shutdown failed: ${error.message}`);
            }
        })
    }, 1000);
})

app.post("/reboot", (req: Request, res: Response) => {

    res.status(200).json({ message: "Rebooting..." });
    setTimeout(() => {
        exec('sudo systemctl reboot', (error) => {
            if (error) {
                console.error("Reboot failed:", error);
            }
        });
    }, 1000)
})

function setScreenBrightness(brightness: number): boolean {
    if (typeof brightness !== "number") return false;
    if (brightness > 255 || brightness < 0) { return false; }
    if (!brightnessFile) {
        console.error("No brightness file found.");
        return false;
    }

    try {
        fs.writeFileSync(brightnessFile, brightness.toString(), 'utf-8');
        return true;
    } catch (err) {
        console.error(`Error setting screen brightness:`, err);
        return false;
    }
}

app.post("/display/brightness", (req, res) => {
    const queryBrightness = req.query.brightness;
    if (typeof queryBrightness !== "string") {
        return res.sendStatus(400);
    }
    const numberBrightness = parseInt(queryBrightness);

    if (Number.isNaN(numberBrightness)) {
        return res.sendStatus(400);
    }

    const success = setScreenBrightness(numberBrightness);
    if (success) {
        return res.sendStatus(200);
    } else {
        return res.sendStatus(503);
    }
});

app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
    console.error("Unhandled Error:", err);
    res.status(500);
    res.send();
})

app.listen(BACKEND_PORT, () => {
    // noinspection HttpUrlsUsage
    console.log(`Listening on http://[::1]:${BACKEND_PORT}`);
});