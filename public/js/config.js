/* =====================================================================
   CUBEX - CONFIGURACIÓN CENTRALIZADA DEL FRONTEND

   Único lugar donde se definen las direcciones de los microservicios.
   Si cambias un puerto, cámbialo aquí (y en el .env del servicio).

   Este archivo debe cargarse ANTES que cualquier otro script:
       <script src="../js/config.js"></script>
   ===================================================================== */

(function () {
    "use strict";

    const API = {
        ROLES: "http://localhost:3000",
        VERIFICACION_BOT: "http://localhost:3001/api/verify",
        RECUPERAR_PASSWORD: "http://localhost:3002/api/auth",
        INVENTARIO: "http://localhost:3005",
        RESENAS: "http://localhost:3007/api/resenas",
        REPORTES_INVENTARIO: "http://localhost:3008/api/v1/reportes/inventario",
        PROVEEDORES: "http://localhost:3009/api/proveedores",
        PEDIDOS: "http://localhost:3011/api/Pedidos",
        PAGOS: "http://localhost:3012/api/pagos",
        DOMICILIOS: "http://localhost:3019/api/domicilios",
        LOGIN: "https://cubex-production.up.railway.app/api/v1",
        REPORTES_COMPRAS: "http://localhost:3021/api/v1/reportes/compras",
        TARJETAS: "http://localhost:3024",
        TICKETS: "http://localhost:3025",
        LOGISTICA: "http://localhost:3032/api"
    };

    // Páginas oficiales de rastreo. {guia} se sustituye por el número de guía.
    // Si una paquetería no admite la guía en la dirección, se abre su
    // página de rastreo y el cliente copia la guía mostrada en CUBEX.
    const RASTREO_PAQUETERIAS = {
        "DHL": "https://www.dhl.com/mx-es/home/rastreo.html?tracking-id={guia}",
        "FedEx": "https://www.fedex.com/fedextrack/?trknbr={guia}",
        "Estafeta": "https://www.estafeta.com/Herramientas/Rastreo",
        "Paquetexpress": "https://www.paquetexpress.com.mx/",
        "Correos de México": "https://www.correosdemexico.gob.mx/SSLServicios/SeguimientoEnvio/Seguimiento.aspx"
    };

    window.CUBEX_CONFIG = Object.freeze({
        API: Object.freeze(API),
        RASTREO_PAQUETERIAS: Object.freeze(RASTREO_PAQUETERIAS),
        CLAVE_TOKEN: "cubex_token",
        CLAVE_USUARIO: "cubex_usuario"
    });

    /* -----------------------------------------------------------------
       Envío automático del token a los microservicios de CUBEX.
       Solo se agrega a las direcciones definidas arriba; nunca a sitios
       externos. Si la petición ya trae Authorization, se respeta.
       ----------------------------------------------------------------- */

    const origenesCubex = new Set();

    Object.values(API).forEach(direccion => {
        try {
            origenesCubex.add(new URL(direccion).origin);
        } catch {
            // Dirección mal escrita: se ignora.
        }
    });

    const fetchOriginal = window.fetch.bind(window);

    window.fetch = function (recurso, opciones = {}) {
        try {
            const direccion = typeof recurso === "string"
                ? recurso
                : (recurso && recurso.url) || String(recurso);

            const url = new URL(direccion, window.location.href);
            const token = sessionStorage.getItem("cubex_token");

            if (token && origenesCubex.has(url.origin)) {
                const cabeceras = new Headers(
                    opciones.headers ||
                    (recurso instanceof Request ? recurso.headers : undefined)
                );

                if (!cabeceras.has("Authorization")) {
                    cabeceras.set("Authorization", `Bearer ${token}`);
                }

                opciones = { ...opciones, headers: cabeceras };
            }
        } catch {
            // Si algo falla, se envía la petición sin modificar.
        }

        return fetchOriginal(recurso, opciones);
    };
})();
