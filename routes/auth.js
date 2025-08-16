const express = require('express');
const bcrypt = require('bcryptjs');
const { pool } = require('../config/database');

const router = express.Router();

// =============================================
// RUTA DE LOGIN
// =============================================
router.post('/login', async (req, res) => {
    let connection;
    try {
        const { email, password, nombre, apellido } = req.body;
        
        console.log('🔐 Login attempt con datos:', { email, nombre, apellido });
        
        // Validar que se proporcionen las credenciales necesarias
        if (!password || password.trim() === '') {
            return res.status(400).json({ 
                error: 'La contraseña es requerida' 
            });
        }

        // Aceptar tanto email (ID) como nombre+apellido
        let usuario = null;
        connection = await pool.getConnection();

        if (email && email.trim()) {
            // Buscar por ID (modo original)
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
            }
        }

        // Si no se encontró por ID, buscar por nombre y apellido
        if (!usuario && nombre && apellido) {
            console.log('🔍 Buscando usuario por nombre y apellido:', { nombre, apellido });
            const [rows] = await connection.execute(`
                SELECT u.id, u.clave, u.nombre, u.apellido, u.comuna, u.rol, u.activo,
                    r.descripcion as rol_descripcion
                FROM usuario u
                LEFT JOIN rol r ON u.rol = r.rol
                WHERE LOWER(u.nombre) = LOWER(?) AND LOWER(u.apellido) = LOWER(?) AND u.activo = 1
            `, [nombre.trim(), apellido.trim()]);
            
            if (rows.length > 0) {
                usuario = rows[0];
                console.log('✅ Usuario encontrado por nombre y apellido');
            }
        }

        // Si aún no se encontró usuario
        if (!usuario) {
            console.log('❌ Usuario no encontrado con las credenciales proporcionadas');
            return res.status(401).json({ 
                error: 'Credenciales inválidas. Verifique su nombre, apellido y contraseña.' 
            });
        }
        
        // Verificar contraseña
        let validPassword = false;

        if (usuario.clave.startsWith('$2a$') || usuario.clave.startsWith('$2b$')) {
            // Contraseña hasheada con bcrypt
            validPassword = await bcrypt.compare(password, usuario.clave);
        } else {
            // Contraseña en texto plano (fallback)
            validPassword = (usuario.clave === password);
        }
        
        if (!validPassword) {
            console.log('❌ Contraseña inválida para usuario:', usuario.id);
            return res.status(401).json({ 
                error: 'Credenciales inválidas. Verifique su contraseña.' 
            });
        }
        
        console.log('✅ Login exitoso:', { 
            id: usuario.id, 
            nombre: usuario.nombre, 
            apellido: usuario.apellido,
            rol: usuario.rol,
            rol_descripcion: usuario.rol_descripcion
        });
        
        const token = `smartbee_${usuario.id}_${Date.now()}`;
        
        res.json({
            data: {
                token: token,
                usuario: {
                    id: usuario.id,
                    nombre: usuario.nombre,
                    apellido: usuario.apellido,
                    email: usuario.id, // Mantener compatibilidad
                    comuna: usuario.comuna,
                    rol: usuario.rol, // Código del rol (ADM, API, etc.)
                    rol_nombre: usuario.rol_descripcion || 'Usuario' // Descripción del rol
                }
            },
            message: 'Login exitoso'
        });
        
    } catch (error) {
        console.error('💥 Error en login:', error);
        res.status(500).json({ 
            error: 'Error interno del servidor'
        });
    } finally {
        if (connection) connection.release();
    }
});

module.exports = router;