"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.verificarToken = verificarToken;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const secret = process.env.JWT_SECRET || "";
if (!secret) {
    throw new Error("Falta configurar JWT_SECRET en el archivo .env");
}
function verificarToken(token) {
    return jsonwebtoken_1.default.verify(token, secret, {
        ...(process.env.JWT_ISSUER
            ? { issuer: process.env.JWT_ISSUER }
            : {}),
    });
}
