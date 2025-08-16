const express = require('express');
const { pool } = require('../config/database');

const router = express.Router();

// =============================================
// OBTENER TODAS LAS COLMENAS
// =============================================
router.get('/', async (req, res) => {
    let connection;
    try {
        console.log('🏠 Obteniendo colmenas...');
        
        connection = await pool.getConnection();
        
        const [colmenas] = await connection.execute(`
            SELECT c.id, c.descripcion, c.latitud, c.longitud, c.dueno,
                u.nombre as dueno_nombre, u.apellido as dueno_apellido, u.comuna as dueno_comuna,
                nc.nodo_id as nodo_interior_id,
                n_interior.descripcion as nodo_interior_descripcion,
                ne.nodo_id as nodo_exterior_id,
                n_exterior.descripcion as nodo_exterior_descripcion
            FROM colmena c
            LEFT JOIN usuario u ON c.dueno = u.id
            LEFT JOIN nodo_colmena nc ON c.id = nc.colmena_id
            LEFT JOIN nodo n_interior ON nc.nodo_id = n_interior.id
            LEFT JOIN nodo_estacion ne ON c.id = ne.estacion_id
            LEFT JOIN nodo n_exterior ON ne.nodo_id = n_exterior.id
            ORDER BY c.id ASC
        `);
        
        // Formatear para compatibilidad con frontend
        const colmenasFormateadas = colmenas.map(colmena => ({
            id: colmena.id,
            nombre: `Colmena ${colmena.id}`,
            tipo: 'Langstroth',
            descripcion: colmena.descripcion,
            dueno: colmena.dueno,
            dueno_nombre: colmena.dueno_nombre,
            dueno_apellido: colmena.dueno_apellido,
            apiario_id: null,
            apiario_nombre: colmena.dueno_comuna || 'Sin ubicación',
            fecha_instalacion: new Date().toISOString(),
            activa: 1,
            latitud: colmena.latitud,
            longitud: colmena.longitud,
            ubicacion: colmena.latitud && colmena.longitud ? `${colmena.latitud}, ${colmena.longitud}` : null,
            comuna: colmena.dueno_comuna,
            // NUEVOS CAMPOS
            nodo_interior_id: colmena.nodo_interior_id,
            nodo_interior_descripcion: colmena.nodo_interior_descripcion,
            nodo_exterior_id: colmena.nodo_exterior_id,
            nodo_exterior_descripcion: colmena.nodo_exterior_descripcion
        }));
        
        console.log('✅ Colmenas obtenidas:', colmenasFormateadas.length);
        res.json(colmenasFormateadas);
        
    } catch (error) {
        console.error('💥 Error obteniendo colmenas:', error);
        console.error('Error details:', error.message);
        res.status(500).json({ 
            error: 'Error obteniendo colmenas',
            details: error.message 
        });
    } finally {
        if (connection) connection.release();
    }
});

