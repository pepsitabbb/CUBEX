# Verificación del proyecto

- Se instalaron las dependencias y se incluyó package-lock.json.
- Se ejecutó npm test: 14 pruebas aprobadas, 0 fallidas.
- Se comprobó la sintaxis de todos los archivos JavaScript mediante node --check.
- Las pruebas HTTP utilizan un repositorio simulado; no comprueban la ejecución SQL real.
- No se ejecutó la integración con MySQL porque este entorno no tiene un servidor MySQL disponible.
- Para verificar SQL y resultados reales, importa los dos scripts según README.md, configura .env, inicia npm start y ejecuta npm run test:integracion en otra terminal.
- Datos esperados de septiembre: 3 compras confirmadas, 10700.00 MXN, promedio 3566.67 MXN.
