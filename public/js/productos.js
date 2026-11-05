
const API_PRODUCTOS = CUBEX_CONFIG.API.INVENTARIO + '/api/productos';
const API_IMAGENES = CUBEX_CONFIG.API.INVENTARIO;

const formulario = document.getElementById('formProducto');
const tabla = document.getElementById('tablaProductos');
const mensaje = document.getElementById('mensaje');

const modalEliminar = document.getElementById('modalEliminar');
const textoConfirmacionEliminar = document.getElementById('textoConfirmacionEliminar');
const btnCancelarEliminar = document.getElementById('btnCancelarEliminar');
const btnConfirmarEliminar = document.getElementById('btnConfirmarEliminar');

const btnGuardar = document.getElementById('btnGuardar');
const btnCancelarEdicion = document.getElementById('btnCancelarEdicion');
const tituloFormulario = document.getElementById('tituloFormulario');
const inputImagen = document.getElementById('imagen');

let productoEliminarId = null;
let productoEditandoId = null;

// ======================================
// CARGAR PRODUCTOS
// ======================================

async function cargarProductos() {
    try {
        const respuesta = await fetch(API_PRODUCTOS, { cache: 'no-store' });
        const resultado = await respuesta.json();

        if (!respuesta.ok) {
            throw new Error(resultado.message || 'No se pudieron cargar los productos.');
        }

        const productos = Array.isArray(resultado)
            ? resultado
            : resultado.data;

        if (!Array.isArray(productos)) {
            throw new Error('La API devolvió un formato inesperado.');
        }

        tabla.innerHTML = '';

        if (productos.length === 0) {
            tabla.innerHTML = `
                <tr>
                    <td colspan="11">No hay productos registrados.</td>
                </tr>
            `;
            return;
        }

        productos.forEach(producto => {
            const fila = document.createElement('tr');

            // Fotografía
            const celdaImagen = document.createElement('td');

            if (producto.imagen) {
                const imagen = document.createElement('img');

                imagen.src = producto.imagen.startsWith('http')
                    ? producto.imagen
                    : `${API_IMAGENES}${producto.imagen}`;

                imagen.alt = producto.nombre;
                imagen.style.width = '65px';
                imagen.style.height = '65px';
                imagen.style.objectFit = 'contain';
                imagen.style.borderRadius = '8px';

                imagen.onerror = () => {
                    imagen.style.display = 'none';
                    celdaImagen.textContent = 'Sin imagen';
                };

                celdaImagen.appendChild(imagen);
            } else {
                celdaImagen.textContent = 'Sin imagen';
            }

            fila.appendChild(celdaImagen);

            // Datos del producto
            const inactivo = Number(producto.activo) === 0;
            const existencias = Number(producto.stock_actual ?? 0);

            const valores = [
                producto.id,
                `${producto.nombre}${inactivo ? ' (dado de baja)' : ''} · stock: ${existencias}${!inactivo && existencias <= 0 ? ' · AGOTADO' : ''}`,
                producto.descripcion || '--',
                producto.lote || '--',
                producto.serie || '--',
                producto.caducidad
                    ? String(producto.caducidad).slice(0, 10)
                    : 'No aplica',
                producto.id_proveedor ?? 'Sin proveedor',
                producto.costo,
                producto.precio
            ];

            valores.forEach(valor => {
                const celda = document.createElement('td');
                celda.textContent = valor ?? '--';
                fila.appendChild(celda);
            });

            // Acciones
            const celdaAcciones = document.createElement('td');

            const btnEditar = document.createElement('button');
            btnEditar.type = 'button';
            btnEditar.textContent = 'Editar';
            btnEditar.className = 'boton-secundario';
            btnEditar.dataset.accion = 'editar';
            btnEditar.dataset.id = producto.id;

            const btnEliminar = document.createElement('button');
            btnEliminar.type = 'button';
            btnEliminar.textContent = inactivo ? 'Reactivar' : 'Dar de baja';
            btnEliminar.className = 'boton-principal';
            btnEliminar.dataset.accion = inactivo ? 'reactivar' : 'eliminar';
            btnEliminar.dataset.id = producto.id;
            btnEliminar.dataset.nombre = producto.nombre;

            if (inactivo) {
                fila.style.opacity = '0.6';
            }

            celdaAcciones.appendChild(btnEditar);
            celdaAcciones.appendChild(btnEliminar);
            fila.appendChild(celdaAcciones);

            tabla.appendChild(fila);
        });

    } catch (error) {
        console.error('Error al cargar productos:', error);

        tabla.innerHTML = `
            <tr>
                <td colspan="11">Error al cargar los productos.</td>
            </tr>
        `;
    }
}

