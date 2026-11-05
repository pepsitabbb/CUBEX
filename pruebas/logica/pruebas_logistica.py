"""
Prueba de extremo a extremo: compra (Node 3111 + 3105) -> envío, rastreo,
validación de entrega, garantía y devolución (Flask) -> reintegro de
inventario (Node 3105). Base compartida: archivo SQLite.
"""
import json, os, subprocess, sys, time, io
import urllib.request

BASE = os.path.dirname(os.path.abspath(__file__))
DB = os.path.join(BASE, "e2e.sqlite")
if os.path.exists(DB):
    os.remove(DB)

import sqlite3
con = sqlite3.connect(DB)
con.executescript(open(os.path.join(BASE, "esquema.sql"), encoding="utf-8").read())
con.execute("INSERT INTO productos (id,nombre,costo,precio) VALUES (501,'Cubo Rubik 3x3',10,65)")
con.execute("INSERT INTO stock VALUES (501,10,2,20)")
con.commit(); con.close()

SECRETO = "p" * 48
CLAVE = "clave-interna-pruebas-0123456789"
os.environ.update({"SQLITE_DB": DB, "JWT_SECRET": SECRETO, "JWT_ISSUER": "microservicio-login",
                   "CUBEX_SERVICE_KEY": CLAVE, "INVENTARIO_API_URL": "http://localhost:3105/api/inventario",
                   "DIAS_DEVOLUCION": "30", "DIAS_GARANTIA": "90"})

nodo = subprocess.Popen(["node", "--no-warnings", os.path.join(BASE, "servidores.js")], cwd=BASE,
                        stdout=subprocess.DEVNULL, stderr=subprocess.PIPE, env=os.environ.copy())
time.sleep(1.5)

import jwt
def token(sub, rol):
    return jwt.encode({"sub": str(sub), "rol": rol, "nombreUsuario": "u", "iss": "microservicio-login",
                       "exp": int(time.time()) + 900}, SECRETO, algorithm="HS256")

T = {"diego": token(10, "CLIENTE"), "fabi": token(11, "CLIENTE"), "admin": token(1, "ADMIN"), "vendedor": token(3, "VENDEDOR")}

def http(metodo, url, tk=None, cuerpo=None):
    datos = json.dumps(cuerpo).encode() if cuerpo is not None else None
    req = urllib.request.Request(url, data=datos, method=metodo, headers={"Content-Type": "application/json", **({"Authorization": f"Bearer {tk}"} if tk else {})})
    if metodo in ("PATCH",) and datos is None: req.data = b"{}"
    try:
        with urllib.request.urlopen(req) as r:
            return r.status, json.loads(r.read() or b"{}")
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read() or b"{}")

def interno(url):
    req = urllib.request.Request(url, data=b"{}", method="PATCH", headers={"Content-Type": "application/json", "X-Servicio-Clave": CLAVE})
    with urllib.request.urlopen(req) as r:
        return r.status

sys.path.insert(0, os.path.join(BASE, "fake_mysql"))
sys.path.insert(0, os.path.join(BASE, "../../logistica_envios_python"))
import app as logistica
cliente = logistica.app.test_client()

def L(metodo, ruta, tk=None, cuerpo=None, **kw):
    h = {"Authorization": f"Bearer {tk}"} if tk else {}
    r = getattr(cliente, metodo.lower())(ruta, headers=h, json=cuerpo, **kw) if "data" not in kw else getattr(cliente, metodo.lower())(ruta, headers=h, **kw)
    return r.status_code, r.get_json(silent=True) or {}

def stock():
    c = sqlite3.connect(DB); v = c.execute("SELECT stock_actual FROM stock WHERE id_producto=501").fetchone()[0]; c.close(); return v

resultados = []
def ok(grupo, texto, condicion, detalle=""):
    resultados.append((grupo, texto, bool(condicion), detalle))

