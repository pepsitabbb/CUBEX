
// =============================================
// CUBEX - MÓDULO DE REPORTES
// =============================================

// SERVICIOS
const API_REPORTES_INVENTARIO =
    CUBEX_CONFIG.API.REPORTES_INVENTARIO;

const API_REPORTES_COMPRAS =
    CUBEX_CONFIG.API.REPORTES_COMPRAS;

// El microservicio de proveedores es el 3009 (antes apuntaba por error al 3000).
const API_PROVEEDORES =
    CUBEX_CONFIG.API.PROVEEDORES;

// =============================================
// VARIABLES GLOBALES
// =============================================

// Inventario
let productosInventario = [];
let reporteInventario = null;

// Compras
let comprasReporte = [];
let paginaActualCompras = 1;
const limiteCompras = 20;
let totalPaginasCompras = 1;
let compraDetalleActual = null;

// =============================================
// ELEMENTOS HTML
// =============================================

// Generales
const btnActualizar = document.getElementById('btnActualizar');

// Inventario
const btnExportarInventario =
    document.getElementById('btnExportarInventario');

const mensajeInventario =
    document.getElementById('mensajeInventario');

const tablaInventario =
    document.getElementById('tablaInventario');

const filtroStock =
    document.getElementById('filtroStock');

const buscarProducto =
    document.getElementById('buscarProducto');

const totalProductos =
    document.getElementById('totalProductos');

const totalUnidades =
    document.getElementById('totalUnidades');

const productosStockBajo =
    document.getElementById('productosStockBajo');

const valorInventario =
    document.getElementById('valorInventario');

const contadorProductos =
    document.getElementById('contadorProductos');

const fechaReporte =
    document.getElementById('fechaReporte');

// Compras
const mensajeCompras =
    document.getElementById('mensajeCompras');

const tablaCompras =
    document.getElementById('tablaCompras');

const totalCompras =
    document.getElementById('totalCompras');

const totalGastado =
    document.getElementById('totalGastado');

const promedioCompra =
    document.getElementById('promedioCompra');

const contadorCompras =
    document.getElementById('contadorCompras');

const fechaDesdeCompra =
    document.getElementById('fechaDesdeCompra');

const fechaHastaCompra =
    document.getElementById('fechaHastaCompra');

const filtroProveedorCompra =
    document.getElementById('filtroProveedorCompra');

const btnFiltrarCompras =
    document.getElementById('btnFiltrarCompras');

const btnLimpiarCompras =
    document.getElementById('btnLimpiarCompras');

const btnExportarCompras =
    document.getElementById('btnExportarCompras');

const btnComprasAnterior =
    document.getElementById('btnComprasAnterior');

const btnComprasSiguiente =
    document.getElementById('btnComprasSiguiente');

const paginaCompras =
    document.getElementById('paginaCompras');

const panelDetalleCompra =
    document.getElementById('panelDetalleCompra');

const informacionDetalleCompra =
    document.getElementById('informacionDetalleCompra');

const tablaDetalleCompra =
    document.getElementById('tablaDetalleCompra');

const subtituloDetalleCompra =
    document.getElementById('subtituloDetalleCompra');

const btnCerrarDetalleCompra =
    document.getElementById('btnCerrarDetalleCompra');

// =============================================
// FUNCIONES GENERALES
// =============================================

function formatoMoneda(valor) {
    return new Intl.NumberFormat('es-MX', {
        style: 'currency',
        currency: 'MXN',
        minimumFractionDigits: 2
    }).format(Number(valor || 0));
}

function formatoNumero(valor) {
    return new Intl.NumberFormat('es-MX')
        .format(Number(valor || 0));
}

function escaparHTML(valor) {
    return String(valor ?? '').replace(/[&<>"']/g, caracter => {
        const equivalencias = {
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#039;'
        };

        return equivalencias[caracter];
    });
}

function fechaLegible(fecha) {
    if (!fecha) return 'Sin fecha';

    const texto = String(fecha);

    // Evita que la conversión UTC cambie el día de una fecha SQL.
    const coincidencia = texto.match(
        /^(\d{4})-(\d{2})-(\d{2})/
    );

    if (coincidencia) {
        return `${coincidencia[3]}/${coincidencia[2]}/${coincidencia[1]}`;
    }

    const fechaConvertida = new Date(texto);

    return Number.isNaN(fechaConvertida.getTime())
        ? texto
        : fechaConvertida.toLocaleDateString('es-MX');
}

