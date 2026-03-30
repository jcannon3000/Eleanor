import { Router, type IRouter } from "express";
import healthRouter from "./health";
import usersRouter from "./users";
import ritualsRouter from "./rituals";
import authRouter from "./auth";
import peopleRouter from "./people";
import contactsRouter from "./contacts";
import scheduleRouter from "./schedule";
import inviteRouter from "./invite";

const router: IRouter = Router();

router.use(authRouter);
router.use(healthRouter);
router.use(usersRouter);
router.use(ritualsRouter);
router.use(peopleRouter);
router.use(contactsRouter);
router.use(scheduleRouter);
router.use(inviteRouter);

export default router;
