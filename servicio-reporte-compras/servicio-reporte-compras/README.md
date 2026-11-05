# Servicio de Reporte de Compras — SOA

Proyecto completo: Node.js + Express 5, API REST con JSON y MySQL. Guía para Windows/PowerShell. Todos los archivos de código están incluidos en este ZIP; no necesitas copiarlos desde el chat.

## 1. Qué hace y por qué corresponde a SOA

Este servicio tiene una responsabilidad: consultar y generar reportes de compras. Expone un contrato HTTP que puede consumir una página, una aplicación móvil u otro servicio, sin conocer el SQL interno. No guarda sesiones del cliente. Se ejecuta como un proceso independiente y separa las rutas HTTP, las validaciones y el acceso a datos.

REST es el estilo de la API; JSON es el formato de respuesta; SOA es la forma de organizar funcionalidades como servicios. Usar REST por sí solo no convierte todo un sistema en SOA. Este proyecto es un servicio que puede integrarse en esa arquitectura.

Alcance: lectura de compras ya registradas. Los INSERT del SQL simulan al sistema que registra compras; no hay rutas POST/PUT/DELETE porque registrar compras corresponde a otra responsabilidad. Para una integración real, habría que definir cómo llegan esos datos desde el servicio de compras, por ejemplo mediante eventos o una API.

Reglas del ejemplo: importes en MXN, sin impuestos ni descuentos; cantidad por precio unitario = subtotal, suma de subtotales = total. Precio histórico en cada detalle. Reporte y resumen incluyen solo CONFIRMADA. El detalle permite consultar CANCELADA y muestra su estado. Toda compra registrada debe tener al menos una línea (el servicio que la registra debe garantizarlo en una transacción). Fechas DATE, sin hora; los dos límites del período son inclusivos. No hay rango obligatorio: sin fechas se consulta todo. Una lista sin resultados devuelve 200 y [], un resumen vacío devuelve ceros y un detalle inexistente devuelve 404. Un proveedor inexistente produce un reporte vacío.

Los importes DECIMAL se entregan como cadenas JSON ("10700.00") para conservar los centavos. Este proyecto escucha solo en tu equipo y no incluye autenticación; es una práctica local, no un despliegue público.

## 2. Requisitos

- Node.js 22 o superior (por ejemplo, Node 24).
- MySQL Server 8.0.16 o superior. Workbench es el cliente; también necesitas el servidor instalado y en ejecución.
- Un editor como Visual Studio Code.
- Postman es opcional: también puedes comprobar todo con navegador o PowerShell.

En PowerShell ejecuta uno por uno:

```powershell
node --version
npm --version
```

Si no se reconocen, instala Node desde https://nodejs.org/ y abre una terminal nueva. MySQL: https://dev.mysql.com/downloads/mysql/ . No hace falta cambiar tu versión si ya tienes una versión compatible.

## 3. Estructura del proyecto

| Archivo | Función |
|---|---|
| package.json | Dependencias y comandos npm |
| package-lock.json | Versiones exactas, si pudo generarse en la preparación |
| .env.example | Plantilla de conexión, copiar como .env |
| .gitignore | Evita subir claves y dependencias a Git |
| sql/01_base_datos.sql | Tablas, vista, datos de ejemplo y consulta de control |
| sql/02_usuario.sql | Usuario MySQL con permiso SELECT |
| src/server.js | Pool de conexión y arranque HTTP |
| src/app.js | Rutas REST y respuestas JSON |
| src/validacion.js | Fechas, identificadores y paginación |
| src/reportes.js | Consultas MySQL parametrizadas |
| test/api.test.js | Pruebas HTTP con repositorio simulado |
| test/integracion.js | Pruebas contra la API y MySQL reales |
| postman_collection.json | Peticiones para importar en Postman |
| README.md | Esta guía |
| VERIFICACION.md | Alcance de las verificaciones realizadas al preparar el proyecto |

Relaciones: proveedores tiene muchas compras; compras tiene muchos detalle_compras; productos tiene muchos detalle_compras. La vista v_reporte_compras agrupa las líneas en una fila por compra para evitar duplicar importes al contar compras.

## 4. Crear la base en MySQL Workbench

1. Abre Workbench y entra a tu conexión local con un usuario administrador.
2. Menú File > Open SQL Script: abre sql/01_base_datos.sql.
3. Ejecuta todo el archivo con el botón del rayo. Está pensado para una base nueva y se ejecuta una sola vez; no borra nada existente. Si soa_reporte_compras ya existe, revisa antes de continuar, no vuelvas a insertar datos encima.
4. Actualiza SCHEMAS. Debe aparecer soa_reporte_compras y sus cuatro tablas.
5. La última consulta debe devolver 3 compras, 10700.00 de total y 3566.67 de promedio.
6. Abre sql/02_usuario.sql, sustituye CAMBIA_ESTA_CLAVE por una contraseña elegida por ti y ejecuta el archivo. Usa esa misma contraseña después en .env. Para simplificar la edición SQL, evita comillas simples en esta clave de la práctica.

