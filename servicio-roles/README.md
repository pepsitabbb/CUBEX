# Servicio de verificación de roles y tipos de usuario

Usa únicamente las tablas ROLES, USUARIOS, CLIENTES y TOKENS_RECUPERACION
de la base de datos compartida por el grupo (Tablas_y_campos.docx).

## Puesta en marcha
1. `mysql -u root -p < schema.sql`  (omítelo si ya tienes la BD del grupo; solo inserta los roles)
2. `cp .env.example .env` y ajusta credenciales y JWT_SECRET
3. `npm install`
4. `npm start`

## Crear un admin de prueba
node -e "console.log(require('bcryptjs').hashSync('admin123',10))"
INSERT INTO USUARIOS (nombre,correo,password_hash,id_rol)
VALUES ('Admin','admin@tienda.com','<hash>',(SELECT id FROM ROLES WHERE nombre_rol='admin'));

## Endpoints
| Método | Ruta | Acceso | Descripción |
|---|---|---|---|
| POST | /auth/login | público | Devuelve JWT con el rol; bloquea tras MAX_INTENTOS fallos |
| POST | /auth/verify | token | Valida token, estado y rol; indica si es cliente |
| GET | /roles/check?rol=admin,empleado | token | 200 si tiene alguno de esos roles, 403 si no |
| GET | /roles | admin | Lista roles |
| GET | /usuarios/:id/rol | admin o el mismo usuario | Consulta el rol |
| PUT | /usuarios/:id/rol | admin | Cambia el rol `{ "nombre_rol": "empleado" }` |
| POST | /usuarios/:id/desbloquear | admin | Estado activo e intentos en 0 |

## Uso desde otros servicios
Reenviar el header `Authorization: Bearer <token>` a `POST /auth/verify`
o `GET /roles/check?rol=...` y actuar según el código 200/403.
