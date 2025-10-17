const express = require('express');
const router = express.Router();
const {
  getDashboard,
  generarReporteMensual,
  getReportesMensuales,
  getProductosVendidos,
  getToppingsUsados,
  getReporteInventario,
  getVentasPorCategoria
} = require('../controllers/reportesController');
const { authenticate } = require('../middlewares/authMiddleware');
const { isAdmin } = require('../middlewares/roleMiddleware');

/**
 * @route   GET /api/reportes/dashboard
 * @desc    Dashboard con resumen general
 * @access  Private
 */
router.get('/dashboard', authenticate, getDashboard);

/**
 * @route   POST /api/reportes/generar-mensual
 * @desc    Generar reporte mensual
 * @access  Private (Admin)
 */
router.post('/generar-mensual', authenticate, isAdmin, generarReporteMensual);

/**
 * @route   GET /api/reportes/mensuales
 * @desc    Listar reportes mensuales
 * @access  Private (Admin)
 */
router.get('/mensuales', authenticate, isAdmin, getReportesMensuales);

/**
 * @route   GET /api/reportes/productos-vendidos
 * @desc    Top productos más vendidos
 * @access  Private
 */
router.get('/productos-vendidos', authenticate, getProductosVendidos);

/**
 * @route   GET /api/reportes/toppings-usados
 * @desc    Top toppings más usados
 * @access  Private
 */
router.get('/toppings-usados', authenticate, getToppingsUsados);

/**
 * @route   GET /api/reportes/inventario
 * @desc    Reporte de inventario
 * @access  Private (Admin)
 */
router.get('/inventario', authenticate, isAdmin, getReporteInventario);

/**
 * @route   GET /api/reportes/ventas-categoria
 * @desc    Ventas por categoría
 * @access  Private
 */
router.get('/ventas-categoria', authenticate, getVentasPorCategoria);

module.exports = router;