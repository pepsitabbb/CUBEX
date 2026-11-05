
const API_INVENTARIO = CUBEX_CONFIG.API.INVENTARIO + '/api/stock';
const API_OFERTAS = CUBEX_CONFIG.API.INVENTARIO + '/api/ofertas';

// Elementos del HTML
const tablaInventario = document.getElementById('tablaInventario');
const btnActualizar = document.getElementById('btnActualizar');
const modalStock = document.getElementById('modalStock');
const formStock = document.getElementById('formStock');
const btnCancelar = document.getElementById('btnCancelar');

let productosInventario = [];

// Mostrar mensajes dentro de la página
function mostrarMensaje(texto, tipo = 'exito') {
    const mensaje = document.getElementById('mensajeInventario');

    if (!mensaje) return;

    mensaje.textContent = texto;
    mensaje.className = `mensaje ${tipo}`;

    setTimeout(() => {
        mensaje.textContent = '';
        mensaje.className = 'mensaje';
    }, 4000);
}

// Consultar inventario
async function cargarInventario() {
    tablaInventario.innerHTML = `
        <tr>
            <td colspan="7" class="mensaje-tabla">
                Cargando productos...
            </td>
        </tr>
    `;

    try {
        const respuesta = await fetch(API_INVENTARIO);
        const resultado = await respuesta.json();

        if (!respuesta.ok || !resultado.success) {
            throw new Error(
                resultado.message || 'No se pudo consultar el inventario'
            );
        }

        productosInventario = resultado.data || [];

        await mostrarInventario(productosInventario);
        actualizarResumen(productosInventario);

    } catch (error) {
        console.error('Error al cargar inventario:', error);

        tablaInventario.innerHTML = `
            <tr>
                <td colspan="7" class="mensaje-tabla">
                    No se pudo cargar el inventario.
                    Verifica que el microservicio funcione en el puerto 3005.
                </td>
            </tr>
        `;

        actualizarResumen([]);
        mostrarMensaje('Error al consultar el inventario.', 'error');
    }
}

// Determinar el estado de las existencias
function obtenerEstado(producto) {
    const actual = Number(producto.stock_actual ?? 0);
    const minimo = producto.stock_minimo;
    const maximo = producto.stock_maximo;

    // Sin existencias: el producto no aparece en la tienda.
    if (actual <= 0) {
        return {
            texto: 'Agotado (oculto en tienda)',
            clase: 'stock-agotado'
        };
    }

    if (
        minimo === null || maximo === null ||
        minimo === undefined || maximo === undefined
    ) {
        return {
            texto: 'Sin configurar',
            clase: 'sin-configurar'
        };
    }

    if (actual <= Number(minimo)) {
        return {
            texto: 'Stock bajo',
            clase: 'stock-bajo'
        };
    }

    if (actual >= Number(maximo)) {
        return {
            texto: 'Stock excedido',
            clase: 'stock-excedido'
        };
    }

    return {
        texto: 'Stock normal',
        clase: 'stock-normal'
    };
}

// Consultar la oferta sugerida
async function consultarOferta(producto) {
    const idProducto = Number(producto.id_producto);

    if (!idProducto) {
        return '<span class="oferta-error">ID no válido</span>';
    }

    try {
        const respuesta = await fetch(
            `${API_OFERTAS}/evaluar-descuento`,
            {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    IdProducto: idProducto
                })
            }
        );

        const resultado = await respuesta.json();

        if (!respuesta.ok || !resultado.success) {
            throw new Error(
                resultado.message || 'No se pudo evaluar la oferta'
            );
        }

        const oferta = resultado.data;

        const porcentaje = Number(oferta.PorcentajeDescuento);
        const precioOriginal = Number(oferta.PrecioOriginal);
        const precioFinal = Number(oferta.PrecioFinal);

        // No existe una oferta sugerida
        if (porcentaje === 0) {
            return `
                <div class="oferta-normal">
                    <span>Sin oferta disponible</span>
                    <small>Precio normal: $${precioOriginal.toFixed(2)}</small>
                </div>
            `;
        }

        // La oferta ya fue aplicada
        if (oferta.OfertaActiva) {
            return `
                <div class="oferta-disponible">
                    <strong>${porcentaje}% OFF</strong>
                    <span>
                        Antes: $${precioOriginal.toFixed(2)}
                    </span>
                    <span>
                        Oferta sugerida: $${precioFinal.toFixed(2)}
                    </span>
                    <span class="oferta-activa">
                        Oferta activa
                    </span>
                    <button
                        type="button"
                        class="btn-desactivar-oferta"
                        data-accion="desactivar"
                        data-id="${idProducto}">
                        Desactivar oferta
                    </button>
                </div>
            `;
        }

        // Hay una sugerencia, pero el administrador todavía no la acepta
        return `
            <div class="oferta-disponible">
                <strong>${porcentaje}% OFF</strong>
                <span>
                    Precio original: $${precioOriginal.toFixed(2)}
                </span>
                <span>
                    Precio con oferta: $${precioFinal.toFixed(2)}
                </span>
                <span class="oferta-sugerida">
                    Oferta sugerida
                </span>
                <button
                    type="button"
                    class="btn-aplicar-oferta"
                    data-accion="aplicar"
                    data-id="${idProducto}">
                    Aplicar oferta
                </button>
            </div>
        `;

    } catch (error) {
        console.error(
            `Error al consultar oferta del producto ${idProducto}:`,
            error
        );

        return `
            <span class="oferta-error">
                No disponible
            </span>
        `;
    }
}

