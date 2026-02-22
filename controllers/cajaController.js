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

    const result = await query(
      `INSERT INTO arqueo_caja (id_usuario_apertura, monto_inicial_usd, monto_inicial_ves, 
       monto_inicial_cop, notas_apertura)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [idUsuario, monto_inicial_usd, monto_inicial_ves, monto_inicial_cop, notas]
    );

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
 * Cerrar caja - CORREGIDO: usa tasas reales de la BD en lugar de hardcodeadas
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

    // ✅ FIX: Calcular ventas usando totales REALES por moneda desde la BD
    const ventasResult = await query(
      `SELECT 
         COALESCE(SUM(v.total / tm.tasa_cambio_usd), 0) as total_usd,
         COALESCE(SUM(CASE WHEN tm.codigo_moneda = 'USD' THEN v.total ELSE 0 END), 0) as total_usd_original,
         COALESCE(SUM(CASE WHEN tm.codigo_moneda = 'VES' THEN v.total ELSE 0 END), 0) as total_ves,
         COALESCE(SUM(CASE WHEN tm.codigo_moneda = 'COP' THEN v.total ELSE 0 END), 0) as total_cop,
         COUNT(*) as total_ventas
       FROM ventas v
       JOIN tipos_moneda tm ON v.id_moneda = tm.id_moneda
       WHERE v.fecha_venta >= $1 AND v.estado_venta = 'COMPLETADA'`,
      [caja.fecha_apertura]
    );

    const ventas = ventasResult.rows[0];
    const ventasEsperadasUSD = parseFloat(ventas.total_usd);

    // ✅ FIX: Calcular diferencia basada en la moneda principal con montos reales de ventas
    let diferencia = 0;
    const mFinalCOP = parseFloat(monto_final_cop);
    const mFinalUSD = parseFloat(monto_final_usd);
    const mFinalVES = parseFloat(monto_final_ves);
    const mInicialCOP = parseFloat(caja.monto_inicial_cop || 0);
    const mInicialUSD = parseFloat(caja.monto_inicial_usd || 0);
    const mInicialVES = parseFloat(caja.monto_inicial_ves || 0);

    if (mInicialCOP > 0 || mFinalCOP > 0) {
      const esperadoCOP = mInicialCOP + parseFloat(ventas.total_cop);
      diferencia = mFinalCOP - esperadoCOP;
    } else if (mInicialUSD > 0 || mFinalUSD > 0) {
      const esperadoUSD = mInicialUSD + parseFloat(ventas.total_usd_original);
      diferencia = mFinalUSD - esperadoUSD;
    } else if (mInicialVES > 0 || mFinalVES > 0) {
      const esperadoVES = mInicialVES + parseFloat(ventas.total_ves);
      diferencia = mFinalVES - esperadoVES;
    }

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
       ventasEsperadasUSD, diferencia, notas, caja.id_arqueo]
    );

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
      data: {
        ...cajaConUsuarios.rows[0],
        resumen_ventas: ventas
      }
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

    const caja = result.rows[0];

    // ✅ FIX: Incluir totales por moneda en estado de caja
    const ventasResult = await query(
      `SELECT 
         COUNT(*) as total_ventas, 
         COALESCE(SUM(v.total / tm.tasa_cambio_usd), 0) as total_usd,
         COALESCE(SUM(CASE WHEN tm.codigo_moneda = 'USD' THEN v.total ELSE 0 END), 0) as total_usd_original,
         COALESCE(SUM(CASE WHEN tm.codigo_moneda = 'VES' THEN v.total ELSE 0 END), 0) as total_ves,
         COALESCE(SUM(CASE WHEN tm.codigo_moneda = 'COP' THEN v.total ELSE 0 END), 0) as total_cop
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
 * ✅ FIX: El filtro de fecha_fin ahora cubre el día completo (hasta 23:59:59)
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
      // Inicio del día
      params.push(fecha_inicio + ' 00:00:00');
      sqlQuery += ` AND fc.fecha_transaccion >= $${params.length}`;
    }

    if (fecha_fin) {
      // ✅ FIX: Cubrir todo el día hasta las 23:59:59
      params.push(fecha_fin + ' 23:59:59');
      sqlQuery += ` AND fc.fecha_transaccion <= $${params.length}`;
    }

    if (tipo) {
      params.push(tipo);
      sqlQuery += ` AND fc.tipo_transaccion = $${params.length}`;
    }

    sqlQuery += ' ORDER BY fc.fecha_transaccion DESC';

    const result = await query(sqlQuery, params);

    const totalesPorMoneda = result.rows.reduce((acc, t) => {
      const moneda = t.codigo_moneda;
      if (!acc[moneda]) {
        acc[moneda] = { ingresos: 0, egresos: 0, balance: 0 };
      }
      if (t.tipo_transaccion === 'INGRESO') {
        acc[moneda].ingresos += parseFloat(t.monto);
      } else {
        acc[moneda].egresos += parseFloat(t.monto);
      }
      acc[moneda].balance = acc[moneda].ingresos - acc[moneda].egresos;
      return acc;
    }, {});

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
 * Registrar transacción manual
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

    if (!['INGRESO', 'EGRESO'].includes(tipo_transaccion)) {
      return res.status(400).json({
        success: false,
        message: 'Tipo de transacción inválido. Debe ser INGRESO o EGRESO'
      });
    }

    const cajaAbierta = await query(
      "SELECT * FROM arqueo_caja WHERE estado = 'ABIERTA' ORDER BY fecha_apertura DESC LIMIT 1"
    );

    if (cajaAbierta.rows.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No hay caja abierta. Debe abrir una caja primero'
      });
    }

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

    const result = await query(
      `INSERT INTO flujo_caja (tipo_transaccion, concepto, descripcion, monto, id_moneda, 
       monto_usd, id_usuario, categoria_gasto, metodo_pago)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING *`,
      [tipo_transaccion, concepto, descripcion, monto, id_moneda, montoUsd,
       idUsuario, categoria_gasto, metodo_pago]
    );

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
 * Obtener resumen de ventas
 * GET /api/caja/resumen-ventas
 * ✅ FIX: fecha_fin cubre el día completo, fecha_inicio desde 00:00:00
 */
