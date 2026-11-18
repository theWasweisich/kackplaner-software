import express, {  } from "express";
import {usersRouter} from "./usersRouter.ts";
import {kackEventRouter} from "./kackeventRouter.ts";
import {systemRouter} from "./systemRouter.ts";

const globalRouter = express.Router();

globalRouter.use("/users", usersRouter);
globalRouter.use("/kackevent", kackEventRouter);
globalRouter.use("/system", systemRouter);

export { globalRouter }