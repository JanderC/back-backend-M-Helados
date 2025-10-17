const axios = require('axios');
const { query } = require('../config/database');

const BCV_API_URL = process.env.BCV_API_URL || 'https://pydolarve.org/api/v1/dollar?page=bcv';
const API_ENABLED = process.env.BCV_API_ENABLED === 'true';

/**
 * Obtener tasa del BCV desde API
 */
const getTasaBCV = async () => {
  try {
    if (!API_ENABLED) {
      throw new Error('API de BCV deshabilitada');
    }

    const response = await axios.get(BCV_API_URL, { timeout: 5000 });
    
    if (response.data && response.data.monitors && response.data.monitors.bcv) {
      const tasa = parseFloat(response.data.monitors.bcv.price);
      return tasa;
    }

    throw new Error('Formato de respuesta inválido');

  } catch (error) {
    console.error('Error al obtener tasa BCV:', error.message);
    throw error;
  }
};

/**
 * Actualizar tasa de VES en la base de datos
 */
const actualizarTasaVES = async (tasa) => {
  try {
    const result = await query(
      `UPDATE tipos_moneda 
       SET tasa_cambio_usd = $1, fecha_actualizacion = CURRENT_TIMESTAMP
       WHERE codigo_moneda = 'VES'
       RETURNING *`,
      [tasa]
    );

    return result.rows[0];

  } catch (error) {
    console.error('Error al actualizar tasa en BD:', error);
    throw error;
  }
};

/**
 * Obtener tasa actual de VES desde BD
 */
const getTasaActual = async () => {
  try {
    const result = await query(
      `SELECT tasa_cambio_usd, fecha_actualizacion 
       FROM tipos_moneda 
       WHERE codigo_moneda = 'VES'`
    );

    return result.rows[0];

  } catch (error) {
    console.error('Error al obtener tasa actual:', error);
    throw error;
  }
};

/**
 * Obtener todas las tasas de cambio
 */
const getTodasLasTasas = async () => {
  try {
    const result = await query(
      'SELECT * FROM tipos_moneda ORDER BY codigo_moneda'
    );

    return result.rows;

  } catch (error) {
    console.error('Error al obtener tasas:', error);
    throw error;
  }
};

/**
 * Actualizar tasa manualmente
 */
const actualizarTasaManual = async (codigoMoneda, tasa) => {
  try {
    const result = await query(
      `UPDATE tipos_moneda 
       SET tasa_cambio_usd = $1, fecha_actualizacion = CURRENT_TIMESTAMP
       WHERE codigo_moneda = $2
       RETURNING *`,
      [tasa, codigoMoneda]
    );

    if (result.rows.length === 0) {
      throw new Error('Moneda no encontrada');
    }

    return result.rows[0];

  } catch (error) {
    console.error('Error al actualizar tasa manual:', error);
    throw error;
  }
};

/**
 * Convertir monto entre monedas
 */
const convertirMoneda = async (monto, monedaOrigen, monedaDestino) => {
  try {
    const tasas = await getTodasLasTasas();
    
    const tasaOrigen = tasas.find(t => t.codigo_moneda === monedaOrigen);
    const tasaDestino = tasas.find(t => t.codigo_moneda === monedaDestino);

    if (!tasaOrigen || !tasaDestino) {
      throw new Error('Moneda no encontrada');
    }

    // Convertir a USD primero, luego a moneda destino
    const montoUSD = monto / parseFloat(tasaOrigen.tasa_cambio_usd);
    const montoFinal = montoUSD * parseFloat(tasaDestino.tasa_cambio_usd);

    return {
      monto_original: monto,
      moneda_origen: monedaOrigen,
      monto_convertido: montoFinal,
      moneda_destino: monedaDestino,
      tasa_aplicada: parseFloat(tasaDestino.tasa_cambio_usd) / parseFloat(tasaOrigen.tasa_cambio_usd)
    };

  } catch (error) {
    console.error('Error al convertir moneda:', error);
    throw error;
  }
};

module.exports = {
  getTasaBCV,
  actualizarTasaVES,
  getTasaActual,
  getTodasLasTasas,
  actualizarTasaManual,
  convertirMoneda
};