const API_LOGIN = CUBEX_CONFIG.API.LOGIN;

// ========================================
// ELEMENTOS DEL FORMULARIO
// ========================================

const formulario = document.getElementById("formulario-login");
const mensaje = document.getElementById("mensaje");
const boton = document.getElementById("btnLogin");

// ========================================
// INICIAR SESIÓN
// ========================================

if (formulario) {

    formulario.addEventListener("submit", async (event) => {

        event.preventDefault();

        mensaje.textContent = "";
        mensaje.style.color = "#ff8585";

        const nombreUsuario = document
            .getElementById("nombreUsuario")
            .value
            .trim();

        const password = document
            .getElementById("password")
            .value;

        // Validar campos
        if (!nombreUsuario || !password) {
            mensaje.textContent = "Ingresa tu usuario y contraseña.";
            return;
        }

        // Desactivar botón
        boton.disabled = true;
        boton.textContent = "Iniciando sesión...";

        try {

            // ========================================
            // ENVIAR CREDENCIALES
            // ========================================

            const respuesta = await fetch(
                `${API_LOGIN}/auth/login`,
                {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json"
                    },
                    body: JSON.stringify({
                        nombreUsuario: nombreUsuario,
                        contrasena: password
                    })
                }
            );

            const resultado = await respuesta.json();

            // ========================================
            // VALIDAR RESPUESTA
            // ========================================

            if (!respuesta.ok || !resultado.exito) {
                throw new Error(
                    resultado.mensaje ||
                    "Usuario o contraseña incorrectos."
                );
            }

            const datos = resultado.datos;

            if (!datos || !datos.token) {
                throw new Error(
                    "No se recibió el token de autenticación."
                );
            }

            // ========================================
            // OBTENER INFORMACIÓN DEL USUARIO
            // ========================================

            const usuarioSesion = {
                idUsuario: datos.idUsuario,

                nombreUsuario:
                    datos.nombreUsuario || nombreUsuario,

                nombreCompleto:
                    datos.nombreCompleto || "",

                email:
                    datos.email || "",

                rol:
                    datos.rol || "CLIENTE"
            };

            // ========================================
            // GUARDAR SESIÓN
            // ========================================

            sessionStorage.setItem(
                "cubex_token",
                datos.token
            );

            sessionStorage.setItem(
                "cubex_usuario",
                JSON.stringify(usuarioSesion)
            );

            // ========================================
            // REDIRECCIONAR SEGÚN EL TIPO DE USUARIO
            // ========================================

            const rol = String(usuarioSesion.rol)
                .trim()
                .toUpperCase();

            mensaje.style.color = "#4ade80";
            mensaje.textContent = "¡Inicio de sesión exitoso!";

            if (rol === "ADMIN" || rol === "ADMINISTRADOR") {

                // Administrador
                window.location.href = "admin.html";

            } else if (rol === "VENDEDOR") {

                // Empleado / vendedor
                window.location.href = "empleado.html";

            } else if (rol === "CLIENTE") {

                // Cliente
                window.location.href = "index.html";

            } else {

                throw new Error(
                    "No se reconoce el tipo de usuario: " + rol
                );

            }

        } catch (error) {

            console.error("Error al iniciar sesión:", error);

            mensaje.style.color = "#ff8585";
            mensaje.textContent =
                error.message || "No se pudo iniciar sesión.";

        } finally {

            boton.disabled = false;
            boton.textContent = "Iniciar sesión";

        }

    });

} else {
    console.error("No se encontró el formulario de inicio de sesión.");
}