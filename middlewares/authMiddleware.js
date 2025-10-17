const { verifyToken } = require('../config/jwt');

/**
 * Middleware para proteger rutas - Verificar JWT
 */
const authenticate = (req, res, next) => {
  try {
    // Obtener token del header
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        message: 'No autorizado - Token no proporcionado'
      });
    }

    const token = authHeader.substring(7); // Remover "Bearer "

    // Verificar token
    const decoded = verifyToken(token);

    // Agregar datos del usuario a la request
    req.user = {
      id_usuario: decoded.id_usuario,
      username: decoded.username,
      nombre_completo: decoded.nombre_completo,
      email: decoded.email,
      rol: decoded.rol,
      id_rol: decoded.id_rol
    };

    next();
  } catch (error) {
    console.error('Error en autenticación:', error.message);
    
    return res.status(401).json({
      success: false,
      message: error.message || 'Token inválido o expirado'
    });
  }
};

/**
 * Middleware opcional - No requiere token pero lo valida si existe
 */
const optionalAuth = (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.substring(7);
      const decoded = verifyToken(token);
      
      req.user = {
        id_usuario: decoded.id_usuario,
        username: decoded.username,
        rol: decoded.rol
      };
    }
    
    next();
  } catch (error) {
    // Si hay error, continuar sin usuario autenticado
    next();
  }
};

module.exports = {
  authenticate,
  optionalAuth
};