# Documentación técnica

Cómo instalar, operar y mantener el microservicio de login.

Para **usar** el servicio consulta el [`README.md`](../README.md), que documenta el contrato de la
API para el equipo de frontend.

---

## 1. Operación: Autenticar usuario

| Concepto           | Detalle                                                                 |
| ------------------ | ------------------------------------------------------------------------ |
| **Entrada**        | Nombre de usuario y contraseña                                          |
| **Salida**         | Resultado de la autenticación, mensaje de respuesta, rol, identificador |
| **Salida adicional** | Token JWT, para que el resto de microservicios valide la sesión       |
| **Protocolo**      | JSON sobre HTTPS                                                        |
| **Almacenamiento**  | MySQL, accesible solo a través de la capa de repositorio                |

### Flujo de procesamiento

1. Se valida el formato de las credenciales recibidas (422 si el JSON no cumple el esquema).
2. Se busca el usuario por nombre con una consulta parametrizada, sin inyección SQL.
3. Se compara la contraseña contra el hash **bcrypt**. Cuando el usuario no existe se ejecuta
   igualmente una comparación bcrypt contra un hash señuelo, para que el tiempo de respuesta sea
   el mismo y no se pueda deducir qué nombres de usuario existen.
4. Se comprueban el estado de la cuenta: `activo` y `bloqueado_hasta`.
5. Si todo es correcto se firma un **JWT** con identificador y rol, y se registra el acceso.
6. Se responde con el resultado, el mensaje, el rol y el identificador.

### Diagrama de decisiones

```
petición
   │
   ├─ JSON inválido ─────────────────────► 400  JSON_MAL_FORMADO
   ├─ faltan campos / formato incorrecto ─► 422  DATOS_INVALIDOS
   │
   ▼
usuario encontrado en MySQL
   │
   ├─ no ──► 401 CREDENCIALES_INVALIDAS
   │
   ├─ bloqueado_hasta > ahora ────────────► 423 USUARIO_BLOQUEADO
   ├─ activo = 0 ────────────────────────► 403 USUARIO_INACTIVO
   │
   ▼
bcrypt.compare(contraseña, hash)
   │
   ├─ no ──► intentos_fallidos++ ──► 401 CREDENCIALES_INVALIDAS
   │          (al llegar a 5 se fija bloqueado_hasta = ahora + 15 min)
   │
   └─ sí ─► registrar acceso ──► firmar JWT ──► 200 { rol, idUsuario, token }
```

---

## 1b. Operación: Registrar una cuenta

Endpoint público `POST /api/v1/auth/registro` para usuarios sin cuenta.

| Concepto           | Detalle                                                            |
| ------------------ | ------------------------------------------------------------------ |
| **Entrada**        | Nombre de usuario, contraseña y opcionalmente email y nombre completo |
| **Salida**         | La misma forma que el login: cuenta creada **y** sesión iniciada (token JWT) |
| **Rol asignado**   | `CLIENTE`, siempre. Solo un script o un ADMIN podrán dar otros roles |

### Flujo de procesamiento

1. Se valida el formato con el esquema Zod: la contraseña debe tener al menos 8 caracteres y el
   email, si llega, debe ser un correo válido (422 si no cumple).
2. Se comprueba que el nombre de usuario no exista (409 `USUARIO_YA_EXISTE`).
3. Se cifra la contraseña con **bcrypt** y se inserta el usuario con el rol `CLIENTE`.
4. Si la base rechaza el insert por un índice único (nombre o email duplicado), se traduce a 409.
5. Se vuelve a leer el usuario y se reutiliza `abrirSesion()` (el mismo del login) para firmar el
   JWT. El frontend guarda el token igual que tras un login normal.

La respuesta 201 tiene exactamente el mismo `datos` que el login: `autenticado`, `rol`, `token`,
`expiraEn`, etc.

---

## 2. Estructura del proyecto