// =============================================
// OBTENER COLMENA POR ID
// =============================================
router.get('/:id', async (req, res) => {
    let connection;
    try {
        const { id } = req.params;
        
        console.log(`🔍 Obteniendo colmena ${id}`);
        
        connection = await pool.getConnection();
        
        const [colmenas] = await connection.execute(`
            SELECT c.id, c.descripcion, c.latitud, c.longitud, c.dueno,
                u.nombre as dueno_nombre, u.apellido as dueno_apellido, u.comuna as dueno_comuna,
                nc.nodo_id as nodo_interior_id,
                n_interior.descripcion as nodo_interior_descripcion,
                ne.nodo_id as nodo_exterior_id,
                n_exterior.descripcion as nodo_exterior_descripcion
            FROM colmena c
            LEFT JOIN usuario u ON c.dueno = u.id
            LEFT JOIN nodo_colmena nc ON c.id = nc.colmena_id
            LEFT JOIN nodo n_interior ON nc.nodo_id = n_interior.id
            LEFT JOIN nodo_estacion ne ON c.id = ne.estacion_id
            LEFT JOIN nodo n_exterior ON ne.nodo_id = n_exterior.id
            WHERE c.id = ?
        `, [id]);
        
        if (colmenas.length === 0) {
            return res.status(404).json({ error: 'Colmena no encontrada' });
        }
        
        const colmena = colmenas[0];
        
        // Formatear para compatibilidad con frontend
        const colmenaFormateada = {
            id: colmena.id,
            nombre: `Colmena ${colmena.id}`,
            tipo: 'Langstroth',
            descripcion: colmena.descripcion,
            dueno: colmena.dueno,
            dueno_nombre: colmena.dueno_nombre,
            dueno_apellido: colmena.dueno_apellido,
            apiario_id: null,
            apiario_nombre: colmena.dueno_comuna || 'Sin ubicación',
            fecha_instalacion: new Date().toISOString(),
            activa: 1,
            latitud: colmena.latitud,
            longitud: colmena.longitud,
            ubicacion: colmena.latitud && colmena.longitud ? `${colmena.latitud}, ${colmena.longitud}` : null,
            comuna: colmena.dueno_comuna,
            // Campos de nodos
            nodo_interior_id: colmena.nodo_interior_id,
            nodo_interior_descripcion: colmena.nodo_interior_descripcion,
            nodo_exterior_id: colmena.nodo_exterior_id,
            nodo_exterior_descripcion: colmena.nodo_exterior_descripcion
        };
        
        console.log('✅ Colmena obtenida:', colmenaFormateada.id);
        res.json(colmenaFormateada);
        
    } catch (error) {
        console.error('💥 Error obteniendo colmena por ID:', error);
        res.status(500).json({ 
            error: 'Error obteniendo colmena',
            details: error.message 
        });
    } finally {
        if (connection) connection.release();
    }
});

// =============================================
// OBTENER COLMENAS POR DUEÑO
// =============================================
router.get('/dueno/:duenoId', async (req, res) => {
    let connection;
    try {
        const { duenoId } = req.params;
        
        console.log(`🏠 Obteniendo colmenas del dueño: ${duenoId}`);
        
        connection = await pool.getConnection();
        
        const [colmenas] = await connection.execute(`
            SELECT c.id, c.descripcion, c.latitud, c.longitud, c.dueno,
                u.nombre as dueno_nombre, u.apellido as dueno_apellido, u.comuna as dueno_comuna,
                nc.nodo_id as nodo_interior_id,
                n_interior.descripcion as nodo_interior_descripcion,
                ne.nodo_id as nodo_exterior_id,
                n_exterior.descripcion as nodo_exterior_descripcion
            FROM colmena c
            LEFT JOIN usuario u ON c.dueno = u.id
            LEFT JOIN nodo_colmena nc ON c.id = nc.colmena_id
            LEFT JOIN nodo n_interior ON nc.nodo_id = n_interior.id
            LEFT JOIN nodo_estacion ne ON c.id = ne.estacion_id
            LEFT JOIN nodo n_exterior ON ne.nodo_id = n_exterior.id
            WHERE c.dueno = ?
            ORDER BY c.id ASC
        `, [duenoId]);
        
        // Formatear incluyendo nodos
        const colmenasFormateadas = colmenas.map(colmena => ({
            id: colmena.id,
            nombre: `Colmena ${colmena.id}`,
            tipo: 'Langstroth',
            descripcion: colmena.descripcion,
            dueno: colmena.dueno,
            dueno_nombre: colmena.dueno_nombre,
            dueno_apellido: colmena.dueno_apellido,
            apiario_id: null,
            apiario_nombre: colmena.dueno_comuna || 'Sin ubicación',
            fecha_instalacion: new Date().toISOString(),
            activa: 1,
            latitud: colmena.latitud,
            longitud: colmena.longitud,
            ubicacion: colmena.latitud && colmena.longitud ? `${colmena.latitud}, ${colmena.longitud}` : null,
            comuna: colmena.dueno_comuna,
            // NUEVOS CAMPOS
            nodo_interior_id: colmena.nodo_interior_id,
            nodo_interior_descripcion: colmena.nodo_interior_descripcion,
            nodo_exterior_id: colmena.nodo_exterior_id,
            nodo_exterior_descripcion: colmena.nodo_exterior_descripcion
        }));
        
        console.log(`✅ Colmenas del dueño ${duenoId} obtenidas:`, colmenasFormateadas.length);
        
        res.json({
            data: colmenasFormateadas,
            total: colmenasFormateadas.length,
            dueno: duenoId
        });
        
    } catch (error) {
        console.error(`💥 Error obteniendo colmenas del dueño ${req.params.duenoId}:`, error);
        res.status(500).json({ 
            error: 'Error obteniendo colmenas del dueño',
            details: error.message 
        });
    } finally {
        if (connection) connection.release();
    }
});

