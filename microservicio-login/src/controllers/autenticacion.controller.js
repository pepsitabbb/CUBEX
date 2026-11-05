import { z } from 'zod';
import { autenticar, registrar } from '../services/autenticacion.service.js';
import { variables } from '../config/entorno.js';

const esquemaCredenciales = z.object({
  nombreUsuario: z
    .string({ error: 'El nombre de usuario es obligatorio' })
    .trim()
    .min(3, 'El nombre de usuario debe tener al menos 3 caracteres')
    .max(60, 'El nombre de usuario no puede superar 60 caracteres'),
  contrasena: z
    .string({ error: 'La contrasena es obligatoria' })
    .min(1, 'La contrasena es obligatoria')
    .max(200, 'La contrasena no puede superar 200 caracteres')
});

const esquemaRegistro = z.object({
  nombreUsuario: z
    .string({ error: 'El nombre de usuario es obligatorio' })
    .trim()
    .min(3, 'El nombre de usuario debe tener al menos 3 caracteres')
    .max(60, 'El nombre de usuario no puede superar 60 caracteres'),
  contrasena: z
    .string({ error: 'La contrasena es obligatoria' })
    .min(8, 'La contrasena debe tener al menos 8 caracteres')
    .max(200, 'La contrasena no puede superar 200 caracteres'),
  email: z
    .string({ error: 'El email debe ser una cadena de texto' })
    .trim()
    .email('El email no tiene un formato valido')
    .max(120, 'El email no puede superar 120 caracteres')
    .optional()
    .or(z.literal(''))
    .transform((valor) => valor || undefined),
  nombreCompleto: z
    .string({ error: 'El nombre completo debe ser una cadena de texto' })
    .trim()
    .min(2, 'El nombre completo debe tener al menos 2 caracteres')
    .max(150, 'El nombre completo no puede superar 150 caracteres')
    .optional()
    .or(z.literal(''))
    .transform((valor) => valor || undefined)
});

export async function iniciarSesion(req, res) {
  const credenciales = esquemaCredenciales.parse({
    nombreUsuario: req.body?.nombreUsuario,
    contrasena: req.body?.contrasena
  });

  const resultado = await autenticar(credenciales);

  res.status(200).json({
    exito: true,
    operacion: 'AUTENTICAR_USUARIO',
    mensaje: 'Autenticacion exitosa',
    datos: resultado
  });
}

export async function registrarUsuario(req, res) {
  const datos = esquemaRegistro.parse({
    nombreUsuario: req.body?.nombreUsuario,
    contrasena: req.body?.contrasena,
    email: req.body?.email ?? undefined,
    nombreCompleto: req.body?.nombreCompleto ?? undefined
  });

  const resultado = await registrar(datos);

  res.status(201).json({
    exito: true,
    operacion: 'REGISTRAR_USUARIO',
    mensaje: 'Cuenta creada correctamente',
    datos: resultado
  });
}

export function verificarToken(req, res) {
  res.status(200).json({
    exito: true,
    operacion: 'VERIFICAR_TOKEN',
    mensaje: 'Token valido',
    datos: {
      autenticado: true,
      idUsuario: Number(req.usuario.sub),
      nombreUsuario: req.usuario.nombreUsuario,
      rol: req.usuario.rol,
      email: req.usuario.email ?? null
    }
  });
}

export function consultarPerfil(req, res) {
  res.status(200).json({
    exito: true,
    operacion: 'CONSULTAR_PERFIL',
    mensaje: 'Perfil obtenido correctamente',
    datos: {
      idUsuario: Number(req.usuario.sub),
      nombreUsuario: req.usuario.nombreUsuario,
      rol: req.usuario.rol,
      email: req.usuario.email ?? null
    }
  });
}

export function estadoServicio(req, res) {
  res.status(200).json({
    exito: true,
    operacion: 'ESTADO_SERVICIO',
    mensaje: 'Microservicio de login operativo',
    datos: {
      servicio: 'microservicio-login',
      version: '1.0.0',
      entorno: variables.NODE_ENV,
      hora: new Date().toISOString()
    }
  });
}
