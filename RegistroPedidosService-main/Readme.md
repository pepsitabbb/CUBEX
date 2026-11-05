# RegistroPedidosService

Servicio encargado del **registro de pedidos** para el sistema de tienda en línea.

El servicio está desarrollado con **ASP.NET Core / .NET 10**, utiliza **Entity Framework Core** y está preparado para trabajar inicialmente con una base de datos **InMemory** para pruebas y posteriormente con **MySQL**.

---

## Responsabilidad del microservicio

Este microservicio corresponde al módulo:

> **12. Registro de pedidos**

Su responsabilidad principal es registrar los pedidos generados por los clientes y permitir consultar y actualizar su estado.

### Funcionalidades

- Registrar un pedido.
- Consultar todos los pedidos.
- Consultar un pedido por ID.
- Actualizar el estado de un pedido.
- Preparar la conexión para la base de datos MySQL real.

### Funcionalidades que NO pertenecen a este microservicio

Este servicio no se encarga de:

- Crear usuarios.
- Validar contraseñas.
- Administrar clientes.
- Administrar productos.
- Administrar inventario.
- Procesar pagos.
- Validar tarjetas.
- Generar ventas.
- Generar tickets.
- Gestionar envíos.
- Gestionar devoluciones.

Estas funcionalidades corresponden a otros servicios del proyecto.

---

# Tecnologías

- .NET 10
- ASP.NET Core Web API
- Entity Framework Core
- MySQL
- Pomelo.EntityFrameworkCore.MySql
- Entity Framework Core InMemory
- Scalar API Reference
- C#

---

# Estructura del proyecto

```text
RegistroPedidosService/
│
├── Controllers/
│   └── PedidosController.cs
│
├── Data/
│   └── IPedidosService.cs
│
├── DTOs/
│   └── Pedidodto.cs
│
├── Models/
│   └── Pedido.cs
│
├── Services/
│   └── PedidosDbContexto.cs
│
├── Properties/
│   └── launchSettings.json
│
├── appsettings.json
├── appsettings.Development.json
├── Program.cs
├── RegistroPedidosService.csproj
└── README.md
```

---

# Requisitos

Para ejecutar el proyecto se necesita:

- .NET 10 SDK
- Git
- MySQL Server (solamente necesario para utilizar la BD real)

---

# Instalación

Clonar el repositorio:

```bash
git clone https://github.com/CesarKarass/RegistroPedidosService.git
```

Entrar al proyecto:

```bash
cd RegistroPedidosService
```

Restaurar dependencias:

```bash
dotnet restore
```

Compilar:

```bash
dotnet build
```

---

# Ejecutar el microservicio

Para ejecutar el proyecto:

```bash
dotnet run
```

También se puede utilizar:

```bash
dotnet watch run
```

La aplicación estará disponible en una dirección similar a:

```text
http://localhost:5274
```

El puerto puede cambiar dependiendo de la configuración de `launchSettings.json`.

---

# Scalar

La documentación interactiva de la API se encuentra disponible en:

```text
http://localhost:5274/Scalar/
```

Desde Scalar se pueden probar los endpoints del microservicio.

---

# Base de datos

El proyecto está preparado para trabajar con dos opciones:

```text
                  RegistroPedidosService
                           │
             ┌─────────────┴─────────────┐
             │                           │
       Development                  Production
             │                           │
             ▼                           ▼
       InMemory DB                    MySQL
```

La base de datos **InMemory** se utiliza para realizar pruebas sin necesidad de instalar ni configurar MySQL.

La base de datos **MySQL** se utilizará cuando el microservicio se integre con la base de datos real del proyecto.

---

# Base de datos InMemory

Actualmente, cuando la aplicación se ejecuta en ambiente `Development`, utiliza:

```csharp
options.UseInMemoryDatabase("PedidosTestDb");
```

Esto permite probar la API sin necesidad de tener la base de datos real.

### Importante

La base de datos InMemory:

- No guarda información permanentemente.
- Se reinicia cuando se detiene la aplicación.
- Es solamente para pruebas.
- No debe utilizarse como base de datos definitiva del sistema.

Por ejemplo:

```text
Ejecutar aplicación
       ↓
Crear pedido ID 1
       ↓
Detener aplicación
       ↓
Ejecutar nuevamente
       ↓
El pedido ID 1 ya no existe
```

---

# Conexión con la base de datos MySQL real

La tabla correspondiente a este microservicio es:

```text
PEDIDOS
```

Con los siguientes campos:

