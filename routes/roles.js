const express = require('express');
const { pool } = require('../config/database');

const router = express.Router();

// =============================================
// OBTENER TODOS LOS ROLES
// =============================================
router.get('/', async (req, res) => {
    let connection;
    try {
        console.log('👥 Obteniendo roles...');
        
        connection = await pool.getConnection();
        
        const [rows] = await connection.execute(`
            SELECT rol as id, rol, descripcion 
            FROM rol 
            ORDER BY rol
        `);
        
        console.log('✅ Roles obtenidos:', rows.length);
        res.json(rows);
    } catch (error) {
        console.error('💥 Error obteniendo roles:', error);
        res.status(500).json({ error: 'Error obteniendo roles' });
    } finally {
        if (connection) connection.release();
    }
});

module.exports = router;