```
microservicio-login/
├── src/
│   ├── server.js                             arranque HTTP/HTTPS, apagado ordenado
│   ├── app.js                                configuración de Express
│   ├── config/
│   │   ├── entorno.js                        lectura y validación de .env con Zod
│   │   └── baseDatos.js                      pool de conexiones MySQL
│   ├── routes/index.js                       definición de endpoints
│   ├── controllers/autenticacion.controller.js  validación de entrada y respuesta HTTP
│   ├── services/autenticacion.service.js     reglas de negocio
│   ├── repositories/usuarios.repository.js   acceso a datos (única capa que habla SQL)
│   ├── middlewares/
│   │   ├── autenticacion.js                  validación del token y del rol
│   │   ├── controlAsincrono.js              (propaga errores de promesas)
│   │   └── errores.js                        formato uniforme de errores
│   └── utils/
│       ├── jwt.js  passwords.js  logger.js  errores.js
├── database/
│   └── esquema.sql                           tablas usuarios y roles
├── scripts/
│   ├── crear-usuario-app.js                  crea el usuario de MySQL desde .env (como root)
│   ├── crear-esquema.js                      aplica el esquema
│   └── crear-usuarios.js                     crea usuarios de prueba
├── tests/
│   ├── setup.js
│   ├── unitario.test.js                      19 pruebas sin base de datos
│   └── integracion.test.js                   11 pruebas contra MySQL
├── docs/tecico.md                            este documento
└── .env.example
```

La separación en **controller → service → repository** es lo que permite cambiar MySQL por otro
motor sin tocar la lógica de autenticación, como pide el enunciado. Solo
`repositories/usuarios.repository.js` contiene SQL.

---

## 3. Instalación

### Requisitos

- Node.js 20 o superior
- MySQL 8 o superior

### Pasos

```bash
npm install
copy .env.example .env      # Windows
# cp .env.example .env      # Linux/Mac
```

Variables que hay que ajustar en `.env`:

| Variable          | Descripción                                              |
| ----------------- | -------------------------------------------------------- |
| `DB_USER`         | Usuario de MySQL de la aplicación                        |
| `DB_PASSWORD`     | Contraseña de ese usuario                                |
| `DB_NAME`         | Nombre de la base de datos (`ventas_db`)                 |
| `JWT_SECRET`      | Clave de firma, mínimo 32 caracteres                     |
| `JWT_EXPIRES_IN`  | Vigencia del token, por ejemplo `15m`                    |
| `HTTPS_ENABLED`   | `false` en desarrollo, `true` con certificado            |

El proceso se detiene al arrancar si falta alguna obligatoria o si `JWT_SECRET` es demasiado
corta, con un mensaje que indica qué campo corregir.

### Crear el usuario de MySQL

Es preferible crear un usuario exclusivo para el microservicio en lugar de usar `root`. El script
lee `DB_USER` y `DB_PASSWORD` del `.env` y crea (o actualiza) la cuenta y la base de datos. Como
necesita permisos de administrador, primero define en `.env` las credenciales con las que te
conectas a MySQL como root:

```bash
# en .env
DB_ROOT_USER=root
DB_ROOT_PASSWORD=tu_clave_root
```

```bash
npm run db:usuario-app   # crea la base y el usuario de la aplicación
```

> **Sin claves en el repositorio:** el password del usuario de la aplicación solo existe en tu
> `.env` local, que está en `.gitignore`. El `.env.example` y el propio script usan variables, no
> valores escritos.

### Crear tablas y usuarios de prueba

```bash
npm run db:schema        # crea la base, las tablas y el catálogo de roles
npm run db:usuarios      # crea admin, vendedor, cliente y un usuario inactivo
npm run db:reset         # borra y reconstruye todo desde cero
```

> El orden recomendado es `db:usuario-app` → `db:schema` → `db:usuarios`, porque el esquema ya se
> conecta como el usuario de la aplicación.

### Arrancar

```bash
npm start      # producción
npm run dev    # desarrollo, con recarga automática
```

Salida esperada:

```
Microservicio de login escuchando en http://localhost:3000/api/v1
Entorno: development
Conexion con MySQL "ventas_db" establecida (2 ms).
```

Si MySQL no responde el servicio **arranca igual** y lo reporta en el log, para que un fallo de
base de datos no lo imponga reiniciar el contenedor. Las peticiones que sí requieren base de datos
responden 503.

---

## 4. Modelo de datos

**roles**: `id`, `nombre` (único), `descripcion`, `creado_en`.
Valores iniciales: `ADMIN`, `CLIENTE`, `VENDEDOR`.

**usuarios**: `id`, `nombre_usuario` (único), `password_hash`, `email`, `nombre_completo`,
`rol_id` (FK → roles), `activo`, `intentos_fallidos`, `bloqueado_hasta`, `ultimo_acceso`,
`creado_en`, `actualizado_en`.

La contraseña **nunca** se almacena en texto plano: se guarda únicamente el hash bcrypt.

---

## 5. Usuarios de prueba

