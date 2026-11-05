"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.tokenizarTarjeta = tokenizarTarjeta;
exports.autorizarTarjeta = autorizarTarjeta;
const crypto_1 = require("crypto");
/** Genera un token opaco. NO se deriva del número de tarjeta. */
function tokenizarTarjeta() {
    return "tok_sim_" + (0, crypto_1.randomBytes)(16).toString("hex");
}
function autorizarTarjeta(params) {
    const { ultimosDigitos, contexto } = params;
    if (ultimosDigitos === "0002") {
        return {
            aprobada: false,
            codigo: "tarjeta_rechazada",
            mensaje: "El banco emisor rechazó la tarjeta (simulado).",
        };
    }
    if (ultimosDigitos === "9995") {
        return {
            aprobada: false,
            codigo: "fondos_insuficientes",
            mensaje: "La tarjeta no tiene fondos suficientes (simulado).",
        };
    }
    if (ultimosDigitos === "0341" && contexto === "pago") {
        return {
            aprobada: false,
            codigo: "tarjeta_rechazada",
            mensaje: "El banco rechazó el cargo al momento del pago (simulado).",
        };
    }
    return {
        aprobada: true,
        codigo: "aprobada",
        mensaje: contexto === "verificacion"
            ? "Tarjeta verificada correctamente (simulado)."
            : "Pago autorizado (simulado).",
        codigoAutorizacion: "SIM-" + (0, crypto_1.randomBytes)(3).toString("hex").toUpperCase(),
    };
}
