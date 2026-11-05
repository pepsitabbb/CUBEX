const express = require('express');
const db = require('../db');
const { autenticar, requiereRol } = require('../middleware/auth');

const router = express.Router();

// GET /roles
// Lista todos los roles. Solo ADMIN puede consultar.
router.get(
    '/',
    autenticar,
    requiereRol('ADMIN'),
    async (_req, res, next) => {
        try {
            const [rows] = await db.query(
                'SELECT id, nombre, descripcion FROM roles'
            );

            res.json(rows);

        } catch (err) {
            next(err);
        }
    }
);

// GET /roles/check?rol=ADMIN,VENDEDOR
// Comprueba si el usuario tiene alguno de los roles solicitados.
router.get('/check', autenticar, (req, res) => {

    const pedidos = String(req.query.rol || '')
        .split(',')
        .map(r => r.trim().toUpperCase())
        .filter(Boolean);

    if (pedidos.length === 0) {
        return res.status(400).json({
            error: 'Indica ?rol=ADMIN,VENDEDOR o CLIENTE'
        });
    }

    const permitido = pedidos.includes(
        String(req.usuario.rol).toUpperCase()
    );

    res.status(permitido ? 200 : 403).json({
        permitido,
        rol_actual: req.usuario.rol,
        roles_consultados: pedidos
    });
});

module.exports = router;