// ========================================
// CONFIGURACIÓN DE API
// ========================================

const API_PRODUCTOS = CUBEX_CONFIG.API.INVENTARIO + '/api/productos';
const API_IMAGENES = CUBEX_CONFIG.API.INVENTARIO;
const API_RESENAS = CUBEX_CONFIG.API.RESENAS;
const API_OFERTAS = CUBEX_CONFIG.API.INVENTARIO + '/api/ofertas';

// ========================================
// ELEMENTOS DEL DOM
// ========================================

const catalogo = document.getElementById('catalogoProductos');
const seccionProductos = document.getElementById('productos');
const detalleProducto = document.getElementById('detalleProducto');
const hero = document.querySelector('.hero');

const buscarProducto = document.getElementById('buscarProducto');
const btnBuscar = document.getElementById('btnBuscar');
const btnRegresar = document.getElementById('btnRegresarCatalogo');

const formularioResena = document.getElementById('formularioResena');

// ========================================
// VARIABLES GLOBALES
// ========================================

let productosCargados = [];
let productoActual = null;

// ========================================
// MENSAJES PERSONALIZADOS
// ========================================

function mostrarMensajeResena(texto, tipo = 'info') {
    const mensaje = document.getElementById('mensajeResena');

    if (!mensaje) return;

    mensaje.textContent = texto;
    mensaje.className = `mensaje-resena ${tipo}`;
    mensaje.style.display = 'block';
}

function limpiarMensajeResena() {
    const mensaje = document.getElementById('mensajeResena');

    if (!mensaje) return;

    mensaje.textContent = '';
    mensaje.className = 'mensaje-resena';
    mensaje.style.display = 'none';
}

// ========================================
// CARGAR PRODUCTOS Y OFERTAS
// ========================================

async function cargarProductos() {
    if (!catalogo) {
        console.warn('No se encontró el elemento #catalogoProductos en index.html.');
        return;
    }

    catalogo.innerHTML = `
        <p class="mensaje-catalogo">Cargando productos...</p>
    `;

    try {
        // Catálogo público: el servidor solo devuelve productos activos
        // con existencias reales (> 0) en MySQL.
        const respuestaProductos = await fetch(`${API_PRODUCTOS}/catalogo`, {
            cache: 'no-store',
            method: 'GET',
            headers: { 'Accept': 'application/json' }
        });

        const tipoContenido = respuestaProductos.headers.get('content-type') || '';
        let resultadoProductos;

        if (tipoContenido.includes('application/json')) {
            resultadoProductos = await respuestaProductos.json();
        } else {
            const textoRespuesta = await respuestaProductos.text();

            throw new Error(
                `El servicio de productos no devolvió JSON. Respuesta: ${textoRespuesta.slice(0, 180)}`
            );
        }

        if (!respuestaProductos.ok) {
            throw new Error(
                resultadoProductos.message ||
                resultadoProductos.mensaje ||
                `Error HTTP ${respuestaProductos.status} al consultar productos`
            );
        }

        // Aceptar los formatos de respuesta más comunes del microservicio.
        if (Array.isArray(resultadoProductos)) {
            productosCargados = resultadoProductos;
        } else if (Array.isArray(resultadoProductos.data)) {
            productosCargados = resultadoProductos.data;
        } else if (Array.isArray(resultadoProductos.productos)) {
            productosCargados = resultadoProductos.productos;
        } else if (Array.isArray(resultadoProductos.resultado)) {
            productosCargados = resultadoProductos.resultado;
        } else {
            console.error(
                'Formato de respuesta de productos no reconocido:',
                resultadoProductos
            );

            throw new Error(
                'El servicio respondió, pero no se encontró una lista de productos.'
            );
        }

        if (productosCargados.length === 0) {
            catalogo.innerHTML = `
                <p class="mensaje-catalogo">
                    Todavía no hay productos disponibles.
                </p>
            `;

            return;
        }

        // Las ofertas son opcionales: si el endpoint falla,
        // el catálogo seguirá mostrando los productos normalmente.
        let ofertas = [];

        try {
            const respuestaOfertas = await fetch(`${API_OFERTAS}/activas`, {
                method: 'GET',
                headers: { 'Accept': 'application/json' }
            });

            if (respuestaOfertas.ok) {
                const resultadoOfertas = await respuestaOfertas.json();

                if (Array.isArray(resultadoOfertas)) {
                    ofertas = resultadoOfertas;
                } else if (Array.isArray(resultadoOfertas.data)) {
                    ofertas = resultadoOfertas.data;
                }
            }
        } catch (error) {
            console.warn(
                'No se pudieron consultar las ofertas. Se mostrarán los precios normales:',
                error
            );
        }

        // Relacionar cada oferta con su producto.
        productosCargados = productosCargados.map(producto => {
            const idProducto = producto.id ?? producto.id_producto;

            const oferta = ofertas.find(o =>
                Number(o.id_producto) === Number(idProducto)
            );

            return {
                ...producto,
                id: idProducto,
                ofertaActiva: oferta || null
            };
        });

        mostrarCatalogo(productosCargados);

    } catch (error) {
        console.error('Error al cargar productos:', error);

        catalogo.innerHTML = `
            <p class="mensaje-catalogo">
                No fue posible cargar los productos.
                ${escaparHTML(
                    error.message ||
                    'Verifica que el servicio de inventario esté encendido.'
                )}
            </p>
        `;
    }
}

