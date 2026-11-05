
from flask import Flask, request, jsonify
import mysql.connector
from mysql.connector import Error
import os
from dotenv import load_dotenv
from flask_cors import CORS

# ==========================================
# CONFIGURACION GENERAL
# ==========================================

load_dotenv(override=True)

app = Flask(__name__)
CORS(app)

DB_CONFIG = {
    "host": os.getenv("DB_HOST", "localhost"),
    "port": int(os.getenv("DB_PORT", "3306")),
    "database": os.getenv("DB_NAME", "tienda_db"),
    "user": os.getenv("DB_USER", "root"),
    "password": os.getenv("DB_PASSWORD", "")
}

CAMPOS_PROVEEDOR = [
    "nombre",
    "razon_social",
    "rfc",
    "direccion",
    "correo",
    "telefono"
]


# ==========================================
# CONEXION A MYSQL
# ==========================================

def get_connection():
    return mysql.connector.connect(**DB_CONFIG)


# ==========================================
# VALIDACION DE DATOS
# ==========================================

def validar_proveedor(data, parcial=False):

    if not isinstance(data, dict):
        return "El cuerpo debe ser JSON"

    if not parcial:
        faltantes = [
            campo for campo in CAMPOS_PROVEEDOR
            if campo not in data or data[campo] is None
            or not isinstance(data[campo], str)
            or not data[campo].strip()
        ]

        if faltantes:
            return (
                "Faltan campos obligatorios o están vacíos: "
                + ", ".join(faltantes)
            )

    for campo in CAMPOS_PROVEEDOR:
        if campo in data:
            if not isinstance(data[campo], str):
                return f"El campo '{campo}' debe ser texto"

            if not data[campo].strip():
                return f"El campo '{campo}' no puede estar vacío"

    return None


# ==========================================
# RUTA PRINCIPAL
# ==========================================

@app.get("/")
def inicio():

    return jsonify({
        "success": True,
        "message": "Microservicio de proveedores funcionando",
        "service": "proveedores",
        "port": 3009
    }), 200


# ==========================================
# VERIFICAR CONEXION CON MYSQL
# ==========================================

@app.get("/api/health")
def health():

    conn = None

    try:
        conn = get_connection()

        return jsonify({
            "success": True,
            "service": "proveedores",
            "mysql": "connected"
        }), 200

    except Error as e:

        return jsonify({
            "success": False,
            "service": "proveedores",
            "mysql": "disconnected",
            "error": str(e)
        }), 500

    finally:
        if conn is not None and conn.is_connected():
            conn.close()


# ==========================================
# LISTAR TODOS LOS PROVEEDORES
# GET /api/proveedores
# ==========================================

@app.get("/api/proveedores")
def listar_proveedores():

    conn = None
    cursor = None

    try:
        conn = get_connection()
        cursor = conn.cursor(dictionary=True)

        cursor.execute("""
            SELECT
                id,
                nombre,
                razon_social,
                rfc,
                direccion,
                correo,
                telefono
            FROM proveedores
            ORDER BY id DESC
        """)

        proveedores = cursor.fetchall()

        return jsonify({
            "success": True,
            "data": proveedores
        }), 200

    except Error as e:

        return jsonify({
            "success": False,
            "error": str(e)
        }), 500

    finally:
        if cursor:
            cursor.close()

        if conn and conn.is_connected():
            conn.close()


# ==========================================
# OBTENER PROVEEDOR POR ID
# GET /api/proveedores/1
# ==========================================

@app.get("/api/proveedores/<int:id>")
def obtener_proveedor(id):

    conn = None
    cursor = None

    try:
        conn = get_connection()
        cursor = conn.cursor(dictionary=True)

        cursor.execute("""
            SELECT
                id,
                nombre,
                razon_social,
                rfc,
                direccion,
                correo,
                telefono
            FROM proveedores
            WHERE id = %s
        """, (id,))

        proveedor = cursor.fetchone()

        if not proveedor:
            return jsonify({
                "success": False,
                "message": "Proveedor no encontrado"
            }), 404

        return jsonify({
            "success": True,
            "data": proveedor
        }), 200

    except Error as e:

        return jsonify({
            "success": False,
            "error": str(e)
        }), 500

    finally:
        if cursor:
            cursor.close()

        if conn and conn.is_connected():
            conn.close()


# ==========================================
# REGISTRAR PROVEEDOR
# POST /api/proveedores
# ==========================================

