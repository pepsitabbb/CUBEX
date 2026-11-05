
document.addEventListener("DOMContentLoaded", () => {

    // =====================================
    // 1. CONFIGURACIÓN Y SESIÓN
    // =====================================

    const API_ROLES = CUBEX_CONFIG.API.ROLES;
    const token = sessionStorage.getItem("cubex_token");
    const usuarioGuardado = sessionStorage.getItem("cubex_usuario");

    if (!token || !usuarioGuardado) {
        window.location.replace("login.html");
        return;
    }

    let usuario;

    try {
        usuario = JSON.parse(usuarioGuardado);
    } catch (error) {
        sessionStorage.removeItem("cubex_token");
        sessionStorage.removeItem("cubex_usuario");
        window.location.replace("login.html");
        return;
    }

    if (!usuario || usuario.rol !== "ADMIN") {
        window.location.replace("index.html");
        return;
    }

    const nombreCompleto =
        usuario.nombreCompleto || usuario.nombreUsuario || "Administrador";

    const nombreUsuario = usuario.nombreUsuario || "Administrador";
    const correo = usuario.email || "No disponible";
    const rol = usuario.rol || "ADMIN";
    const inicial = nombreCompleto.trim().charAt(0).toUpperCase();


    // =====================================
    // 2. VENTANAS EMERGENTES CUBEX
    // =====================================

    function confirmarCubex({
        titulo = "Confirmar acción",
        mensaje = "¿Deseas continuar?",
        textoConfirmar = "Confirmar",
        peligro = false
    } = {}) {

        return new Promise(resolve => {

            const modal = document.createElement("div");

            Object.assign(modal.style, {
                position: "fixed",
                inset: "0",
                width: "100%",
                height: "100%",
                background: "rgba(0,0,0,0.75)",
                backdropFilter: "blur(4px)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                zIndex: "999999",
                padding: "20px",
                boxSizing: "border-box"
            });

            const contenido = document.createElement("div");

            Object.assign(contenido.style, {
                width: "100%",
                maxWidth: "380px",
                background: "#1e293b",
                border: "1px solid #334155",
                borderRadius: "14px",
                padding: "25px",
                boxShadow: "0 15px 45px rgba(0,0,0,0.5)",
                color: "#f1f5f9",
                fontFamily: "Arial, sans-serif",
                boxSizing: "border-box"
            });

            const icono = document.createElement("div");
            icono.textContent = peligro ? "!" : "?";

            Object.assign(icono.style, {
                width: "40px",
                height: "40px",
                borderRadius: "10px",
                background: peligro
                    ? "rgba(225,29,72,0.15)"
                    : "rgba(0,140,255,0.15)",
                color: peligro ? "#fb7185" : "#008cff",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: "22px",
                fontWeight: "bold",
                marginBottom: "15px"
            });

            const encabezado = document.createElement("h3");
            encabezado.textContent = titulo;

            Object.assign(encabezado.style, {
                fontSize: "18px",
                margin: "0 0 10px",
                color: "#f1f5f9"
            });

            const descripcion = document.createElement("p");
            descripcion.textContent = mensaje;

            Object.assign(descripcion.style, {
                fontSize: "13px",
                lineHeight: "1.6",
                color: "#aebbd0",
                margin: "0"
            });

            const acciones = document.createElement("div");

            Object.assign(acciones.style, {
                display: "flex",
                justifyContent: "flex-end",
                gap: "10px",
                marginTop: "22px"
            });

            const botonCancelar = document.createElement("button");
            botonCancelar.type = "button";
            botonCancelar.textContent = "Cancelar";

            const botonConfirmar = document.createElement("button");
            botonConfirmar.type = "button";
            botonConfirmar.textContent = textoConfirmar;

            function estiloBoton(boton, fondo, borde) {
                Object.assign(boton.style, {
                    padding: "10px 16px",
                    borderRadius: "7px",
                    border: `1px solid ${borde}`,
                    background: fondo,
                    color: "#ffffff",
                    cursor: "pointer",
                    fontSize: "12px",
                    fontWeight: "600"
                });
            }

            estiloBoton(botonCancelar, "#293548", "#475569");

            estiloBoton(
                botonConfirmar,
                peligro ? "#e11d48" : "#087cff",
                peligro ? "#e11d48" : "#087cff"
            );

            acciones.append(botonCancelar, botonConfirmar);

            contenido.append(
                icono,
                encabezado,
                descripcion,
                acciones
            );

            modal.appendChild(contenido);
            document.body.appendChild(modal);

            let finalizado = false;

            function finalizar(respuesta) {
                if (finalizado) return;

                finalizado = true;
                document.removeEventListener("keydown", manejarEscape);
                modal.remove();
                resolve(respuesta);
            }

            function manejarEscape(evento) {
                if (evento.key === "Escape") {
                    finalizar(false);
                }
            }

            botonCancelar.addEventListener("click", () => finalizar(false));
            botonConfirmar.addEventListener("click", () => finalizar(true));

            modal.addEventListener("click", evento => {
                if (evento.target === modal) {
                    finalizar(false);
                }
            });

            document.addEventListener("keydown", manejarEscape);
            botonConfirmar.focus();
        });
    }


    // =====================================
    // 3. NOTIFICACIONES
    // =====================================

    function notificarCubex(mensaje, tipo = "success") {

        const anterior = document.querySelector(".notificacion-cubex");
        if (anterior) anterior.remove();

        const color = tipo === "error" ? "#ef4444" : "#22c55e";

        const notificacion = document.createElement("div");

        Object.assign(notificacion.style, {
            position: "fixed",
            top: "20px",
            right: "20px",
            zIndex: "1000000",
            width: "min(340px, calc(100% - 40px))",
            padding: "14px 17px",
            background: "#1e293b",
            border: "1px solid #334155",
            borderLeft: `4px solid ${color}`,
            borderRadius: "9px",
            color: "#f1f5f9",
            boxShadow: "0 8px 25px rgba(0,0,0,0.4)",
            fontFamily: "Arial, sans-serif",
            boxSizing: "border-box"
        });

        const titulo = document.createElement("strong");
        titulo.textContent = tipo === "error"
            ? "Ocurrió un problema"
            : "Operación exitosa";

        const texto = document.createElement("div");
        texto.textContent = mensaje;

        Object.assign(texto.style, {
            color: "#aebbd0",
            fontSize: "12px",
            marginTop: "5px"
        });

        notificacion.append(titulo, texto);
        document.body.appendChild(notificacion);

        setTimeout(() => notificacion.remove(), 3500);
    }


    // =====================================
    // 4. INFORMACIÓN DEL PERFIL
    // =====================================

    function colocarTexto(id, texto) {
        const elemento = document.getElementById(id);
        if (elemento) elemento.textContent = texto;
    }

    colocarTexto("inicialAdmin", inicial);
    colocarTexto("nombreAdmin", nombreCompleto);
    colocarTexto("usuarioAdmin", "@" + nombreUsuario);

    colocarTexto("inicialModal", inicial);
    colocarTexto("modalNombre", nombreCompleto);
    colocarTexto("modalNombreCompleto", nombreCompleto);
    colocarTexto("modalUsuario", nombreUsuario);
    colocarTexto("modalCorreo", correo);
    colocarTexto("modalRol", rol);


    // =====================================
    // 5. MODAL DE PERFIL
    // =====================================

    const modalPerfil = document.getElementById("modalPerfil");

    document.getElementById("abrirPerfil")
        ?.addEventListener("click", evento => {
            evento.preventDefault();
            modalPerfil?.classList.add("mostrar");
        });

    function cerrarModalPerfil() {
        modalPerfil?.classList.remove("mostrar");
    }

    document.getElementById("cerrarModal")
        ?.addEventListener("click", cerrarModalPerfil);

    document.getElementById("botonCerrarModal")
        ?.addEventListener("click", cerrarModalPerfil);

    modalPerfil?.addEventListener("click", evento => {
        if (evento.target === modalPerfil) {
            cerrarModalPerfil();
        }
    });


    // =====================================
    // 6. CERRAR SESIÓN
    // =====================================

    const botonCerrarSesion = document.getElementById("cerrarSesion");

    if (botonCerrarSesion) {

        if (botonCerrarSesion.tagName === "BUTTON") {
            botonCerrarSesion.type = "button";
        }

        botonCerrarSesion.addEventListener("click", async evento => {

            evento.preventDefault();
            evento.stopPropagation();
            evento.stopImmediatePropagation();

            const confirmar = await confirmarCubex({
                titulo: "Cerrar sesión",
                mensaje: "¿Estás seguro de que deseas cerrar tu sesión en CUBEX?",
                textoConfirmar: "Sí, cerrar sesión",
                peligro: true
            });

            if (confirmar) {
                sessionStorage.removeItem("cubex_token");
                sessionStorage.removeItem("cubex_usuario");

                window.location.replace("login.html");
            }

        }, true);
    }


    // =====================================
    // 7. NAVEGACIÓN
    // =====================================

   
    // =====================================
    // 7. NAVEGACIÓN ENTRE SECCIONES
    // =====================================

    const enlaces = document.querySelectorAll(".nav-enlace");
    const secciones = document.querySelectorAll(".vista");

    function mostrarSeccion(id) {

        let seccionEncontrada = false;

        secciones.forEach(seccion => {

            if (seccion.id === id) {
                seccion.style.display = "block";
                seccionEncontrada = true;
            } else {
                seccion.style.display = "none";
            }

        });

        // Si el apartado no existe, mostrar el resumen
        if (!seccionEncontrada) {
            id = "resumen";

            secciones.forEach(seccion => {
                seccion.style.display =
                    seccion.id === "resumen" ? "block" : "none";
            });
        }

        // Marcar enlace activo
        enlaces.forEach(enlace => {
            enlace.classList.toggle(
                "activo",
                enlace.getAttribute("href") === "#" + id
            );
        });

        // Cambiar dirección y volver al inicio
        if (window.location.hash !== "#" + id) {
            history.replaceState(null, "", "#" + id);
        }

        window.scrollTo({
            top: 0,
            behavior: "smooth"
        });
    }

    // Navegación al hacer clic
    enlaces.forEach(enlace => {

        if (enlace.id === "cerrarSesion") return;

        enlace.addEventListener("click", evento => {

            const destino = enlace.getAttribute("href");

            if (destino && destino.startsWith("#")) {
                evento.preventDefault();

                mostrarSeccion(destino.substring(1));
            }

        });
    });

    // Mostrar sección al cambiar el hash
    window.addEventListener("hashchange", () => {
        const id = window.location.hash.substring(1) || "resumen";
        mostrarSeccion(id);
    });

    // Mostrar apartado inicial
    mostrarSeccion(
        window.location.hash.substring(1) || "resumen"
    );


    // =====================================
    // 8. SECCIÓN USUARIOS Y ROLES
    // =====================================

    const seccionUsuarios =
        document.getElementById("usuarios-roles") ||
        document.getElementById("usuarios") ||
        [...secciones].find(seccion =>
            seccion.textContent.toLowerCase().includes("usuarios y roles")
        );

    if (!seccionUsuarios) {
        console.warn("No se encontró la sección Usuarios y roles.");
        return;
    }

    let contenedorUsuarios =
        document.getElementById("contenedorUsuarios");

    if (!contenedorUsuarios) {
        contenedorUsuarios = document.createElement("div");
        contenedorUsuarios.id = "contenedorUsuarios";

        const tablaExistente = seccionUsuarios.querySelector("table");

        if (tablaExistente) {
            tablaExistente.replaceWith(contenedorUsuarios);
        } else {
            seccionUsuarios.appendChild(contenedorUsuarios);
        }
    }


    // =====================================
    // 9. ESCAPAR HTML
    // =====================================

    function escaparHTML(valor) {
        return String(valor ?? "").replace(/[&<>"']/g, caracter => ({
            "&": "&amp;",
            "<": "&lt;",
            ">": "&gt;",
            '"': "&quot;",
            "'": "&#039;"
        })[caracter]);
    }


    // =====================================
    // 10. CARGAR USUARIOS
    // =====================================

    async function cargarUsuarios() {

        contenedorUsuarios.innerHTML = "<p>Consultando usuarios...</p>";

        try {

            const respuesta = await fetch(`${API_ROLES}/usuarios`, {
                method: "GET",
                headers: {
                    "Authorization": `Bearer ${token}`,
                    "Content-Type": "application/json"
                }
            });

            const resultado = await respuesta.json();

            if (!respuesta.ok) {
                throw new Error(
                    resultado.error ||
                    resultado.mensaje ||
                    "No se pudieron consultar los usuarios."
                );
            }

            mostrarUsuarios(resultado.usuarios || []);

        } catch (error) {

            console.error("Error al consultar usuarios:", error);

            contenedorUsuarios.innerHTML = `
                <p style="color:#ef4444;">
                    ${escaparHTML(error.message)}
                </p>
                <button type="button" id="reintentarUsuarios">
                    Reintentar
                </button>
            `;

            document.getElementById("reintentarUsuarios")
                ?.addEventListener("click", cargarUsuarios);
        }
    }


    // =====================================
    // 11. MOSTRAR TABLA
    // =====================================

    function mostrarUsuarios(usuarios) {

        const filas = usuarios.length
            ? usuarios.map(u => {

                const id = Number(u.id);
                const rolActual = String(u.rol || "CLIENTE").toUpperCase();

                const activo =
                    Number(u.activo) === 1 &&
                    String(u.estado || "").toLowerCase() === "activo";

                return `
                    <tr>
                        <td>${escaparHTML(id)}</td>
                        <td>${escaparHTML(u.nombre_completo)}</td>
                        <td>${escaparHTML(u.nombre_usuario)}</td>
                        <td>${escaparHTML(u.email)}</td>

                        <td>
                            <select class="selector-rol" data-id="${id}">
                                <option value="ADMIN" ${rolActual === "ADMIN" ? "selected" : ""}>ADMIN</option>
                                <option value="VENDEDOR" ${rolActual === "VENDEDOR" ? "selected" : ""}>VENDEDOR</option>
                                <option value="CLIENTE" ${rolActual === "CLIENTE" ? "selected" : ""}>CLIENTE</option>
                            </select>
                        </td>

                        <td>${activo ? "Activo" : "Inactivo"}</td>

                        <td>
                            <button type="button" class="guardar-rol" data-id="${id}">
                                Guardar
                            </button>

                            ${!activo ? `
                                <button type="button" class="desbloquear-usuario" data-id="${id}">
                                    Desbloquear
                                </button>
                            ` : ""}
                        </td>
                    </tr>
                `;
            }).join("")
            : `<tr><td colspan="7">No hay usuarios registrados.</td></tr>`;

        contenedorUsuarios.innerHTML = `
            <div class="encabezado-usuarios">
                <h3>Usuarios registrados</h3>
                <button type="button" id="actualizarUsuarios">
                    Actualizar lista
                </button>
            </div>

            <p>Total de usuarios: <strong>${usuarios.length}</strong></p>

            <div style="overflow-x:auto;">
                <table class="tabla-usuarios">
                    <thead>
                        <tr>
                            <th>ID</th>
                            <th>Nombre completo</th>
                            <th>Usuario</th>
                            <th>Correo</th>
                            <th>Rol</th>
                            <th>Estado</th>
                            <th>Acciones</th>
                        </tr>
                    </thead>
                    <tbody>${filas}</tbody>
                </table>
            </div>
        `;

        document.getElementById("actualizarUsuarios")
            ?.addEventListener("click", cargarUsuarios);

        contenedorUsuarios.querySelectorAll(".guardar-rol")
            .forEach(boton => {
                boton.addEventListener("click", () => {
                    cambiarRol(boton.dataset.id);
                });
            });

        contenedorUsuarios.querySelectorAll(".desbloquear-usuario")
            .forEach(boton => {
                boton.addEventListener("click", () => {
                    desbloquearUsuario(boton.dataset.id);
                });
            });
    }


    // =====================================
    // 12. CAMBIAR ROL CON CONFIRMACIÓN
    // =====================================

    async function cambiarRol(id) {

        const selector = contenedorUsuarios.querySelector(
            `.selector-rol[data-id="${id}"]`
        );

        if (!selector) return;

        const nombre_rol = selector.value;

        const confirmar = await confirmarCubex({
            titulo: "Confirmar cambio de rol",
            mensaje: `¿Estás seguro de que deseas cambiar el rol de este usuario a ${nombre_rol}?`,
            textoConfirmar: "Sí, cambiar rol"
        });

        // Si cancela, no se envía ninguna petición al servidor.
        if (!confirmar) return;

        try {

            const respuesta = await fetch(
                `${API_ROLES}/usuarios/${id}/rol`,
                {
                    method: "PUT",
                    headers: {
                        "Authorization": `Bearer ${token}`,
                        "Content-Type": "application/json"
                    },
                    body: JSON.stringify({ nombre_rol })
                }
            );

            const resultado = await respuesta.json();

            if (!respuesta.ok) {
                throw new Error(
                    resultado.error ||
                    resultado.mensaje ||
                    "No se pudo actualizar el rol."
                );
            }

            notificarCubex(
                resultado.mensaje || "Rol actualizado correctamente."
            );

            await cargarUsuarios();

        } catch (error) {

            console.error("Error al cambiar rol:", error);
            notificarCubex(error.message, "error");
        }
    }


    // =====================================
    // 13. DESBLOQUEAR USUARIO CON CONFIRMACIÓN
    // =====================================

    async function desbloquearUsuario(id) {

        const confirmar = await confirmarCubex({
            titulo: "Desbloquear usuario",
            mensaje: "¿Deseas desbloquear esta cuenta de usuario?",
            textoConfirmar: "Sí, desbloquear"
        });

        if (!confirmar) return;

        try {

            const respuesta = await fetch(
                `${API_ROLES}/usuarios/${id}/desbloquear`,
                {
                    method: "POST",
                    headers: {
                        "Authorization": `Bearer ${token}`,
                        "Content-Type": "application/json"
                    }
                }
            );

            const resultado = await respuesta.json();

            if (!respuesta.ok) {
                throw new Error(
                    resultado.error ||
                    resultado.mensaje ||
                    "No se pudo desbloquear el usuario."
                );
            }

            notificarCubex(
                resultado.mensaje || "Usuario desbloqueado correctamente."
            );

            await cargarUsuarios();

        } catch (error) {

            console.error("Error al desbloquear usuario:", error);
            notificarCubex(error.message, "error");
        }
    }


    // =====================================
    // 14. INICIAR
    // =====================================

    cargarUsuarios();

});