| Usuario    | Contraseña     | Rol      | Estado                     |
| ---------- | -------------- | -------- | -------------------------- |
| `admin`    | `ClaveDemo123` | ADMIN    | Activo                     |
| `vendedor` | `ClaveDemo123` | VENDEDOR | Activo                     |
| `cliente`  | `ClaveDemo123` | CLIENTE  | Activo                     |
| `inactivo` | `ClaveDemo123` | CLIENTE  | Deshabilitado (responde 403)|

La contraseña es la de `USUARIOS_DEMO_PASSWORD` en `.env`.

---

## 6. Pruebas

```bash
npm test
```

- `tests/unitario.test.js` — 19 pruebas de rutas, validación de entrada, JWT, bcrypt y control de
  roles. No necesitan base de datos.
- `tests/integracion.test.js` — 11 pruebas del flujo real contra MySQL: login exitoso, contraseña
  incorrecta, usuario inexistente, usuario inactivo, cuenta bloqueada, bloqueo tras 5 intentos,
  reinicio del contador, no exposición del hash y tres casos del registro (creación con
  auto-login, nombre duplicado y email duplicado). **Se omiten automáticamente** si MySQL no está
  accesible, de modo que la suite sigue siendo ejecutable sin base de datos.

Resultado actual: **30 pruebas, 30 correctas, 0 fallos**.

### Detalle de dos casos que la suite ya cubre

Ambos fueron defectos reales detectados por estas pruebas, y ambos se corrigen en el código:

- **Zona horaria.** MySQL corre en hora local y `NOW()` devolvía la hora del servidor, que la
  aplicación interpretaba como UTC por la configuración `timezone: 'Z'` del pool. Eso dejaba
  `bloqueado_hasta` con 7 horas en el pasado y la cuenta nunca se bloqueaba. Se corrige con
  `SET time_zone = '+00:00'` en cada conexión del pool (`src/config/baseDatos.js`).
- **Bloqueo en el intento equivocado.** MySQL evalúa de izquierda a derecha las asignaciones de un
  `UPDATE`, así que la condición del `IF` ya veía `intentos_fallidos` incrementado y la cuenta se
  bloqueaba en el cuarto intento en lugar del quinto. Se resolvió separando el incremento del
  contador y la aplicación del bloqueo en dos sentencias (`src/repositories/usuarios.repository.js`).

---

## 7. Seguridad aplicada

| Medida                    | Dónde                                                       |
| ------------------------- | ----------------------------------------------------------- |
| Contraseñas con **bcrypt** | `utils/passwords.js`, coste configurable                     |
| **JWT** firmado y con expiración | `utils/jwt.js`                                         |
| Consultas **parametrizadas** | `repositories/usuarios.repository.js`                    |
| **Helmet** y CORS restringido | `app.js`                                                |
| **Limit de intentos** por IP | `routes/index.js`                                        |
| **Bloqueo temporal** tras 5 fallos | `services/autenticacion.service.js`                 |
| Cuentas y emails **únicos** (índice en MySQL) | `database/esquema.sql` y traducción a 409 en `services/autenticacion.service.js` |
| Respuesta ambigua ante usuario inexistente | `services/autenticacion.service.js`             |
| El hash nunca sale en las respuestas | `services/autenticacion.service.js`               |
| Revocación inmediata de tokens | No implementada, ver limitaciones                        |

### Limitaciones conocidas

- **El token no se puede revocar.** No hay logout ni lista de tokens invalidados; un token robado
  sirve hasta que expira (15 minutos). Se resolvería con refresh tokens o una lista de revocación
  en Redis.
- **El límite por IP es por proceso**, en memoria. Con varias instancias del microservicio cada
  una cuenta por separado. El bloqueo tras 5 intentos no tiene ese problema porque vive en MySQL.
- **HTTPS está desactivado en desarrollo** y hay que aportar el certificado en producción.

---

## 8. HTTPS

En desarrollo se puede servir por HTTP. Para HTTPS con un certificado autofirmado:

```bash
mkdir certs
openssl req -x509 -newkey rsa:2048 -nodes -keyout certs/server.key -out certs/server.crt -days 365
```

Y en `.env`:

```
HTTPS_ENABLED=true
HTTPS_KEY_PATH=./certs/server.key
HTTPS_CERT_PATH=./certs/server.crt
```

En producción lo habitual es terminar TLS en un balanceador o proxy inverso y dejar
`HTTPS_ENABLED=false` en la aplicación.
