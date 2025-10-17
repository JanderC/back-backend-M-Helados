const express = require('express');
const router = express.Router();
const {
  getToppings,
  getToppingById,
  createTopping,
  updateTopping,
  deleteTopping,
  ajustarStock
} = require('../controllers/toppingsController');
const { authenticate } = require('../middlewares/authMiddleware');
const { isAdmin } = require('../middlewares/roleMiddleware');

/**
 * @route   GET /api/toppings
 * @desc    Listar toppings
 * @access  Private
 */
router.get('/', authenticate, getToppings);

/**
 * @route   GET /api/toppings/:id
 * @desc    Obtener topping por ID
 * @access  Private
 */
router.get('/:id', authenticate, getToppingById);

/**
 * @route   POST /api/toppings
 * @desc    Crear topping
 * @access  Private (Admin)
 */
router.post('/', authenticate, isAdmin, createTopping);

/**
 * @route   PUT /api/toppings/:id
 * @desc    Actualizar topping
 * @access  Private (Admin)
 */
router.put('/:id', authenticate, isAdmin, updateTopping);

/**
 * @route   DELETE /api/toppings/:id
 * @desc    Eliminar topping
 * @access  Private (Admin)
 */
router.delete('/:id', authenticate, isAdmin, deleteTopping);

/**
 * @route   POST /api/toppings/:id/ajustar-stock
 * @desc    Ajustar stock de topping
 * @access  Private (Admin)
 */
router.post('/:id/ajustar-stock', authenticate, isAdmin, ajustarStock);

module.exports = router;