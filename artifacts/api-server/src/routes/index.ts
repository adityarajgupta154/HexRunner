import { Router, type IRouter } from "express";
import healthRouter from "./health";
import runsRouter from "./runs";
import territoryRouter from "./territory";
import usersRouter from "./users";
import anonymousIdentitiesRouter from "./anonymousIdentities";
import safetyRouter from "./safety";
import airQualityRouter from "./airQuality";
import civicRouter from "./civic";

const router: IRouter = Router();

router.use(healthRouter);
router.use(anonymousIdentitiesRouter);
router.use(runsRouter);
router.use(territoryRouter);
router.use(usersRouter);
router.use(safetyRouter);
router.use(airQualityRouter);
router.use(civicRouter);

export default router;
