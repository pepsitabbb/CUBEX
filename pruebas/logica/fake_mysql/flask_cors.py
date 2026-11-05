"""Emulación mínima de flask-cors (solo para pruebas; aquí no se puede instalar)."""
from flask import request

def CORS(app, origins=None, allow_headers=None, methods=None, **kwargs):
    permitidos = set(origins or [])

    @app.after_request
    def _cors(respuesta):
        origen = request.headers.get("Origin")
        if origen and (not permitidos or origen in permitidos):
            respuesta.headers["Access-Control-Allow-Origin"] = origen
            respuesta.headers["Vary"] = "Origin"
            respuesta.headers["Access-Control-Allow-Headers"] = ", ".join(allow_headers or ["Content-Type", "Authorization"])
            respuesta.headers["Access-Control-Allow-Methods"] = ", ".join(methods or ["GET", "POST", "PATCH", "OPTIONS"])
        return respuesta

    return app
