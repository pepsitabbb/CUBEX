import jwt, { type Secret } from "jsonwebtoken";
import { TokenPayload } from "../types/auth.types";

const secret: Secret = process.env.JWT_SECRET || "";

if (!secret) {
    throw new Error(
        "Falta configurar JWT_SECRET en el archivo .env"
    );
}

export function verificarToken(token: string): TokenPayload {
    return jwt.verify(token, secret, {
        ...(process.env.JWT_ISSUER
            ? { issuer: process.env.JWT_ISSUER }
            : {}),
    }) as TokenPayload;
}