// ========================================
// OBTENER PRECIO DEL PRODUCTO
// ========================================

function obtenerPrecioHTML(producto) {
    const precioOriginal = Number(producto.precio);
    const oferta = producto.ofertaActiva;

    const tieneOferta =
        oferta &&
        Number(oferta.activa) === 1 &&
        Number(oferta.precio_oferta) < precioOriginal;

    if (tieneOferta) {
        return `
            <div class="producto-precios">

                <span class="precio-anterior">
                    ${formatearPrecio(precioOriginal)}
                </span>

                <strong class="precio-descuento">
                    ${formatearPrecio(oferta.precio_oferta)}
                </strong>

                <span class="etiqueta-descuento">
                    ${Number(oferta.porcentaje_descuento)}% OFF
                </span>

            </div>
        `;
    }

    return `
        <strong class="producto-precio">
            ${formatearPrecio(precioOriginal)}
        </strong>
    `;
}

// ========================================
// EXISTENCIAS VISIBLES PARA EL CLIENTE
// ========================================

function obtenerExistenciasHTML(producto) {
    const stock = Number(producto.stock_disponible ?? producto.stock_actual);

    if (!Number.isFinite(stock)) return '';

    if (stock <= 0) {
        return '<p class="producto-existencias agotado">No disponible por el momento</p>';
    }

    if (stock <= 5) {
        return `<p class="producto-existencias pocas">¡Últimas ${stock} unidad(es)!</p>`;
    }

    return `<p class="producto-existencias">${stock} disponibles</p>`;
}

// ========================================
// MOSTRAR CATÁLOGO
// ========================================

function mostrarCatalogo(productos) {
    if (!catalogo) return;

    catalogo.innerHTML = '';

    if (!productos || productos.length === 0) {
        catalogo.innerHTML = `
            <p class="mensaje-catalogo">
                No hay productos disponibles.
            </p>
        `;

        return;
    }

    productos.forEach(producto => {
        const tarjeta = document.createElement('article');
        tarjeta.className = 'producto-card';

        const imagen = obtenerUrlImagen(producto.imagen);

        tarjeta.innerHTML = `
            <div class="producto-card-imagen">
                ${
                    imagen
                        ? `
                            <img
                                src="${escaparHTML(imagen)}"
                                alt="${escaparHTML(producto.nombre)}"
                            >
                        `
                        : '<span>Sin fotografía</span>'
                }
            </div>

            <div class="producto-card-info">

                <h3>${escaparHTML(producto.nombre)}</h3>

                <p>
                    ${escaparHTML(
                        producto.descripcion ||
                        'Descubre este producto CUBEX.'
                    )}
                </p>

                ${obtenerPrecioHTML(producto)}

                ${obtenerExistenciasHTML(producto)}

                <button
                    type="button"
                    class="btn-ver-producto"
                >
                    Ver producto
                </button>

            </div>
        `;

        tarjeta
            .querySelector('.btn-ver-producto')
            .addEventListener('click', () => {
                mostrarDetalle(producto);
            });

        catalogo.appendChild(tarjeta);
    });
}

