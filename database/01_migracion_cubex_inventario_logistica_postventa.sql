-- =====================================================================
-- CUBEX - MIGRACIÓN 01
-- Inventario automático, movimientos, alertas, ventas, logística
-- (envíos, rastreo, validación de entregas) y postventa
-- (garantías y devoluciones).
--
-- Base de datos objetivo : tienda_db (MySQL 8.0.16 o superior)
-- Tipo de migración      : NO DESTRUCTIVA
--   * No elimina tablas, columnas, relaciones ni registros.
--   * Solo agrega columnas, índices, restricciones y tablas nuevas.
--   * Puede ejecutarse varias veces: cada cambio comprueba primero
--     si ya existe (procedimientos auxiliares al inicio del script).
--
-- Recomendación: antes de ejecutarla, respalda la base con
--   mysqldump -u root -p tienda_db > respaldo_tienda_db.sql
--
-- Ejecución:
--   mysql -u root -p tienda_db < database/01_migracion_cubex_inventario_logistica_postventa.sql
--   (o abre el archivo en MySQL Workbench y ejecútalo completo)
-- =====================================================================

USE tienda_db;

SET NAMES utf8mb4;

-- MySQL Workbench activa el "safe update mode" por defecto; los UPDATE
-- de la sección 7 lo necesitan desactivado (solo en esta sesión).
SET @cubex_safe_updates = @@SQL_SAFE_UPDATES;
SET SQL_SAFE_UPDATES = 0;

-- ---------------------------------------------------------------------
-- 0. PROCEDIMIENTOS AUXILIARES (se eliminan al final del script)
-- ---------------------------------------------------------------------

DROP PROCEDURE IF EXISTS cubex_agregar_columna;
DROP PROCEDURE IF EXISTS cubex_agregar_indice;
DROP PROCEDURE IF EXISTS cubex_agregar_restriccion;

DELIMITER $$

-- Agrega una columna solo si todavía no existe.
CREATE PROCEDURE cubex_agregar_columna(
    IN p_tabla VARCHAR(64),
    IN p_columna VARCHAR(64),
    IN p_definicion TEXT
)
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = p_tabla
          AND COLUMN_NAME = p_columna
    ) THEN
        SET @cubex_sql = CONCAT(
            'ALTER TABLE `', p_tabla, '` ADD COLUMN `', p_columna, '` ', p_definicion
        );
        PREPARE sentencia FROM @cubex_sql;
        EXECUTE sentencia;
        DEALLOCATE PREPARE sentencia;
    END IF;
END$$

-- Agrega un índice (normal o UNIQUE) solo si todavía no existe.
-- p_definicion ejemplo: 'UNIQUE KEY `uq_x` (`columna`)'
CREATE PROCEDURE cubex_agregar_indice(
    IN p_tabla VARCHAR(64),
    IN p_indice VARCHAR(64),
    IN p_definicion TEXT
)
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM information_schema.STATISTICS
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = p_tabla
          AND INDEX_NAME = p_indice
    ) THEN
        SET @cubex_sql = CONCAT('ALTER TABLE `', p_tabla, '` ADD ', p_definicion);
        PREPARE sentencia FROM @cubex_sql;
        EXECUTE sentencia;
        DEALLOCATE PREPARE sentencia;
    END IF;
END$$

-- Agrega una restricción (FOREIGN KEY o CHECK) solo si no existe.
-- p_definicion ejemplo: 'CONSTRAINT `fk_x` FOREIGN KEY (...) REFERENCES ...'
CREATE PROCEDURE cubex_agregar_restriccion(
    IN p_tabla VARCHAR(64),
    IN p_restriccion VARCHAR(64),
    IN p_definicion TEXT
)
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM information_schema.TABLE_CONSTRAINTS
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = p_tabla
          AND CONSTRAINT_NAME = p_restriccion
    ) THEN
        SET @cubex_sql = CONCAT('ALTER TABLE `', p_tabla, '` ADD ', p_definicion);
        PREPARE sentencia FROM @cubex_sql;
        EXECUTE sentencia;
        DEALLOCATE PREPARE sentencia;
    END IF;
