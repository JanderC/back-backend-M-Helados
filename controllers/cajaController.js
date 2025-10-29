const { query } = require('../config/database');

/**
 * Abrir caja
 * POST /api/caja/abrir
 */
const abrirCaja = async (req, res) => {
  try {
    const {
      monto_inicial_usd = 0,
      monto_inicial_ves = 0,
      monto_inicial_cop = 0,
      notas
    } = req.body;

    const idUsuario = req.user.id_usuario;

    // Verificar si hay caja abierta
    const cajaAbierta = await query(
      "SELECT * FROM arqueo_caja WHERE estado = 'ABIERTA' ORDER BY fecha_apertura DESC LIMIT 1"
    );

    if (cajaAbierta.rows.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'Ya existe una caja abierta',
        data: cajaAbierta.rows[0]
      });
    }

    // Crear nueva caja
    const result = await query(
      `INSERT INTO arqueo_caja (id_usuario_apertura, monto_inicial_usd, monto_inicial_ves, 
       monto_inicial_cop, notas_apertura)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [idUsuario, monto_inicial_usd, monto_inicial_ves, monto_inicial_cop, notas]
    );

    // Obtener información completa del usuario
    const cajaConUsuario = await query(
      `SELECT ac.*, u.nombre_completo as usuario_apertura
       FROM arqueo_caja ac
       JOIN usuarios u ON ac.id_usuario_apertura = u.id_usuario
       WHERE ac.id_arqueo = $1`,
      [result.rows[0].id_arqueo]
    );

    res.status(201).json({
      success: true,
      message: 'Caja abierta exitosamente',
      data: cajaConUsuario.rows[0]
    });

  } catch (error) {
    console.error('Error al abrir caja:', error);
    res.status(500).json({
      success: false,
      message: 'Error al abrir caja',
      error: error.message
    });
  }
};

/**
 * Cerrar caja
 * POST /api/caja/cerrar
 */
const cerrarCaja = async (req, res) => {
  try {
    const {
      monto_final_usd = 0,
      monto_final_ves = 0,
      monto_final_cop = 0,
      notas
    } = req.body;

    const idUsuario = req.user.id_usuario;

    // Obtener caja abierta
    const cajaResult = await query(
      "SELECT * FROM arqueo_caja WHERE estado = 'ABIERTA' ORDER BY fecha_apertura DESC LIMIT 1"
    );

    if (cajaResult.rows.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No hay caja abierta'
      });
    }

    const caja = cajaResult.rows[0];

    // Calcular ventas esperadas del día (en USD para referencia)
    const ventasResult = await query(
      `SELECT 
         COALESCE(SUM(total / tm.tasa_cambio_usd), 0) as total_usd,
         COUNT(*) as total_ventas
       FROM ventas v
       JOIN tipos_moneda tm ON v.id_moneda = tm.id_moneda
       WHERE v.fecha_venta >= $1 AND v.estado_venta = 'COMPLETADA'`,
      [caja.fecha_apertura]
    );

    const ventasEsperadas = parseFloat(ventasResult.rows[0].total_usd);
    
    // Calcular diferencia basada en la moneda que tenga monto inicial
    let diferencia = 0;
    if (parseFloat(caja.monto_inicial_cop) > 0) {
      const montoEsperadoCOP = parseFloat(caja.monto_inicial_cop) + (ventasEsperadas * 4000); // Aproximado
      diferencia = parseFloat(monto_final_cop) - montoEsperadoCOP;
    } else if (parseFloat(caja.monto_inicial_usd) > 0) {
      const montoEsperadoUSD = parseFloat(caja.monto_inicial_usd) + ventasEsperadas;
      diferencia = parseFloat(monto_final_usd) - montoEsperadoUSD;
    } else if (parseFloat(caja.monto_inicial_ves) > 0) {
      const montoEsperadoVES = parseFloat(caja.monto_inicial_ves) + (ventasEsperadas * 36); // Aproximado
      diferencia = parseFloat(monto_final_ves) - montoEsperadoVES;
    }

    // Cerrar caja
    const result = await query(
      `UPDATE arqueo_caja 
       SET id_usuario_cierre = $1,
           monto_final_usd = $2,
           monto_final_ves = $3,
           monto_final_cop = $4,
           ventas_esperadas_usd = $5,
           diferencia_usd = $6,
           fecha_cierre = CURRENT_TIMESTAMP,
           notas_cierre = $7,
           estado = 'CERRADA'
       WHERE id_arqueo = $8
       RETURNING *`,
      [idUsuario, monto_final_usd, monto_final_ves, monto_final_cop, 
       ventasEsperadas, diferencia, notas, caja.id_arqueo]
    );

    // Obtener información completa
    const cajaConUsuarios = await query(
      `SELECT ac.*, 
       u1.nombre_completo as usuario_apertura,
       u2.nombre_completo as usuario_cierre
       FROM arqueo_caja ac
       JOIN usuarios u1 ON ac.id_usuario_apertura = u1.id_usuario
       LEFT JOIN usuarios u2 ON ac.id_usuario_cierre = u2.id_usuario
       WHERE ac.id_arqueo = $1`,
      [caja.id_arqueo]
    );

    res.json({
      success: true,
      message: 'Caja cerrada exitosamente',
      data: cajaConUsuarios.rows[0]
    });

  } catch (error) {
    console.error('Error al cerrar caja:', error);
    res.status(500).json({
      success: false,
      message: 'Error al cerrar caja',
      error: error.message
    });
  }
};

/**
 * Obtener estado actual de caja
 * GET /api/caja/estado
 */
const getEstadoCaja = async (req, res) => {
  try {
    const result = await query(
      `SELECT ac.*, 
       u1.nombre_completo as usuario_apertura,
       u2.nombre_completo as usuario_cierre
       FROM arqueo_caja ac
       JOIN usuarios u1 ON ac.id_usuario_apertura = u1.id_usuario
       LEFT JOIN usuarios u2 ON ac.id_usuario_cierre = u2.id_usuario
       WHERE ac.estado = 'ABIERTA'
       ORDER BY ac.fecha_apertura DESC
       LIMIT 1`
    );

    if (result.rows.length === 0) {
      return res.json({
        success: true,
        message: 'No hay caja abierta',
        data: null
      });
    }

    // Obtener ventas del día
    const caja = result.rows[0];
    const ventasResult = await query(
      `SELECT COUNT(*) as total_ventas, 
       COALESCE(SUM(total / tm.tasa_cambio_usd), 0) as total_usd
       FROM ventas v
       JOIN tipos_moneda tm ON v.id_moneda = tm.id_moneda
       WHERE v.fecha_venta >= $1 AND v.estado_venta = 'COMPLETADA'`,
      [caja.fecha_apertura]
    );

    caja.ventas_dia = ventasResult.rows[0];

    res.json({
      success: true,
      data: caja
    });

  } catch (error) {
    console.error('Error al obtener estado de caja:', error);
    res.status(500).json({
      success: false,
      message: 'Error al obtener estado de caja',
      error: error.message
    });
  }
};

/**
 * Obtener flujo de caja por período
 * GET /api/caja/flujo
 */
const getFlujoCaja = async (req, res) => {
  try {
    const { fecha_inicio, fecha_fin, tipo } = req.query;

    let sqlQuery = `
      SELECT fc.*, tm.codigo_moneda, tm.simbolo, u.nombre_completo as usuario
      FROM flujo_caja fc
      JOIN tipos_moneda tm ON fc.id_moneda = tm.id_moneda
      JOIN usuarios u ON fc.id_usuario = u.id_usuario
      WHERE 1=1
    `;
    const params = [];

    if (fecha_inicio) {
      params.push(fecha_inicio);
      sqlQuery += ` AND fc.fecha_transaccion >= $${params.length}`;
    }

    if (fecha_fin) {
      params.push(fecha_fin);
      sqlQuery += ` AND fc.fecha_transaccion <= $${params.length}`;
    }

    if (tipo) {
      params.push(tipo);
      sqlQuery += ` AND fc.tipo_transaccion = $${params.length}`;
    }

    sqlQuery += ' ORDER BY fc.fecha_transaccion DESC';

    const result = await query(sqlQuery, params);

    // Calcular totales por moneda
    const totalesPorMoneda = result.rows.reduce((acc, t) => {
      const moneda = t.codigo_moneda;
      if (!acc[moneda]) {
        acc[moneda] = { ingresos: 0, egresos: 0 };
      }
      
      if (t.tipo_transaccion === 'INGRESO') {
        acc[moneda].ingresos += parseFloat(t.monto);
      } else {
        acc[moneda].egresos += parseFloat(t.monto);
      }
      
      return acc;
    }, {});

    // Calcular totales en USD
    const ingresos = result.rows
      .filter(t => t.tipo_transaccion === 'INGRESO')
      .reduce((sum, t) => sum + parseFloat(t.monto_usd || 0), 0);

    const egresos = result.rows
      .filter(t => t.tipo_transaccion === 'EGRESO')
      .reduce((sum, t) => sum + parseFloat(t.monto_usd || 0), 0);

    res.json({
      success: true,
      data: result.rows,
      resumen: {
        total_ingresos: ingresos,
        total_egresos: egresos,
        balance: ingresos - egresos,
        por_moneda: totalesPorMoneda
      }
    });

  } catch (error) {
    console.error('Error al obtener flujo de caja:', error);
    res.status(500).json({
      success: false,
      message: 'Error al obtener flujo de caja',
      error: error.message
    });
  }
};

/**
 * Registrar transacción manual (ingreso/egreso)
 * POST /api/caja/transaccion
 */
const registrarTransaccion = async (req, res) => {
  try {
    const {
      tipo_transaccion,
      concepto,
      descripcion = '',
      monto,
      id_moneda,
      categoria_gasto = null,
      metodo_pago = 'EFECTIVO'
    } = req.body;

    const idUsuario = req.user.id_usuario;

    // Validar tipo de transacción
    if (!['INGRESO', 'EGRESO'].includes(tipo_transaccion)) {
      return res.status(400).json({
        success: false,
        message: 'Tipo de transacción inválido. Debe ser INGRESO o EGRESO'
      });
    }

    // Validar que haya caja abierta
    const cajaAbierta = await query(
      "SELECT * FROM arqueo_caja WHERE estado = 'ABIERTA' ORDER BY fecha_apertura DESC LIMIT 1"
    );

    if (cajaAbierta.rows.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No hay caja abierta. Debe abrir una caja primero'
      });
    }

    // Obtener tasa de cambio
    const tasaResult = await query(
      'SELECT tasa_cambio_usd FROM tipos_moneda WHERE id_moneda = $1',
      [id_moneda]
    );

    if (tasaResult.rows.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Moneda no encontrada'
      });
    }

    const montoUsd = parseFloat(monto) / parseFloat(tasaResult.rows[0].tasa_cambio_usd);

    // Registrar transacción
    const result = await query(
      `INSERT INTO flujo_caja (tipo_transaccion, concepto, descripcion, monto, id_moneda, 
       monto_usd, id_usuario, categoria_gasto, metodo_pago)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING *`,
      [tipo_transaccion, concepto, descripcion, monto, id_moneda, montoUsd, 
       idUsuario, categoria_gasto, metodo_pago]
    );

    // Obtener información completa
    const transaccionCompleta = await query(
      `SELECT fc.*, tm.codigo_moneda, tm.simbolo, u.nombre_completo as usuario
       FROM flujo_caja fc
       JOIN tipos_moneda tm ON fc.id_moneda = tm.id_moneda
       JOIN usuarios u ON fc.id_usuario = u.id_usuario
       WHERE fc.id_transaccion = $1`,
      [result.rows[0].id_transaccion]
    );

    res.status(201).json({
      success: true,
      message: 'Transacción registrada exitosamente',
      data: transaccionCompleta.rows[0]
    });

  } catch (error) {
    console.error('Error al registrar transacción:', error);
    res.status(500).json({
      success: false,
      message: 'Error al registrar transacción',
      error: error.message
    });
  }
};

/**
 * Obtener resumen de ventas (diario, semanal, mensual)
 * GET /api/caja/resumen-ventas
 */
const getResumenVentas = async (req, res) => {
  try {
    const { periodo = 'diario', fecha_inicio, fecha_fin } = req.query;

    let fechaInicioCalc;
    const ahora = new Date();

    // Usar fechas personalizadas si se proporcionan
    if (fecha_inicio && fecha_fin) {
      fechaInicioCalc = new Date(fecha_inicio);
    } else {
      // Usar período predeterminado
      switch (periodo) {
        case 'diario':
          fechaInicioCalc = new Date(ahora.setHours(0, 0, 0, 0));
          break;
        case 'semanal':
          fechaInicioCalc = new Date(ahora.setDate(ahora.getDate() - 7));
          break;
        case 'mensual':
          fechaInicioCalc = new Date(ahora.setMonth(ahora.getMonth() - 1));
          break;
        default:
          fechaInicioCalc = new Date(ahora.setHours(0, 0, 0, 0));
      }
    }

    let sqlQuery = `SELECT 
         COUNT(*) as total_ventas,
         COALESCE(SUM(total / tm.tasa_cambio_usd), 0) as total_usd,
         COALESCE(SUM(CASE WHEN tm.codigo_moneda = 'USD' THEN total ELSE 0 END), 0) as total_usd_original,
         COALESCE(SUM(CASE WHEN tm.codigo_moneda = 'VES' THEN total ELSE 0 END), 0) as total_ves,
         COALESCE(SUM(CASE WHEN tm.codigo_moneda = 'COP' THEN total ELSE 0 END), 0) as total_cop
       FROM ventas v
       JOIN tipos_moneda tm ON v.id_moneda = tm.id_moneda
       WHERE v.fecha_venta >= $1 AND v.estado_venta = 'COMPLETADA'`;

    const params = [fechaInicioCalc];

    if (fecha_fin) {
      params.push(fecha_fin);
      sqlQuery += ` AND v.fecha_venta <= $${params.length}`;
    }

    const result = await query(sqlQuery, params);

    res.json({
      success: true,
      periodo,
      fecha_inicio: fecha_inicio || fechaInicioCalc.toISOString(),
      fecha_fin: fecha_fin || new Date().toISOString(),
      data: result.rows[0]
    });

  } catch (error) {
    console.error('Error al obtener resumen de ventas:', error);
    res.status(500).json({
      success: false,
      message: 'Error al obtener resumen de ventas',
      error: error.message
    });
  }
};

/**
 * Historial de arqueos de caja
 * GET /api/caja/historial
 */
const getHistorialArqueos = async (req, res) => {
  try {
    const { limit = 30 } = req.query;

    const result = await query(
      `SELECT ac.*, 
       u1.nombre_completo as usuario_apertura,
       u2.nombre_completo as usuario_cierre
       FROM arqueo_caja ac
       JOIN usuarios u1 ON ac.id_usuario_apertura = u1.id_usuario
       LEFT JOIN usuarios u2 ON ac.id_usuario_cierre = u2.id_usuario
       ORDER BY ac.fecha_apertura DESC
       LIMIT $1`,
      [limit]
    );

    res.json({
      success: true,
      data: result.rows
    });

  } catch (error) {
    console.error('Error al obtener historial:', error);
    res.status(500).json({
      success: false,
      message: 'Error al obtener historial',
      error: error.message
    });
  }
};

module.exports = {
  abrirCaja,
  cerrarCaja,
  getEstadoCaja,
  getFlujoCaja,
  registrarTransaccion,
  getResumenVentas,
  getHistorialArqueos
};