El usuario reportes_app solo tiene SELECT. No ejecutes la aplicación con root. Si ese usuario ya existe, revisa sus credenciales y permisos con tu administrador en vez de recrearlo o borrarlo.

## 5. Abrir el proyecto e instalar dependencias

Descomprime el ZIP. Abre la carpeta servicio-reporte-compras en tu editor. Abre una terminal dentro de la carpeta que contiene package.json y ejecuta:

```powershell
npm install
Copy-Item .env.example .env
```

Edita .env y pon tu contraseña real:

```dotenv
HOST=127.0.0.1
PORT=3000
DB_HOST=127.0.0.1
DB_PORT=3306
DB_USER=reportes_app
DB_PASSWORD="TU_CONTRASEÑA_REAL"
DB_NAME=soa_reporte_compras
```

Si MySQL usa otro puerto, cambia DB_PORT. No publiques .env. Node carga este archivo mediante --env-file; no es necesario instalar dotenv. En macOS/Linux sustituye Copy-Item por `cp .env.example .env`.

## 6. Iniciar

```powershell
npm start
```

Debe aparecer:

```text
Servicio disponible en http://127.0.0.1:3000/api/v1/salud
```

Deja abierta esa terminal. Esa línea indica que HTTP arrancó; comprueba la base de datos abriendo:

http://127.0.0.1:3000/api/v1/salud

Respuesta esperada con MySQL conectado:

```json
{"ok":true,"servicio":"reporte-compras","baseDatos":"conectada"}
```

Para desarrollar con reinicio al guardar: `npm run dev`. Para detener: Ctrl+C.

## 7. Contrato REST

URL base: http://127.0.0.1:3000

| Método | Ruta | Resultado |
|---|---|---|
| GET | /api/v1/salud | Conectividad con MySQL |
| GET | /api/v1/reportes/compras | Lista paginada de compras confirmadas |
| GET | /api/v1/reportes/compras/resumen | Cantidad, gasto y promedio |
| GET | /api/v1/reportes/compras/:id | Cabecera y productos de una compra |

Filtros de lista y resumen:

| Parámetro | Ejemplo | Regla |
|---|---|---|
| desde | 2026-09-01 | Fecha real YYYY-MM-DD; opcional |
| hasta | 2026-09-30 | Fecha real, mayor o igual a desde; opcional |
| proveedorId | 1 | Entero positivo; opcional |
| pagina | 1 | Solo lista; predeterminado 1; máximo 1000000 |
| limite | 20 | Solo lista; predeterminado 20; máximo 100 |

No se envía body en estas peticiones GET. Todas las respuestas son application/json. Parámetros repetidos, desconocidos o inválidos se rechazan con 400. Lista ordenada por fecha descendente y después ID descendente.

| HTTP | Significado |
|---|---|
| 200 | Consulta realizada, incluso sin coincidencias |
| 400 | Parámetros incorrectos |
| 404 | Compra o ruta inexistente |
| 500 | Error interno al consultar un reporte |
| 503 | La ruta de salud no puede conectar con MySQL |

## 8. Comprobar paso a paso

### A. Resumen de septiembre

Abre en navegador, o usa GET en Postman:

```text
http://127.0.0.1:3000/api/v1/reportes/compras/resumen?desde=2026-09-01&hasta=2026-09-30
```

Respuesta esperada:

```json
{
  "ok": true,
  "moneda": "MXN",
  "filtros": {
    "desde": "2026-09-01",
    "hasta": "2026-09-30",
    "proveedorId": null
  },
  "datos": {
    "totalCompras": 3,
    "totalGastado": "10700.00",
    "promedioPorCompra": "3566.67"
  }
}
```

El cálculo es: compra 1 = 10 × 500 + 5 × 300 = 6500; compra 2 = 8 × 250 = 2000; compra 3 = 4 × 550 = 2200. Total = 10700. Promedio = 10700 / 3 = 3566.67. Compra 4 está cancelada y compra 5 está fuera de septiembre.

### B. Lista y paginación

```text
http://127.0.0.1:3000/api/v1/reportes/compras?desde=2026-09-01&hasta=2026-09-30&pagina=1&limite=2
```

Debe mostrar compras 3 y 2, totalRegistros 3 y totalPaginas 2. Cambia pagina=2: aparecerá la compra 1.

### C. Proveedor

```text
http://127.0.0.1:3000/api/v1/reportes/compras/resumen?desde=2026-09-01&hasta=2026-09-30&proveedorId=1
```

Debe devolver 2 compras, total "8700.00" y promedio "4350.00".

