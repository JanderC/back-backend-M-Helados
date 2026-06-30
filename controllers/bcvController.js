const bcvService = require('../services/bcvService');

/**
 * Obtener tasa actual de VES desde BD
 * GET /api/bcv/tasa-actual
 */
const getTasaActual = async (req, res) => {
  try {
    const tasa = await bcvService.getTasaActual();

    if (!tasa) {
      return res.status(404).json({
        success: false,
        message: 'No se encontró información de tasa de cambio'
      });
    }

    res.json({
      success: true,
      data: tasa
    });

  } catch (error) {
    console.error('Error al obtener tasa actual:', error);
    res.status(500).json({
      success: false,
      message: 'Error al obtener tasa actual'
    });
  }
};

/**
 * Obtener todas las tasas de cambio
 * GET /api/bcv/tasas
 */
const getTodasLasTasas = async (req, res) => {
  try {
    const tasas = await bcvService.getTodasLasTasas();

    res.json({
      success: true,
      data: tasas
    });

  } catch (error) {
    console.error('Error al obtener tasas:', error);
    res.status(500).json({
      success: false,
      message: 'Error al obtener tasas'
    });
  }
};

/**
 * Actualizar tasa desde API del BCV
 * POST /api/bcv/actualizar
 */
const actualizarTasaDesdeBCV = async (req, res) => {
  try {
    const tasaBCV = await bcvService.getTasaBCV();
    const tasaActualizada = await bcvService.actualizarTasaVES(tasaBCV);

    res.json({
      success: true,
      message: 'Tasa actualizada correctamente desde BCV',
      data: tasaActualizada
    });

  } catch (error) {
    console.error('Error al actualizar tasa desde BCV:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Error al actualizar tasa desde BCV'
    });
  }
};

/**
 * Actualizar tasa manualmente
 * PUT /api/bcv/actualizar-manual
 */
const actualizarTasaManual = async (req, res) => {
  try {
    const { codigo_moneda, tasa } = req.body;

    if (!codigo_moneda || !tasa) {
      return res.status(400).json({
        success: false,
        message: 'Código de moneda y tasa son requeridos'
      });
    }

    if (isNaN(tasa) || parseFloat(tasa) <= 0) {
      return res.status(400).json({
        success: false,
        message: 'La tasa debe ser un número mayor a 0'
      });
    }

    const tasaActualizada = await bcvService.actualizarTasaManual(
      codigo_moneda, 
      parseFloat(tasa)
    );

    res.json({
      success: true,
      message: 'Tasa actualizada correctamente',
      data: tasaActualizada
    });

  } catch (error) {
    console.error('Error al actualizar tasa manual:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Error al actualizar tasa manual'
    });
  }
};

/**
 * Actualizar varias tasas manualmente en un solo lote
 * PUT /api/bcv/actualizar-multiples
 */
const actualizarTasasManualMultiples = async (req, res) => {
  try {
    const { tasas } = req.body;

    if (!Array.isArray(tasas) || tasas.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Debe enviar un arreglo de tasas a actualizar'
      });
    }

    const tasasActualizadas = await bcvService.actualizarTasasManualMultiples(tasas);

    res.json({
      success: true,
      message: 'Tasas actualizadas correctamente',
      data: tasasActualizadas
    });

  } catch (error) {
    console.error('Error al actualizar tasas en lote:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Error al actualizar tasas manualmente'
    });
  }
};

/**
 * Convertir entre monedas
 * POST /api/bcv/convertir
 */
const convertirMoneda = async (req, res) => {
  try {
    const { monto, moneda_origen, moneda_destino } = req.body;

    if (!monto || !moneda_origen || !moneda_destino) {
      return res.status(400).json({
        success: false,
        message: 'Monto, moneda origen y moneda destino son requeridos'
      });
    }

    if (isNaN(monto) || parseFloat(monto) < 0) {
      return res.status(400).json({
        success: false,
        message: 'El monto debe ser un número mayor o igual a 0'
      });
    }

    const conversion = await bcvService.convertirMoneda(
      parseFloat(monto),
      moneda_origen,
      moneda_destino
    );

    res.json({
      success: true,
      data: conversion
    });

  } catch (error) {
    console.error('Error al convertir moneda:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Error al convertir moneda'
    });
  }
};

module.exports = {
  getTasaActual,
  getTodasLasTasas,
  actualizarTasaDesdeBCV,
  actualizarTasaManual,
  actualizarTasasManualMultiples,
  convertirMoneda
};