const express = require('express');
const bcrypt = require('bcryptjs');
const { pool } = require('../config/database');

const router = express.Router();

// =============================================
// OBTENER TODOS LOS USUARIOS
// =============================================
router.get('/', async (req, res) => {
    let connection;
    try {
        console.log('📋 Obteniendo usuarios...');
        
        connection = await pool.getConnection();
        
        const [rows] = await connection.execute(`
        SELECT u.id, u.nombre, u.apellido, u.comuna, u.clave, u.rol, u.activo,
            r.descripcion as rol_nombre
        FROM usuario u 
        LEFT JOIN rol r ON u.rol = r.rol 
        WHERE u.activo = 1
        ORDER BY u.id ASC
    `);
        
        const usuarios = rows.map(user => ({
            id: user.id,
            nombre: user.nombre,
            apellido: user.apellido,
            comuna: user.comuna,
            email: user.id,
            telefono: '',
            fecha_registro: new Date().toISOString(),
            rol: user.rol,
            rol_nombre: user.rol_nombre || 'Usuario',
            activo: user.activo
        }));
        
        console.log('✅ Usuarios obtenidos:', usuarios.length);
        res.json(usuarios);
    } catch (error) {
        console.error('💥 Error obteniendo usuarios:', error);
        res.status(500).json({ 
            error: 'Error obteniendo usuarios',
            details: error.message 
        });
    } finally {
        if (connection) connection.release();
    }
});

// =============================================
// CREAR USUARIO
// =============================================
router.post('/', async (req, res) => {
    let connection;
    try {
        console.log('\n🔥 CREANDO USUARIO...');
        console.log('📋 Body RAW:', req.body);
        
        connection = await pool.getConnection();
        console.log('✅ Conexión obtenida');
        
        // Extract data including new comuna field
        const { id, nombre, apellido, comuna, clave, rol, activo } = req.body;
        console.log('📝 Datos extraídos:', { 
            id: `"${id}"`, 
            nombre: `"${nombre}"`, 
            apellido: `"${apellido}"`, 
            comuna: `"${comuna}"`,
            clave: clave ? `"${clave}"` : '[FALTANTE]', 
            rol: `"${rol}"`,
            activo: activo
        });
        
        // VALIDACIONES ACTUALIZADAS
        if (!nombre || nombre.trim() === '') {
            console.log('❌ Nombre faltante o vacío');
            return res.status(400).json({ 
                error: 'El nombre es obligatorio' 
            });
        }
        
        if (!apellido || apellido.trim() === '') {
            console.log('❌ Apellido faltante o vacío');
            return res.status(400).json({ 
                error: 'El apellido es obligatorio' 
            });
        }

        // Nueva validación para comuna
        if (!comuna || comuna.trim() === '') {
            console.log('❌ Comuna faltante o vacía');
            return res.status(400).json({ 
                error: 'La comuna es obligatoria' 
            });
        }
        
        if (!clave || clave.trim() === '') {
            console.log('❌ Clave faltante o vacía');
            return res.status(400).json({ 
                error: 'La clave es obligatoria' 
            });
        }
        
        if (!rol || rol.trim() === '') {
            console.log('❌ Rol faltante o vacío');
            return res.status(400).json({ 
                error: 'El rol es obligatorio' 
            });
        }
        
        console.log('✅ Todos los campos válidos');
        
        // Generate ID if not provided, or use provided one
        const userId = id && id.trim() ? id.trim() : `USR_${Date.now()}`;
        console.log('🆔 ID a usar:', userId);
        
        // Check if user with same id already exists
        const [existingUser] = await connection.execute('SELECT id FROM usuario WHERE id = ?', [userId]);
        if (existingUser.length > 0) {
            return res.status(400).json({ 
                error: `Ya existe un usuario con el ID: ${userId}` 
            });
        }
        
        // Verify that the role exists
        const [rolExists] = await connection.execute('SELECT rol FROM rol WHERE rol = ?', [rol.trim()]);
        if (rolExists.length === 0) {
            console.log('❌ Rol no válido:', rol);
            return res.status(400).json({ 
                error: `El rol '${rol}' no existe. Use uno de los roles válidos.` 
            });
        }
        
        const hashedPassword = await bcrypt.hash(clave.trim(), 12);
        console.log('🔐 Contraseña hasheada exitosamente en el servidor');
        
        // Execute INSERT with comuna field
        console.log('💾 Ejecutando INSERT...');
        const insertQuery = 'INSERT INTO usuario (id, clave, nombre, apellido, comuna, rol, activo) VALUES (?, ?, ?, ?, ?, ?, ?)';
        const insertParams = [
            userId, 
            hashedPassword,
            nombre.trim(), 
            apellido.trim(), 
            comuna.trim(),
            rol.trim(), 
            activo !== undefined ? (activo ? 1 : 0) : 1
        ];
        
        console.log('📝 Query:', insertQuery);
        console.log('📝 Params:', insertParams.map((p, i) => i === 1 ? '[PASSWORD_HASH_HIDDEN]' : p));        
        const [result] = await connection.execute(insertQuery, insertParams);
        
        console.log('✅ INSERT ejecutado exitosamente');
        console.log('📊 Resultado:', result);
        
        // Return success response
        res.status(201).json({ 
            success: true,
            message: 'Usuario creado exitosamente',
            usuario: {
                id: userId,
                nombre: nombre.trim(),
                apellido: apellido.trim(),
                comuna: comuna.trim(),
                rol: rol.trim(),
                activo: activo !== undefined ? (activo ? 1 : 0) : 1
            }
        });
        
    } catch (error) {
        console.error('💥 ERROR COMPLETO:', error);
        console.error('📋 Error details:', {
            message: error.message,
            code: error.code,
            errno: error.errno,
            sql: error.sql,
            sqlState: error.sqlState,
            sqlMessage: error.sqlMessage
        });
        
        // Handle duplicate key error
        if (error.code === 'ER_DUP_ENTRY') {
            return res.status(400).json({ 
                error: 'Ya existe un usuario con ese ID'
            });
        }
        
        res.status(500).json({ 
            error: 'Error creando usuario',
            details: error.message
        });
    } finally {
        if (connection) {
            connection.release();
            console.log('🔓 Conexión liberada');
        }
    }
});

