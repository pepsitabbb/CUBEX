"""
CUBEX - Microservicio de LOGÍSTICA Y POSTVENTA (Flask + MySQL) - Puerto 3032

Responsabilidades:
  * Envíos y rastreo (paquetería, guía, fechas, estados e historial).
  * Validación de entregas (administrativa y confirmación del cliente).
  * Garantías.
  * Devoluciones (con reintegro de inventario mediante el servicio 3005).

Seguridad:
  * Personal (ADMIN / VENDEDOR) y clientes se identifican con el JWT de
    microservicio-login. Cada cliente solo accede a sus propios datos.
  * Las existencias NUNCA se modifican aquí: al recibir una devolución
    vendible se solicita el reintegro al microservicio de inventario.
"""

from __future__ import annotations

import json
import os
import uuid
from datetime import date, datetime, timedelta
from decimal import Decimal
from functools import wraps
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.request import Request as URLRequest, urlopen

import mysql.connector
from dotenv import load_dotenv
from flask import Flask, g, jsonify, request, send_file
from flask_cors import CORS
from mysql.connector import Error, IntegrityError

from seguridad import (
    ROLES_PERSONAL,
    ErrorSeguridad,
    es_servicio_interno,
    extraer_token,
    verificar_token,
)

BASE_DIR = Path(__file__).resolve().parent
load_dotenv(BASE_DIR / ".env")

app = Flask(__name__)
app.config["MAX_CONTENT_LENGTH"] = 6 * 1024 * 1024  # 5 MB de imagen + formulario
app.json.ensure_ascii = False

CORS(
    app,
    origins=[
        origen.strip()
        for origen in os.getenv(
            "CORS_ORIGINS", "http://127.0.0.1:5500,http://localhost:5500"
        ).split(",")
        if origen.strip()
    ],
    allow_headers=["Content-Type", "Authorization"],
    methods=["GET", "POST", "PATCH", "OPTIONS"],
)

# =====================================================
# CONFIGURACIÓN
# =====================================================

DB_CONFIG = {
    "host": os.getenv("DB_HOST", "localhost"),
    "user": os.getenv("DB_USER", "root"),
    "password": os.getenv("DB_PASSWORD", ""),
    "database": os.getenv("DB_NAME", "tienda_db"),
    "port": int(os.getenv("DB_PORT", "3306")),
    "charset": "utf8mb4",
    "collation": "utf8mb4_unicode_ci",
    # Las lecturas simples no dejan transacciones abiertas; las escrituras
    # usan start_transaction() explícito con commit/rollback.
    "autocommit": True,
}

INVENTARIO_API_URL = os.getenv(
    "INVENTARIO_API_URL", "http://localhost:3005/api/inventario"
).rstrip("/")

DIAS_DEVOLUCION = int(os.getenv("DIAS_DEVOLUCION", "30"))
DIAS_GARANTIA = int(os.getenv("DIAS_GARANTIA", "90"))

CARPETA_EVIDENCIAS = BASE_DIR / "uploads" / "postventa"
CARPETA_EVIDENCIAS.mkdir(parents=True, exist_ok=True)

# Estados del envío y su orden en la línea de progreso.
ESTADOS_ENVIO = (
    "pendiente",
    "preparando",
    "en_transito",
    "en_reparto",
    "entregado",
    "incidencia",
    "cancelado",
)

ESTADOS_CON_GUIA = ("en_transito", "en_reparto", "entregado")

# Compatibilidad con valores anteriores del módulo.
ALIAS_ESTADOS = {
    "enviado": "en_transito",
    "en tránsito": "en_transito",
    "en transito": "en_transito",
    "en reparto": "en_reparto",
    "preparando envío": "preparando",
    "preparando envio": "preparando",
}

ESTADOS_GARANTIA = ("pendiente", "en_revision", "aprobada", "rechazada", "resuelta")

TRANSICIONES_GARANTIA = {
    "pendiente": ("en_revision", "aprobada", "rechazada"),
    "en_revision": ("aprobada", "rechazada"),
    "aprobada": ("resuelta",),
    "rechazada": (),
    "resuelta": (),
}

ESTADOS_DEVOLUCION = (
    "pendiente",
    "en_revision",
    "aprobada",
    "rechazada",
    "en_proceso",
    "producto_recibido",
    "reembolso_en_proceso",
    "completada",
)

ESTADOS_DEVOLUCION_ACTIVOS = (
    "pendiente",
    "en_revision",
    "aprobada",
    "en_proceso",
    "producto_recibido",
    "reembolso_en_proceso",
)

MOTIVOS_GARANTIA = (
    "Defecto de fabricación",
    "Piezas flojas o que se desprenden",
    "Mecanismo de giro trabado",
    "Calcomanías o colores dañados",
    "Otro",
)

MOTIVOS_DEVOLUCION = (
    "Producto defectuoso",
    "Producto incorrecto",
    "Producto dañado durante el envío",
    "No cumple con lo esperado",
    "Otro",
)

EXTENSIONES_IMAGEN = {".jpg", ".jpeg", ".png", ".webp"}


# =====================================================
# CONEXIÓN Y UTILIDADES
# =====================================================

def get_connection():
    return mysql.connector.connect(**DB_CONFIG)


def close_connection(conn=None, cursor=None):
    if cursor:
        try:
            cursor.close()
        except Error:
            pass

    if conn:
        try:
            if conn.is_connected():
                conn.close()
        except Error:
            pass


class ErrorNegocio(Exception):
    def __init__(self, mensaje: str, status: int = 400, codigo: str = "VALIDACION", detalle=None):
        super().__init__(mensaje)
        self.mensaje = mensaje
        self.status = status
        self.codigo = codigo
        self.detalle = detalle


def error_response(message, status=400, codigo=None, detalle=None):
    cuerpo = {"exitoso": False, "mensaje": message}

    if codigo:
        cuerpo["codigo"] = codigo

    if detalle is not None:
        cuerpo["detalle"] = detalle

    return jsonify(cuerpo), status


def a_json(valor):
    """Convierte fechas y decimales de MySQL a tipos JSON."""
    if isinstance(valor, list):
        return [a_json(v) for v in valor]

    if isinstance(valor, dict):
        return {k: a_json(v) for k, v in valor.items()}

    if isinstance(valor, datetime):
        return valor.strftime("%Y-%m-%d %H:%M:%S")

    if isinstance(valor, date):
        return valor.strftime("%Y-%m-%d")

    if isinstance(valor, Decimal):
        return float(valor)

    if isinstance(valor, (bytes, bytearray)):
        return valor.decode("utf-8", errors="replace")

    return valor


def parse_id(value, nombre):
    try:
        numero = int(value)
        if numero <= 0:
            raise ValueError()
        return numero
    except (TypeError, ValueError):
        raise ErrorNegocio(f"{nombre} debe ser un número entero positivo.")


def parse_datetime(value, nombre="La fecha"):
    if value is None or value == "":
        return None

    if isinstance(value, datetime):
        return value

    texto = str(value).strip()

    for formato in ("%Y-%m-%dT%H:%M", "%Y-%m-%dT%H:%M:%S", "%Y-%m-%d %H:%M:%S", "%Y-%m-%d %H:%M", "%Y-%m-%d"):
        try:
            return datetime.strptime(texto, formato)
        except ValueError:
            continue

    raise ErrorNegocio(f"{nombre} no tiene un formato válido.")


def texto(valor, maximo, nombre, obligatorio=False, minimo=0):
    contenido = str(valor or "").strip()

    if obligatorio and not contenido:
        raise ErrorNegocio(f"{nombre} es obligatorio.")

    if contenido and len(contenido) < minimo:
        raise ErrorNegocio(f"{nombre} debe tener al menos {minimo} caracteres.")

    if len(contenido) > maximo:
        raise ErrorNegocio(f"{nombre} no puede superar {maximo} caracteres.")

    return contenido or None


def normalizar_estado_envio(valor):
    estado = str(valor or "").strip().lower()
    estado = ALIAS_ESTADOS.get(estado, estado)

    if estado not in ESTADOS_ENVIO:
        raise ErrorNegocio("El estado del envío no es válido.")

    return estado


def datos_entrada():
    """Acepta JSON o multipart/form-data."""
    if request.is_json:
        return request.get_json(silent=True) or {}

    return request.form.to_dict()


# =====================================================
# AUTENTICACIÓN Y AUTORIZACIÓN
# =====================================================

def requiere(*roles):
    def decorador(funcion):
        @wraps(funcion)
        def envoltura(*args, **kwargs):
            try:
                g.usuario = verificar_token(extraer_token(request.headers.get("Authorization")))
            except ErrorSeguridad as error:
                return error_response(error.mensaje, error.status, error.codigo)

            if roles and g.usuario["rol"] not in roles:
                return error_response(
                    "Tu cuenta no tiene permisos para esta operación.", 403, "ACCESO_DENEGADO"
                )

            return funcion(*args, **kwargs)

        return envoltura

    return decorador


def es_personal():
    return bool(getattr(g, "usuario", None) and g.usuario["rol"] in ROLES_PERSONAL)


def es_admin():
    return bool(getattr(g, "usuario", None) and g.usuario["rol"] == "ADMIN")


def id_cliente_actual(cursor):
    cursor.execute("SELECT id FROM clientes WHERE id_usuario = %s LIMIT 1", (g.usuario["id"],))
    fila = cursor.fetchone()

    if not fila:
        raise ErrorNegocio("Tu cuenta no tiene un perfil de cliente.", 403, "SIN_PERFIL_CLIENTE")

    return int(fila["id"])


@app.errorhandler(ErrorNegocio)
def manejar_error_negocio(error):
    return error_response(error.mensaje, error.status, error.codigo, error.detalle)


@app.errorhandler(413)
def archivo_grande(_error):
    return error_response("El archivo no puede superar 5 MB.", 413)


@app.errorhandler(404)
def no_encontrado(_error):
    return error_response("Ruta no encontrada.", 404)


# =====================================================
# INVENTARIO (servicio 3005)
# =====================================================

