# Microservicio de Comentarios y Reseñas

## Descripción

Este proyecto consiste en el desarrollo de un microservicio de **Comentarios y Reseñas** para una tienda en línea.

El microservicio tiene como función administrar las reseñas realizadas por los clientes sobre los productos. Permite registrar, consultar, actualizar y eliminar reseñas mediante una API REST.

La comunicación se realiza mediante el protocolo **HTTP** y el intercambio de información se realiza en formato **JSON**, permitiendo que este microservicio pueda comunicarse con los demás microservicios que forman parte del sistema.

---

## Objetivo

Desarrollar un microservicio independiente que permita gestionar los comentarios y calificaciones realizadas por los clientes sobre los productos.

El microservicio proporciona las operaciones necesarias para:

- Registrar una reseña.
- Consultar las reseñas.
- Consultar una reseña específica.
- Actualizar una reseña.
- Eliminar una reseña.

---

# Arquitectura del microservicio

El proyecto utiliza una arquitectura de microservicio, donde la funcionalidad de comentarios y reseñas se encuentra separada del resto de los componentes del sistema.

El microservicio está compuesto principalmente por:

1. **Cliente o consumidor:** realiza solicitudes al microservicio.
2. **API REST:** recibe y procesa las solicitudes HTTP.
3. **Rutas:** determinan la operación que se debe realizar.
4. **Conexión a base de datos:** permite comunicarse con MySQL.
5. **Base de datos:** almacena la información de las reseñas.

La arquitectura puede representarse de la siguiente manera:

```text
┌─────────────────────────────┐
│   Cliente / Otro servicio   │
└──────────────┬──────────────┘
               │
               │ HTTP / JSON
               ▼
┌─────────────────────────────┐
│        API REST             │
│        Express.js           │
└──────────────┬──────────────┘
               │
               ▼
┌─────────────────────────────┐
│   Rutas de reseñas          │
│   resenas.routes.js         │
└──────────────┬──────────────┘
               │
               ▼
┌─────────────────────────────┐
│   Conexión a MySQL          │
│   database.js               │
└──────────────┬──────────────┘
               │
               ▼
┌─────────────────────────────┐
│  comentarios_resenas_db     │
│                             │
│       Tabla resenas         │
└─────────────────────────────┘
```

### Flujo de funcionamiento

El funcionamiento del microservicio sigue el siguiente proceso:

```text
Solicitud HTTP
      ↓
Servidor Express
      ↓
Ruta correspondiente
      ↓
Procesamiento de la solicitud
      ↓
Consulta o modificación en MySQL
      ↓
Resultado
      ↓
Respuesta JSON
```

---

# Tecnologías utilizadas

El proyecto fue desarrollado utilizando las siguientes tecnologías:

- **Node.js:** entorno de ejecución para JavaScript en el servidor.
- **Express.js:** framework utilizado para desarrollar la API REST.
- **MySQL:** sistema gestor de base de datos.
- **MySQL2:** paquete utilizado para conectar Node.js con MySQL.
- **dotenv:** utilizado para manejar las variables de entorno.
- **CORS:** permite solicitudes desde diferentes orígenes.
- **Postman:** utilizado para realizar pruebas de los endpoints.
- **Git:** utilizado para el control de versiones.
- **GitHub:** utilizado para almacenar el repositorio del proyecto.

---

# Requisitos

Para ejecutar el proyecto se necesita:

- Node.js instalado.
- MySQL Server instalado.
- MySQL Workbench.
- Git.
- Postman para realizar las pruebas de la API.

---

# Instalación

## 1. Clonar el repositorio

Para obtener el proyecto desde GitHub se utiliza:

```bash
git clone URL_DEL_REPOSITORIO
```

Después se ingresa a la carpeta del proyecto:

```bash
cd comentarios-resenas-service
```

---

## 2. Instalar las dependencias

Dentro de la carpeta del proyecto se ejecuta:

```bash
npm install
```

Este comando instala las dependencias necesarias definidas en el archivo `package.json`.

---

# Base de datos

El microservicio utiliza una base de datos MySQL y una Tabla de reseñas:

La información del microservicio se almacena en la tabla:


La tabla contiene los siguientes campos:

 `id`  
 `id_producto` 
 `id_cliente` 
 `calificacion` 
 `comentario` 


---

# Configuración de la base de datos

La conexión con MySQL se encuentra configurada en:

```text
src/database.js
```

Para proteger las credenciales de la base de datos se utiliza un archivo `.env`.

El archivo debe encontrarse en la carpeta principal del proyecto y contener:

