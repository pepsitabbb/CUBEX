# Microservicio de Login

Servicio que autentica a los usuarios del sistema de venta online. Recibe nombre de usuario y
contraseña, verifica las credenciales contra MySQL y devuelve si el usuario puede acceder, su
**rol** y su **identificador**, junto con un token de sesión.

**Contrato:** JSON sobre HTTP/HTTPS. Prefijo de rutas: `/api/v1`.

---

## Formato de las respuestas

**Todas las respuestas usan la misma envoltura**, sea éxito o error:

```json
{ "exito": true,  "operacion": "...", "mensaje": "...", "datos": { } }
{ "exito": false, "codigo": "...",    "mensaje": "...", "marcaTiempo": "..." }
```

En errores, `codigo` es un valor estable que puedes usar para decidir qué hacer; `mensaje` es
texto para mostrar al usuario final. **No parses `mensaje`**, cambia según el caso.

---

## 1. Autenticar usuario  `POST /api/v1/auth/login`

Único endpoint necesario para el flujo de login.

**Petición**

```json
{
  "nombreUsuario": "cliente",
  "contrasena": "ClaveDemo123"
}
```

| Campo           | Tipo   | Obligatorio | Notas                            |
| --------------- | ------ | ----------- | -------------------------------- |
| `nombreUsuario` | string | Sí          | 3 a 60 caracteres                |
| `contrasena`    | string | Sí          | Máximo 200 caracteres            |

**Respuesta 200 — autenticación exitosa**

```json
{
  "exito": true,
  "operacion": "AUTENTICAR_USUARIO",
  "mensaje": "Autenticacion exitosa",
  "datos": {
    "autenticado": true,
    "idUsuario": 3,
    "nombreUsuario": "cliente",
    "email": "cliente@ventasonline.com",
    "nombreCompleto": "Cliente de Prueba",
    "rol": "CLIENTE",
    "ultimoAcceso": "2026-09-27T23:33:38.000Z",
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "tipoToken": "Bearer",
    "expiraEn": 900,
    "expiraEnTexto": "15m"
  }
}
```

| Campo             | Tipo   | Para qué sirve                                              |
| ----------------- | ------ | ----------------------------------------------------------- |
| `autenticado`     | bool   | Siempre `true` si llegaste aquí: la autenticación fue exitosa |
| `idUsuario`       | number | Identificador del usuario — **úsalo para pedir sus datos a otros microservicios** |
| `nombreUsuario`   | string | Nombre de usuario autenticado                                 |
| `email`           | string \| null | Correo registrado                                    |
| `nombreCompleto`  | string \| null | Nombre para mostrar en la interfaz                     |
| `rol`             | string | `ADMIN`, `VENDEDOR` o `CLIENTE` — **úsalo para construir la navegación** |
| `ultimoAcceso`    | string \| null | Fecha ISO del acceso anterior                         |
| `token`           | string | Token de sesión — guárdalo para las siguientes peticiones     |
| `tipoToken`       | string | Siempre `Bearer`                                              |
| `expiraEn`        | number | Segundos de validez (900 = 15 minutos)                       |
| `expiraEnTexto`   | string | Vigencia en texto legible (`15m`)                             |

**El `token` nunca contiene la contraseña ni su hash.**

### Códigos de error

Úsalos para decidir el mensaje y la acción en tu interfaz:

| HTTP | `codigo`                   | Qué ocurrió                          | Qué hacer en el frontend                  |
| ---- | -------------------------- | ------------------------------------ | ----------------------------------------- |
| 400  | `JSON_MAL_FORMADO`         | El cuerpo no es JSON válido          | Revisa que envíes JSON, no texto          |
| 401  | `CREDENCIALES_INVALIDAS`   | Usuario no existe **o** contraseña incorrecta | Muestra "usuario o contraseña incorrectos" |
| 401  | `TOKEN_INVALIDO`           | Falta el token, expiró o es inválido | Cierra sesión y vuelve al login            |
| 403  | `USUARIO_INACTIVO`         | La cuenta está deshabilitada         | Contacta al administrador                 |
| 403  | `ACCESO_DENEGADO`          | El rol no tiene permiso              | Oculta la opción del menú                 |
| 409  | `USUARIO_YA_EXISTE`        | El nombre de usuario o el email ya está en uso | Muestra "ya existe una cuenta con esos datos" |
| 422  | `DATOS_INVALIDOS`          | Faltan campos o el formato no cumple | Revisa el formulario; `detalles` dice cuál |
| 423  | `USUARIO_BLOQUEADO`        | 5 intentos fallidos seguidos         | Muestra que espere unos minutos           |
| 429  | `LIMITE_INTENTOS`          | Demasiados intentos desde esa IP     | Pide esperar unos minutos                 |
| 503  | `BASE_DATOS_NO_DISPONIBLE` | MySQL no responde                    | Muestra "servicio no disponible"           |

