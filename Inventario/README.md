# Servicio de reportes de inventario

Este es mi proyecto de un servicio de reportes de inventario para SOA. Utilicé Node.js, Express y MySQL. La API consulta los productos de la base de datos y devuelve un reporte en JSON con las existencias, el valor del inventario y los productos con stock bajo.

Por ahora el servicio solo consulta información. No tiene interfaz gráfica ni funciones para registrar, editar o eliminar productos.

## Cómo funciona

La consulta se hace desde el navegador, Postman u otra aplicación. La API recibe la solicitud, consulta MySQL y devuelve el reporte.

```text
Cliente → Ruta HTTP → Servicio de reportes → Repositorio → MySQL
```

Organicé el código en tres partes: las rutas reciben las solicitudes, el servicio valida los filtros y calcula el resumen, y el repositorio realiza las consultas SQL. La idea es que otras aplicaciones puedan consumir el reporte mediante HTTP sin acceder directamente a la base de datos.

## Tecnologías

- Node.js 22 o superior y npm.
- Express 5.
- MySQL 8.0.16 o superior.
- Docker Compose como alternativa para ejecutar el proyecto.

## Estructura del proyecto

```text
src/
  app.js                                Configuración de Express y errores
  server.js                             Inicio del servidor
  db.js                                 Conexión a MySQL
  routes/report.routes.js               Rutas del reporte
  services/report.service.js            Filtros y cálculos
  repositories/inventory.repository.js  Consultas SQL
sql/
  01-schema.sql                         Base de datos y tablas
  02-seed.sql                           Datos de ejemplo
test/
  report.test.js                        Pruebas sin base de datos
  mysql.integration.js                  Prueba con MySQL
requests.http                           Solicitudes para probar la API
compose.yaml                            Configuración de Docker Compose
Dockerfile                              Imagen de la API
.env.example                            Ejemplo de configuración
```

## Cómo ejecutarlo en Windows

### 1. Descargar el proyecto

```powershell
git clone https://github.com/luismanuelsolisarenas-lang/Inventario.git
cd Inventario
npm.cmd install
Copy-Item .env.example .env
```

Si el archivo `.env` ya existe, hay que conservarlo y revisar sus valores. Este archivo no se sube a GitHub porque contiene las credenciales de conexión.

### 2. Preparar la base de datos

En MySQL Workbench, abrir una conexión como administrador y ejecutar completos estos archivos, en este orden:

1. [sql/01-schema.sql](sql/01-schema.sql): crea la base `inventario_soa` y las tablas `categorias` y `productos`.
2. [sql/02-seed.sql](sql/02-seed.sql): agrega las categorías y cuatro productos de ejemplo.

Después, ejecutar este bloque para crear el usuario de la aplicación con permiso de lectura:

```sql
CREATE USER IF NOT EXISTS 'inventario_app'@'localhost'
IDENTIFIED BY 'inventario_local';

GRANT SELECT ON inventario_soa.* TO 'inventario_app'@'localhost';
```

La contraseña del ejemplo es para uso local. Si el usuario ya existe, este bloque no cambia su contraseña: en `.env` debe ponerse la que tenga ese usuario.

### 3. Configurar la conexión

El archivo `.env` debe tener los datos de la instalación de MySQL. Con la configuración del ejemplo queda así:

```env
PORT=3000
HOST=0.0.0.0
DB_HOST=127.0.0.1
DB_PORT=3306
DB_USER=inventario_app
DB_PASSWORD=inventario_local
DB_NAME=inventario_soa
```

### 4. Iniciar la API

En la terminal del proyecto:

```powershell
npm.cmd run dev
```

También se puede usar `npm.cmd start` para iniciar sin recarga automática. Para detener el servidor se presiona Ctrl+C.

Con el servidor activo, abrir <http://localhost:3000/health>. Si la conexión funciona, responde:

```json
{ "status": "ok", "database": "up" }
```

El reporte completo está en <http://localhost:3000/api/v1/reportes/inventario>.

## Rutas disponibles

Todas las consultas usan el método `GET`, sin cuerpo, y responden en JSON.

| Ruta | Descripción |
|---|---|
| `/health` | Revisa la conexión con MySQL |
| `/api/v1/reportes/inventario` | Consulta todo el inventario |
| `/api/v1/reportes/inventario?categoriaId=1` | Filtra por categoría |
| `/api/v1/reportes/inventario?stockBajo=true` | Muestra productos con stock bajo |
| `/api/v1/reportes/inventario?categoriaId=2&stockBajo=true` | Combina los dos filtros |

En Postman basta con seleccionar GET, escribir la URL completa y enviar la solicitud. También dejé ejemplos en [requests.http](requests.http) para la extensión REST Client de VS Code.

## Qué incluye el reporte

La respuesta contiene la fecha de generación (`generadoEn`), los filtros aplicados, un resumen y la lista de productos. Cada producto incluye su categoría, existencias, stock mínimo, precio unitario y valor total.

Para los cálculos utilicé estas reglas:

- Un producto tiene stock bajo cuando sus existencias son menores o iguales al stock mínimo.
- El valor de cada producto es su stock multiplicado por el precio unitario.
- El resumen incluye solamente los productos que cumplen los filtros.
- Si no hay coincidencias, la lista queda vacía y los totales son cero.
- Los importes y el total de unidades se devuelven como texto para conservar la precisión; los importes tienen dos decimales.
- La fecha se devuelve en UTC. Los valores corresponden al inventario actual y a una sola moneda.

`stockBajo=false` incluye todos los niveles de stock. Los filtros desconocidos, repetidos o con valores inválidos producen un error 400.

Con los datos de ejemplo, estos son los resultados esperados:

| Consulta | Productos | Unidades | Valor del inventario | Stock bajo | Sin stock |
|---|---:|---:|---:|---:|---:|
| Sin filtros | 4 | 65 | 4315.00 | 2 | 1 |
| `categoriaId=1` | 2 | 55 | 1815.00 | 1 | 0 |
| `stockBajo=true` | 2 | 5 | 40.00 | 2 | 1 |
| `categoriaId=2&stockBajo=true` | 1 | 0 | 0.00 | 1 | 1 |

Por ejemplo, el resumen de la consulta sin filtros es:

```json
{
  "totalProductos": 4,
  "totalUnidades": "65",
  "valorInventario": "4315.00",
  "productosStockBajo": 2,
  "productosSinStock": 1
}
```

Este bloque corresponde a `data.resumen`; la respuesta completa también contiene los productos.

## Pruebas

Para ejecutar las pruebas del código sin depender de MySQL:

```powershell
npm.cmd test
```

Para comprobar la conexión real y comparar los reportes con los datos de MySQL:

```powershell
npm.cmd run test:integration
```

La prueba de integración necesita MySQL activo y el archivo `.env` configurado. Inicia su propio servidor temporal y no modifica registros, así que no hace falta ejecutar `npm.cmd run dev` antes. Conviene no cambiar los datos mientras corre.

## Ejecutar con Docker

El proyecto también incluye la configuración para iniciar la API y MySQL con Docker Compose. Se necesita Docker Desktop activo con contenedores Linux.

Después de descargar el proyecto y crear `.env` a partir de `.env.example`:

```powershell
docker compose up -d --build --wait
```

Con esta opción no hace falta instalar Node.js ni MySQL por separado. Si ya hay un MySQL usando el puerto 3306, cambiar `DB_PORT` a `3307` en `.env`. Si el puerto 3000 está ocupado, cambiar `PORT` y usar ese puerto en las consultas. No se debe iniciar también la API con npm en el mismo puerto.

Compose conecta la API internamente con `db:3306` y utiliza la base `inventario_soa`. Los scripts SQL se ejecutan automáticamente la primera vez, cuando el volumen está vacío. Cambiar las credenciales en `.env` después no actualiza los usuarios de una base ya creada.

Para revisar el estado y los registros:

```powershell
docker compose ps
docker compose logs api
```

Para detener los contenedores conservando los datos:

```powershell
docker compose down
```

## Conexión desde otro servicio

Otra aplicación puede consultar la API con una solicitud GET. Si está en otra computadora de la misma red, debe usar la IP del equipo donde corre el servicio. Por ejemplo:

```text
http://192.168.1.50:3000/api/v1/reportes/inventario
```

Esa IP es solo un ejemplo; se puede consultar la dirección del equipo con `ipconfig`. El servidor debe estar activo, escuchar en `0.0.0.0` y tener permitido el puerto de la API en el firewall de la red privada. `localhost` solo sirve para consultar desde el mismo equipo. Entre contenedores de este Compose, la dirección es `http://api:3000`.

Actualmente el servicio lee las tablas de su base MySQL. Para integrarlo con un servicio de inventario que exponga sus datos por otra API, habría que adaptar el repositorio a ese contrato. Si una página web lo consulta desde otro origen, también habría que configurar CORS o utilizar un gateway del mismo origen.

Subir el proyecto a GitHub guarda el código y los scripts SQL, pero no publica la API ni copia la base de datos local.

## Errores comunes

| Error | Qué revisar |
|---|---|
| `ER_ACCESS_DENIED_ERROR` / `Access denied` | Usuario, contraseña y permisos de MySQL |
| `ECONNREFUSED` | Que MySQL esté encendido y coincidan el host y el puerto |
| `Unknown database` o tabla inexistente | Que se haya ejecutado `01-schema.sql` |
| `EADDRINUSE` | Que el puerto de la API no esté ocupado |

La API devuelve 200 cuando la consulta funciona, 400 para filtros inválidos, 404 para rutas inexistentes, 500 si falla el reporte y 503 si `/health` no puede conectarse a MySQL.

## Alcance actual

El proyecto está pensado para una práctica de SOA y reportes del inventario actual. No incluye autenticación, paginación ni historial de movimientos. Para usarlo con datos reales y publicarlo en internet quedarían pendientes el control de acceso, HTTPS y límites de solicitudes y resultados.