def reintegrar_inventario_devolucion(devolucion, cantidad):
    cuerpo = json.dumps({
        "id_devolucion": devolucion["id"],
        "id_producto": devolucion["id_producto"],
        "cantidad": int(cantidad),
        "id_pedido": devolucion.get("id_pedido"),
        "id_usuario": g.usuario["id"],
        "origen": "logistica-postventa",
    }).encode("utf-8")

    solicitud = URLRequest(
        f"{INVENTARIO_API_URL}/devoluciones/reintegro",
        data=cuerpo,
        method="POST",
        headers={
            "Content-Type": "application/json",
            "X-Servicio-Clave": os.getenv("CUBEX_SERVICE_KEY", "").strip(),
        },
    )

    try:
        with urlopen(solicitud, timeout=15) as respuesta:
            return True, json.loads(respuesta.read().decode("utf-8") or "{}")
    except HTTPError as error:
        try:
            detalle = json.loads(error.read().decode("utf-8") or "{}")
        except ValueError:
            detalle = {}
        return False, {"mensaje": detalle.get("mensaje") or f"Error {error.code} del inventario."}
    except (URLError, TimeoutError, OSError):
        return False, {"mensaje": "El servicio de inventario no está disponible."}


# =====================================================
# EVIDENCIAS (FOTOGRAFÍAS)
# =====================================================

def _firma_imagen_valida(cabecera: bytes, extension: str) -> bool:
    if extension in (".jpg", ".jpeg"):
        return cabecera[:3] == b"\xff\xd8\xff"
    if extension == ".png":
        return cabecera[:8] == b"\x89PNG\r\n\x1a\n"
    if extension == ".webp":
        return cabecera[:4] == b"RIFF" and cabecera[8:12] == b"WEBP"
    return False


def guardar_evidencia(prefijo: str):
    archivo = request.files.get("evidencia")

    if not archivo or not archivo.filename:
        return None

    extension = Path(archivo.filename).suffix.lower()

    if extension not in EXTENSIONES_IMAGEN:
        raise ErrorNegocio("La evidencia debe ser una imagen JPG, PNG o WEBP.")

    contenido = archivo.read()

    if len(contenido) > 5 * 1024 * 1024:
        raise ErrorNegocio("La imagen no puede superar 5 MB.", 413)

    if not _firma_imagen_valida(contenido[:16], extension):
        raise ErrorNegocio("El archivo no es una imagen válida.")

    nombre = f"{prefijo}-{uuid.uuid4().hex}{'.jpg' if extension == '.jpeg' else extension}"
    (CARPETA_EVIDENCIAS / nombre).write_bytes(contenido)
    return nombre


def eliminar_evidencia(nombre):
    if nombre:
        try:
            (CARPETA_EVIDENCIAS / nombre).unlink(missing_ok=True)
        except OSError:
            pass


# =====================================================
# SALUD
# =====================================================

@app.route("/", methods=["GET"])
def inicio():
    return jsonify({
        "exitoso": True,
        "mensaje": "Microservicio de logística y postventa CUBEX activo.",
        "puerto": int(os.getenv("PORT", "3032")),
    })


@app.route("/api/salud", methods=["GET"])
def salud():
    conn = cursor = None
    try:
        conn = get_connection()
        cursor = conn.cursor()
        cursor.execute("SELECT DATABASE()")
        base = cursor.fetchone()[0]
        return jsonify({"exitoso": True, "base": base})
    except Error:
        return error_response("Sin conexión a MySQL.", 503)
    finally:
        close_connection(conn, cursor)


@app.route("/api/postventa/catalogos", methods=["GET"])
def catalogos():
    return jsonify({
        "exitoso": True,
        "datos": {
            "estados_envio": ESTADOS_ENVIO,
            "estados_garantia": ESTADOS_GARANTIA,
            "estados_devolucion": ESTADOS_DEVOLUCION,
            "motivos_garantia": MOTIVOS_GARANTIA,
            "motivos_devolucion": MOTIVOS_DEVOLUCION,
            "dias_devolucion": DIAS_DEVOLUCION,
            "dias_garantia": DIAS_GARANTIA,
        },
    })


# =====================================================
# ENVÍOS - CONSULTAS DEL PERSONAL
# =====================================================

SQL_ENVIO_BASE = """
    SELECT
        e.id,
        e.id_venta,
        v.id_pedido,
        e.id_direccion,
        e.paqueteria,
        e.num_guia,
        e.estado,
        e.fecha_envio,
        e.fecha_estimada_entrega,
        e.observaciones,
        e.fecha_creacion,
        e.fecha_actualizacion,
        p.fecha AS fecha_pedido,
        p.total,
        c.id AS id_cliente,
        COALESCE(NULLIF(TRIM(u.nombre_completo), ''), u.nombre_usuario) AS cliente_nombre,
        u.email AS cliente_correo,
        u.telefono AS cliente_telefono,
        d.calle_numero,
        d.colonia,
        d.ciudad,
        d.codigo_postal,
        d.referencias,
        ve.id AS id_validacion,
        ve.estado AS estado_validacion,
        ve.fecha_entrega_real,
        ve.recibido_por,
        ve.observaciones AS observaciones_entrega,
        ve.firma_evidencia,
        ve.confirmado_cliente,
        ve.fecha_confirmacion_cliente,
        ve.comentario_cliente,
        uv.nombre_usuario AS validado_por,
        (e.estado NOT IN ('entregado', 'cancelado')
            AND e.fecha_estimada_entrega IS NOT NULL
            AND e.fecha_estimada_entrega < NOW()) AS retrasado
    FROM envios e
    INNER JOIN ventas v ON v.id = e.id_venta
    INNER JOIN pedidos p ON p.id = v.id_pedido
    INNER JOIN clientes c ON c.id = p.id_cliente
    LEFT JOIN usuarios u ON u.id = c.id_usuario
    LEFT JOIN direcciones d ON d.id = e.id_direccion
    LEFT JOIN validacion_entrega ve ON ve.id_envio = e.id
    LEFT JOIN usuarios uv ON uv.id = ve.id_usuario_valido
"""


def normalizar_envio(fila):
    envio = a_json(dict(fila))
    envio["retrasado"] = bool(envio.get("retrasado"))
    envio["confirmado_cliente"] = bool(envio.get("confirmado_cliente"))
    envio["validado"] = envio.get("estado_validacion") in ("validada", "entregado")
    return envio


def historial_envios(cursor, ids):
    if not ids:
        return {}

    marcadores = ",".join(["%s"] * len(ids))
    cursor.execute(
        f"""
        SELECT h.id, h.id_envio, h.estado, h.descripcion, h.ubicacion, h.fecha,
               u.nombre_usuario AS registrado_por
        FROM historial_envios h
        LEFT JOIN usuarios u ON u.id = h.id_usuario
        WHERE h.id_envio IN ({marcadores})
        ORDER BY h.fecha ASC, h.id ASC
        """,
        tuple(ids),
    )

    agrupado = {}

    for fila in cursor.fetchall():
        agrupado.setdefault(fila["id_envio"], []).append(a_json(fila))

    return agrupado


@app.route("/api/envios", methods=["GET"])
@requiere(*ROLES_PERSONAL)
def listar_envios():
    estado = str(request.args.get("estado", "")).strip().lower()
    busqueda = str(request.args.get("q", "")).strip()[:80]
    solo_retrasados = request.args.get("retrasados") == "1"

    condiciones = []
    valores = []

    if estado:
        condiciones.append("e.estado = %s")
        valores.append(normalizar_estado_envio(estado))

    if busqueda:
        condiciones.append(
            "(e.num_guia LIKE %s OR CAST(v.id_pedido AS CHAR) = %s "
            "OR u.nombre_completo LIKE %s OR u.nombre_usuario LIKE %s)"
        )
        patron = f"%{busqueda}%"
        valores.extend([patron, busqueda.lstrip("#"), patron, patron])

    if solo_retrasados:
        condiciones.append(
            "e.estado NOT IN ('entregado','cancelado') AND e.fecha_estimada_entrega < NOW()"
        )

    conn = cursor = None

    try:
        conn = get_connection()
        cursor = conn.cursor(dictionary=True)
        cursor.execute(
            SQL_ENVIO_BASE
            + (f" WHERE {' AND '.join(condiciones)}" if condiciones else "")
            + " ORDER BY e.id DESC LIMIT 500",
            tuple(valores),
        )
        envios = [normalizar_envio(e) for e in cursor.fetchall()]

        cursor.execute(
            """
            SELECT
                COUNT(*) AS total,
                SUM(estado = 'pendiente' OR estado = 'preparando') AS pendientes,
                SUM(estado = 'en_transito' OR estado = 'en_reparto') AS en_camino,
                SUM(estado = 'entregado') AS entregados,
                SUM(estado = 'incidencia') AS incidencias,
                SUM(estado NOT IN ('entregado','cancelado')
                    AND fecha_estimada_entrega IS NOT NULL
                    AND fecha_estimada_entrega < NOW()) AS retrasados
            FROM envios
            """
        )
        resumen = a_json(cursor.fetchone())

        return jsonify({
            "exitoso": True,
            "total": len(envios),
            "resumen": {k: int(v or 0) for k, v in resumen.items()},
            "datos": envios,
        })

    except Error:
        app.logger.exception("Error al consultar envíos")
        return error_response("No fue posible consultar los envíos.", 500)

    finally:
        close_connection(conn, cursor)


@app.route("/api/envios/por-enviar", methods=["GET"])
@requiere(*ROLES_PERSONAL)
def pedidos_por_enviar():
    """Pedidos confirmados (con venta) que todavía no tienen envío."""
    conn = cursor = None

    try:
        conn = get_connection()
        cursor = conn.cursor(dictionary=True)
        cursor.execute(
            """
            SELECT
                p.id AS id_pedido,
                v.id AS id_venta,
                p.fecha,
                COALESCE(p.total, v.total) AS total,
                COALESCE(NULLIF(TRIM(u.nombre_completo), ''), u.nombre_usuario) AS cliente_nombre,
                u.email AS cliente_correo,
                d.id AS id_direccion,
                d.calle_numero, d.colonia, d.ciudad, d.codigo_postal, d.referencias,
                (SELECT COALESCE(SUM(dv.cantidad), 0) FROM detalle_ventas dv WHERE dv.id_venta = v.id) AS articulos
            FROM ventas v
            INNER JOIN pedidos p ON p.id = v.id_pedido
            INNER JOIN clientes c ON c.id = p.id_cliente
            LEFT JOIN usuarios u ON u.id = c.id_usuario
            LEFT JOIN direcciones d ON d.id = p.id_direccion
            LEFT JOIN envios e ON e.id_venta = v.id
            WHERE v.estado = 'confirmada'
              AND LOWER(p.estado) = 'confirmado'
              AND e.id IS NULL
            ORDER BY p.fecha ASC
            """
        )
        return jsonify({"exitoso": True, "datos": a_json(cursor.fetchall())})

    except Error:
        app.logger.exception("Error al consultar pedidos por enviar")
        return error_response("No fue posible consultar los pedidos por enviar.", 500)

    finally:
        close_connection(conn, cursor)