// Mostrar productos en la tabla
async function mostrarInventario(productos) {
    if (!productos.length) {
        tablaInventario.innerHTML = `
            <tr>
                <td colspan="7" class="mensaje-tabla">
                    No hay productos registrados.
                </td>
            </tr>
        `;
        return;
    }

    const filas = await Promise.all(
        productos.map(async producto => {
            const estado = obtenerEstado(producto);
            const ofertaHTML = await consultarOferta(producto);

            return `
                <tr>
                    <td>${escaparHTML(producto.nombre || 'Sin nombre')}</td>

                    <td>${Number(producto.stock_actual ?? 0)}</td>

                    <td>${producto.stock_minimo ?? '—'}</td>

                    <td>${producto.stock_maximo ?? '—'}</td>

                    <td>
                        <span class="estado ${estado.clase}">
                            ${estado.texto}
                        </span>
                    </td>

                    <td>${ofertaHTML}</td>

                    <td>
                        <button
                            type="button"
                            class="btn-configurar"
                            data-accion="configurar"
                            data-id="${Number(producto.id_producto)}">
                            Configurar
                        </button>
                    </td>
                </tr>
            `;
        })
    );

    tablaInventario.innerHTML = filas.join('');
}

// Aplicar oferta aceptada por el administrador
async function aplicarOferta(idProducto) {
    try {
        const respuesta = await fetch(
            `${API_OFERTAS}/${idProducto}/aplicar`,
            {
                method: 'POST'
            }
        );

        const resultado = await respuesta.json();

        if (!respuesta.ok || !resultado.success) {
            throw new Error(
                resultado.message || 'No se pudo aplicar la oferta.'
            );
        }

        mostrarMensaje(
            resultado.message || 'Oferta aplicada correctamente.',
            'exito'
        );

        await cargarInventario();

    } catch (error) {
        console.error('Error al aplicar oferta:', error);
        mostrarMensaje(error.message, 'error');
    }
}

// Desactivar oferta
async function desactivarOferta(idProducto) {
    try {
        const respuesta = await fetch(
            `${API_OFERTAS}/${idProducto}/desactivar`,
            {
                method: 'PUT'
            }
        );

        const resultado = await respuesta.json();

        if (!respuesta.ok || !resultado.success) {
            throw new Error(
                resultado.message || 'No se pudo desactivar la oferta.'
            );
        }

        mostrarMensaje(
            resultado.message || 'Oferta desactivada correctamente.',
            'exito'
        );

        await cargarInventario();

    } catch (error) {
        console.error('Error al desactivar oferta:', error);
        mostrarMensaje(error.message, 'error');
    }
}

