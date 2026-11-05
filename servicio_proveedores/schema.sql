CREATE DATABASE IF NOT EXISTS tienda
CHARACTER SET utf8mb4
COLLATE utf8mb4_unicode_ci;

USE tienda;

CREATE TABLE IF NOT EXISTS PROVEEDORES (
    id INT AUTO_INCREMENT PRIMARY KEY,
    nombre VARCHAR(150) NOT NULL,
    razon_social VARCHAR(200) NOT NULL,
    rfc VARCHAR(20) NOT NULL UNIQUE,
    direccion VARCHAR(255) NOT NULL,
    correo VARCHAR(150) NOT NULL,
    telefono VARCHAR(30) NOT NULL
);

-- La tabla COMPRAS del modelo se relaciona con PROVEEDORES mediante id_proveedor.
CREATE TABLE IF NOT EXISTS COMPRAS (
    id INT AUTO_INCREMENT PRIMARY KEY,
    id_proveedor INT NOT NULL,
    id_usuario INT NOT NULL,
    fecha DATETIME NOT NULL,
    total DECIMAL(10,2) NOT NULL,
    estado VARCHAR(50) NOT NULL,
    CONSTRAINT fk_compras_proveedor
        FOREIGN KEY (id_proveedor) REFERENCES PROVEEDORES(id)
);
