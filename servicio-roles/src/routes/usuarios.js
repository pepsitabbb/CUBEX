const express = require('express');
const db = require('../db');
const { autenticar, requiereRol } = require('../middleware/auth');

const router = express.Router();

// ============================================
// GET /usuarios
// Consultar todos los usuarios (solo ADMIN)
// ============================================
router.get(
    '/',
    autenticar,
    requiereRol('ADMIN'),
    async (req, res, next) => {
        try {
            const [usuarios] = await db.query(`
                SELECT
                    u.id,
                    u.nombre_usuario,
                    u.nombre_completo,
                    u.email,
                    u.estado,
                    u.activo,
                    u.intentos_fallidos,
                    u.bloqueado_hasta,
                    u.ultimo_acceso,
                    r.nombre AS rol
                FROM usuarios u
                INNER JOIN roles r ON r.id = u.rol_id
                ORDER BY u.id DESC
            `);

            res.json({
                ok: true,
                mensaje: 'Usuarios consultados correctamente',
                total: usuarios.length,
                usuarios
            });

        } catch (err) {
            next(err);
        }
    }
);

// ============================================
// GET /usuarios/:id/rol
// Consultar rol: ADMIN o el propio usuario
// ============================================
router.get('/:id/rol', autenticar, async (req, res, next) => {
    try {
        const id = parseInt(req.params.id, 10);

        if (!Number.isInteger(id) || id <= 0) {
            return res.status(400).json({
                error: 'ID de usuario inválido'
            });
        }

        if (
            req.usuario.rol !== 'ADMIN' &&
            Number(req.usuario.id) !== id
        ) {
            return res.status(403).json({
                error: 'Solo puedes consultar tu propio rol'
            });
        }

        const [rows] = await db.query(
            `SELECT
                u.id,
                u.nombre_usuario,
                u.nombre_completo,
                u.estado,
                r.nombre AS rol
             FROM usuarios u
             JOIN roles r ON r.id = u.rol_id
             WHERE u.id = ?`,
            [id]
        );

        if (rows.length === 0) {
            return res.status(404).json({
                error: 'Usuario no encontrado'
            });
        }

        res.json(rows[0]);

    } catch (err) {
        next(err);
    }
});

// ============================================
// PUT /usuarios/:id/rol
// Actualizar rol (solo ADMIN)
// ============================================
router.put(
    '/:id/rol',
    autenticar,
    requiereRol('ADMIN'),
    async (req, res, next) => {
        try {
            const id = parseInt(req.params.id, 10);
            const { nombre_rol } = req.body || {};

            if (!Number.isInteger(id) || id <= 0) {
                return res.status(400).json({
                    error: 'ID de usuario inválido'
                });
            }

            if (!nombre_rol || typeof nombre_rol !== 'string') {
                return res.status(400).json({
                    error: 'nombre_rol es obligatorio'
                });
            }

            const nombreRol = nombre_rol.trim().toUpperCase();

            const [roles] = await db.query(
                'SELECT id, nombre FROM roles WHERE nombre = ?',
                [nombreRol]
            );

            if (roles.length === 0) {
                return res.status(400).json({
                    error: 'El rol solicitado no existe'
                });
            }

            const [usuario] = await db.query(
                'SELECT id, rol_id FROM usuarios WHERE id = ?',
                [id]
            );

            if (usuario.length === 0) {
                return res.status(404).json({
                    error: 'Usuario no encontrado'
                });
            }

            // Evitar que el administrador se quite su propio acceso.
            if (
                Number(req.usuario.id) === id &&
                nombreRol !== 'ADMIN'
            ) {
                return res.status(403).json({
                    error: 'No puedes quitarte tu propio rol de administrador'
                });
            }

            await db.query(
                'UPDATE usuarios SET rol_id = ? WHERE id = ?',
                [roles[0].id, id]
            );

            res.json({
                ok: true,
                mensaje: 'Rol actualizado correctamente',
                id,
                nombre_rol: roles[0].nombre
            });

        } catch (err) {
            next(err);
        }
    }
);

// ============================================
// POST /usuarios/:id/desbloquear
// Desbloquear usuario (solo ADMIN)
// ============================================
router.post(
    '/:id/desbloquear',
    autenticar,
    requiereRol('ADMIN'),
    async (req, res, next) => {
        try {
            const id = parseInt(req.params.id, 10);

            if (!Number.isInteger(id) || id <= 0) {
                return res.status(400).json({
                    error: 'ID de usuario inválido'
                });
            }

            const [resultado] = await db.query(
                `UPDATE usuarios
                 SET estado = 'activo',
                     activo = 1,
                     intentos_fallidos = 0,
                     bloqueado_hasta = NULL
                 WHERE id = ?`,
                [id]
            );

            if (resultado.affectedRows === 0) {
                return res.status(404).json({
                    error: 'Usuario no encontrado'
                });
            }

            res.json({
                ok: true,
                mensaje: 'Usuario desbloqueado correctamente',
                id
            });

        } catch (err) {
            next(err);
        }
    }
);

module.exports = router;