// =============================================
// ACTUALIZAR USUARIO
// =============================================
router.put('/:id', async (req, res) => {
    let connection;
    try {
        const { id } = req.params;
        const { nombre, apellido, comuna, clave, rol, activo } = req.body;
        
        console.log(`✏️ Actualizando usuario ${id}:`, req.body);
        
        connection = await pool.getConnection();
        
        // Verificar que el usuario existe
        const [userExists] = await connection.execute('SELECT id FROM usuario WHERE id = ? AND activo = 1', [id]);
        if (userExists.length === 0) {
            return res.status(404).json({ error: 'Usuario no encontrado' });
        }
        
        // Validar campos requeridos incluyendo comuna
        if (!nombre || !apellido || !comuna || !rol) {
            return res.status(400).json({ 
                error: 'Nombre, apellido, comuna y rol son obligatorios' 
            });
        }
        
        // Verificar que el rol existe
        const [rolExists] = await connection.execute('SELECT rol FROM rol WHERE rol = ?', [rol]);
        if (rolExists.length === 0) {
            return res.status(400).json({ 
                error: `El rol '${rol}' no existe. Roles válidos: ADM, API` 
            });
        }
        
        // Preparar la consulta de actualización con comuna
        let updateQuery;
        let updateParams;
        
        if (clave && clave.trim()) {
            const hashedPassword = await bcrypt.hash(clave.trim(), 12);
            console.log('🔐 Contraseña actualizada y hasheada en el servidor');
            // Actualizar con nueva clave
            updateQuery = `
                UPDATE usuario 
                SET nombre = ?, apellido = ?, comuna = ?, clave = ?, rol = ?, activo = ?
                WHERE id = ?
            `;
            updateParams = [
                nombre.trim(), 
                apellido.trim(), 
                comuna.trim(), 
                hashedPassword, 
                rol, 
                activo !== undefined ? (activo ? 1 : 0) : 1,
                id
            ];
        } else {
            // Actualizar sin cambiar la clave
            updateQuery = `
                UPDATE usuario 
                SET nombre = ?, apellido = ?, comuna = ?, rol = ?, activo = ?
                WHERE id = ?
            `;
            updateParams = [
                nombre.trim(), 
                apellido.trim(), 
                comuna.trim(), 
                rol, 
                activo !== undefined ? (activo ? 1 : 0) : 1,
                id
            ];
        }
        
        // Ejecutar actualización
        await connection.execute(updateQuery, updateParams);
        
        console.log('✅ Usuario actualizado:', id);
        
        // Obtener el usuario actualizado para devolverlo
        const [updatedUser] = await connection.execute(`
            SELECT u.id, u.nombre, u.apellido, u.comuna, u.rol, u.activo,
                r.descripcion as rol_nombre
            FROM usuario u
            LEFT JOIN rol r ON u.rol = r.rol
            WHERE u.id = ?
        `, [id]);
        
        res.json({ 
            message: 'Usuario actualizado correctamente',
            usuario: {
                id: updatedUser[0].id,
                nombre: updatedUser[0].nombre,
                apellido: updatedUser[0].apellido,
                comuna: updatedUser[0].comuna,
                email: updatedUser[0].id,
                telefono: '',
                fecha_registro: new Date().toISOString(),
                rol: updatedUser[0].rol,
                rol_nombre: updatedUser[0].rol_nombre || 'Usuario',
                activo: updatedUser[0].activo
            }
        });
        
    } catch (error) {
        console.error('💥 Error actualizando usuario:', error);
        res.status(500).json({ 
            error: 'Error actualizando usuario',
            details: process.env.NODE_ENV === 'development' ? error.message : 'Error interno'
        });
    } finally {
        if (connection) connection.release();
    }
});

