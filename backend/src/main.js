import express, {} from 'express';
import sqlite3 from 'sqlite3';
import { open } from 'sqlite';
import cors from 'cors';
import path from 'path';
const PORT = 8090;
const DB_PATH = "database.db";
sqlite3.verbose();
const db = await open({
    filename: DB_PATH,
    driver: sqlite3.Database
});
const app = express();
db.run("CREATE TABLE IF NOT EXISTS events (id INTEGER PRIMARY KEY, title TEXT, start TEXT, allDay INTEGER, display TEXT)");
app.use(express.json());
app.use(cors());
app.put("/kackevent", async (req, res) => {
    const stmt = await db.prepare("INSERT INTO events (id, title, start, allDay, display) VALUES (?, ?, ?, ?, ?)");
    const putBody = req.body;
    for (const event of putBody.events) {
        stmt.bind(event.id, event.title, event.start, event.allDay, event.display);
        stmt.run();
    }
    res.status(201).json({
        "events": putBody.events
    });
});
function getDateFromQueryParam(queryParam) {
    return new Date(queryParam.replace(" ", "+"));
}
function getStartEndFromQuery(req) {
    const queryParams = req.query;
    return {
        start: getDateFromQueryParam(queryParams.start),
        end: getDateFromQueryParam(queryParams.end)
    };
}
app.get("/kackevent", async (req, res) => {
    const queryParams = req.query;
    const dates = getStartEndFromQuery(req);
    const dbRes = await db.all("SELECT id, title, start, allDay, display FROM events WHERE unixepoch(?) < unixepoch(start) AND unixepoch(?) > unixepoch(start)", dates.start.toISOString(), dates.end.toISOString());
    console.log("DB Res: ", dbRes);
    res.json({
        "events": dbRes
    });
});
app.delete("/kackevent", async (req, res) => {
    const queryParams = req.query;
    const date = getDateFromQueryParam(queryParams.date);
    const dateExists = ((await db.get("SELECT * FROM events WHERE unixepoch(start) == unixepoch(?)", date.toISOString()))
        !== undefined);
    if (!dateExists) {
        res.status(404).send();
        return;
    }
    const dbRes = await db.run("DELETE FROM events WHERE unixepoch(start) == unixepoch(?)", date.toISOString());
    if (dbRes.changes && dbRes.changes == 1) {
        res.status(200).send();
    }
    else {
        res.status(500).send();
    }
});
app.listen(PORT, () => {
    console.log(`Listening on http://[::1]:${PORT}`);
});