@app.route("/api/envios/buscar", methods=["GET"])
@requiere(*ROLES_PERSONAL)
def buscar_envio():
    guia = request.args.get("guia", "").strip()

    if not guia:
        return error_response("Escribe un número de guía o de pedido para buscar.")

    conn = cursor = None

    try:
        conn = get_connection()
        cursor = conn.cursor(dictionary=True)
        cursor.execute(
            SQL_ENVIO_BASE + " WHERE e.num_guia LIKE %s OR CAST(v.id_pedido AS CHAR) = %s ORDER BY e.id DESC",
            (f"%{guia}%", guia.lstrip("#")),
        )
        resultados = [normalizar_envio(e) for e in cursor.fetchall()]
        return jsonify({"exitoso": True, "total": len(resultados), "datos": resultados})

    except Error:
        app.logger.exception("Error al buscar envío")
        return error_response("No fue posible realizar la búsqueda.", 500)

    finally:
        close_connection(conn, cursor)


def productos_de_venta(cursor, id_venta):
    cursor.execute(
        """
        SELECT dv.id_producto, pr.nombre, pr.imagen, dv.cantidad, dv.precio_unitario,
               ROUND(dv.cantidad * dv.precio_unitario, 2) AS subtotal
        FROM detalle_ventas dv
        INNER JOIN productos pr ON pr.id = dv.id_producto
        WHERE dv.id_venta = %s
        ORDER BY pr.nombre
        """,
        (id_venta,),
    )
    return a_json(cursor.fetchall())


@app.route("/api/envios/<int:id_envio>", methods=["GET"])
@requiere(*ROLES_PERSONAL)
def detalle_envio(id_envio):
    conn = cursor = None

    try:
        conn = get_connection()
        cursor = conn.cursor(dictionary=True)
        cursor.execute(SQL_ENVIO_BASE + " WHERE e.id = %s", (id_envio,))
        fila = cursor.fetchone()

        if not fila:
            return error_response("El envío no existe.", 404)

        envio = normalizar_envio(fila)
        envio["historial"] = historial_envios(cursor, [id_envio]).get(id_envio, [])
        envio["productos"] = productos_de_venta(cursor, envio["id_venta"])
        return jsonify({"exitoso": True, "datos": envio})

    except Error:
        app.logger.exception("Error al consultar envío")
        return error_response("No fue posible consultar el envío.", 500)

    finally:
        close_connection(conn, cursor)


# =====================================================
# ENVÍOS - REGISTRO Y ACTUALIZACIÓN
# =====================================================

def validar_datos_envio(datos, actual=None):
    """Valida y normaliza los campos de un envío nuevo o actualizado."""
    actual = actual or {}

    estado = normalizar_estado_envio(datos.get("estado", actual.get("estado") or "pendiente"))

    paqueteria = texto(
        datos.get("paqueteria", actual.get("paqueteria")), 100, "La paquetería"
    )
    num_guia = texto(datos.get("num_guia", actual.get("num_guia")), 100, "El número de guía")

    fecha_envio = (
        parse_datetime(datos.get("fecha_envio"), "La fecha de envío")
        if "fecha_envio" in datos
        else actual.get("fecha_envio")
    )

    fecha_estimada = (
        parse_datetime(datos.get("fecha_estimada_entrega"), "La fecha estimada")
        if "fecha_estimada_entrega" in datos
        else actual.get("fecha_estimada_entrega")
    )

    observaciones = texto(
        datos.get("observaciones", actual.get("observaciones")), 500, "Las observaciones"
    )

    if num_guia and not paqueteria:
        raise ErrorNegocio("Indica la paquetería del número de guía.")

    if estado in ESTADOS_CON_GUIA and not num_guia:
        raise ErrorNegocio("Para marcar el envío en tránsito, en reparto o entregado se necesita el número de guía.")

    if estado in ESTADOS_CON_GUIA and not fecha_envio:
        fecha_envio = datetime.now()

    if fecha_envio and fecha_estimada and fecha_estimada < fecha_envio.replace(hour=0, minute=0, second=0):
        raise ErrorNegocio("La entrega estimada no puede ser anterior a la fecha de envío.")

    return {
        "estado": estado,
        "paqueteria": paqueteria,
        "num_guia": num_guia,
        "fecha_envio": fecha_envio,
        "fecha_estimada_entrega": fecha_estimada,
        "observaciones": observaciones,
    }


@app.route("/api/envios", methods=["POST"])
@requiere(*ROLES_PERSONAL)
def registrar_envio():
    datos = request.get_json(silent=True) or {}
    conn = cursor = None

    try:
        if datos.get("id_pedido"):
            id_pedido = parse_id(datos.get("id_pedido"), "El número de pedido")
            id_venta = None
        else:
            id_pedido = None
            id_venta = parse_id(datos.get("id_venta"), "El ID de venta")

        campos = validar_datos_envio(datos)

        if campos["estado"] in ("entregado", "cancelado"):
            raise ErrorNegocio("Un envío nuevo no puede iniciar como entregado o cancelado.")

        conn = get_connection()
        cursor = conn.cursor(dictionary=True)
        conn.start_transaction()

        cursor.execute(
            f"""
            SELECT v.id AS id_venta, v.estado AS estado_venta, p.id AS id_pedido,
                   p.estado AS estado_pedido, p.id_direccion
            FROM ventas v
            INNER JOIN pedidos p ON p.id = v.id_pedido
            WHERE {'p.id' if id_pedido else 'v.id'} = %s
            FOR UPDATE
            """,
            (id_pedido or id_venta,),
        )
        venta = cursor.fetchone()

        if not venta:
            raise ErrorNegocio(
                "El pedido no tiene una venta confirmada. Solo se envían pedidos pagados.", 404
            )

        if venta["estado_venta"] != "confirmada" or str(venta["estado_pedido"]).lower() != "confirmado":
            raise ErrorNegocio("El pedido no está confirmado o fue cancelado.", 409)

        cursor.execute("SELECT id FROM envios WHERE id_venta = %s", (venta["id_venta"],))

        if cursor.fetchone():
            raise ErrorNegocio("Este pedido ya tiene un envío registrado. Actualízalo en lugar de crear otro.", 409)

        if campos["num_guia"]:
            cursor.execute("SELECT id FROM envios WHERE num_guia = %s", (campos["num_guia"],))
            if cursor.fetchone():
                raise ErrorNegocio("Ya existe un envío con ese número de guía.", 409)

        cursor.execute(
            """
            INSERT INTO envios (
                id_venta, id_direccion, paqueteria, num_guia, estado,
                fecha_envio, fecha_estimada_entrega, observaciones, id_usuario_registro
            )
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
            """,
            (
                venta["id_venta"],
                venta["id_direccion"],
                campos["paqueteria"],
                campos["num_guia"],
                campos["estado"],
                campos["fecha_envio"],
                campos["fecha_estimada_entrega"],
                campos["observaciones"],
                g.usuario["id"],
            ),
        )
        nuevo_id = cursor.lastrowid

        descripcion = "Envío registrado"
        if campos["num_guia"]:
            descripcion += f" con guía {campos['num_guia']} ({campos['paqueteria']})"
        else:
            descripcion += "; guía pendiente de asignación"

        cursor.execute(
            """
            INSERT INTO historial_envios (id_envio, estado, descripcion, ubicacion, id_usuario)
            VALUES (%s, %s, %s, %s, %s)
            """,
            (
                nuevo_id,
                campos["estado"],
                texto(datos.get("descripcion"), 500, "La descripción") or descripcion,
                texto(datos.get("ubicacion"), 150, "La ubicación"),
                g.usuario["id"],
            ),
        )

        conn.commit()

        return jsonify({"exitoso": True, "mensaje": "Envío registrado correctamente.", "id": nuevo_id}), 201

    except ErrorNegocio:
        if conn:
            conn.rollback()
        raise

    except IntegrityError:
        if conn:
            conn.rollback()
        return error_response("El pedido ya tiene envío o la guía está duplicada.", 409)

    except Error:
        if conn:
            conn.rollback()
        app.logger.exception("Error al registrar envío")
        return error_response("Ocurrió un error al registrar el envío.", 500)

    finally:
        close_connection(conn, cursor)