Cuando el error es `422` o `ACCESO_DENEGADO` hay un campo `detalles` con el detalle campo por campo:

```json
{
  "exito": false,
  "codigo": "DATOS_INVALIDOS",
  "mensaje": "Los datos enviados no cumplen el formato requerido",
  "detalles": [
    { "campo": "contrasena", "problema": "La contrasena es obligatoria" },
    { "campo": "nombreUsuario", "problema": "El nombre de usuario debe tener al menos 3 caracteres" }
  ]
}
```

> **401 `CREDENCIALES_INVALIDAS` es intencionalmente ambiguo.** El servicio responde igual si el
> usuario no existe o si la contraseña falla, para no revelar qué cuentas están dadas de alta.
> Muestra siempre el mismo mensaje.

---

## 2. Crear una cuenta  `POST /api/v1/auth/registro`

Endpoint público para que un usuario sin cuenta se registre. La cuenta se crea con el rol
`CLIENTE` y la respuesta **ya incluye el token**, de modo que no hace falta volver al login.

**Petición**

```json
{
  "nombreUsuario": "juan",
  "contrasena": "ClaveSegura123",
  "email": "juan@correo.com",
  "nombreCompleto": "Juan Perez"
}
```

| Campo           | Tipo   | Obligatorio | Notas                                      |
| --------------- | ------ | ----------- | ------------------------------------------ |
| `nombreUsuario` | string | Sí          | 3 a 60 caracteres, único                   |
| `contrasena`    | string | Sí          | 8 a 200 caracteres                         |
| `email`         | string | No          | Formato válido, único. Vacío = se ignora   |
| `nombreCompleto`| string | No          | 2 a 150 caracteres. Vacío = se ignora      |

**Respuesta 201 — cuenta creada (auto-login)**

```json
{
  "exito": true,
  "operacion": "REGISTRAR_USUARIO",
  "mensaje": "Cuenta creada correctamente",
  "datos": {
    "autenticado": true,
    "idUsuario": 42,
    "nombreUsuario": "juan",
    "email": "juan@correo.com",
    "nombreCompleto": "Juan Perez",
    "rol": "CLIENTE",
    "ultimoAcceso": null,
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "tipoToken": "Bearer",
    "expiraEn": 900,
    "expiraEnTexto": "15m"
  }
}
```

`datos` tiene exactamente la misma forma que la respuesta del login, así que el frontend puede
usar el mismo código para guardar la sesión tras registrarse o tras autenticarse.

Códigos de error específicos:

| HTTP | `codigo`           | Qué ocurrió                       | Qué hacer en el frontend              |
| ---- | ------------------ | --------------------------------- | ------------------------------------- |
| 409  | `USUARIO_YA_EXISTE`| El nombre de usuario o el email ya está registrado | Muestra "ya existe una cuenta con esos datos" |
| 422  | `DATOS_INVALIDOS`  | Faltan campos o el formato no cumple | Revisa el formulario; `detalles` dice cuál |

---

## 3. Verificar que la sesión sigue vigente

`GET /api/v1/auth/verificar` — requiere el token.

Úsalo **al cargar la aplicación** para saber si el usuario que guardó en tu sesión local sigue
autenticado, en vez de esperar a que una petición protegida falle.

```js
const respuesta = await fetch(`${BASE_URL}/api/v1/auth/verificar`, {
  headers: { Authorization: `Bearer ${tokenGuardado}` }
});

if (respuesta.status === 401) redirigirAlLogin();
```

**Respuesta 200**

```json
{
  "exito": true,
  "operacion": "VERIFICAR_TOKEN",
  "mensaje": "Token valido",
  "datos": {
    "autenticado": true,
    "idUsuario": 3,
    "nombreUsuario": "cliente",
    "rol": "CLIENTE",
    "email": "cliente@ventasonline.com"
  }
}
```

## 4. Otros endpoints

| Método | Ruta                       | Para qué sirve                                |
| ------ | -------------------------- | --------------------------------------------- |
| `GET`  | `/api/v1/auth/perfil`      | Datos del usuario del token                   |
| `GET`  | `/api/v1/estado`           | El servicio está vivo (no toca la base)       |
| `GET`  | `/api/v1/salud`            | El servicio **y MySQL** están disponibles    |

---

## Cómo enviar el token