END$$

DELIMITER ;


-- =====================================================================
-- 1. PRODUCTOS Y STOCK
-- =====================================================================

-- Eliminación lógica: un producto inactivo no aparece en la tienda.
CALL cubex_agregar_columna(
    'productos', 'activo',
    'TINYINT(1) NOT NULL DEFAULT 1 COMMENT ''1 = visible y vendible, 0 = eliminado lógicamente'''
);

-- Cada producto tiene su fila de existencias. Los productos que aún no
-- tenían fila se registran con 0 unidades (su existencia real), para
-- que el inventario pueda bloquear la fila durante una venta.
INSERT INTO stock (id_producto, stock_actual, stock_minimo, stock_maximo)
SELECT p.id, 0, 0, 0
FROM productos p
LEFT JOIN stock s ON s.id_producto = p.id
WHERE s.id_producto IS NULL;

-- El inventario nunca puede quedar negativo (MySQL 8.0.16+ aplica CHECK).
CALL cubex_agregar_restriccion(
    'stock', 'chk_stock_no_negativo',
    'CONSTRAINT `chk_stock_no_negativo` CHECK (`stock_actual` >= 0)'
);


-- =====================================================================
-- 2. PEDIDOS, CARRITO Y VENTAS
-- =====================================================================

-- Precio con el que se vendió cada producto (incluye ofertas activas).
CALL cubex_agregar_columna(
    'detalle_carrito', 'precio_unitario',
    'DECIMAL(10,2) NULL COMMENT ''Precio aplicado al crear el pedido'''
);

CALL cubex_agregar_columna('pedidos', 'total',
    'DECIMAL(10,2) NULL COMMENT ''Total calculado por el servidor''');

CALL cubex_agregar_columna('pedidos', 'clave_idempotencia',
    'VARCHAR(64) NULL COMMENT ''Evita registrar dos veces el mismo pedido''');

CALL cubex_agregar_columna('pedidos', 'referencia_pago',
    'VARCHAR(100) NULL COMMENT ''Identificador de la transacción aprobada''');

CALL cubex_agregar_columna('pedidos', 'procesando_desde',
    'DATETIME NULL COMMENT ''Inicio de la confirmación en curso''');

CALL cubex_agregar_columna('pedidos', 'fecha_confirmacion', 'DATETIME NULL');
CALL cubex_agregar_columna('pedidos', 'fecha_cancelacion', 'DATETIME NULL');
CALL cubex_agregar_columna('pedidos', 'motivo_cancelacion', 'VARCHAR(255) NULL');

CALL cubex_agregar_indice('pedidos', 'uq_pedidos_idempotencia',
    'UNIQUE KEY `uq_pedidos_idempotencia` (`id_cliente`, `clave_idempotencia`)');

CALL cubex_agregar_indice('pedidos', 'uq_pedidos_referencia_pago',
    'UNIQUE KEY `uq_pedidos_referencia_pago` (`referencia_pago`)');

-- Una venta por pedido.
CALL cubex_agregar_columna('ventas', 'estado',
    'VARCHAR(30) NOT NULL DEFAULT ''confirmada''');

CALL cubex_agregar_columna('ventas', 'origen',
    'VARCHAR(30) NOT NULL DEFAULT ''tienda'' COMMENT ''tienda | migracion''');

CALL cubex_agregar_indice('ventas', 'uq_ventas_pedido',
    'UNIQUE KEY `uq_ventas_pedido` (`id_pedido`)');

CALL cubex_agregar_indice('detalle_ventas', 'uq_detalle_venta_producto',
    'UNIQUE KEY `uq_detalle_venta_producto` (`id_venta`, `id_producto`)');


-- =====================================================================
-- 3. MOVIMIENTOS Y ALERTAS DE INVENTARIO
-- =====================================================================