@app.route("/api/envios/<int:id_envio>", methods=["PATCH"])
@requiere(*ROLES_PERSONAL)
def actualizar_envio(id_envio):
    datos = request.get_json(silent=True) or {}
    conn = cursor = None

    try:
        conn = get_connection()
        cursor = conn.cursor(dictionary=True)
        conn.start_transaction()

        cursor.execute(
            """
            SELECT e.*, v.estado AS estado_venta
            FROM envios e
            INNER JOIN ventas v ON v.id = e.id_venta
            WHERE e.id = %s
            FOR UPDATE
            """,
            (id_envio,),
        )
        envio = cursor.fetchone()

        if not envio:
            raise ErrorNegocio("El envío no existe.", 404)

        estado_actual = ALIAS_ESTADOS.get(envio["estado"], envio["estado"]) or "pendiente"
        campos = validar_datos_envio(datos, envio)
        nuevo_estado = campos["estado"]

        if estado_actual == "entregado" and nuevo_estado != "entregado":
            raise ErrorNegocio("Un envío entregado no puede regresar a un estado anterior.", 409)

        if estado_actual == "cancelado" and nuevo_estado != "cancelado":
            if envio["estado_venta"] != "confirmada":
                raise ErrorNegocio("El pedido fue cancelado; el envío no puede reactivarse.", 409)

        if campos["num_guia"]:
            cursor.execute(
                "SELECT id FROM envios WHERE num_guia = %s AND id <> %s",
                (campos["num_guia"], id_envio),
            )
            if cursor.fetchone():
                raise ErrorNegocio("Ese número de guía ya está registrado en otro envío.", 409)

        cursor.execute(
            """
            UPDATE envios
            SET paqueteria = %s, num_guia = %s, estado = %s,
                fecha_envio = %s, fecha_estimada_entrega = %s, observaciones = %s
            WHERE id = %s
            """,
            (
                campos["paqueteria"],
                campos["num_guia"],
                nuevo_estado,
                campos["fecha_envio"],
                campos["fecha_estimada_entrega"],
                campos["observaciones"],
                id_envio,
            ),
        )

        cambios = []
        if nuevo_estado != estado_actual:
            cambios.append(f"Estado: {estado_actual} → {nuevo_estado}")
        if (campos["num_guia"] or None) != (envio["num_guia"] or None):
            cambios.append(f"Guía asignada: {campos['num_guia']} ({campos['paqueteria']})")
        if campos["fecha_estimada_entrega"] != envio["fecha_estimada_entrega"]:
            cambios.append("Entrega estimada actualizada")

        descripcion = texto(datos.get("descripcion"), 500, "La descripción")
        ubicacion = texto(datos.get("ubicacion"), 150, "La ubicación")

        # Solo se registran movimientos reales capturados por el personal.
        if cambios or descripcion:
            cursor.execute(
                """
                INSERT INTO historial_envios (id_envio, estado, descripcion, ubicacion, id_usuario)
                VALUES (%s, %s, %s, %s, %s)
                """,
                (
                    id_envio,
                    nuevo_estado,
                    descripcion or "; ".join(cambios),
                    ubicacion,
                    g.usuario["id"],
                ),
            )

        conn.commit()
        return jsonify({"exitoso": True, "mensaje": "Envío actualizado correctamente."})

    except ErrorNegocio:
        if conn:
            conn.rollback()
        raise

    except IntegrityError:
        if conn:
            conn.rollback()
        return error_response("Ese número de guía ya está registrado.", 409)

    except Error:
        if conn:
            conn.rollback()
        app.logger.exception("Error al actualizar envío")
        return error_response("No fue posible actualizar el envío.", 500)

    finally:
        close_connection(conn, cursor)


# =====================================================
# VALIDACIÓN DE ENTREGAS
# =====================================================

@app.route("/api/entregas", methods=["GET"])
@requiere(*ROLES_PERSONAL)
def listar_entregas():
    """Envíos en reparto o entregados, con su validación (si existe)."""
    filtro = request.args.get("filtro", "")

    condicion = "e.estado IN ('en_reparto', 'entregado')"

    if filtro == "pendientes":
        condicion += " AND (ve.id IS NULL OR ve.estado NOT IN ('validada', 'entregado'))"
    elif filtro == "validadas":
        condicion += " AND ve.estado IN ('validada', 'entregado')"

    conn = cursor = None

    try:
        conn = get_connection()
        cursor = conn.cursor(dictionary=True)
        cursor.execute(SQL_ENVIO_BASE + f" WHERE {condicion} ORDER BY e.fecha_actualizacion DESC LIMIT 500")
        return jsonify({"exitoso": True, "datos": [normalizar_envio(f) for f in cursor.fetchall()]})

    except Error:
        app.logger.exception("Error al consultar entregas")
        return error_response("No fue posible consultar las entregas.", 500)

    finally:
        close_connection(conn, cursor)


@app.route("/api/envios/<int:id_envio>/entregar", methods=["POST"])
@requiere(*ROLES_PERSONAL)
def validar_entrega(id_envio):
    datos = request.get_json(silent=True) or {}
    conn = cursor = None

    try:
        recibido_por = texto(datos.get("recibido_por"), 150, "El nombre de quien recibió", obligatorio=True, minimo=3)
        observaciones = texto(datos.get("observaciones"), 500, "Las observaciones")
        firma = texto(datos.get("firma_evidencia"), 255, "La evidencia")
        fecha_real = parse_datetime(datos.get("fecha_recepcion"), "La fecha de recepción") or datetime.now()

        if fecha_real > datetime.now() + timedelta(minutes=5):
            raise ErrorNegocio("La fecha de recepción no puede estar en el futuro.")

        conn = get_connection()
        cursor = conn.cursor(dictionary=True)
        conn.start_transaction()

        # Bloquea el envío para evitar dos validaciones simultáneas.
        cursor.execute("SELECT id, estado, num_guia, fecha_envio FROM envios WHERE id = %s FOR UPDATE", (id_envio,))
        envio = cursor.fetchone()

        if not envio:
            raise ErrorNegocio("El envío no existe.", 404)

        if envio["estado"] == "cancelado":
            raise ErrorNegocio("Un envío cancelado no puede marcarse como entregado.", 409)

        if not envio["num_guia"]:
            raise ErrorNegocio("Asigna primero la paquetería y el número de guía del envío.", 409)

        if envio["fecha_envio"] and fecha_real < envio["fecha_envio"].replace(hour=0, minute=0, second=0):
            raise ErrorNegocio("La fecha de recepción no puede ser anterior al envío.")

        cursor.execute(
            "SELECT id, estado FROM validacion_entrega WHERE id_envio = %s FOR UPDATE",
            (id_envio,),
        )
        previa = cursor.fetchone()

        if previa and previa["estado"] in ("validada", "entregado"):
            raise ErrorNegocio("Este envío ya cuenta con una validación de entrega.", 409, "YA_VALIDADO")

        if previa:
            # El cliente ya había confirmado; se completa la validación administrativa.
            cursor.execute(
                """
                UPDATE validacion_entrega
                SET fecha_entrega_real = %s, firma_evidencia = %s, estado = 'validada',
                    recibido_por = %s, observaciones = %s, id_usuario_valido = %s,
                    fecha_registro = NOW()
                WHERE id = %s
                """,
                (fecha_real, firma, recibido_por, observaciones, g.usuario["id"], previa["id"]),
            )
        else:
            cursor.execute(
                """
                INSERT INTO validacion_entrega (
                    id_envio, fecha_entrega_real, firma_evidencia, estado,
                    recibido_por, observaciones, id_usuario_valido
                )
                VALUES (%s, %s, %s, 'validada', %s, %s, %s)
                """,
                (id_envio, fecha_real, firma, recibido_por, observaciones, g.usuario["id"]),
            )

        if envio["estado"] != "entregado":
            cursor.execute("UPDATE envios SET estado = 'entregado' WHERE id = %s", (id_envio,))

        cursor.execute(
            """
            INSERT INTO historial_envios (id_envio, estado, descripcion, id_usuario)
            VALUES (%s, 'entregado', %s, %s)
            """,
            (id_envio, f"Entrega validada. Recibió: {recibido_por}", g.usuario["id"]),
        )

        conn.commit()

        return jsonify({
            "exitoso": True,
            "mensaje": "Entrega validada correctamente.",
            "fecha_entrega_real": fecha_real.strftime("%Y-%m-%d %H:%M:%S"),
        })

    except ErrorNegocio:
        if conn:
            conn.rollback()
        raise

    except IntegrityError:
        if conn:
            conn.rollback()
        return error_response("Este envío ya cuenta con una validación de entrega.", 409, "YA_VALIDADO")

    except Error:
        if conn:
            conn.rollback()
        app.logger.exception("Error al validar entrega")
        return error_response("No fue posible validar la entrega.", 500)

    finally:
        close_connection(conn, cursor)


# =====================================================
# CLIENTE - MIS ENVÍOS
# =====================================================

@app.route("/api/clientes/mis-envios", methods=["GET"])
@requiere("CLIENTE")
def mis_envios():
    conn = cursor = None

    try:
        conn = get_connection()
        cursor = conn.cursor(dictionary=True)
        id_cliente = id_cliente_actual(cursor)

        # Solo información útil para el cliente (sin notas internas).
        cursor.execute(
            """
            SELECT
                p.id AS id_pedido,
                p.fecha AS fecha_pedido,
                p.estado AS estado_pedido,
                COALESCE(p.total, v.total) AS total,
                v.id AS id_venta,
                e.id AS id_envio,
                e.paqueteria,
                e.num_guia,
                e.estado AS estado_envio,
                e.fecha_envio,
                e.fecha_estimada_entrega,
                d.calle_numero, d.colonia, d.ciudad, d.codigo_postal,
                ve.estado AS estado_validacion,
                ve.fecha_entrega_real,
                ve.recibido_por,
                ve.observaciones AS nota_entrega,
                ve.confirmado_cliente,
                ve.fecha_confirmacion_cliente,
                ve.comentario_cliente,
                (e.estado NOT IN ('entregado','cancelado')
                    AND e.fecha_estimada_entrega IS NOT NULL
                    AND e.fecha_estimada_entrega < NOW()) AS retrasado
            FROM pedidos p
            INNER JOIN ventas v ON v.id_pedido = p.id
            LEFT JOIN envios e ON e.id_venta = v.id
            LEFT JOIN direcciones d ON d.id = COALESCE(e.id_direccion, p.id_direccion)
            LEFT JOIN validacion_entrega ve ON ve.id_envio = e.id
            WHERE p.id_cliente = %s
            ORDER BY p.fecha DESC, p.id DESC
            """,
            (id_cliente,),
        )
        filas = [a_json(f) for f in cursor.fetchall()]

        historial = historial_envios(cursor, [f["id_envio"] for f in filas if f["id_envio"]])

        for fila in filas:
            fila["retrasado"] = bool(fila.get("retrasado"))
            fila["confirmado_cliente"] = bool(fila.get("confirmado_cliente"))
            fila["validado"] = fila.get("estado_validacion") in ("validada", "entregado")
            fila["historial"] = [
                {k: v for k, v in h.items() if k != "registrado_por"}
                for h in historial.get(fila["id_envio"], [])
            ]
            fila["productos"] = productos_de_venta(cursor, fila["id_venta"])

        return jsonify({"exitoso": True, "datos": filas})

    except Error:
        app.logger.exception("Error al consultar envíos del cliente")
        return error_response("No fue posible consultar tus envíos.", 500)

    finally:
        close_connection(conn, cursor)


