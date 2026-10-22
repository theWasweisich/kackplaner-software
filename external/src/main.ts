import requireHmacAuth from './hmacAuthMiddleware.ts'
import Database from "better-sqlite3";
import express, { type Request, type Response } from "express";
import cors from 'cors';
import dotenv from "dotenv";

interface NetworkEvent {
    id?: string;
    title: string;
    start: string;
    microlax?: boolean;
}

dotenv.config();

const EXTERNAL_PORT = parseInt(process.env.EXTERNAL_PORT as string) || 8090;
const EXTERNAL_INTERFACE = "[::]";
const DB_PATH = process.env.DB_PATH || "database.db";

const db = new Database(DB_PATH);
db.pragma("journal_mode = WAL");
db.pragma("busy_timeout = 5000");

const app = express();

app.use(cors());
app.use(requireHmacAuth(db, 60));

app.get("/api/events", (req: Request, res: Response) => {
    const selectStmt = db.prepare(`
        SELECT id, title, start, microlax FROM events;
    `);

    const events: NetworkEvent[] = selectStmt.all() as NetworkEvent[];
    res.json({
        "events": events
    });
});

app.listen(EXTERNAL_PORT, EXTERNAL_INTERFACE, (error) => {
    if (!error) {
        console.log(`Listening on ${EXTERNAL_INTERFACE}:${EXTERNAL_PORT}`);
        return;
    }
    console.error(error);
});