const express = require('express');
const router = express.Router();
const {
  getTasas,
  getTasaVES,
  actualizarDesdeBCV,
  actualizarManual,
  actualizarMultiples,
  convertirMonedas
} = require('../controllers/monedasController');
const { authenticate } = require('../middlewares/authMiddleware');
const { isAdmin } = require('../middlewares/roleMiddleware');

/**
 * @route   GET /api/monedas/tasas
 * @desc    Listar todas las tasas de cambio
 * @access  Private
 */
router.get('/tasas', authenticate, getTasas);

/**
 * @route   GET /api/monedas/tasa-ves
 * @desc    Obtener tasa VES actual
 * @access  Private
 */
router.get('/tasa-ves', authenticate, getTasaVES);

/**
 * @route   POST /api/monedas/actualizar-bcv
 * @desc    Actualizar tasa desde BCV (API)
 * @access  Private (Admin)
 */
router.post('/actualizar-bcv', authenticate, isAdmin, actualizarDesdeBCV);

/**
 * @route   PUT /api/monedas/actualizar-manual
 * @desc    Actualizar tasa manualmente
 * @access  Private (Admin)
 */
router.put('/actualizar-manual', authenticate, isAdmin, actualizarManual);

/****
 * @route   PUT /api/monedas/actualizar-multiples
 * @desc    Actualizar múltiples tasas manualmente
 * @access  Private (Admin)
 */
router.put('/actualizar-multiples', authenticate, isAdmin, actualizarMultiples);

/**
 * @route   POST /api/monedas/convertir
 * @desc    Convertir entre monedas
 * @access  Private
 */
router.post('/convertir', authenticate, convertirMonedas);

module.exports = router;