// ========================================
// MOSTRAR DETALLE DEL PRODUCTO
// ========================================

function mostrarDetalle(producto) {
    const btnAgregar = document.getElementById("btnAgregarDetalle");

    if (btnAgregar) {
        btnAgregar.disabled = false;
        btnAgregar.textContent = "Agregar al carrito";

        btnAgregar.onclick = function () {
            if (producto.disponible === false || Number(producto.stock_disponible) <= 0) {
                return;
            }

            if (typeof window.agregarAlCarrito === "function") {
                window.agregarAlCarrito(producto);
            } else {
                console.error("No se ha cargado carrito.js");
            }
        };
    }

    // Consultar la disponibilidad actual en el servidor (MySQL).
    actualizarDisponibilidadDetalle(producto);

    productoActual = producto;

    const imagen = obtenerUrlImagen(producto.imagen);

    const elementoImagen = document.getElementById('detalleImagen');
    const elementoNombre = document.getElementById('detalleNombre');
    const elementoDescripcion = document.getElementById('detalleDescripcion');
    const elementoPrecio = document.getElementById('detallePrecio');

    if (elementoImagen) {
        elementoImagen.src = imagen || '';
        elementoImagen.alt = producto.nombre || 'Producto CUBEX';
        elementoImagen.hidden = !imagen;
    }

    if (elementoNombre) {
        elementoNombre.textContent = producto.nombre || '';
    }

    if (elementoDescripcion) {
        elementoDescripcion.textContent =
            producto.descripcion || 'Sin descripción disponible.';
    }

    if (elementoPrecio) {
        elementoPrecio.innerHTML = obtenerPrecioHTML(producto);
    }

    if (hero) {
        hero.hidden = true;
    }

    if (seccionProductos) {
        seccionProductos.hidden = true;
    }

    if (detalleProducto) {
        detalleProducto.hidden = false;
    }

    const mensaje = document.getElementById('mensajeResena');

    if (mensaje) {
        mensaje.textContent = '';
    }

    cargarResenas(producto.id);

    window.scrollTo({
        top: 0,
        behavior: 'smooth'
    });
}

// ========================================
// DISPONIBILIDAD ACTUAL EN EL DETALLE
// ========================================

async function actualizarDisponibilidadDetalle(producto) {
    const btnAgregar = document.getElementById('btnAgregarDetalle');
    const existencias = document.getElementById('detalleExistencias');

    try {
        const respuesta = await fetch(`${API_PRODUCTOS}/${encodeURIComponent(producto.id)}`, {
            cache: 'no-store'
        });

        const resultado = await respuesta.json().catch(() => ({}));
        const datos = resultado.data || {};

        if (!respuesta.ok || !datos.disponible) {
            producto.disponible = false;
            producto.stock_disponible = 0;
        } else {
            producto.disponible = true;
            producto.stock_disponible = Number(datos.stock_disponible);
        }
    } catch (error) {
        console.warn('No se pudo actualizar la disponibilidad:', error);
    }

    if (productoActual !== producto) return;

    if (existencias) {
        existencias.innerHTML = obtenerExistenciasHTML(producto);
    }

    if (btnAgregar && producto.disponible === false) {
        btnAgregar.disabled = true;
        btnAgregar.textContent = 'No disponible';
    }
}

// ========================================
// REGRESAR AL CATÁLOGO
// ========================================

function regresarAlCatalogo() {
    if (detalleProducto) {
        detalleProducto.hidden = true;
    }

    if (seccionProductos) {
        seccionProductos.hidden = false;
    }

    productoActual = null;

    if (hero) {
        hero.hidden = false;
    }

    mostrarCatalogo(productosCargados);

    window.scrollTo({
        top: seccionProductos
            ? seccionProductos.offsetTop - 100
            : 0,
        behavior: 'smooth'
    });
}

if (btnRegresar) {
    btnRegresar.addEventListener('click', regresarAlCatalogo);
}

