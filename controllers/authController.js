const bcrypt = require('bcryptjs');
const { query } = require('../config/database');
const { generateToken } = require('../config/jwt');

/**
 * Login de usuario
 * POST /api/auth/login
 */
const login = async (req, res) => {
  try {
    const { username, password } = req.body;

    // Validar campos requeridos
    if (!username || !password) {
      return res.status(400).json({
        success: false,
        message: 'Usuario y contraseña son requeridos'
      });
    }

    // Buscar usuario con su rol
    const result = await query(
      `SELECT u.*, r.nombre_rol as rol 
       FROM usuarios u
       JOIN roles r ON u.id_rol = r.id_rol
       WHERE u.username = $1 AND u.activo = true`,
      [username]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({
        success: false,
        message: 'Credenciales inválidas'
      });
    }

    const usuario = result.rows[0];

    // Verificar contraseña
    const isMatch = await bcrypt.compare(password, usuario.password_hash);

    if (!isMatch) {
      return res.status(401).json({
        success: false,
        message: 'Credenciales inválidas'
      });
    }

    // Actualizar última sesión
    await query(
      'UPDATE usuarios SET ultima_sesion = CURRENT_TIMESTAMP WHERE id_usuario = $1',
      [usuario.id_usuario]
    );

    // Generar token
    const token = generateToken({
      id_usuario: usuario.id_usuario,
      username: usuario.username,
      nombre_completo: usuario.nombre_completo,
      email: usuario.email,
      rol: usuario.rol,
      id_rol: usuario.id_rol
    });

    // Respuesta exitosa
    res.json({
      success: true,
      message: 'Login exitoso',
      data: {
        token,
        usuario: {
          id_usuario: usuario.id_usuario,
          nombre_completo: usuario.nombre_completo,
          username: usuario.username,
          email: usuario.email,
          rol: usuario.rol,
          id_rol: usuario.id_rol
        }
      }
    });

  } catch (error) {
    console.error('Error en login:', error);
    res.status(500).json({
      success: false,
      message: 'Error al iniciar sesión'
    });
  }
};

/**
 * Verificar token
 * GET /api/auth/verify
 */
const verifyUser = async (req, res) => {
  try {
    // El middleware ya verificó el token
    res.json({
      success: true,
      data: {
        usuario: req.user
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error al verificar usuario'
    });
  }
};

/**
 * Cambiar contraseña
 * PUT /api/auth/change-password
 */
const changePassword = async (req, res) => {
  try {
    const { passwordActual, passwordNueva } = req.body;
    const idUsuario = req.user.id_usuario;

    if (!passwordActual || !passwordNueva) {
      return res.status(400).json({
        success: false,
        message: 'Contraseña actual y nueva son requeridas'
      });
    }

    if (passwordNueva.length < 6) {
      return res.status(400).json({
        success: false,
        message: 'La nueva contraseña debe tener al menos 6 caracteres'
      });
    }

    // Obtener contraseña actual
    const result = await query(
      'SELECT password_hash FROM usuarios WHERE id_usuario = $1',
      [idUsuario]
    );

    const usuario = result.rows[0];

    // Verificar contraseña actual
    const isMatch = await bcrypt.compare(passwordActual, usuario.password_hash);

    if (!isMatch) {
      return res.status(401).json({
        success: false,
        message: 'Contraseña actual incorrecta'
      });
    }

    // Hash de nueva contraseña
    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(passwordNueva, salt);

    // Actualizar contraseña
    await query(
      'UPDATE usuarios SET password_hash = $1 WHERE id_usuario = $2',
      [passwordHash, idUsuario]
    );

    res.json({
      success: true,
      message: 'Contraseña actualizada exitosamente'
    });

  } catch (error) {
    console.error('Error al cambiar contraseña:', error);
    res.status(500).json({
      success: false,
      message: 'Error al cambiar contraseña'
    });
  }
};

module.exports = {
  login,
  verifyUser,
  changePassword
};