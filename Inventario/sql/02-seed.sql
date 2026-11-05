USE inventario_soa;
INSERT INTO categorias (id, nombre) VALUES (1, 'Papelería'), (2, 'Electrónica')
ON DUPLICATE KEY UPDATE nombre = VALUES(nombre);
INSERT INTO productos (sku, nombre, categoria_id, stock, stock_minimo, precio_unitario) VALUES
('PAP-001', 'Cuaderno', 1, 50, 10, 35.50),
('PAP-002', 'Lápiz', 1, 5, 10, 8.00),
('ELE-001', 'Teclado', 2, 10, 3, 250.00),
('ELE-002', 'Mouse', 2, 0, 5, 150.00)
ON DUPLICATE KEY UPDATE sku = VALUES(sku);