@app.route("/api/clientes/envios/<int:id_envio>/confirmar-recepcion", methods=["POST"])
@requiere("CLIENTE")
def confirmar_recepcion_cliente(id_envio):
    datos = request.get_json(silent=True) or {}
    conn = cursor = None

    try:
        comentario = texto(datos.get("comentario"), 500, "El comentario")

        conn = get_connection()
        cursor = conn.cursor(dictionary=True)
        id_cliente = id_cliente_actual(cursor)
        conn.start_transaction()

        cursor.execute(
            """
            SELECT e.id, e.estado
            FROM envios e
            INNER JOIN ventas v ON v.id = e.id_venta
            INNER JOIN pedidos p ON p.id = v.id_pedido
            WHERE e.id = %s AND p.id_cliente = %s
            FOR UPDATE
            """,
            (id_envio, id_cliente),
        )
        envio = cursor.fetchone()

        if not envio:
            raise ErrorNegocio("El envío no existe.", 404)

        if envio["estado"] not in ("en_reparto", "entregado"):
            raise ErrorNegocio("Podrás confirmar la recepción cuando el envío esté en reparto o entregado.", 409)

        cursor.execute(
            "SELECT id, confirmado_cliente FROM validacion_entrega WHERE id_envio = %s FOR UPDATE",
            (id_envio,),
        )
        validacion = cursor.fetchone()

        if validacion and validacion["confirmado_cliente"]:
            raise ErrorNegocio("Ya confirmaste la recepción de este pedido.", 409)

        if validacion:
            cursor.execute(
                """
                UPDATE validacion_entrega
                SET confirmado_cliente = 1, fecha_confirmacion_cliente = NOW(), comentario_cliente = %s
                WHERE id = %s
                """,
                (comentario, validacion["id"]),
            )
        else:
            # No sustituye la validación administrativa: queda pendiente.
            cursor.execute(
                """
                INSERT INTO validacion_entrega (
                    id_envio, estado, confirmado_cliente, fecha_confirmacion_cliente, comentario_cliente
                )
                VALUES (%s, 'confirmada_cliente', 1, NOW(), %s)
                """,
                (id_envio, comentario),
            )

        cursor.execute(
            """
            INSERT INTO historial_envios (id_envio, estado, descripcion, id_usuario)
            VALUES (%s, %s, 'El cliente confirmó la recepción del pedido', %s)
            """,
            (id_envio, envio["estado"], g.usuario["id"]),
        )

        conn.commit()
        return jsonify({"exitoso": True, "mensaje": "¡Gracias! Registramos que recibiste tu pedido."})

    except ErrorNegocio:
        if conn:
            conn.rollback()
        raise

    except Error:
        if conn:
            conn.rollback()
        app.logger.exception("Error al confirmar recepción")
        return error_response("No fue posible registrar la confirmación.", 500)

    finally:
        close_connection(conn, cursor)


# =====================================================
# POSTVENTA - PRODUCTOS ELEGIBLES DEL CLIENTE
# =====================================================

def consultar_compras_cliente(cursor, id_cliente, id_pedido=None, id_producto=None, bloquear=False):
    condiciones = ["v.id_cliente = %s", "v.estado = 'confirmada'", "LOWER(p.estado) = 'confirmado'"]
    valores = [id_cliente]

    if id_pedido:
        condiciones.append("p.id = %s")
        valores.append(id_pedido)

    if id_producto:
        condiciones.append("dv.id_producto = %s")
        valores.append(id_producto)

    cursor.execute(
        f"""
        SELECT
            v.id AS id_venta,
            p.id AS id_pedido,
            p.fecha AS fecha_compra,
            dv.id AS id_detalle,
            dv.id_producto,
            pr.nombre,
            pr.imagen,
            dv.cantidad,
            dv.precio_unitario,
            e.estado AS estado_envio,
            ve.estado AS estado_validacion,
            COALESCE(
                ve.fecha_entrega_real,
                ve.fecha_confirmacion_cliente,
                CASE WHEN e.estado = 'entregado' THEN e.fecha_actualizacion END
            ) AS fecha_entrega,
            (SELECT COALESCE(SUM(d2.cantidad), 0)
               FROM devoluciones_venta d2
              WHERE d2.id_venta = v.id AND d2.id_producto = dv.id_producto
                AND (d2.estado IS NULL OR d2.estado <> 'rechazada')) AS cantidad_en_devolucion,
            (SELECT COUNT(*)
               FROM devoluciones_venta d3
              WHERE d3.id_venta = v.id AND d3.id_producto = dv.id_producto
                AND d3.estado IN ('pendiente','en_revision','aprobada','en_proceso',
                                  'producto_recibido','reembolso_en_proceso')) AS devoluciones_activas,
            (SELECT COUNT(*)
               FROM garantias g2
              WHERE g2.id_venta = v.id AND g2.id_producto = dv.id_producto
                AND g2.estado IN ('pendiente','en_revision','aprobada')) AS garantias_activas
        FROM ventas v
        INNER JOIN pedidos p ON p.id = v.id_pedido
        INNER JOIN detalle_ventas dv ON dv.id_venta = v.id
        INNER JOIN productos pr ON pr.id = dv.id_producto
        LEFT JOIN envios e ON e.id_venta = v.id
        LEFT JOIN validacion_entrega ve ON ve.id_envio = e.id
        WHERE {' AND '.join(condiciones)}
        ORDER BY p.fecha DESC, pr.nombre
        {'FOR UPDATE' if bloquear else ''}
        """,
        tuple(valores),
    )

    resultado = []
    ahora = datetime.now()

    for fila in cursor.fetchall():
        entregado = fila["estado_envio"] == "entregado" or fila["estado_validacion"] in ("validada", "entregado")
        fecha_entrega = fila["fecha_entrega"]
        dias = (ahora - fecha_entrega).days if (entregado and fecha_entrega) else None
        disponible = int(fila["cantidad"]) - int(fila["cantidad_en_devolucion"] or 0)

        motivo_devolucion = None
        if not entregado:
            motivo_devolucion = "Disponible cuando el pedido se haya entregado."
        elif dias is not None and dias > DIAS_DEVOLUCION:
            motivo_devolucion = f"El plazo de devolución ({DIAS_DEVOLUCION} días) terminó."
        elif int(fila["devoluciones_activas"] or 0) > 0:
            motivo_devolucion = "Ya tienes una devolución en curso para este producto."
        elif disponible <= 0:
            motivo_devolucion = "Ya solicitaste la devolución de todas las unidades."

        motivo_garantia = None
        if not entregado:
            motivo_garantia = "Disponible cuando el pedido se haya entregado."
        elif dias is not None and dias > DIAS_GARANTIA:
            motivo_garantia = f"La garantía ({DIAS_GARANTIA} días) terminó."
        elif int(fila["garantias_activas"] or 0) > 0:
            motivo_garantia = "Ya tienes una garantía en curso para este producto."

        item = a_json(dict(fila))
        item.update({
            "entregado": entregado,
            "dias_desde_entrega": dias,
            "cantidad_disponible_devolucion": max(disponible, 0),
            "puede_devolver": motivo_devolucion is None,
            "motivo_no_devolucion": motivo_devolucion,
            "puede_garantia": motivo_garantia is None,
            "motivo_no_garantia": motivo_garantia,
        })
        resultado.append(item)

    return resultado


@app.route("/api/postventa/elegibles", methods=["GET"])
@requiere("CLIENTE")
def productos_elegibles():
    conn = cursor = None

    try:
        conn = get_connection()
        cursor = conn.cursor(dictionary=True)
        id_cliente = id_cliente_actual(cursor)
        return jsonify({
            "exitoso": True,
            "dias_devolucion": DIAS_DEVOLUCION,
            "dias_garantia": DIAS_GARANTIA,
            "datos": consultar_compras_cliente(cursor, id_cliente),
        })

    except Error:
        app.logger.exception("Error al consultar productos elegibles")
        return error_response("No fue posible consultar tus productos.", 500)

    finally:
        close_connection(conn, cursor)


@app.route("/api/postventa/evidencias/<tipo>/<int:id_solicitud>", methods=["GET"])
@requiere()
def ver_evidencia(tipo, id_solicitud):
    tablas = {"garantias": "garantias", "devoluciones": "devoluciones_venta"}

    if tipo not in tablas:
        return error_response("Tipo de solicitud no válido.", 404)

    conn = cursor = None

    try:
        conn = get_connection()
        cursor = conn.cursor(dictionary=True)
        cursor.execute(f"SELECT id_cliente, evidencia FROM {tablas[tipo]} WHERE id = %s", (id_solicitud,))
        fila = cursor.fetchone()

        if not fila or not fila["evidencia"]:
            return error_response("La solicitud no tiene evidencia.", 404)

        if not es_personal():
            if g.usuario["rol"] != "CLIENTE" or id_cliente_actual(cursor) != fila["id_cliente"]:
                return error_response("La solicitud no tiene evidencia.", 404)

        ruta = (CARPETA_EVIDENCIAS / Path(fila["evidencia"]).name).resolve()

        if CARPETA_EVIDENCIAS.resolve() not in ruta.parents or not ruta.exists():
            return error_response("El archivo de evidencia no se encontró.", 404)

        return send_file(ruta, max_age=0)

    except Error:
        return error_response("No fue posible consultar la evidencia.", 500)

    finally:
        close_connection(conn, cursor)


# =====================================================
# GARANTÍAS
# =====================================================