// =============================================
// REPORTE DE INVENTARIO
// =============================================

function mostrarMensaje(mensaje, tipo = '') {
    mensajeInventario.textContent = mensaje;
    mensajeInventario.className = 'mensaje-reporte';

    if (tipo) {
        mensajeInventario.classList.add(tipo);
    }
}

async function cargarReporteInventario() {
    mostrarMensaje('Consultando información del inventario...');

    tablaInventario.innerHTML = `
        <tr>
            <td colspan="8" class="tabla-vacia">
                Cargando productos...
            </td>
        </tr>
    `;

    btnActualizar.disabled = true;

    try {
        const respuesta = await fetch(API_REPORTES_INVENTARIO, {
            method: 'GET',
            headers: {
                'Accept': 'application/json'
            },
            cache: 'no-store'
        });

        if (!respuesta.ok) {
            throw new Error(`Error del servidor: ${respuesta.status}`);
        }

        const resultado = await respuesta.json();

        if (!resultado.data) {
            throw new Error(
                'La respuesta del reporte no contiene información.'
            );
        }

        reporteInventario = resultado.data;

        productosInventario = Array.isArray(resultado.data.productos)
            ? resultado.data.productos
            : [];

        mostrarResumen(resultado.data.resumen || {});
        aplicarFiltros();

        const fecha = resultado.data.generadoEn
            ? new Date(resultado.data.generadoEn)
            : new Date();

        fechaReporte.textContent =
            `Última actualización: ${fecha.toLocaleString('es-MX')}`;

        mostrarMensaje(
            'Reporte de inventario actualizado correctamente.',
            'exito'
        );

    } catch (error) {
        console.error('Error al cargar el reporte:', error);

        mostrarMensaje(
            'No fue posible consultar el reporte. Verifica que el servicio de inventario esté activo en el puerto 3008.',
            'error'
        );

        tablaInventario.innerHTML = `
            <tr>
                <td colspan="8" class="tabla-vacia">
                    No se pudo cargar la información del inventario.
                </td>
            </tr>
        `;

        totalProductos.textContent = '--';
        totalUnidades.textContent = '--';
        productosStockBajo.textContent = '--';
        valorInventario.textContent = '--';

        contadorProductos.textContent = '0 productos';

    } finally {
        btnActualizar.disabled = false;
    }
}

function mostrarResumen(resumen) {
    totalProductos.textContent =
        formatoNumero(resumen.totalProductos);

    totalUnidades.textContent =
        formatoNumero(resumen.totalUnidades);

    productosStockBajo.textContent =
        formatoNumero(resumen.productosStockBajo);

    valorInventario.textContent =
        formatoMoneda(resumen.valorInventario);
}

function obtenerClaseEstado(producto) {
    if (producto.stockBajo) {
        return 'bajo';
    }

    if (producto.stockExcedido) {
        return 'excedido';
    }

    return 'normal';
}

function aplicarFiltros() {
    const filtro = filtroStock.value;
    const busqueda = buscarProducto.value.trim().toLowerCase();

    let productosFiltrados = [...productosInventario];

    if (filtro === 'bajo') {
        productosFiltrados = productosFiltrados.filter(
            producto => producto.stockBajo
        );
    }

    if (filtro === 'normal') {
        productosFiltrados = productosFiltrados.filter(
            producto => !producto.stockBajo &&
                !producto.stockExcedido
        );
    }

    if (filtro === 'excedido') {
        productosFiltrados = productosFiltrados.filter(
            producto => producto.stockExcedido
        );
    }

    if (filtro === 'sin-stock') {
        productosFiltrados = productosFiltrados.filter(
            producto => Number(producto.stock) === 0
        );
    }

    if (busqueda) {
        productosFiltrados = productosFiltrados.filter(producto =>
            String(producto.nombre || '')
                .toLowerCase()
                .includes(busqueda)
        );
    }

    mostrarProductos(productosFiltrados);
}

