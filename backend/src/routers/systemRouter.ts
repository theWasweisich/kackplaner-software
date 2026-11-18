import express, { type Request, type Response, type NextFunction } from "express";
import type {Logger} from "winston";
import fs from "fs";
import {exec} from "child_process";
import {createClient} from "redis";
import {logger} from "../logging.ts";
import {RedisStore} from "connect-redis";
import session from "express-session";
import path from "path";

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

const systemRouter = express.Router();

systemRouter.post('/shutdown', (req: Request, res: Response) => {
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

systemRouter.post("/reboot", (req: Request, res: Response) => {
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

systemRouter.post("/display/brightness", (req, res) => {
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


export {
    systemRouter
}