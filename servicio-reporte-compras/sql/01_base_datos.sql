-- Ejecutar UNA VEZ en una base nueva con MySQL 8.0.16 o superior.
-- No borra bases ni tablas existentes. Si ya existe, detente y revisa su contenido.
CREATE DATABASE soa_reporte_compras CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE soa_reporte_compras;

CREATE TABLE proveedores (
  id INT PRIMARY KEY AUTO_INCREMENT,
  nombre VARCHAR(120) NOT NULL
) ENGINE=InnoDB;
CREATE TABLE productos (
  id INT PRIMARY KEY AUTO_INCREMENT,
  nombre VARCHAR(120) NOT NULL
) ENGINE=InnoDB;
CREATE TABLE compras (
  id INT PRIMARY KEY AUTO_INCREMENT,
  proveedor_id INT NOT NULL,
  fecha DATE NOT NULL,
  estado ENUM('CONFIRMADA', 'CANCELADA') NOT NULL DEFAULT 'CONFIRMADA',
  FOREIGN KEY (proveedor_id) REFERENCES proveedores(id),
  INDEX idx_fecha(fecha),
  INDEX idx_proveedor_fecha(proveedor_id, fecha)
) ENGINE=InnoDB;
CREATE TABLE detalle_compras (
  id INT PRIMARY KEY AUTO_INCREMENT,
  compra_id INT NOT NULL,
  producto_id INT NOT NULL,
  cantidad INT NOT NULL CHECK (cantidad > 0),
  precio_unitario DECIMAL(12,2) NOT NULL CHECK (precio_unitario >= 0),
  FOREIGN KEY (compra_id) REFERENCES compras(id),
  FOREIGN KEY (producto_id) REFERENCES productos(id)
) ENGINE=InnoDB;

-- Todos los importes del ejemplo son MXN, sin impuestos ni descuentos.
INSERT INTO proveedores(id, nombre) VALUES (1,'Distribuidora Norte'),(2,'Calzado del Pacífico');
INSERT INTO productos(id, nombre) VALUES (1,'Tenis deportivos'),(2,'Zapato escolar'),(3,'Sandalias');
INSERT INTO compras(id, proveedor_id, fecha, estado) VALUES
  (1,1,'2026-09-01','CONFIRMADA'),
  (2,2,'2026-09-05','CONFIRMADA'),
  (3,1,'2026-09-10','CONFIRMADA'),
  (4,2,'2026-09-12','CANCELADA'),
  (5,2,'2026-10-01','CONFIRMADA');
INSERT INTO detalle_compras(compra_id, producto_id, cantidad, precio_unitario) VALUES
  (1,1,10,500.00),(1,2,5,300.00),
  (2,3,8,250.00),(3,1,4,550.00),
  (4,2,2,300.00),(5,3,2,275.00);

CREATE SQL SECURITY INVOKER VIEW v_reporte_compras AS
SELECT c.id AS compraId, c.fecha, c.estado,
       p.id AS proveedorId, p.nombre AS proveedor,
       CAST(SUM(d.cantidad * d.precio_unitario) AS DECIMAL(30,2)) AS total
FROM compras c
JOIN proveedores p ON p.id = c.proveedor_id
JOIN detalle_compras d ON d.compra_id = c.id
WHERE c.estado = 'CONFIRMADA'
GROUP BY c.id, c.fecha, c.estado, p.id, p.nombre;

-- Verificación de septiembre: 3 compras, total 10700.00, promedio 3566.67.
SELECT COUNT(*) AS totalCompras, SUM(total) AS totalGastado,
       ROUND(AVG(total),2) AS promedioPorCompra
FROM v_reporte_compras WHERE fecha BETWEEN '2026-09-01' AND '2026-09-30';