// ========================================
// BUSCADOR: SOLO POR NOMBRE DEL PRODUCTO
// ========================================

function normalizarTexto(texto) {
    return String(texto || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .trim();
}

function buscarEnCatalogo() {
    const textoOriginal = buscarProducto.value.trim();
    const texto = normalizarTexto(textoOriginal);

    // Filtrar exclusivamente por el nombre.
    const filtrados = texto === ''
        ? [...productosCargados]
        : productosCargados.filter(producto =>
            normalizarTexto(producto.nombre).includes(texto)
        );

    // Mostrar nuevamente la sección del catálogo.
    if (detalleProducto) {
        detalleProducto.hidden = true;
    }

    if (seccionProductos) {
        seccionProductos.hidden = false;
    }

    if (hero) {
        hero.hidden = false;
    }

    productoActual = null;

    if (!catalogo || !seccionProductos) return;

    // Mostrar resultados o mensaje de búsqueda vacía.
    if (filtrados.length === 0) {
        catalogo.innerHTML = `
            <p class="mensaje-catalogo">
                No encontramos cubos disponibles cuyo nombre coincida con
                "${escaparHTML(textoOriginal)}".
            </p>
        `;
    } else {
        mostrarCatalogo(filtrados);
    }

    // Avisar si lo buscado existe pero está agotado (sin permitir agregarlo).
    if (texto) {
        avisarNoDisponibles(textoOriginal);
    }

    // Bajar al catálogo dejando espacio para el encabezado fijo.
    requestAnimationFrame(() => {
        const posicion =
            seccionProductos.getBoundingClientRect().top +
            window.scrollY;

        window.scrollTo({
            top: Math.max(0, posicion - 180),
            behavior: 'smooth'
        });
    });
}

async function avisarNoDisponibles(textoBuscado) {
    try {
        const respuesta = await fetch(
            `${API_PRODUCTOS}/catalogo/buscar?q=${encodeURIComponent(textoBuscado)}`,
            { cache: 'no-store' }
        );

        if (!respuesta.ok) return;

        const resultado = await respuesta.json();
        const noDisponibles = Array.isArray(resultado.no_disponibles)
            ? resultado.no_disponibles
            : [];

        if (!noDisponibles.length || !catalogo) return;

        const aviso = document.createElement('p');
        aviso.className = 'mensaje-catalogo aviso-no-disponible';
        aviso.innerHTML = `
            ${noDisponibles.map(p => `<strong>${escaparHTML(p.nombre)}</strong>`).join(', ')}
            ${noDisponibles.length === 1 ? 'no está disponible' : 'no están disponibles'}
            por el momento. Vuelve pronto.
        `;

        catalogo.prepend(aviso);
    } catch (error) {
        console.warn('No se pudo consultar productos no disponibles:', error);
    }
}

// Botón de búsqueda
if (btnBuscar && buscarProducto) {
    btnBuscar.addEventListener('click', evento => {
        evento.preventDefault();
        buscarEnCatalogo();
    });

    // Buscar al presionar Enter
    buscarProducto.addEventListener('keydown', evento => {
        if (evento.key === 'Enter') {
            evento.preventDefault();
            buscarEnCatalogo();
        }
    });

    // Evitar que el formulario recargue la página.
    const formularioBusqueda = buscarProducto.closest('form');

    if (formularioBusqueda) {
        formularioBusqueda.addEventListener('submit', evento => {
            evento.preventDefault();
            buscarEnCatalogo();
        });
    }
}

// ========================================
// PUBLICAR RESEÑA
// ========================================

if (formularioResena) {
    formularioResena.addEventListener('submit', async evento => {
        evento.preventDefault();

        const token = sessionStorage.getItem('cubex_token');

        // Verificar sesión
        if (!token) {
            mostrarMensajeResena(
                'Debes iniciar sesión para publicar una reseña.',
                'info'
            );

            return;
        }

        // Obtener información del usuario
        let usuario = {};

        try {
            usuario = JSON.parse(
                sessionStorage.getItem('cubex_usuario') || '{}'
            );
        } catch (error) {
            console.error(
                'Error al leer los datos del usuario:',
                error
            );
        }

        // Verificar rol
        if (usuario.rol !== 'CLIENTE') {
            mostrarMensajeResena(
                'Solo los clientes pueden publicar reseñas.',
                'advertencia'
            );

            return;
        }

        // Verificar producto seleccionado
        if (!productoActual || !productoActual.id) {
            mostrarMensajeResena(
                'No se encontró el producto seleccionado.',
                'error'
            );

            return;
        }

        const elementoCalificacion =
            document.getElementById('calificacionResena');

        const elementoComentario =
            document.getElementById('comentarioResena');

        if (!elementoCalificacion || !elementoComentario) return;

        const calificacion = Number(elementoCalificacion.value);
        const comentario = elementoComentario.value.trim();

        if (!comentario) {
            mostrarMensajeResena(
                'Escribe un comentario antes de publicar.',
                'advertencia'
            );

            elementoComentario.focus();
            return;
        }

        if (comentario.length > 500) {
            mostrarMensajeResena(
                'El comentario no puede superar los 500 caracteres.',
                'advertencia'
            );

            return;
        }

        if (
            !Number.isInteger(calificacion) ||
            calificacion < 1 ||
            calificacion > 5
        ) {
            mostrarMensajeResena(
                'Selecciona una calificación válida.',
                'advertencia'
            );

            return;
        }

        const boton = formularioResena.querySelector(
            'button[type="submit"], input[type="submit"]'
        );

        const textoOriginal = boton
            ? boton.textContent
            : 'Publicar comentario';

        try {
            if (boton) {
                boton.disabled = true;
                boton.textContent = 'Publicando...';
            }

            mostrarMensajeResena(
                'Publicando tu reseña...',
                'info'
            );

            const respuesta = await fetch(API_RESENAS, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({
                    id_producto: productoActual.id,
                    calificacion: calificacion,
                    comentario: comentario
                })
            });

            const resultado = await respuesta.json();

            if (!respuesta.ok) {
                throw new Error(
                    resultado.mensaje ||
                    resultado.message ||
                    resultado.error ||
                    'No se pudo publicar la reseña.'
                );
            }

            elementoComentario.value = '';

            mostrarMensajeResena(
                '¡Tu reseña se publicó correctamente!',
                'exito'
            );

            await cargarResenas(productoActual.id);

            mostrarMensajeResena(
                '¡Tu reseña se publicó correctamente!',
                'exito'
            );

        } catch (error) {
            console.error('Error al publicar reseña:', error);

            mostrarMensajeResena(
                error.message ||
                'Ocurrió un error al publicar tu reseña.',
                'error'
            );

        } finally {
            if (boton) {
                boton.disabled = false;
                boton.textContent = textoOriginal;
            }
        }
    });
}

