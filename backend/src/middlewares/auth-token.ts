import { type Request, type Response, type NextFunction } from "express";
import db from "../db/database.ts";
import {eq} from "drizzle-orm";
import {STATUS_CODES} from "node:http";

export async function requireApiToken(req: Request, res: Response, next: NextFunction) {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith("Bearer ")) {
        return res.status(401).json({ error: "Missing or invalid token" });
    }

    const token = authHeader.split(" ")[1];

    const apiUser = await db.query.apiClients.findFirst({
        where: {
            token: {
                eq: token
            }
        }
    });

    if (!apiUser) {
        return res.status(401).json({ error: "Unauthorized token" });
    }

    const targetUserId = req.header("X-Target-User-Id");
    if (!targetUserId) {
        return res.status(400).json({ error: "Missing X-Target-User-Id" });
    }

    const userId = Number.parseInt(targetUserId);

    const user = await db.query.users.findFirst({
        where: { id: { eq: userId } }
    });

    if (!user) {
        return res.status(404).json({ error: "User not found" });
    }

    req.userId = userId;
    next();
}