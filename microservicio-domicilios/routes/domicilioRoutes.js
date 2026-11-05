import express from "express";

import {
    obtenerDomicilios,
    registrarDomicilio,
    actualizarDomicilio,
    eliminarDomicilio
} from "../controllers/domicilioController.js";

import { requiereAutenticacion } from "../middlewares/requiereAutenticacion.js";

const router = express.Router();

router.use(requiereAutenticacion);

router.get("/", obtenerDomicilios);
router.post("/", registrarDomicilio);
router.put("/:id", actualizarDomicilio);
router.delete("/:id", eliminarDomicilio);

export default router;