// =============================================
// ELIMINAR USUARIO
// =============================================
router.delete('/:id', async (req, res) => {
    let connection;
    try {
        const { id } = req.params;
        
        console.log(`🗑️ Eliminando usuario ${id}`);
        
        connection = await pool.getConnection();
        
        // Verificar que el usuario existe
        const [userExists] = await connection.execute('SELECT id, nombre, apellido FROM usuario WHERE id = ? AND activo = 1', [id]);
        if (userExists.length === 0) {
            return res.status(404).json({ error: 'Usuario no encontrado' });
        }
        
        const usuario = userExists[0];
        
        // Verificar si el usuario tiene colmenas asociadas
        const [colmenasAsociadas] = await connection.execute('SELECT COUNT(*) as count FROM colmena WHERE dueno = ?', [id]);
        
        if (colmenasAsociadas[0].count > 0) {
            return res.status(400).json({ 
                error: `No se puede eliminar el usuario porque tiene ${colmenasAsociadas[0].count} colmena(s) asociada(s). Primero transfiere o elimina las colmenas.`
            });
        }
        
        // Soft delete - marcar como inactivo
        await connection.execute('UPDATE usuario SET activo = 0 WHERE id = ?', [id]);
        
        console.log('✅ Usuario marcado como inactivo:', id);
        res.json({ 
            message: `Usuario "${usuario.nombre} ${usuario.apellido}" eliminado correctamente`,
            id: id
        });
        
    } catch (error) {
        console.error('💥 Error eliminando usuario:', error);
        
        // Error específico para foreign key constraint
        if (error.code === 'ER_ROW_IS_REFERENCED_2') {
            return res.status(400).json({ 
                error: 'No se puede eliminar el usuario porque tiene registros asociados (colmenas, estaciones, etc.)'
            });
        }
        
        res.status(500).json({ 
            error: 'Error eliminando usuario',
            details: process.env.NODE_ENV === 'development' ? error.message : 'Error interno'
        });
    } finally {
        if (connection) connection.release();
    }
});

module.exports = router;