| Campo        | Tipo        | Descripción              |
| ------------ | ----------- | ------------------------ |
| id           | INT         | Identificador del pedido |
| id_carrito   | INT         | ID del carrito           |
| id_cliente   | INT         | ID del cliente           |
| id_direccion | INT         | ID de la dirección       |
| id_tipo_pago | INT         | ID del tipo de pago      |
| id_tarjeta   | INT NULL    | ID de la tarjeta         |
| fecha        | DATETIME    | Fecha del pedido         |
| estado       | VARCHAR(50) | Estado del pedido        |

---

# Configuración segura de la contraseña de MySQL

El proyecto utiliza la configuración de ASP.NET Core para permitir que la cadena de conexión sea reemplazada mediante una variable de entorno.

En `appsettings.json` se mantiene únicamente una contraseña de ejemplo:

```json
{
  "ConnectionStrings": {
    "MySqlBDO2": "Server=localhost;Port=3306;Database=BDO2;User=root;Password=tu_password;"
  }
}
```

La contraseña real se proporciona mediante una variable de entorno.

---

# Configurar la contraseña en Linux

En Linux se puede establecer la cadena de conexión con:

```bash
export ConnectionStrings__MySqlBDO2="Server=localhost;Port=3306;Database=BDO2;User=root;Password=TU_CONTRASEÑA_REAL;"
```

Por ejemplo:

```bash
export ConnectionStrings__MySqlBDO2="Server=localhost;Port=3306;Database=BDO2;User=root;Password=123456;"
```

# Configurar la contraseña en Windows

## Con Powershell

```PowerShell

$env:ConnectionStrings__MySqlBDO2="Server=localhost;Port=3306;Database=BDO2;User=root;Password=TU_CONTRASEÑA_REAL;"
```

## Con .NET

```bash
dotnet user-secrets set "ConnectionStrings:MySqlBDO2" "Server=localhost;Port=3306;Database=BDO2;User=root;Password=TU_CONTRASEÑA_REAL;"
```

ASP.NET Core reconoce:

```text
ConnectionStrings__MySqlBDO2
```

como:

```text
ConnectionStrings:MySqlBDO2
```

Por lo tanto, la variable de entorno sobrescribe el valor de `appsettings.json`.

---

# Ejecutar utilizando MySQL real

El `Program.cs` está configurado para utilizar:

- InMemory en `Development`.
- MySQL en otros ambientes.

Por lo tanto, para probar la conexión con MySQL:

```bash
ASPNETCORE_ENVIRONMENT=Production dotnet run
```

Si la variable de entorno ya está configurada:

```bash
export ConnectionStrings__MySqlBDO2="Server=localhost;Port=3306;Database=BDO2;User=root;Password=TU_CONTRASEÑA_REAL;"
```

se puede ejecutar:

```bash
ASPNETCORE_ENVIRONMENT=Production dotnet run
```

La aplicación intentará conectarse a:

```text
MySQL
  │
  └── BDO2
       │
       └── PEDIDOS
```

---

# Configuración de Program.cs

La lógica utilizada para seleccionar la base de datos es:

```csharp
var connectionString =
    builder.Configuration.GetConnectionString("MySqlBDO2");

if (builder.Environment.IsDevelopment())
{
    builder.Services.AddDbContext<PedidosDbContext>(options =>
        options.UseInMemoryDatabase("PedidosTestDb"));
}
else
{
    builder.Services.AddDbContext<PedidosDbContext>(options =>
        options.UseMySql(
            connectionString,
            ServerVersion.AutoDetect(connectionString)
        ));
}
```

Esto permite que durante el desarrollo se pueda utilizar InMemory sin modificar el código.

Cuando se utilice el ambiente `Production`, se utilizará MySQL.

---

# Integración con los demás microservicios

El microservicio no necesita conocer la implementación interna de otros servicios.

Solamente recibe los identificadores correspondientes.

Por ejemplo:

```json
{
  "idCarrito": 1,
  "idCliente": 10,
  "idDireccion": 5,
  "idTipoPago": 2,
  "idTarjeta": 3
}
```

Los IDs representan entidades administradas por otros módulos:

```text
CARRITO
   │
   └── id_carrito

CLIENTES
   │
   └── id_cliente

DIRECCIONES
   │
   └── id_direccion

TIPOS_PAGO
   │
   └── id_tipo_pago

TARJETAS
   │
   └── id_tarjeta
```

El microservicio de pedidos únicamente registra esos IDs dentro de `PEDIDOS`.

---

# Endpoints

## 1. Registrar pedido

```http
POST /api/Pedidos
```

### Request

```json
{
  "idCarrito": 1,
  "idCliente": 10,
  "idDireccion": 5,
  "idTipoPago": 2,
  "idTarjeta": 3
}
```

### Response

