const express = require('express');
const bcrypt = require('bcryptjs');
const { pool } = require('../config/database');

const router = express.Router();

// =============================================
// RUTA DE LOGIN - ENDPOINT PRINCIPAL
// =============================================
router.post('/login', async (req, res) => {
    let connection;
    try {
        const { email, password, nombre, apellido } = req.body;
        
        console.log('🔐 Intento de login con datos:', { 
            email: email ? `"${email}"` : 'null', 
            nombre: nombre ? `"${nombre}"` : 'null', 
            apellido: apellido ? `"${apellido}"` : 'null' 
        });
        
        // Validar que se proporcionen las credenciales necesarias
        if (!password || password.trim() === '') {
            console.log('❌ Password faltante o vacío');
            return res.status(400).json({ 
                error: 'La contraseña es requerida' 
            });
        }

        // Validar que se proporcione al menos email o nombre+apellido
        if ((!email || email.trim() === '') && (!nombre || !apellido)) {
            console.log('❌ Faltan credenciales de identificación');
            return res.status(400).json({ 
                error: 'Se requiere email (ID) o nombre y apellido para el login' 
            });
        }

        // Obtener conexión a BD
        connection = await pool.getConnection();

        let usuario = null;

        // MÉTODO 1: Buscar por ID (email)
        if (email && email.trim()) {
            console.log('🔍 Buscando usuario por ID:', email);
            const [rows] = await connection.execute(`
                SELECT u.id, u.clave, u.nombre, u.apellido, u.comuna, u.rol, u.activo,
                    r.descripcion as rol_descripcion
                FROM usuario u
                LEFT JOIN rol r ON u.rol = r.rol
                WHERE u.id = ? AND u.activo = 1
            `, [email.trim()]);
            
            if (rows.length > 0) {
                usuario = rows[0];
                console.log('✅ Usuario encontrado por ID');
            } else {
                console.log('⚠️ No se encontró usuario con ID:', email);
            }
        }

        // MÉTODO 2: Buscar por nombre y apellido (si no se encontró por ID)
        if (!usuario && nombre && apellido) {
            console.log('🔍 Buscando usuario por nombre y apellido:', { nombre, apellido });
            const [rows] = await connection.execute(`
                SELECT u.id, u.clave, u.nombre, u.apellido, u.comuna, u.rol, u.activo,
                    r.descripcion as rol_descripcion
                FROM usuario u
                LEFT JOIN rol r ON u.rol = r.rol
                WHERE LOWER(TRIM(u.nombre)) = LOWER(TRIM(?)) 
                AND LOWER(TRIM(u.apellido)) = LOWER(TRIM(?)) 
                AND u.activo = 1
            `, [nombre.trim(), apellido.trim()]);
            
            if (rows.length > 0) {
                usuario = rows[0];
                console.log('✅ Usuario encontrado por nombre y apellido');
            } else {
                console.log('⚠️ No se encontró usuario con nombre y apellido:', { nombre, apellido });
            }
        }

        // Si no se encontró usuario por ningún método
        if (!usuario) {
            console.log('❌ Usuario no encontrado con las credenciales proporcionadas');
            return res.status(401).json({ 
                error: 'Credenciales inválidas. Verifique su ID/nombre, apellido y contraseña.' 
            });
        }
        
        // Verificar contraseña
        let validPassword = false;

        try {
            if (usuario.clave.startsWith('$2a$') || usuario.clave.startsWith('$2b$')) {
                // Contraseña hasheada con bcrypt
                validPassword = await bcrypt.compare(password, usuario.clave);
                console.log('🔐 Verificación con bcrypt:', validPassword ? 'exitosa' : 'falló');
            } else {
                // Contraseña en texto plano (fallback para desarrollo)
                validPassword = (usuario.clave === password);
                console.log('🔐 Verificación texto plano:', validPassword ? 'exitosa' : 'falló');
            }
        } catch (bcryptError) {
            console.error('💥 Error en verificación de contraseña:', bcryptError.message);
            validPassword = (usuario.clave === password); // Fallback
        }
        
        if (!validPassword) {
            console.log('❌ Contraseña inválida para usuario:', usuario.id);
            return res.status(401).json({ 
                error: 'Credenciales inválidas. Verifique su contraseña.' 
            });
        }
        
        console.log('✅ Login exitoso para usuario:', { 
            id: usuario.id, 
            nombre: usuario.nombre, 
            apellido: usuario.apellido,
            rol: usuario.rol,
            rol_descripcion: usuario.rol_descripcion
        });
        
        // Generar token simple (en producción usar JWT)
        const token = `smartbee_${usuario.id}_${Date.now()}`;
        
        // Respuesta exitosa compatible con el frontend
        res.json({
            data: {
                token: token,
                usuario: {
                    id: usuario.id,
                    nombre: usuario.nombre,
                    apellido: usuario.apellido,
                    email: usuario.id, // Mantener compatibilidad con frontend
                    comuna: usuario.comuna,
                    rol: usuario.rol, // Código del rol (ADM, API, etc.)
                    rol_nombre: usuario.rol_descripcion || 'Usuario' // Descripción del rol
                }
            },
            message: 'Login exitoso'
        });
        
    } catch (error) {
        console.error('💥 Error en login:', error);
        console.error('💥 Error stack:', error.stack);
        
        res.status(500).json({ 
            error: 'Error interno del servidor',
            details: process.env.NODE_ENV === 'development' ? error.message : 'Error interno'
        });
    } finally {
        if (connection) connection.release();
    }
});

