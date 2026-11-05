CREATE DATABASE IF NOT EXISTS tienda;
USE tienda;

-- Estructura mínima necesaria para probar el módulo de logística.
-- Si tu proyecto principal ya tiene estas tablas, conserva su estructura
-- y adapta únicamente los nombres de columnas si son diferentes.

CREATE TABLE IF NOT EXISTS DIRECCIONES (
    id INT AUTO_INCREMENT PRIMARY KEY,
    id_cliente INT NOT NULL,
    direccion VARCHAR(255) NOT NULL,
    colonia VARCHAR(150),
    codigo_postal VARCHAR(10)
);

CREATE TABLE IF NOT EXISTS VENTAS (
    id INT AUTO_INCREMENT PRIMARY KEY,
    id_pedido INT NULL,
    id_cliente INT NOT NULL,
    fecha DATE,
    total DECIMAL(10,2)
);

CREATE TABLE IF NOT EXISTS ENVIOS (
    id INT AUTO_INCREMENT PRIMARY KEY,
    id_venta INT NOT NULL,
    id_direccion INT NOT NULL,
    num_guia VARCHAR(100) NOT NULL UNIQUE,
    estado VARCHAR(50) NOT NULL DEFAULT 'pendiente',
    CONSTRAINT fk_envio_venta
        FOREIGN KEY (id_venta) REFERENCES VENTAS(id),
    CONSTRAINT fk_envio_direccion
        FOREIGN KEY (id_direccion) REFERENCES DIRECCIONES(id)
);

CREATE TABLE IF NOT EXISTS VALIDACION_ENTREGA (
    id INT AUTO_INCREMENT PRIMARY KEY,
    id_envio INT NOT NULL,
    fecha_entrega_real DATETIME NOT NULL,
    estado VARCHAR(50) NOT NULL,
    CONSTRAINT fk_validacion_envio
        FOREIGN KEY (id_envio) REFERENCES ENVIOS(id)
);

CREATE TABLE IF NOT EXISTS COMPROBANTES (
    id INT AUTO_INCREMENT PRIMARY KEY,
    id_venta INT NOT NULL,
    folio VARCHAR(100),
    enviado_correo BOOLEAN DEFAULT FALSE
);

-- Datos de prueba. INSERT IGNORE evita duplicados al ejecutar el script otra vez.
INSERT IGNORE INTO DIRECCIONES (id_cliente, direccion, colonia, codigo_postal)
VALUES (1, 'Av. Principal #123', 'Centro', '81200');

INSERT IGNORE INTO VENTAS (id_pedido, id_cliente, fecha, total)
VALUES (1, 1, CURDATE(), 499.00);

INSERT IGNORE INTO ENVIOS (id_venta, id_direccion, num_guia, estado)
VALUES (1, 1, 'GUIA-0001', 'pendiente');
