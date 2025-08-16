const express = require('express');
const { pool } = require('../config/database');

const router = express.Router();

// =============================================
// OBTENER MENSAJES RECIENTES - VERSIÓN SIMPLE Y ROBUSTA
// =============================================
router.get('/recientes', async (req, res) => {
    let connection;
    try {
        const hours = Math.min(parseInt(req.query.hours) || 24, 168); // Máximo 7 días
        const limit = Math.min(parseInt(req.query.limit) || 500, 2000); // Máximo 2000
        
        console.log(`📈 Obteniendo mensajes recientes (últimas ${hours}h, límite ${limit})...`);
        
        connection = await pool.getConnection();
        
        // ✅ CONSULTA SIMPLE Y DIRECTA
        const query = `
            SELECT 
                id, 
                nodo_id, 
                topico, 
                payload, 
                fecha
            FROM nodo_mensaje 
            WHERE fecha >= DATE_SUB(NOW(), INTERVAL ? HOUR)
            ORDER BY fecha DESC
            LIMIT ?
        `;
        
        console.log('🔍 Ejecutando consulta...');
        const [rows] = await connection.execute(query, [hours, limit]);
        console.log(`✅ Registros obtenidos: ${rows.length}`);
        
        // ✅ PROCESAMIENTO SIMPLE DE DATOS
        const mensajes = rows.map((mensaje, index) => {
            let datosExtraidos = {
                temperatura: null,
                humedad: null,
                peso: null,
                latitud: null,
                longitud: null
            };
            
            // Parsear JSON del payload de forma segura
            try {
                if (mensaje.payload) {
                    let payloadObj;
                    
                    if (typeof mensaje.payload === 'string') {
                        payloadObj = JSON.parse(mensaje.payload);
                    } else {
                        payloadObj = mensaje.payload;
                    }
                    
                    // Extraer datos según tu estructura real
                    datosExtraidos = {
                        temperatura: payloadObj.temperatura ? parseFloat(payloadObj.temperatura) : null,
                        humedad: payloadObj.humedad ? parseFloat(payloadObj.humedad) : null,
                        peso: payloadObj.peso ? parseFloat(payloadObj.peso) : null,
                        latitud: payloadObj.latitud ? parseFloat(payloadObj.latitud) : null,
                        longitud: payloadObj.longitud ? parseFloat(payloadObj.longitud) : null
                    };
                }
            } catch (parseError) {
                console.warn(`⚠️ Error parsing mensaje ${mensaje.id}:`, parseError.message);
                // Continuar con valores null si hay error de parsing
            }
            
            return {
                id: mensaje.id,
                nodo_id: mensaje.nodo_id,
                topico: mensaje.topico,
                payload: mensaje.payload,
                fecha: mensaje.fecha,
                fecha_recepcion: mensaje.fecha, // Alias para compatibilidad
                // Datos extraídos
                ...datosExtraidos
            };
        });
        
        console.log(`📊 Mensajes procesados exitosamente: ${mensajes.length}`);
        
        // ✅ RESPUESTA SIMPLE
        res.json({
            data: mensajes,
            total: mensajes.length,
            hours: hours,
            limit: limit,
            message: mensajes.length > 0 ? 'Datos obtenidos correctamente' : `Sin mensajes en las últimas ${hours} horas`,
            timestamp: new Date().toISOString()
        });
        
    } catch (error) {
        console.error('💥 ERROR en /api/mensajes/recientes:');
        console.error('💥 Mensaje:', error.message);
        console.error('💥 Código:', error.code);
        console.error('💥 SQL State:', error.sqlState);
        console.error('💥 Stack:', error.stack);
        
        // Respuesta de error clara
        res.status(500).json({ 
            error: 'Error obteniendo mensajes recientes',
            details: error.message,
            code: error.code || 'UNKNOWN_ERROR',
            timestamp: new Date().toISOString(),
            endpoint: '/api/mensajes/recientes'
        });
    } finally {
        if (connection) {
            connection.release();
        }
    }
});

