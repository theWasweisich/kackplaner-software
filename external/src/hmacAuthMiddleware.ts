import { type Request, type Response, type NextFunction } from "express";
import crypto from "crypto";
import Database from "better-sqlite3";

function requireHmacAuth(db: Database.Database, maxRequestDelay: number) {
    function requireHmacAuthMiddleware(req: Request, res: Response, next: NextFunction) {
        const clientId = req.headers["x-client-id"];
        const timestamp = req.headers["x-timestamp"];
        const signature = req.headers["x-signature"];

        if (!clientId || !timestamp || !signature) {
            return res.status(401).json({ error: 'Missing authentication headers' });
        }

        if (!(typeof clientId === "string" &&
            typeof timestamp === "string" &&
            typeof signature === "string")) {
            return res.status(500).json({ error: "Incorrect types supplied" });
        }

        const requestTime = parseInt(timestamp, 10);
        const currentTime = Math.floor(Date.now() / 1000);
        const elapsedTimeSinceRequest = currentTime - requestTime;

        if (elapsedTimeSinceRequest > maxRequestDelay || elapsedTimeSinceRequest < 0) {
            return res.status(401).json({ error: "Request expired" });
        }

        const client = db
            .prepare("SELECT client_secret FROM api_clients WHERE client_id = ?")
            .get(clientId) as { client_secret: string } | undefined;

        if (!client) {
            return res.status(401).json({ error: "Unauthorized client" });
        }

        const message = `${req.method}:${req.originalUrl}:${timestamp}`;

        const expectedSignature = crypto
            .createHmac('sha256', client.client_secret)
            .update(message)
            .digest('hex');

        const expectedBuffer = Buffer.from(expectedSignature);
        const providedBuffer = Buffer.from(signature);

        if (expectedBuffer.length !== providedBuffer.length) {
            return res.status(401).json({ error: "Malformed signature" });
        }

        if (!crypto.timingSafeEqual(expectedBuffer, providedBuffer)) {
            return res.status(401).json({ error: 'Signature mismatch' });
        }

        next();
    }

    return requireHmacAuthMiddleware;
}

export default requireHmacAuth;