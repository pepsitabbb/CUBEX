# API de Verificación de Usuario

API desarrollada para verificar que una solicitud proviene de un usuario válido y no de un bot automatizado.

La API genera un token temporal de verificación y permite comprobar posteriormente si dicho token es válido. La comunicación se realiza mediante solicitudes HTTP utilizando datos en formato JSON.

---

## 📌 Objetivo

El objetivo de esta API es proporcionar un servicio de verificación que pueda ser integrado en otros sistemas web.

El flujo general es:

1. El sistema solicita un token de verificación.
2. La API genera un token temporal.
3. El sistema recibe el token.
4. El token es enviado nuevamente para su validación.
5. La API verifica que el token sea válido.
6. Si la validación es correcta, devuelve una respuesta indicando que el usuario fue verificado.

La validación ocurre en el servidor, por lo que el usuario final no necesita conocer ni manipular directamente la lógica interna de generación y validación del token.

---

## 🛠️ Tecnologías utilizadas

* **Node.js**
* **Express.js**
* **JavaScript**
* **Crypto** — generación y manejo seguro de tokens.
* **Express Rate Limit** — limitación de solicitudes.
* **JSON** — formato utilizado para el intercambio de información.
* **HTTP/HTTPS** — protocolo de comunicación.
* **Postman** — utilizado para realizar pruebas de la API.

---

## 📋 Requisitos previos

Antes de ejecutar la API es necesario tener instalado:

* Node.js
* npm
* Postman (opcional, recomendado para realizar pruebas)

Puedes comprobar que Node.js y npm estén instalados ejecutando:

```bash
node -v
npm -v
```

---

## 📥 Instalación

### 1. Clonar o descargar el proyecto

Descarga el proyecto y abre una terminal dentro de la carpeta:

```bash
cd verificacion-bot
```

### 2. Instalar las dependencias

Ejecuta:

```bash
npm install
```

Las principales dependencias utilizadas por el proyecto son:

```bash
npm install express
npm install express-rate-limit
```

---

## ▶️ Ejecutar la API

Para iniciar el servidor ejecuta:

```bash
node server.js
```

Si todo funciona correctamente, aparecerá un mensaje similar a:

```text
API de verificación corriendo en puerto 3000
```

La API estará disponible localmente en:

```text
http://localhost:3000
```

---

# 🔐 Funcionamiento de la API

La API utiliza un sistema basado en tokens.

El token funciona como una prueba temporal que permite comprobar que la solicitud que llega al servidor corresponde a un proceso de verificación válido.

El proceso se divide principalmente en dos etapas:

### 1. Generación del token

El sistema realiza una solicitud a la API para obtener un token.

La API genera un token temporal utilizando mecanismos criptográficos.

### 2. Verificación del token

El token generado se envía posteriormente al endpoint de verificación.

La API comprueba:

* Que el token tenga un formato válido.
* Que el token corresponda a una verificación generada por el servidor.
* Que no haya expirado.
* Que la información recibida sea válida.

Si todas las comprobaciones son correctas, la API confirma la verificación.

---

# 🌐 Endpoints

## Generar desafío de verificación

```http
POST /api/verify/challenge
```

Este endpoint permite solicitar un nuevo desafío/token de verificación.

### Ejemplo

```http
POST http://localhost:3000/api/verify/challenge
```

### Respuesta

La API devuelve la información necesaria para continuar con el proceso de verificación.

> El token generado debe ser utilizado posteriormente para realizar la validación.

---

## Verificar usuario

```http
POST /api/verify
```

Este endpoint recibe los datos necesarios para comprobar el token generado anteriormente.

### Ejemplo de solicitud

```json
{
  "token": "TOKEN_GENERADO",
  "validationData": "DATOS_DE_VALIDACION",
  "sessionId": "ID_DE_SESION"
}
```

Los valores anteriores son ejemplos. Los datos deben ser reemplazados por los valores correspondientes generados durante el proceso de integración.

### Respuesta exitosa

```json
{
  "verificado": true,
  "mensaje": "Usuario verificado correctamente"
}
```

---

# ❌ Respuestas de error

Si la información proporcionada no es válida, la API puede devolver una respuesta indicando que la verificación no fue exitosa.

Por ejemplo:

```json
{
  "verificado": false,
  "mensaje": "Usuario no verificado"
}
```

También pueden generarse errores cuando:

* El token no existe.
* El token es incorrecto.
* El token ha expirado.
* Faltan datos requeridos.
* Se excede el límite de solicitudes permitido.

---

# 🚦 Límite de solicitudes

La API utiliza **Express Rate Limit** para controlar la cantidad de solicitudes realizadas.

Actualmente se utiliza un límite de solicitudes dentro de un período de **5 minutos**.

Esto ayuda a evitar que un usuario o proceso automatizado realice una cantidad excesiva de solicitudes en poco tiempo.

El límite puede modificarse posteriormente desde la configuración del servidor.

---

# 🔒 Seguridad

