"""
CUBEX - Verificación de tokens JWT (HS256) emitidos por microservicio-login.

No requiere librerías externas: usa hmac/hashlib de Python. Se configura
con las mismas variables que el resto de los servicios:
    JWT_SECRET   (obligatoria, igual a la de microservicio-login)
    JWT_ISSUER   (opcional, normalmente "microservicio-login")
    CUBEX_SERVICE_KEY (clave interna entre microservicios)
"""

from __future__ import annotations

import base64
import hashlib
import hmac
import json
import os
import time

ROLES_PERSONAL = ("ADMIN", "VENDEDOR")


class ErrorSeguridad(Exception):
    def __init__(self, status: int, mensaje: str, codigo: str = "NO_AUTORIZADO"):
        super().__init__(mensaje)
        self.status = status
        self.mensaje = mensaje
        self.codigo = codigo


def _variable(nombre: str) -> str:
    return str(os.getenv(nombre, "")).replace("\r", "").strip()


def _b64url_a_bytes(texto: str) -> bytes:
    relleno = "=" * (-len(texto) % 4)
    return base64.urlsafe_b64decode(texto + relleno)


def verificar_token(token: str | None) -> dict:
    secreto = _variable("JWT_SECRET")
    emisor = _variable("JWT_ISSUER")

    if not secreto:
        raise ErrorSeguridad(500, "El servicio no tiene configurado JWT_SECRET.", "CONFIGURACION")

    partes = str(token or "").split(".")

    if len(partes) != 3:
        raise ErrorSeguridad(401, "El token no es válido.", "TOKEN_INVALIDO")

    try:
        encabezado = json.loads(_b64url_a_bytes(partes[0]))
        carga = json.loads(_b64url_a_bytes(partes[1]))
    except (ValueError, json.JSONDecodeError):
        raise ErrorSeguridad(401, "El token no es válido.", "TOKEN_INVALIDO")

    if not isinstance(encabezado, dict) or encabezado.get("alg") != "HS256":
        raise ErrorSeguridad(401, "Algoritmo de token no permitido.", "TOKEN_INVALIDO")

    firma = hmac.new(
        secreto.encode("utf-8"),
        f"{partes[0]}.{partes[1]}".encode("ascii"),
        hashlib.sha256,
    ).digest()

    esperada = base64.urlsafe_b64encode(firma).rstrip(b"=").decode("ascii")

    if not hmac.compare_digest(esperada, partes[2]):
        raise ErrorSeguridad(401, "La firma del token no es válida.", "TOKEN_INVALIDO")

    ahora = int(time.time())

    if isinstance(carga.get("exp"), (int, float)) and ahora >= carga["exp"]:
        raise ErrorSeguridad(401, "Tu sesión expiró. Inicia sesión nuevamente.", "TOKEN_EXPIRADO")

    if isinstance(carga.get("nbf"), (int, float)) and ahora < carga["nbf"]:
        raise ErrorSeguridad(401, "El token todavía no es válido.", "TOKEN_INVALIDO")

    if emisor and carga.get("iss") != emisor:
        raise ErrorSeguridad(401, "El emisor del token no es válido.", "TOKEN_INVALIDO")

    try:
        id_usuario = int(carga.get("sub"))
    except (TypeError, ValueError):
        id_usuario = 0

    rol = str(carga.get("rol") or "").strip().upper()

    if id_usuario <= 0 or not rol:
        raise ErrorSeguridad(401, "El token no contiene un usuario válido.", "TOKEN_INVALIDO")

    return {
        "id": id_usuario,
        "rol": rol,
        "nombreUsuario": carga.get("nombreUsuario") or "",
        "email": carga.get("email"),
    }


def extraer_token(cabecera: str | None) -> str | None:
    if not cabecera:
        return None

    partes = cabecera.split(" ", 1)

    if len(partes) == 2 and partes[0].lower() == "bearer" and partes[1].strip():
        return partes[1].strip()

    return None


def es_servicio_interno(clave_recibida: str | None) -> bool:
    clave = _variable("CUBEX_SERVICE_KEY")

    if len(clave) < 16 or not clave_recibida:
        return False

    return hmac.compare_digest(clave, str(clave_recibida))