### D. Detalle

```text
http://127.0.0.1:3000/api/v1/reportes/compras/1
```

Debe mostrar dos productos, subtotales "5000.00" y "1500.00", total "6500.00". Cambia el ID a 4 para ver una compra CANCELADA que no participa en el reporte.

### E. Errores y período vacío

| URL después de la base | Resultado esperado |
|---|---|
| /api/v1/reportes/compras?desde=2026-02-30 | 400: fecha imposible |
| /api/v1/reportes/compras?desde=2026-09-30&hasta=2026-09-01 | 400: rango invertido |
| /api/v1/reportes/compras?limite=101 | 400: límite excesivo |
| /api/v1/reportes/compras/999999 | 404: compra no encontrada |
| /api/v1/reportes/compras?desde=2020-01-01&hasta=2020-01-31 | 200: datos [] |

En Postman: Import > selecciona postman_collection.json > abre una petición > Send. La variable baseUrl está configurada como http://127.0.0.1:3000. Observa tanto el código HTTP como el JSON. También puedes importar la colección sin crear una cuenta si tu versión permite uso local.

Alternativa en otra terminal PowerShell:

```powershell
Invoke-RestMethod "http://127.0.0.1:3000/api/v1/reportes/compras/resumen?desde=2026-09-01&hasta=2026-09-30" | ConvertTo-Json -Depth 10
```

## 9. Pruebas automáticas

Pruebas de rutas y validaciones (usan un repositorio simulado, no necesitan MySQL):

```powershell
npm test
```

Pruebas con MySQL real: deja `npm start` activo en la primera terminal; abre una segunda terminal en el proyecto:

```powershell
npm run test:integracion
```

Este segundo comando utiliza los datos originales del SQL y verifica salud, totales, proveedor, paginación, detalle, canceladas, período vacío y errores. No modifica datos. Si cambiaste los datos de ejemplo, ajusta las expectativas. Si cambiaste PORT, ejecuta antes `$env:BASE_URL="http://127.0.0.1:3001"`.

## 10. Cómo funciona el código

server.js toma la configuración de .env, crea un pool de conexiones y arranca Express. app.js recibe las solicitudes; validacion.js comprueba los parámetros; reportes.js consulta MySQL y devuelve los resultados a las rutas, que responden en JSON.

Los filtros se envían mediante placeholders `?` de mysql2, separados del SQL. LIMIT y OFFSET se construyen únicamente desde enteros validados. Los montos se calculan con DECIMAL dentro de MySQL. La lista utiliza una transacción de lectura para mantener consistente el conteo y sus filas. La API no devuelve contraseñas, consultas ni mensajes internos del motor al cliente.

## 11. Errores comunes

| Problema | Qué revisar |
|---|---|
| npm no se reconoce | Instala Node y vuelve a abrir PowerShell |
| PowerShell bloquea npm.ps1 | Usa npm.cmd install o npm.cmd start, sin cambiar la política del equipo |
| Cannot find package express | Ejecuta npm install dentro de la carpeta con package.json |
| .env no encontrado | Copia .env.example a .env; evita que Windows lo guarde como .env.txt |
| Salud devuelve 503 | MySQL debe estar iniciado; revisa host, puerto, usuario y contraseña |
| Access denied en MySQL | Revisa que la clave de .env coincida con la del usuario creado y su host local |
| Base o tabla inexistente | Ejecuta el SQL inicial y revisa DB_NAME |
| EADDRINUSE | Cambia PORT a 3001 y utiliza ese puerto en navegador y Postman |
| Reporte vacío | Usa las fechas de septiembre de 2026, no las del día actual |
| Resumen 500 pero salud 200 | SELECT 1 funciona, pero falta una tabla/vista o permiso; revisa los dos SQL |

## 12. Evidencias para la clase

Captura las cuatro tablas y el resultado de la consulta de control en Workbench; la consola con el servicio iniciado; el JSON de salud; el resumen de septiembre; el filtro por proveedor; el detalle; una respuesta 400 y el resultado de la prueba de integración. No muestres tu contraseña de .env.

Explicación breve: “Mi servicio de reporte de compras recibe peticiones HTTP GET, valida los filtros, consulta MySQL y devuelve JSON. Su responsabilidad es generar información de compras. Puede ser utilizado por diferentes aplicaciones mediante el mismo contrato REST, por lo que puede integrarse como servicio en una arquitectura SOA”.

## Fuentes técnicas

- Express: https://expressjs.com/en/guide/migrating-5/
- Manejo de errores: https://expressjs.com/en/guide/error-handling/
- MySQL2, sentencias preparadas: https://sidorares.github.io/node-mysql2/docs/examples/queries/prepared-statements
- Manual MySQL: https://dev.mysql.com/doc/refman/8.0/en/
