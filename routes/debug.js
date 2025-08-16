const express = require('express');
const { pool } = require('../config/database');

const router = express.Router();

// =============================================
// TEST DE BASE DE DATOS
// =============================================
router.get('/test-db', async (req, res) => {
    let connection;
    try {
        connection = await pool.getConnection();
        const [rows] = await connection.execute('SELECT 1 as test, NOW() as timestamp');
        res.json({ 
            connected: true,
            test: rows[0].test,
            timestamp: rows[0].timestamp
        });
    } catch (error) {
        console.error('Error en test-db:', error);
        res.status(500).json({ 
            connected: false,
            error: error.message
        });
    } finally {
        if (connection) connection.release();
    }
});

// =============================================
// VERIFICAR TABLAS
// =============================================
router.get('/check-tables', async (req, res) => {
    let connection;
    try {
        connection = await pool.getConnection();
        
        // Verificar qué tablas existen
        const [tables] = await connection.execute(`
            SELECT TABLE_NAME 
            FROM information_schema.TABLES 
            WHERE TABLE_SCHEMA = DATABASE()
            ORDER BY TABLE_NAME
        `);
        
        const tableNames = tables.map(t => t.TABLE_NAME);
        
        // Verificar estructura de tablas principales
        const tableInfo = {};
        
        for (const tableName of ['usuario', 'rol', 'colmena', 'colmena_ubicacion', 'mensaje', 'nodo', 'nodo_tipo']) {
            if (tableNames.includes(tableName)) {
                try {
                    const [columns] = await connection.execute(`DESCRIBE ${tableName}`);
                    const [count] = await connection.execute(`SELECT COUNT(*) as count FROM ${tableName}`);
                    
                    tableInfo[tableName] = {
                        exists: true,
                        columns: columns.map(c => ({ field: c.Field, type: c.Type, key: c.Key })),
                        rowCount: count[0].count
                    };
                } catch (e) {
                    tableInfo[tableName] = {
                        exists: false,
                        error: e.message
                    };
                }
            } else {
                tableInfo[tableName] = {
                    exists: false,
                    error: 'Tabla no encontrada'
                };
            }
        }
        
        res.json({
            database: 'Connected',
            allTables: tableNames,
            requiredTables: tableInfo
        });
        
    } catch (error) {
        console.error('Error checking database structure:', error);
        res.status(500).json({ 
            error: 'Error checking database structure',
            details: error.message 
        });
    } finally {
        if (connection) connection.release();
    }
});

// =============================================
// DIAGNÓSTICO DE NODO_MENSAJE
// =============================================
router.get('/nodo-mensaje-info', async (req, res) => {
    let connection;
    try {
        console.log('🔧 Ejecutando diagnóstico completo...');
        
        connection = await pool.getConnection();
        
        const diagnostico = {
            timestamp: new Date().toISOString(),
            database: null,
            tables: [],
            nodo_mensaje: {
                exists: false,
                structure: [],
                totalRows: 0,
                samples: [],
                errors: []
            }
        };
        
        try {
            const [dbInfo] = await connection.execute('SELECT DATABASE() as db_name, NOW() as current_time');
            diagnostico.database = dbInfo[0];
            
            const [allTables] = await connection.execute('SHOW TABLES');
            diagnostico.tables = allTables.map(table => Object.values(table)[0]);
            
            if (diagnostico.tables.includes('nodo_mensaje')) {
                diagnostico.nodo_mensaje.exists = true;
                
                const [structure] = await connection.execute('DESCRIBE nodo_mensaje');
                diagnostico.nodo_mensaje.structure = structure;
                
                const [count] = await connection.execute('SELECT COUNT(*) as total FROM nodo_mensaje');
                diagnostico.nodo_mensaje.totalRows = count[0].total;
                
                if (diagnostico.nodo_mensaje.totalRows > 0) {
                    const [samples] = await connection.execute(`
                        SELECT id, nodo_id, topico, 
                            LEFT(payload, 100) as payload_preview, 
                            fecha
                        FROM nodo_mensaje 
                        ORDER BY fecha DESC 
                        LIMIT 5
                    `);
                    diagnostico.nodo_mensaje.samples = samples;
                }
            }
            
        } catch (error) {
            diagnostico.nodo_mensaje.errors.push({
                type: 'query_error',
                message: error.message,
                code: error.code
            });
        }
        
        res.json(diagnostico);
        
    } catch (error) {
        console.error('💥 Error en diagnóstico:', error);
        res.status(500).json({ 
            error: 'Error ejecutando diagnóstico',
            details: error.message 
        });
    } finally {
        if (connection) connection.release();
    }
});

