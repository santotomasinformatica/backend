const express = require('express');
const { pool } = require('../config/database');

const router = express.Router();

// =============================================
// OBTENER MENSAJES RECIENTES
// =============================================
router.get('/recientes', async (req, res) => {
    let connection;
    try {
        const hours = parseInt(req.query.hours) || 24;
        const limit = parseInt(req.query.limit) || 500;
        
        console.log(`📈 Obteniendo datos recientes (últimas ${hours}h, límite ${limit})...`);
        
        connection = await pool.getConnection();
        
        const query = `
            SELECT nm.id, nm.nodo_id, nm.topico, nm.payload, nm.fecha
            FROM nodo_mensaje nm
            WHERE nm.fecha >= DATE_SUB(NOW(), INTERVAL ? HOUR)
            ORDER BY nm.fecha ASC
            LIMIT ?
        `;
        
        const [rows] = await connection.execute(query, [hours, limit]);
        console.log('✅ Mensajes obtenidos de BD:', rows.length);
        
        const mensajes = rows.map(mensaje => {
            let parsedPayload = {};
            
            try {
                parsedPayload = JSON.parse(mensaje.payload);
            } catch (parseError) {
                console.warn('⚠️ Error parsing payload JSON:', parseError.message);
                parsedPayload = { 
                    error: 'Invalid JSON',
                    raw: mensaje.payload 
                };
            }
            
            return {
                id: mensaje.id,
                nodo_id: mensaje.nodo_id,
                topico: mensaje.topico,
                payload: mensaje.payload,
                fecha: mensaje.fecha,
                temperatura: parsedPayload.temperatura || null,
                humedad: parsedPayload.humedad || null,
                peso: parsedPayload.peso || null,
                latitud: parsedPayload.latitud || null,
                longitud: parsedPayload.longitud || null
            };
        });
        
        console.log('📊 Mensajes procesados para frontend:', mensajes.length);
        res.json(mensajes);
        
    } catch (error) {
        console.error('💥 Error en /api/nodo-mensajes/recientes:', error);
        res.status(500).json({ 
            error: 'Error obteniendo datos recientes',
            details: error.message,
            code: error.code || 'UNKNOWN'
        });
    } finally {
        if (connection) connection.release();
    }
});

// =============================================
// OBTENER MENSAJES SIMPLES (RESPALDO)
// =============================================
router.get('/simple', async (req, res) => {
    let connection;
    try {
        console.log('📊 Obteniendo mensajes (versión simple)...');
        
        connection = await pool.getConnection();
        
        const [rows] = await connection.execute(`
            SELECT id, nodo_id, topico, payload, fecha
            FROM nodo_mensaje 
            ORDER BY fecha DESC 
            LIMIT 100
        `);
        
        const mensajes = rows.map(mensaje => ({
            id: mensaje.id,
            nodo_id: mensaje.nodo_id,
            topico: mensaje.topico,
            payload: mensaje.payload,
            fecha: mensaje.fecha
        }));
        
        console.log('✅ Mensajes obtenidos (simple):', mensajes.length);        
        res.json(mensajes);
        
    } catch (error) {
        console.error('💥 Error en endpoint simple:', error);
        res.status(500).json({ 
            error: 'Error obteniendo mensajes simple',
            details: error.message 
        });
    } finally {
        if (connection) connection.release();
    }
});

// =============================================
// CREAR MENSAJE DE PRUEBA
// =============================================
router.post('/test-message', async (req, res) => {
    let connection;
    try {
        console.log('🧪 Creando mensaje de prueba...');
        
        connection = await pool.getConnection();
        
        // Verificar que existe al menos un nodo
        const [existingNodes] = await connection.execute('SELECT id FROM nodo LIMIT 1');
        
        let testNodoId;
        if (existingNodes.length > 0) {
            testNodoId = existingNodes[0].id;
        } else {
            // Crear un nodo de prueba si no existe ninguno
            testNodoId = `NODO-TEST-${Date.now()}`;
            
            // Verificar que existe al menos un tipo de nodo
            const [existingTypes] = await connection.execute('SELECT tipo FROM nodo_tipo LIMIT 1');
            
            let nodoTipo = 'SENSOR';
            if (existingTypes.length > 0) {
                nodoTipo = existingTypes[0].tipo;
            } else {
                // Crear tipo de nodo si no existe
                await connection.execute(
                    'INSERT IGNORE INTO nodo_tipo (tipo, descripcion) VALUES (?, ?)',
                    ['SENSOR', 'Sensor genérico de pruebas']
                );
            }
            
            // Crear el nodo de prueba
            await connection.execute(
                'INSERT IGNORE INTO nodo (id, descripcion, tipo) VALUES (?, ?, ?)',
                [testNodoId, 'Nodo de pruebas automático', nodoTipo]
            );
        }
        
        const testTopico = `SmartBee/nodes/${testNodoId}/data`;
        const testPayload = {
            nodo_id: testNodoId,
            temperatura: (15 + Math.random() * 20).toFixed(1),
            humedad: (40 + Math.random() * 40).toFixed(1),
            peso: (-1 + Math.random() * 3).toFixed(2),
            latitud: (-36.6009157 + (Math.random() - 0.5) * 0.01).toFixed(7),
            longitud: (-72.1064020 + (Math.random() - 0.5) * 0.01).toFixed(7)
        };
        
        const payloadJson = JSON.stringify(testPayload);
        
        const [result] = await connection.execute(`
            INSERT INTO nodo_mensaje (nodo_id, topico, payload) 
            VALUES (?, ?, ?)
        `, [testNodoId, testTopico, payloadJson]);
        
        console.log('✅ Mensaje de prueba creado con ID:', result.insertId);
        
        res.json({
            success: true,
            id: result.insertId,
            nodo_id: testNodoId,
            topico: testTopico,
            payload: testPayload,
            message: 'Mensaje de prueba creado exitosamente'
        });
        
    } catch (error) {
        console.error('💥 Error creando mensaje de prueba:', error);
        res.status(500).json({ 
            error: 'Error creando mensaje de prueba',
            details: error.message 
        });
    } finally {
        if (connection) connection.release();
    }
});

module.exports = router;