try:
    PED = "http://localhost:3111/api/Pedidos"
    s, r = http("POST", PED, T["diego"], {"id_direccion": 1, "productos": [{"id": 501, "cantidad": 3}]})
    id_pedido = r["datos"]["id"]
    interno(f"{PED}/{id_pedido}/confirmar-pago")
    ok("Compra", "Compra de 3 confirmada: stock 10 -> 7", stock() == 7, f"stock {stock()}")

    # ---------- Envíos ----------
    s, r = L("GET", "/api/envios/por-enviar", T["diego"])
    ok("Seguridad", "Cliente no accede a envíos administrativos (403)", s == 403)
    s, r = L("GET", "/api/envios/por-enviar")
    ok("Seguridad", "Sin token: 401", s == 401)
    s, r = L("GET", "/api/envios/por-enviar", T["vendedor"])
    ok("Envíos", "El pedido pagado aparece en 'por enviar'", s == 200 and any(p["id_pedido"] == id_pedido for p in r["datos"]), str(r)[:150])

    s, r = L("GET", "/api/clientes/mis-envios", T["diego"])
    sin_guia = [e for e in r.get("datos", []) if e["id_pedido"] == id_pedido]
    ok("Cliente", "Mis envíos muestra el pedido 'pendiente de asignación' (sin guía)", s == 200 and sin_guia and sin_guia[0]["id_envio"] is None, str(r)[:150])

    s, r = L("POST", "/api/envios", T["admin"], {"id_pedido": id_pedido, "estado": "en_transito"})
    ok("Envíos", "No se marca en tránsito sin guía", s == 400, r.get("mensaje"))
    s, r = L("POST", "/api/envios", T["admin"], {"id_pedido": id_pedido, "estado": "preparando"})
    id_envio = r.get("id")
    ok("Envíos", "Registrar envío sin guía (preparando)", s == 201, r.get("mensaje"))
    s, r = L("POST", "/api/envios", T["admin"], {"id_pedido": id_pedido, "estado": "pendiente"})
    ok("Envíos", "Un segundo envío para el mismo pedido es rechazado", s == 409, r.get("mensaje"))
    s, r = L("PATCH", f"/api/envios/{id_envio}", T["vendedor"], {"paqueteria": "DHL", "num_guia": "1234567890", "estado": "en_transito",
              "fecha_envio": "2026-11-01", "fecha_estimada_entrega": "2026-11-03", "descripcion": "Recolectado por DHL", "ubicacion": "Culiacán"})
    ok("Envíos", "Asignar guía y pasar a en tránsito", s == 200, r.get("mensaje"))
    s, r = L("GET", "/api/envios?retrasados=1", T["admin"])
    ok("Envíos", "Detecta envío retrasado (estimada vencida)", s == 200 and any(e["id"] == id_envio and e["retrasado"] for e in r["datos"]))
    s, r = L("GET", "/api/envios?q=1234567890", T["admin"])
    ok("Envíos", "Búsqueda por número de guía", s == 200 and len(r["datos"]) == 1)
    s, r = L("GET", f"/api/envios/{id_envio}", T["admin"])
    ok("Envíos", "Detalle con historial y productos", s == 200 and len(r["datos"]["historial"]) == 2 and r["datos"]["productos"][0]["cantidad"] == 3, str(r)[:200])

    s, r = L("PATCH", f"/api/envios/{id_envio}", T["diego"], {"estado": "entregado"})
    ok("Seguridad", "Cliente no puede cambiar el estado del envío", s == 403)

    s, r = L("GET", "/api/clientes/mis-envios", T["diego"])
    e = [x for x in r["datos"] if x["id_pedido"] == id_pedido][0]
    ok("Cliente", "Cliente ve guía, paquetería, estado y historial", e["num_guia"] == "1234567890" and e["estado_envio"] == "en_transito" and len(e["historial"]) == 2)
    ok("Cliente", "Historial del cliente no expone quién lo registró", all("registrado_por" not in h for h in e["historial"]))
    s, r = L("GET", "/api/clientes/mis-envios", T["fabi"])
    ok("Seguridad", "Otro cliente no ve este envío", s == 200 and not any(x["id_pedido"] == id_pedido for x in r["datos"]))

    s, r = L("POST", f"/api/clientes/envios/{id_envio}/confirmar-recepcion", T["diego"], {})
    ok("Entregas", "Cliente no confirma recepción mientras está en tránsito", s == 409)

    s, r = L("PATCH", f"/api/envios/{id_envio}", T["admin"], {"estado": "en_reparto"})
    s, r = L("POST", f"/api/clientes/envios/{id_envio}/confirmar-recepcion", T["fabi"], {})
    ok("Seguridad", "Otro cliente no puede confirmar la recepción", s == 404)
    s, r = L("POST", f"/api/clientes/envios/{id_envio}/confirmar-recepcion", T["diego"], {"comentario": "Llegó bien"})
    ok("Entregas", "Cliente confirma recepción (en reparto)", s == 200, r.get("mensaje"))

    s, r = L("GET", "/api/postventa/elegibles", T["diego"])
    item = [x for x in r["datos"] if x["id_pedido"] == id_pedido][0]
    ok("Postventa", "Confirmación del cliente no sustituye la validación (envío aún no entregado)", not item["entregado"] or item["estado_envio"] != "entregado")

    s, r = L("POST", f"/api/envios/{id_envio}/entregar", T["admin"], {"recibido_por": "Diego Emanuel", "fecha_recepcion": "2026-11-04T12:30", "observaciones": "Entregado en puerta"})
    ok("Entregas", "Validar entrega (quién recibió, fecha y hora)", s == 200, r.get("mensaje"))
    s, r = L("POST", f"/api/envios/{id_envio}/entregar", T["admin"], {"recibido_por": "Otra persona"})
    ok("Entregas", "Validación duplicada rechazada", s == 409)
    s, r = L("GET", "/api/entregas?filtro=validadas", T["admin"])
    ok("Entregas", "Historial de entregas validadas", s == 200 and any(x["id"] == id_envio and x["validado"] and x["recibido_por"] == "Diego Emanuel" for x in r["datos"]))
    s, r = L("PATCH", f"/api/envios/{id_envio}", T["admin"], {"estado": "en_transito"})
    ok("Entregas", "Un envío entregado no regresa a un estado anterior", s == 409)

    s, r = L("GET", "/api/clientes/mis-envios", T["diego"])
    e = [x for x in r["datos"] if x["id_pedido"] == id_pedido][0]
    ok("Cliente", "Cliente ve la confirmación de entrega", e["validado"] and e["recibido_por"] == "Diego Emanuel" and e["confirmado_cliente"])

    # ---------- Garantías ----------
    s, r = L("POST", "/api/garantias", T["fabi"], {"id_pedido": id_pedido, "id_producto": 501, "motivo": "Defecto de fabricación", "descripcion": "Las piezas se traban al girar"})
    ok("Seguridad", "Garantía sobre pedido de otro cliente rechazada", s == 404)
    s, r = L("POST", "/api/garantias", T["diego"], {"id_pedido": id_pedido, "id_producto": 501, "motivo": "Inventado", "descripcion": "Las piezas se traban al girar"})
    ok("Garantías", "Motivo inválido rechazado", s == 400)
    png = b"\x89PNG\r\n\x1a\n" + b"0" * 100
    s, r = L("POST", "/api/garantias", T["diego"], data={"id_pedido": str(id_pedido), "id_producto": "501", "motivo": "Defecto de fabricación",
              "descripcion": "Las piezas se traban al girar", "evidencia": (io.BytesIO(png), "foto.png")}, content_type="multipart/form-data")
    id_garantia = r.get("id")
    ok("Garantías", "Cliente registra garantía con fotografía y recibe folio", s == 201 and str(r.get("folio", "")).startswith("GAR-"), str(r))
    s, r = L("POST", "/api/garantias", T["diego"], data={"id_pedido": str(id_pedido), "id_producto": "501", "motivo": "Otro",
              "descripcion": "archivo falso disfrazado", "evidencia": (io.BytesIO(b"MZ\x90 ejecutable"), "foto.png")}, content_type="multipart/form-data")
    ok("Seguridad", "Archivo que no es imagen rechazado", s in (400, 409), r.get("mensaje"))
    s, r = L("POST", "/api/garantias", T["diego"], {"id_pedido": id_pedido, "id_producto": 501, "motivo": "Otro", "descripcion": "Segunda solicitud igual"})
    ok("Garantías", "Garantía duplicada en curso rechazada", s == 409)
    s, r = L("PATCH", f"/api/garantias/{id_garantia}", T["vendedor"], {"estado": "aprobada"})
    ok("Roles", "Vendedor no puede aprobar garantías", s == 403)
    s, r = L("PATCH", f"/api/garantias/{id_garantia}", T["vendedor"], {"estado": "en_revision"})
    ok("Garantías", "Vendedor toma la garantía en revisión", s == 200)
    s, r = L("PATCH", f"/api/garantias/{id_garantia}", T["admin"], {"estado": "rechazada"})
    ok("Garantías", "Rechazar sin resolución escrita no se permite", s == 400)
    s, r = L("PATCH", f"/api/garantias/{id_garantia}", T["admin"], {"estado": "aprobada", "resolucion": "Se enviará un cubo nuevo"})
    s2, r2 = L("PATCH", f"/api/garantias/{id_garantia}", T["admin"], {"estado": "resuelta", "resolucion": "Cubo nuevo enviado con guía DHL 999"})
    ok("Garantías", "Aprobar y resolver garantía", s == 200 and s2 == 200)
    s, r = L("PATCH", f"/api/garantias/{id_garantia}", T["admin"], {"estado": "pendiente"})
    ok("Garantías", "Una garantía resuelta no cambia de estado", s == 400 or s == 409)
    s, r = L("GET", "/api/garantias/mias", T["diego"])
    g = r["datos"][0]
    ok("Cliente", "Cliente consulta folio, estado, resolución e historial", g["estado"] == "resuelta" and "DHL 999" in g["resolucion"] and len(g["historial"]) == 4)
    s, r = L("GET", f"/api/garantias/{id_garantia}", T["fabi"])
    ok("Seguridad", "Otro cliente no ve la garantía", s == 404)
    s, r = L("GET", f"/api/postventa/evidencias/garantias/{id_garantia}", T["diego"])
    s2, r2 = L("GET", f"/api/postventa/evidencias/garantias/{id_garantia}", T["fabi"])
    ok("Seguridad", "Evidencia visible para el dueño, oculta para otros", s == 200 and s2 == 404)
    s, r = L("GET", "/api/garantias", T["admin"])
    ok("Garantías", "Admin ve quién gestionó la solicitud", r["datos"][0]["gestionado_por"] in ("admin",))

    # ---------- Devoluciones ----------
    s, r = L("POST", "/api/devoluciones", T["diego"], {"id_pedido": id_pedido, "id_producto": 501, "cantidad": 4, "motivo": "Producto defectuoso", "descripcion": "Quiero devolver de más", "preferencia": "reembolso"})
    ok("Devoluciones", "Devolver más unidades de las compradas (4 de 3) rechazado", s == 409, r.get("mensaje"))
    s, r = L("POST", "/api/devoluciones", T["diego"], {"id_pedido": id_pedido, "id_producto": 501, "cantidad": -1, "motivo": "Producto defectuoso", "descripcion": "Cantidad negativa"})
    ok("Devoluciones", "Cantidad negativa rechazada", s == 400)
    s, r = L("POST", "/api/devoluciones", T["diego"], {"id_pedido": id_pedido, "id_producto": 501, "cantidad": 2, "motivo": "Producto defectuoso", "descripcion": "Dos cubos llegaron flojos", "preferencia": "reembolso"})
    id_dev = r.get("id")
    ok("Devoluciones", "Cliente registra devolución de 2 y recibe folio", s == 201 and str(r.get("folio", "")).startswith("DEV-"), str(r))
    s, r = L("POST", "/api/devoluciones", T["diego"], {"id_pedido": id_pedido, "id_producto": 501, "cantidad": 1, "motivo": "Otro", "descripcion": "Otra solicitud en paralelo"})
    ok("Devoluciones", "Solicitud duplicada mientras hay una en curso rechazada", s == 409)
    s, r = L("PATCH", f"/api/devoluciones/{id_dev}", T["vendedor"], {"accion": "aprobar", "instrucciones": "Envía el producto a CUBEX"})
    ok("Roles", "Vendedor no puede autorizar devoluciones", s == 403)
    s, r = L("PATCH", f"/api/devoluciones/{id_dev}", T["admin"], {"accion": "recibir", "cantidad_recibida": 2, "condicion_producto": "vendible"})
    ok("Devoluciones", "No se recibe producto de una devolución no aprobada", s == 409)
    s, r = L("PATCH", f"/api/devoluciones/{id_dev}", T["admin"], {"accion": "aprobar", "instrucciones": "Empaca el producto y envíalo a CUBEX Los Mochis"})
    ok("Devoluciones", "Admin aprueba con instrucciones", s == 200)
    ok("Inventario", "Aprobar NO modifica el inventario", stock() == 7, f"stock {stock()}")
    s, r = L("POST", f"/api/devoluciones/{id_dev}/enviado", T["diego"], {"comentario": "Guía de retorno 555"})
    ok("Devoluciones", "Cliente informa que envió el producto", s == 200)
    s, r = L("PATCH", f"/api/devoluciones/{id_dev}", T["vendedor"], {"accion": "recibir", "cantidad_recibida": 3, "condicion_producto": "vendible"})
    ok("Devoluciones", "No se reciben más unidades de las autorizadas", s == 400)
    s, r = L("PATCH", f"/api/devoluciones/{id_dev}", T["vendedor"], {"accion": "recibir", "cantidad_recibida": 2, "condicion_producto": "vendible", "observaciones": "En buen estado"})
    ok("Inventario", "Recepción vendible reintegra 2 unidades (7 -> 9)", s == 200 and stock() == 9, f"HTTP {s} {r} stock {stock()}")
    s, r = L("PATCH", f"/api/devoluciones/{id_dev}", T["admin"], {"accion": "reintegrar"})
    ok("Inventario", "Reintegrar de nuevo no duplica stock", s == 409 and stock() == 9)
    s, r = L("PATCH", f"/api/devoluciones/{id_dev}", T["admin"], {"accion": "completar", "tipo_resolucion": "reembolso", "monto_reembolso": 9999})
    ok("Devoluciones", "Reembolso mayor a lo pagado rechazado", s == 400)
    s, r = L("PATCH", f"/api/devoluciones/{id_dev}", T["admin"], {"accion": "completar", "tipo_resolucion": "reembolso", "monto_reembolso": 130, "referencia": "REEMB-001"})
    ok("Devoluciones", "Completar con reembolso de 2 x 65 = 130", s == 200)
    s, r = L("GET", "/api/devoluciones/mias", T["diego"])
    d = r["datos"][0]
    ok("Cliente", "Cliente ve instrucciones, recepción y reembolso", d["estado"] == "completada" and d["instrucciones"] and d["cantidad_recibida"] == 2 and d["monto_reembolso"] == 130 and "autorizado_por" not in d)
    s, r = L("GET", "/api/devoluciones", T["admin"])
    ok("Devoluciones", "Admin identifica quién autorizó", r["datos"][0]["autorizado_por"] == "admin")

    s, r = L("POST", "/api/devoluciones", T["diego"], {"id_pedido": id_pedido, "id_producto": 501, "cantidad": 1, "motivo": "Producto dañado durante el envío", "descripcion": "El tercer cubo llegó roto", "preferencia": "reemplazo"})
    id_dev2 = r.get("id")
    ok("Devoluciones", "Puede devolver la unidad restante (1 de 3)", s == 201)
    s, r = L("POST", "/api/devoluciones", T["diego"], {"id_pedido": id_pedido, "id_producto": 501, "cantidad": 1, "motivo": "Otro", "descripcion": "Intento sobre lo ya devuelto"})
    ok("Devoluciones", "Ya no quedan unidades por devolver", s == 409)
    L("PATCH", f"/api/devoluciones/{id_dev2}", T["admin"], {"accion": "aprobar", "instrucciones": "Envíalo a CUBEX con tu folio"})
    s, r = L("PATCH", f"/api/devoluciones/{id_dev2}", T["admin"], {"accion": "recibir", "cantidad_recibida": 1, "condicion_producto": "danado"})
    ok("Inventario", "Producto dañado NO se reintegra (stock sigue 9)", s == 200 and stock() == 9, f"stock {stock()}")

    c = sqlite3.connect(DB)
    mov = c.execute("SELECT tipo, cantidad, stock_anterior, stock_resultante, id_devolucion FROM movimientos_inventario ORDER BY id").fetchall()
    c.close()
    ok("Inventario", "Movimientos: venta 3 y devolución 2 (con id de devolución)", mov == [("venta", 3, 10, 7, None), ("devolucion", 2, 7, 9, id_dev)], str(mov))

finally:
    nodo.terminate()

fallas = 0
for grupo, texto, estado, detalle in resultados:
    fallas += 0 if estado else 1
    print(("OK   " if estado else "FALLA") + f" [{grupo}] {texto}" + ("" if estado else f"  -> {detalle}"))
print(f"\n{len(resultados) - fallas}/{len(resultados)} verificaciones correctas.")
sys.exit(1 if fallas else 0)
