# Módulo de logística de envíos — Python + Flask + MySQL

Aplicación web para administrar el módulo de logística de una tienda. Permite registrar envíos, consultar su estado, buscar por número de guía y validar la entrega.

## Funciones

- Listar envíos y su dirección.
- Registrar nuevos envíos.
- Validar que la venta y la dirección existan antes de crear un envío.
- Evitar números de guía duplicados.
- Actualizar el estado del envío con estados controlados.
- Buscar envíos por número de guía.
- Registrar la fecha y hora real de entrega.
- Evitar registrar dos veces la entrega del mismo envío.
- Impedir que un envío entregado vuelva a un estado anterior.
- Manejar errores de conexión y operaciones de MySQL sin mostrar detalles internos al usuario.

## Estados permitidos

```text
pendiente
preparando
enviado
en_transito
entregado
cancelado
```

Un envío nuevo puede iniciar únicamente en `pendiente`, `preparando`, `enviado` o `en_transito`.

## Requisitos

- Python 3.10 o superior.
- MySQL 8.x recomendado.
- Visual Studio Code (opcional).
- MySQL Workbench (opcional).

## 1. Crear entorno virtual

Windows:

```bash
python -m venv venv
venv\Scripts\activate
```

macOS/Linux:

```bash
python3 -m venv venv
source venv/bin/activate
```

## 2. Instalar dependencias

```bash
pip install -r requirements.txt
```

## 3. Configurar MySQL

Abre `database.sql` en MySQL Workbench y ejecútalo si necesitas una estructura mínima para probar el módulo.

> Si tu proyecto principal ya tiene `DIRECCIONES`, `VENTAS`, `ENVIOS` y `VALIDACION_ENTREGA`, no reemplaces esas tablas. Compara las columnas con `database.sql` y conserva la estructura de tu proyecto.

El script de prueba utiliza `INSERT IGNORE` para no generar errores por los datos de prueba al ejecutarlo nuevamente.

## 4. Configurar las credenciales

Copia `.env.example` como `.env`:

```text
DB_HOST=localhost
DB_PORT=3306
DB_USER=root
DB_PASSWORD=TU_PASSWORD
DB_NAME=tienda
FLASK_SECRET_KEY=pon-aqui-una-clave-segura
FLASK_DEBUG=0
```

El archivo `.env` está incluido en `.gitignore` para evitar subir contraseñas al repositorio.

También puedes usar las variables de entorno directamente sin crear `.env`.

## 5. Ejecutar

```bash
python app.py
```

Después abre:

```text
http://127.0.0.1:5000
```

Para desarrollo con modo debug:

```text
FLASK_DEBUG=1
```

En Windows PowerShell puedes establecerlo temporalmente con:

```powershell
$env:FLASK_DEBUG="1"
python app.py
```

## Flujo de logística

1. Existe una venta y una dirección.
2. Se registra el envío y se genera/asigna un número de guía.
3. El envío comienza en un estado permitido.
4. Se actualiza su estado conforme avanza.
5. Se puede localizar mediante la guía.
6. Al entregar, se registra fecha/hora en `VALIDACION_ENTREGA`.
7. El envío pasa a `entregado`.
8. Una entrega ya validada no puede registrarse nuevamente.

## Estructura

```text
logistica_envios_python/
├── app.py
├── database.sql
├── requirements.txt
├── .env.example
├── .gitignore
├── README.md
└── templates/
    ├── base.html
    ├── envios.html
    └── nuevo_envio.html
```

## Nota sobre PEDIDOS y COMPROBANTES

El módulo de logística utiliza directamente `VENTAS`, `DIRECCIONES`, `ENVIOS` y `VALIDACION_ENTREGA`. `PEDIDOS` y `COMPROBANTES` forman parte del modelo general indicado, pero no son necesarios para las operaciones principales de este módulo.
