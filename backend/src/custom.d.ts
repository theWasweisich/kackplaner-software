import type {Logger} from "winston";
import 'express-session';

declare global {
    declare namespace Express {
        export interface Request {
            logger?: Logger
        }
    }
}


declare module 'express-session' {
    export interface SessionData {
        userId?: number;
    }
}