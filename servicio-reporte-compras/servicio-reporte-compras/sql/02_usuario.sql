-- Ejecutar como administrador. Cambia la clave ANTES de ejecutar.
-- Usa exactamente esa misma clave en .env. El servicio solo necesita lectura.
CREATE USER 'reportes_app'@'localhost' IDENTIFIED BY 'CAMBIA_ESTA_CLAVE';
GRANT SELECT ON soa_reporte_compras.* TO 'reportes_app'@'localhost';
