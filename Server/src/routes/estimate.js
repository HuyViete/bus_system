import { Router } from "express";
import { getEstimate } from "../controllers/estimateController.js";

const router = Router();

router.get("/", getEstimate);

export default router;