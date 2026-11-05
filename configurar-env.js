/* =====================================================================
   CUBEX - CONFIGURACIÓN DE VARIABLES DE ENTORNO (ejecutar una sola vez)

   Uso:  node configurar-env.js      (o doble clic en CONFIGURAR_ENV.bat)

   Qué hace:
   - Lee JWT_SECRET y JWT_ISSUER de microservicio-login/.env.
   - Genera una clave interna CUBEX_SERVICE_KEY (o reutiliza la existente).
   - AGREGA a los .env de los servicios que lo necesitan las variables que
     falten. NUNCA modifica ni borra valores existentes (contraseñas, etc.).
   - No muestra secretos en pantalla.
   ===================================================================== */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const RAIZ = __dirname;

function leerEnv(ruta) {
    if (!fs.existsSync(ruta)) return {};

    const valores = {};

    for (const linea of fs.readFileSync(ruta, 'utf8').split(/\r?\n/)) {
        const limpia = linea.trim();

        if (!limpia || limpia.startsWith('#') || !limpia.includes('=')) continue;

        const indice = limpia.indexOf('=');
        valores[limpia.slice(0, indice).trim()] = limpia.slice(indice + 1).trim();
    }

    return valores;
}

function rutaEnv(carpeta) {
    // ticket_service usa .ENV; se respeta el archivo que ya exista.
    for (const nombre of ['.env', '.ENV']) {
        const ruta = path.join(RAIZ, carpeta, nombre);
        if (fs.existsSync(ruta)) return ruta;
    }

    return path.join(RAIZ, carpeta, '.env');
}

const login = leerEnv(path.join(RAIZ, 'microservicio-login', '.env'));

if (!login.JWT_SECRET) {
    console.error('No se encontró JWT_SECRET en microservicio-login/.env. Configúralo primero.');
    process.exit(1);
}

const servicios = {
    'registro-pedidos-service': ['JWT_SECRET', 'JWT_ISSUER', 'CUBEX_SERVICE_KEY', 'INVENTARIO_API_URL'],
    'inventario-service-main': ['JWT_SECRET', 'JWT_ISSUER', 'CUBEX_SERVICE_KEY'],
    'logistica_envios_python': ['JWT_SECRET', 'JWT_ISSUER', 'CUBEX_SERVICE_KEY', 'INVENTARIO_API_URL'],
    'serviciopago': ['CUBEX_SERVICE_KEY', 'PEDIDOS_API_URL'],
    'servicio-verificacion-tarjeta': ['CUBEX_SERVICE_KEY', 'PEDIDOS_API_URL'],
    'ticket_service': ['JWT_SECRET', 'JWT_ISSUER']
};

// Reutilizar una clave interna existente para que todos coincidan.
let claveServicio = '';

for (const carpeta of Object.keys(servicios)) {
    const actual = leerEnv(rutaEnv(carpeta)).CUBEX_SERVICE_KEY;
    if (actual && actual.length >= 16) {
        claveServicio = actual;
        break;
    }
}

if (!claveServicio) {
    claveServicio = crypto.randomBytes(32).toString('hex');
}

const valoresPorDefecto = {
    JWT_SECRET: login.JWT_SECRET,
    JWT_ISSUER: login.JWT_ISSUER || 'microservicio-login',
    CUBEX_SERVICE_KEY: claveServicio,
    INVENTARIO_API_URL: 'http://localhost:3005/api/inventario',
    PEDIDOS_API_URL: 'http://localhost:3011/api/Pedidos'
};

for (const [carpeta, variables] of Object.entries(servicios)) {
    if (!fs.existsSync(path.join(RAIZ, carpeta))) {
        console.log(`- ${carpeta}: carpeta no encontrada, se omite.`);
        continue;
    }

    const ruta = rutaEnv(carpeta);
    const actuales = leerEnv(ruta);
    const faltantes = variables.filter(nombre => !actuales[nombre]);

    if (!faltantes.length) {
        console.log(`✓ ${carpeta}: ya estaba configurado.`);
        continue;
    }

    const contenidoPrevio = fs.existsSync(ruta) ? fs.readFileSync(ruta, 'utf8') : '';
    const salto = contenidoPrevio && !contenidoPrevio.endsWith('\n') ? '\n' : '';

    const bloque = [
        '',
        '# --- Agregado por configurar-env.js (CUBEX) ---',
        ...faltantes.map(nombre => `${nombre}=${valoresPorDefecto[nombre]}`),
        ''
    ].join('\n');

    fs.writeFileSync(ruta, contenidoPrevio + salto + bloque, 'utf8');
    console.log(`✓ ${carpeta}: se agregaron ${faltantes.join(', ')}`);
}

console.log('\nListo. Reinicia los servicios para que tomen la nueva configuración.');
