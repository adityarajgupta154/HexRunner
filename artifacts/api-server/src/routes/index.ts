import { Router, type IRouter } from "express";
import healthRouter from "./health";
import runsRouter from "./runs";
import territoryRouter from "./territory";
import usersRouter from "./users";
import anonymousIdentitiesRouter from "./anonymousIdentities";

const router: IRouter = Router();

router.use(healthRouter);
router.use(anonymousIdentitiesRouter);
router.use(runsRouter);
router.use(territoryRouter);
router.use(usersRouter);

export default router;