// =============================================
// OBTENER TODOS LOS USUARIOS
// =============================================
router.get('/', async (req, res) => {
    let connection;
    try {
        console.log('📋 Obteniendo lista de usuarios...');
        
        connection = await pool.getConnection();
        
        const [rows] = await connection.execute(`
            SELECT u.id, u.nombre, u.apellido, u.comuna, u.rol, u.activo,
                r.descripcion as rol_nombre
            FROM usuario u 
            LEFT JOIN rol r ON u.rol = r.rol 
            WHERE u.activo = 1
            ORDER BY u.apellido ASC, u.nombre ASC
        `);
        
        // Formatear para compatibilidad con frontend
        const usuarios = rows.map(user => ({
            id: user.id,
            nombre: user.nombre,
            apellido: user.apellido,
            comuna: user.comuna,
            email: user.id, // Compatibilidad
            telefono: '', // Campo requerido por frontend
            fecha_registro: new Date().toISOString(), // Campo requerido por frontend
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
// OBTENER USUARIO POR ID
// =============================================
router.get('/:id', async (req, res) => {
    let connection;
    try {
        const { id } = req.params;
        console.log(`🔍 Obteniendo usuario: ${id}`);
        
        connection = await pool.getConnection();
        
        const [rows] = await connection.execute(`
            SELECT u.id, u.nombre, u.apellido, u.comuna, u.rol, u.activo,
                r.descripcion as rol_nombre
            FROM usuario u
            LEFT JOIN rol r ON u.rol = r.rol
            WHERE u.id = ? AND u.activo = 1
        `, [id]);
        
        if (rows.length === 0) {
            return res.status(404).json({ error: 'Usuario no encontrado' });
        }
        
        const usuario = rows[0];
        
        // Formatear respuesta
        const usuarioFormateado = {
            id: usuario.id,
            nombre: usuario.nombre,
            apellido: usuario.apellido,
            comuna: usuario.comuna,
            email: usuario.id,
            telefono: '',
            fecha_registro: new Date().toISOString(),
            rol: usuario.rol,
            rol_nombre: usuario.rol_nombre || 'Usuario',
            activo: usuario.activo
        };
        
        console.log('✅ Usuario obtenido:', usuario.id);
        res.json(usuarioFormateado);
        
    } catch (error) {
        console.error('💥 Error obteniendo usuario por ID:', error);
        res.status(500).json({ 
            error: 'Error obteniendo usuario',
            details: error.message 
        });
    } finally {
        if (connection) connection.release();
    }
});

// =============================================
// CREAR NUEVO USUARIO
// =============================================
router.post('/', async (req, res) => {
    let connection;
    try {
        console.log('➕ Creando nuevo usuario...');
        console.log('📋 Datos recibidos:', req.body);
        
        connection = await pool.getConnection();
        
        // Extraer y validar datos
        const { id, nombre, apellido, comuna, clave, rol, activo } = req.body;
        
        console.log('📝 Datos procesados:', { 
            id: id ? `"${id}"` : '[AUTO-GENERADO]', 
            nombre: `"${nombre}"`, 
            apellido: `"${apellido}"`, 
            comuna: `"${comuna}"`,
            rol: `"${rol}"`,
            activo: activo
        });
        
        // VALIDACIONES
        if (!nombre || nombre.trim() === '') {
            return res.status(400).json({ error: 'El nombre es obligatorio' });
        }
        
        if (!apellido || apellido.trim() === '') {
            return res.status(400).json({ error: 'El apellido es obligatorio' });
        }

        if (!comuna || comuna.trim() === '') {
            return res.status(400).json({ error: 'La comuna es obligatoria' });
        }
        
        if (!clave || clave.trim() === '') {
            return res.status(400).json({ error: 'La clave es obligatoria' });
        }
        
        if (!rol || rol.trim() === '') {
            return res.status(400).json({ error: 'El rol es obligatorio' });
        }
        
        // Generar ID si no se proporciona
        const userId = id && id.trim() ? id.trim() : `USR_${Date.now()}_${Math.random().toString(36).substr(2, 6).toUpperCase()}`;
        console.log('🆔 ID a usar:', userId);
        
        // Verificar que el ID no exista
        const [existingUser] = await connection.execute('SELECT id FROM usuario WHERE id = ?', [userId]);
        if (existingUser.length > 0) {
            return res.status(400).json({ 
                error: `Ya existe un usuario con el ID: ${userId}` 
            });
        }
        
        // Verificar que el rol existe
        const [rolExists] = await connection.execute('SELECT rol FROM rol WHERE rol = ?', [rol.trim()]);
        if (rolExists.length === 0) {
            return res.status(400).json({ 
                error: `El rol '${rol}' no existe. Roles válidos: ADM, API` 
            });
        }
        
        // Hashear contraseña
        const hashedPassword = await bcrypt.hash(clave.trim(), 12);
        console.log('🔐 Contraseña hasheada exitosamente');
        
        // Insertar usuario
        const insertQuery = `
            INSERT INTO usuario (id, clave, nombre, apellido, comuna, rol, activo) 
            VALUES (?, ?, ?, ?, ?, ?, ?)
        `;
        const insertParams = [
            userId, 
            hashedPassword,
            nombre.trim(), 
            apellido.trim(), 
            comuna.trim(),
            rol.trim(), 
            activo !== undefined ? (activo ? 1 : 0) : 1
        ];
        
        console.log('💾 Ejecutando INSERT...');
        const [result] = await connection.execute(insertQuery, insertParams);
        
        console.log('✅ Usuario creado exitosamente con ID:', userId);
        
        // Respuesta exitosa
        res.status(201).json({ 
            success: true,
            message: 'Usuario creado exitosamente',
            usuario: {
                id: userId,
                nombre: nombre.trim(),
                apellido: apellido.trim(),
                comuna: comuna.trim(),
                email: userId,
                telefono: '',
                fecha_registro: new Date().toISOString(),
                rol: rol.trim(),
                rol_nombre: 'Usuario',
                activo: activo !== undefined ? (activo ? 1 : 0) : 1
            }
        });
        
    } catch (error) {
        console.error('💥 Error creando usuario:', error);
        
        // Manejo específico de errores
        if (error.code === 'ER_DUP_ENTRY') {
            return res.status(400).json({ 
                error: 'Ya existe un usuario con ese ID'
            });
        }
        
        if (error.code === 'ER_NO_REFERENCED_ROW_2') {
            return res.status(400).json({ 
                error: 'El rol especificado no existe'
            });
        }
        
        res.status(500).json({ 
            error: 'Error creando usuario',
            details: process.env.NODE_ENV === 'development' ? error.message : 'Error interno'
        });
    } finally {
        if (connection) connection.release();
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
        
        // Validar campos requeridos
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
        
        // Preparar consulta de actualización
        let updateQuery;
        let updateParams;
        
        if (clave && clave.trim()) {
            // Actualizar con nueva clave
            const hashedPassword = await bcrypt.hash(clave.trim(), 12);
            console.log('🔐 Nueva contraseña hasheada');
            
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
        
        // Obtener usuario actualizado
        const [updatedUser] = await connection.execute(`
            SELECT u.id, u.nombre, u.apellido, u.comuna, u.rol, u.activo,
                r.descripcion as rol_nombre
            FROM usuario u
            LEFT JOIN rol r ON u.rol = r.rol
            WHERE u.id = ?
        `, [id]);
        
        const usuario = updatedUser[0];
        
        res.json({ 
            message: 'Usuario actualizado correctamente',
            usuario: {
                id: usuario.id,
                nombre: usuario.nombre,
                apellido: usuario.apellido,
                comuna: usuario.comuna,
                email: usuario.id,
                telefono: '',
                fecha_registro: new Date().toISOString(),
                rol: usuario.rol,
                rol_nombre: usuario.rol_nombre || 'Usuario',
                activo: usuario.activo
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
// ELIMINAR USUARIO (SOFT DELETE)
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