
const express = require('express');
const router = express.Router();

const pool = require('../database');

const {
    requiereAutenticacion,
    requiereRol
} = require('../middlewares/auth');

// ========================================
// OBTENER TODAS LAS RESEÑAS
// PÚBLICO: TODOS PUEDEN VERLAS
// ========================================
router.get('/', async (req, res) => {
    try {
        const [resenas] = await pool.query(`
            SELECT
                r.id,
                r.id_producto,
                r.id_cliente,
                r.calificacion,
                r.comentario,
                r.fecha,
                u.nombre_usuario
            FROM resenas r
            INNER JOIN usuarios u
                ON r.id_cliente = u.id
            ORDER BY r.fecha DESC
        `);

        res.json(resenas);

    } catch (error) {
        console.error(error);
        res.status(500).json({
            error: 'Error al obtener las reseñas'
        });
    }
});

// ========================================
// OBTENER UNA RESEÑA
// PÚBLICO: TODOS PUEDEN VERLA
// ========================================

// ========================================
// OBTENER RESEÑAS DE UN PRODUCTO
// PÚBLICO: TODOS PUEDEN VERLAS
// CLIENTE, VENDEDOR Y ADMIN
// ========================================

router.get('/:id', async (req, res) => {
    try {
        const id_producto = Number(req.params.id);

        if (!Number.isInteger(id_producto) || id_producto <= 0) {
            return res.status(400).json({
                error: 'ID de producto no válido'
            });
        }

        const [resenas] = await pool.query(`
            SELECT
                r.id,
                r.id_producto,
                r.id_cliente,
                r.calificacion,
                r.comentario,
                r.fecha,
                u.nombre_usuario
            FROM resenas r
            INNER JOIN usuarios u
                ON r.id_cliente = u.id
            WHERE r.id_producto = ?
            ORDER BY r.fecha DESC
        `, [id_producto]);

        res.json(resenas);

    } catch (error) {
        console.error('Error al obtener reseñas:', error);

        res.status(500).json({
            error: 'Error al obtener las reseñas del producto'
        });
    }
});


// ========================================
// CREAR RESEÑA
// SOLO CLIENTE
// ========================================
router.post(
    '/',
    requiereAutenticacion,
    requiereRol('CLIENTE'),
    async (req, res) => {
        try {
            const {
                id_producto,
                calificacion,
                comentario
            } = req.body;

            // El ID se obtiene del token de sesión.
            // No se recibe desde el formulario.
            const id_cliente = Number(req.usuario.sub);

            const producto = Number(id_producto);
            const puntuacion = Number(calificacion);

            if (
                !Number.isInteger(id_cliente) ||
                id_cliente <= 0
            ) {
                return res.status(401).json({
                    error: 'Identificador de usuario no válido'
                });
            }

            if (
                !Number.isInteger(producto) ||
                producto <= 0 ||
                !Number.isInteger(puntuacion) ||
                puntuacion < 1 ||
                puntuacion > 5 ||
                typeof comentario !== 'string' ||
                !comentario.trim()
            ) {
                return res.status(400).json({
                    error: 'Verifica el producto, la calificación y el comentario'
                });
            }

            const [resultado] = await pool.query(
                `INSERT INTO resenas
                (id_producto, id_cliente, calificacion, comentario)
                VALUES (?, ?, ?, ?)`,
                [
                    producto,
                    id_cliente,
                    puntuacion,
                    comentario.trim()
                ]
            );

            res.status(201).json({
                mensaje: 'Reseña creada correctamente',
                id: resultado.insertId
            });

        } catch (error) {
            console.error(error);
            res.status(500).json({
                error: 'Error al crear la reseña'
            });
        }
    }
);

// ========================================
// EDITAR RESEÑA
// SOLO CLIENTE Y SOLO LA SUYA
// ========================================
router.put(
    '/:id',
    requiereAutenticacion,
    requiereRol('CLIENTE'),
    async (req, res) => {
        try {
            const id = Number(req.params.id);
            const id_cliente = Number(req.usuario.sub);

            const {
                calificacion,
                comentario
            } = req.body;

            const puntuacion = Number(calificacion);

            if (
                !Number.isInteger(id) ||
                id <= 0 ||
                !Number.isInteger(id_cliente) ||
                id_cliente <= 0
            ) {
                return res.status(400).json({
                    error: 'Identificador no válido'
                });
            }

            if (
                !Number.isInteger(puntuacion) ||
                puntuacion < 1 ||
                puntuacion > 5 ||
                typeof comentario !== 'string' ||
                !comentario.trim()
            ) {
                return res.status(400).json({
                    error: 'La calificación debe estar entre 1 y 5 y el comentario no puede estar vacío'
                });
            }

            // Comprueba que la reseña pertenezca al cliente.
            const [existente] = await pool.query(
                `SELECT id FROM resenas
                 WHERE id = ? AND id_cliente = ?`,
                [id, id_cliente]
            );

            if (existente.length === 0) {
                return res.status(404).json({
                    error: 'Reseña no encontrada o no tienes permiso para editarla'
                });
            }

            await pool.query(
                `UPDATE resenas
                 SET calificacion = ?, comentario = ?
                 WHERE id = ? AND id_cliente = ?`,
                [
                    puntuacion,
                    comentario.trim(),
                    id,
                    id_cliente
                ]
            );

            res.json({
                mensaje: 'Reseña actualizada correctamente'
            });

        } catch (error) {
            console.error(error);
            res.status(500).json({
                error: 'Error al actualizar la reseña'
            });
        }
    }
);

// ========================================
// ELIMINAR RESEÑA
// CLIENTE: SOLO LA SUYA
// ADMIN: CUALQUIERA
// VENDEDOR: NO PUEDE ELIMINAR
// ========================================
router.delete(
    '/:id',
    requiereAutenticacion,
    requiereRol('CLIENTE', 'ADMIN'),
    async (req, res) => {
        try {
            const id = Number(req.params.id);

            if (!Number.isInteger(id) || id <= 0) {
                return res.status(400).json({
                    error: 'ID de reseña no válido'
                });
            }

            let consulta;
            let parametros;

            if (req.usuario.rol === 'ADMIN') {

                // El administrador puede eliminar cualquiera.
                consulta = `
                    DELETE FROM resenas
                    WHERE id = ?
                `;

                parametros = [id];

            } else {

                // El cliente solamente puede eliminar la suya.
                const id_cliente = Number(req.usuario.sub);

                if (
                    !Number.isInteger(id_cliente) ||
                    id_cliente <= 0
                ) {
                    return res.status(401).json({
                        error: 'Identificador de usuario no válido'
                    });
                }

                consulta = `
                    DELETE FROM resenas
                    WHERE id = ? AND id_cliente = ?
                `;

                parametros = [id, id_cliente];
            }

            const [resultado] = await pool.query(
                consulta,
                parametros
            );

            if (resultado.affectedRows === 0) {
                return res.status(404).json({
                    error: 'Reseña no encontrada o no tienes permiso para eliminarla'
                });
            }

            res.json({
                mensaje: 'Reseña eliminada correctamente'
            });

        } catch (error) {
            console.error(error);
            res.status(500).json({
                error: 'Error al eliminar la reseña'
            });
        }
    }
);

module.exports = router;