function mostrarProductos(productos) {
    contadorProductos.textContent =
        `${productos.length} ${productos.length === 1 ? 'producto' : 'productos'}`;

    if (productos.length === 0) {
        tablaInventario.innerHTML = `
            <tr>
                <td colspan="8" class="tabla-vacia">
                    No se encontraron productos con esos filtros.
                </td>
            </tr>
        `;
        return;
    }

    tablaInventario.innerHTML = productos.map(producto => {
        const clase = obtenerClaseEstado(producto);

        return `
            <tr>
                <td>${escaparHTML(producto.idProducto)}</td>

                <td>
                    <strong>${escaparHTML(producto.nombre)}</strong>
                </td>

                <td>${formatoMoneda(producto.precioUnitario)}</td>

                <td>${formatoNumero(producto.stock)}</td>

                <td>${formatoNumero(producto.stockMinimo)}</td>

                <td>${formatoNumero(producto.stockMaximo)}</td>

                <td>
                    <strong>${formatoMoneda(producto.valorTotal)}</strong>
                </td>

                <td>
                    <span class="estado-stock ${clase}">
                        ${escaparHTML(producto.estado || 'Normal')}
                    </span>
                </td>
            </tr>
        `;
    }).join('');
}

// =============================================
// EXPORTAR INVENTARIO A CSV
// =============================================

function exportarInventarioCSV() {
    const filtro = filtroStock.value;
    const busqueda = buscarProducto.value.trim().toLowerCase();

    let productos = [...productosInventario];

    if (filtro === 'bajo') {
        productos = productos.filter(p => p.stockBajo);
    }

    if (filtro === 'normal') {
        productos = productos.filter(
            p => !p.stockBajo && !p.stockExcedido
        );
    }

    if (filtro === 'excedido') {
        productos = productos.filter(p => p.stockExcedido);
    }

    if (filtro === 'sin-stock') {
        productos = productos.filter(
            p => Number(p.stock) === 0
        );
    }

    if (busqueda) {
        productos = productos.filter(p =>
            String(p.nombre || '').toLowerCase().includes(busqueda)
        );
    }

    if (productos.length === 0) {
        mostrarMensaje(
            'No hay productos para exportar con los filtros seleccionados.',
            'error'
        );
        return;
    }

    const encabezados = [
        'ID',
        'Producto',
        'Precio unitario',
        'Stock actual',
        'Stock minimo',
        'Stock maximo',
        'Valor total',
        'Estado'
    ];

    const filas = productos.map(p => [
        p.idProducto,
        p.nombre,
        p.precioUnitario,
        p.stock,
        p.stockMinimo,
        p.stockMaximo,
        p.valorTotal,
        p.estado
    ]);

    descargarCSV(
        [encabezados, ...filas],
        'reporte_inventario_cubex.csv'
    );
}

// =============================================
// REPORTE DE COMPRAS
// =============================================

function mostrarMensajeCompras(mensaje, tipo = '') {
    mensajeCompras.textContent = mensaje;
    mensajeCompras.className = 'mensaje-reporte';

    if (tipo) {
        mensajeCompras.classList.add(tipo);
    }
}

function obtenerFiltrosCompras() {
    return {
        desde: fechaDesdeCompra.value,
        hasta: fechaHastaCompra.value,
        proveedorId: filtroProveedorCompra.value
    };
}

// =============================================
// CARGAR PROVEEDORES
// =============================================

async function cargarProveedoresFiltro() {
    try {
        const respuesta = await fetch(API_PROVEEDORES, {
            headers: {
                Accept: 'application/json'
            },
            cache: 'no-store'
        });

        if (!respuesta.ok) {
            throw new Error('No fue posible consultar los proveedores.');
        }

        const resultado = await respuesta.json();

        const proveedores = Array.isArray(resultado)
            ? resultado
            : resultado.datos ||
              resultado.data ||
              resultado.proveedores ||
              [];

        filtroProveedorCompra.innerHTML = `
            <option value="">Todos los proveedores</option>
        `;

        proveedores.forEach(proveedor => {
            const id = proveedor.id ?? proveedor.id_proveedor;

            if (id == null) return;

            const opcion = document.createElement('option');

            opcion.value = id;
            opcion.textContent =
                proveedor.nombre || `Proveedor ${id}`;

            filtroProveedorCompra.appendChild(opcion);
        });

    } catch (error) {
        console.error('Error al cargar proveedores:', error);

        mostrarMensajeCompras(
            'No se pudieron cargar los proveedores. Puedes consultar todas las compras.',
            'error'
        );
    }
}

// =============================================
// CARGAR RESUMEN DE COMPRAS
// =============================================

