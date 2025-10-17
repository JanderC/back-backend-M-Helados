/**
 * Middleware para verificar roles de usuario
 */

/**
 * Verificar si el usuario es ADMINISTRADOR
 */
const isAdmin = (req, res, next) => {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'No autenticado'
      });
    }

    if (req.user.rol !== 'ADMINISTRADOR') {
      return res.status(403).json({
        success: false,
        message: 'Acceso denegado - Se requiere rol de Administrador'
      });
    }

    next();
  } catch (error) {
    console.error('Error en middleware isAdmin:', error);
    return res.status(500).json({
      success: false,
      message: 'Error al verificar permisos'
    });
  }
};

/**
 * Verificar si el usuario es DESPENSADOR o ADMINISTRADOR
 */
const isDespensadorOrAdmin = (req, res, next) => {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'No autenticado'
      });
    }

    const rolesPermitidos = ['ADMINISTRADOR', 'DESPENSADOR', 'EMPLEADO'];
    
    if (!rolesPermitidos.includes(req.user.rol)) {
      return res.status(403).json({
        success: false,
        message: 'Acceso denegado - Permisos insuficientes'
      });
    }

    next();
  } catch (error) {
    console.error('Error en middleware isDespensadorOrAdmin:', error);
    return res.status(500).json({
      success: false,
      message: 'Error al verificar permisos'
    });
  }
};

/**
 * Verificar múltiples roles permitidos
 * @param {Array} roles - Array de roles permitidos
 */
const hasRole = (...roles) => {
  return (req, res, next) => {
    try {
      if (!req.user) {
        return res.status(401).json({
          success: false,
          message: 'No autenticado'
        });
      }

      if (!roles.includes(req.user.rol)) {
        return res.status(403).json({
          success: false,
          message: `Acceso denegado - Se requiere uno de los siguientes roles: ${roles.join(', ')}`
        });
      }

      next();
    } catch (error) {
      console.error('Error en middleware hasRole:', error);
      return res.status(500).json({
        success: false,
        message: 'Error al verificar permisos'
      });
    }
  };
};

/**
 * Verificar si el usuario puede modificar recursos
 * Solo admin o el propio usuario
 */
const canModifyUser = (req, res, next) => {
  try {
    const targetUserId = parseInt(req.params.id || req.body.id_usuario);
    
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'No autenticado'
      });
    }

    // Admin puede modificar cualquier usuario
    if (req.user.rol === 'ADMINISTRADOR') {
      return next();
    }

    // Usuario solo puede modificarse a sí mismo
    if (req.user.id_usuario === targetUserId) {
      return next();
    }

    return res.status(403).json({
      success: false,
      message: 'No tienes permisos para modificar este usuario'
    });

  } catch (error) {
    console.error('Error en middleware canModifyUser:', error);
    return res.status(500).json({
      success: false,
      message: 'Error al verificar permisos'
    });
  }
};

module.exports = {
  isAdmin,
  isDespensadorOrAdmin,
  hasRole,
  canModifyUser
};