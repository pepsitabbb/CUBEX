
import "dotenv/config";

export const env = {
    // Puerto del microservicio de recuperación
    port: Number(process.env.PORT ?? 3002),

    // Dirección del frontend CUBEX
    frontendUrl:
        process.env.FRONTEND_URL ?? "http://127.0.0.1:5500",

    // Configuración de MySQL
    db: {
        host: process.env.DB_HOST ?? "localhost",
        port: Number(process.env.DB_PORT ?? 3306),
        user: process.env.DB_USER ?? "login_app",
        password: process.env.DB_PASSWORD ?? "",
        name: process.env.DB_NAME ?? "tienda_db",
    },

    // Configuración del correo
    smtp: {
        host: process.env.SMTP_HOST ?? "smtp.gmail.com",
        port: Number(process.env.SMTP_PORT ?? 465),
        user: process.env.SMTP_USER ?? "",
        password: process.env.SMTP_PASSWORD ?? "",
        from:
            process.env.MAIL_FROM ??
            process.env.SMTP_USER ??
            "",
    },
};
