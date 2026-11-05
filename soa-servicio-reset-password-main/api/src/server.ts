import express from "express";
import cors from "cors";

import { env } from "./config/env.js";

import {
  requestPasswordRecovery,
  validatePasswordResetToken,
  resetPassword
} from "./services/password-recovery.service.js";


const app = express();


/*
 * =========================================================
 * CONFIGURACIÓN
 * =========================================================
 */

app.use(
  cors({

    origin:
      env.frontendUrl,

  })
);


app.use(
  express.json()
);


/*
 * =========================================================
 * HEALTH CHECK
 * =========================================================
 */

app.get(
  "/api/health",

  (_req, res) => {

    res.json({

      success: true,

      message:
        "API funcionando correctamente",

    });

  }
);


/*
 * =========================================================
 * SOLICITAR RECUPERACIÓN DE CONTRASEÑA
 * =========================================================
 */

app.post(
  "/api/auth/forgot-password",

  async (req, res) => {

    try {

      const {
        email
      } = req.body;


      /*
       * Validación básica.
       */

      if (
        typeof email !== "string" ||
        !email.trim()
      ) {

        return res.status(400).json({

          success: false,

          message:
            "El correo electrónico es obligatorio.",

        });

      }


      /*
       * Ejecutar recuperación.
       */

      await requestPasswordRecovery(
        email
      );


      /*
       * NO decimos si el correo existe.
       */

      return res.json({

        success: true,

        message:
          "Si el correo está registrado, recibirás instrucciones para recuperar tu contraseña.",

      });


    } catch (error) {

      console.error(
        "Error en recuperación de contraseña:",
        error
      );


      return res.status(500).json({

        success: false,

        message:
          "No fue posible procesar la solicitud.",

      });

    }

  }
);


/*
 * =========================================================
 * VALIDAR TOKEN DE RECUPERACIÓN
 * =========================================================
 *
 * GET
 * /api/auth/reset-password/validate-token?token=...
 *
 * Este endpoint se utiliza cuando el usuario abre
 * el enlace recibido por correo.
 *
 * =========================================================
 */

app.get(
  "/api/auth/reset-password/validate-token",

  async (req, res) => {

    try {

      const {
        token
      } = req.query;


      /*
       * Validación básica.
       */

      if (
        typeof token !== "string" ||
        !token.trim()
      ) {

        return res.status(400).json({

          success: false,

          valid: false,

          message:
            "El token es obligatorio.",

        });

      }


      /*
       * Comprobar si el token
       * existe, no ha sido utilizado
       * y no ha expirado.
       */

      const valid =
        await validatePasswordResetToken(
          token
        );


      /*
       * Token inválido o expirado.
       */

      if (!valid) {

        return res.status(400).json({

          success: false,

          valid: false,

          message:
            "El enlace de recuperación no es válido o ha expirado.",

        });

      }


      /*
       * Token válido.
       */

      return res.json({

        success: true,

        valid: true,

        message:
          "El token es válido.",

      });


    } catch (error) {

      console.error(
        "Error validando token:",
        error
      );


      return res.status(500).json({

        success: false,

        valid: false,

        message:
          "No fue posible validar el token.",

      });

    }

  }
);


/*
 * =========================================================
 * RESTABLECER CONTRASEÑA
 * =========================================================
 *
 * POST
 * /api/auth/reset-password
 *
 * Body:
 *
 * {
 *   "token": "...",
 *   "password": "..."
 * }
 *
 * =========================================================
 */

app.post(
  "/api/auth/reset-password",

  async (req, res) => {

    try {

      const {
        token,
        password
      } = req.body;


      /*
       * Validar token.
       */

      if (
        typeof token !== "string" ||
        !token.trim()
      ) {

        return res.status(400).json({

          success: false,

          message:
            "El token es obligatorio.",

        });

      }


      /*
       * Validar contraseña.
       */

      if (
        typeof password !== "string" ||
        !password.trim()
      ) {

        return res.status(400).json({

          success: false,

          message:
            "La nueva contraseña es obligatoria.",

        });

      }


      /*
       * Validar longitud mínima.
       */

      if (
        password.length < 8
      ) {

        return res.status(400).json({

          success: false,

          message:
            "La contraseña debe tener al menos 8 caracteres.",

        });

      }


      /*
       * Restablecer contraseña.
       */

      await resetPassword(
        token,
        password
      );


      /*
       * Operación exitosa.
       */

      return res.json({

        success: true,

        message:
          "La contraseña se actualizó correctamente.",

      });


    } catch (error) {

      console.error(
        "Error restableciendo contraseña:",
        error
      );


      /*
       * Token inexistente.
       */

      if (
        error instanceof Error &&
        error.message === "TOKEN_INVALID"
      ) {

        return res.status(400).json({

          success: false,

          message:
            "El enlace de recuperación no es válido.",

        });

      }


      /*
       * Token ya utilizado.
       */

      if (
        error instanceof Error &&
        error.message === "TOKEN_USED"
      ) {

        return res.status(400).json({

          success: false,

          message:
            "El enlace de recuperación ya fue utilizado.",

        });

      }


      /*
       * Token expirado.
       */

      if (
        error instanceof Error &&
        error.message === "TOKEN_EXPIRED"
      ) {

        return res.status(400).json({

          success: false,

          message:
            "El enlace de recuperación ha expirado.",

        });

      }


      /*
       * Usuario asociado al token
       * no encontrado.
       */

      if (
        error instanceof Error &&
        error.message === "USER_NOT_FOUND"
      ) {

        return res.status(400).json({

          success: false,

          message:
            "No fue posible completar la recuperación.",

        });

      }


      /*
       * Error inesperado.
       */

      return res.status(500).json({

        success: false,

        message:
          "No fue posible actualizar la contraseña.",

      });

    }

  }
);


/*
 * =========================================================
 * INICIAR SERVIDOR
 * =========================================================
 */

app.listen(

  env.port,

  () => {

    console.log(
      `API ejecutándose en http://localhost:${env.port}`
    );

  }

);