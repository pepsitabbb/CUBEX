
import { randomBytes, createHash } from "node:crypto";
import bcrypt from "bcryptjs";
import { pool } from "../config/database.js";
import { sendPasswordResetEmail } from "./email.service.js";

// Generar el hash SHA-256 del token.
function hashToken(token: string): string {
    return createHash("sha256")
        .update(token)
        .digest("hex");
}

// =========================================================
// SOLICITAR RECUPERACIÓN DE CONTRASEÑA
// =========================================================

export async function requestPasswordRecovery(
    email: string
): Promise<void> {

    const normalizedEmail = email.trim().toLowerCase();

    // Buscar usuario por correo en MySQL.
    const [usuarios] = await pool.execute<any[]>(
        `SELECT id, email, nombre_completo
         FROM usuarios
         WHERE LOWER(TRIM(email)) = ?
         LIMIT 1`,
        [normalizedEmail]
    );

    const usuario = usuarios[0];

    // No revelar si el correo existe.
    if (!usuario) {
        return;
    }

    // Invalidar tokens anteriores.
    await pool.execute(
        `UPDATE tokens_recuperacion
         SET usado = TRUE
         WHERE id_usuario = ? AND usado = FALSE`,
        [usuario.id]
    );

    // Generar token seguro.
    const rawToken = randomBytes(32).toString("hex");
    const hashedToken = hashToken(rawToken);

    // Expiración de una hora.
    const expiration = new Date(Date.now() + 60 * 60 * 1000);

    // Guardar únicamente el hash.
    await pool.execute(
        `INSERT INTO tokens_recuperacion
         (id_usuario, token, fecha_expiracion, usado)
         VALUES (?, ?, ?, FALSE)`,
        [usuario.id, hashedToken, expiration]
    );

    // Enviar el token original por correo.
    await sendPasswordResetEmail(
        usuario.email,
        usuario.nombre_completo || usuario.email,
        rawToken
    );
}

// =========================================================
// VALIDAR TOKEN DE RECUPERACIÓN
// =========================================================

export async function validatePasswordResetToken(
    token: string
): Promise<boolean> {

    const hashedToken = hashToken(token);

    const [tokens] = await pool.execute<any[]>(
        `SELECT id
         FROM tokens_recuperacion
         WHERE token = ?
           AND usado = FALSE
           AND fecha_expiracion > NOW()
         LIMIT 1`,
        [hashedToken]
    );

    return tokens.length > 0;
}

// =========================================================
// RESTABLECER CONTRASEÑA
// =========================================================

export async function resetPassword(
    token: string,
    newPassword: string
): Promise<void> {

    const hashedToken = hashToken(token);

    const connection = await pool.getConnection();

    try {
        await connection.beginTransaction();

        // Buscar y bloquear el token durante la operación.
        const [tokens] = await connection.execute<any[]>(
            `SELECT id, id_usuario, usado, fecha_expiracion
             FROM tokens_recuperacion
             WHERE token = ?
             LIMIT 1
             FOR UPDATE`,
            [hashedToken]
        );

        const recoveryToken = tokens[0];

        if (!recoveryToken) {
            throw new Error("TOKEN_INVALID");
        }

        if (recoveryToken.usado) {
            throw new Error("TOKEN_USED");
        }

        const expiration = new Date(
            recoveryToken.fecha_expiracion
        );

        if (expiration.getTime() <= Date.now()) {
            throw new Error("TOKEN_EXPIRED");
        }

        // Generar hash de la nueva contraseña.
        const passwordHash = await bcrypt.hash(newPassword, 12);

        // Actualizar contraseña del usuario.
        const [resultado] = await connection.execute<any>(
            `UPDATE usuarios
             SET password_hash = ?
             WHERE id = ?`,
            [passwordHash, recoveryToken.id_usuario]
        );

        if (resultado.affectedRows === 0) {
            throw new Error("USER_NOT_FOUND");
        }

        // Marcar el token como utilizado.
        await connection.execute(
            `UPDATE tokens_recuperacion
             SET usado = TRUE
             WHERE id = ?`,
            [recoveryToken.id]
        );

        await connection.commit();

    } catch (error) {
        await connection.rollback();
        throw error;

    } finally {
        connection.release();
    }
}