// =============================================
// CREAR NUEVA COLMENA
// =============================================
router.post('/', async (req, res) => {
    let connection;
    try {
        console.log('➕ Creando nueva colmena con datos:', req.body);
        
        const { descripcion, latitud, longitud, dueno, nodo_interior, nodo_exterior } = req.body;
        
        // Validar campos requeridos según el esquema SQL
        if (!descripcion || !descripcion.trim()) {
            return res.status(400).json({ 
                error: 'La descripción es obligatoria' 
            });
        }
        
        if (!dueno || !dueno.trim()) {
            return res.status(400).json({ 
                error: 'El dueño es obligatorio' 
            });
        }
        
        // ✅ VALIDACIÓN CRÍTICA: latitud y longitud son NOT NULL en tu esquema
        if (!latitud || !longitud) {
            return res.status(400).json({ 
                error: 'Las coordenadas (latitud y longitud) son obligatorias' 
            });
        }
        
        connection = await pool.getConnection();
        
        // Verificar que el dueño existe
        const [duenoExists] = await connection.execute('SELECT id FROM usuario WHERE id = ? AND activo = 1', [dueno]);
        if (duenoExists.length === 0) {
            return res.status(400).json({ error: 'El usuario dueño no existe o está inactivo' });
        }
        
        // Validar coordenadas - tu esquema usa DECIMAL(10,7)
        const lat = parseFloat(latitud);
        const lng = parseFloat(longitud);
        
        if (isNaN(lat) || lat < -90 || lat > 90) {
            return res.status(400).json({ error: 'La latitud debe ser un número válido entre -90 y 90' });
        }
        
        if (isNaN(lng) || lng < -180 || lng > 180) {
            return res.status(400).json({ error: 'La longitud debe ser un número válido entre -180 y 180' });
        }
        
        // Validar precisión para DECIMAL(10,7) - máximo 3 dígitos antes del decimal, 7 después
        if (Math.abs(lat) >= 1000) {
            return res.status(400).json({ error: 'La latitud excede la precisión permitida' });
        }
        
        if (Math.abs(lng) >= 1000) {
            return res.status(400).json({ error: 'La longitud excede la precisión permitida' });
        }
        
        // Validar nodos si se proporcionan
        if (nodo_interior) {
            const [nodoIntExists] = await connection.execute('SELECT id FROM nodo WHERE id = ?', [nodo_interior]);
            if (nodoIntExists.length === 0) {
                return res.status(400).json({ error: 'El nodo interior especificado no existe' });
            }
            
            // Verificar que no esté ya asignado
            const [nodoIntAsignado] = await connection.execute('SELECT colmena_id FROM nodo_colmena WHERE nodo_id = ?', [nodo_interior]);
            if (nodoIntAsignado.length > 0) {
                return res.status(400).json({ error: 'El nodo interior ya está asignado a otra colmena' });
            }
        }
        
        if (nodo_exterior) {
            const [nodoExtExists] = await connection.execute('SELECT id FROM nodo WHERE id = ?', [nodo_exterior]);
            if (nodoExtExists.length === 0) {
                return res.status(400).json({ error: 'El nodo exterior especificado no existe' });
            }
            
            // Verificar que no esté ya asignado
            const [nodoExtAsignado] = await connection.execute('SELECT estacion_id FROM nodo_estacion WHERE nodo_id = ?', [nodo_exterior]);
            if (nodoExtAsignado.length > 0) {
                return res.status(400).json({ error: 'El nodo exterior ya está asignado a otra estación' });
            }
        }
        
        // Generar ID único para la colmena
        const colmenaId = `COL-${Date.now().toString()}-${Math.random().toString(36).substr(2, 6).toUpperCase()}`;
        
        // Iniciar transacción
        await connection.beginTransaction();
        
        try {
            // ✅ INSERTAR colmena con valores NOT NULL requeridos
            await connection.execute(`
                INSERT INTO colmena (id, descripcion, latitud, longitud, dueno) 
                VALUES (?, ?, ?, ?, ?)
            `, [colmenaId, descripcion.trim(), lat, lng, dueno.trim()]);
            
            console.log('✅ Colmena creada:', colmenaId);
            
            // Asignar nodo interior si se proporcionó
            if (nodo_interior) {
                await connection.execute(`
                    INSERT INTO nodo_colmena (colmena_id, nodo_id) 
                    VALUES (?, ?)
                `, [colmenaId, nodo_interior]);
                console.log('✅ Nodo interior asignado:', nodo_interior);
            }
            
            // Asignar nodo exterior si se proporcionó
            if (nodo_exterior) {
                // Crear estación asociada si no existe
                const estacionId = colmenaId; // Usar mismo ID para simplificar
                
                try {
                    await connection.execute(`
                        INSERT INTO estacion (id, descripcion, latitud, longitud, dueno) 
                        VALUES (?, ?, ?, ?, ?)
                    `, [estacionId, `Estación meteorológica - ${descripcion.trim()}`, lat, lng, dueno.trim()]);
                    console.log('✅ Estación creada:', estacionId);
                } catch (estacionError) {
                    // Si la estación ya existe, continuar
                    console.log('⚠️ Estación ya existe, continuando...');
                }
                
                await connection.execute(`
                    INSERT INTO nodo_estacion (estacion_id, nodo_id) 
                    VALUES (?, ?)
                `, [estacionId, nodo_exterior]);
                console.log('✅ Nodo exterior asignado:', nodo_exterior);
            }
            
            await connection.commit();
            console.log('✅ Transacción completada exitosamente');
            
            res.status(201).json({
                success: true,
                id: colmenaId,
                descripcion: descripcion.trim(),
                latitud: lat,
                longitud: lng,
                dueno: dueno.trim(),
                nodo_interior: nodo_interior || null,
                nodo_exterior: nodo_exterior || null,
                message: 'Colmena creada exitosamente'
            });
            
        } catch (error) {
            await connection.rollback();
            console.error('💥 Error en transacción:', error);
            throw error;
        }
        
    } catch (error) {
        console.error('💥 Error creando colmena:', error);
        console.error('💥 Error details:', {
            message: error.message,
            code: error.code,
            errno: error.errno,
            sql: error.sql
        });
        
        // Manejo específico de errores de MySQL
        if (error.code === 'ER_DUP_ENTRY') {
            return res.status(400).json({ 
                error: 'Ya existe una colmena con ese ID'
            });
        }
        
        if (error.code === 'ER_BAD_NULL_ERROR') {
            return res.status(400).json({ 
                error: 'Faltan campos obligatorios. Verifique que descripción, latitud, longitud y dueño estén completos.'
            });
        }
        
        if (error.code === 'ER_WARN_DATA_OUT_OF_RANGE') {
            return res.status(400).json({ 
                error: 'Los valores de latitud o longitud están fuera del rango permitido'
            });
        }
        
        res.status(500).json({ 
            error: 'Error creando colmena',
            details: process.env.NODE_ENV === 'development' ? error.message : 'Error interno del servidor'
        });
    } finally {
        if (connection) connection.release();
    }
});