async function cargarResumenCompras(filtros) {
    const parametros = new URLSearchParams();

    if (filtros.desde) {
        parametros.set('desde', filtros.desde);
    }

    if (filtros.hasta) {
        parametros.set('hasta', filtros.hasta);
    }

    if (filtros.proveedorId) {
        parametros.set('proveedorId', filtros.proveedorId);
    }

    const respuesta = await fetch(
        `${API_REPORTES_COMPRAS}/resumen?${parametros.toString()}`,
        {
            cache: 'no-store'
        }
    );

    if (!respuesta.ok) {
        throw new Error('No se pudo consultar el resumen de compras.');
    }

    const resultado = await respuesta.json();

    if (!resultado.ok || !resultado.datos) {
        throw new Error('La respuesta del resumen no es válida.');
    }

    totalCompras.textContent =
        formatoNumero(resultado.datos.totalCompras);

    totalGastado.textContent =
        formatoMoneda(resultado.datos.totalGastado);

    promedioCompra.textContent =
        formatoMoneda(resultado.datos.promedioPorCompra);
}

// =============================================
// CARGAR LISTADO DE COMPRAS
// =============================================

async function cargarReporteCompras() {
    mostrarMensajeCompras('Consultando información de compras...');

    tablaCompras.innerHTML = `
        <tr>
            <td colspan="6" class="tabla-vacia">
                Cargando compras...
            </td>
        </tr>
    `;

    const filtros = obtenerFiltrosCompras();
    const parametros = new URLSearchParams();

    if (filtros.desde) {
        parametros.set('desde', filtros.desde);
    }

    if (filtros.hasta) {
        parametros.set('hasta', filtros.hasta);
    }

    if (filtros.proveedorId) {
        parametros.set('proveedorId', filtros.proveedorId);
    }

    parametros.set('pagina', paginaActualCompras);
    parametros.set('limite', limiteCompras);

    try {
        const [respuestaListado] = await Promise.all([
            fetch(
                `${API_REPORTES_COMPRAS}?${parametros.toString()}`,
                {
                    cache: 'no-store'
                }
            ),
            cargarResumenCompras(filtros)
        ]);

        if (!respuestaListado.ok) {
            throw new Error(
                `Error del servidor: ${respuestaListado.status}`
            );
        }

        const resultado = await respuestaListado.json();

        if (!resultado.ok || !Array.isArray(resultado.datos)) {
            throw new Error('La respuesta de compras no es válida.');
        }

        comprasReporte = resultado.datos;

        mostrarCompras(comprasReporte);

        actualizarPaginacionCompras(resultado.paginacion);

        mostrarMensajeCompras(
            'Reporte de compras actualizado correctamente.',
            'exito'
        );

    } catch (error) {
        console.error('Error al cargar compras:', error);

        comprasReporte = [];

        tablaCompras.innerHTML = `
            <tr>
                <td colspan="6" class="tabla-vacia">
                    No se pudo cargar el reporte de compras.
                    Verifica que el servicio esté activo en el puerto 3010.
                </td>
            </tr>
        `;

        totalCompras.textContent = '--';
        totalGastado.textContent = '--';
        promedioCompra.textContent = '--';

        contadorCompras.textContent = '0 compras';

        actualizarPaginacionCompras({
            pagina: 1,
            totalPaginas: 1
        });

        mostrarMensajeCompras(
            'No fue posible consultar las compras. Verifica el servicio del puerto 3010.',
            'error'
        );
    }
}

// =============================================
// MOSTRAR COMPRAS EN LA TABLA
// =============================================

function mostrarCompras(compras) {
    contadorCompras.textContent =
        `${compras.length} ${compras.length === 1 ? 'compra' : 'compras'}`;

    if (compras.length === 0) {
        tablaCompras.innerHTML = `
            <tr>
                <td colspan="6" class="tabla-vacia">
                    No se encontraron compras con esos filtros.
                </td>
            </tr>
        `;
        return;
    }

    tablaCompras.innerHTML = compras.map(compra => `
        <tr>
            <td>${escaparHTML(compra.compraId)}</td>

            <td>${escaparHTML(fechaLegible(compra.fecha))}</td>

            <td>
                <strong>${escaparHTML(compra.proveedor)}</strong>
            </td>

            <td>
                <span class="estado-stock normal">
                    ${escaparHTML(compra.estado || 'Sin estado')}
                </span>
            </td>

            <td>
                <strong>${formatoMoneda(compra.total)}</strong>
            </td>

            <td>
                <button
                    type="button"
                    class="boton-secundario btn-ver-compra"
                    data-id="${escaparHTML(compra.compraId)}">
                    Ver detalle
                </button>
            </td>
        </tr>
    `).join('');
}

