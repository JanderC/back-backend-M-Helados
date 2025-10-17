const { body, param, query, validationResult } = require('express-validator');

/**
 * Middleware para manejar errores de validación
 */
const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      message: 'Error de validación',
      errors: errors.array().map(err => ({
        field: err.path,
        message: err.msg
      }))
    });
  }
  
  next();
};

/**
 * Validadores para Login
 */
const validateLogin = [
  body('username')
    .trim()
    .notEmpty().withMessage('Usuario es requerido')
    .isLength({ min: 3 }).withMessage('Usuario debe tener al menos 3 caracteres'),
  body('password')
    .notEmpty().withMessage('Contraseña es requerida')
    .isLength({ min: 6 }).withMessage('Contraseña debe tener al menos 6 caracteres'),
  handleValidationErrors
];

/**
 * Validadores para Producto
 */
const validateProducto = [
  body('nombre_producto')
    .trim()
    .notEmpty().withMessage('Nombre del producto es requerido')
    .isLength({ max: 100 }).withMessage('Nombre muy largo'),
  body('precio_base')
    .notEmpty().withMessage('Precio es requerido')
    .isFloat({ min: 0 }).withMessage('Precio debe ser mayor a 0'),
  body('id_categoria')
    .notEmpty().withMessage('Categoría es requerida')
    .isInt().withMessage('ID de categoría inválido'),
  handleValidationErrors
];

/**
 * Validadores para Topping
 */
const validateTopping = [
  body('nombre_topping')
    .trim()
    .notEmpty().withMessage('Nombre del topping es requerido'),
  body('precio_adicional')
    .notEmpty().withMessage('Precio adicional es requerido')
    .isFloat({ min: 0 }).withMessage('Precio debe ser mayor o igual a 0'),
  handleValidationErrors
];

/**
 * Validadores para Venta
 */
const validateVenta = [
  body('productos')
    .isArray({ min: 1 }).withMessage('Debe incluir al menos un producto'),
  body('productos.*.id_producto')
    .notEmpty().withMessage('ID de producto es requerido')
    .isInt().withMessage('ID de producto inválido'),
  body('productos.*.cantidad')
    .notEmpty().withMessage('Cantidad es requerida')
    .isInt({ min: 1 }).withMessage('Cantidad debe ser mayor a 0'),
  body('id_moneda')
    .notEmpty().withMessage('Moneda es requerida')
    .isInt().withMessage('ID de moneda inválido'),
  body('metodo_pago')
    .notEmpty().withMessage('Método de pago es requerido'),
  handleValidationErrors
];

/**
 * Validadores para cambio de estado
 */
const validateEstado = [
  body('estado')
    .notEmpty().withMessage('Estado es requerido')
    .isIn(['PENDIENTE', 'EN_PROCESO', 'COMPLETADA', 'CANCELADA', 'DEVUELTO'])
    .withMessage('Estado inválido'),
  handleValidationErrors
];

/**
 * Validadores para transacción de caja
 */
const validateTransaccion = [
  body('tipo_transaccion')
    .notEmpty().withMessage('Tipo de transacción es requerido')
    .isIn(['INGRESO', 'EGRESO']).withMessage('Tipo de transacción inválido'),
  body('concepto')
    .trim()
    .notEmpty().withMessage('Concepto es requerido'),
  body('monto')
    .notEmpty().withMessage('Monto es requerido')
    .isFloat({ min: 0.01 }).withMessage('Monto debe ser mayor a 0'),
  body('id_moneda')
    .notEmpty().withMessage('Moneda es requerida')
    .isInt().withMessage('ID de moneda inválido'),
  handleValidationErrors
];

/**
 * Validador de ID en parámetros
 */
const validateId = [
  param('id')
    .isInt({ min: 1 }).withMessage('ID inválido'),
  handleValidationErrors
];

/**
 * Validadores para reporte mensual
 */
const validateReporteMensual = [
  body('mes')
    .notEmpty().withMessage('Mes es requerido')
    .isInt({ min: 1, max: 12 }).withMessage('Mes debe estar entre 1 y 12'),
  body('anio')
    .notEmpty().withMessage('Año es requerido')
    .isInt({ min: 2000, max: 2100 }).withMessage('Año inválido'),
  handleValidationErrors
];

/**
 * Validadores para ajuste de stock
 */
const validateAjusteStock = [
  body('cantidad')
    .notEmpty().withMessage('Cantidad es requerida')
    .isFloat().withMessage('Cantidad debe ser un número'),
  body('motivo')
    .trim()
    .notEmpty().withMessage('Motivo es requerido')
    .isLength({ min: 5 }).withMessage('Motivo debe tener al menos 5 caracteres'),
  handleValidationErrors
];

/**
 * Validador de email
 */
const isValidEmail = (email) => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
};

/**
 * Validador de número de teléfono
 */
const isValidPhone = (phone) => {
  const phoneRegex = /^[\d\s\-\+\(\)]+$/;
  return phoneRegex.test(phone) && phone.length >= 7;
};

/**
 * Sanitizar string (remover caracteres peligrosos)
 */
const sanitizeString = (str) => {
  if (!str) return '';
  return str.trim().replace(/[<>\"']/g, '');
};

module.exports = {
  validateLogin,
  validateProducto,
  validateTopping,
  validateVenta,
  validateEstado,
  validateTransaccion,
  validateId,
  validateReporteMensual,
  validateAjusteStock,
  handleValidationErrors,
  isValidEmail,
  isValidPhone,
  sanitizeString
};