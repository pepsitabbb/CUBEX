
const formulario = document.getElementById("formulario-registro");
const mensaje = document.getElementById("mensaje");
const boton = document.getElementById("btnRegistro");
const estadoVerificacion = document.getElementById("estado-verificacion");
const tokenInput = document.getElementById("tokenVerificacion");
const campoTrampa = document.getElementById("sitioWeb");

const API_LOGIN = CUBEX_CONFIG.API.LOGIN;
const API_BOTS = CUBEX_CONFIG.API.VERIFICACION_BOT;

let momentoToken = 0;

// Obtener token de verificación
async function obtenerToken() {
    estadoVerificacion.textContent = "Preparando verificación de seguridad...";

    const respuesta = await fetch(`${API_BOTS}/challenge`);
    const resultado = await respuesta.json();

    if (!respuesta.ok || !resultado.token) {
        throw new Error("No se pudo preparar la verificación de seguridad.");
    }

    tokenInput.value = resultado.token;
    momentoToken = Date.now();

    estadoVerificacion.textContent =
        "✓ Verificación de seguridad preparada.";

    boton.disabled = false;
}

// Esperar el tiempo mínimo requerido por el servidor
function esperar(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// Comprobar que el usuario no sea un bot
async function verificarUsuario() {
    if (!tokenInput.value || !momentoToken) {
        throw new Error("No hay un token de seguridad disponible.");
    }

    // Si el token está próximo a expirar, solicitar uno nuevo
    if (Date.now() - momentoToken > 4 * 60 * 1000) {
        await obtenerToken();
    }

    // El servidor exige al menos 1500 ms
    const transcurrido = Date.now() - momentoToken;

    if (transcurrido < 1500) {
        await esperar(1500 - transcurrido);
    }

    const respuesta = await fetch(`${API_BOTS}/check`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json"
        },
        body: JSON.stringify({
            token: tokenInput.value,
            honeypot: campoTrampa.value
        })
    });

    const resultado = await respuesta.json();

    if (!respuesta.ok || resultado.verificado !== true) {
        // Preparar un nuevo token para otro intento
        tokenInput.value = "";
        momentoToken = 0;

        await obtenerToken();

        throw new Error(
            resultado.mensaje || "No se pudo verificar que eres una persona."
        );
    }

    estadoVerificacion.textContent =
        "✓ Usuario verificado correctamente.";

    return true;
}

// Preparar verificación al abrir la página
boton.disabled = true;

obtenerToken().catch(error => {
    console.error("Error de verificación:", error);

    estadoVerificacion.textContent =
        "No se pudo conectar con el servicio de seguridad.";

    mensaje.textContent =
        "Comprueba que el microservicio de verificación esté activo.";
});

// Registro de usuario
formulario.addEventListener("submit", async (evento) => {
    evento.preventDefault();

    const nombreUsuario =
        document.getElementById("nombreUsuario").value.trim();

    const nombreCompleto =
        document.getElementById("nombre").value.trim();

    const email =
        document.getElementById("correo").value.trim();

    const contrasena =
        document.getElementById("contrasena").value;

    const confirmar =
        document.getElementById("confirmar").value;

    if (contrasena.length < 8) {
        mensaje.textContent =
            "La contraseña debe tener al menos 8 caracteres.";
        return;
    }

    if (contrasena !== confirmar) {
        mensaje.textContent = "Las contraseñas no coinciden.";
        return;
    }

    boton.disabled = true;

    try {
        // PRIMERA VALIDACIÓN: detectar bots
        mensaje.textContent = "Verificando seguridad...";

        await verificarUsuario();

        // SEGUNDA VALIDACIÓN: registrar la cuenta
        mensaje.textContent = "Usuario verificado. Registrando cuenta...";

        const respuesta = await fetch(
            `${API_LOGIN}/auth/registro`,
            {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    nombreUsuario,
                    contrasena,
                    email,
                    nombreCompleto
                })
            }
        );

        const resultado = await respuesta.json();

        if (!respuesta.ok) {
            throw new Error(
                resultado.mensaje || "No se pudo crear la cuenta."
            );
        }

        const usuario = resultado.datos;

        if (usuario?.token) {
            sessionStorage.setItem("cubex_token", usuario.token);

            sessionStorage.setItem(
                "cubex_usuario",
                JSON.stringify({
                    idUsuario: usuario.idUsuario,
                    nombreUsuario: usuario.nombreUsuario,
                    nombreCompleto: usuario.nombreCompleto,
                    email: usuario.email,
                    rol: usuario.rol
                })
            );

            mensaje.textContent =
                "¡Cuenta creada! Entrando a CUBEX...";

            setTimeout(() => {
                window.location.href = "index.html";
            }, 1000);

        } else {
            mensaje.textContent =
                "Cuenta creada correctamente. Ahora puedes iniciar sesión.";

            formulario.reset();

            tokenInput.value = "";
            momentoToken = 0;

            await obtenerToken();
        }

    } catch (error) {
        console.error("Error al registrar:", error);

        mensaje.textContent =
            error.message === "Failed to fetch"
                ? "No se pudo conectar con uno de los servicios. Comprueba que ambos estén activos."
                : error.message;

    } finally {
        boton.disabled = !tokenInput.value;
    }
});
