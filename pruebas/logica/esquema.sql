-- Esquema equivalente (subconjunto) de tienda_db + migración 01, para SQLite.
PRAGMA foreign_keys = ON;

CREATE TABLE roles (id INTEGER PRIMARY KEY, nombre TEXT UNIQUE);
CREATE TABLE usuarios (id INTEGER PRIMARY KEY, nombre_usuario TEXT UNIQUE, email TEXT, telefono TEXT,
  nombre_completo TEXT, rol_id INTEGER REFERENCES roles(id));
CREATE TABLE clientes (id INTEGER PRIMARY KEY, id_usuario INTEGER NOT NULL REFERENCES usuarios(id), direccion TEXT, rfc TEXT);
CREATE TABLE direcciones (id INTEGER PRIMARY KEY, id_cliente INTEGER NOT NULL REFERENCES clientes(id),
  calle_numero TEXT, colonia TEXT, ciudad TEXT, codigo_postal TEXT, referencias TEXT);
CREATE TABLE tipos_pago (id INTEGER PRIMARY KEY, nombre TEXT);
CREATE TABLE proveedores (id INTEGER PRIMARY KEY, nombre TEXT);
CREATE TABLE productos (id INTEGER PRIMARY KEY, nombre TEXT NOT NULL, descripcion TEXT, lote TEXT, serie TEXT,
  caducidad TEXT, id_proveedor INTEGER, costo REAL NOT NULL, precio REAL NOT NULL, imagen TEXT,
  activo INTEGER NOT NULL DEFAULT 1);
CREATE TABLE stock (id_producto INTEGER PRIMARY KEY REFERENCES productos(id), stock_actual INTEGER NOT NULL DEFAULT 0,
  stock_minimo INTEGER NOT NULL DEFAULT 0, stock_maximo INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT chk_stock_no_negativo CHECK (stock_actual >= 0));
CREATE TABLE ofertas (id INTEGER PRIMARY KEY, id_producto INTEGER UNIQUE REFERENCES productos(id),
  porcentaje_descuento REAL, precio_oferta REAL, activa INTEGER DEFAULT 1);
CREATE TABLE compras (id INTEGER PRIMARY KEY, id_proveedor INTEGER, id_usuario INTEGER, fecha TEXT DEFAULT CURRENT_TIMESTAMP, total REAL, estado TEXT);
CREATE TABLE detalle_compras (id INTEGER PRIMARY KEY, id_compra INTEGER, id_producto INTEGER, cantidad INTEGER, costo_unitario REAL);
CREATE TABLE carrito (id INTEGER PRIMARY KEY, id_cliente INTEGER NOT NULL REFERENCES clientes(id),
  fecha_creacion TEXT DEFAULT CURRENT_TIMESTAMP, estado TEXT DEFAULT 'abierto');
CREATE TABLE detalle_carrito (id INTEGER PRIMARY KEY, id_carrito INTEGER NOT NULL REFERENCES carrito(id),
  id_producto INTEGER NOT NULL REFERENCES productos(id), cantidad INTEGER NOT NULL, precio_unitario REAL);
CREATE TABLE pedidos (id INTEGER PRIMARY KEY, id_carrito INTEGER NOT NULL REFERENCES carrito(id),
  id_cliente INTEGER NOT NULL REFERENCES clientes(id), id_direccion INTEGER NOT NULL REFERENCES direcciones(id),
  id_tipo_pago INTEGER NOT NULL, id_tarjeta INTEGER, fecha TEXT DEFAULT CURRENT_TIMESTAMP, estado TEXT,
  total REAL, clave_idempotencia TEXT, referencia_pago TEXT UNIQUE, procesando_desde TEXT,
  fecha_confirmacion TEXT, fecha_cancelacion TEXT, motivo_cancelacion TEXT,
  UNIQUE (id_cliente, clave_idempotencia));
CREATE TABLE ventas (id INTEGER PRIMARY KEY, id_pedido INTEGER NOT NULL UNIQUE REFERENCES pedidos(id),
  id_cliente INTEGER NOT NULL, fecha TEXT DEFAULT CURRENT_TIMESTAMP, total REAL NOT NULL DEFAULT 0,
  estado TEXT NOT NULL DEFAULT 'confirmada', origen TEXT NOT NULL DEFAULT 'tienda');
CREATE TABLE detalle_ventas (id INTEGER PRIMARY KEY, id_venta INTEGER NOT NULL REFERENCES ventas(id),
  id_producto INTEGER NOT NULL REFERENCES productos(id), cantidad INTEGER NOT NULL, precio_unitario REAL NOT NULL,
  UNIQUE (id_venta, id_producto));