// =============================================
// PAGINACIÓN DE COMPRAS
// =============================================

function actualizarPaginacionCompras(paginacion = {}) {
    paginaActualCompras = Number(paginacion.pagina) || 1;

    totalPaginasCompras =
        Number(paginacion.totalPaginas) || 1;

    paginaCompras.textContent =
        `Página ${paginaActualCompras} de ${totalPaginasCompras}`;

    btnComprasAnterior.disabled =
        paginaActualCompras <= 1;

    btnComprasSiguiente.disabled =
        paginaActualCompras >= totalPaginasCompras;
}

// =============================================
// DETALLE DE COMPRA
// =============================================

async function verDetalleCompra(id) {
    panelDetalleCompra.classList.remove('oculto');

    subtituloDetalleCompra.textContent = `Compra #${id}`;

    informacionDetalleCompra.innerHTML =
        '<p>Consultando información...</p>';

    tablaDetalleCompra.innerHTML = `
        <tr>
            <td colspan="4" class="tabla-vacia">
                Cargando productos...
            </td>
        </tr>
    `;

    try {
        const respuesta = await fetch(
            `${API_REPORTES_COMPRAS}/${encodeURIComponent(id)}`,
            {
                cache: 'no-store'
            }
        );

        if (!respuesta.ok) {
            throw new Error('No se pudo consultar el detalle.');
        }

        const resultado = await respuesta.json();

        if (!resultado.ok || !resultado.datos) {
            throw new Error('El detalle recibido no es válido.');
        }

        const compra = resultado.datos;

        compraDetalleActual = compra;

        informacionDetalleCompra.innerHTML = `
            <div class="informacion-compra">
                <p>
                    <strong>Compra:</strong>
                    #${escaparHTML(compra.compraId)}
                </p>

                <p>
                    <strong>Proveedor:</strong>
                    ${escaparHTML(compra.proveedor)}
                </p>

                <p>
                    <strong>Fecha:</strong>
                    ${escaparHTML(fechaLegible(compra.fecha))}
                </p>

                <p>
                    <strong>Estado:</strong>
                    ${escaparHTML(compra.estado)}
                </p>

                <p>
                    <strong>Total:</strong>
                    ${formatoMoneda(compra.total)}
                </p>
            </div>
        `;

        if (
            !Array.isArray(compra.productos) ||
            compra.productos.length === 0
        ) {
            tablaDetalleCompra.innerHTML = `
                <tr>
                    <td colspan="4" class="tabla-vacia">
                        Esta compra no tiene productos registrados.
                    </td>
                </tr>
            `;

            return;
        }

        tablaDetalleCompra.innerHTML =
            compra.productos.map(producto => `
                <tr>
                    <td>${escaparHTML(producto.producto)}</td>

                    <td>${formatoNumero(producto.cantidad)}</td>

                    <td>${formatoMoneda(producto.precioUnitario)}</td>

                    <td>
                        <strong>
                            ${formatoMoneda(producto.subtotal)}
                        </strong>
                    </td>
                </tr>
            `).join('');

        panelDetalleCompra.scrollIntoView({
            behavior: 'smooth',
            block: 'start'
        });

    } catch (error) {
        console.error('Error al consultar detalle:', error);

        compraDetalleActual = null;

        informacionDetalleCompra.textContent =
            'No fue posible consultar el detalle de esta compra.';

        tablaDetalleCompra.innerHTML = `
            <tr>
                <td colspan="4" class="tabla-vacia">
                    Error al cargar los productos.
                </td>
            </tr>
        `;
    }
}

// =============================================
// EXPORTACIÓN GENERAL A CSV
// =============================================

function descargarCSV(datos, nombreArchivo) {
    const contenido = datos.map(fila =>
        fila.map(valor =>
            `"${String(valor ?? '').replace(/"/g, '""')}"`
        ).join(',')
    ).join('\r\n');

    const archivo = new Blob(
        ['\uFEFF' + contenido],
        {
            type: 'text/csv;charset=utf-8;'
        }
    );

    const url = URL.createObjectURL(archivo);
    const enlace = document.createElement('a');

    enlace.href = url;
    enlace.download = nombreArchivo;

    document.body.appendChild(enlace);
    enlace.click();
    enlace.remove();

    URL.revokeObjectURL(url);
}