// ========================================
// OBTENER ID DEL USUARIO DE LA SESIÓN
// ========================================

function obtenerIdUsuarioSesion() {
    try {
        const token = sessionStorage.getItem('cubex_token');

        if (!token) return null;

        const payload = JSON.parse(
            atob(
                token.split('.')[1]
                    .replace(/-/g, '+')
                    .replace(/_/g, '/')
            )
        );

        return Number(payload.sub) || null;

    } catch (error) {
        console.error(
            'No se pudo obtener el usuario del token:',
            error
        );

        return null;
    }
}

// ========================================
// CARGAR RESEÑAS DE UN PRODUCTO
// ========================================

async function cargarResenas(idProducto) {
    const lista = document.getElementById('listaResenas');

    if (!lista) return;

    try {
        lista.innerHTML = '<p>Cargando reseñas...</p>';

        const respuesta = await fetch(
            `${API_RESENAS}/${encodeURIComponent(idProducto)}`
        );

        const resultado = await respuesta.json();

        if (!respuesta.ok) {
            throw new Error(
                resultado.mensaje ||
                resultado.message ||
                resultado.error ||
                'No se pudieron cargar las reseñas.'
            );
        }

        const resenas = Array.isArray(resultado)
            ? resultado
            : resultado.data || [];

        if (resenas.length === 0) {
            lista.innerHTML = `
                <p>Las reseñas de este producto aparecerán aquí.</p>
            `;

            return;
        }

        const idUsuario = obtenerIdUsuarioSesion();

        let indiceActual = 0;
        let resenaActual = null;

        // MOSTRAR RESEÑA
        function mostrarResena() {
            resenaActual = resenas[indiceActual];

            const esPropietario =
                idUsuario !== null &&
                Number(resenaActual.id_cliente) === idUsuario;

            const calificacion = Math.min(
                5,
                Math.max(0, Number(resenaActual.calificacion) || 0)
            );

            const fecha = resenaActual.fecha
                ? new Date(resenaActual.fecha).toLocaleDateString('es-MX')
                : '';

            lista.innerHTML = `
                <div class="carrusel-resenas">

                    <button
                        class="flecha-resena"
                        id="resenaAnterior"
                        ${resenas.length === 1 ? 'disabled' : ''}
                    >&#10094;</button>

                    <article class="resena-item">

                        <strong>
                            ${escaparHTML(
                                resenaActual.nombre_usuario || 'Cliente'
                            )}
                        </strong>

                        <p class="resena-estrellas">
                            ${'★'.repeat(calificacion)}${'☆'.repeat(5 - calificacion)}
                        </p>

                        <p>
                            ${escaparHTML(resenaActual.comentario || '')}
                        </p>

                        ${
                            fecha
                                ? `<small>${escaparHTML(fecha)}</small>`
                                : ''
                        }

                        ${
                            esPropietario
                                ? `
                                    <div class="acciones-resena">

                                        <button
                                            type="button"
                                            class="btn-editar-resena"
                                            id="editarResena"
                                        >✏️ Editar</button>

                                        <button
                                            type="button"
                                            class="btn-eliminar-resena"
                                            id="eliminarResena"
                                        >🗑 Eliminar</button>

                                    </div>
                                `
                                : ''
                        }

                    </article>

                    <button
                        class="flecha-resena"
                        id="resenaSiguiente"
                        ${resenas.length === 1 ? 'disabled' : ''}
                    >&#10095;</button>

                </div>

                <p class="contador-resenas">
                    ${indiceActual + 1} de ${resenas.length} reseñas
                </p>
            `;

            document.getElementById('resenaAnterior')
                .addEventListener('click', () => {
                    indiceActual =
                        (indiceActual - 1 + resenas.length) % resenas.length;

                    mostrarResena();
                });

            document.getElementById('resenaSiguiente')
                .addEventListener('click', () => {
                    indiceActual =
                        (indiceActual + 1) % resenas.length;

                    mostrarResena();
                });

            const editar = document.getElementById('editarResena');

            if (editar) {
                editar.addEventListener(
                    'click',
                    mostrarFormularioEdicion
                );
            }

            const eliminar = document.getElementById('eliminarResena');

            if (eliminar) {
                eliminar.addEventListener('click', eliminarResena);
            }
        }

        // ========================================
        // EDITAR RESEÑA
        // ========================================

        function mostrarFormularioEdicion() {
            const tarjeta = lista.querySelector('.resena-item');

            tarjeta.innerHTML = `
                <h3>Editar mi reseña</h3>

                <label for="editarCalificacion">
                    Calificación
                </label>

                <select id="editarCalificacion">
                    ${[5, 4, 3, 2, 1].map(valor => `
                        <option
                            value="${valor}"
                            ${Number(resenaActual.calificacion) === valor ? 'selected' : ''}
                        >
                            ${valor} estrellas
                        </option>
                    `).join('')}
                </select>

                <label for="editarComentario">
                    Comentario
                </label>

                <textarea
                    id="editarComentario"
                    maxlength="500"
                    rows="4"
                >${escaparHTML(resenaActual.comentario || '')}</textarea>

                <div class="acciones-resena">

                    <button
                        type="button"
                        class="btn-editar-resena"
                        id="guardarEdicion"
                    >Guardar cambios</button>

                    <button
                        type="button"
                        class="btn-eliminar-resena"
                        id="cancelarEdicion"
                    >Cancelar</button>

                </div>
            `;

            document.getElementById('cancelarEdicion')
                .addEventListener('click', mostrarResena);

            document.getElementById('guardarEdicion')
                .addEventListener('click', guardarEdicion);
        }

        // GUARDAR EDICIÓN
        async function guardarEdicion() {
            const token = sessionStorage.getItem('cubex_token');

            const calificacion = Number(
                document.getElementById('editarCalificacion').value
            );

            const comentario = document.getElementById(
                'editarComentario'
            ).value.trim();

            if (
                !comentario ||
                comentario.length > 500 ||
                !Number.isInteger(calificacion) ||
                calificacion < 1 ||
                calificacion > 5
            ) {
                mostrarMensajeResena(
                    'Escribe un comentario y selecciona una calificación válida.',
                    'advertencia'
                );

                return;
            }

            const boton = document.getElementById('guardarEdicion');

            try {
                boton.disabled = true;
                boton.textContent = 'Guardando...';

                const respuesta = await fetch(
                    `${API_RESENAS}/${encodeURIComponent(resenaActual.id)}`,
                    {
                        method: 'PUT',
                        headers: {
                            'Content-Type': 'application/json',
                            'Authorization': `Bearer ${token}`
                        },
                        body: JSON.stringify({
                            calificacion,
                            comentario
                        })
                    }
                );

                const resultado = await respuesta.json();

                if (!respuesta.ok) {
                    throw new Error(
                        resultado.mensaje ||
                        resultado.message ||
                        resultado.error ||
                        'No se pudo actualizar la reseña.'
                    );
                }

                mostrarMensajeResena(
                    '¡Tu reseña se actualizó correctamente!',
                    'exito'
                );

                await cargarResenas(idProducto);

            } catch (error) {
                console.error('Error al editar reseña:', error);

                mostrarMensajeResena(error.message, 'error');

                boton.disabled = false;
                boton.textContent = 'Guardar cambios';
            }
        }

        // ========================================
        // ELIMINAR RESEÑA
        // ========================================

        async function eliminarResena() {
            const modal = document.createElement('div');

            modal.className = 'modal-confirmacion-resena';

            modal.innerHTML = `
                <div class="modal-resena-contenido">

                    <div class="icono-eliminar-resena">!</div>

                    <h3>¿Eliminar reseña?</h3>

                    <p>
                        Esta acción eliminará tu opinión permanentemente.
                        ¿Deseas continuar?
                    </p>

                    <div class="modal-resena-acciones">

                        <button
                            type="button"
                            id="cancelarEliminar"
                        >
                            Cancelar
                        </button>

                        <button
                            type="button"
                            id="confirmarEliminar"
                        >
                            Sí, eliminar
                        </button>

                    </div>

                </div>
            `;

            document.body.appendChild(modal);

            document.getElementById('cancelarEliminar')
                .addEventListener('click', () => modal.remove());

            document.getElementById('confirmarEliminar')
                .addEventListener('click', async () => {
                    const boton = document.getElementById('confirmarEliminar');
                    const token = sessionStorage.getItem('cubex_token');

                    try {
                        boton.disabled = true;
                        boton.textContent = 'Eliminando...';

                        const respuesta = await fetch(
                            `${API_RESENAS}/${encodeURIComponent(resenaActual.id)}`,
                            {
                                method: 'DELETE',
                                headers: {
                                    'Authorization': `Bearer ${token}`
                                }
                            }
                        );

                        const resultado = await respuesta.json();

                        if (!respuesta.ok) {
                            throw new Error(
                                resultado.mensaje ||
                                resultado.message ||
                                resultado.error ||
                                'No se pudo eliminar la reseña.'
                            );
                        }

                        modal.remove();

                        mostrarMensajeResena(
                            'Tu reseña se eliminó correctamente.',
                            'exito'
                        );

                        await cargarResenas(idProducto);

                    } catch (error) {
                        console.error(
                            'Error al eliminar reseña:',
                            error
                        );

                        modal.remove();

                        mostrarMensajeResena(error.message, 'error');
                    }
                });
        }

        mostrarResena();

    } catch (error) {
        console.error('Error al cargar reseñas:', error);

        lista.innerHTML = `
            <p>No fue posible cargar las reseñas.</p>
        `;
    }
}

