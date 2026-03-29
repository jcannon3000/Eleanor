import { Router, type IRouter } from "express";
import healthRouter from "./health";
import usersRouter from "./users";
import ritualsRouter from "./rituals";
import authRouter from "./auth";

const router: IRouter = Router();

router.use(authRouter);
router.use(healthRouter);
router.use(usersRouter);
router.use(ritualsRouter);

export default router;