// =============================================
// ACTUALIZAR COLMENA
// =============================================
router.put('/:id', async (req, res) => {
    let connection;
    try {
        const { id } = req.params;
        const { descripcion, latitud, longitud, dueno, nodo_interior, nodo_exterior } = req.body;
        
        console.log(`✏️ Actualizando colmena ${id}:`, req.body);
        
        connection = await pool.getConnection();
        
        // Verificar que la colmena existe
        const [colmenaExists] = await connection.execute('SELECT id FROM colmena WHERE id = ?', [id]);
        if (colmenaExists.length === 0) {
            return res.status(404).json({ error: 'Colmena no encontrada' });
        }
        
        // Validar campos requeridos
        if (!descripcion || !dueno) {
            return res.status(400).json({ 
                error: 'Descripción y dueño son obligatorios' 
            });
        }
        
        // Verificar que el dueño existe
        const [duenoExists] = await connection.execute('SELECT id FROM usuario WHERE id = ? AND activo = 1', [dueno]);
        if (duenoExists.length === 0) {
            return res.status(400).json({ error: 'El usuario dueño no existe o está inactivo' });
        }
        
        // Validar nodos si se proporcionan
        if (nodo_interior) {
            const [nodoIntExists] = await connection.execute('SELECT id FROM nodo WHERE id = ?', [nodo_interior]);
            if (nodoIntExists.length === 0) {
                return res.status(400).json({ error: 'El nodo interior especificado no existe' });
            }
            
            // Verificar que no esté asignado a otra colmena
            const [nodoIntAsignado] = await connection.execute('SELECT colmena_id FROM nodo_colmena WHERE nodo_id = ? AND colmena_id != ?', [nodo_interior, id]);
            if (nodoIntAsignado.length > 0) {
                return res.status(400).json({ error: 'El nodo interior ya está asignado a otra colmena' });
            }
        }
        
        if (nodo_exterior) {
            const [nodoExtExists] = await connection.execute('SELECT id FROM nodo WHERE id = ?', [nodo_exterior]);
            if (nodoExtExists.length === 0) {
                return res.status(400).json({ error: 'El nodo exterior especificado no existe' });
            }
            
            // Verificar que no esté asignado a otra estación
            const [nodoExtAsignado] = await connection.execute('SELECT estacion_id FROM nodo_estacion WHERE nodo_id = ? AND estacion_id != ?', [nodo_exterior, id]);
            if (nodoExtAsignado.length > 0) {
                return res.status(400).json({ error: 'El nodo exterior ya está asignado a otra estación' });
            }
        }
        
        // Iniciar transacción
        await connection.beginTransaction();
        
        try {
            // Actualizar colmena
            let updateQuery = 'UPDATE colmena SET descripcion = ?, dueno = ?';
            let updateParams = [descripcion.trim(), dueno];
            
            if (latitud && longitud) {
                const lat = parseFloat(latitud);
                const lng = parseFloat(longitud);
                
                if (isNaN(lat) || lat < -90 || lat > 90) {
                    throw new Error('La latitud debe ser un número entre -90 y 90');
                }
                
                if (isNaN(lng) || lng < -180 || lng > 180) {
                    throw new Error('La longitud debe ser un número entre -180 y 180');
                }
                
                updateQuery += ', latitud = ?, longitud = ?';
                updateParams.push(lat, lng);
            }
            
            updateQuery += ' WHERE id = ?';
            updateParams.push(id);
            
            await connection.execute(updateQuery, updateParams);
            
            // Actualizar nodo interior
            await connection.execute('DELETE FROM nodo_colmena WHERE colmena_id = ?', [id]);
            if (nodo_interior) {
                await connection.execute('INSERT INTO nodo_colmena (colmena_id, nodo_id) VALUES (?, ?)', [id, nodo_interior]);
            }
            
            // Actualizar nodo exterior
            await connection.execute('DELETE FROM nodo_estacion WHERE estacion_id = ?', [id]);
            if (nodo_exterior) {
                await connection.execute('INSERT INTO nodo_estacion (estacion_id, nodo_id) VALUES (?, ?)', [id, nodo_exterior]);
            }
            
            await connection.commit();
            console.log('✅ Colmena actualizada:', id);
            
            res.json({ 
                message: 'Colmena actualizada correctamente',
                id: id
            });
            
        } catch (error) {
            await connection.rollback();
            throw error;
        }
        
    } catch (error) {
        console.error('💥 Error actualizando colmena:', error);
        res.status(500).json({ 
            error: 'Error actualizando colmena',
            details: error.message 
        });
    } finally {
        if (connection) connection.release();
    }
});

