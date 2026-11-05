const express = require('express');
const { autenticar } = require('../middleware/auth');

const router = express.Router();

// POST /auth/verify
// Verifica el token generado por el microservicio de login.
router.post('/verify', autenticar, (req, res) => {
    res.json({
        valido: true,
        usuario: req.usuario
    });
});

module.exports = router;