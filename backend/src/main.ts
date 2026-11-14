import express, {type Request, type Response, type NextFunction} from 'express';
import {and, asc, eq, SQL, sql} from 'drizzle-orm';
import { events as eventsTable } from './db/schema.ts';
import cors from 'cors';
import {exec} from "child_process";
import path from 'path';
import fs from 'fs';
import winston from 'winston';
import client from 'prom-client';
import db from './db/database.ts';
import 'dotenv/config';

const httpRequestDuration = new client.Histogram({
    name: "http_request_duration_seconds",
    help: "Duration of the HTTP requests in seconds",
    labelNames: ["method", "route"]
});

function startMonitoring(req: Request, res: Response, next: NextFunction) {
    const end = httpRequestDuration.startTimer();
    res.on("finish", () => {
        const routeStr = req.route ? req.route.path : req.path;
        end({method: req.method, route: routeStr});
    });
    next();
}

const logger = winston.createLogger({
    level: "debug",
    format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.json()
    ),
    transports: [
        new winston.transports.Console(),
        new winston.transports.File({ filename: "app.log" })
    ],
});

const BACKEND_PORT = process.env.BACKEND_PORT || "8090";
const FRONTEND_PORT = process.env.FRONTEND_PORT || "5173";

const BACKLIGHT_BASE = '/sys/class/backlight/';
let brightnessFile: string | null = null;

try {
    const folders = fs.readdirSync(BACKLIGHT_BASE);
    if (folders.length > 0) {
        brightnessFile = path.join(BACKLIGHT_BASE, folders[0], 'brightness');
        logger.info(`[Display] Bound to backlight file: ${brightnessFile}`);
    }
} catch (e) {
    logger.error("Could not find brightness file!");
}

const app = express();
app.use(startMonitoring);

app.use((req: Request, res: Response, next: NextFunction) => {
    req.logger = logger.child({
        requestId: req.headers["x-request-id"] || crypto.randomUUID(),
    });
    next();
})

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

app.get("/metrics", async (req, res) => {
    res.set("Content-Type", client.register.contentType);
    res.end(await client.register.metrics());
})

interface KackeventPutBody {
    events: NetworkEvent[]
}

function isValidDateString(dateString: string): boolean {
    if (typeof dateString !== "string") return false;

    const isoRegex = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?Z$/;
    if (!isoRegex.test(dateString)) return false;

    const date = new Date(dateString);
    if (isNaN(date.getTime())) return false;

    return date.toISOString() === dateString;
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

app.post("/kackevent", async (req: Request, res: Response) => {
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
        logger.error("There was an error while inserting events. Rollback occurred");
    }

    return res.status(400).json({
        "events": putBody.events
    })
});

async function getEvents(fromStr?: string, toStr?: string): Promise<NetworkEvent[] | undefined> {
    const filters: SQL[] = [];
    if (fromStr) filters.push(sql`unixepoch(${eventsTable.start}) > unixepoch(${fromStr})`);
    if (toStr) filters.push(sql`unixepoch(${eventsTable.start}) < unixepoch(${toStr})`);

    logger.debug(`Getting events with ${filters.length} filters`, {
        from: fromStr,
        to: toStr
    });

    return dbEventsToNetwork(
        await db
            .select()
            .from(eventsTable)
            .where(and(...filters))
            .orderBy(
                asc(sql`unixepoch(${eventsTable.start})`)
            )
    );
}

function cleanDateStringInput(input: string): string {
    if (typeof input !== "string") return "";
    return input;
}

app.get("/kackevent", async (req: Request, res: Response) => {
    const startStr = req.query.start;
    const endStr = req.query.end;

    let cleanStart: string | undefined;
    let cleanEnd: string | undefined;

    if (typeof startStr === "string") cleanStart = cleanDateStringInput(startStr);
    if (typeof endStr === "string") cleanEnd = cleanDateStringInput(endStr);

    if ((cleanStart && !isValidDateString(cleanStart)) || (cleanEnd && !isValidDateString(cleanEnd)))
        return res.status(400).json({ error: "Invalid date format", start: startStr, end: endStr});

    const dbRes = await getEvents(cleanStart, cleanEnd) ?? [];

    if (dbRes.length === 0) {
        logger.warn(`No events found between ${startStr} and ${endStr}`);
    }

    return res.json({
        "start": dbRes.length > 0 ? dbRes[0].start : undefined,
        "end": dbRes.length > 0 ? dbRes[dbRes.length - 1].start : undefined,
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

    const dateStr = typeof dateQuery === 'string' ? dateQuery : "";

    if (!isValidDateString(dateStr)) {
        return res.status(400).json({ error: "Invalid date format", date: dateQuery });
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
    logger.info("Shutdown requested via API endpoint");
    res.status(200).json({ message: "Shutting down..." });

    setTimeout(() => {
        exec('sudo /bin/systemctl poweroff', (error) => {
            if (error) {
                logger.error(`Shutdown failed: ${error.message}`);
            }
        })
    }, 1000);
})

app.post("/reboot", (req: Request, res: Response) => {

    res.status(200).json({ message: "Rebooting..." });
    setTimeout(() => {
        exec('sudo systemctl reboot', (error) => {
            if (error) {
                logger.error("Reboot failed:", error);
            }
        });
    }, 1000)
})

function setScreenBrightness(brightness: number): boolean {
    if (typeof brightness !== "number") return false;
    if (brightness > 255 || brightness < 0) { return false; }
    if (!brightnessFile) {
        logger.error("No brightness file found.");
        return false;
    }

    try {
        fs.writeFileSync(brightnessFile, brightness.toString(), 'utf-8');
        return true;
    } catch (err) {
        logger.error(`Error setting screen brightness:`, err);
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

app.use((err: Error, req: Request, res: Response) => {
    logger.error("Unhandled Error:", err);
    res.status(500);
    res.send();
})

const server = app.listen(BACKEND_PORT, () => {
    // noinspection HttpUrlsUsage
    logger.info(`Listening on http://[::1]:${BACKEND_PORT}`);
});

process.on("SIGTERM", () => {
    server.close(async () => {
        process.exit(0);
    })
})