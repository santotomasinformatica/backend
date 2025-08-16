    const express = require('express');
const { pool } = require('../config/database');

const router = express.Router();

// =============================================
// OBTENER TODAS LAS ESTACIONES
// =============================================
router.get('/', async (req, res) => {
    let connection;
    try {
        console.log('🌡️ Obteniendo estaciones...');
        
        connection = await pool.getConnection();
        
        const [estaciones] = await connection.execute(`
            SELECT e.id, e.descripcion, e.latitud, e.longitud, e.dueno,
                u.nombre as dueno_nombre, u.apellido as dueno_apellido, u.comuna as dueno_comuna
            FROM estacion e
            LEFT JOIN usuario u ON e.dueno = u.id
            ORDER BY e.id ASC
        `);
        
        res.json(estaciones);
        
    } catch (error) {
        console.error('💥 Error obteniendo estaciones:', error);
        res.status(500).json({ 
            error: 'Error obteniendo estaciones',
            details: error.message 
        });
    } finally {
        if (connection) connection.release();
    }
});

// =============================================
// CREAR NUEVA ESTACIÓN
// =============================================
router.post('/', async (req, res) => {
    let connection;
    try {
        const { descripcion, latitud, longitud, dueno } = req.body;
        
        if (!descripcion || !latitud || !longitud || !dueno) {
            return res.status(400).json({ 
                error: 'Descripción, latitud, longitud y dueño son obligatorios' 
            });
        }
        
        connection = await pool.getConnection();
        
        const estacionId = `EST-${Date.now()}`;
        
        await connection.execute(`
            INSERT INTO estacion (id, descripcion, latitud, longitud, dueno) 
            VALUES (?, ?, ?, ?, ?)
        `, [estacionId, descripcion.trim(), parseFloat(latitud), parseFloat(longitud), dueno]);
        
        res.status(201).json({
            id: estacionId,
            message: 'Estación creada exitosamente'
        });
        
    } catch (error) {
        console.error('💥 Error creando estación:', error);
        res.status(500).json({ 
            error: 'Error creando estación',
            details: error.message 
        });
    } finally {
        if (connection) connection.release();
    }
});

module.exports = router;