SQL_GARANTIA_BASE = """
    SELECT
        gr.id, gr.folio, gr.id_venta, v.id_pedido, gr.id_producto, pr.nombre AS producto,
        gr.id_cliente,
        COALESCE(NULLIF(TRIM(u.nombre_completo), ''), u.nombre_usuario) AS cliente_nombre,
        u.email AS cliente_correo,
        gr.fecha_solicitud, p.fecha AS fecha_compra,
        gr.motivo, gr.descripcion, gr.estado, gr.resolucion,
        (gr.evidencia IS NOT NULL) AS tiene_evidencia,
        gr.fecha_resolucion, gr.fecha_actualizacion,
        ug.nombre_usuario AS gestionado_por
    FROM garantias gr
    INNER JOIN ventas v ON v.id = gr.id_venta
    INNER JOIN pedidos p ON p.id = v.id_pedido
    INNER JOIN productos pr ON pr.id = gr.id_producto
    LEFT JOIN clientes c ON c.id = COALESCE(gr.id_cliente, v.id_cliente)
    LEFT JOIN usuarios u ON u.id = c.id_usuario
    LEFT JOIN usuarios ug ON ug.id = gr.id_usuario_gestion
"""


def historial_solicitud(cursor, tabla, columna, id_solicitud):
    cursor.execute(
        f"""
        SELECT h.estado_anterior, h.estado_nuevo, h.comentario, h.fecha, u.nombre_usuario AS usuario
        FROM {tabla} h
        LEFT JOIN usuarios u ON u.id = h.id_usuario
        WHERE h.{columna} = %s
        ORDER BY h.fecha ASC, h.id ASC
        """,
        (id_solicitud,),
    )
    return a_json(cursor.fetchall())


@app.route("/api/garantias", methods=["POST"])
@requiere("CLIENTE")
def crear_garantia():
    datos = datos_entrada()
    conn = cursor = None
    evidencia = None

    try:
        id_pedido = parse_id(datos.get("id_pedido"), "El pedido")
        id_producto = parse_id(datos.get("id_producto"), "El producto")
        motivo = texto(datos.get("motivo"), 255, "El motivo", obligatorio=True)
        descripcion = texto(datos.get("descripcion"), 2000, "La descripción del problema", obligatorio=True, minimo=10)

        if motivo not in MOTIVOS_GARANTIA:
            raise ErrorNegocio("Selecciona un motivo válido.")

        conn = get_connection()
        cursor = conn.cursor(dictionary=True)
        id_cliente = id_cliente_actual(cursor)
        conn.start_transaction(isolation_level="READ COMMITTED")

        compras = consultar_compras_cliente(cursor, id_cliente, id_pedido, id_producto, bloquear=True)

        if not compras:
            # Mismo mensaje si no existe o si es de otro cliente.
            raise ErrorNegocio("No encontramos ese producto en tus pedidos confirmados.", 404)

        compra = compras[0]

        if not compra["puede_garantia"]:
            raise ErrorNegocio(compra["motivo_no_garantia"], 409, "NO_ELEGIBLE")

        evidencia = guardar_evidencia("garantia")

        cursor.execute(
            """
            INSERT INTO garantias (id_venta, id_producto, id_cliente, motivo, descripcion, evidencia, estado)
            VALUES (%s, %s, %s, %s, %s, %s, 'pendiente')
            """,
            (compra["id_venta"], id_producto, id_cliente, motivo, descripcion, evidencia),
        )
        nuevo_id = cursor.lastrowid
        folio = f"GAR-{datetime.now():%Y%m%d}-{nuevo_id:05d}"

        cursor.execute("UPDATE garantias SET folio = %s WHERE id = %s", (folio, nuevo_id))
        cursor.execute(
            """
            INSERT INTO historial_garantias (id_garantia, estado_anterior, estado_nuevo, comentario, id_usuario)
            VALUES (%s, NULL, 'pendiente', 'Solicitud registrada por el cliente', %s)
            """,
            (nuevo_id, g.usuario["id"]),
        )

        conn.commit()
        return jsonify({
            "exitoso": True,
            "mensaje": f"Solicitud de garantía registrada. Tu folio es {folio}.",
            "id": nuevo_id,
            "folio": folio,
        }), 201

    except ErrorNegocio:
        if conn:
            conn.rollback()
        eliminar_evidencia(evidencia)
        raise

    except Error:
        if conn:
            conn.rollback()
        eliminar_evidencia(evidencia)
        app.logger.exception("Error al registrar garantía")
        return error_response("No fue posible registrar la garantía.", 500)

    finally:
        close_connection(conn, cursor)


@app.route("/api/garantias/mias", methods=["GET"])
@requiere("CLIENTE")
def mis_garantias():
    conn = cursor = None

    try:
        conn = get_connection()
        cursor = conn.cursor(dictionary=True)
        id_cliente = id_cliente_actual(cursor)
        cursor.execute(SQL_GARANTIA_BASE + " WHERE gr.id_cliente = %s ORDER BY gr.id DESC", (id_cliente,))
        garantias = [a_json(f) for f in cursor.fetchall()]

        for garantia in garantias:
            garantia["tiene_evidencia"] = bool(garantia["tiene_evidencia"])
            garantia.pop("gestionado_por", None)
            garantia["historial"] = [
                {k: v for k, v in h.items() if k != "usuario"}
                for h in historial_solicitud(cursor, "historial_garantias", "id_garantia", garantia["id"])
            ]

        return jsonify({"exitoso": True, "datos": garantias})

    except Error:
        app.logger.exception("Error al consultar garantías del cliente")
        return error_response("No fue posible consultar tus garantías.", 500)

    finally:
        close_connection(conn, cursor)


@app.route("/api/garantias", methods=["GET"])
@requiere(*ROLES_PERSONAL)
def listar_garantias():
    estado = str(request.args.get("estado", "")).strip().lower()
    busqueda = str(request.args.get("q", "")).strip()[:80]
    condiciones, valores = [], []

    if estado:
        if estado not in ESTADOS_GARANTIA:
            raise ErrorNegocio("Estado no válido.")
        condiciones.append("gr.estado = %s")
        valores.append(estado)

    if busqueda:
        condiciones.append("(gr.folio LIKE %s OR CAST(v.id_pedido AS CHAR) = %s OR u.nombre_completo LIKE %s OR pr.nombre LIKE %s)")
        patron = f"%{busqueda}%"
        valores.extend([patron, busqueda.lstrip("#"), patron, patron])

    conn = cursor = None

    try:
        conn = get_connection()
        cursor = conn.cursor(dictionary=True)
        cursor.execute(
            SQL_GARANTIA_BASE
            + (f" WHERE {' AND '.join(condiciones)}" if condiciones else "")
            + " ORDER BY gr.id DESC LIMIT 500",
            tuple(valores),
        )
        datos = [a_json(f) for f in cursor.fetchall()]

        for fila in datos:
            fila["tiene_evidencia"] = bool(fila["tiene_evidencia"])

        return jsonify({"exitoso": True, "datos": datos})

    except Error:
        app.logger.exception("Error al consultar garantías")
        return error_response("No fue posible consultar las garantías.", 500)

    finally:
        close_connection(conn, cursor)


@app.route("/api/garantias/<int:id_garantia>", methods=["GET"])
@requiere()
def detalle_garantia(id_garantia):
    conn = cursor = None

    try:
        conn = get_connection()
        cursor = conn.cursor(dictionary=True)
        cursor.execute(SQL_GARANTIA_BASE + " WHERE gr.id = %s", (id_garantia,))
        fila = cursor.fetchone()

        if not fila:
            return error_response("La solicitud no existe.", 404)

        if not es_personal():
            if g.usuario["rol"] != "CLIENTE" or id_cliente_actual(cursor) != fila["id_cliente"]:
                return error_response("La solicitud no existe.", 404)

        garantia = a_json(fila)
        garantia["tiene_evidencia"] = bool(garantia["tiene_evidencia"])
        garantia["historial"] = historial_solicitud(cursor, "historial_garantias", "id_garantia", id_garantia)
        return jsonify({"exitoso": True, "datos": garantia})

    except Error:
        return error_response("No fue posible consultar la garantía.", 500)

    finally:
        close_connection(conn, cursor)


@app.route("/api/garantias/<int:id_garantia>", methods=["PATCH"])
@requiere(*ROLES_PERSONAL)
def gestionar_garantia(id_garantia):
    datos = request.get_json(silent=True) or {}
    conn = cursor = None

    try:
        nuevo = str(datos.get("estado") or "").strip().lower()
        resolucion = texto(datos.get("resolucion"), 255, "La resolución")
        comentario = texto(datos.get("comentario"), 500, "El comentario")

        if nuevo not in ESTADOS_GARANTIA:
            raise ErrorNegocio("Selecciona un estado válido.")

        # El vendedor puede tomar la solicitud; aprobar o rechazar es del ADMIN.
        if not es_admin() and nuevo != "en_revision":
            raise ErrorNegocio("Solo un administrador puede aprobar, rechazar o resolver garantías.", 403, "ACCESO_DENEGADO")

        if nuevo in ("rechazada", "resuelta") and not resolucion:
            raise ErrorNegocio("Escribe la resolución para informar al cliente.")

        conn = get_connection()
        cursor = conn.cursor(dictionary=True)
        conn.start_transaction()

        cursor.execute("SELECT id, estado FROM garantias WHERE id = %s FOR UPDATE", (id_garantia,))
        garantia = cursor.fetchone()

        if not garantia:
            raise ErrorNegocio("La solicitud no existe.", 404)

        actual = garantia["estado"] or "pendiente"

        if nuevo not in TRANSICIONES_GARANTIA.get(actual, ()):
            raise ErrorNegocio(f"No se puede cambiar una garantía {actual} a {nuevo}.", 409, "TRANSICION_NO_PERMITIDA")

        cursor.execute(
            """
            UPDATE garantias
            SET estado = %s,
                resolucion = COALESCE(%s, resolucion),
                id_usuario_gestion = %s,
                fecha_resolucion = CASE WHEN %s IN ('aprobada','rechazada','resuelta') THEN NOW() ELSE fecha_resolucion END
            WHERE id = %s
            """,
            (nuevo, resolucion, g.usuario["id"], nuevo, id_garantia),
        )
        cursor.execute(
            """
            INSERT INTO historial_garantias (id_garantia, estado_anterior, estado_nuevo, comentario, id_usuario)
            VALUES (%s, %s, %s, %s, %s)
            """,
            (id_garantia, actual, nuevo, comentario or resolucion, g.usuario["id"]),
        )

        conn.commit()
        return jsonify({"exitoso": True, "mensaje": "Garantía actualizada correctamente."})

    except ErrorNegocio:
        if conn:
            conn.rollback()
        raise

    except Error:
        if conn:
            conn.rollback()
        app.logger.exception("Error al gestionar garantía")
        return error_response("No fue posible actualizar la garantía.", 500)

    finally:
        close_connection(conn, cursor)