CREATE TABLE envios (id INTEGER PRIMARY KEY, id_venta INTEGER NOT NULL UNIQUE REFERENCES ventas(id), id_direccion INTEGER,
  paqueteria TEXT, num_guia TEXT UNIQUE, estado TEXT, fecha_envio TEXT, fecha_estimada_entrega TEXT, observaciones TEXT,
  id_usuario_registro INTEGER, fecha_creacion TEXT DEFAULT CURRENT_TIMESTAMP, fecha_actualizacion TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE historial_envios (id INTEGER PRIMARY KEY, id_envio INTEGER NOT NULL REFERENCES envios(id), estado TEXT NOT NULL,
  descripcion TEXT, ubicacion TEXT, id_usuario INTEGER, fecha TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE devoluciones_venta (id INTEGER PRIMARY KEY, id_venta INTEGER NOT NULL REFERENCES ventas(id),
  id_producto INTEGER NOT NULL REFERENCES productos(id), cantidad INTEGER NOT NULL CHECK (cantidad > 0), motivo TEXT,
  fecha TEXT DEFAULT CURRENT_TIMESTAMP, estado TEXT, folio TEXT UNIQUE, id_cliente INTEGER REFERENCES clientes(id),
  descripcion TEXT, evidencia TEXT, preferencia TEXT, instrucciones TEXT, id_usuario_autorizo INTEGER,
  fecha_autorizacion TEXT, cantidad_recibida INTEGER, condicion_producto TEXT, fecha_recepcion TEXT,
  id_usuario_recepcion INTEGER, cantidad_reintegrada INTEGER NOT NULL DEFAULT 0, tipo_resolucion TEXT,
  monto_reembolso REAL, referencia_resolucion TEXT, fecha_resolucion TEXT, observaciones TEXT,
  fecha_actualizacion TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE historial_devoluciones (id INTEGER PRIMARY KEY, id_devolucion INTEGER NOT NULL REFERENCES devoluciones_venta(id),
  estado_anterior TEXT, estado_nuevo TEXT NOT NULL, comentario TEXT, id_usuario INTEGER, fecha TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE garantias (id INTEGER PRIMARY KEY, id_venta INTEGER NOT NULL REFERENCES ventas(id), id_producto INTEGER NOT NULL,
  fecha_solicitud TEXT DEFAULT CURRENT_TIMESTAMP, motivo TEXT, estado TEXT, resolucion TEXT, folio TEXT UNIQUE,
  id_cliente INTEGER, descripcion TEXT, evidencia TEXT, id_usuario_gestion INTEGER, fecha_resolucion TEXT,
  fecha_actualizacion TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE historial_garantias (id INTEGER PRIMARY KEY, id_garantia INTEGER NOT NULL REFERENCES garantias(id),
  estado_anterior TEXT, estado_nuevo TEXT NOT NULL, comentario TEXT, id_usuario INTEGER, fecha TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE validacion_entrega (id INTEGER PRIMARY KEY, id_envio INTEGER NOT NULL UNIQUE REFERENCES envios(id),
  fecha_entrega_real TEXT, firma_evidencia TEXT, estado TEXT, recibido_por TEXT, observaciones TEXT,
  id_usuario_valido INTEGER, fecha_registro TEXT DEFAULT CURRENT_TIMESTAMP, confirmado_cliente INTEGER NOT NULL DEFAULT 0,
  fecha_confirmacion_cliente TEXT, comentario_cliente TEXT);
CREATE TABLE movimientos_inventario (id INTEGER PRIMARY KEY, id_producto INTEGER NOT NULL REFERENCES productos(id),
  tipo TEXT NOT NULL CHECK (tipo IN ('entrada','venta','devolucion','cancelacion','ajuste')),
  cantidad INTEGER NOT NULL CHECK (cantidad > 0), stock_anterior INTEGER NOT NULL, stock_resultante INTEGER NOT NULL,
  id_pedido INTEGER REFERENCES pedidos(id), id_compra INTEGER, id_devolucion INTEGER REFERENCES devoluciones_venta(id),
  id_usuario INTEGER, origen TEXT NOT NULL, motivo TEXT, clave_operacion TEXT UNIQUE,
  fecha TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE alertas_inventario (id INTEGER PRIMARY KEY, id_producto INTEGER NOT NULL, tipo TEXT NOT NULL, nivel TEXT NOT NULL,
  mensaje TEXT NOT NULL, stock_actual INTEGER NOT NULL, id_movimiento INTEGER, leida INTEGER NOT NULL DEFAULT 0,
  fecha TEXT DEFAULT CURRENT_TIMESTAMP);

INSERT INTO roles VALUES (1,'ADMIN'),(2,'CLIENTE'),(3,'VENDEDOR');
INSERT INTO usuarios VALUES (1,'admin','a@x.com',NULL,'Admin CUBEX',1),(10,'diego','d@x.com',NULL,'Diego Emanuel',2),
  (11,'fabi','f@x.com',NULL,'Fabricio Valdez',2);
INSERT INTO clientes VALUES (2,10,NULL,NULL),(3,11,NULL,NULL);
INSERT INTO direcciones VALUES (1,2,'Agosto 1290','Centro','Los Mochis','81285',NULL),(5,3,'Agosto 1290','Centro','Los Mochis','81285',NULL);
INSERT INTO tipos_pago VALUES (1,'Tarjeta');
INSERT INTO proveedores VALUES (1,'Distribuidora Rubik');