La API utiliza diferentes mecanismos para proteger el proceso de verificación.

### Token temporal

Los tokens no deben considerarse información permanente. Su función es permitir una verificación durante un período determinado.

### Secreto del servidor

La API utiliza una clave secreta para realizar operaciones relacionadas con la generación y validación de los tokens.

Se recomienda almacenar esta información mediante variables de entorno y no escribir claves sensibles directamente en el código.

Ejemplo:

```text
HUMAN_CHECK_SECRET=tu_clave_secreta
```

### HTTPS

En un entorno de producción se recomienda utilizar:

```text
HTTPS
```

en lugar de:

```text
HTTP
```

Esto permite proteger la información transmitida entre el cliente y el servidor mediante cifrado.

> Durante las pruebas locales se puede utilizar `http://localhost:3000`.

---

# 🔄 Flujo de integración

El sistema que consuma esta API puede seguir el siguiente flujo:

```text
┌──────────────────────┐
│      Sistema Web     │
└──────────┬───────────┘
           │
           │ Solicita desafío
           ▼
┌──────────────────────┐
│   API de Verificación│
└──────────┬───────────┘
           │
           │ Genera token
           ▼
┌──────────────────────┐
│    Token temporal    │
└──────────┬───────────┘
           │
           │ Token
           ▼
┌──────────────────────┐
│      Sistema Web     │
└──────────┬───────────┘
           │
           │ Envía token para verificar
           ▼
┌──────────────────────┐
│   API de Verificación│
└──────────┬───────────┘
           │
           │ Valida token
           ▼
      ┌─────────────┐
      │ ¿Es válido? │
      └──────┬──────┘
             │
       ┌─────┴─────┐
       │           │
      SÍ           NO
       │           │
       ▼           ▼
  Verificado   Rechazado
```

---

# 🧪 Pruebas con Postman

Para probar la API se puede utilizar **Postman**.

### 1. Iniciar el servidor

```bash
node server.js
```

### 2. Abrir Postman

Crear una nueva solicitud HTTP.

### 3. Solicitar el desafío

Seleccionar:

```text
POST
```

y utilizar:

```text
http://localhost:3000/api/verify/challenge
```

### 4. Obtener el token

La API generará la información correspondiente al desafío.

### 5. Realizar la verificación

Crear una nueva solicitud:

```text
POST
```

con la dirección:

```text
http://localhost:3000/api/verify
```

En la sección **Body**, seleccionar:

```text
raw
```

y:

```text
JSON
```

Después introducir los datos correspondientes.

### 6. Comprobar la respuesta

Si los datos son correctos, la API deberá responder indicando:

```json
{
  "verificado": true,
  "mensaje": "Usuario verificado correctamente"
}
```

---

# 📁 Estructura del proyecto

Una estructura básica del proyecto puede ser:

```text
verificacion-bot/
│
├── node_modules/
│
├── package.json
├── package-lock.json
│
├── server.js
│
└── README.md
```

### Descripción

| Archivo             | Descripción                                              |
| ------------------- | -------------------------------------------------------- |
| `server.js`         | Contiene la lógica principal de la API y sus endpoints.  |
| `package.json`      | Contiene la información del proyecto y sus dependencias. |
| `package-lock.json` | Registra las versiones de las dependencias instaladas.   |
| `README.md`         | Documentación e instrucciones de integración.            |
| `node_modules/`     | Contiene las dependencias instaladas por npm.            |

---

# 👥 Integración con otros sistemas

Para integrar esta API en otro sistema, el equipo encargado del desarrollo deberá:

1. Tener acceso al servidor donde se encuentre desplegada la API.
2. Realizar una solicitud al endpoint de generación del desafío.
3. Obtener el token generado.
4. Enviar el token al endpoint de verificación.
5. Procesar la respuesta recibida.
6. Permitir que el proceso continúe únicamente cuando la respuesta indique que el usuario fue verificado correctamente.

En un entorno de producción, la dirección:

```text
http://localhost:3000
```

deberá sustituirse por la URL correspondiente al servidor donde se encuentre desplegada la API.

---

# ⚠️ Consideraciones importantes

* No compartir la clave secreta utilizada por el servidor.
* No colocar secretos directamente en el código cuando el proyecto se encuentre en producción.
* Utilizar HTTPS en producción.
* No confiar únicamente en la validación realizada en el navegador.
* La validación definitiva debe realizarse en el servidor.
* Respetar el límite de solicitudes establecido.
* Los endpoints y parámetros deben coincidir con la versión desplegada de la API.

---

# 📌 Estado del proyecto

**Estado:** Funcional en entorno local.

**Servidor de prueba:**

```text
http://localhost:3000
```

**Pruebas realizadas:** Postman.

**Resultado esperado de una verificación exitosa:**

```json
{
  "verificado": true,
  "mensaje": "Usuario verificado correctamente"
}
```

---

#Autora
**Betzy**
Proyecto académico — API de Verificación de Usuario/Bot.
