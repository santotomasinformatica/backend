const express = require('express');
const bcrypt = require('bcryptjs');
const { pool } = require('../config/database');

const router = express.Router();

// =============================================
// VERIFICAR DATOS OFICIALES
// =============================================
router.get('/verify-data', async (req, res) => {
    let connection;
    try {
        console.log('🔧 Verificando datos oficiales...');
        
        connection = await pool.getConnection();
        
        // Verificar roles
        const [roles] = await connection.execute('SELECT rol, descripcion FROM rol ORDER BY rol');
        
        // Verificar tipos de nodos
        const [nodoTipos] = await connection.execute('SELECT tipo, descripcion FROM nodo_tipo ORDER BY tipo');
        
        // Verificar nodos
        const [nodos] = await connection.execute('SELECT COUNT(*) as count FROM nodo WHERE activo = 1');
        
        // Verificar ubicaciones de nodos
        const [ubicaciones] = await connection.execute('SELECT COUNT(*) as count FROM nodo_ubicacion WHERE activo = 1');
        
        // Verificar alertas
        const [alertas] = await connection.execute('SELECT COUNT(*) as count FROM alerta');
        
        // Verificar usuarios
        const [usuarios] = await connection.execute('SELECT COUNT(*) as count FROM usuario WHERE activo = 1');
        
        res.json({
            message: 'Verificación de datos oficiales completada',
            data: {
                roles: roles,
                nodoTipos: nodoTipos,
                counts: {
                    nodos: nodos[0].count,
                    ubicaciones: ubicaciones[0].count,
                    alertas: alertas[0].count,
                    usuarios: usuarios[0].count
                }
            }
        });
        
    } catch (error) {
        console.error('💥 Error verificando datos:', error);
        res.status(500).json({ 
            error: 'Error verificando datos',
            details: error.message 
        });
    } finally {
        if (connection) connection.release();
    }
});

// =============================================
// CREAR USUARIO ROOT OFICIAL
// =============================================
router.post('/create-root', async (req, res) => {
    let connection;
    try {
        console.log('🔧 Creando usuario root oficial...');
        
        const { clave } = req.body;
        
        if (!clave) {
            return res.status(400).json({ 
                error: 'Se requiere una clave para el usuario root' 
            });
        }
        
        connection = await pool.getConnection();
        
        // Verificar si ya existe el usuario root
        const [rootExists] = await connection.execute('SELECT id FROM usuario WHERE id = ?', ['root']);
        
        if (rootExists.length > 0) {
            return res.status(400).json({ 
                error: 'El usuario root ya existe' 
            });
        }
        
        // Crear usuario root según las especificaciones oficiales
        await connection.execute(`
            INSERT INTO usuario (id, clave, nombre, apellido, rol, activo) 
            VALUES (?, ?, ?, ?, ?, 1)
        `, ['root', clave, 'Roberto', 'Carraso', 'ADM']);
        
        console.log('✅ Usuario root creado exitosamente');
        
        res.json({
            message: 'Usuario root creado exitosamente',
            usuario: {
                id: 'root',
                nombre: 'Roberto',
                apellido: 'Carraso',
                rol: 'ADM'
            }
        });
        
    } catch (error) {
        console.error('💥 Error creando usuario root:', error);
        res.status(500).json({ 
            error: 'Error creando usuario root',
            details: error.message 
        });
    } finally {
        if (connection) connection.release();
    }
});

