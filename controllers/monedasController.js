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
 * Actualizar tasa desde BCV (API dolarapi.com)
 * POST /api/monedas/actualizar-bcv
 */
const actualizarDesdeBCV = async (req, res) => {
  try {
    // Intentar obtener tasa desde la API de dolarapi.com
    const bcvResponse = await axios.get('https://ve.dolarapi.com/v1/dolares/oficial', {
      timeout: 10000,
      headers: {
        'User-Agent': 'Mozilla/5.0'
      }
    });

    if (!bcvResponse.data || !bcvResponse.data.promedio) {
      throw new Error('No se pudo obtener la tasa del BCV');
    }

    const tasaBCV = parseFloat(bcvResponse.data.promedio);

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
      data: {
        ...result.rows[0],
        fuente: bcvResponse.data.fuente,
        fecha_bcv: bcvResponse.data.fechaActualizacion
      }
    });

  } catch (error) {
    console.error('Error al actualizar desde BCV:', error);
    
    // Intentar con API alternativa
    try {
      const alternativeResponse = await axios.get(
        'https://pydolarve.org/api/v1/dollar?page=bcv',
        { timeout: 5000 }
      );

      let tasaVES = null;

      if (alternativeResponse.data?.monitors?.bcv?.price) {
        tasaVES = parseFloat(alternativeResponse.data.monitors.bcv.price);
      }

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
        fuente: 'API alternativa (PyDolarVe)'
      });

    } catch (alternativeError) {
      console.error('Error en API alternativa:', alternativeError);
      res.status(500).json({
        success: false,
        message: 'Error al actualizar tasa desde BCV. Intente actualización manual.',
        error: error.message
      });
    }
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
 * Actualizar múltiples tasas manualmente
 * PUT /api/monedas/actualizar-multiples
 */
const actualizarMultiples = async (req, res) => {
  try {
    const { tasas } = req.body; // Array de {codigo_moneda, tasa_cambio_usd}

    if (!Array.isArray(tasas) || tasas.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Se requiere un array de tasas'
      });
    }

    const resultados = [];

    for (const tasa of tasas) {
      if (tasa.tasa_cambio_usd > 0) {
        const result = await query(
          `UPDATE tipos_moneda 
           SET tasa_cambio_usd = $1,
               fecha_actualizacion = CURRENT_TIMESTAMP
           WHERE codigo_moneda = $2
           RETURNING *`,
          [tasa.tasa_cambio_usd, tasa.codigo_moneda]
        );

        if (result.rows.length > 0) {
          resultados.push(result.rows[0]);
        }
      }
    }

    res.json({
      success: true,
      message: `${resultados.length} tasas actualizadas correctamente`,
      data: resultados
    });

  } catch (error) {
    console.error('Error al actualizar tasas múltiples:', error);
    res.status(500).json({
      success: false,
      message: 'Error al actualizar tasas'
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

module.exports = {
  getTasas,
  getTasaVES,
  actualizarDesdeBCV,
  actualizarManual,
  actualizarMultiples,
  convertirMonedas
};