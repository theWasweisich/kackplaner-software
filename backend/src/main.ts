import express, {type Request, type Response, type NextFunction} from 'express';
import Database from 'better-sqlite3';
import cors from 'cors';
import dotenv from 'dotenv';
import {exec} from "child_process";
import path from 'path';
import fs from 'fs';

dotenv.config();

const BACKEND_PORT = process.env.BACKEND_PORT || 8090;
// noinspection JSUnusedLocalSymbols
const FRONTEND_PORT = process.env.FRONTEND_PORT || 2222;
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


const db = new Database(DB_PATH);
db.pragma("journal_mode = WAL");
db.pragma("busy_timeout = 5000");

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

const createTableSQLString = `
    CREATE TABLE IF NOT EXISTS events (
        id INTEGER PRIMARY KEY,
        title TEXT,
        start TEXT,
        microlax INTEGER
    );
`

try {
    db.prepare(createTableSQLString).run();
} catch (e) {
    console.error(`Error during Schema creation: `, e);
}

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

function asTransaction(func: (...args: any[]) => void): () => boolean {
    const begin = db.prepare("BEGIN");
    const commit = db.prepare("COMMIT");
    const rollback = db.prepare("ROLLBACK");

    return function (...args: any[]) {
        begin.run();
        try {
            func(...args);
            commit.run();
            return true;
        } catch (e: any) {
            if (e instanceof Error) {
                console.error("Error Type: ", e.name);
                console.error("Error Message: ", e.message);
            } else {
                console.error("Unknown error type: ", e);
            }
            return false;
        }
        finally {
            if (db.inTransaction) {
                rollback.run();
            }
        }
    }
}

function isValidDateString(dateString: string): boolean {
    if (typeof dateString !== "string") return false;

    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateString)) return false;

    const date = new Date(dateString);
    if (isNaN(date.getTime())) return false;

    return date.toISOString().substring(0, 10) === dateString;
}

app.use(express.json());

function networkToDbEvents(events: NetworkEvent[]): DatabaseEvent[] {
    const dbEvents: DatabaseEvent[] = [];

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

function dbEventsToNetwork(events: DatabaseEvent[]): NetworkEvent[] {
    const networkEvents: NetworkEvent[] = [];

    for (const event of events) {
        networkEvents.push({
            id: String(event.id),
            title: event.title,
            start: event.start,
            microlax: event.microlax == 1
        });
    }

    return networkEvents;
}

function insertEvents(events: NetworkEvent[]) {
    const dbEvents: DatabaseEvent[] = networkToDbEvents(events);

    const insertStmt = db.prepare("INSERT INTO events (id, title, start, microlax) VALUES (?, ?, ?, ?)");

    const insertEvents: (events: DatabaseEvent[]) => boolean = asTransaction((events: DatabaseEvent[]) => {
        const eventsSet = new Set(events);
        for (const event of eventsSet) {
            console.log("Inserting event:", event);
            insertStmt.run(
                event.id,
                event.title,
                event.start,
                event.microlax
            );
        }
    })
    return insertEvents(dbEvents);
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

app.put("/kackevent", (req: Request, res: Response) => {
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

    const success = insertEvents(eventsToBeInserted);

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

function getConstrainedEvents(fromStr: string, toStr: string): DatabaseEvent[] | undefined {
    const stmt = db.prepare(
        `
            SELECT
                 id,
                 title,
                 start,
                 microlax
            FROM
                events
            WHERE
                unixepoch(?) < unixepoch(start)
              AND
                unixepoch(?) > unixepoch(start)`
    );

    const dbRes = stmt.all(fromStr, toStr) as DatabaseEvent[];

    console.log("DB Res (constrained):", dbRes);

    return dbRes;
}

function getUnconstrainedEvents(): DatabaseEvent[] {
    const stmt = db.prepare("SELECT id, title, start, microlax FROM events");

    const dbRes = stmt.all() as DatabaseEvent[];

    console.log("DB Res (unconstrained):", dbRes);

    return dbRes;
}

function getEvents(fromStr?: string, toStr?: string): NetworkEvent[] | undefined {
    if (fromStr != undefined && toStr == undefined) return;

    if (fromStr !== undefined && toStr !== undefined) {
        const dbEvents = getConstrainedEvents(fromStr, toStr);
        if (dbEvents === undefined) {
            return undefined;
        }
        return dbEventsToNetwork(dbEvents);
    }

    const dbRes: DatabaseEvent[] = getUnconstrainedEvents() as DatabaseEvent[];

    return dbEventsToNetwork(dbRes);
}

function cleanDateStringInput(input: string): string {
    if (typeof input !== "string") return "";
    return input.substring(0, 10);
}

app.get("/kackevent", (req: Request, res: Response) => {
    const startStr = req.query.start;
    const endStr = req.query.end;

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

    const dbRes = getEvents(cleanStart, cleanEnd);

    if (dbRes === undefined) return res.status(500).json({ error: '?', start: startStr, end: endStr });

    res.json({
        "events": dbRes
    })
});

app.get("/kackevent/dump", async (req: Request, res: Response) => {
    const dbRes = getEvents();
    if (dbRes === undefined) return res.sendStatus(500);
    return res.json({
        'events': dbRes
    })
})

function doesDateExist(dateStr: string) {
    const stmt = db.prepare("SELECT id FROM events WHERE unixepoch(start) == unixepoch(?)")
    return stmt.get(dateStr) !== undefined;
}

app.delete("/kackevent", (req: Request, res: Response) => {
    const dateQuery = req.query.date;

    const dateStr = typeof dateQuery === 'string' ? dateQuery.substring(0, 10) : "";

    if (!isValidDateString(dateStr)) {
        res.status(400).json({ error: "Invalid date format", date: dateQuery });
    }

    const dateExists: boolean = doesDateExist(dateStr);

    if (!dateExists) {
        res.status(404).send();
        return;
    }

    const deleteStmt = db.prepare(
        "DELETE FROM events WHERE unixepoch(start) == unixepoch(?)"
    );

    const dbRes = deleteStmt.run(
        "DELETE FROM events WHERE unixepoch(start) == unixepoch(?)",
        dateStr
    );

    if (dbRes.changes && dbRes.changes == 1) {
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