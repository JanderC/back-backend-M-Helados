const { query } = require('../config/database');
const axios = require('axios');

/**
 * Obtener todas las tasas de cambio
 * GET /api/monedas/tasas
 */
const getTasas = async (req, res) => {
  try {
    const result = await query(
      'SELECT * FROM tipos_moneda ORDER BY codigo_moneda'
    );

    res.json({
      success: true,
      data: result.rows
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
 * Obtener tasa VES actual
 * GET /api/monedas/tasa-ves
 */
const getTasaVES = async (req, res) => {
  try {
    const result = await query(
      "SELECT * FROM tipos_moneda WHERE codigo_moneda = 'VES'"
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Tasa VES no encontrada'
      });
    }

    res.json({
      success: true,
      data: result.rows[0]
    });

  } catch (error) {
    console.error('Error al obtener tasa VES:', error);
    res.status(500).json({
      success: false,
      message: 'Error al obtener tasa VES'
    });
  }
};

/**
 * Actualizar tasa desde BCV (API)
 * POST /api/monedas/actualizar-bcv
 */
const actualizarDesdeBCV = async (req, res) => {
  try {
    // Opción 1: API oficial del BCV (si está disponible)
    // const bcvResponse = await axios.get('https://www.bcv.org.ve/api/tasa');
    
    // Opción 2: API alternativa (ejemplo con exchangerate-api)
    // const response = await axios.get('https://api.exchangerate-api.com/v4/latest/USD');
    
    // Opción 3: Web scraping del BCV (más confiable pero requiere más procesamiento)
    try {
      const bcvResponse = await axios.get('https://www.bcv.org.ve/', {
        timeout: 10000,
        headers: {
          'User-Agent': 'Mozilla/5.0'
        }
      });

      // Aquí deberías parsear el HTML para extraer la tasa
      // Este es un ejemplo simplificado
      const tasaBCV = await obtenerTasaBCVDesdeHTML(bcvResponse.data);

      if (!tasaBCV) {
        throw new Error('No se pudo extraer la tasa del BCV');
      }

      // Actualizar en la base de datos
      const result = await query(
        `UPDATE tipos_moneda 
         SET tasa_cambio_usd = $1,
             fecha_actualizacion = CURRENT_TIMESTAMP
         WHERE codigo_moneda = 'VES'
         RETURNING *`,
        [tasaBCV]
      );

      res.json({
        success: true,
        message: 'Tasa actualizada desde BCV exitosamente',
        data: result.rows[0]
      });

    } catch (apiError) {
      // Si falla la API del BCV, intentar con API alternativa
      console.warn('API BCV no disponible, intentando con API alternativa');
      
      // Usar API de monedas alternativa (ejemplo)
      const alternativeResponse = await axios.get(
        'https://api.exchangerate-api.com/v4/latest/USD',
        { timeout: 5000 }
      );

      // Nota: Esta API puede no tener VES, ajusta según disponibilidad
      const tasaVES = alternativeResponse.data.rates.VES || alternativeResponse.data.rates.VEF;

      if (!tasaVES) {
        throw new Error('Tasa VES no disponible en API alternativa');
      }

      const result = await query(
        `UPDATE tipos_moneda 
         SET tasa_cambio_usd = $1,
             fecha_actualizacion = CURRENT_TIMESTAMP
         WHERE codigo_moneda = 'VES'
         RETURNING *`,
        [tasaVES]
      );

      res.json({
        success: true,
        message: 'Tasa actualizada desde API alternativa',
        data: result.rows[0],
        fuente: 'API alternativa'
      });
    }

  } catch (error) {
    console.error('Error al actualizar desde BCV:', error);
    res.status(500).json({
      success: false,
      message: 'Error al actualizar tasa desde BCV. Intente actualización manual.',
      error: error.message
    });
  }
};

/**
 * Actualizar tasa manualmente
 * PUT /api/monedas/actualizar-manual
 */
const actualizarManual = async (req, res) => {
  try {
    const { codigo_moneda, tasa_cambio_usd } = req.body;

    if (!codigo_moneda || !tasa_cambio_usd) {
      return res.status(400).json({
        success: false,
        message: 'Código de moneda y tasa son requeridos'
      });
    }

    if (tasa_cambio_usd <= 0) {
      return res.status(400).json({
        success: false,
        message: 'La tasa debe ser mayor a 0'
      });
    }

    const result = await query(
      `UPDATE tipos_moneda 
       SET tasa_cambio_usd = $1,
           fecha_actualizacion = CURRENT_TIMESTAMP
       WHERE codigo_moneda = $2
       RETURNING *`,
      [tasa_cambio_usd, codigo_moneda]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Moneda no encontrada'
      });
    }

    res.json({
      success: true,
      message: 'Tasa actualizada manualmente',
      data: result.rows[0]
    });

  } catch (error) {
    console.error('Error al actualizar tasa manual:', error);
    res.status(500).json({
      success: false,
      message: 'Error al actualizar tasa'
    });
  }
};

/**
 * Convertir entre monedas
 * POST /api/monedas/convertir
 */
const convertirMonedas = async (req, res) => {
  try {
    const { monto, moneda_origen, moneda_destino } = req.body;

    if (!monto || !moneda_origen || !moneda_destino) {
      return res.status(400).json({
        success: false,
        message: 'Monto, moneda origen y moneda destino son requeridos'
      });
    }

    // Obtener tasas de cambio
    const tasasResult = await query(
      `SELECT codigo_moneda, tasa_cambio_usd 
       FROM tipos_moneda 
       WHERE codigo_moneda IN ($1, $2)`,
      [moneda_origen, moneda_destino]
    );

    if (tasasResult.rows.length !== 2) {
      return res.status(404).json({
        success: false,
        message: 'Una o ambas monedas no encontradas'
      });
    }

    const tasaOrigen = tasasResult.rows.find(t => t.codigo_moneda === moneda_origen).tasa_cambio_usd;
    const tasaDestino = tasasResult.rows.find(t => t.codigo_moneda === moneda_destino).tasa_cambio_usd;

    // Convertir a USD primero, luego a moneda destino
    const montoEnUSD = parseFloat(monto) / parseFloat(tasaOrigen);
    const montoConvertido = montoEnUSD * parseFloat(tasaDestino);

    res.json({
      success: true,
      data: {
        monto_original: parseFloat(monto),
        moneda_origen,
        monto_convertido: parseFloat(montoConvertido.toFixed(2)),
        moneda_destino,
        tasa_utilizada: (parseFloat(tasaDestino) / parseFloat(tasaOrigen)).toFixed(6),
        fecha_conversion: new Date()
      }
    });

  } catch (error) {
    console.error('Error al convertir monedas:', error);
    res.status(500).json({
      success: false,
      message: 'Error al convertir monedas'
    });
  }
};

/**
 * Función auxiliar para extraer tasa del HTML del BCV
 * Esta es una implementación simplificada
 */
const obtenerTasaBCVDesdeHTML = async (html) => {
  try {
    // Aquí deberías implementar el parsing del HTML
    // Ejemplo con regex (ajustar según estructura real del BCV)
    const regex = /USD<\/strong>.*?<strong>([\d,.]+)<\/strong>/i;
    const match = html.match(regex);
    
    if (match && match[1]) {
      const tasa = match[1].replace(/\./g, '').replace(',', '.');
      return parseFloat(tasa);
    }
    
    return null;
  } catch (error) {
    console.error('Error al parsear HTML del BCV:', error);
    return null;
  }
};

module.exports = {
  getTasas,
  getTasaVES,
  actualizarDesdeBCV,
  actualizarManual,
  convertirMonedas
};