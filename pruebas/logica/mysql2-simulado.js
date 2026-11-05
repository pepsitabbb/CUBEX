/* Simulación mínima de mysql2/promise sobre node:sqlite para pruebas de
   lógica. Las transacciones se serializan con un candado global, lo que
   equivale (de forma más estricta) a los bloqueos FOR UPDATE de InnoDB. */

const { DatabaseSync } = require('node:sqlite');

class Candado {
    constructor() { this.cola = Promise.resolve(); }
    tomar() {
        let liberar;
        const espera = new Promise(r => { liberar = r; });
        const anterior = this.cola;
        this.cola = anterior.then(() => espera);
        return anterior.then(() => liberar);
    }
}

function traducir(sql, params = []) {
    let texto = String(sql);
    const valores = [];
    let i = 0;

    texto = texto.replace(/\?/g, () => {
        const v = params[i++];
        if (Array.isArray(v)) {
            valores.push(...v);
            return v.map(() => '?').join(', ');
        }
        valores.push(v === undefined ? null : v);
        return '?';
    });

    texto = texto
        .replace(/FOR UPDATE/gi, '')
        .replace(/NOW\(\)\s*-\s*INTERVAL\s+(\d+)\s+MINUTE/gi, "datetime('now','localtime','-$1 minutes')")
        .replace(/NOW\(\)/gi, "datetime('now','localtime')")
        .replace(/ON DUPLICATE KEY UPDATE/gi, 'ON CONFLICT DO UPDATE SET')
        .replace(/VALUES\((\w+)\)/g, 'excluded.$1')
        .replace(/CAST\(([^)]+?) AS CHAR\)/gi, 'CAST($1 AS TEXT)');

    return { texto, valores: valores.map(v => (typeof v === 'boolean' ? Number(v) : v)) };
}

function convertirError(error) {
    const mensaje = String(error.message || '');
    if (/UNIQUE constraint failed/i.test(mensaje)) {
        error.code = 'ER_DUP_ENTRY';
        error.errno = 1062;
    } else if (/CHECK constraint failed/i.test(mensaje)) {
        error.code = 'ER_CHECK_CONSTRAINT_VIOLATED';
        error.errno = 3819;
    }
    return error;
}

function crear(db) {
    const candado = new Candado();
    const contador = { consultas: 0 };

    function ejecutar(sql, params) {
        contador.consultas++;
        const { texto, valores } = traducir(sql, params);
        const limpio = texto.trim().toUpperCase();
        try {
            const sentencia = db.prepare(texto);
            if (limpio.startsWith('SELECT') || limpio.startsWith('WITH')) {
                return [sentencia.all(...valores).map(f => ({ ...f })), []];
            }
            const r = sentencia.run(...valores);
            return [{ insertId: Number(r.lastInsertRowid), affectedRows: Number(r.changes) }, []];
        } catch (error) {
            throw convertirError(error);
        }
    }

    function conexion() {
        let liberar = null;
        return {
            async query(sql, params) { await Promise.resolve(); return ejecutar(sql, params); },
            async execute(sql, params) { await Promise.resolve(); return ejecutar(sql, params); },
            async beginTransaction() { liberar = await candado.tomar(); db.exec('BEGIN'); },
            async commit() { db.exec('COMMIT'); if (liberar) { liberar(); liberar = null; } },
            async rollback() { try { db.exec('ROLLBACK'); } catch {} if (liberar) { liberar(); liberar = null; } },
            release() { if (liberar) { try { db.exec('ROLLBACK'); } catch {} liberar(); liberar = null; } }
        };
    }

    return {
        contador,
        async query(sql, params) {
            // Una consulta suelta espera a que no haya transacción abierta.
            const liberar = await candado.tomar();
            try { return ejecutar(sql, params); } finally { liberar(); }
        },
        async execute(sql, params) { return this.query(sql, params); },
        async getConnection() { return conexion(); }
    };
}

module.exports = { crear, traducir };