// Evitar insertar HTML proveniente de la base de datos
function escaparHTML(valor) {
    return String(valor).replace(/[&<>"']/g, caracter => {
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

// Actualizar tarjetas de resumen
function actualizarResumen(productos) {
    let bajos = 0;
    let normales = 0;
    let excedidos = 0;

    productos.forEach(producto => {
        const estado = obtenerEstado(producto);

        if (estado.clase === 'stock-bajo') bajos++;
        if (estado.clase === 'stock-normal') normales++;
        if (estado.clase === 'stock-excedido') excedidos++;
    });

    document.getElementById('totalProductos').textContent =
        productos.length;

    document.getElementById('totalBajo').textContent = bajos;
    document.getElementById('totalNormal').textContent = normales;
    document.getElementById('totalExceso').textContent = excedidos;
}

// Abrir modal para configurar límites
function abrirModal(idProducto) {
    const producto = productosInventario.find(
        p => Number(p.id_producto) === Number(idProducto)
    );

    if (!producto) {
        mostrarMensaje(
            'No se encontró el producto seleccionado.',
            'error'
        );
        return;
    }

    document.getElementById('idProducto').value = producto.id_producto;

    document.getElementById('nombreProducto').textContent =
        producto.nombre || 'Producto';

    document.getElementById('stockMinimo').value =
        producto.stock_minimo ?? 0;

    document.getElementById('stockMaximo').value =
        producto.stock_maximo ?? 0;

    modalStock.style.display = 'flex';
    document.body.classList.add('modal-abierto');
}

// Cerrar modal
function cerrarModal() {
    modalStock.style.display = 'none';
    document.body.classList.remove('modal-abierto');
}

// Guardar límites de stock
async function guardarStock(evento) {
    evento.preventDefault();

    const idProducto = document.getElementById('idProducto').value;

    const stockMinimo = Number(
        document.getElementById('stockMinimo').value
    );

    const stockMaximo = Number(
        document.getElementById('stockMaximo').value
    );

    const producto = productosInventario.find(
        p => Number(p.id_producto) === Number(idProducto)
    );

    if (!producto) {
        mostrarMensaje('No se encontró el producto.', 'error');
        return;
    }

    if (
        !Number.isInteger(stockMinimo) ||
        !Number.isInteger(stockMaximo) ||
        stockMinimo < 0 ||
        stockMaximo < 0
    ) {
        mostrarMensaje(
            'Las cantidades deben ser números enteros no negativos.',
            'error'
        );
        return;
    }

    if (stockMaximo <= stockMinimo) {
        mostrarMensaje(
            'El stock máximo debe ser mayor que el stock mínimo.',
            'error'
        );
        return;
    }

    const datos = {
        stock_actual: Number(producto.stock_actual ?? 0),
        stock_minimo: stockMinimo,
        stock_maximo: stockMaximo
    };

    const botonGuardar = formStock.querySelector(
        'button[type="submit"]'
    );

    botonGuardar.disabled = true;
    botonGuardar.textContent = 'Guardando...';

    try {
        const respuesta = await fetch(
            `${API_INVENTARIO}/${idProducto}`,
            {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(datos)
            }
        );

        const resultado = await respuesta.json();

        if (!respuesta.ok || !resultado.success) {
            throw new Error(
                resultado.message || 'No se pudieron guardar los límites.'
            );
        }

        cerrarModal();

        // Al recargar se vuelve a evaluar la oferta.
        // Si el stock ya no cumple la condición, se desactiva.
        await cargarInventario();

        mostrarMensaje(
            'Los límites se guardaron correctamente.',
            'exito'
        );

    } catch (error) {
        console.error('Error al guardar stock:', error);
        mostrarMensaje(error.message, 'error');

    } finally {
        botonGuardar.disabled = false;
        botonGuardar.textContent = 'Guardar cambios';
    }
}

// Eventos de la tabla: aplicar, desactivar y configurar
tablaInventario.addEventListener('click', evento => {
    const boton = evento.target.closest('button[data-accion]');

    if (!boton) return;

    const idProducto = Number(boton.dataset.id);
    const accion = boton.dataset.accion;

    if (accion === 'aplicar') {
        aplicarOferta(idProducto);
    }

    if (accion === 'desactivar') {
        desactivarOferta(idProducto);
    }

    if (accion === 'configurar') {
        abrirModal(idProducto);
    }
});

// Eventos generales
btnActualizar.addEventListener('click', cargarInventario);
btnCancelar.addEventListener('click', cerrarModal);
formStock.addEventListener('submit', guardarStock);

// Cerrar al hacer clic fuera del modal
modalStock.addEventListener('click', evento => {
    if (evento.target === modalStock) {
        cerrarModal();
    }
});

// Cerrar con Escape
document.addEventListener('keydown', evento => {
    if (
        evento.key === 'Escape' &&
        modalStock.style.display === 'flex'
    ) {
        cerrarModal();
    }
});

// Cargar inventario al abrir la página
document.addEventListener('DOMContentLoaded', cargarInventario);
