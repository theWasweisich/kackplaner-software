import express, { type Request, type Response } from 'express';
import sqlite3 from 'sqlite3';
import { open } from 'sqlite';
import cors from 'cors';
import dotenv from 'dotenv';
import { exec } from "child_process";

dotenv.config();

const BACKEND_PORT = process.env.BACKEND_PORT || 8090;
const FRONTEND_PORT = process.env.FRONTEND_PORT || 2222;
const DB_PATH = process.env.DB_PATH || "database.db";
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
        allDay INTEGER,
        display TEXT,
        microlax INTEGER
    );
`

db.run(createTableSQLString);

interface CalendarEvent {
    id?: string;
    title: string;
    start: string;
    allDay: boolean;
    display?: string;
    microlax?: boolean;
}

interface KackeventPutBody {
    events: CalendarEvent[]
}
app.use(express.json());

app.put("/kackevent", async (req: Request, res: Response) => {
    const stmt = await db.prepare(
        "INSERT INTO events (id, title, start, allDay, display, microlax) VALUES (?, ?, ?, ?, ?, ?)"
    );

    const putBody = req.body as KackeventPutBody;

    for (const event of putBody.events) {
        event.microlax = event.microlax ? event.microlax : false;
        stmt.bind(
            event.id,
            event.title,
            event.start,
            event.allDay,
            event.display,
            event.microlax
        );
        stmt.run();
    }

    res.status(201).json({
        "events": putBody.events
    });
});

function getDateFromQueryParam(queryParam: string): Date {
    return new Date(queryParam.replace(" ", "+"));
}

function getStartEndFromQuery(req: Request): { start: Date, end: Date } {
    const queryParams: { start: string, end: string } = req.query as { start: string, end: string };

    return {
        start: getDateFromQueryParam(queryParams.start),
        end: getDateFromQueryParam(queryParams.end)
    }
}

app.get("/kackevent", async (req: Request, res: Response) => {
    const queryParams: { start: string, end: string } = req.query as { start: string, end: string };

    const dates = getStartEndFromQuery(req);

    const dbRes: CalendarEvent[] = await db.all(
        `
        SELECT
             id,
             title,
             start,
             allDay,
             display,
             microlax
        FROM
            events
        WHERE
            unixepoch(?) < unixepoch(start)
          AND
            unixepoch(?) > unixepoch(start)`,
        dates.start.toISOString(), dates.end.toISOString()
    );

    console.log("DB Res: ", dbRes);

    res.json({
        "events": dbRes
    })
})

app.delete("/kackevent", async (req: Request, res: Response) => {
    const queryParams: { date: string } = req.query as { date: string }
    const date = getDateFromQueryParam(queryParams.date);

    const dateExists: boolean = (
        (await db.get("SELECT * FROM events WHERE unixepoch(start) == unixepoch(?)", date.toISOString()))
        !== undefined
    );

    if (!dateExists) {
        res.status(404).send();
        return;
    }

    const dbRes = await db.run(
        "DELETE FROM events WHERE unixepoch(start) == unixepoch(?)",
        date.toISOString()
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
        exec('sudo /sbin/shutdown -h now', (error, stdout, stderr) => {
            if (error) {
                console.error(`Shutdown failed: ${error.message}`);
            }
        })
    }, 1000);
})


app.listen(BACKEND_PORT, () => {
    console.log(`Listening on http://[::1]:${BACKEND_PORT}`);
});