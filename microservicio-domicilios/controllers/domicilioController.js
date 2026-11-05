import db from "../config/db.js";

// Obtener el ID del cliente asociado al usuario que inició sesión
async function obtenerIdCliente(idUsuario) {
    const [resultado] = await db.query(
        "SELECT id FROM clientes WHERE id_usuario = ?",
        [Number(idUsuario)]
    );

    if (resultado.length === 0) {
        return null;
    }

    return resultado[0].id;
}

// GET: Obtener todos los domicilios del usuario
export async function obtenerDomicilios(req, res) {
    try {
        const idCliente = await obtenerIdCliente(req.usuario.sub);

        if (!idCliente) {
            return res.status(404).json({
                mensaje: "No se encontró un cliente asociado a este usuario."
            });
        }

        const [domicilios] = await db.query(
            `SELECT id, calle_numero, colonia, ciudad,
                    codigo_postal, referencias
             FROM direcciones
             WHERE id_cliente = ?
             ORDER BY id DESC`,
            [idCliente]
        );

        return res.json(domicilios);

    } catch (error) {
        console.error("Error al obtener domicilios:", error);

        return res.status(500).json({
            mensaje: "Error al consultar los domicilios."
        });
    }
}

// POST: Registrar un domicilio
export async function registrarDomicilio(req, res) {
    try {
        const {
            calle,
            numero_casa,
            colonia,
            ciudad,
            codigo_postal,
            referencias
        } = req.body;

        if (
            !calle?.trim() ||
            !numero_casa?.trim() ||
            !colonia?.trim() ||
            !ciudad?.trim() ||
            !codigo_postal?.trim()
        ) {
            return res.status(400).json({
                mensaje: "Completa todos los campos obligatorios."
            });
        }

        const idCliente = await obtenerIdCliente(req.usuario.sub);

        if (!idCliente) {
            return res.status(404).json({
                mensaje: "No se encontró un cliente asociado a este usuario."
            });
        }

        const calleNumero = `${calle.trim()} ${numero_casa.trim()}`;

        const [resultado] = await db.query(
            `INSERT INTO direcciones
            (id_cliente, calle_numero, colonia, ciudad,
             codigo_postal, referencias)
            VALUES (?, ?, ?, ?, ?, ?)`,
            [
                idCliente,
                calleNumero,
                colonia.trim(),
                ciudad.trim(),
                codigo_postal.trim(),
                referencias?.trim() || null
            ]
        );

        return res.status(201).json({
            mensaje: "Domicilio registrado correctamente.",
            id: resultado.insertId
        });

    } catch (error) {
        console.error("Error al registrar domicilio:", error);

        return res.status(500).json({
            mensaje: "Error al registrar el domicilio."
        });
    }
}

// PUT: Actualizar un domicilio
export async function actualizarDomicilio(req, res) {
    try {
        const { id } = req.params;

        const {
            calle,
            numero_casa,
            colonia,
            ciudad,
            codigo_postal,
            referencias
        } = req.body;

        if (
            !calle?.trim() ||
            !numero_casa?.trim() ||
            !colonia?.trim() ||
            !ciudad?.trim() ||
            !codigo_postal?.trim()
        ) {
            return res.status(400).json({
                mensaje: "Completa todos los campos obligatorios."
            });
        }

        const idCliente = await obtenerIdCliente(req.usuario.sub);

        if (!idCliente) {
            return res.status(404).json({
                mensaje: "No se encontró un cliente asociado a este usuario."
            });
        }

        const calleNumero = `${calle.trim()} ${numero_casa.trim()}`;

        const [resultado] = await db.query(
            `UPDATE direcciones
             SET calle_numero = ?,
                 colonia = ?,
                 ciudad = ?,
                 codigo_postal = ?,
                 referencias = ?
             WHERE id = ? AND id_cliente = ?`,
            [
                calleNumero,
                colonia.trim(),
                ciudad.trim(),
                codigo_postal.trim(),
                referencias?.trim() || null,
                id,
                idCliente
            ]
        );

        if (resultado.affectedRows === 0) {
            return res.status(404).json({
                mensaje: "Domicilio no encontrado."
            });
        }

        return res.json({
            mensaje: "Domicilio actualizado correctamente."
        });

    } catch (error) {
        console.error("Error al actualizar domicilio:", error);

        return res.status(500).json({
            mensaje: "Error al actualizar el domicilio."
        });
    }
}

// DELETE: Eliminar un domicilio
export async function eliminarDomicilio(req, res) {
    try {
        const { id } = req.params;

        const idCliente = await obtenerIdCliente(req.usuario.sub);

        if (!idCliente) {
            return res.status(404).json({
                mensaje: "No se encontró un cliente asociado a este usuario."
            });
        }

        const [resultado] = await db.query(
            `DELETE FROM direcciones
             WHERE id = ? AND id_cliente = ?`,
            [id, idCliente]
        );

        if (resultado.affectedRows === 0) {
            return res.status(404).json({
                mensaje: "Domicilio no encontrado."
            });
        }

        return res.json({
            mensaje: "Domicilio eliminado correctamente."
        });

    } catch (error) {
        console.error("Error al eliminar domicilio:", error);

        return res.status(500).json({
            mensaje: "Error al eliminar el domicilio. Puede estar asociado a un pedido o envío."
        });
    }
}