```env
DB_HOST=localhost
DB_USER=root
DB_PASSWORD=TU_CONTRASEÑA
DB_NAME=comentarios_resenas_db
DB_PORT=3306
```

En `DB_PASSWORD` se debe colocar la contraseña correspondiente al usuario de MySQL.

Por seguridad, el archivo `.env` no se incluye en GitHub.

---

# Archivo .gitignore

El proyecto utiliza un archivo `.gitignore` para evitar subir archivos que no deben formar parte del repositorio.

Su contenido es:

```gitignore
node_modules/
.env
```

### `node_modules/`

Contiene las dependencias instaladas del proyecto. No es necesario subir esta carpeta, ya que puede generarse nuevamente ejecutando:

```bash
npm install
```

### `.env`

Contiene las credenciales utilizadas para conectarse a MySQL, por lo que debe mantenerse privado.

---

# Estructura del proyecto

La estructura principal del proyecto es:

```text
comentarios-resenas-service/
│
├── node_modules/
│
├── src/
│   ├── routes/
│   │   └── resenas.routes.js
│   │
│   ├── database.js
│   ├── server.js
│   └── test-db.js
│
├── .env
├── .gitignore
├── package.json
├── package-lock.json
└── README.md
```

## Descripción de los archivos

### `src/server.js`

Es el archivo principal del servidor.

Se encarga de:

- Crear la aplicación Express.
- Configurar CORS.
- Permitir recibir información en formato JSON.
- Configurar la ruta principal.
- Registrar las rutas del microservicio.
- Iniciar el servidor.

### `src/database.js`

Contiene la configuración necesaria para establecer la conexión entre Node.js y MySQL.

Utiliza las variables de entorno almacenadas en `.env`.

### `src/test-db.js`

Permite comprobar que la conexión entre el microservicio y la base de datos MySQL funciona correctamente.

### `src/routes/resenas.routes.js`

Contiene las rutas relacionadas con las operaciones de comentarios y reseñas.

En este archivo se encuentran las operaciones para:

- Crear reseñas.
- Consultar reseñas.
- Actualizar reseñas.
- Eliminar reseñas.

---

# Ejecución del proyecto

Para iniciar el microservicio se utiliza el siguiente comando:

```bash
npm start
```

Si el servidor inicia correctamente se mostrará:

```text
🚀 Microservicio ejecutándose en http://localhost:3000
```

El microservicio queda disponible en:

```text
http://localhost:3000
```

La ruta principal:

```text
GET /
```

devuelve:

```json
{
    "servicio": "Comentarios y Reseñas",
    "estado": "activo"
}
```

Esta respuesta permite comprobar que el servidor se encuentra funcionando correctamente.

---

# API REST

La API utiliza como ruta base:

```text
/api/resenas
```

Las operaciones se realizan utilizando métodos HTTP.

Los métodos utilizados son:

- `GET`
- `POST`
- `PUT`
- `DELETE`

La información enviada y recibida por la API se maneja mediante JSON.

---

# Endpoints

## 1. Consultar todas las reseñas

### Método

```text
GET
```

### Endpoint

```text
/api/resenas
```

### URL

```text
http://localhost:3000/api/resenas
```

Este endpoint permite consultar todas las reseñas almacenadas en la base de datos.

### Ejemplo de respuesta

```json
[
    {
        "id": 1,
        "id_producto": 1,
        "id_cliente": 1,
        "calificacion": 5,
        "comentario": "Excelente producto, me gusto mucho."
    },
    {
        "id": 2,
        "id_producto": 1,
        "id_cliente": 2,
        "calificacion": 4,
        "comentario": "Muy buen producto, lo recomiendo."
    }
]
```

---

# 2. Consultar una reseña por ID

### Método

```text
GET
```

### Endpoint

```text
/api/resenas/:id
```

### Ejemplo

```text
http://localhost:3000/api/resenas/1
```

Este endpoint permite consultar una reseña específica utilizando su identificador.

### Respuesta

```json
{
    "id": 1,
    "id_producto": 1,
    "id_cliente": 1,
    "calificacion": 5,
    "comentario": "Excelente producto, me gusto mucho."
}
```

Si la reseña no existe, se devuelve:

```json
{
    "error": "Reseña no encontrada"
}
```

---

# 3. Registrar una reseña

### Método

```text
POST
```

### Endpoint

```text
/api/resenas
```

### URL

```text
http://localhost:3000/api/resenas
```

Para registrar una nueva reseña se envían los datos en formato JSON.

### Body

```json
{
    "id_producto": 15,
    "id_cliente": 3,
    "calificacion": 5,
    "comentario": "Excelente producto."
}
```

### Respuesta

