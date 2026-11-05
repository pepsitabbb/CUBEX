const pool = require('./database');

async function probarConexion() {
    try {
        const [resultado] = await pool.query('SELECT 1');

        console.log('✅ Conexión a MySQL exitosa');
        console.log(resultado);

    } catch (error) {

        console.error('❌ Error al conectar con MySQL');
        console.error(error.message);

    } finally {

        await pool.end();

    }
}

probarConexion();