```json
{
  "id": 1,
  "idCarrito": 1,
  "idCliente": 10,
  "idDireccion": 5,
  "idTipoPago": 2,
  "idTarjeta": 3,
  "fecha": "2026-09-27T02:15:49.1528853Z",
  "estado": "Pendiente"
}
```

Estado inicial:

```text
Pendiente
```

---

# 2. Consultar todos los pedidos

```http
GET /api/Pedidos
```

Ejemplo:

```json
[
  {
    "id": 1,
    "idCarrito": 1,
    "idCliente": 10,
    "idDireccion": 5,
    "idTipoPago": 2,
    "idTarjeta": 3,
    "fecha": "2026-09-27T02:15:49.1528853Z",
    "estado": "Pendiente"
  }
]
```

---

# 3. Consultar pedido por ID

```http
GET /api/Pedidos/{id}
```

Ejemplo:

```http
GET /api/Pedidos/1
```

Si existe:

```text
200 OK
```

Si no existe:

```text
404 Not Found
```

---

# 4. Actualizar estado

```http
PATCH /api/Pedidos/{id}/estado
```

Ejemplo:

```http
PATCH /api/Pedidos/1/estado
```

Body:

```json
{
  "estado": "Confirmado"
}
```

Estados actualmente permitidos:

```text
Pendiente
Confirmado
Cancelado
```

---

# Estados del pedido

El campo:

```text
PEDIDOS.estado
```

representa únicamente el estado general del pedido.

Estados disponibles:

| Estado     | Descripción                                  |
| ---------- | -------------------------------------------- |
| Pendiente  | Pedido registrado pero todavía no confirmado |
| Confirmado | Pedido confirmado                            |
| Cancelado  | Pedido cancelado                             |

Los estados de envío, devolución o garantía pertenecen a sus respectivos módulos.

Por ejemplo:

```text
PEDIDOS.estado
       │
       └── Estado general del pedido

ENVIOS.estado
       │
       └── Estado del envío

DEVOLUCIONES_VENTA.estado
       │
       └── Estado de devolución

GARANTIAS.estado
       │
       └── Estado de garantía
```

---

# Prueba rápida

Ejecutar:

```bash
dotnet watch run
```

Abrir Scalar:

```text
http://localhost:5274/Scalar/
```

Ejecutar:

```http
POST /api/Pedidos
```

Con:

```json
{
  "idCarrito": 1,
  "idCliente": 10,
  "idDireccion": 5,
  "idTipoPago": 2,
  "idTarjeta": 3
}
```

Después consultar:

```http
GET /api/Pedidos
```

Y:

```http
GET /api/Pedidos/1
```

Finalmente probar:

```http
PATCH /api/Pedidos/1/estado
```

con:

```json
{
  "estado": "Confirmado"
}
```

---

# Desarrollo local

Para trabajar solamente con InMemory:

```bash
dotnet watch run
```

Para trabajar con la base de datos MySQL:

```bash
export ConnectionStrings__MySqlBDO2="Server=SERVIDOR;Port=3306;Database=BDO2;User=USUARIO;Password=CONTRASEÑA;"
ASPNETCORE_ENVIRONMENT=Production dotnet run
```

---

# Integración futura

La integración esperada es:

```text
                 ┌─────────────────────┐
                 │  Servicio Carrito   │
                 └──────────┬──────────┘
                            │
                            │ id_carrito
                            ▼
                 ┌─────────────────────┐
                 │ Registro de Pedidos │
                 │                     │
                 │      PEDIDOS        │
                 └──────────┬──────────┘
                            │
             ┌──────────────┼──────────────┐
             │              │              │
             ▼              ▼              ▼
          Ventas         Envíos       Historial
```

El servicio de pedidos conserva las referencias mediante IDs y no necesita implementar la lógica interna de esos módulos.

---

# Códigos HTTP utilizados

| Código | Uso                            |
| ------ | ------------------------------ |
| 200    | Operación exitosa              |
| 201    | Pedido creado                  |
| 400    | Datos enviados incorrectamente |
| 404    | Pedido no encontrado           |
| 500    | Error interno del servidor     |

---

# Estado actual

- [x] Registrar pedidos
- [x] Consultar pedidos
- [x] Consultar pedido por ID
- [x] Actualizar estado
- [x] Validación básica de datos
- [x] Scalar
- [x] Entity Framework Core
- [x] Base de datos InMemory para pruebas
- [x] Configuración para MySQL
- [x] Configuración de contraseña mediante variable de entorno
- [x] Preparado para integración con otros servicios
- [ ] Conexión a la BD real del equipo
- [ ] Verificación del esquema definitivo de `PEDIDOS`
- [ ] Verificación de claves foráneas con la BD real

---

# Autor

**Cesar Karass**

Servicio:

**Registro de Pedidos**

Proyecto académico de tienda en línea.