CREATE TABLE IF NOT EXISTS movimientos_inventario (
    id               INT NOT NULL AUTO_INCREMENT,
    id_producto      INT NOT NULL,
    tipo             ENUM('entrada','venta','devolucion','cancelacion','ajuste') NOT NULL,
    cantidad         INT NOT NULL COMMENT 'Unidades movidas (siempre positivo)',
    stock_anterior   INT NOT NULL,
    stock_resultante INT NOT NULL,
    id_pedido        INT NULL,
    id_compra        INT NULL,
    id_devolucion    INT NULL,
    id_usuario       INT NULL COMMENT 'Usuario que originó el movimiento',
    origen           VARCHAR(60) NOT NULL COMMENT 'Servicio o pantalla que lo registró',
    motivo           VARCHAR(255) NULL,
    clave_operacion  VARCHAR(150) NULL COMMENT 'Clave única: impide movimientos duplicados',
    fecha            DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uq_movimientos_clave (clave_operacion),
    KEY idx_movimientos_producto_fecha (id_producto, fecha),
    KEY idx_movimientos_pedido (id_pedido),
    KEY idx_movimientos_tipo_fecha (tipo, fecha),
    CONSTRAINT fk_movimientos_producto FOREIGN KEY (id_producto) REFERENCES productos (id),
    CONSTRAINT fk_movimientos_pedido   FOREIGN KEY (id_pedido)   REFERENCES pedidos (id),
    CONSTRAINT fk_movimientos_compra   FOREIGN KEY (id_compra)   REFERENCES compras (id),
    CONSTRAINT fk_movimientos_usuario  FOREIGN KEY (id_usuario)  REFERENCES usuarios (id),
    CONSTRAINT chk_movimientos_cantidad CHECK (cantidad > 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='Historial auditable de entradas, ventas, devoluciones, cancelaciones y ajustes';

CREATE TABLE IF NOT EXISTS alertas_inventario (
    id             INT NOT NULL AUTO_INCREMENT,
    id_producto    INT NOT NULL,
    tipo           ENUM('agotado','stock_minimo','stock_bajo','salida','entrada') NOT NULL,
    nivel          ENUM('info','advertencia','critica') NOT NULL DEFAULT 'info',
    mensaje        VARCHAR(255) NOT NULL,
    stock_actual   INT NOT NULL,
    id_movimiento  INT NULL,
    leida          TINYINT(1) NOT NULL DEFAULT 0,
    fecha          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY idx_alertas_leida_fecha (leida, fecha),
    KEY idx_alertas_producto (id_producto),
    CONSTRAINT fk_alertas_producto   FOREIGN KEY (id_producto)   REFERENCES productos (id),
    CONSTRAINT fk_alertas_movimiento FOREIGN KEY (id_movimiento) REFERENCES movimientos_inventario (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='Alertas de agotado, stock mínimo, pocas unidades, entradas y salidas';


-- =====================================================================
-- 4. ENVÍOS, RASTREO Y VALIDACIÓN DE ENTREGAS
-- =====================================================================

CALL cubex_agregar_columna('envios', 'observaciones', 'VARCHAR(500) NULL');
CALL cubex_agregar_columna('envios', 'id_usuario_registro', 'INT NULL');
CALL cubex_agregar_columna('envios', 'fecha_creacion',
    'DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP');
CALL cubex_agregar_columna('envios', 'fecha_actualizacion',
    'DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP');

-- Un envío por venta y números de guía únicos (NULL = guía pendiente).
CALL cubex_agregar_indice('envios', 'uq_envios_venta',
    'UNIQUE KEY `uq_envios_venta` (`id_venta`)');
CALL cubex_agregar_indice('envios', 'uq_envios_guia',
    'UNIQUE KEY `uq_envios_guia` (`num_guia`)');
CALL cubex_agregar_restriccion('envios', 'fk_envios_usuario_registro',
    'CONSTRAINT `fk_envios_usuario_registro` FOREIGN KEY (`id_usuario_registro`) REFERENCES `usuarios` (`id`)');

-- Historial de seguimiento. Solo contiene movimientos registrados por
-- el personal de CUBEX (no se inventan eventos de la paquetería).
CREATE TABLE IF NOT EXISTS historial_envios (
    id          INT NOT NULL AUTO_INCREMENT,
    id_envio    INT NOT NULL,
    estado      VARCHAR(30) NOT NULL,
    descripcion VARCHAR(500) NULL,
    ubicacion   VARCHAR(150) NULL,
    id_usuario  INT NULL,
    fecha       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY idx_historial_envios_envio_fecha (id_envio, fecha),
    CONSTRAINT fk_historial_envios_envio   FOREIGN KEY (id_envio)   REFERENCES envios (id),
    CONSTRAINT fk_historial_envios_usuario FOREIGN KEY (id_usuario) REFERENCES usuarios (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CALL cubex_agregar_columna('validacion_entrega', 'recibido_por', 'VARCHAR(150) NULL');
CALL cubex_agregar_columna('validacion_entrega', 'observaciones', 'VARCHAR(500) NULL');
CALL cubex_agregar_columna('validacion_entrega', 'id_usuario_valido', 'INT NULL');
CALL cubex_agregar_columna('validacion_entrega', 'fecha_registro',
    'DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP');
CALL cubex_agregar_columna('validacion_entrega', 'confirmado_cliente',
    'TINYINT(1) NOT NULL DEFAULT 0');
CALL cubex_agregar_columna('validacion_entrega', 'fecha_confirmacion_cliente', 'DATETIME NULL');
CALL cubex_agregar_columna('validacion_entrega', 'comentario_cliente', 'VARCHAR(500) NULL');

-- Evita validar dos veces la misma entrega.
CALL cubex_agregar_indice('validacion_entrega', 'uq_validacion_envio',
    'UNIQUE KEY `uq_validacion_envio` (`id_envio`)');
CALL cubex_agregar_restriccion('validacion_entrega', 'fk_validacion_usuario',
    'CONSTRAINT `fk_validacion_usuario` FOREIGN KEY (`id_usuario_valido`) REFERENCES `usuarios` (`id`)');


-- =====================================================================
-- 5. GARANTÍAS
-- =====================================================================

CALL cubex_agregar_columna('garantias', 'folio', 'VARCHAR(30) NULL');
CALL cubex_agregar_columna('garantias', 'id_cliente', 'INT NULL');
CALL cubex_agregar_columna('garantias', 'descripcion', 'TEXT NULL');
CALL cubex_agregar_columna('garantias', 'evidencia', 'VARCHAR(255) NULL');
CALL cubex_agregar_columna('garantias', 'id_usuario_gestion', 'INT NULL');
CALL cubex_agregar_columna('garantias', 'fecha_resolucion', 'DATETIME NULL');
CALL cubex_agregar_columna('garantias', 'fecha_actualizacion',
    'DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP');

CALL cubex_agregar_indice('garantias', 'uq_garantias_folio',
    'UNIQUE KEY `uq_garantias_folio` (`folio`)');
CALL cubex_agregar_restriccion('garantias', 'fk_garantias_cliente',
    'CONSTRAINT `fk_garantias_cliente` FOREIGN KEY (`id_cliente`) REFERENCES `clientes` (`id`)');
CALL cubex_agregar_restriccion('garantias', 'fk_garantias_usuario_gestion',
    'CONSTRAINT `fk_garantias_usuario_gestion` FOREIGN KEY (`id_usuario_gestion`) REFERENCES `usuarios` (`id`)');

CREATE TABLE IF NOT EXISTS historial_garantias (
    id              INT NOT NULL AUTO_INCREMENT,
    id_garantia     INT NOT NULL,
    estado_anterior VARCHAR(30) NULL,
    estado_nuevo    VARCHAR(30) NOT NULL,
    comentario      VARCHAR(500) NULL,
    id_usuario      INT NULL,
    fecha           DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY idx_historial_garantias (id_garantia, fecha),
    CONSTRAINT fk_historial_garantias_garantia FOREIGN KEY (id_garantia) REFERENCES garantias (id),
    CONSTRAINT fk_historial_garantias_usuario  FOREIGN KEY (id_usuario)  REFERENCES usuarios (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- =====================================================================
-- 6. DEVOLUCIONES DE VENTA
-- (cada solicitud corresponde a un producto de una venta)
-- =====================================================================

CALL cubex_agregar_columna('devoluciones_venta', 'folio', 'VARCHAR(30) NULL');
CALL cubex_agregar_columna('devoluciones_venta', 'id_cliente', 'INT NULL');
CALL cubex_agregar_columna('devoluciones_venta', 'descripcion', 'TEXT NULL');
CALL cubex_agregar_columna('devoluciones_venta', 'evidencia', 'VARCHAR(255) NULL');
CALL cubex_agregar_columna('devoluciones_venta', 'preferencia',
    'ENUM(''reembolso'',''reemplazo'') NULL COMMENT ''Lo que solicita el cliente''');
CALL cubex_agregar_columna('devoluciones_venta', 'instrucciones', 'TEXT NULL');
CALL cubex_agregar_columna('devoluciones_venta', 'id_usuario_autorizo', 'INT NULL');
CALL cubex_agregar_columna('devoluciones_venta', 'fecha_autorizacion', 'DATETIME NULL');
CALL cubex_agregar_columna('devoluciones_venta', 'cantidad_recibida', 'INT NULL');
CALL cubex_agregar_columna('devoluciones_venta', 'condicion_producto',
    'ENUM(''vendible'',''danado'',''no_apto'') NULL');
CALL cubex_agregar_columna('devoluciones_venta', 'fecha_recepcion', 'DATETIME NULL');
CALL cubex_agregar_columna('devoluciones_venta', 'id_usuario_recepcion', 'INT NULL');
CALL cubex_agregar_columna('devoluciones_venta', 'cantidad_reintegrada',
    'INT NOT NULL DEFAULT 0 COMMENT ''Unidades que regresaron al inventario''');
CALL cubex_agregar_columna('devoluciones_venta', 'tipo_resolucion',
    'ENUM(''reembolso'',''reemplazo'') NULL');
CALL cubex_agregar_columna('devoluciones_venta', 'monto_reembolso', 'DECIMAL(10,2) NULL');
CALL cubex_agregar_columna('devoluciones_venta', 'referencia_resolucion', 'VARCHAR(120) NULL');
CALL cubex_agregar_columna('devoluciones_venta', 'fecha_resolucion', 'DATETIME NULL');
CALL cubex_agregar_columna('devoluciones_venta', 'observaciones', 'VARCHAR(500) NULL');
CALL cubex_agregar_columna('devoluciones_venta', 'fecha_actualizacion',
    'DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP');

CALL cubex_agregar_indice('devoluciones_venta', 'uq_devoluciones_folio',
    'UNIQUE KEY `uq_devoluciones_folio` (`folio`)');
CALL cubex_agregar_restriccion('devoluciones_venta', 'chk_devoluciones_cantidad',
    'CONSTRAINT `chk_devoluciones_cantidad` CHECK (`cantidad` > 0)');
CALL cubex_agregar_restriccion('devoluciones_venta', 'fk_devoluciones_cliente',
    'CONSTRAINT `fk_devoluciones_cliente` FOREIGN KEY (`id_cliente`) REFERENCES `clientes` (`id`)');
CALL cubex_agregar_restriccion('devoluciones_venta', 'fk_devoluciones_autorizo',
    'CONSTRAINT `fk_devoluciones_autorizo` FOREIGN KEY (`id_usuario_autorizo`) REFERENCES `usuarios` (`id`)');
CALL cubex_agregar_restriccion('devoluciones_venta', 'fk_devoluciones_recepcion',
    'CONSTRAINT `fk_devoluciones_recepcion` FOREIGN KEY (`id_usuario_recepcion`) REFERENCES `usuarios` (`id`)');

CREATE TABLE IF NOT EXISTS historial_devoluciones (
    id              INT NOT NULL AUTO_INCREMENT,
    id_devolucion   INT NOT NULL,
    estado_anterior VARCHAR(30) NULL,
    estado_nuevo    VARCHAR(30) NOT NULL,
    comentario      VARCHAR(500) NULL,
    id_usuario      INT NULL,
    fecha           DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY idx_historial_devoluciones (id_devolucion, fecha),
    CONSTRAINT fk_historial_devoluciones_devolucion FOREIGN KEY (id_devolucion) REFERENCES devoluciones_venta (id),
    CONSTRAINT fk_historial_devoluciones_usuario    FOREIGN KEY (id_usuario)    REFERENCES usuarios (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Relación movimiento de inventario -> devolución (se crea aquí porque
-- la tabla devoluciones_venta ya existía antes de esta migración).
CALL cubex_agregar_restriccion('movimientos_inventario', 'fk_movimientos_devolucion',
    'CONSTRAINT `fk_movimientos_devolucion` FOREIGN KEY (`id_devolucion`) REFERENCES `devoluciones_venta` (`id`)');


-- =====================================================================
-- 7. DATOS DERIVADOS DE PEDIDOS EXISTENTES (no destructivo)
-- =====================================================================

-- 7.1 Total de los pedidos existentes que todavía no lo tienen.
--     Se calcula con el precio guardado en detalle_carrito o, para
--     pedidos anteriores a esta migración, con el precio del producto.
UPDATE pedidos p
JOIN (
    SELECT dc.id_carrito,
           ROUND(SUM(dc.cantidad * COALESCE(dc.precio_unitario, pr.precio)), 2) AS total
    FROM detalle_carrito dc
    JOIN productos pr ON pr.id = dc.id_producto
    GROUP BY dc.id_carrito
) t ON t.id_carrito = p.id_carrito
SET p.total = t.total
WHERE p.total IS NULL;

-- 7.2 Ventas de los pedidos que ya estaban confirmados antes de esta
--     migración (necesarias para poder registrar su envío).
--     Se marcan con origen = 'migracion' y NO generan movimientos de
--     inventario, porque en su momento no se descontó stock; por eso
--     tampoco se reintegrará stock si se cancelan.
INSERT INTO ventas (id_pedido, id_cliente, fecha, total, estado, origen)
SELECT p.id, p.id_cliente, p.fecha, COALESCE(p.total, 0), 'confirmada', 'migracion'
FROM pedidos p
LEFT JOIN ventas v ON v.id_pedido = p.id
WHERE LOWER(p.estado) = 'confirmado'
  AND v.id IS NULL;

INSERT INTO detalle_ventas (id_venta, id_producto, cantidad, precio_unitario)
SELECT v.id, dc.id_producto, SUM(dc.cantidad), MAX(COALESCE(dc.precio_unitario, pr.precio))
FROM ventas v
JOIN pedidos p          ON p.id = v.id_pedido
JOIN detalle_carrito dc ON dc.id_carrito = p.id_carrito
JOIN productos pr       ON pr.id = dc.id_producto
LEFT JOIN detalle_ventas dv
       ON dv.id_venta = v.id AND dv.id_producto = dc.id_producto
WHERE v.origen = 'migracion'
  AND dv.id IS NULL
GROUP BY v.id, dc.id_producto;


-- ---------------------------------------------------------------------
-- 8. LIMPIEZA DE PROCEDIMIENTOS AUXILIARES
-- ---------------------------------------------------------------------

DROP PROCEDURE IF EXISTS cubex_agregar_columna;
DROP PROCEDURE IF EXISTS cubex_agregar_indice;
DROP PROCEDURE IF EXISTS cubex_agregar_restriccion;

-- Restaurar el modo seguro como estaba.
SET SQL_SAFE_UPDATES = @cubex_safe_updates;

-- Verificación rápida (opcional):
-- SELECT p.id, p.nombre, p.activo, s.stock_actual FROM productos p JOIN stock s ON s.id_producto = p.id;
-- SHOW TABLES LIKE '%movimientos%';