// =============================================
// OBTENER DATOS RAW MÁS RECIENTES
// =============================================
router.get('/latest-raw-data', async (req, res) => {
    let connection;
    try {
        const limit = parseInt(req.query.limit) || 20;
        
        console.log(`🔍 Obteniendo los últimos ${limit} datos RAW de la base de datos...`);
        
        connection = await pool.getConnection();
        
        const [rows] = await connection.execute(`
            SELECT id, nodo_id, topico, payload, fecha,
                DATE_FORMAT(fecha, '%Y-%m-%d %H:%i:%s') as fecha_formateada
            FROM nodo_mensaje 
            ORDER BY fecha DESC 
            LIMIT ?
        `, [limit]);
        
        console.log(`✅ Datos RAW obtenidos: ${rows.length}`);
        
        res.json({
            total: rows.length,
            timestamp: new Date().toISOString(),
            datos: rows.map(row => ({
                id: row.id,
                nodo_id: row.nodo_id,
                topico: row.topico,
                payload: row.payload,
                fecha_original: row.fecha,
                fecha_formateada: row.fecha_formateada,
                payload_parsed: (() => {
                    try {
                        return JSON.parse(row.payload);
                    } catch (e) {
                        return { error: 'Invalid JSON', raw: row.payload };
                    }
                })()
            }))
        });
        
    } catch (error) {
        console.error('💥 Error obteniendo datos RAW:', error);
        res.status(500).json({ 
            error: 'Error obteniendo datos RAW',
            details: error.message 
        });
    } finally {
        if (connection) connection.release();
    }
});

// =============================================
// VERIFICAR NODOS ESPECÍFICOS
// =============================================
router.get('/target-nodes-data', async (req, res) => {
    let connection;
    try {
        const limit = parseInt(req.query.limit) || 10;
        const nodoInterno = 'NODO-BEF8C985-0FF3-4874-935B-40AA8A235FF7';
        const nodoExterno = 'NODO-B5B3ABC4-E0CE-4662-ACB3-7A631C12394A';
        
        console.log(`🎯 Verificando datos de nodos específicos (últimos ${limit})...`);
        
        connection = await pool.getConnection();
        
        // Datos del nodo interno
        const [datosInternos] = await connection.execute(`
            SELECT id, nodo_id, payload, fecha,
                DATE_FORMAT(fecha, '%Y-%m-%d %H:%i:%s') as fecha_formateada
            FROM nodo_mensaje 
            WHERE nodo_id = ?
            ORDER BY fecha DESC 
            LIMIT ?
        `, [nodoInterno, limit]);
        
        // Datos del nodo externo
        const [datosExternos] = await connection.execute(`
            SELECT id, nodo_id, payload, fecha,
                DATE_FORMAT(fecha, '%Y-%m-%d %H:%i:%s') as fecha_formateada
            FROM nodo_mensaje 
            WHERE nodo_id = ?
            ORDER BY fecha DESC 
            LIMIT ?
        `, [nodoExterno, limit]);
        
        console.log(`✅ Nodo interno: ${datosInternos.length} registros`);
        console.log(`✅ Nodo externo: ${datosExternos.length} registros`);
        
        res.json({
            timestamp: new Date().toISOString(),
            nodos: {
                interno: {
                    nodo_id: nodoInterno,
                    total: datosInternos.length,
                    datos: datosInternos.map(row => ({
                        id: row.id,
                        fecha_formateada: row.fecha_formateada,
                        payload_parsed: (() => {
                            try {
                                return JSON.parse(row.payload);
                            } catch (e) {
                                return { error: 'Invalid JSON' };
                            }
                        })()
                    }))
                },
                externo: {
                    nodo_id: nodoExterno,
                    total: datosExternos.length,
                    datos: datosExternos.map(row => ({
                        id: row.id,
                        fecha_formateada: row.fecha_formateada,
                        payload_parsed: (() => {
                            try {
                                return JSON.parse(row.payload);
                            } catch (e) {
                                return { error: 'Invalid JSON' };
                            }
                        })()
                    }))
                }
            }
        });
        
    } catch (error) {
        console.error('💥 Error verificando nodos específicos:', error);
        res.status(500).json({ 
            error: 'Error verificando nodos específicos',
            details: error.message 
        });
    } finally {
        if (connection) connection.release();
    }
});