const getResumenVentas = async (req, res) => {
  try {
    const { periodo = 'diario', fecha_inicio, fecha_fin } = req.query;

    let fechaInicioCalc;
    let fechaFinCalc;
    const ahora = new Date();

    if (fecha_inicio) {
      // ✅ FIX: Asegurar que la fecha inicio cubre desde 00:00:00
      fechaInicioCalc = new Date(fecha_inicio + 'T00:00:00');
    } else {
      switch (periodo) {
        case 'diario':
          fechaInicioCalc = new Date(ahora);
          fechaInicioCalc.setHours(0, 0, 0, 0);
          break;
        case 'semanal':
          fechaInicioCalc = new Date(ahora);
          fechaInicioCalc.setDate(ahora.getDate() - 7);
          fechaInicioCalc.setHours(0, 0, 0, 0);
          break;
        case 'mensual':
          fechaInicioCalc = new Date(ahora);
          fechaInicioCalc.setMonth(ahora.getMonth() - 1);
          fechaInicioCalc.setHours(0, 0, 0, 0);
          break;
        default:
          fechaInicioCalc = new Date(ahora);
          fechaInicioCalc.setHours(0, 0, 0, 0);
      }
    }

    if (fecha_fin) {
      // ✅ FIX: Cubrir hasta el final del día
      fechaFinCalc = new Date(fecha_fin + 'T23:59:59');
    } else {
      fechaFinCalc = new Date(ahora);
      fechaFinCalc.setHours(23, 59, 59, 999);
    }

    const result = await query(
      `SELECT 
         COUNT(*) as total_ventas,
         COALESCE(SUM(v.total / tm.tasa_cambio_usd), 0) as total_usd,
         COALESCE(SUM(CASE WHEN tm.codigo_moneda = 'USD' THEN v.total ELSE 0 END), 0) as total_usd_original,
         COALESCE(SUM(CASE WHEN tm.codigo_moneda = 'VES' THEN v.total ELSE 0 END), 0) as total_ves,
         COALESCE(SUM(CASE WHEN tm.codigo_moneda = 'COP' THEN v.total ELSE 0 END), 0) as total_cop,
         COALESCE(AVG(v.total / tm.tasa_cambio_usd), 0) as promedio_venta
       FROM ventas v
       JOIN tipos_moneda tm ON v.id_moneda = tm.id_moneda
       WHERE v.fecha_venta >= $1 
         AND v.fecha_venta <= $2
         AND v.estado_venta = 'COMPLETADA'`,
      [fechaInicioCalc, fechaFinCalc]
    );

    res.json({
      success: true,
      periodo,
      fecha_inicio: fechaInicioCalc.toISOString(),
      fecha_fin: fechaFinCalc.toISOString(),
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