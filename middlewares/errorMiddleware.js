/**
 * Middleware para manejo centralizado de errores
 */

/**
 * Manejador de errores 404 - Ruta no encontrada
 */
const notFound = (req, res, next) => {
  const error = new Error(`Ruta no encontrada - ${req.originalUrl}`);
  res.status(404);
  next(error);
};

/**
 * Manejador de errores general
 */
const errorHandler = (err, req, res, next) => {
  // Si ya se envió la respuesta, delegar al manejador por defecto
  if (res.headersSent) {
    return next(err);
  }

  const statusCode = res.statusCode === 200 ? 500 : res.statusCode;
  
  // Log del error para debugging
  console.error('❌ Error capturado:', {
    message: err.message,
    stack: process.env.NODE_ENV === 'production' ? '🥞' : err.stack,
    url: req.originalUrl,
    method: req.method,
    ip: req.ip,
    user: req.user?.username || 'No autenticado'
  });

  // Respuesta al cliente
  res.status(statusCode).json({
    success: false,
    message: err.message || 'Error interno del servidor',
    ...(process.env.NODE_ENV === 'development' && {
      stack: err.stack,
      error: err
    })
  });
};

/**
 * Manejador de errores de validación
 */
const validationErrorHandler = (errors) => {
  const formattedErrors = errors.map(err => ({
    field: err.param,
    message: err.msg,
    value: err.value
  }));

  return {
    success: false,
    message: 'Error de validación',
    errors: formattedErrors
  };
};

/**
 * Manejador para errores de base de datos
 */
const databaseErrorHandler = (err) => {
  console.error('Error de base de datos:', err);

  // Error de violación de constraint único
  if (err.code === '23505') {
    return {
      success: false,
      message: 'Ya existe un registro con esos datos',
      detail: err.detail
    };
  }

  // Error de violación de foreign key
  if (err.code === '23503') {
    return {
      success: false,
      message: 'Referencia inválida - El registro relacionado no existe',
      detail: err.detail
    };
  }

  // Error de violación de not null
  if (err.code === '23502') {
    return {
      success: false,
      message: 'Falta un campo requerido',
      detail: err.detail
    };
  }

  // Error genérico de base de datos
  return {
    success: false,
    message: 'Error de base de datos',
    ...(process.env.NODE_ENV === 'development' && { detail: err.message })
  };
};

/**
 * Wrapper para funciones async - Captura errores automáticamente
 */
const asyncHandler = (fn) => {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};

/**
 * Clase personalizada para errores de la aplicación
 */
class AppError extends Error {
  constructor(message, statusCode = 500, isOperational = true) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = isOperational;
    this.timestamp = new Date().toISOString();
    Error.captureStackTrace(this, this.constructor);
  }
}

module.exports = {
  notFound,
  errorHandler,
  validationErrorHandler,
  databaseErrorHandler,
  asyncHandler,
  AppError
};