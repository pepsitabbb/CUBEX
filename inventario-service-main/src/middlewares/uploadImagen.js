
const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Crear carpeta uploads si todavía no existe
const carpetaUploads = path.join(__dirname, '../../uploads');

if (!fs.existsSync(carpetaUploads)) {
    fs.mkdirSync(carpetaUploads, { recursive: true });
}

// Configuración para guardar las imágenes
const almacenamiento = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, carpetaUploads);
    },

    filename: (req, file, cb) => {
        const extension = path.extname(file.originalname).toLowerCase();
        const nombre = `producto-${Date.now()}-${Math.round(Math.random() * 1E9)}${extension}`;

        cb(null, nombre);
    }
});

// Aceptar únicamente imágenes
const filtroImagen = (req, file, cb) => {
    const tiposPermitidos = [
        'image/jpeg',
        'image/png',
        'image/webp'
    ];

    if (tiposPermitidos.includes(file.mimetype)) {
        cb(null, true);
    } else {
        cb(new Error('Solo se permiten imágenes JPG, PNG o WEBP.'));
    }
};

const uploadImagen = multer({
    storage: almacenamiento,
    fileFilter: filtroImagen,
    limits: {
        fileSize: 5 * 1024 * 1024
    }
});

module.exports = uploadImagen;

