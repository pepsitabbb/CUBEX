"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.requestPasswordRecovery = requestPasswordRecovery;
exports.validatePasswordResetToken = validatePasswordResetToken;
exports.resetPassword = resetPassword;
const node_crypto_1 = require("node:crypto");
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const database_js_1 = require("../config/database.js");
const email_service_js_1 = require("./email.service.js");
// Generar el hash SHA-256 del token.
function hashToken(token) {
    return (0, node_crypto_1.createHash)("sha256")
        .update(token)
        .digest("hex");
}
// =========================================================
// SOLICITAR RECUPERACIÓN DE CONTRASEÑA
// =========================================================
async function requestPasswordRecovery(email) {
    const normalizedEmail = email.trim().toLowerCase();
    // Buscar usuario por correo en MySQL.
    const [usuarios] = await database_js_1.pool.execute(`SELECT id, email, nombre_completo
         FROM usuarios
         WHERE LOWER(TRIM(email)) = ?
         LIMIT 1`, [normalizedEmail]);
    const usuario = usuarios[0];
    // No revelar si el correo existe.
    if (!usuario) {
        return;
    }
    // Invalidar tokens anteriores.
    await database_js_1.pool.execute(`UPDATE tokens_recuperacion
         SET usado = TRUE
         WHERE id_usuario = ? AND usado = FALSE`, [usuario.id]);
    // Generar token seguro.
    const rawToken = (0, node_crypto_1.randomBytes)(32).toString("hex");
    const hashedToken = hashToken(rawToken);
    // Expiración de una hora.
    const expiration = new Date(Date.now() + 60 * 60 * 1000);
    // Guardar únicamente el hash.
    await database_js_1.pool.execute(`INSERT INTO tokens_recuperacion
         (id_usuario, token, fecha_expiracion, usado)
         VALUES (?, ?, ?, FALSE)`, [usuario.id, hashedToken, expiration]);
    // Enviar el token original por correo.
    await (0, email_service_js_1.sendPasswordResetEmail)(usuario.email, usuario.nombre_completo || usuario.email, rawToken);
}
// =========================================================
// VALIDAR TOKEN DE RECUPERACIÓN
// =========================================================
async function validatePasswordResetToken(token) {
    const hashedToken = hashToken(token);
    const [tokens] = await database_js_1.pool.execute(`SELECT id
         FROM tokens_recuperacion
         WHERE token = ?
           AND usado = FALSE
           AND fecha_expiracion > NOW()
         LIMIT 1`, [hashedToken]);
    return tokens.length > 0;
}
// =========================================================
// RESTABLECER CONTRASEÑA
// =========================================================
async function resetPassword(token, newPassword) {
    const hashedToken = hashToken(token);
    const connection = await database_js_1.pool.getConnection();
    try {
        await connection.beginTransaction();
        // Buscar y bloquear el token durante la operación.
        const [tokens] = await connection.execute(`SELECT id, id_usuario, usado, fecha_expiracion
             FROM tokens_recuperacion
             WHERE token = ?
             LIMIT 1
             FOR UPDATE`, [hashedToken]);
        const recoveryToken = tokens[0];
        if (!recoveryToken) {
            throw new Error("TOKEN_INVALID");
        }
        if (recoveryToken.usado) {
            throw new Error("TOKEN_USED");
        }
        const expiration = new Date(recoveryToken.fecha_expiracion);
        if (expiration.getTime() <= Date.now()) {
            throw new Error("TOKEN_EXPIRED");
        }
        // Generar hash de la nueva contraseña.
        const passwordHash = await bcryptjs_1.default.hash(newPassword, 12);
        // Actualizar contraseña del usuario.
        const [resultado] = await connection.execute(`UPDATE usuarios
             SET password_hash = ?
             WHERE id = ?`, [passwordHash, recoveryToken.id_usuario]);
        if (resultado.affectedRows === 0) {
            throw new Error("USER_NOT_FOUND");
        }
        // Marcar el token como utilizado.
        await connection.execute(`UPDATE tokens_recuperacion
             SET usado = TRUE
             WHERE id = ?`, [recoveryToken.id]);
        await connection.commit();
    }
    catch (error) {
        await connection.rollback();
        throw error;
    }
    finally {
        connection.release();
    }
}
