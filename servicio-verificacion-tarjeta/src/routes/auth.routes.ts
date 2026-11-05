
import { Router } from "express";
import { verificarRolEndpoint } from "../controllers/auth.controller";
import { verificarAutenticacion } from "../middleware/auth.middleware";

const router = Router();

router.get(
    "/verificar-rol",
    verificarAutenticacion,
    verificarRolEndpoint
);

export default router;