// =============================================
// EXPORTAR COMPRAS A CSV
// =============================================

function exportarComprasCSV() {
    if (comprasReporte.length === 0) {
        mostrarMensajeCompras(
            'No hay compras para exportar.',
            'error'
        );
        return;
    }

    const encabezados = [
        'ID compra',
        'Fecha',
        'Proveedor',
        'Estado',
        'Total'
    ];

    const filas = comprasReporte.map(compra => [
        compra.compraId,
        compra.fecha,
        compra.proveedor,
        compra.estado,
        compra.total
    ]);

    descargarCSV(
        [encabezados, ...filas],
        'reporte_compras_cubex.csv'
    );

    mostrarMensajeCompras(
        'Archivo CSV de compras generado correctamente.',
        'exito'
    );
}

// =============================================
// LIMPIAR FILTROS DE COMPRAS
// =============================================

function limpiarFiltrosCompras() {
    fechaDesdeCompra.value = '';
    fechaHastaCompra.value = '';
    filtroProveedorCompra.value = '';

    paginaActualCompras = 1;

    panelDetalleCompra.classList.add('oculto');

    cargarReporteCompras();
}

// =============================================
// CAMBIAR ENTRE LOS DOS REPORTES
// =============================================

document.querySelectorAll('.opcion-reporte').forEach(boton => {
    boton.addEventListener('click', () => {

        document.querySelectorAll('.opcion-reporte').forEach(opcion => {
            opcion.classList.remove('activa');
        });

        boton.classList.add('activa');

        const tipoReporte = boton.dataset.reporte;

        document.getElementById('reporteInventario')
            .classList.toggle(
                'oculto',
                tipoReporte !== 'inventario'
            );

        document.getElementById('reporteCompras')
            .classList.toggle(
                'oculto',
                tipoReporte !== 'compras'
            );

        if (tipoReporte === 'inventario' && !reporteInventario) {
            cargarReporteInventario();
        }

        if (tipoReporte === 'compras' && comprasReporte.length === 0) {
            paginaActualCompras = 1;
            cargarReporteCompras();
        }
    });
});

// =============================================
// EVENTOS DE INVENTARIO
// =============================================

btnExportarInventario.addEventListener(
    'click',
    exportarInventarioCSV
);

filtroStock.addEventListener(
    'change',
    aplicarFiltros
);

buscarProducto.addEventListener(
    'input',
    aplicarFiltros
);

// =============================================
// EVENTOS DE COMPRAS
// =============================================

btnFiltrarCompras.addEventListener('click', () => {
    paginaActualCompras = 1;
    panelDetalleCompra.classList.add('oculto');
    cargarReporteCompras();
});

btnLimpiarCompras.addEventListener(
    'click',
    limpiarFiltrosCompras
);

btnExportarCompras.addEventListener(
    'click',
    exportarComprasCSV
);

btnComprasAnterior.addEventListener('click', () => {
    if (paginaActualCompras > 1) {
        paginaActualCompras--;
        cargarReporteCompras();
    }
});

btnComprasSiguiente.addEventListener('click', () => {
    if (paginaActualCompras < totalPaginasCompras) {
        paginaActualCompras++;
        cargarReporteCompras();
    }
});

// Abrir detalle de compra
tablaCompras.addEventListener('click', event => {
    const boton = event.target.closest('.btn-ver-compra');

    if (boton) {
        verDetalleCompra(boton.dataset.id);
    }
});

// Cerrar detalle de compra
btnCerrarDetalleCompra.addEventListener('click', () => {
    panelDetalleCompra.classList.add('oculto');
    compraDetalleActual = null;
});

// =============================================
// BOTÓN ACTUALIZAR
// =============================================

btnActualizar.addEventListener('click', () => {
    const comprasActivas =
        !document.getElementById('reporteCompras')
            .classList.contains('oculto');

    if (comprasActivas) {
        cargarReporteCompras();
    } else {
        cargarReporteInventario();
    }
});

// =============================================
// CARGA INICIAL
// =============================================

document.addEventListener('DOMContentLoaded', () => {
    cargarReporteInventario();
    cargarProveedoresFiltro();
});
