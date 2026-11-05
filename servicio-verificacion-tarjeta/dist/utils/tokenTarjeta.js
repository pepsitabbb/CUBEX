"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.crearTokenTarjeta = crearTokenTarjeta;
exports.leerTokenTarjeta = leerTokenTarjeta;
const crypto_1 = require("crypto");
const secret = process.env.JWT_SECRET;
if (!secret)
    throw new Error("Falta JWT_SECRET");
function crearTokenTarjeta(meta) {
    const data = Buffer.from(JSON.stringify(meta)).toString("base64url");
    const sig = (0, crypto_1.createHmac)("sha256", secret).update(data).digest("base64url").slice(0, 32);
    const token = `v1.${data}.${sig}`;
    if (token.length > 255)
        throw new Error("Metadatos de tarjeta exceden el tamaño permitido");
    return token;
}
function leerTokenTarjeta(token) {
    try {
        const [version, data, signature] = token.split(".");
        if (version !== "v1" || !data || !signature)
            return null;
        const expected = (0, crypto_1.createHmac)("sha256", secret).update(data).digest("base64url").slice(0, 32);
        const a = Buffer.from(signature), b = Buffer.from(expected);
        if (a.length !== b.length || !(0, crypto_1.timingSafeEqual)(a, b))
            return null;
        const value = JSON.parse(Buffer.from(data, "base64url").toString("utf8"));
        if (value.v !== 1 || typeof value.marca !== "string" || !Number.isInteger(value.mes) || !Number.isInteger(value.anio))
            return null;
        return value;
    }
    catch {
        return null;
    }
}
