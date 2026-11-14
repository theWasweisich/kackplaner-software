import type {Logger} from "winston";

declare global {
    declare namespace Express {
        export interface Request {
            logger?: Logger
        }
    }
}