// ========================================
// FUNCIONES AUXILIARES
// ========================================

// Obtener dirección de imagen
function obtenerUrlImagen(imagen) {
    if (!imagen) return '';

    if (imagen.startsWith('http')) {
        return imagen;
    }

    return `${API_IMAGENES}${imagen.startsWith('/') ? '' : '/'}${imagen}`;
}

// Formatear precios
function formatearPrecio(precio) {
    const numero = Number(precio);

    if (!Number.isFinite(numero)) {
        return 'Precio no disponible';
    }

    return numero.toLocaleString('es-MX', {
        style: 'currency',
        currency: 'MXN'
    });
}

// Evitar insertar HTML no deseado
function escaparHTML(valor) {
    return String(valor).replace(/[&<>"']/g, caracter => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;'
    })[caracter]);
}

// ========================================
// INICIAR CATÁLOGO
// ========================================

cargarProductos();

// ==========================================
// FORMULARIO DE CONTACTO CUBEX
// ==========================================

function obtenerUsuarioContacto() {
    const posiblesClaves = [
        'cubex_usuario',
        'usuario',
        'usuarioActual',
        'user'
    ];

    for (const almacenamiento of [sessionStorage, localStorage]) {
        for (const clave of posiblesClaves) {
            const valor = almacenamiento.getItem(clave);

            if (!valor) continue;

            try {
                const usuario = JSON.parse(valor);

                if (usuario && typeof usuario === 'object') {
                    const correo =
                        usuario.email ||
                        usuario.correo ||
                        usuario.correo_electronico;

                    if (correo) {
                        return {
                            ...usuario,
                            email: correo
                        };
                    }
                }
            } catch (error) {
                console.warn('No se pudo leer la sesión:', clave);
            }
        }
    }

    return null;
}