// =============================================
// ENDPOINT DE PRUEBA SIMPLE
// =============================================
router.get('/test', async (req, res) => {
    let connection;
    try {
        console.log('🧪 Test simple de conexión y datos...');
        
        connection = await pool.getConnection();
        
        // Test 1: Conexión básica
        const [testConnection] = await connection.execute('SELECT NOW() as current_time, DATABASE() as db_name');
        
        // Test 2: Verificar tabla
        const [tableExists] = await connection.execute(`
            SELECT COUNT(*) as count 
            FROM information_schema.tables 
            WHERE table_schema = DATABASE() 
            AND table_name = 'nodo_mensaje'
        `);
        
        // Test 3: Contar registros totales
        let totalCount = 0;
        let recentCount = 0;
        let sampleData = null;
        
        if (tableExists[0].count > 0) {
            const [total] = await connection.execute('SELECT COUNT(*) as count FROM nodo_mensaje');
            totalCount = total[0].count;
            
            const [recent] = await connection.execute(`
                SELECT COUNT(*) as count FROM nodo_mensaje 
                WHERE fecha >= DATE_SUB(NOW(), INTERVAL 24 HOUR)
            `);
            recentCount = recent[0].count;
            
            // Muestra de datos
            const [sample] = await connection.execute(`
                SELECT id, nodo_id, topico, 
                       LEFT(payload, 100) as payload_preview, 
                       fecha
                FROM nodo_mensaje 
                ORDER BY fecha DESC 
                LIMIT 3
            `);
            sampleData = sample;
        }
        
        res.json({
            success: true,
            timestamp: testConnection[0].current_time,
            database: testConnection[0].db_name,
            table_exists: tableExists[0].count > 0,
            total_messages: totalCount,
            recent_messages_24h: recentCount,
            sample_data: sampleData,
            message: 'Test completado exitosamente'
        });
        
    } catch (error) {
        console.error('💥 Error en test:', error);
        res.status(500).json({
            success: false,
            error: error.message,
            code: error.code,
            timestamp: new Date().toISOString()
        });
    } finally {
        if (connection) connection.release();
    }
});

// =============================================
// ENDPOINT PARA OBTENER ÚLTIMOS DATOS DE NODOS ESPECÍFICOS
// =============================================
router.get('/nodos-especificos', async (req, res) => {
    let connection;
    try {
        console.log('🎯 Obteniendo datos de nodos específicos...');
        
        connection = await pool.getConnection();
        
        // Los nodos que mencionaste anteriormente
        const nodoInterno = 'NODO-BEF8C985-0FF3-4874-935B-40AA8A235FF7';
        const nodoExterno = 'NODO-B5B3ABC4-E0CE-4662-ACB3-7A631C12394A';
        
        const [datosNodos] = await connection.execute(`
            SELECT 
                nodo_id,
                COUNT(*) as total_mensajes,
                MAX(fecha) as ultimo_mensaje,
                MIN(fecha) as primer_mensaje
            FROM nodo_mensaje 
            WHERE nodo_id IN (?, ?)
            GROUP BY nodo_id
        `, [nodoInterno, nodoExterno]);
        
        // Obtener últimos 5 mensajes de cada nodo
        const [ultimosInterno] = await connection.execute(`
            SELECT id, nodo_id, payload, fecha
            FROM nodo_mensaje 
            WHERE nodo_id = ?
            ORDER BY fecha DESC 
            LIMIT 5
        `, [nodoInterno]);
        
        const [ultimosExterno] = await connection.execute(`
            SELECT id, nodo_id, payload, fecha
            FROM nodo_mensaje 
            WHERE nodo_id = ?
            ORDER BY fecha DESC 
            LIMIT 5
        `, [nodoExterno]);
        
        res.json({
            nodos_consultados: [nodoInterno, nodoExterno],
            resumen: datosNodos,
            ultimos_datos: {
                interno: ultimosInterno,
                externo: ultimosExterno
            },
            timestamp: new Date().toISOString()
        });
        
    } catch (error) {
        console.error('💥 Error obteniendo nodos específicos:', error);
        res.status(500).json({
            error: 'Error obteniendo datos de nodos específicos',
            details: error.message,
            timestamp: new Date().toISOString()
        });
    } finally {
        if (connection) connection.release();
    }
});

// =============================================
// ENDPOINT SIMPLE PARA DATOS RECIENTES SIN FILTROS
// =============================================
router.get('/simple', async (req, res) => {
    let connection;
    try {
        console.log('📊 Endpoint simple para datos recientes...');
        
        connection = await pool.getConnection();
        
        const [rows] = await connection.execute(`
            SELECT id, nodo_id, topico, payload, fecha
            FROM nodo_mensaje 
            ORDER BY fecha DESC 
            LIMIT 100
        `);
        
        console.log(`✅ Datos obtenidos (simple): ${rows.length}`);
        
        res.json({
            data: rows,
            total: rows.length,
            message: 'Datos obtenidos con endpoint simple',
            timestamp: new Date().toISOString()
        });
        
    } catch (error) {
        console.error('💥 Error en endpoint simple:', error);
        res.status(500).json({
            error: 'Error en endpoint simple',
            details: error.message,
            timestamp: new Date().toISOString()
        });
    } finally {
        if (connection) connection.release();
    }
});

module.exports = router;