El token viaja en la cabecera `Authorization`. **Envíalo en cada petición a los demás
microservicios** (catálogo, carrito, pedidos), no solo a este servicio.

```js
const respuesta = await fetch(`${BASE_URL}/api/v1/auth/login`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ nombreUsuario, contrasena })
});

const cuerpo = await respuesta.json();

if (!respuesta.ok) {
  throw new Error(cuerpo.mensaje);
}

localStorage.setItem('token', cuerpo.datos.token);

// Peticiones siguientes:
fetch(`${otraUrl}/api/pedidos`, {
  headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
});
```

Con `curl`:

```bash
curl -X POST http://localhost:3000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"nombreUsuario":"cliente","contrasena":"ClaveDemo123"}'
```

---

## Probar la API desde el navegador

El archivo [`prueba-api.html`](prueba-api.html) es un cliente web para probar todos los
endpoints sin instalar nada más. Requiere solo el servidor corriendo.

**Pasos**

1. Arranca el servicio:

   ```bash
   npm start
   ```

2. Abre `prueba-api.html` con doble clic en el Explorador de Windows (o `start prueba-api.html`).
   Funciona desde `file://` porque CORS está abierto en desarrollo.

3. La URL base viene configurada como `http://localhost:3000`. Si usas otro puerto, cámbiala en
   el campo superior.

**Qué permite probar**

| Sección        | Endpoints                                                        |
| -------------- | ---------------------------------------------------------------- |
| Sin autenticación | `GET /`, `GET /api/v1/estado`, `GET /api/v1/salud`            |
| Registro       | `POST /api/v1/auth/registro`                                     |
| Login          | `POST /api/v1/auth/login` (botones para los usuarios demo)       |
| Con token      | `GET /api/v1/auth/verificar`, `GET /api/v1/auth/perfil`, `GET /api/v1/auth/admin/panel`, y un 404 de prueba |

**Funciones incluidas**

- El login y el registro guardan el `token` automáticamente y rellenan el campo `Authorization`.
- Decodificador del JWT: muestra el payload (usuario, rol) y si el token sigue vigente.
- Respuesta formateada con código HTTP, tiempo de respuesta e historial de peticiones
  (haz clic en una entrada del historial para volver a verla).

**Usuarios demo** (se crean con `npm run db:usuarios`, contraseña `ClaveDemo123`):

| Usuario     | Rol       | Para probar                          |
| ----------- | --------- | ------------------------------------ |
| `admin`     | `ADMIN`   | `GET /api/v1/auth/admin/panel`       |
| `vendedor`  | `VENDEDOR`| Acceso normal con rol vendedor       |
| `cliente`   | `CLIENTE` | Login y perfil                       |
| `inactivo`  | `CLIENTE` | Error `403 USUARIO_INACTIVO`         |

> `GET /api/v1/salud`, login y registro necesitan MySQL activo; `/`, `/api/v1/estado` y el 404
> funcionan sin base de datos.

---

## Notas para el frontend

- **El token expira a los 15 minutos** (`expiraEn: 900`). Cuando el backend responda `401
  TOKEN_INVALIDO` significa que expiró: limpia la sesión local y vuelve al login. No hay refresh
  token ni forma de renovar la sesión sin volver a autenticarse.
- **No hay endpoint de cierre de sesión.** El token es válido hasta que expira. Para expulsar al
  usuario de inmediato hay que deshabilitar su cuenta.
- **CORS está abierto** a cualquier origen durante el desarrollo. En producción se restringe con
  la variable `CORS_ORIGIN`.
- **Un 503 con `BASE_DATOS_NO_DISPONIBLE` no es culpa del usuario.** Muestra un mensaje de
  indisponibilidad y no pidas la contraseña de nuevo.
- Si necesitas el identificador del usuario para pedirle datos, usa `idUsuario` del login. **Nunca
  lo tomes de la URL ni de datos que envíe el navegador.**

---

## Roles disponibles

| Rol       | Puede                                                        |
| --------- | ------------------------------------------------------------ |
| `ADMIN`   | Control total del sistema                                    |
| `VENDEDOR` | Gestionar productos y pedidos                                 |
| `CLIENTE` | Navegar el catálogo, crear carritos y comprar                 |

El control real de permisos lo aplica cada microservicio leyendo el `rol` del token. Aquí solo se
puede probar un ejemplo en `GET /api/v1/auth/admin/panel`, restringido a `ADMIN`.

---

## Contacto

Backend: responsable del microservicio de login.
Detalle de instalación, arquitectura y pruebas: [`docs/tecico.md`](docs/tecico.md).