// =============================================
// INSERTAR DATO DE PRUEBA
// =============================================
router.post('/insert-test-data', async (req, res) => {
    let connection;
    try {
        console.log('🧪 Insertando dato de prueba...');
        
        connection = await pool.getConnection();
        
        const nodoInterno = 'NODO-BEF8C985-0FF3-4874-935B-40AA8A235FF7';
        const testTopico = `SmartBee/nodes/${nodoInterno}/data`;
        
        const testPayload = {
            nodo_id: nodoInterno,
            temperatura: (15 + Math.random() * 25).toFixed(1),
            humedad: (40 + Math.random() * 50).toFixed(1),
            peso: (1000 + Math.random() * 500).toFixed(0),
            timestamp: new Date().toISOString(),
            test_data: true
        };
        
        const payloadJson = JSON.stringify(testPayload);
        
        const [result] = await connection.execute(`
            INSERT INTO nodo_mensaje (nodo_id, topico, payload) 
            VALUES (?, ?, ?)
        `, [nodoInterno, testTopico, payloadJson]);
        
        console.log('✅ Dato de prueba insertado con ID:', result.insertId);
        
        // Verificar que se insertó correctamente
        const [verification] = await connection.execute(`
            SELECT id, fecha, payload 
            FROM nodo_mensaje 
            WHERE id = ?
        `, [result.insertId]);
        
        res.json({
            success: true,
            insertId: result.insertId,
            timestamp: new Date().toISOString(),
            payload: testPayload,
            verification: verification[0] ? {
                id: verification[0].id,
                fecha: verification[0].fecha,
                payload_parsed: JSON.parse(verification[0].payload)
            } : null,
            message: 'Dato de prueba insertado. El dashboard debería actualizarse en 10 segundos.'
        });
        
    } catch (error) {
        console.error('💥 Error insertando dato de prueba:', error);
        res.status(500).json({ 
            error: 'Error insertando dato de prueba',
            details: error.message 
        });
    } finally {
        if (connection) connection.release();
    }
});

