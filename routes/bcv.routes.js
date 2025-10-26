const express = require('express');
const router = express.Router();
const bcvController = require('../controllers/bcvController');

// Obtener tasa actual de VES
router.get('/tasa-actual', bcvController.getTasaActual);

// Obtener todas las tasas
router.get('/tasas', bcvController.getTodasLasTasas);

// Actualizar tasa desde API del BCV
router.post('/actualizar', bcvController.actualizarTasaDesdeBCV);

// Actualizar tasa manualmente
router.put('/actualizar-manual', bcvController.actualizarTasaManual);

// Convertir entre monedas
router.post('/convertir', bcvController.convertirMoneda);

module.exports = router;