// =============================================
// ELIMINAR COLMENA
// =============================================
router.delete('/:id', async (req, res) => {
    let connection;
    try {
        const { id } = req.params;
        
        console.log(`🗑️ Eliminando colmena ${id}`);
        
        connection = await pool.getConnection();
        
        // Verificar que la colmena existe
        const [colmenaExists] = await connection.execute('SELECT id, descripcion FROM colmena WHERE id = ?', [id]);
        if (colmenaExists.length === 0) {
            return res.status(404).json({ error: 'Colmena no encontrada' });
        }
        
        const colmena = colmenaExists[0];
        
        // Iniciar transacción
        await connection.beginTransaction();
        
        try {
            // Eliminar relaciones con nodos (nodo_colmena)
            await connection.execute('DELETE FROM nodo_colmena WHERE colmena_id = ?', [id]);
            console.log('✅ Relaciones nodo_colmena eliminadas');
            
            // Eliminar relaciones con estaciones (nodo_estacion) si existen
            await connection.execute('DELETE FROM nodo_estacion WHERE estacion_id = ?', [id]);
            console.log('✅ Relaciones nodo_estacion eliminadas');
            
            // Eliminar mensajes relacionados con nodos de esta colmena (si existen)
            try {
                await connection.execute(`
                    DELETE nm FROM nodo_mensaje nm 
                    INNER JOIN nodo_colmena nc ON nm.nodo_id = nc.nodo_id 
                    WHERE nc.colmena_id = ?
                `, [id]);
                console.log('✅ Mensajes de nodos eliminados');
            } catch (e) {
                console.log('⚠️ No se pudieron eliminar mensajes de nodos (normal si no hay datos)');
            }
            
            // Eliminar alertas relacionadas (si existen)
            try {
                await connection.execute(`
                    DELETE na FROM nodo_alerta na 
                    INNER JOIN nodo_colmena nc ON na.nodo_id = nc.nodo_id 
                    WHERE nc.colmena_id = ?
                `, [id]);
                console.log('✅ Alertas de nodos eliminadas');
            } catch (e) {
                console.log('⚠️ No se pudieron eliminar alertas de nodos (normal si no hay datos)');
            }
            
            // Eliminar estación asociada si existe
            try {
                await connection.execute('DELETE FROM estacion WHERE id = ?', [id]);
                console.log('✅ Estación asociada eliminada');
            } catch (e) {
                console.log('⚠️ No se pudo eliminar estación asociada (normal si no existe)');
            }
            
            // Finalmente eliminar la colmena
            await connection.execute('DELETE FROM colmena WHERE id = ?', [id]);
            console.log('✅ Colmena eliminada');
            
            await connection.commit();
            
            res.json({ 
                message: `Colmena "${colmena.descripcion}" eliminada correctamente`,
                id: id
            });
            
        } catch (error) {
            await connection.rollback();
            throw error;
        }
        
    } catch (error) {
        console.error('💥 Error eliminando colmena:', error);
        
        // Error específico para foreign key constraint
        if (error.code === 'ER_ROW_IS_REFERENCED_2') {
            return res.status(400).json({ 
                error: 'No se puede eliminar la colmena porque tiene registros asociados'
            });
        }
        
        res.status(500).json({ 
            error: 'Error eliminando colmena',
            details: error.message 
        });
    } finally {
        if (connection) connection.release();
    }
});

module.exports = router;