// =============================================
// DEBUG DE NODOS DE USUARIO
// =============================================
router.get('/user-nodes-data/:userId', async (req, res) => {
    let connection;
    try {
        const { userId } = req.params;
        const hours = parseInt(req.query.hours) || 24;
        
        console.log(`🔍 Debug: Verificando nodos del usuario ${userId}...`);
        
        connection = await pool.getConnection();
        
        // 1. Verificar que el usuario existe
        const [usuario] = await connection.execute(`
            SELECT id, nombre, apellido FROM usuario WHERE id = ? AND activo = 1
        `, [userId]);
        
        if (usuario.length === 0) {
            return res.status(404).json({ error: 'Usuario no encontrado' });
        }
        
        // 2. Obtener todas las colmenas del usuario
        const [colmenas] = await connection.execute(`
            SELECT id, descripcion FROM colmena WHERE dueno = ?
        `, [userId]);
        
        console.log(`📍 Colmenas encontradas: ${colmenas.length}`);
        
        if (colmenas.length === 0) {
            return res.json({
                usuario: usuario[0],
                message: 'El usuario no tiene colmenas registradas',
                colmenas: [],
                nodos_detalle: [],
                resumen: {
                    colmenas_total: 0,
                    nodos_asignados: 0,
                    nodos_con_datos: 0,
                    total_mensajes_periodo: 0
                }
            });
        }
        
        const colmenaIds = colmenas.map(c => c.id);
        const placeholders = colmenaIds.map(() => '?').join(',');
        
        // 3. Obtener nodos interiores asignados a las colmenas del usuario
        const [nodosInteriores] = await connection.execute(`
            SELECT 
                nc.colmena_id,
                nc.nodo_id,
                n.descripcion as nodo_descripcion,
                c.descripcion as colmena_descripcion,
                'interior' as tipo
            FROM nodo_colmena nc
            INNER JOIN colmena c ON nc.colmena_id = c.id
            INNER JOIN nodo n ON nc.nodo_id = n.id
            WHERE nc.colmena_id IN (${placeholders})
        `, colmenaIds);
        
        // 4. Obtener nodos exteriores asignados a estaciones del usuario
        const [nodosExteriores] = await connection.execute(`
            SELECT 
                ne.estacion_id as colmena_id,
                ne.nodo_id,
                n.descripcion as nodo_descripcion,
                e.descripcion as colmena_descripcion,
                'exterior' as tipo
            FROM nodo_estacion ne
            INNER JOIN estacion e ON ne.estacion_id = e.id
            INNER JOIN nodo n ON ne.nodo_id = n.id
            WHERE ne.estacion_id IN (${placeholders})
        `, colmenaIds);
        
        // 5. Combinar todos los nodos
        const todosLosNodos = [...nodosInteriores, ...nodosExteriores];
        
        console.log(`🔌 Nodos asignados: ${todosLosNodos.length} (${nodosInteriores.length} interiores, ${nodosExteriores.length} exteriores)`);
        
        // 6. Para cada nodo, verificar cuántos mensajes tiene
        const nodosConDatos = [];
        
        for (const nodo of todosLosNodos) {
            const [mensajes] = await connection.execute(`
                SELECT COUNT(*) as total,
                       MAX(fecha) as ultimo_mensaje,
                       MIN(fecha) as primer_mensaje
                FROM nodo_mensaje 
                WHERE nodo_id = ? AND fecha >= DATE_SUB(NOW(), INTERVAL ? HOUR)
            `, [nodo.nodo_id, hours]);
            
            nodosConDatos.push({
                tipo: nodo.tipo,
                nodo_id: nodo.nodo_id,
                nodo_descripcion: nodo.nodo_descripcion,
                colmena_id: nodo.colmena_id,
                colmena_descripcion: nodo.colmena_descripcion,
                mensajes_periodo: mensajes[0].total,
                ultimo_mensaje: mensajes[0].ultimo_mensaje,
                primer_mensaje: mensajes[0].primer_mensaje
            });
        }
        
        // 7. Obtener sample de mensajes recientes de nodos activos
        const nodosActivos = nodosConDatos.filter(n => n.mensajes_periodo > 0);
        const sampleMensajes = [];
        
        for (const nodo of nodosActivos.slice(0, 3)) { // Solo primeros 3 para no saturar
            try {
                const [sample] = await connection.execute(`
                    SELECT id, topico, 
                           LEFT(payload, 200) as payload_preview,
                           fecha
                    FROM nodo_mensaje 
                    WHERE nodo_id = ? 
                    ORDER BY fecha DESC 
                    LIMIT 3
                `, [nodo.nodo_id]);
                
                sampleMensajes.push({
                    nodo_id: nodo.nodo_id,
                    nodo_tipo: nodo.tipo,
                    mensajes: sample
                });
            } catch (error) {
                console.warn(`Error obteniendo sample de ${nodo.nodo_id}:`, error.message);
            }
        }
        
        // 8. Verificar también todos los nodos únicos en nodo_mensaje
        const [allNodesInMessages] = await connection.execute(`
            SELECT nodo_id, COUNT(*) as total_mensajes
            FROM nodo_mensaje 
            WHERE fecha >= DATE_SUB(NOW(), INTERVAL ? HOUR)
            GROUP BY nodo_id
            ORDER BY total_mensajes DESC
        `, [hours]);
        
        res.json({
            usuario: usuario[0],
            resumen: {
                colmenas_total: colmenas.length,
                nodos_asignados: todosLosNodos.length,
                nodos_con_datos: nodosActivos.length,
                total_mensajes_periodo: nodosConDatos.reduce((sum, n) => sum + n.mensajes_periodo, 0)
            },
            colmenas: colmenas,
            nodos_detalle: nodosConDatos,
            nodos_activos: nodosActivos,
            sample_mensajes: sampleMensajes,
            todos_los_nodos_con_mensajes: allNodesInMessages,
            periodo_horas: hours,
            debug_info: {
                nodosInteriores: nodosInteriores.length,
                nodosExteriores: nodosExteriores.length,
                timestamp: new Date().toISOString()
            }
        });
        
    } catch (error) {
        console.error('💥 Error en debug user nodes:', error);
        res.status(500).json({ 
            error: 'Error verificando nodos del usuario',
            details: error.message 
        });
    } finally {
        if (connection) connection.release();
    }
});

