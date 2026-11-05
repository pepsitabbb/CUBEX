-- ============================================
-- Base de datos: Tienda de Componentes de PC
-- Proyecto SOA - Función: Agregar Producto
-- ============================================

CREATE DATABASE IF NOT EXISTS tienda_pc
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE tienda_pc;

-- --------------------------------------------
-- Tabla: PROVEEDORES
-- --------------------------------------------
CREATE TABLE IF NOT EXISTS PROVEEDORES (
    id            INT AUTO_INCREMENT PRIMARY KEY,
    nombre        VARCHAR(150) NOT NULL,
    razon_social  VARCHAR(150) NOT NULL,
    rfc           VARCHAR(20)  NOT NULL,
    direccion     VARCHAR(255),
    correo        VARCHAR(150),
    telefono      VARCHAR(20)
) ENGINE=InnoDB;

-- --------------------------------------------
-- Tabla: PRODUCTOS
-- --------------------------------------------
CREATE TABLE IF NOT EXISTS PRODUCTOS (
    id            INT AUTO_INCREMENT PRIMARY KEY,
    nombre        VARCHAR(150) NOT NULL,
    descripcion   VARCHAR(500),
    lote          VARCHAR(50),
    serie         VARCHAR(50),
    caducidad     DATE NULL,
    id_proveedor  INT NOT NULL,
    costo         DECIMAL(12,2) NOT NULL,
    precio        DECIMAL(12,2) NOT NULL,
    CONSTRAINT fk_productos_proveedor
        FOREIGN KEY (id_proveedor) REFERENCES PROVEEDORES(id)
) ENGINE=InnoDB;

-- --------------------------------------------
-- Tabla: STOCK
-- --------------------------------------------
CREATE TABLE IF NOT EXISTS STOCK (
    id_producto   INT PRIMARY KEY,
    stock_actual  INT NOT NULL DEFAULT 0,
    stock_minimo  INT NOT NULL DEFAULT 0,
    stock_maximo  INT NOT NULL DEFAULT 0,
    CONSTRAINT fk_stock_producto
        FOREIGN KEY (id_producto) REFERENCES PRODUCTOS(id)
        ON DELETE CASCADE
) ENGINE=InnoDB;

-- --------------------------------------------
-- Datos de ejemplo para poder probar la API
-- (se necesita al menos un proveedor para
--  registrar productos)
-- --------------------------------------------
INSERT INTO PROVEEDORES (nombre, razon_social, rfc, direccion, correo, telefono)
VALUES
  ('NVIDIA México', 'NVIDIA Mexico SA de CV', 'NVM010101AAA', 'Av. Reforma 100, CDMX', 'contacto@nvidia-mx.com', '5555555555'),
  ('AMD Distribuciones', 'AMD Distribuciones SA de CV', 'AMD020202BBB', 'Blvd. Norte 200, Monterrey', 'ventas@amd-dist.com', '8112223344');