// ======================================
// REGISTRAR Y ACTUALIZAR PRODUCTOS
// ======================================

formulario.addEventListener('submit', async (evento) => {
    evento.preventDefault();

    const archivoImagen = inputImagen.files[0];

    // La fotografía es obligatoria al registrar.
    // Al editar, se puede conservar la fotografía anterior.
    if (!productoEditandoId && !archivoImagen) {
        mensaje.textContent = 'Selecciona una fotografía del producto.';
        return;
    }

    const datos = new FormData();

    datos.append('nombre', document.getElementById('nombre').value.trim());
    datos.append('descripcion', document.getElementById('descripcion').value.trim());
    datos.append('lote', document.getElementById('lote').value.trim());
    datos.append('serie', document.getElementById('serie').value.trim());
    datos.append('caducidad', document.getElementById('caducidad').value);
    datos.append('id_proveedor', document.getElementById('proveedor').value);
    datos.append('costo', document.getElementById('costo').value);
    datos.append('precio', document.getElementById('precio').value);

    if (archivoImagen) {
        datos.append('imagen', archivoImagen);
    }

    const editando = productoEditandoId !== null;

    const url = editando
        ? `${API_PRODUCTOS}/${productoEditandoId}`
        : API_PRODUCTOS;

    try {
        btnGuardar.disabled = true;
        btnGuardar.textContent = editando ? 'Guardando cambios...' : 'Registrando...';

        mensaje.textContent = editando
            ? 'Actualizando producto...'
            : 'Registrando producto y subiendo fotografía...';

        const respuesta = await fetch(url, {
            method: editando ? 'PUT' : 'POST',
            body: datos
        });

        const resultado = await respuesta.json();

        if (!respuesta.ok) {
            throw new Error(resultado.message || 'No se pudo guardar el producto.');
        }

        mensaje.textContent = editando
            ? 'Producto actualizado correctamente.'
            : 'Producto registrado correctamente.';

        cancelarEdicion();
        await cargarProductos();

    } catch (error) {
        mensaje.textContent = error.message;
        console.error(error);

    } finally {
        btnGuardar.disabled = false;
        btnGuardar.textContent = productoEditandoId
            ? 'Guardar cambios'
            : 'Registrar producto';
    }
});

// ======================================
// EDITAR PRODUCTO
// ======================================

async function editarProducto(id) {
    try {
        const respuesta = await fetch(`${API_PRODUCTOS}/${id}`);
        const resultado = await respuesta.json();

        if (!respuesta.ok) {
            throw new Error(resultado.message || 'No se pudo consultar el producto.');
        }

        const producto = resultado.data || resultado;

        productoEditandoId = id;

        document.getElementById('nombre').value = producto.nombre || '';
        document.getElementById('descripcion').value = producto.descripcion || '';
        document.getElementById('lote').value = producto.lote || '';
        document.getElementById('serie').value = producto.serie || '';
        document.getElementById('caducidad').value =
            producto.caducidad ? String(producto.caducidad).slice(0, 10) : '';

        document.getElementById('proveedor').value =
            producto.id_proveedor ?? '';

        document.getElementById('costo').value = producto.costo ?? '';
        document.getElementById('precio').value = producto.precio ?? '';

        // La imagen anterior se conserva si no se selecciona otra.
        inputImagen.value = '';
        inputImagen.required = false;

        tituloFormulario.textContent = 'Editar producto';
        btnGuardar.textContent = 'Guardar cambios';
        btnCancelarEdicion.style.display = 'inline-block';

        mensaje.textContent = 'Modifica los datos del producto.';

        formulario.scrollIntoView({
            behavior: 'smooth',
            block: 'start'
        });

    } catch (error) {
        alert(error.message);
        console.error(error);
    }
}

// ======================================
// MODAL PERSONALIZADO DE ELIMINACIÓN
// ======================================