function configurarFormularioContacto() {
    const formulario = document.getElementById('formularioContacto');

    if (!formulario) return;

    const estado = document.getElementById('estadoContacto');

    formulario.addEventListener('submit', async function (event) {
        event.preventDefault();

        const usuario = obtenerUsuarioContacto();

        // Impedir el envío si no existe una sesión con correo.
        if (!usuario || !usuario.email) {
            alert('Debes iniciar sesión para enviar un mensaje.');

            if (estado) {
                estado.textContent =
                    'Inicia sesión para poder contactar con CUBEX.';
            }

            return;
        }

        const nombre = document.getElementById('contactoNombre').value.trim();
        const asunto = document.getElementById('contactoAsunto').value.trim();
        const mensaje = document.getElementById('contactoMensaje').value.trim();

        if (!nombre || !asunto || !mensaje) {
            alert('Completa todos los campos.');
            return;
        }

        const boton = formulario.querySelector('button[type="submit"]');
        const textoOriginal = boton.innerHTML;

        boton.disabled = true;
        boton.textContent = 'Enviando mensaje...';

        try {
            const respuesta = await fetch(CUBEX_CONFIG.API.INVENTARIO + '/api/contacto', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    nombre,
                    correo: usuario.email,
                    asunto,
                    mensaje
                })
            });

            const resultado = await respuesta.json();

            if (!respuesta.ok || !resultado.success) {
                throw new Error(
                    resultado.message || 'No se pudo enviar el mensaje.'
                );
            }

            const confirmacion = document.getElementById('mensajeConfirmacion');

            if (confirmacion) {
                confirmacion.textContent =
                    '✓ ¡Mensaje enviado correctamente! Gracias por contactar a CUBEX.';

                confirmacion.className = 'mensaje-confirmacion exito';
            }

            formulario.reset();

            if (estado) {
                estado.textContent = 'Tu mensaje fue enviado correctamente.';
            }

        } catch (error) {
            console.error('Error al enviar contacto:', error);

            const confirmacion = document.getElementById('mensajeConfirmacion');

            if (confirmacion) {
                confirmacion.textContent =
                    'No se pudo enviar tu mensaje. Inténtalo nuevamente.';

                confirmacion.className = 'mensaje-confirmacion error';
            }

        } finally {
            boton.disabled = false;
            boton.innerHTML = textoOriginal;
        }
    });
}

document.addEventListener('DOMContentLoaded', configurarFormularioContacto);