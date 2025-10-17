const express = require('express');
const router = express.Router();
const {
  createVenta,
  getVentas,
  getVentaById,
  cambiarEstadoVenta
} = require('../controllers/ventasController');
const { authenticate } = require('../middlewares/authMiddleware');
const { isDespensadorOrAdmin } = require('../middlewares/roleMiddleware');

/**
 * @route   POST /api/ventas
 * @desc    Crear venta
 * @access  Private
 */
router.post('/', authenticate, createVenta);

/**
 * @route   GET /api/ventas
 * @desc    Listar ventas
 * @access  Private
 */
router.get('/', authenticate, getVentas);

/**
 * @route   GET /api/ventas/:id
 * @desc    Obtener venta por ID
 * @access  Private
 */
router.get('/:id', authenticate, getVentaById);

/**
 * @route   PUT /api/ventas/:id/estado
 * @desc    Cambiar estado de venta
 * @access  Private (Despensador o Admin)
 */
router.put('/:id/estado', authenticate, isDespensadorOrAdmin, cambiarEstadoVenta);

module.exports = router;