// =============================================
// VERIFICAR DATOS DE NODOS
// =============================================
router.get('/nodos-data', async (req, res) => {
    let connection;
    try {
        console.log('🔧 Verificando datos de nodos específicos...');
        
        connection = await pool.getConnection();
        
        const nodoInterno = 'NODO-BEF8C985-0FF3-4874-935B-40AA8A235FF7';
        const nodoExterno = 'NODO-B5B3ABC4-E0CE-4662-ACB3-7A631C12394A';
        
        // Verificar cuántos mensajes hay de cada nodo
        const [countInterno] = await connection.execute(
            'SELECT COUNT(*) as count FROM nodo_mensaje WHERE nodo_id = ?', 
            [nodoInterno]
        );
        
        const [countExterno] = await connection.execute(
            'SELECT COUNT(*) as count FROM nodo_mensaje WHERE nodo_id = ?', 
            [nodoExterno]
        );
        
        // Obtener algunos ejemplos de cada nodo
        const [ejemplosInterno] = await connection.execute(
            'SELECT id, nodo_id, topico, payload, fecha FROM nodo_mensaje WHERE nodo_id = ? ORDER BY fecha DESC LIMIT 3', 
            [nodoInterno]
        );
        
        const [ejemplosExterno] = await connection.execute(
            'SELECT id, nodo_id, topico, payload, fecha FROM nodo_mensaje WHERE nodo_id = ? ORDER BY fecha DESC LIMIT 3', 
            [nodoExterno]
        );
        
        // Verificar todos los nodos únicos
        const [todosNodos] = await connection.execute(
            'SELECT DISTINCT nodo_id, COUNT(*) as count FROM nodo_mensaje GROUP BY nodo_id ORDER BY count DESC'
        );
        
        res.json({
            nodos_objetivo: {
                interno: {
                    id: nodoInterno,
                    count: countInterno[0].count,
                    ejemplos: ejemplosInterno
                },
                externo: {
                    id: nodoExterno,
                    count: countExterno[0].count,
                    ejemplos: ejemplosExterno
                }
            },
            todos_los_nodos: todosNodos,
            total_mensajes: todosNodos.reduce((sum, nodo) => sum + nodo.count, 0)
        });
        
    } catch (error) {
        console.error('💥 Error en debug nodos:', error);
        res.status(500).json({ 
            error: 'Error verificando datos de nodos',
            details: error.message 
        });
    } finally {
        if (connection) connection.release();
    }
});

// =============================================
// VERIFICAR ESTRUCTURA DE BASE DE DATOS
// =============================================
router.get('/estructura', async (req, res) => {
    let connection;
    try {
        connection = await pool.getConnection();
        const [tables] = await connection.execute('SHOW TABLES');
        
        let estructura = { tablas: tables };
        
        // Obtener estructura de cada tabla
        for (const table of tables) {
            const tableName = table[Object.keys(table)[0]];
            try {
                const [columns] = await connection.execute(`DESCRIBE ${tableName}`);
                estructura[tableName] = columns;
            } catch (e) {
                estructura[`${tableName}_error`] = e.message;
            }
        }
        
        res.json(estructura);
    } catch (error) {
        res.status(500).json({ error: error.message });
    } finally {
        if (connection) connection.release();
    }
});

// =============================================
// LOGS DE DEBUG
// =============================================
router.get('/logs', (req, res) => {
    res.json({
        message: 'Endpoint para debug. Revisa los logs del servidor.',
        timestamp: new Date().toISOString()
    });
});

module.exports = router;