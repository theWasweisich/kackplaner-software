import Database, { SqliteError} from "better-sqlite3";
import dotenv from 'dotenv';
import crypto from 'crypto';
import {Argument, program} from 'commander';

program
    .argument("<clientId>", "The clientID associated with this client")
    .argument("<description>", "A short description of the client")

program.parse();

dotenv.config();

const DB_PATH = process.env.DB_PATH || "database.db";

const db = new Database(DB_PATH);
db.pragma("journal_mode = WAL");
db.pragma("busy_timeout = 5000");

const createTableSQLString = `
CREATE TABLE IF NOT EXISTS api_clients (
    client_id TEXT PRIMARY KEY NOT NULL,
    client_secret BLOB NOT NULL,
    description TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
)
`;

db.exec(createTableSQLString);

if (process.argv.length < 4) {
    console.error("Arguments required: clientId, description");
}

function generateSecret() {
    return crypto.randomBytes(64).toString("hex");
}

const insertClientStmt = db.prepare(`
    INSERT INTO api_clients (client_id, client_secret, description)
    VALUES (?, ?, ?)
`);

const clientId = program.args[0];
const newSecret = generateSecret();
const description = program.args[1];

try {
    insertClientStmt.run(clientId, newSecret, description);
    console.log(`Client Secret: ${newSecret}`);
} catch (e: any) {
    if (e instanceof SqliteError && e.code === "SQLITE_CONSTRAINT_PRIMARYKEY") {
        console.error(`ClientID ${clientId} already exists.`);
    } else {
        console.error(e);
    }
}