```json
{
    "mensaje": "Reseña creada correctamente",
    "id": 6
}
```

El identificador de la reseña es generado automáticamente por MySQL.

---

# 4. Actualizar una reseña

### Método

```text
PUT
```

### Endpoint

```text
/api/resenas/:id
```

### Ejemplo

```text
http://localhost:3000/api/resenas/1
```

Para actualizar una reseña se envía la nueva información mediante JSON.

### Body

```json
{
    "calificacion": 4,
    "comentario": "El producto es bueno, aunque puede mejorar."
}
```

### Respuesta

```json
{
    "mensaje": "Reseña actualizada correctamente"
}
```

---

# 5. Eliminar una reseña

### Método

```text
DELETE
```

### Endpoint

```text
/api/resenas/:id
```

### Ejemplo

```text
http://localhost:3000/api/resenas/1
```

Este endpoint permite eliminar una reseña utilizando su identificador.

### Respuesta

```json
{
    "mensaje": "Reseña eliminada correctamente"
}
```

Si la reseña no existe:

```json
{
    "error": "Reseña no encontrada"
}
```

---

# Validaciones

El microservicio realiza validaciones para evitar registrar información incompleta o incorrecta.

Para registrar una reseña son obligatorios los siguientes campos:

```text
id_producto
id_cliente
calificacion
comentario
```

La calificación debe encontrarse entre:

```text
1 y 5
```

Si se proporciona una calificación fuera del rango permitido, se devuelve:

```json
{
    "error": "La calificación debe estar entre 1 y 5"
}
```

También se verifica que una reseña exista antes de realizar una actualización o eliminación.

---

# Códigos de respuesta HTTP

| Código | Descripción |
|---|---|
| `200` | Operación realizada correctamente. |
| `201` | Reseña creada correctamente. |
| `400` | Datos incorrectos o incompletos. |
| `404` | Reseña no encontrada. |
| `500` | Error interno del servidor. |

---

# Comunicación con otros microservicios

El microservicio está diseñado para integrarse con los demás componentes del sistema mediante una arquitectura basada en microservicios.

La comunicación se realiza utilizando:

```text
HTTP
```

y los datos se intercambian utilizando:

```text
JSON
```

Por ejemplo, otro microservicio puede enviar una solicitud para registrar una reseña:

```json
{
    "id_producto": 15,
    "id_cliente": 3,
    "calificacion": 5,
    "comentario": "Excelente producto."
}
```

El microservicio recibe la información, valida los datos, los almacena en MySQL y devuelve una respuesta:

```json
{
    "mensaje": "Reseña creada correctamente",
    "id": 6
}
```

Gracias al uso de HTTP y JSON, el microservicio puede comunicarse con otros servicios aunque hayan sido desarrollados utilizando diferentes lenguajes de programación.

---

# Pruebas con Postman

Los endpoints pueden probarse mediante Postman.

Las operaciones disponibles son:

| Método | Endpoint | Función |
|---|---|---|
| GET | `/api/resenas` | Consultar todas las reseñas |
| GET | `/api/resenas/:id` | Consultar una reseña |
| POST | `/api/resenas` | Registrar una reseña |
| PUT | `/api/resenas/:id` | Actualizar una reseña |
| DELETE | `/api/resenas/:id` | Eliminar una reseña |

Para las solicitudes `POST` y `PUT`, se debe utilizar:

```text
Body → raw → JSON
```

---

# Flujo general del microservicio

El funcionamiento general puede representarse de la siguiente manera:

```text
Cliente / Otro microservicio
            │
            ▼
      Solicitud HTTP
            │
            ▼
       API Express
            │
            ▼
     Ruta de reseñas
            │
            ▼
       Validación
            │
            ▼
          MySQL
            │
            ▼
     Tabla RESENAS
            │
            ▼
      Resultado de la
         operación
            │
            ▼
       Respuesta JSON
```

---

# Seguridad

Para proteger la información de conexión a la base de datos, las credenciales se almacenan en variables de entorno mediante el archivo `.env`.

El archivo `.env` se encuentra incluido en `.gitignore`, por lo que no debe ser enviado al repositorio público.

Además, las consultas a la base de datos utilizan parámetros para evitar insertar directamente los valores proporcionados por el usuario dentro de las consultas SQL.

---

# Control de versiones

El proyecto utiliza **Git** para controlar las diferentes versiones del código fuente.

El repositorio se almacena en **GitHub**, permitiendo mantener el proyecto disponible y facilitar su colaboración e integración con los demás microservicios.

---

# Autor

**Nidian Valdez**

Proyecto académico de desarrollo de microservicios.