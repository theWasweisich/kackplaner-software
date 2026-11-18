import express from 'express';
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { createProxyMiddleware } from "http-proxy-middleware";
import winston from 'winston';
const usersVault = new Map();
const logger = winston.createLogger({
    level: "info",
    format: winston.format.combine(winston.format.errors({ stack: true }), winston.format.timestamp(), winston.format.json()),
    transports: [
        new winston.transports.Console()
    ]
});
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const app = express();
const PORT = process.env.FRONTEND_PORT || 2222;
const BACKEND_PORT = process.env.BACKEND_PORT || 8090;
const backendTarget = `http://localhost:${BACKEND_PORT}`;
const STATUS_CODES = {
    SUCCESS: 200,
    BAD_REQUEST: 400,
    UNAUTHORIZED: 401,
    SERVER_ERROR: 500,
};
async function dropSessionCookie(req, res) {
    try {
        const backendRes = await fetch(backendTarget + "/users/logout", {
            method: "POST",
            headers: { 'cookie': req.headers.cookie || '' }
        });
        translateHeaders(backendRes.headers, res);
        const resText = await backendRes.text();
        res.status(backendRes.status).send(resText);
    }
    catch (e) {
        logger.error(`Logout proxy error: ${e}`);
        res.sendStatus(STATUS_CODES.SERVER_ERROR);
    }
}
function translateHeaders(headers, response) {
    const doNotForwardHeaderKeys = [
        'content-length',
        'transfer-encoding',
        'content-encoding',
        'connection',
        'keep-alive'
    ];
    headers.forEach((value, key) => {
        if (doNotForwardHeaderKeys.includes(key.toLowerCase()))
            return;
        response.setHeader(key, value);
    });
}
app.use((req, res, next) => {
    logger.info(`Request: ${req.method} ${req.url}`);
    next();
});
app.get("/api/list-users", async (req, res) => {
    res.json({ users: Array.from(usersVault.keys()) });
});
app.post("/api/login", express.json(), async (req, res) => {
    const { username, password } = req.body;
    if (typeof username !== "string") {
        return res.status(STATUS_CODES.BAD_REQUEST).json({
            error: "Username not provided (or invalid)"
        });
    }
    const passwordToUse = password || usersVault.get(username);
    if (!passwordToUse) {
        return res.status(STATUS_CODES.BAD_REQUEST).json({
            error: "Password required"
        });
    }
    try {
        const backendRes = await fetch(backendTarget + "/users/login", {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                username,
                password: passwordToUse
            }),
            signal: req.signal
        });
        if (backendRes.ok) {
            if (password)
                usersVault.set(username, password);
        }
        else if (backendRes.status === STATUS_CODES.UNAUTHORIZED && !password) {
            usersVault.delete(username);
        }
        translateHeaders(backendRes.headers, res);
        const responseBody = await backendRes.text();
        res.status(backendRes.status).send(responseBody);
    }
    catch (e) {
        logger.error(`Login proxy error: ${e}`);
        res.status(STATUS_CODES.SERVER_ERROR).send();
    }
});
app.post("/api/end-session", express.json(), async (req, res) => {
    dropSessionCookie(req, res);
});
app.post("/api/logout", express.json(), async (req, res) => {
    const { username } = req.body;
    if (typeof username !== "string") {
        return res.status(STATUS_CODES.BAD_REQUEST).json({
            error: "Username invalid"
        });
    }
    if (username) {
        usersVault.delete(username);
    }
    dropSessionCookie(req, res);
});
app.use("/api", createProxyMiddleware({
    target: backendTarget,
    changeOrigin: true,
    pathRewrite: {
        '^/api': '',
    },
    on: {
        error: (err, req, res) => {
            logger.error("Proxy error:", err);
        }
    }
}));
const distPath = path.join(__dirname, 'dist');
app.use(express.static(distPath));
app.get(/(.*)/, (req, res) => {
    res.sendFile(path.join(distPath, 'index.html'));
});
const server = app.listen(PORT, () => {
    logger.info(`Frontend running on http://localhost:${PORT}`);
    logger.info(`Proxying /api to backend at ${backendTarget}`);
});
process.on('uncaughtException', (err) => {
    logger.error("Uncaught Exception:", err);
    server.close((err) => {
        if (err)
            logger.error(`Uncaught Process Exception: ${err}`);
        process.exit(1);
    });
});
process.on('unhandledRejection', (reason) => {
    logger.error("Unhandled Rejection:", reason);
    process.exit(1);
});
