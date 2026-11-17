import { RedisStore } from "connect-redis";
import {createClient} from "redis";

import express, {type Request, type Response, type NextFunction} from 'express';
import {kackEventRouter} from "./routers/kackeventRouter.ts";
import { usersRouter } from './routers/usersRouter.ts';
import session from "express-session";
import cors from 'cors';
import {exec} from "child_process";
import path from 'path';
import fs from 'fs';
import { logger } from "./logging.ts";
import client from 'prom-client';
import 'dotenv/config';
import type {Logger} from "winston";

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

const redisClient = createClient();
redisClient.connect().catch(logger.error);

const redisStore = new RedisStore({
    client: redisClient,
    prefix: "kackplaner:"
})

const app = express();
app.use(session({
    secret: "keyboard cat",
    resave: false,
    saveUninitialized: false,
    store: redisStore,
    cookie: {
        maxAge: 1000 * 60 * 60 * 24, // 1 day,
        httpOnly: true,
    }
}));
app.use(startMonitoring);
app.use(express.json());
app.use((req: Request, res: Response, next: NextFunction) => {
    req.logger = logger.child({
        requestId: req.headers["x-request-id"] || crypto.randomUUID(),
        path: req.path
    });
    next();
});

const allowedOrigins = [
    `http://localhost:${FRONTEND_PORT}`,
    `http://127.0.0.1:${FRONTEND_PORT}`,
]

function dynamicCORSOriginSelection(origin: string | undefined, callback: (err: Error | null, origin?: boolean) => void) {
    if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
    } else {
        callback(new Error(`"${origin}" is not allowed by CORS`));
    }
}

app.use(cors({
    origin: dynamicCORSOriginSelection,
    methods: ["GET", "POST", "PUT", "DELETE"],
    allowedHeaders: ['Content-Type', 'x-client-id', 'x-timestamp', 'x-signature'],
    credentials: true,
}));

app.get("/metrics", async (req, res) => {
    res.set("Content-Type", client.register.contentType);
    res.end(await client.register.metrics());
})

app.post('/shutdown', (req: Request, res: Response) => {
    const logger = req.logger!;
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
    const logger = req.logger!;

    res.status(200).json({ message: "Rebooting..." });
    setTimeout(() => {
        exec('sudo systemctl reboot', (error) => {
            if (error) {
                logger.error("Reboot failed:", error);
            }
        });
    }, 1000)
})

function setScreenBrightness(logger: Logger, brightness: number): boolean {
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
    const logger = req.logger!;
    const queryBrightness = req.query.brightness;
    if (typeof queryBrightness !== "string") {
        return res.sendStatus(400);
    }
    const numberBrightness = parseInt(queryBrightness);

    if (Number.isNaN(numberBrightness)) {
        return res.sendStatus(400);
    }

    const success = setScreenBrightness(logger, numberBrightness);
    if (success) {
        return res.sendStatus(200);
    } else {
        return res.sendStatus(503);
    }
});

app.use("/kackevent", kackEventRouter);
app.use("/users", usersRouter);

app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
    if (req.logger) {
        req.logger!.error("Unhandled Error:", err);
    }
    res.status(500).send("Something went wrong!");
})

const server = app.listen(BACKEND_PORT, () => {
    logger.info(`Listening on http://[::1]:${BACKEND_PORT}`);
});

process.on("uncaughtException", (err) => {
    logger.crit("Uncaught Exception:", err);
    server.close(async () => {
        process.exit(1);
    });
});

process.on("unhandledRejection", (reason) => {
    logger.crit("Unhandled rejection:", reason);
    server.close(async () => {
        process.exit(1);
    });
})

process.on("SIGTERM", () => {
    server.close(async () => {
        process.exit(0);
    })
})