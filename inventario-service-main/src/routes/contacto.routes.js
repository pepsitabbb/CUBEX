
const express = require('express');
const router = express.Router();
const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.GMAIL_USER,
        pass: process.env.GMAIL_APP_PASSWORD
    }
});

router.post('/', async (req, res) => {
    try {
        const { nombre, correo, asunto, mensaje } = req.body;

        if (!nombre || !correo || !asunto || !mensaje) {
            return res.status(400).json({
                success: false,
                message: 'Todos los campos son obligatorios.'
            });
        }

        const correoValido =
            /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correo);

        if (!correoValido) {
            return res.status(400).json({
                success: false,
                message: 'El correo del usuario no es válido.'
            });
        }

        await transporter.sendMail({
            from: `"CUBEX" <${process.env.GMAIL_USER}>`,
            to: 'cubexshop2@gmail.com',
            replyTo: correo,
            subject: `Contacto CUBEX: ${asunto}`,
            text: `
Nuevo mensaje recibido desde CUBEX.

Nombre: ${nombre}
Correo del usuario: ${correo}
Asunto: ${asunto}

Mensaje:
${mensaje}
            `
        });

        return res.json({
            success: true,
            message: 'Mensaje enviado correctamente.'
        });

    } catch (error) {
        console.error('Error al enviar correo:', error);

        return res.status(500).json({
            success: false,
            message: 'No fue posible enviar el correo.'
        });
    }
});

module.exports = router;
