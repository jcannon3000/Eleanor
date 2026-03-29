import { Router, type IRouter } from "express";
import healthRouter from "./health";
import usersRouter from "./users";
import ritualsRouter from "./rituals";
import authRouter from "./auth";
import peopleRouter from "./people";

const router: IRouter = Router();

router.use(authRouter);
router.use(healthRouter);
router.use(usersRouter);
router.use(ritualsRouter);
router.use(peopleRouter);

export default router;
