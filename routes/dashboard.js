const express = require('express');
const { pool } = require('../config/database');

const router = express.Router();

// =============================================
// ESTADÍSTICAS DEL DASHBOARD
// =============================================
router.get('/stats', async (req, res) => {
    let connection;
    try {
        console.log('📊 Obteniendo estadísticas del dashboard...');
        
        connection = await pool.getConnection();
        
        const [usuarios] = await connection.execute('SELECT COUNT(*) as count FROM usuario WHERE activo = 1');
        const [colmenas] = await connection.execute('SELECT COUNT(*) as count FROM colmena');
        const [nodos] = await connection.execute('SELECT COUNT(*) as count FROM nodo');
        
        // Contar estaciones (con manejo de errores)
        let estacionesCount = 0;
        try {
            const [estaciones] = await connection.execute('SELECT COUNT(*) as count FROM estacion');
            estacionesCount = estaciones[0].count;
        } catch (e) {
            console.log('⚠️ Tabla estacion no encontrada');
        }
        
        // Contar mensajes de hoy
        let mensajesHoyCount = 0;
        try {
            const [mensajesHoy] = await connection.execute(`
                SELECT COUNT(*) as count FROM nodo_mensaje 
                WHERE DATE(fecha) = CURDATE()
            `);
            mensajesHoyCount = mensajesHoy[0].count;
        } catch (e) {
            console.log('⚠️ Tabla nodo_mensaje no encontrada');
        }
        
        const stats = {
            totalColmenas: colmenas[0].count,
            totalEstaciones: estacionesCount,
            totalUsuarios: usuarios[0].count,
            totalNodos: nodos[0].count,
            mensajesHoy: mensajesHoyCount,
            colmenasActivas: colmenas[0].count
        };
        
        res.json(stats);
        
    } catch (error) {
        console.error('💥 Error obteniendo estadísticas:', error);
        res.status(500).json({ 
            error: 'Error obteniendo estadísticas',
            details: error.message 
        });
    } finally {
        if (connection) connection.release();
    }
});

