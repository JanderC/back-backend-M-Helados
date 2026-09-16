const express = require('express');
const router = express.Router();
const {
  getMetodosPago,
  createMetodoPago,
  updateMetodoPago,
  toggleMetodoPago
} = require('../controllers/metodosPagoController');
const { authenticate } = require('../middlewares/authMiddleware');
const { isAdmin } = require('../middlewares/roleMiddleware');

/**
 * @route   GET /api/metodos-pago
 * @desc    Listar métodos de pago (filtrable por ?id_moneda= y ?activo=)
 * @access  Private
 */
router.get('/', authenticate, getMetodosPago);

/**
 * @route   POST /api/metodos-pago
 * @desc    Crear método de pago
 * @access  Private (Admin)
 */
router.post('/', authenticate, isAdmin, createMetodoPago);

/**
 * @route   PUT /api/metodos-pago/:id
 * @desc    Editar método de pago
 * @access  Private (Admin)
 */
router.put('/:id', authenticate, isAdmin, updateMetodoPago);

/**
 * @route   PATCH /api/metodos-pago/:id/toggle
 * @desc    Activar / desactivar método de pago
 * @access  Private (Admin)
 */
router.patch('/:id/toggle', authenticate, isAdmin, toggleMetodoPago);

module.exports = router;
