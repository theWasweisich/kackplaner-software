import express, {type Request, type Response} from 'express';
import sqlite3 from 'sqlite3';
import {open} from 'sqlite';
import cors from 'cors';
import dotenv from 'dotenv';
import {exec} from "child_process";
import path from 'path';
import fs from 'fs';

const HTTP_STATUS_CODES = {
    OK: 200
}

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


sqlite3.verbose();
const db = await open({
    filename: DB_PATH,
    driver: sqlite3.Database
});

const app = express();

app.use(cors({
    // origin: `http://127.0.0.1:${FRONTEND_PORT}`
}));

const createTableSQLString = `
    CREATE TABLE IF NOT EXISTS events (
        id INTEGER PRIMARY KEY,
        title TEXT,
        start TEXT,
        microlax INTEGER
    );
`

db.run(createTableSQLString).catch(reason => console.error(`Error during creation of db schema: ${reason}`));

interface NetworkEvent {
    id?: string;
    title: string;
    start: string;
    microlax?: boolean;
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

app.put("/kackevent", async (req: Request, res: Response) => {
    const putBody = req.body as KackeventPutBody;

    for (const event of putBody.events) {

        if (!isValidDateString(event.start)) {
            res.status(400).json({ error: "Invalid date format", date: event.start });
            return;
        }
    }


    const stmt = await db.prepare(
        "INSERT INTO events (id, title, start, microlax) VALUES (?, ?, ?, ?)"
    );

    for (const event of putBody.events) {
        event.microlax = !!event.microlax;
        await stmt.bind(
            event.id,
            event.title,
            event.start,
            event.microlax
        );
        stmt.run();
    }

    console.log("Inserted events:", putBody.events);

    res.status(201).json({
        "events": putBody.events
    });
});

async function getEvents(fromStr?: string, toStr?: string): Promise<NetworkEvent[] | undefined> {
    if (fromStr != null && toStr == null) return;

    if (toStr != null) {
        const dbRes: NetworkEvent[] = await db.all(
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
            unixepoch(?) > unixepoch(start)`,
            fromStr, toStr
        );

        console.log("DB Res (constrained):", dbRes);

        return dbRes;
    }

    const dbRes: NetworkEvent[] = await db.all(
        `
            SELECT
                id,
                title,
                start,
                microlax
            FROM
                events;
            `
    )

    console.log("DB Res (unconstrained):", dbRes);

    return dbRes;
}

app.get("/kackevent", async (req: Request, res: Response) => {
    const startStr = req.query.start;
    const endStr = req.query.end;

    const cleanStart = typeof startStr === "string" ? startStr.substring(0, 10) : "";
    const cleanEnd = typeof endStr === "string" ? endStr.substring(0, 10) : "";

    if (!isValidDateString(cleanStart) || !isValidDateString(cleanEnd)) {
        res.status(400).json({ error: "Invalid date format", start: startStr, end: endStr });
        return;
    }

    const dbRes = await getEvents(cleanStart, cleanEnd);

    if (dbRes === undefined) return res.status(500).json({ error: '?', start: startStr, end: endStr });


    res.json({
        "events": dbRes
    })
});

app.get("/kackevent/dump", async (req: Request, res: Response) => {
    const dbRes = await getEvents();
    if (dbRes === undefined) return res.sendStatus(500);
    return res.json({
        'events': dbRes
    })
})

app.delete("/kackevent", async (req: Request, res: Response) => {
    const dateQuery = req.query.date;

    const dateStr = typeof dateQuery === 'string' ? dateQuery.substring(0, 10) : "";

    if (!isValidDateString(dateStr)) {
        res.status(400).json({ error: "Invalid date format", date: dateQuery });
    }

    const dateExists: boolean = (
        (await db.get("SELECT * FROM events WHERE unixepoch(start) == unixepoch(?)", dateStr))
        !== undefined
    );

    if (!dateExists) {
        res.status(404).send();
        return;
    }

    const dbRes = await db.run(
        "DELETE FROM events WHERE unixepoch(start) == unixepoch(?)",
        dateStr
    )
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

app.listen(BACKEND_PORT, () => {
    // noinspection HttpUrlsUsage
    console.log(`Listening on http://[::1]:${BACKEND_PORT}`);
});