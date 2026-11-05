-- ============================================================
-- BD02 (subconjunto) - SERVICIO DE VERIFICACIÓN DE TARJETA
-- Motor: MySQL 8.x (InnoDB, utf8mb4)
-- Solo las 12 tablas que usa el servicio, idénticas a las de la base
-- completa de la repostería (bd02_reposteria.sql).
-- ============================================================

CREATE DATABASE IF NOT EXISTS bd02
  CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE bd02;

SET FOREIGN_KEY_CHECKS = 0;

CREATE TABLE `ROLES` (
  `id`          INT NOT NULL AUTO_INCREMENT,
  `nombre_rol`  VARCHAR(50)  NOT NULL,
  `descripcion` VARCHAR(150) NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_roles_nombre` (`nombre_rol`)
) ENGINE=InnoDB;

CREATE TABLE `USUARIOS` (
  `id`                INT NOT NULL AUTO_INCREMENT,
  `nombre`            VARCHAR(100) NOT NULL,
  `correo`            VARCHAR(150) NOT NULL,
  `telefono`          VARCHAR(20)  NULL,
  `password_hash`     VARCHAR(255) NOT NULL,
  `id_rol`            INT NOT NULL,
  `estado`            VARCHAR(20)  NOT NULL DEFAULT 'activo',
  `intentos_fallidos` INT NOT NULL DEFAULT 0,
  `fecha_registro`    DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_usuarios_correo` (`correo`),
  KEY `ix_usuarios_rol` (`id_rol`),
  CONSTRAINT `fk_usuarios_rol` FOREIGN KEY (`id_rol`) REFERENCES `ROLES` (`id`)
) ENGINE=InnoDB;

CREATE TABLE `CLIENTES` (
  `id`         INT NOT NULL AUTO_INCREMENT,
  `id_usuario` INT NOT NULL,
  `rfc`        VARCHAR(13) NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_clientes_usuario` (`id_usuario`),
  CONSTRAINT `fk_clientes_usuario` FOREIGN KEY (`id_usuario`) REFERENCES `USUARIOS` (`id`)
) ENGINE=InnoDB;

CREATE TABLE `CATEGORIAS` (
  `id`          INT NOT NULL AUTO_INCREMENT,
  `nombre`      VARCHAR(80)  NOT NULL,
  `descripcion` VARCHAR(150) NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_categorias_nombre` (`nombre`)
) ENGINE=InnoDB;

CREATE TABLE `PRODUCTOS` (
  `id`                INT NOT NULL AUTO_INCREMENT,
  `id_categoria`      INT NOT NULL,
  `nombre`            VARCHAR(120) NOT NULL,
  `descripcion`       TEXT NULL,
  `sabor`             VARCHAR(60)  NULL,
  `porciones`         INT NULL,
  `lote`              VARCHAR(50)  NULL,
  `caducidad`         DATE NULL,
  `costo`             DECIMAL(10,2) NOT NULL,
  `precio`            DECIMAL(10,2) NOT NULL,
  `es_personalizable` TINYINT(1) NOT NULL DEFAULT 0,
  `activo`            TINYINT(1) NOT NULL DEFAULT 1,
  `imagen_url`        VARCHAR(255) NULL,
  PRIMARY KEY (`id`),
  KEY `ix_productos_categoria` (`id_categoria`),
  CONSTRAINT `fk_productos_categoria` FOREIGN KEY (`id_categoria`) REFERENCES `CATEGORIAS` (`id`)
) ENGINE=InnoDB;

CREATE TABLE `STOCK` (
  `id_producto`  INT NOT NULL,
  `stock_actual` INT NOT NULL DEFAULT 0,
  `stock_minimo` INT NOT NULL DEFAULT 0,
  `stock_maximo` INT NOT NULL DEFAULT 0,
  PRIMARY KEY (`id_producto`),
  CONSTRAINT `fk_stock_producto` FOREIGN KEY (`id_producto`) REFERENCES `PRODUCTOS` (`id`)
) ENGINE=InnoDB;

CREATE TABLE `CARRITO` (
  `id`             INT NOT NULL AUTO_INCREMENT,
  `id_cliente`     INT NOT NULL,
  `fecha_creacion` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `estado`         VARCHAR(20) NOT NULL DEFAULT 'abierto',
  PRIMARY KEY (`id`),
  KEY `ix_carrito_cliente` (`id_cliente`),
  CONSTRAINT `fk_carrito_cliente` FOREIGN KEY (`id_cliente`) REFERENCES `CLIENTES` (`id`)
) ENGINE=InnoDB;

CREATE TABLE `DETALLE_CARRITO` (
  `id`          INT NOT NULL AUTO_INCREMENT,
  `id_carrito`  INT NOT NULL,
  `id_producto` INT NOT NULL,
  `cantidad`    INT NOT NULL,
  PRIMARY KEY (`id`),
  KEY `ix_detcarrito_carrito` (`id_carrito`),
  KEY `ix_detcarrito_producto` (`id_producto`),
  CONSTRAINT `fk_detcarrito_carrito`  FOREIGN KEY (`id_carrito`)  REFERENCES `CARRITO` (`id`),
  CONSTRAINT `fk_detcarrito_producto` FOREIGN KEY (`id_producto`) REFERENCES `PRODUCTOS` (`id`)
) ENGINE=InnoDB;

