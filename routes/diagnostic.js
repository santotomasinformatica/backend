const express = require('express');
const { pool } = require('../config/database');

const router = express.Router();

// =============================================
// VERIFICAR SI TABLA EXISTE
// =============================================
const checkTableExists = async (connection, tableName) => {
    try {
        const [result] = await connection.execute(`
            SELECT COUNT(*) as count 
            FROM information_schema.tables 
            WHERE table_schema = DATABASE() 
            AND table_name = ?
        `, [tableName]);
        
        return result[0].count > 0;
    } catch (error) {
        console.error(`Error verificando tabla ${tableName}:`, error.message);
        return false;
    }
};

// =============================================
// DIAGNÓSTICO COMPLETO DE BASE DE DATOS
// =============================================
router.get('/database-full-check', async (req, res) => {
    let connection;
    try {
        console.log('🔍 Ejecutando diagnóstico completo de base de datos...');
        
        connection = await pool.getConnection();
        
        const diagnostic = {
            timestamp: new Date().toISOString(),
            database: {
                connected: true,
                info: null,
                error: null
            },
            tables: {
                all: [],
                required: {},
                missing: [],
                existing: []
            },
            nodo_mensaje: {
                exists: false,
                structure: null,
                indexes: null,
                rowCount: 0,
                recentCount: 0,
                sampleData: null,
                errors: []
            },
            recommendations: []
        };
        
        // ✅ PASO 1: Información de la base de datos
        try {
            const [dbInfo] = await connection.execute(`
                SELECT 
                    DATABASE() as database_name,
                    VERSION() as mysql_version,
                    NOW() as current_time,
                    @@session.time_zone as timezone
            `);
            diagnostic.database.info = dbInfo[0];
        } catch (error) {
            diagnostic.database.error = error.message;
        }
        
        // ✅ PASO 2: Listar todas las tablas
        try {
            const [allTables] = await connection.execute('SHOW TABLES');
            diagnostic.tables.all = allTables.map(table => Object.values(table)[0]);
        } catch (error) {
            diagnostic.tables.error = error.message;
        }
        
        // ✅ PASO 3: Verificar tablas requeridas para SmartBee
        const requiredTables = [
            'usuario', 'rol', 'colmena', 'nodo', 'nodo_tipo', 
            'nodo_mensaje', 'nodo_colmena', 'nodo_estacion', 'estacion'
        ];
        
        for (const tableName of requiredTables) {
            try {
                const exists = await checkTableExists(connection, tableName);
                
                if (exists) {
                    // Tabla existe - obtener información detallada
                    const [count] = await connection.execute(`SELECT COUNT(*) as count FROM ${tableName}`);
                    const [columns] = await connection.execute(`DESCRIBE ${tableName}`);
                    
                    diagnostic.tables.required[tableName] = {
                        exists: true,
                        rowCount: count[0].count,
                        columnCount: columns.length,
                        columns: columns.map(col => ({
                            field: col.Field,
                            type: col.Type,
                            null: col.Null,
                            key: col.Key,
                            default: col.Default
                        }))
                    };
                    diagnostic.tables.existing.push(tableName);
                } else {
                    diagnostic.tables.required[tableName] = {
                        exists: false,
                        error: 'Tabla no encontrada'
                    };
                    diagnostic.tables.missing.push(tableName);
                }
            } catch (error) {
                diagnostic.tables.required[tableName] = {
                    exists: false,
                    error: error.message
                };
                diagnostic.tables.missing.push(tableName);
            }
        }
        
        // ✅ PASO 4: Análisis específico de nodo_mensaje
        if (diagnostic.tables.all.includes('nodo_mensaje')) {
            diagnostic.nodo_mensaje.exists = true;
            
            try {
                // Conteo total de filas
                const [totalCount] = await connection.execute('SELECT COUNT(*) as total FROM nodo_mensaje');
                diagnostic.nodo_mensaje.rowCount = totalCount[0].total;
                
                // Conteo de mensajes recientes (24 horas)
                const [recentCount] = await connection.execute(`
                    SELECT COUNT(*) as recent 
                    FROM nodo_mensaje 
                    WHERE fecha >= DATE_SUB(NOW(), INTERVAL 24 HOUR)
                `);
                diagnostic.nodo_mensaje.recentCount = recentCount[0].recent;
                
                // Datos de muestra si existen
                if (diagnostic.nodo_mensaje.rowCount > 0) {
                    const [sampleData] = await connection.execute(`
                        SELECT 
                            id, nodo_id, topico, 
                            LEFT(payload, 150) as payload_preview,
                            fecha
                        FROM nodo_mensaje 
                        ORDER BY fecha DESC 
                        LIMIT 5
                    `);
                    diagnostic.nodo_mensaje.sampleData = sampleData;
                }
                
            } catch (error) {
                diagnostic.nodo_mensaje.errors.push({
                    operation: 'detailed_analysis',
                    error: error.message,
                    code: error.code
                });
            }
        }
        
        // ✅ PASO 5: Generar recomendaciones
        if (diagnostic.tables.missing.length > 0) {
            diagnostic.recommendations.push({
                type: 'missing_tables',
                priority: 'high',
                message: `Faltan ${diagnostic.tables.missing.length} tablas requeridas: ${diagnostic.tables.missing.join(', ')}`,
                action: 'Ejecutar scripts de migración'
            });
        }
        
        if (!diagnostic.nodo_mensaje.exists) {
            diagnostic.recommendations.push({
                type: 'no_message_table',
                priority: 'critical',
                message: 'La tabla nodo_mensaje no existe',
                action: 'Crear tabla nodo_mensaje'
            });
        } else if (diagnostic.nodo_mensaje.rowCount === 0) {
            diagnostic.recommendations.push({
                type: 'no_message_data',
                priority: 'medium',
                message: 'La tabla nodo_mensaje existe pero está vacía',
                action: 'Verificar sistema MQTT'
            });
        }
        
        // Resumen final
        diagnostic.summary = {
            tablesTotal: diagnostic.tables.all.length,
            tablesRequired: requiredTables.length,
            tablesExisting: diagnostic.tables.existing.length,
            tablesMissing: diagnostic.tables.missing.length,
            messagesTotal: diagnostic.nodo_mensaje.rowCount,
            messagesRecent: diagnostic.nodo_mensaje.recentCount,
            status: diagnostic.tables.missing.length === 0 ? 'healthy' : 'needs_attention'
        };
        
        res.json(diagnostic);
        
    } catch (error) {
        console.error('💥 Error en diagnóstico completo:', error);
        res.status(500).json({
            error: 'Error ejecutando diagnóstico completo',
            details: error.message,
            timestamp: new Date().toISOString()
        });
    } finally {
        if (connection) connection.release();
    }
});

// =============================================
// ENDPOINT SIMPLE DE TEST
// =============================================
router.get('/test', async (req, res) => {
    let connection;
    try {
        console.log('🧪 Test simple de conexión...');
        
        connection = await pool.getConnection();
        
        // Test básico
        const [test] = await connection.execute('SELECT NOW() as current_time, DATABASE() as db_name');
        
        res.json({
            success: true,
            message: 'Diagnóstico básico completado',
            timestamp: test[0].current_time,
            database: test[0].db_name
        });
        
    } catch (error) {
        console.error('💥 Error en test básico:', error);
        res.status(500).json({
            success: false,
            error: error.message,
            timestamp: new Date().toISOString()
        });
    } finally {
        if (connection) connection.release();
    }
});

module.exports = router;