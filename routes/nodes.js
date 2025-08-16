const express = require('express');
const { pool } = require('../config/database');

const router = express.Router();

// =============================================
// OBTENER TODOS LOS NODOS
// =============================================
router.get('/', async (req, res) => {
    let connection;
    try {
        console.log('🔌 Obteniendo nodos...');
        
        connection = await pool.getConnection();
        
        const [rows] = await connection.execute(`
            SELECT n.id, n.descripcion, n.tipo,
                nt.descripcion as tipo_descripcion
            FROM nodo n
            LEFT JOIN nodo_tipo nt ON n.tipo = nt.tipo
            ORDER BY n.id ASC
        `);
        
        // Formatear para frontend
        const nodos = rows.map(nodo => ({
            id: nodo.id,
            identificador: nodo.id,
            descripcion: nodo.descripcion,
            tipo: nodo.tipo_descripcion || nodo.tipo,
            fecha_instalacion: new Date().toISOString(),
            activo: true
        }));
        
        console.log('✅ Nodos obtenidos:', nodos.length);
        res.json(nodos);
        
    } catch (error) {
        console.error('💥 Error obteniendo nodos:', error);
        res.status(500).json({ error: 'Error obteniendo nodos' });
    } finally {
        if (connection) connection.release();
    }
});

// =============================================
// OBTENER NODOS INTERIORES DISPONIBLES
// =============================================
router.get('/interiores/disponibles', async (req, res) => {
    let connection;
    try {
        console.log('🔌 Obteniendo nodos interiores disponibles...');
        
        connection = await pool.getConnection();
        
        const [rows] = await connection.execute(`
            SELECT n.id, n.descripcion, n.tipo,
                nt.descripcion as tipo_descripcion
            FROM nodo n
            LEFT JOIN nodo_tipo nt ON n.tipo = nt.tipo
            LEFT JOIN nodo_colmena nc ON n.id = nc.nodo_id
            WHERE nc.nodo_id IS NULL
            ORDER BY n.id ASC
        `);
        
        console.log('✅ Nodos interiores disponibles:', rows.length);
        res.json(rows);
        
    } catch (error) {
        console.error('💥 Error obteniendo nodos interiores disponibles:', error);
        res.status(500).json({ 
            error: 'Error obteniendo nodos interiores disponibles',
            details: error.message 
        });
    } finally {
        if (connection) connection.release();
    }
});

// =============================================
// OBTENER NODOS EXTERIORES DISPONIBLES
// =============================================
router.get('/exteriores/disponibles', async (req, res) => {
    let connection;
    try {
        console.log('🌡️ Obteniendo nodos exteriores disponibles...');
        
        connection = await pool.getConnection();
        
        const [rows] = await connection.execute(`
            SELECT n.id, n.descripcion, n.tipo,
                nt.descripcion as tipo_descripcion
            FROM nodo n
            LEFT JOIN nodo_tipo nt ON n.tipo = nt.tipo
            LEFT JOIN nodo_estacion ne ON n.id = ne.nodo_id
            WHERE ne.nodo_id IS NULL
            ORDER BY n.id ASC
        `);
        
        console.log('✅ Nodos exteriores disponibles:', rows.length);
        res.json(rows);
        
    } catch (error) {
        console.error('💥 Error obteniendo nodos exteriores disponibles:', error);
        res.status(500).json({ 
            error: 'Error obteniendo nodos exteriores disponibles',
            details: error.message 
        });
    } finally {
        if (connection) connection.release();
    }
});

module.exports = router;