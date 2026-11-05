-- =====================================================================
-- Microservicio Login - Esquema de base de datos (MySQL 8+)
-- Ejecutar con:  mysql -u root -p < database/esquema.sql
-- =====================================================================

CREATE DATABASE IF NOT EXISTS ventas_db
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE ventas_db;

-- ---------------------------------------------------------------------
-- Tabla: roles
-- Catalogo de roles disponibles en el sistema de venta online.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS roles (
  id          INT UNSIGNED NOT NULL AUTO_INCREMENT,
  nombre      VARCHAR(50)  NOT NULL,
  descripcion VARCHAR(255) DEFAULT NULL,
  creado_en   TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_roles_nombre (nombre)
) ENGINE = InnoDB;

-- ---------------------------------------------------------------------
-- Tabla: usuarios
-- Almacena las credenciales. El password nunca se guarda en texto plano,
-- se almacena el hash generado con bcrypt.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS usuarios (
  id              INT UNSIGNED NOT NULL AUTO_INCREMENT,
  nombre_usuario  VARCHAR(60)  NOT NULL,
  password_hash   VARCHAR(255) NOT NULL,
  email           VARCHAR(120) DEFAULT NULL,
  nombre_completo VARCHAR(150) DEFAULT NULL,
  rol_id          INT UNSIGNED NOT NULL,
  activo          TINYINT(1)   NOT NULL DEFAULT 1,
  intentos_fallidos       TINYINT UNSIGNED NOT NULL DEFAULT 0,
  bloqueado_hasta TIMESTAMP    NULL DEFAULT NULL,
  ultimo_acceso  TIMESTAMP    NULL DEFAULT NULL,
  creado_en      TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  actualizado_en TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_usuarios_nombre_usuario (nombre_usuario),
  UNIQUE KEY uq_usuarios_email (email),
  KEY idx_usuarios_rol_id (rol_id),
  CONSTRAINT fk_usuarios_rol
    FOREIGN KEY (rol_id) REFERENCES roles (id)
    ON UPDATE CASCADE
    ON DELETE RESTRICT,
  CONSTRAINT chk_usuarios_activo CHECK (activo IN (0, 1))
) ENGINE = InnoDB;

-- ---------------------------------------------------------------------
-- Datos iniciales: catalogo de roles
-- ---------------------------------------------------------------------
INSERT INTO roles (nombre, descripcion) VALUES
  ('ADMIN',    'Administrador con control total del sistema'),
  ('CLIENTE',  'Cliente que realiz compras en la tienda online'),
  ('VENDEDOR', 'Personal autorizado a gestionar productos y pedidos')
ON DUPLICATE KEY UPDATE descripcion = VALUES(descripcion);