// =============================================
// DATOS DE SENSORES PARA DASHBOARD
// =============================================
router.get('/sensor-data', async (req, res) => {
    let connection;
    try {
        const hours = Math.min(parseInt(req.query.hours) || 168, 720); // Máximo 30 días
        const userId = req.query.userId; // ✅ REQUERIDO: ID del usuario
        
        if (!userId) {
            return res.status(400).json({ 
                error: 'Se requiere el ID del usuario para obtener datos de sus colmenas' 
            });
        }
        
        console.log(`📊 Obteniendo datos de colmenas del usuario ${userId} (últimas ${hours}h)...`);
        
        connection = await pool.getConnection();
        
        // ✅ PASO 1: Verificar que el usuario existe y está activo
        const [usuarioExists] = await connection.execute(`
            SELECT id, nombre, apellido FROM usuario WHERE id = ? AND activo = 1
        `, [userId]);
        
        if (usuarioExists.length === 0) {
            return res.status(404).json({
                error: 'Usuario no encontrado o inactivo'
            });
        }
        
        console.log(`✅ Usuario encontrado: ${usuarioExists[0].nombre} ${usuarioExists[0].apellido}`);
        
        // ✅ PASO 2: Obtener colmenas del usuario
        const [colmenasUsuario] = await connection.execute(`
            SELECT id, descripcion, latitud, longitud
            FROM colmena 
            WHERE dueno = ?
            ORDER BY id ASC
        `, [userId]);
        
        console.log(`📍 Colmenas del usuario: ${colmenasUsuario.length}`);
        
        if (colmenasUsuario.length === 0) {
            return res.json({
                internos: [],
                externos: [],
                combinados: [],
                nodos: { interior: [], exterior: [] },
                message: 'No tienes colmenas registradas en el sistema',
                colmenasCount: 0,
                colmenasConNodosActivos: 0,
                userId: userId
            });
        }
        
        // ✅ PASO 3: Obtener nodos interiores (de colmenas) con datos recientes
        const colmenaIds = colmenasUsuario.map(c => c.id);
        const colmenaPlaceholders = colmenaIds.map(() => '?').join(',');
        
        const [nodosInteriores] = await connection.execute(`
            SELECT 
                nc.colmena_id,
                nc.nodo_id,
                n.descripcion as nodo_descripcion,
                c.descripcion as colmena_descripcion,
                COUNT(nm.id) as mensajes_recientes
            FROM nodo_colmena nc
            INNER JOIN colmena c ON nc.colmena_id = c.id
            INNER JOIN nodo n ON nc.nodo_id = n.id
            LEFT JOIN nodo_mensaje nm ON nc.nodo_id = nm.nodo_id 
                AND nm.fecha >= DATE_SUB(NOW(), INTERVAL ? HOUR)
            WHERE nc.colmena_id IN (${colmenaPlaceholders})
            GROUP BY nc.colmena_id, nc.nodo_id
            HAVING mensajes_recientes > 0
            ORDER BY nc.colmena_id
        `, [hours, ...colmenaIds]);
        
        // ✅ PASO 4: Obtener nodos exteriores (de estaciones) con datos recientes
        const [nodosExteriores] = await connection.execute(`
            SELECT 
                ne.estacion_id,
                ne.nodo_id,
                n.descripcion as nodo_descripcion,
                e.descripcion as estacion_descripcion,
                COUNT(nm.id) as mensajes_recientes
            FROM nodo_estacion ne
            INNER JOIN estacion e ON ne.estacion_id = e.id
            INNER JOIN nodo n ON ne.nodo_id = n.id
            LEFT JOIN nodo_mensaje nm ON ne.nodo_id = nm.nodo_id 
                AND nm.fecha >= DATE_SUB(NOW(), INTERVAL ? HOUR)
            WHERE ne.estacion_id IN (${colmenaPlaceholders})
            GROUP BY ne.estacion_id, ne.nodo_id
            HAVING mensajes_recientes > 0
            ORDER BY ne.estacion_id
        `, [hours, ...colmenaIds]);
        
        console.log(`🔌 Nodos encontrados: ${nodosInteriores.length} interiores, ${nodosExteriores.length} exteriores`);
        
        // ✅ PASO 5: Si no hay nodos con datos, devolver información útil
        if (nodosInteriores.length === 0 && nodosExteriores.length === 0) {
            // Verificar si hay nodos asignados sin datos
            const [nodosAsignadosSinDatos] = await connection.execute(`
                SELECT COUNT(*) as total_nodos_asignados
                FROM (
                    SELECT nc.nodo_id FROM nodo_colmena nc 
                    WHERE nc.colmena_id IN (${colmenaPlaceholders})
                    UNION 
                    SELECT ne.nodo_id FROM nodo_estacion ne 
                    WHERE ne.estacion_id IN (${colmenaPlaceholders})
                ) AS nodos_totales
            `, [...colmenaIds, ...colmenaIds]);
            
            let message = 'Las colmenas no tienen nodos asignados';
            if (nodosAsignadosSinDatos[0].total_nodos_asignados > 0) {
                message = `Tienes ${nodosAsignadosSinDatos[0].total_nodos_asignados} nodos asignados pero sin datos en las últimas ${hours} horas`;
            }
            
            return res.json({
                internos: [],
                externos: [],
                combinados: [],
                nodos: { interior: [], exterior: [] },
                message: message,
                colmenasCount: colmenasUsuario.length,
                colmenasConNodosActivos: 0,
                nodosAsignados: nodosAsignadosSinDatos[0].total_nodos_asignados,
                userId: userId
            });
        }
        
        // ✅ PASO 6: Obtener TODOS los IDs de nodos que tienen datos
        const todosLosNodosIds = [
            ...nodosInteriores.map(n => n.nodo_id),
            ...nodosExteriores.map(n => n.nodo_id)
        ];
        
        const nodosPlaceholders = todosLosNodosIds.map(() => '?').join(',');
        
        // ✅ PASO 7: Obtener mensajes de estos nodos
        const query = `
            SELECT nm.nodo_id, nm.payload, nm.fecha, nm.id
            FROM nodo_mensaje nm
            WHERE nm.nodo_id IN (${nodosPlaceholders})
            AND nm.fecha >= DATE_SUB(NOW(), INTERVAL ? HOUR)
            ORDER BY nm.fecha DESC
            LIMIT 5000
        `;
        
        const [mensajes] = await connection.execute(query, [...todosLosNodosIds, hours]);
        
        console.log(`✅ Mensajes obtenidos: ${mensajes.length} de ${todosLosNodosIds.length} nodos`);
        
        if (mensajes.length === 0) {
            return res.json({
                internos: [],
                externos: [],
                combinados: [],
                nodos: { 
                    interior: nodosInteriores.map(n => ({
                        id: n.nodo_id,
                        colmena_id: n.colmena_id,
                        colmena_descripcion: n.colmena_descripcion,
                        mensajes_recientes: n.mensajes_recientes
                    })),
                    exterior: nodosExteriores.map(n => ({
                        id: n.nodo_id,
                        estacion_id: n.estacion_id,
                        estacion_descripcion: n.estacion_descripcion,
                        mensajes_recientes: n.mensajes_recientes
                    }))
                },
                message: 'Nodos encontrados pero sin datos en el período solicitado',
                colmenasCount: colmenasUsuario.length,
                colmenasConNodosActivos: nodosInteriores.length + nodosExteriores.length,
                userId: userId
            });
        }
        
        // ✅ PASO 8: Procesar y clasificar los datos
        const datosFormateados = mensajes.map(mensaje => {
            let payload = {};
            try {
                payload = JSON.parse(mensaje.payload);
            } catch (e) {
                console.warn('Error parsing payload JSON:', e);
                return null;
            }
            
            // Determinar si es nodo interior o exterior
            const nodoInterior = nodosInteriores.find(n => n.nodo_id === mensaje.nodo_id);
            const nodoExterior = nodosExteriores.find(n => n.nodo_id === mensaje.nodo_id);
            
            return {
                id: mensaje.id,
                fecha: new Date(mensaje.fecha),
                nodo_id: mensaje.nodo_id,
                temperatura: parseFloat(payload.temperatura) || null,
                humedad: parseFloat(payload.humedad) || null,
                peso: parseFloat(payload.peso) || null,
                tipo: nodoInterior ? 'interno' : 'externo',
                colmena_id: nodoInterior ? nodoInterior.colmena_id : nodoExterior?.estacion_id,
                colmena_descripcion: nodoInterior ? nodoInterior.colmena_descripcion : nodoExterior?.estacion_descripcion
            };
        }).filter(item => item !== null);
        
        // Separar datos por tipo
        const datosInternos = datosFormateados.filter(d => d.tipo === 'interno');
        const datosExternos = datosFormateados.filter(d => d.tipo === 'externo');
        
        console.log(`📊 Datos procesados: ${datosInternos.length} internos, ${datosExternos.length} externos`);
        
        // ✅ PASO 9: Respuesta final exitosa
        res.json({
            internos: datosInternos,
            externos: datosExternos,
            combinados: datosFormateados,
            nodos: {
                interior: nodosInteriores.map(n => ({
                    id: n.nodo_id,
                    colmena_id: n.colmena_id,
                    colmena_descripcion: n.colmena_descripcion,
                    mensajes_recientes: n.mensajes_recientes
                })),
                exterior: nodosExteriores.map(n => ({
                    id: n.nodo_id,
                    estacion_id: n.estacion_id,
                    estacion_descripcion: n.estacion_descripcion,
                    mensajes_recientes: n.mensajes_recientes
                }))
            },
            totalRegistros: datosFormateados.length,
            horasConsultadas: hours,
            colmenasCount: colmenasUsuario.length,
            colmenasConNodosActivos: Math.max(
                [...new Set(nodosInteriores.map(n => n.colmena_id))].length,
                [...new Set(nodosExteriores.map(n => n.estacion_id))].length
            ),
            nodosActivosCount: todosLosNodosIds.length,
            userId: userId,
            resumen: {
                nodosInterioresActivos: nodosInteriores.length,
                nodosExterioresActivos: nodosExteriores.length,
                colmenasConDatos: [...new Set(datosFormateados.map(d => d.colmena_id))].length
            }
        });
        
    } catch (error) {
        console.error('💥 Error obteniendo datos del dashboard:', error);
        console.error('💥 Error details:', {
            message: error.message,
            code: error.code,
            errno: error.errno,
            sql: error.sql
        });
        
        res.status(500).json({ 
            error: 'Error obteniendo datos del dashboard',
            details: process.env.NODE_ENV === 'development' ? error.message : 'Error interno del servidor'
        });
    } finally {
        if (connection) connection.release();
    }
});

module.exports = router;