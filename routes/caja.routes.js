const express = require('express');
const router = express.Router();
const {
  abrirCaja,
  cerrarCaja,
  getEstadoCaja,
  getFlujoCaja,
  registrarTransaccion,
  getResumenVentas,
  getHistorialArqueos,
  getVentasPorArqueo   // ✅ NUEVO
} = require('../controllers/cajaController');
const { authenticate } = require('../middlewares/authMiddleware');
const { isAdmin } = require('../middlewares/roleMiddleware');

/**
 * @route   POST /api/caja/abrir
 * @desc    Abrir caja
 * @access  Private (Admin)
 */
router.post('/abrir', authenticate, isAdmin, abrirCaja);

/**
 * @route   POST /api/caja/cerrar
 * @desc    Cerrar caja
 * @access  Private (Admin)
 */
router.post('/cerrar', authenticate, isAdmin, cerrarCaja);

/**
 * @route   GET /api/caja/estado
 * @desc    Estado actual de caja
 * @access  Private
 */
router.get('/estado', authenticate, getEstadoCaja);

/**
 * @route   GET /api/caja/flujo
 * @desc    Flujo de caja
 * @access  Private (Admin)
 */
router.get('/flujo', authenticate, isAdmin, getFlujoCaja);

/**
 * @route   POST /api/caja/transaccion
 * @desc    Registrar transacción manual
 * @access  Private (Admin)
 */
router.post('/transaccion', authenticate, isAdmin, registrarTransaccion);

/**
 * @route   GET /api/caja/resumen-ventas
 * @desc    Resumen de ventas
 * @access  Private
 */
router.get('/resumen-ventas', authenticate, getResumenVentas);

/**
 * @route   GET /api/caja/historial
 * @desc    Historial de arqueos
 * @access  Private (Admin)
 */
router.get('/historial', authenticate, isAdmin, getHistorialArqueos);

/**
 * @route   GET /api/caja/historial/:id_arqueo/ventas
 * @desc    Ventas detalladas de un arqueo específico
 * @access  Private (Admin)
 */
router.get('/historial/:id_arqueo/ventas', authenticate, isAdmin, getVentasPorArqueo);

router.get('/historial-arqueos', authenticate, isAdmin, getHistorialArqueos);

module.exports = router;