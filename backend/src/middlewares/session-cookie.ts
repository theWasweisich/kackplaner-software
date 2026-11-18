import { type Request, type Response, type NextFunction } from "express";

export async function requireSession(req: Request, res: Response, next: NextFunction) {
    if (!req.session.userId) {
        return res.status(401).send("Unauthorized");
    }

    req.userId = req.session.userId;
    next();
}