// =============================================
// VERIFICAR ESQUEMA DE BASE DE DATOS
// =============================================
router.get('/check-schema', async (req, res) => {
    let connection;
    try {
        connection = await pool.getConnection();
        
        // Verificar todas las tablas del esquema
        const requiredTables = [
            'rol', 'usuario', 'nodo_tipo', 'nodo', 'colmena', 
            'nodo_colmena', 'nodo_mensaje', 'nodo_ubicacion', 'nodo_alerta', 'alerta'
        ];
        
        const tableInfo = {};
        
        for (const tableName of requiredTables) {
            try {
                const [exists] = await connection.execute(`
                    SELECT TABLE_NAME 
                    FROM information_schema.TABLES 
                    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?
                `, [tableName]);
                
                if (exists.length > 0) {
                    const [count] = await connection.execute(`SELECT COUNT(*) as count FROM ${tableName}`);
                    const [columns] = await connection.execute(`DESCRIBE ${tableName}`);
                    
                    tableInfo[tableName] = {
                        exists: true,
                        rowCount: count[0].count,
                        columns: columns.length
                    };
                } else {
                    tableInfo[tableName] = {
                        exists: false,
                        error: 'Tabla no encontrada'
                    };
                }
            } catch (e) {
                tableInfo[tableName] = {
                    exists: false,
                    error: e.message
                };
            }
        }
        
        res.json({
            database: 'Connected',
            schema: 'smartbee',
            tables: tableInfo,
            summary: {
                total: requiredTables.length,
                existing: Object.values(tableInfo).filter(t => t.exists).length,
                missing: Object.values(tableInfo).filter(t => !t.exists).length
            }
        });
        
    } catch (error) {
        console.error('Error checking schema:', error);
        res.status(500).json({ 
            error: 'Error checking database schema',
            details: error.message 
        });
    } finally {
        if (connection) connection.release();
    }
});

// =============================================
// CREAR DATOS BASE PARA SMARTBEE
// =============================================
router.post('/setup/create-base-data', async (req, res) => {
    let connection;
    try {
        console.log('🔧 Creando datos base para SmartBee...');
        
        connection = await pool.getConnection();
        
        const results = {
            roles: 0,
            nodoTipos: 0,
            nodos: 0,
            alertas: 0
        };
        
        // Crear roles básicos
        const roles = [
            { rol: 'ADM', descripcion: 'Administrador del sistema' },
            { rol: 'API', descripcion: 'Apicultor' },
            { rol: 'USR', descripcion: 'Usuario básico' }
        ];
        
        for (const rolData of roles) {
            try {
                await connection.execute(
                    'INSERT IGNORE INTO rol (rol, descripcion) VALUES (?, ?)',
                    [rolData.rol, rolData.descripcion]
                );
                results.roles++;
            } catch (e) {
                console.warn('⚠️ Error insertando rol:', e.message);
            }
        }
        
        // Crear tipos de nodos
        const nodoTipos = [
            { tipo: 'COLMENA', descripcion: 'Nodo sensor para colmenas' },
            { tipo: 'ESTACION', descripcion: 'Estación meteorológica' },
            { tipo: 'SENSOR', descripcion: 'Sensor genérico' }
        ];
        
        for (const tipoData of nodoTipos) {
            try {
                await connection.execute(
                    'INSERT IGNORE INTO nodo_tipo (tipo, descripcion) VALUES (?, ?)',
                    [tipoData.tipo, tipoData.descripcion]
                );
                results.nodoTipos++;
            } catch (e) {
                console.warn('⚠️ Error insertando nodo_tipo:', e.message);
            }
        }
        
        // Crear nodos de ejemplo
        const nodosEjemplo = [
            { id: 'NODO-7881883A-97A5-47E0-869C-753E99E1B168', descripcion: 'Nodo sensor principal', tipo: 'SENSOR' },
            { id: 'NODO-TEST-001', descripcion: 'Nodo de pruebas 1', tipo: 'SENSOR' },
            { id: 'NODO-TEST-002', descripcion: 'Nodo de pruebas 2', tipo: 'SENSOR' }
        ];
        
        for (const nodoData of nodosEjemplo) {
            try {
                await connection.execute(
                    'INSERT IGNORE INTO nodo (id, descripcion, tipo) VALUES (?, ?, ?)',
                    [nodoData.id, nodoData.descripcion, nodoData.tipo]
                );
                results.nodos++;
            } catch (e) {
                console.warn('⚠️ Error insertando nodo:', e.message);
            }
        }
        
        console.log('✅ Datos base creados:', results);
        
        res.json({
            success: true,
            message: 'Datos base creados exitosamente',
            results: results
        });
        
    } catch (error) {
        console.error('💥 Error creando datos base:', error);
        res.status(500).json({ 
            error: 'Error creando datos base',
            details: error.message 
        });
    } finally {
        if (connection) connection.release();
    }
});

module.exports = router;