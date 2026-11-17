import express from 'express';
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { createProxyMiddleware } from "http-proxy-middleware";
import winston from 'winston';
const logger = winston.createLogger({
    level: "info",
    format: winston.format.combine(winston.format.errors({ stack: true }), winston.format.timestamp(), winston.format.json()),
    transports: [
        new winston.transports.Console()
    ]
});
process.on('uncaughtException', (err) => {
    logger.error("Uncaught Exception:", err);
    process.exit(1);
});
process.on('unhandledRejection', (reason) => {
    logger.error("Unhandled Rejection:", reason);
});
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const app = express();
const PORT = process.env.FRONTEND_PORT || 2222;
const BACKEND_PORT = process.env.BACKEND_PORT || 8090;
const backendTarget = `http://localhost:${BACKEND_PORT}`;
app.use((req, res, next) => {
    logger.info(`Request: ${req.method} ${req.url}`);
    next();
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
app.use('/api', createProxyMiddleware({
    target: backendTarget,
    changeOrigin: true,
    pathRewrite: {
        '^/api': '',
    },
}));
const distPath = path.join(__dirname, 'dist');
app.use(express.static(distPath));
app.get(/(.*)/, (req, res) => {
    res.sendFile(path.join(distPath, 'index.html'));
});
app.listen(PORT, () => {
    logger.info(`Frontend running on http://localhost:${PORT}`);
    logger.info(`Proxying /api to backend at ${backendTarget}`);
});