@app.post("/api/proveedores")
def crear_proveedor():

    data = request.get_json(silent=True)

    if not isinstance(data, dict):
        return jsonify({
            "success": False,
            "message": "El cuerpo debe ser JSON"
        }), 400

    error = validar_proveedor(data)

    if error:
        return jsonify({
            "success": False,
            "message": error
        }), 400

    conn = None
    cursor = None

    try:
        conn = get_connection()
        cursor = conn.cursor()

        # Verificar que el RFC no exista
        cursor.execute("""
            SELECT id
            FROM proveedores
            WHERE rfc = %s
        """, (data["rfc"].strip(),))

        if cursor.fetchone():
            return jsonify({
                "success": False,
                "message": "Ya existe un proveedor con ese RFC"
            }), 409

        cursor.execute("""
            INSERT INTO proveedores
                (nombre, razon_social, rfc, direccion, correo, telefono)
            VALUES (%s, %s, %s, %s, %s, %s)
        """, (
            data["nombre"].strip(),
            data["razon_social"].strip(),
            data["rfc"].strip(),
            data["direccion"].strip(),
            data["correo"].strip(),
            data["telefono"].strip()
        ))

        conn.commit()

        nuevo_id = cursor.lastrowid

        return jsonify({
            "success": True,
            "message": "Proveedor creado correctamente",
            "data": {
                "id": nuevo_id,
                **{
                    campo: data[campo].strip()
                    for campo in CAMPOS_PROVEEDOR
                }
            }
        }), 201

    except Error as e:

        if conn:
            conn.rollback()

        if "Duplicate" in str(e):
            return jsonify({
                "success": False,
                "message": "El RFC ya está registrado"
            }), 409

        return jsonify({
            "success": False,
            "error": str(e)
        }), 500

    finally:
        if cursor:
            cursor.close()

        if conn and conn.is_connected():
            conn.close()


# ==========================================
# ACTUALIZAR PROVEEDOR
# PUT /api/proveedores/1
# ==========================================

@app.put("/api/proveedores/<int:id>")
def actualizar_proveedor(id):

    data = request.get_json(silent=True)

    if not isinstance(data, dict):
        return jsonify({
            "success": False,
            "message": "El cuerpo debe ser JSON"
        }), 400

    error = validar_proveedor(data, parcial=True)

    if error:
        return jsonify({
            "success": False,
            "message": error
        }), 400

    campos = [
        campo for campo in CAMPOS_PROVEEDOR
        if campo in data
    ]

    if not campos:
        return jsonify({
            "success": False,
            "message": "No hay campos para actualizar"
        }), 400

    conn = None
    cursor = None

    try:
        conn = get_connection()
        cursor = conn.cursor(dictionary=True)

        cursor.execute("""
            SELECT id
            FROM proveedores
            WHERE id = %s
        """, (id,))

        if not cursor.fetchone():
            return jsonify({
                "success": False,
                "message": "Proveedor no encontrado"
            }), 404

        # Verificar RFC duplicado
        if "rfc" in data:

            cursor.execute("""
                SELECT id
                FROM proveedores
                WHERE rfc = %s AND id <> %s
            """, (data["rfc"].strip(), id))

            if cursor.fetchone():
                return jsonify({
                    "success": False,
                    "message": "El RFC ya pertenece a otro proveedor"
                }), 409

        set_clause = ", ".join(
            f"{campo} = %s" for campo in campos
        )

        valores = [
            data[campo].strip() for campo in campos
        ] + [id]

        cursor.execute(
            f"UPDATE proveedores SET {set_clause} WHERE id = %s",
            valores
        )

        conn.commit()

        cursor.execute("""
            SELECT
                id,
                nombre,
                razon_social,
                rfc,
                direccion,
                correo,
                telefono
            FROM proveedores
            WHERE id = %s
        """, (id,))

        proveedor = cursor.fetchone()

        return jsonify({
            "success": True,
            "message": "Proveedor actualizado correctamente",
            "data": proveedor
        }), 200

    except Error as e:

        if conn:
            conn.rollback()

        return jsonify({
            "success": False,
            "error": str(e)
        }), 500

    finally:
        if cursor:
            cursor.close()

        if conn and conn.is_connected():
            conn.close()


# ==========================================
# ELIMINAR PROVEEDOR
# DELETE /api/proveedores/1
# ==========================================

@app.delete("/api/proveedores/<int:id>")
def eliminar_proveedor(id):

    conn = None
    cursor = None

    try:
        conn = get_connection()
        cursor = conn.cursor(dictionary=True)

        # Verificar que exista
        cursor.execute("""
            SELECT id
            FROM proveedores
            WHERE id = %s
        """, (id,))

        if not cursor.fetchone():
            return jsonify({
                "success": False,
                "message": "Proveedor no encontrado"
            }), 404

        # Verificar compras relacionadas
        cursor.execute("""
            SELECT COUNT(*) AS total
            FROM compras
            WHERE id_proveedor = %s
        """, (id,))

        compras = cursor.fetchone()["total"]

        if compras > 0:
            return jsonify({
                "success": False,
                "message": (
                    "No se puede eliminar el proveedor porque "
                    "tiene compras registradas"
                )
            }), 409

        cursor.execute("""
            DELETE FROM proveedores
            WHERE id = %s
        """, (id,))

        conn.commit()

        return jsonify({
            "success": True,
            "message": "Proveedor eliminado correctamente"
        }), 200

    except Error as e:

        if conn:
            conn.rollback()

        return jsonify({
            "success": False,
            "error": str(e)
        }), 500

    finally:
        if cursor:
            cursor.close()

        if conn and conn.is_connected():
            conn.close()


# ==========================================
# INICIAR MICROSERVICIO
# IMPORTANTE: SIEMPRE DEBE IR AL FINAL
# ==========================================

if __name__ == "__main__":
    app.run(
        host="0.0.0.0",
        port=3009,
        debug=True
    )