function abrirModalEliminar(id, nombre) {
    productoEliminarId = id;

    textoConfirmacionEliminar.textContent =
        `¿Dar de baja el producto "${nombre}"? Dejará de mostrarse en la tienda, pero se conservan sus ventas, movimientos y reseñas. Puedes reactivarlo después.`;

    modalEliminar.classList.add('activo');
    btnConfirmarEliminar.disabled = false;
}

function cerrarModalEliminar() {
    modalEliminar.classList.remove('activo');
    productoEliminarId = null;
    btnConfirmarEliminar.disabled = false;
}

// Botón CANCELAR
btnCancelarEliminar.addEventListener('click', () => {
    cerrarModalEliminar();
});

// Botón SÍ, ELIMINAR
btnConfirmarEliminar.addEventListener('click', async () => {
    if (productoEliminarId === null) {
        return;
    }

    const id = productoEliminarId;

    try {
        btnConfirmarEliminar.disabled = true;
        btnConfirmarEliminar.textContent = 'Procesando...';

        const respuesta = await fetch(`${API_PRODUCTOS}/${id}`, {
            method: 'DELETE'
        });

        const resultado = await respuesta.json();

        if (!respuesta.ok) {
            throw new Error(resultado.message || 'No se pudo eliminar el producto.');
        }

        cerrarModalEliminar();

        mensaje.textContent = resultado.message || 'Producto dado de baja correctamente.';
        await cargarProductos();

    } catch (error) {
        alert(error.message);
        console.error(error);

    } finally {
        btnConfirmarEliminar.disabled = false;
        btnConfirmarEliminar.textContent = 'Sí, dar de baja';
    }
});

// Cerrar al hacer clic fuera del cuadro
modalEliminar.addEventListener('click', (evento) => {
    if (evento.target === modalEliminar) {
        cerrarModalEliminar();
    }
});

// Cerrar con Escape
document.addEventListener('keydown', (evento) => {
    if (evento.key === 'Escape' && modalEliminar.classList.contains('activo')) {
        cerrarModalEliminar();
    }
});

// ======================================
// EVENTOS DE LOS BOTONES DE LA TABLA
// ======================================

// Delegación de eventos para botones creados dinámicamente.
tabla.addEventListener('click', (evento) => {
    const boton = evento.target.closest('button[data-accion]');

    if (!boton) {
        return;
    }

    const id = boton.dataset.id;

    if (boton.dataset.accion === 'editar') {
        editarProducto(id);
    }

    if (boton.dataset.accion === 'eliminar') {
        abrirModalEliminar(id, boton.dataset.nombre);
    }

    if (boton.dataset.accion === 'reactivar') {
        reactivarProducto(id, boton);
    }
});

// Volver a mostrar un producto dado de baja
async function reactivarProducto(id, boton) {
    try {
        boton.disabled = true;

        const respuesta = await fetch(`${API_PRODUCTOS}/${id}/reactivar`, {
            method: 'PATCH'
        });

        const resultado = await respuesta.json().catch(() => ({}));

        if (!respuesta.ok) {
            throw new Error(resultado.message || 'No se pudo reactivar el producto.');
        }

        mensaje.textContent = resultado.message;
        await cargarProductos();
    } catch (error) {
        alert(error.message);
    } finally {
        boton.disabled = false;
    }
}

// ======================================
// CANCELAR EDICIÓN
// ======================================

function cancelarEdicion() {
    productoEditandoId = null;

    formulario.reset();

    inputImagen.required = true;

    tituloFormulario.textContent = 'Registrar producto';
    btnGuardar.textContent = 'Registrar producto';

    btnCancelarEdicion.style.display = 'none';

    const contenedorVistaPrevia =
        document.getElementById('contenedorVistaPrevia');

    const vistaPrevia =
        document.getElementById('vistaPrevia');

    if (contenedorVistaPrevia) {
        contenedorVistaPrevia.style.display = 'none';
    }

    if (vistaPrevia) {
        vistaPrevia.src = '';
    }
}

btnCancelarEdicion.addEventListener('click', () => {
    cancelarEdicion();
    mensaje.textContent = '';
});

// ======================================
// BOTÓN ACTUALIZAR LISTA
// ======================================

document.getElementById('btnActualizar')
    .addEventListener('click', cargarProductos);

// ======================================
// INICIO
// ======================================

// Cargar los productos al abrir la página.
cargarProductos();
