// to be mounted under /users
import express, {type NextFunction, type Request, type Response} from "express";
import { hash, verify } from '@node-rs/argon2';
import {users as usersTable} from "../db/schema.ts";
import * as bodyParser from "body-parser";
import db from "../db/database.ts";
import { LibsqlError } from "@libsql/client";
import {Logger, loggers} from "winston";
import { Session } from 'express-session';
import {eq} from "drizzle-orm";

const usersRouter = express.Router();

type NewUser = typeof usersTable.$inferInsert;
type SelectedUser = typeof usersTable.$inferSelect;

const jsonParser = bodyParser.json();

async function insertUser(user: NewUser) {
    return await db
        .insert(usersTable)
        .values(user);
}

async function registerUser(validatedUsername: string, validatedPassword: string, logger: Logger) {
    const hashedPassword = await hash(validatedPassword);

    try {
        const resultSet = await insertUser({
            username: validatedUsername,
            password: hashedPassword,
        });
        return resultSet.rowsAffected === 1;
    } catch (e) {
        if (e instanceof LibsqlError && e.code === "SQLITE_CONSTRAINT_UNIQUE") {
            return false;
        }
        logger.error(`Error during user insertion. ${e}`);
        return false;
    }
}

async function userLogin(username: string, password: string, logger: Logger, signal: AbortSignal): Promise<SelectedUser | undefined> {
    const user = await db.select().from(usersTable).where(eq(usersTable.username, username));
    if (user.length == 0) { return; }
    const isPasswordValid = await verify(user[0].password, password, null, signal);
    if (isPasswordValid) return user[0];
    logger.warn(`User login failed for user: ${username}`);
}

usersRouter.post("/register", jsonParser, async (req: Request, res: Response) => {
    if (!req.body || !req.body.username || !req.body.password) return res.sendStatus(400);
    const username = req.body.username;
    const password = req.body.password;

    if (typeof username !== "string") return res.sendStatus(400);
    if (typeof password !== "string") return res.sendStatus(400);

    const usernameRegex = /^(?=.{3,20}$)(?![_.-])(?!.*[_.-]{2})[a-zA-Z0-9_-]+([^._-])$/

    const regexRes = usernameRegex.exec(username);
    if (regexRes == null) return res.sendStatus(400);
    const usernameSafe = regexRes[0];
    if (username !== usernameSafe) return res.status(400).end("Invalid username provided");

    const logger = req.logger!;

    const registrationSuccess = await registerUser(usernameSafe, password, logger);

    if (!registrationSuccess) {

        return res.status(400).end("Could not register user");

    }
    const user = await userLogin(usernameSafe, password, logger, req.signal);

    if (user) {
        req.session.userId = user.id;
        return res.sendStatus(200);
    }
    return res.sendStatus(500);
});

usersRouter.post("/login", async (req: Request, res: Response, next: NextFunction) => {
    if (!req.body || !req.body.username || !req.body.password) return res.sendStatus(400);
    const logger = req.logger!;
    const username = req.body.username;
    const password = req.body.password;

    if (typeof username !== "string") return res.sendStatus(400);
    if (typeof password !== "string") return res.sendStatus(400);

    const user = await userLogin(username, password, logger, req.signal);

    if (!user) return res.sendStatus(401);

    req.session.regenerate(function (err) {
        if (err) next(err);

        req.session.userId = user.id;

        req.session.save(function (err) {
            if (err) next(err);
            res.status(200).send("Successfully logged in");
        });
    })
});

usersRouter.get("/me", async (req: Request, res: Response, next: NextFunction) => {
    const logger = req.logger!;
    const userId = req.session.userId;
    if (!userId) return res.sendStatus(401);

    logger.info(`Requesting /me for ${userId}`);

    const users = await db.select().from(usersTable).where(eq(usersTable.id, userId));
    if (users.length !== 1) return res.sendStatus(401);
    const user = users[0];

    return res.json({
        username: user.username
    });
});

usersRouter.post("/logout", async (req: Request, res: Response, next: NextFunction) => {

    req.session.userId = undefined;

    req.session.save((err) => {
        if (err) next(err);

        req.session.regenerate((err) => {
            if (err) next(err);
            res.status(200).send("Logged out");
        })
    })
});

export { usersRouter }