# =====================================================
# DEVOLUCIONES
# =====================================================

SQL_DEVOLUCION_BASE = """
    SELECT
        dv.id, dv.folio, dv.id_venta, v.id_pedido, dv.id_producto, pr.nombre AS producto,
        dv.id_cliente,
        COALESCE(NULLIF(TRIM(u.nombre_completo), ''), u.nombre_usuario) AS cliente_nombre,
        u.email AS cliente_correo,
        dv.cantidad,
        (SELECT d.cantidad FROM detalle_ventas d WHERE d.id_venta = dv.id_venta AND d.id_producto = dv.id_producto) AS cantidad_comprada,
        (SELECT d.precio_unitario FROM detalle_ventas d WHERE d.id_venta = dv.id_venta AND d.id_producto = dv.id_producto) AS precio_unitario,
        dv.motivo, dv.descripcion, dv.preferencia, dv.fecha, dv.estado,
        dv.instrucciones, dv.fecha_autorizacion,
        dv.cantidad_recibida, dv.condicion_producto, dv.fecha_recepcion, dv.cantidad_reintegrada,
        dv.tipo_resolucion, dv.monto_reembolso, dv.referencia_resolucion, dv.fecha_resolucion,
        dv.observaciones, dv.fecha_actualizacion,
        (dv.evidencia IS NOT NULL) AS tiene_evidencia,
        ua.nombre_usuario AS autorizado_por,
        ur.nombre_usuario AS recibido_por
    FROM devoluciones_venta dv
    INNER JOIN ventas v ON v.id = dv.id_venta
    INNER JOIN productos pr ON pr.id = dv.id_producto
    LEFT JOIN clientes c ON c.id = COALESCE(dv.id_cliente, v.id_cliente)
    LEFT JOIN usuarios u ON u.id = c.id_usuario
    LEFT JOIN usuarios ua ON ua.id = dv.id_usuario_autorizo
    LEFT JOIN usuarios ur ON ur.id = dv.id_usuario_recepcion
"""


def normalizar_devolucion(fila, para_cliente=False):
    devolucion = a_json(dict(fila))
    devolucion["tiene_evidencia"] = bool(devolucion["tiene_evidencia"])

    if para_cliente:
        devolucion.pop("autorizado_por", None)
        devolucion.pop("recibido_por", None)

    return devolucion


@app.route("/api/devoluciones", methods=["POST"])
@requiere("CLIENTE")
def crear_devolucion():
    datos = datos_entrada()
    conn = cursor = None
    evidencia = None

    try:
        id_pedido = parse_id(datos.get("id_pedido"), "El pedido")
        id_producto = parse_id(datos.get("id_producto"), "El producto")
        cantidad = parse_id(datos.get("cantidad"), "La cantidad")
        motivo = texto(datos.get("motivo"), 255, "El motivo", obligatorio=True)
        descripcion = texto(datos.get("descripcion"), 2000, "La descripción", obligatorio=True, minimo=10)
        preferencia = str(datos.get("preferencia") or "reembolso").strip().lower()

        if motivo not in MOTIVOS_DEVOLUCION:
            raise ErrorNegocio("Selecciona un motivo válido.")

        if preferencia not in ("reembolso", "reemplazo"):
            raise ErrorNegocio("Indica si prefieres reembolso o reemplazo.")

        conn = get_connection()
        cursor = conn.cursor(dictionary=True)
        id_cliente = id_cliente_actual(cursor)
        # READ COMMITTED: tras esperar el bloqueo se leen las solicitudes
        # que otra transacción acaba de confirmar.
        conn.start_transaction(isolation_level="READ COMMITTED")

        # FOR UPDATE: dos solicitudes simultáneas del mismo producto se
        # procesan una tras otra, así las cantidades no se exceden.
        compras = consultar_compras_cliente(cursor, id_cliente, id_pedido, id_producto, bloquear=True)

        if not compras:
            raise ErrorNegocio("No encontramos ese producto en tus pedidos confirmados.", 404)

        compra = compras[0]

        if not compra["puede_devolver"]:
            raise ErrorNegocio(compra["motivo_no_devolucion"], 409, "NO_ELEGIBLE")

        if cantidad > compra["cantidad_disponible_devolucion"]:
            raise ErrorNegocio(
                f"Puedes devolver como máximo {compra['cantidad_disponible_devolucion']} unidad(es) de este producto.",
                409,
                "CANTIDAD_EXCEDIDA",
            )

        evidencia = guardar_evidencia("devolucion")

        cursor.execute(
            """
            INSERT INTO devoluciones_venta (
                id_venta, id_producto, cantidad, motivo, estado,
                id_cliente, descripcion, evidencia, preferencia
            )
            VALUES (%s, %s, %s, %s, 'pendiente', %s, %s, %s, %s)
            """,
            (compra["id_venta"], id_producto, cantidad, motivo, id_cliente, descripcion, evidencia, preferencia),
        )
        nuevo_id = cursor.lastrowid
        folio = f"DEV-{datetime.now():%Y%m%d}-{nuevo_id:05d}"

        cursor.execute("UPDATE devoluciones_venta SET folio = %s WHERE id = %s", (folio, nuevo_id))
        cursor.execute(
            """
            INSERT INTO historial_devoluciones (id_devolucion, estado_anterior, estado_nuevo, comentario, id_usuario)
            VALUES (%s, NULL, 'pendiente', 'Solicitud registrada por el cliente', %s)
            """,
            (nuevo_id, g.usuario["id"]),
        )

        conn.commit()
        return jsonify({
            "exitoso": True,
            "mensaje": f"Solicitud de devolución registrada. Tu folio es {folio}.",
            "id": nuevo_id,
            "folio": folio,
        }), 201

    except ErrorNegocio:
        if conn:
            conn.rollback()
        eliminar_evidencia(evidencia)
        raise

    except Error:
        if conn:
            conn.rollback()
        eliminar_evidencia(evidencia)
        app.logger.exception("Error al registrar devolución")
        return error_response("No fue posible registrar la devolución.", 500)

    finally:
        close_connection(conn, cursor)


@app.route("/api/devoluciones/mias", methods=["GET"])
@requiere("CLIENTE")
def mis_devoluciones():
    conn = cursor = None

    try:
        conn = get_connection()
        cursor = conn.cursor(dictionary=True)
        id_cliente = id_cliente_actual(cursor)
        cursor.execute(SQL_DEVOLUCION_BASE + " WHERE dv.id_cliente = %s ORDER BY dv.id DESC", (id_cliente,))
        datos = [normalizar_devolucion(f, para_cliente=True) for f in cursor.fetchall()]

        for devolucion in datos:
            devolucion["historial"] = [
                {k: v for k, v in h.items() if k != "usuario"}
                for h in historial_solicitud(cursor, "historial_devoluciones", "id_devolucion", devolucion["id"])
            ]

        return jsonify({"exitoso": True, "datos": datos})

    except Error:
        app.logger.exception("Error al consultar devoluciones del cliente")
        return error_response("No fue posible consultar tus devoluciones.", 500)

    finally:
        close_connection(conn, cursor)


@app.route("/api/devoluciones", methods=["GET"])
@requiere(*ROLES_PERSONAL)
def listar_devoluciones():
    estado = str(request.args.get("estado", "")).strip().lower()
    busqueda = str(request.args.get("q", "")).strip()[:80]
    condiciones, valores = [], []

    if estado:
        if estado not in ESTADOS_DEVOLUCION:
            raise ErrorNegocio("Estado no válido.")
        condiciones.append("dv.estado = %s")
        valores.append(estado)

    if busqueda:
        condiciones.append("(dv.folio LIKE %s OR CAST(v.id_pedido AS CHAR) = %s OR u.nombre_completo LIKE %s OR pr.nombre LIKE %s)")
        patron = f"%{busqueda}%"
        valores.extend([patron, busqueda.lstrip("#"), patron, patron])

    conn = cursor = None

    try:
        conn = get_connection()
        cursor = conn.cursor(dictionary=True)
        cursor.execute(
            SQL_DEVOLUCION_BASE
            + (f" WHERE {' AND '.join(condiciones)}" if condiciones else "")
            + " ORDER BY dv.id DESC LIMIT 500",
            tuple(valores),
        )
        return jsonify({"exitoso": True, "datos": [normalizar_devolucion(f) for f in cursor.fetchall()]})

    except Error:
        app.logger.exception("Error al consultar devoluciones")
        return error_response("No fue posible consultar las devoluciones.", 500)

    finally:
        close_connection(conn, cursor)


@app.route("/api/devoluciones/<int:id_devolucion>", methods=["GET"])
@requiere()
def detalle_devolucion(id_devolucion):
    conn = cursor = None

    try:
        conn = get_connection()
        cursor = conn.cursor(dictionary=True)
        cursor.execute(SQL_DEVOLUCION_BASE + " WHERE dv.id = %s", (id_devolucion,))
        fila = cursor.fetchone()

        if not fila:
            return error_response("La solicitud no existe.", 404)

        cliente = not es_personal()

        if cliente:
            if g.usuario["rol"] != "CLIENTE" or id_cliente_actual(cursor) != fila["id_cliente"]:
                return error_response("La solicitud no existe.", 404)

        devolucion = normalizar_devolucion(fila, para_cliente=cliente)
        devolucion["historial"] = historial_solicitud(cursor, "historial_devoluciones", "id_devolucion", id_devolucion)
        return jsonify({"exitoso": True, "datos": devolucion})

    except Error:
        return error_response("No fue posible consultar la devolución.", 500)

    finally:
        close_connection(conn, cursor)


