const express = require('express');
const cors = require('cors');

const resenasRoutes = require('./routes/resenas.routes');

const app = express();

app.use(cors());
app.use(express.json());

app.get('/', (req, res) => {
    res.json({
        servicio: 'Comentarios y Reseñas',
        estado: 'activo'
    });
});

app.use('/api/resenas', resenasRoutes);

const PORT = 3007;

app.listen(PORT, () => {
    console.log(`🚀 Microservicio ejecutándose en http://localhost:${PORT}`);
});