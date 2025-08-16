const express = require('express');
const { pool } = require('../config/database');

const router = express.Router();

// =============================================
// OBTENER TODOS LOS TIPOS DE NODOS
// =============================================
router.get('/', async (req, res) => {
    let connection;
    try {
        console.log('🔧 Obteniendo tipos de nodos...');
        
        connection = await pool.getConnection();
        
        const [rows] = await connection.execute(`
            SELECT tipo as id, tipo, descripcion 
            FROM nodo_tipo 
            ORDER BY tipo ASC
        `);
        
        console.log('✅ Tipos de nodos obtenidos:', rows.length);
        res.json(rows);
        
    } catch (error) {
        console.error('💥 Error obteniendo tipos de nodos:', error);
        res.status(500).json({ error: 'Error obteniendo tipos de nodos' });
    } finally {
        if (connection) connection.release();
    }
});

module.exports = router;