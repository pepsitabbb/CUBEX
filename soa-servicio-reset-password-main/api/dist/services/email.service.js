"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.sendPasswordResetEmail = sendPasswordResetEmail;
const nodemailer_1 = __importDefault(require("nodemailer"));
const env_js_1 = require("../config/env.js");
// =============================================
// CONFIGURACIÓN DEL TRANSPORTADOR DE CORREO
// =============================================
const transporter = nodemailer_1.default.createTransport({
    host: env_js_1.env.smtp.host,
    port: env_js_1.env.smtp.port,
    secure: env_js_1.env.smtp.port === 465,
    auth: {
        user: env_js_1.env.smtp.user,
        pass: env_js_1.env.smtp.password,
    },
});
// Verificar conexión SMTP
transporter.verify()
    .then(() => {
    console.log("✓ Servidor SMTP conectado correctamente");
})
    .catch((error) => {
    console.error("✗ Error conectando al servidor SMTP:", error);
});
// =============================================
// ENVIAR CORREO DE RECUPERACIÓN
// =============================================
async function sendPasswordResetEmail(email, name, token) {
    // Generar enlace para restablecer contraseña
    const resetUrl = `${env_js_1.env.frontendUrl}/reset-password.html?token=${encodeURIComponent(token)}`;
    await transporter.sendMail({
        from: env_js_1.env.smtp.from,
        to: email,
        subject: "Recuperación de contraseña - CUBEX",
        // Versión de texto
        text: `
Hola ${name},

Recibimos una solicitud para cambiar la contraseña de tu cuenta CUBEX.

Para establecer una nueva contraseña, entra al siguiente enlace:

${resetUrl}

Este enlace expirará en 1 hora.

Si tú no solicitaste este cambio, puedes ignorar este correo.

Saludos,
Equipo de soporte CUBEX.
`,
        // Versión HTML
        html: `
<!DOCTYPE html>
<html lang="es">

<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Recuperación de contraseña</title>
</head>

<body style="
    margin:0;
    padding:0;
    background:#f1f5f9;
    font-family:Arial,Helvetica,sans-serif;
">

    <div style="
        max-width:600px;
        margin:40px auto;
        padding:20px;
    ">

        <div style="
            background:white;
            border-radius:16px;
            padding:40px;
            box-shadow:0 10px 30px rgba(0,0,0,.08);
        ">

            <div style="
                text-align:center;
                margin-bottom:30px;
            ">

                <div style="
                    display:inline-block;
                    background:#2563eb;
                    color:white;
                    padding:14px;
                    border-radius:50%;
                    font-size:24px;
                ">
                    🔐
                </div>

            </div>

            <h1 style="
                color:#0f172a;
                text-align:center;
                font-size:24px;
            ">
                Recuperación de contraseña
            </h1>

            <p style="
                color:#475569;
                font-size:16px;
                line-height:1.6;
            ">
                Hola <strong>${escapeHtml(name)}</strong>,
            </p>

            <p style="
                color:#475569;
                font-size:16px;
                line-height:1.6;
            ">
                Recibimos una solicitud para cambiar la contraseña
                de tu cuenta CUBEX.
            </p>

            <p style="
                color:#475569;
                font-size:16px;
                line-height:1.6;
            ">
                Haz clic en el siguiente botón para establecer
                una nueva contraseña:
            </p>

            <div style="
                text-align:center;
                margin:35px 0;
            ">

                <a
                    href="${escapeHtml(resetUrl)}"
                    style="
                        display:inline-block;
                        background:#2563eb;
                        color:white;
                        text-decoration:none;
                        padding:14px 28px;
                        border-radius:10px;
                        font-weight:bold;
                    "
                >
                    Cambiar contraseña
                </a>

            </div>

            <p style="
                color:#64748b;
                font-size:14px;
                line-height:1.6;
            ">
                Este enlace expirará en <strong>1 hora</strong>.
            </p>

            <p style="
                color:#64748b;
                font-size:14px;
                line-height:1.6;
            ">
                Si tú no solicitaste este cambio,
                puedes ignorar este correo.
            </p>

            <hr style="
                border:none;
                border-top:1px solid #e2e8f0;
                margin:30px 0;
            ">

            <p style="
                color:#94a3b8;
                font-size:12px;
                text-align:center;
            ">
                Este correo fue generado automáticamente.
                Por favor, no respondas a este mensaje.
            </p>

            <p style="
                color:#64748b;
                font-size:13px;
                text-align:center;
                font-weight:bold;
            ">
                Equipo CUBEX
            </p>

        </div>

    </div>

</body>
</html>
`,
    });
}
// =============================================
// ESCAPAR CARACTERES HTML
// =============================================
function escapeHtml(value) {
    return value
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}