CREATE TABLE `TIPOS_PAGO` (
  `id`     INT NOT NULL AUTO_INCREMENT,
  `nombre` VARCHAR(50) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_tipospago_nombre` (`nombre`)
) ENGINE=InnoDB;

-- Nunca se guarda el número completo ni el CVV: solo token del procesador,
-- últimos 4 dígitos, marca y vencimiento.
CREATE TABLE `TARJETAS` (
  `id`              INT NOT NULL AUTO_INCREMENT,
  `id_cliente`      INT NOT NULL,
  `token_pago`      VARCHAR(255) NOT NULL,
  `ultimos_digitos` CHAR(4) NOT NULL,
  `marca`           VARCHAR(20) NOT NULL,
  `mes_expiracion`  TINYINT NOT NULL,
  `anio_expiracion` SMALLINT NOT NULL,
  `verificada`      TINYINT(1) NOT NULL DEFAULT 0,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_tarjetas_token` (`token_pago`),
  KEY `ix_tarjetas_cliente` (`id_cliente`),
  CONSTRAINT `fk_tarjetas_cliente` FOREIGN KEY (`id_cliente`) REFERENCES `CLIENTES` (`id`)
) ENGINE=InnoDB;

CREATE TABLE `DIRECCIONES` (
  `id`            INT NOT NULL AUTO_INCREMENT,
  `id_cliente`    INT NOT NULL,
  `calle_numero`  VARCHAR(150) NOT NULL,
  `colonia`       VARCHAR(100) NULL,
  `ciudad`        VARCHAR(100) NULL,
  `codigo_postal` VARCHAR(10)  NULL,
  `referencias`   VARCHAR(200) NULL,
  PRIMARY KEY (`id`),
  KEY `ix_direcciones_cliente` (`id_cliente`),
  CONSTRAINT `fk_direcciones_cliente` FOREIGN KEY (`id_cliente`) REFERENCES `CLIENTES` (`id`)
) ENGINE=InnoDB;

CREATE TABLE `PEDIDOS` (
  `id`                         INT NOT NULL AUTO_INCREMENT,
  `id_carrito`                 INT NOT NULL,
  `id_cliente`                 INT NOT NULL,
  `id_direccion`               INT NULL,
  `id_tipo_pago`               INT NOT NULL,
  `id_tarjeta`                 INT NULL,
  `tipo_entrega`               VARCHAR(20) NOT NULL DEFAULT 'DOMICILIO',
  `fecha_pedido`               DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `fecha_entrega_programada`   DATETIME(3) NULL,
  `anticipo`                   DECIMAL(10,2) NOT NULL DEFAULT 0,
  `estado`                     VARCHAR(20) NOT NULL DEFAULT 'pendiente',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_pedidos_carrito` (`id_carrito`),
  KEY `ix_pedidos_cliente` (`id_cliente`),
  KEY `ix_pedidos_direccion` (`id_direccion`),
  KEY `ix_pedidos_tipopago` (`id_tipo_pago`),
  KEY `ix_pedidos_tarjeta` (`id_tarjeta`),
  CONSTRAINT `ck_pedidos_entrega` CHECK (`tipo_entrega` IN ('DOMICILIO','RECOGER')),
  CONSTRAINT `fk_pedidos_carrito`   FOREIGN KEY (`id_carrito`)   REFERENCES `CARRITO` (`id`),
  CONSTRAINT `fk_pedidos_cliente`   FOREIGN KEY (`id_cliente`)   REFERENCES `CLIENTES` (`id`),
  CONSTRAINT `fk_pedidos_direccion` FOREIGN KEY (`id_direccion`) REFERENCES `DIRECCIONES` (`id`),
  CONSTRAINT `fk_pedidos_tipopago`  FOREIGN KEY (`id_tipo_pago`) REFERENCES `TIPOS_PAGO` (`id`),
  CONSTRAINT `fk_pedidos_tarjeta`   FOREIGN KEY (`id_tarjeta`)   REFERENCES `TARJETAS` (`id`)
) ENGINE=InnoDB;

SET FOREIGN_KEY_CHECKS = 1;

-- ============================================================
-- DATOS INICIALES
-- (los usuarios, el cliente demo y el pedido de ejemplo se crean con: npm run prisma:seed)
-- ============================================================

INSERT INTO `ROLES` (`id`, `nombre_rol`, `descripcion`) VALUES
  (1, 'ADMIN',     'Administrador del sistema'),
  (2, 'CLIENTE',   'Cliente de la tienda'),
  (3, 'REPOSTERO', 'Personal de producción: inventario e insumos');

INSERT INTO `TIPOS_PAGO` (`nombre`) VALUES
  ('Tarjeta de crédito/débito'), ('Transferencia'), ('Efectivo contra entrega'), ('Pago en tienda');

INSERT INTO `CATEGORIAS` (`nombre`, `descripcion`) VALUES
  ('Pasteles', 'Pasteles y tartas para toda ocasión'),
  ('Cupcakes', 'Cupcakes individuales y cajas'),
  ('Galletas', 'Galletas decoradas y de temporada'),
  ('Pan dulce', 'Pan dulce tradicional'),
  ('Postres', 'Gelatinas, flanes, cheesecakes y vasitos'),
  ('Mesa de dulces', 'Paquetes para eventos');
