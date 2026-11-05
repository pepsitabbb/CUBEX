-- Solo las tablas que le tocan a este servicio (según Tablas_y_campos.docx)
CREATE DATABASE IF NOT EXISTS tienda;
USE tienda;

CREATE TABLE IF NOT EXISTS ROLES (
  id INT AUTO_INCREMENT PRIMARY KEY,
  nombre_rol VARCHAR(50) NOT NULL UNIQUE,
  descripcion VARCHAR(255)
);

CREATE TABLE IF NOT EXISTS USUARIOS (
  id INT AUTO_INCREMENT PRIMARY KEY,
  nombre VARCHAR(100) NOT NULL,
  correo VARCHAR(150) NOT NULL UNIQUE,
  telefono VARCHAR(20),
  password_hash VARCHAR(255) NOT NULL,
  id_rol INT NOT NULL,
  fecha_registro DATETIME DEFAULT CURRENT_TIMESTAMP,
  estado ENUM('activo','bloqueado') NOT NULL DEFAULT 'activo',
  intentos_fallidos INT NOT NULL DEFAULT 0,
  FOREIGN KEY (id_rol) REFERENCES ROLES(id)
);

CREATE TABLE IF NOT EXISTS TOKENS_RECUPERACION (
  id INT AUTO_INCREMENT PRIMARY KEY,
  id_usuario INT NOT NULL,
  token VARCHAR(255) NOT NULL,
  fecha_creacion DATETIME DEFAULT CURRENT_TIMESTAMP,
  fecha_expiracion DATETIME NOT NULL,
  usado BOOLEAN NOT NULL DEFAULT FALSE,
  FOREIGN KEY (id_usuario) REFERENCES USUARIOS(id)
);

CREATE TABLE IF NOT EXISTS CLIENTES (
  id INT AUTO_INCREMENT PRIMARY KEY,
  id_usuario INT NOT NULL,
  direccion VARCHAR(255),
  rfc VARCHAR(13),
  FOREIGN KEY (id_usuario) REFERENCES USUARIOS(id)
);

-- Roles iniciales
INSERT IGNORE INTO ROLES (nombre_rol, descripcion) VALUES
  ('admin', 'Administrador con acceso total'),
  ('empleado', 'Personal de inventario, compras y ventas'),
  ('cliente', 'Comprador de la tienda en línea');