@app.route("/api/devoluciones/<int:id_devolucion>/enviado", methods=["POST"])
@requiere("CLIENTE")
def cliente_envio_devolucion(id_devolucion):
    """El cliente indica que ya envió el producto de regreso."""
    datos = request.get_json(silent=True) or {}
    conn = cursor = None

    try:
        comentario = texto(datos.get("comentario"), 500, "El comentario")
        conn = get_connection()
        cursor = conn.cursor(dictionary=True)
        id_cliente = id_cliente_actual(cursor)
        conn.start_transaction()

        cursor.execute(
            "SELECT id, estado FROM devoluciones_venta WHERE id = %s AND id_cliente = %s FOR UPDATE",
            (id_devolucion, id_cliente),
        )
        devolucion = cursor.fetchone()

        if not devolucion:
            raise ErrorNegocio("La solicitud no existe.", 404)

        if devolucion["estado"] != "aprobada":
            raise ErrorNegocio("Solo puedes reportar el envío de una devolución aprobada.", 409)

        cursor.execute("UPDATE devoluciones_venta SET estado = 'en_proceso' WHERE id = %s", (id_devolucion,))
        cursor.execute(
            """
            INSERT INTO historial_devoluciones (id_devolucion, estado_anterior, estado_nuevo, comentario, id_usuario)
            VALUES (%s, 'aprobada', 'en_proceso', %s, %s)
            """,
            (id_devolucion, comentario or "El cliente envió el producto", g.usuario["id"]),
        )
        conn.commit()
        return jsonify({"exitoso": True, "mensaje": "Registramos el envío de tu devolución."})

    except ErrorNegocio:
        if conn:
            conn.rollback()
        raise

    except Error:
        if conn:
            conn.rollback()
        return error_response("No fue posible registrar el envío.", 500)

    finally:
        close_connection(conn, cursor)


# Acciones del personal y estados de origen permitidos.
ACCIONES_DEVOLUCION = {
    "revisar": {"desde": ("pendiente",), "hacia": "en_revision", "solo_admin": False},
    "aprobar": {"desde": ("pendiente", "en_revision"), "hacia": "aprobada", "solo_admin": True},
    "rechazar": {"desde": ("pendiente", "en_revision"), "hacia": "rechazada", "solo_admin": True},
    "en_proceso": {"desde": ("aprobada",), "hacia": "en_proceso", "solo_admin": False},
    "recibir": {"desde": ("aprobada", "en_proceso"), "hacia": "producto_recibido", "solo_admin": False},
    "resolver": {"desde": ("producto_recibido",), "hacia": "reembolso_en_proceso", "solo_admin": True},
    "completar": {"desde": ("producto_recibido", "reembolso_en_proceso"), "hacia": "completada", "solo_admin": True},
    "reintegrar": {"desde": ("producto_recibido", "reembolso_en_proceso", "completada"), "hacia": None, "solo_admin": False},
}


@app.route("/api/devoluciones/<int:id_devolucion>", methods=["PATCH"])
@requiere(*ROLES_PERSONAL)
def gestionar_devolucion(id_devolucion):
    datos = request.get_json(silent=True) or {}
    accion = str(datos.get("accion") or "").strip().lower()
    regla = ACCIONES_DEVOLUCION.get(accion)

    if not regla:
        return error_response("Acción no válida.")

    if regla["solo_admin"] and not es_admin():
        return error_response("Solo un administrador puede realizar esta acción.", 403, "ACCESO_DENEGADO")

    conn = cursor = None
    reintegrar = None

    try:
        comentario = texto(datos.get("comentario"), 500, "El comentario")

        conn = get_connection()
        cursor = conn.cursor(dictionary=True)
        conn.start_transaction()

        cursor.execute(
            """
            SELECT dv.*, v.id_pedido,
                   (SELECT d.precio_unitario FROM detalle_ventas d
                     WHERE d.id_venta = dv.id_venta AND d.id_producto = dv.id_producto) AS precio_unitario
            FROM devoluciones_venta dv
            INNER JOIN ventas v ON v.id = dv.id_venta
            WHERE dv.id = %s
            FOR UPDATE
            """,
            (id_devolucion,),
        )
        devolucion = cursor.fetchone()

        if not devolucion:
            raise ErrorNegocio("La solicitud no existe.", 404)

        actual = devolucion["estado"] or "pendiente"

        if actual not in regla["desde"]:
            raise ErrorNegocio(
                f"La acción '{accion}' no está permitida para una devolución en estado '{actual}'.",
                409,
                "TRANSICION_NO_PERMITIDA",
            )

        cambios = {}
        nota = comentario

        if accion == "aprobar":
            instrucciones = texto(datos.get("instrucciones"), 2000, "Las instrucciones", obligatorio=True, minimo=10)
            cambios.update({
                "instrucciones": instrucciones,
                "id_usuario_autorizo": g.usuario["id"],
                "fecha_autorizacion": datetime.now(),
            })
            nota = nota or "Devolución autorizada"

        elif accion == "rechazar":
            motivo = texto(datos.get("observaciones"), 500, "El motivo del rechazo", obligatorio=True, minimo=5)
            cambios.update({
                "observaciones": motivo,
                "id_usuario_autorizo": g.usuario["id"],
                "fecha_autorizacion": datetime.now(),
            })
            nota = nota or motivo

        elif accion == "recibir":
            cantidad_recibida = parse_id(datos.get("cantidad_recibida"), "La cantidad recibida")
            condicion = str(datos.get("condicion_producto") or "").strip().lower()

            if cantidad_recibida > int(devolucion["cantidad"]):
                raise ErrorNegocio(f"Se autorizaron {devolucion['cantidad']} unidad(es); no se pueden recibir más.")

            if condicion not in ("vendible", "danado", "no_apto"):
                raise ErrorNegocio("Indica la condición del producto recibido.")

            cambios.update({
                "cantidad_recibida": cantidad_recibida,
                "condicion_producto": condicion,
                "fecha_recepcion": datetime.now(),
                "id_usuario_recepcion": g.usuario["id"],
                "observaciones": texto(datos.get("observaciones"), 500, "Las observaciones") or devolucion["observaciones"],
            })

            # Solo la mercancía apta para venderse regresa al inventario.
            if condicion == "vendible":
                reintegrar = cantidad_recibida

            nota = nota or (
                f"Producto recibido ({cantidad_recibida} u., condición: {condicion}). "
                + ("Se reintegrará al inventario." if condicion == "vendible" else "No se reintegra al inventario.")
            )

        elif accion in ("resolver", "completar"):
            tipo = str(datos.get("tipo_resolucion") or devolucion.get("tipo_resolucion") or "").strip().lower()

            if tipo not in ("reembolso", "reemplazo"):
                raise ErrorNegocio("Indica si se realizará reembolso o reemplazo.")

            cambios["tipo_resolucion"] = tipo

            if accion == "completar":
                referencia = texto(datos.get("referencia"), 120, "La referencia")
                cambios["referencia_resolucion"] = referencia
                cambios["fecha_resolucion"] = datetime.now()

                if tipo == "reembolso":
                    try:
                        monto = round(float(datos.get("monto_reembolso")), 2)
                    except (TypeError, ValueError):
                        raise ErrorNegocio("Indica el monto reembolsado.")

                    unidades = int(devolucion["cantidad_recibida"] or devolucion["cantidad"])
                    maximo = round(float(devolucion["precio_unitario"] or 0) * unidades, 2)

                    if monto <= 0 or monto > maximo:
                        raise ErrorNegocio(f"El reembolso debe ser mayor que 0 y no superar {maximo:.2f} MXN.")

                    cambios["monto_reembolso"] = monto

            nota = nota or ("Reembolso/reemplazo en proceso" if accion == "resolver" else "Devolución completada")

        elif accion == "reintegrar":
            if devolucion["condicion_producto"] != "vendible":
                raise ErrorNegocio("Solo se reintegra mercancía recibida en condición vendible.", 409)

            if int(devolucion["cantidad_reintegrada"] or 0) > 0:
                raise ErrorNegocio("Esta devolución ya se reintegró al inventario.", 409)

            reintegrar = int(devolucion["cantidad_recibida"] or 0)

        nuevo_estado = regla["hacia"]

        if nuevo_estado:
            cambios["estado"] = nuevo_estado

        if cambios:
            columnas = ", ".join(f"{columna} = %s" for columna in cambios)
            cursor.execute(
                f"UPDATE devoluciones_venta SET {columnas} WHERE id = %s",
                (*cambios.values(), id_devolucion),
            )

        if nuevo_estado:
            cursor.execute(
                """
                INSERT INTO historial_devoluciones (id_devolucion, estado_anterior, estado_nuevo, comentario, id_usuario)
                VALUES (%s, %s, %s, %s, %s)
                """,
                (id_devolucion, actual, nuevo_estado, nota, g.usuario["id"]),
            )

        conn.commit()

    except ErrorNegocio:
        if conn:
            conn.rollback()
        close_connection(conn, cursor)
        raise

    except Error:
        if conn:
            conn.rollback()
        close_connection(conn, cursor)
        app.logger.exception("Error al gestionar devolución")
        return error_response("No fue posible actualizar la devolución.", 500)

    close_connection(conn, cursor)

    # Reintegro de inventario (fuera de la transacción: el servicio de
    # inventario es idempotente con la clave "devolucion:<id>").
    mensaje = "Devolución actualizada correctamente."
    aviso = None

    if reintegrar:
        devolucion["id_pedido"] = devolucion.get("id_pedido")
        ok, respuesta = reintegrar_inventario_devolucion(devolucion, reintegrar)

        if ok:
            conn = get_connection()
            cursor = conn.cursor()
            try:
                cursor.execute(
                    "UPDATE devoluciones_venta SET cantidad_reintegrada = %s WHERE id = %s",
                    (reintegrar, id_devolucion),
                )
                conn.commit()
            finally:
                close_connection(conn, cursor)

            mensaje += f" Se reintegraron {reintegrar} unidad(es) al inventario."
        else:
            aviso = (
                f"El inventario no se actualizó: {respuesta.get('mensaje')}. "
                "Usa la acción 'Reintegrar al inventario' para reintentarlo."
            )

    return jsonify({"exitoso": True, "mensaje": mensaje, "aviso": aviso})


# =====================================================
# INICIAR SERVIDOR
# =====================================================

if __name__ == "__main__":
    app.run(
        host=os.getenv("HOST", "127.0.0.1"),
        port=int(os.getenv("PORT", "3032")),
        debug=os.getenv("FLASK_DEBUG", "0") == "1",
    )
