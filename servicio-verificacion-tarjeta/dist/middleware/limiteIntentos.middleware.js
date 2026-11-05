"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.limitarIntentosTarjeta = limitarIntentosTarjeta;
const limiteIntentos_1 = require("../utils/limiteIntentos");
function limitarIntentosTarjeta(req, res, next) {
    if (!req.usuario) {
        res.status(401).json({ error: "Usuario no autenticado" });
        return;
    }
    const estado = (0, limiteIntentos_1.estadoBloqueo)(req.usuario.idUsuario);
    if (estado.bloqueado) {
        res.setHeader("Retry-After", String(estado.reintentarEnSeg));
        res.status(429).json({ error: "Demasiados intentos fallidos", reintentarEnSegundos: estado.reintentarEnSeg });
        return;
    }
    next();
}
