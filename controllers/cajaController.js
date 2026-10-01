const { query, getClient } = require('../config/database');
const { soloFecha, hoyNegocio, inicioDiaSQL, finDiaSQL } = require('../utils/fechas');

const MONEDAS = ['COP', 'USD', 'VES'];

const redondear = (valor) => Math.round((parseFloat(valor) || 0) * 100) / 100;

/**
 * Convierte un monto del body a número. Devuelve null si no es válido
 * (texto, negativo, etc.) para poder rechazar la petición.
 */
const leerMonto = (valor) => {
  if (valor === undefined || valor === null || valor === '') return 0;
  const numero = Number(valor);
  return Number.isFinite(numero) && numero >= 0 ? numero : null;
};

const SQL_ARQUEO_CON_USUARIOS = `
  SELECT ac.*,
         u1.nombre_completo as usuario_apertura,
         u2.nombre_completo as usuario_cierre
  FROM arqueo_caja ac
  JOIN usuarios u1 ON ac.id_usuario_apertura = u1.id_usuario
  LEFT JOIN usuarios u2 ON ac.id_usuario_cierre = u2.id_usuario
`;

/**
 * Resumen de ventas COMPLETADAS que cumplen `where` (condición sobre "ventas v").
 * Los totales por moneda salen de lo realmente cobrado (venta_pagos), así un
 * pago dividido en dos monedas suma en cada una. Las ventas antiguas sin
 * detalle de pagos se cuentan como efectivo en la moneda de la venta.
 *
 * `db` es cualquier objeto con .query (el pool o un cliente en transacción).
 */
const getResumenVentasWhere = async (db, where, params = []) => {
  const cte = `
    WITH ventas_sel AS (
      SELECT v.id_venta, v.total, v.id_moneda
      FROM ventas v
      WHERE ${where} AND v.estado_venta = 'COMPLETADA'
    ),
    cobros AS (
      SELECT vp.id_venta, vp.id_moneda, vp.monto, vp.id_metodo_pago
      FROM venta_pagos vp
      JOIN ventas_sel vs ON vs.id_venta = vp.id_venta
      UNION ALL
      SELECT vs.id_venta, vs.id_moneda, vs.total,
             (SELECT id_metodo_pago FROM metodos_pago WHERE codigo = 'EFECTIVO' LIMIT 1)
      FROM ventas_sel vs
      WHERE NOT EXISTS (SELECT 1 FROM venta_pagos vp WHERE vp.id_venta = vs.id_venta)
    )
  `;

  const totalesResult = await db.query(
    `${cte}
     SELECT
       (SELECT COUNT(*) FROM ventas_sel) as total_ventas,
       (SELECT COALESCE(SUM(vs.total / tm.tasa_cambio_usd), 0)
          FROM ventas_sel vs JOIN tipos_moneda tm ON tm.id_moneda = vs.id_moneda) as total_usd,
       (SELECT COALESCE(AVG(vs.total / tm.tasa_cambio_usd), 0)
          FROM ventas_sel vs JOIN tipos_moneda tm ON tm.id_moneda = vs.id_moneda) as promedio_venta,
       COALESCE(SUM(c.monto) FILTER (WHERE tm.codigo_moneda = 'USD'), 0) as total_usd_original,
       COALESCE(SUM(c.monto) FILTER (WHERE tm.codigo_moneda = 'VES'), 0) as total_ves,
       COALESCE(SUM(c.monto) FILTER (WHERE tm.codigo_moneda = 'COP'), 0) as total_cop
     FROM cobros c
     JOIN tipos_moneda tm ON tm.id_moneda = c.id_moneda`,
    params
  );

  const desgloseResult = await db.query(
    `${cte}
     SELECT mp.id_metodo_pago, mp.codigo, mp.nombre, mp.icono,
            tm.codigo_moneda, tm.simbolo,
            COALESCE(SUM(c.monto), 0) AS total,
            COUNT(DISTINCT c.id_venta) AS cantidad_ventas
     FROM cobros c
     JOIN metodos_pago mp ON mp.id_metodo_pago = c.id_metodo_pago
     JOIN tipos_moneda tm ON tm.id_moneda = c.id_moneda
     GROUP BY mp.id_metodo_pago, mp.codigo, mp.nombre, mp.icono, mp.orden, tm.codigo_moneda, tm.simbolo
     ORDER BY mp.orden, mp.nombre`,
    params
  );

  return { ventas: totalesResult.rows[0], desglose: desgloseResult.rows };
};

/**
 * Cuadre completo de un arqueo: ventas, desglose por método de pago y el
 * efectivo que debería haber en la gaveta por moneda:
 *   esperado = monto inicial + ventas en efectivo + ingresos − egresos
 * Lo cobrado por Nequi, Pago Móvil, transferencia, etc. no entra a la gaveta.
 */
const calcularCuadreArqueo = async (db, arqueo) => {
  const { ventas, desglose } = await getResumenVentasWhere(db, 'v.id_arqueo = $1', [arqueo.id_arqueo]);

  const movimientosResult = await db.query(
    `SELECT tm.codigo_moneda, fc.tipo_transaccion, COALESCE(SUM(fc.monto), 0) as total
     FROM flujo_caja fc
     JOIN tipos_moneda tm ON tm.id_moneda = fc.id_moneda
     WHERE fc.id_arqueo = $1
       AND fc.id_venta IS NULL
       AND UPPER(COALESCE(fc.metodo_pago, 'EFECTIVO')) = 'EFECTIVO'
     GROUP BY tm.codigo_moneda, fc.tipo_transaccion`,
    [arqueo.id_arqueo]
  );

  const pendientesResult = await db.query(
    `SELECT COUNT(*) as total FROM ventas
     WHERE id_arqueo = $1 AND estado_venta IN ('PENDIENTE', 'EN_PROCESO')`,
    [arqueo.id_arqueo]
  );

  const efectivo = {};
  for (const moneda of MONEDAS) {
    const sufijo = moneda.toLowerCase();
    const inicial = redondear(arqueo[`monto_inicial_${sufijo}`]);
    const ventasMoneda = redondear(moneda === 'USD' ? ventas.total_usd_original : ventas[`total_${sufijo}`]);
    const ventasEfectivo = redondear(
      desglose
        .filter(d => d.codigo === 'EFECTIVO' && d.codigo_moneda === moneda)
        .reduce((suma, d) => suma + parseFloat(d.total), 0)
    );
    const movimiento = (tipo) => redondear(
      movimientosResult.rows
        .filter(m => m.codigo_moneda === moneda && m.tipo_transaccion === tipo)
        .reduce((suma, m) => suma + parseFloat(m.total), 0)
    );
    const ingresos = movimiento('INGRESO');
    const egresos = movimiento('EGRESO');

    efectivo[moneda] = {
      inicial,
      ventas: ventasMoneda,
      ventas_efectivo: ventasEfectivo,
      ingresos,
      egresos,
      esperado: redondear(inicial + ventasEfectivo + ingresos - egresos)
    };
  }

  return {
    ventas,
    desglose,
    efectivo,
    ventas_pendientes: parseInt(pendientesResult.rows[0].total, 10)
  };
};

/**
 * Abrir caja
 * POST /api/caja/abrir
 */
const abrirCaja = async (req, res) => {
  try {
    const { notas } = req.body;
    const montoInicialUsd = leerMonto(req.body.monto_inicial_usd);
    const montoInicialVes = leerMonto(req.body.monto_inicial_ves);
    const montoInicialCop = leerMonto(req.body.monto_inicial_cop);

    if (montoInicialUsd === null || montoInicialVes === null || montoInicialCop === null) {
      return res.status(400).json({
        success: false,
        message: 'El monto inicial debe ser un número mayor o igual a 0'
      });
    }

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
      [idUsuario, montoInicialUsd, montoInicialVes, montoInicialCop, notas]
    );

    const cajaConUsuario = await query(
      `${SQL_ARQUEO_CON_USUARIOS} WHERE ac.id_arqueo = $1`,
      [result.rows[0].id_arqueo]
    );

    res.status(201).json({
      success: true,
      message: 'Caja abierta exitosamente',
      data: cajaConUsuario.rows[0]
    });

  } catch (error) {
    // Índice único: dos aperturas al mismo tiempo
    if (error.code === '23505') {
      return res.status(400).json({
        success: false,
        message: 'Ya existe una caja abierta'
      });
    }
    console.error('Error al abrir caja:', error);
    res.status(500).json({
      success: false,
      message: 'Error al abrir caja',
      error: error.message
    });
  }
};

/**
 * Cerrar caja. Compara, por cada moneda, el efectivo contado contra el
 * efectivo esperado del turno y guarda el cuadre completo en resumen_cierre.
 * POST /api/caja/cerrar
 */
const cerrarCaja = async (req, res) => {
  const client = await getClient();

  try {
    const { notas } = req.body;
    const contado = {
      USD: leerMonto(req.body.monto_final_usd),
      VES: leerMonto(req.body.monto_final_ves),
      COP: leerMonto(req.body.monto_final_cop)
    };

    if (MONEDAS.some(moneda => contado[moneda] === null)) {
      return res.status(400).json({
        success: false,
        message: 'Los montos contados deben ser números mayores o iguales a 0'
      });
    }

    const idUsuario = req.user.id_usuario;

    await client.query('BEGIN');

    // FOR UPDATE: mientras se cierra no puede entrar una venta nueva a esta caja
    const cajaResult = await client.query(
      "SELECT * FROM arqueo_caja WHERE estado = 'ABIERTA' ORDER BY fecha_apertura DESC LIMIT 1 FOR UPDATE"
    );

    if (cajaResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({
        success: false,
        message: 'No hay caja abierta'
      });
    }

    const caja = cajaResult.rows[0];
    const cuadre = await calcularCuadreArqueo(client, caja);

    if (cuadre.ventas_pendientes > 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({
        success: false,
        codigo: 'VENTAS_PENDIENTES',
        message: `Hay ${cuadre.ventas_pendientes} venta(s) sin completar en esta caja. Complétalas o cancélalas antes de cerrar.`,
        data: { ventas_pendientes: cuadre.ventas_pendientes }
      });
    }

    const tasasResult = await client.query('SELECT codigo_moneda, tasa_cambio_usd FROM tipos_moneda');
    const tasas = {};
    tasasResult.rows.forEach(t => { tasas[t.codigo_moneda] = parseFloat(t.tasa_cambio_usd); });

    const porMoneda = {};
    let diferenciaUSD = 0;
    for (const moneda of MONEDAS) {
      const diferencia = redondear(contado[moneda] - cuadre.efectivo[moneda].esperado);
      porMoneda[moneda] = {
        ...cuadre.efectivo[moneda],
        contado: redondear(contado[moneda]),
        diferencia
      };
      if (tasas[moneda] > 0) diferenciaUSD += diferencia / tasas[moneda];
    }

    const resumenCierre = {
      version: 1,
      total_ventas: parseInt(cuadre.ventas.total_ventas, 10),
      por_moneda: porMoneda,
      tasas
    };

    await client.query(
      `UPDATE arqueo_caja
       SET id_usuario_cierre = $1,
           monto_final_usd = $2,
           monto_final_ves = $3,
           monto_final_cop = $4,
           ventas_esperadas_usd = $5,
           diferencia_usd = $6,
           fecha_cierre = CURRENT_TIMESTAMP,
           notas_cierre = $7,
           desglose_pagos = $8,
           resumen_cierre = $9,
           estado = 'CERRADA'
       WHERE id_arqueo = $10`,
      [idUsuario, contado.USD, contado.VES, contado.COP,
       parseFloat(cuadre.ventas.total_usd), redondear(diferenciaUSD), notas,
       JSON.stringify(cuadre.desglose), JSON.stringify(resumenCierre), caja.id_arqueo]
    );

    await client.query('COMMIT');

    const cajaConUsuarios = await query(
      `${SQL_ARQUEO_CON_USUARIOS} WHERE ac.id_arqueo = $1`,
      [caja.id_arqueo]
    );

    res.json({
      success: true,
      message: 'Caja cerrada exitosamente',
      data: {
        ...cajaConUsuarios.rows[0],
        resumen_ventas: cuadre.ventas,
        desglose_metodos_pago: cuadre.desglose
      }
    });

  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('Error al cerrar caja:', error);
    res.status(500).json({
      success: false,
      message: 'Error al cerrar caja',
      error: error.message
    });
  } finally {
    client.release();
  }
};

/**
 * Obtener estado actual de caja
 * GET /api/caja/estado
 */
const getEstadoCaja = async (req, res) => {
  try {
    const result = await query(
      `${SQL_ARQUEO_CON_USUARIOS}
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
    const cuadre = await calcularCuadreArqueo({ query }, caja);

    // Solo las ventas registradas en ESTA caja (desde que se abrió)
    caja.ventas_dia = cuadre.ventas;
    caja.desglose_metodos_pago = cuadre.desglose;
    caja.efectivo = cuadre.efectivo;
    caja.ventas_pendientes = cuadre.ventas_pendientes;

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
 * Las fechas son días del negocio (hora de Venezuela), ambos inclusive
 */
const getFlujoCaja = async (req, res) => {
  try {
    const { tipo, id_arqueo } = req.query;
    const fechaInicio = soloFecha(req.query.fecha_inicio);
    const fechaFin = soloFecha(req.query.fecha_fin);

    let sqlQuery = `
      SELECT fc.*, tm.codigo_moneda, tm.simbolo, u.nombre_completo as usuario
      FROM flujo_caja fc
      JOIN tipos_moneda tm ON fc.id_moneda = tm.id_moneda
      JOIN usuarios u ON fc.id_usuario = u.id_usuario
      WHERE 1=1
    `;
    const params = [];

    if (fechaInicio) {
      params.push(fechaInicio);
      sqlQuery += ` AND fc.fecha_transaccion >= ${inicioDiaSQL(`$${params.length}`)}`;
    }

    if (fechaFin) {
      params.push(fechaFin);
      sqlQuery += ` AND fc.fecha_transaccion < ${finDiaSQL(`$${params.length}`)}`;
    }

    if (tipo) {
      params.push(tipo);
      sqlQuery += ` AND fc.tipo_transaccion = $${params.length}`;
    }

    if (id_arqueo) {
      params.push(parseInt(id_arqueo, 10));
      sqlQuery += ` AND fc.id_arqueo = $${params.length}`;
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

    const montoNumero = Number(monto);
    if (!Number.isFinite(montoNumero) || montoNumero <= 0) {
      return res.status(400).json({
        success: false,
        message: 'El monto debe ser un número mayor a 0'
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

    const montoUsd = montoNumero / parseFloat(tasaResult.rows[0].tasa_cambio_usd);

    // El movimiento queda amarrado a la caja abierta: entra en su cuadre
    const result = await query(
      `INSERT INTO flujo_caja (tipo_transaccion, concepto, descripcion, monto, id_moneda,
       monto_usd, id_usuario, categoria_gasto, metodo_pago, id_arqueo)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING *`,
      [tipo_transaccion, concepto, descripcion, montoNumero, id_moneda, montoUsd,
       idUsuario, categoria_gasto, metodo_pago, cajaAbierta.rows[0].id_arqueo]
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
 * Obtener resumen de ventas de un rango de días del negocio
 * GET /api/caja/resumen-ventas
 * Query: fecha_inicio, fecha_fin ('YYYY-MM-DD', inclusive) o periodo
 * (diario | semanal | mensual) cuando no se manda fecha_inicio.
 */
const getResumenVentas = async (req, res) => {
  try {
    const { periodo = 'diario' } = req.query;
    const hoy = hoyNegocio();

    let fechaInicio = soloFecha(req.query.fecha_inicio);
    const fechaFin = soloFecha(req.query.fecha_fin) || hoy;

    if (!fechaInicio) {
      const inicio = new Date(hoy + 'T00:00:00Z');
      if (periodo === 'semanal') inicio.setUTCDate(inicio.getUTCDate() - 7);
      if (periodo === 'mensual') inicio.setUTCMonth(inicio.getUTCMonth() - 1);
      fechaInicio = inicio.toISOString().slice(0, 10);
    }

    const { ventas, desglose } = await getResumenVentasWhere(
      { query },
      `v.fecha_venta >= ${inicioDiaSQL('$1')} AND v.fecha_venta < ${finDiaSQL('$2')}`,
      [fechaInicio, fechaFin]
    );

    res.json({
      success: true,
      periodo,
      fecha_inicio: fechaInicio,
      fecha_fin: fechaFin,
      data: ventas,
      desglose_metodos_pago: desglose
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
 * Cada arqueo trae las ventas reales de su turno (ventas_cop/ves/usd),
 * no la resta "monto final − monto inicial".
 */
const getHistorialArqueos = async (req, res) => {
  try {
    const { limit = 30 } = req.query;
    const fechaInicio = soloFecha(req.query.fecha_inicio);
    const fechaFin = soloFecha(req.query.fecha_fin);

    let sqlQuery = `
      SELECT ac.*,
       u1.nombre_completo as usuario_apertura,
       u2.nombre_completo as usuario_cierre,
       COALESCE(vt.total_ventas, 0) as total_ventas,
       COALESCE(vt.ventas_cop, 0) as ventas_cop,
       COALESCE(vt.ventas_ves, 0) as ventas_ves,
       COALESCE(vt.ventas_usd, 0) as ventas_usd
       FROM arqueo_caja ac
       JOIN usuarios u1 ON ac.id_usuario_apertura = u1.id_usuario
       LEFT JOIN usuarios u2 ON ac.id_usuario_cierre = u2.id_usuario
       LEFT JOIN LATERAL (
         SELECT COUNT(*) as total_ventas,
                SUM(v.total) FILTER (WHERE tm.codigo_moneda = 'COP') as ventas_cop,
                SUM(v.total) FILTER (WHERE tm.codigo_moneda = 'VES') as ventas_ves,
                SUM(v.total) FILTER (WHERE tm.codigo_moneda = 'USD') as ventas_usd
         FROM ventas v
         JOIN tipos_moneda tm ON tm.id_moneda = v.id_moneda
         WHERE v.id_arqueo = ac.id_arqueo AND v.estado_venta = 'COMPLETADA'
       ) vt ON true
       WHERE 1=1
    `;
    const params = [];

    if (fechaInicio) {
      params.push(fechaInicio);
      sqlQuery += ` AND ac.fecha_apertura >= ${inicioDiaSQL(`$${params.length}`)}`;
    }

    if (fechaFin) {
      params.push(fechaFin);
      sqlQuery += ` AND ac.fecha_apertura < ${finDiaSQL(`$${params.length}`)}`;
    }

    params.push(parseInt(limit, 10) || 30);
    sqlQuery += ` ORDER BY ac.fecha_apertura DESC LIMIT $${params.length}`;

    const result = await query(sqlQuery, params);

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

/**
 * Obtener ventas detalladas de un arqueo específico
 * GET /api/caja/historial/:id_arqueo/ventas
 */
const getVentasPorArqueo = async (req, res) => {
  try {
    const { id_arqueo } = req.params;

    const arqueoResult = await query(
      `${SQL_ARQUEO_CON_USUARIOS} WHERE ac.id_arqueo = $1`,
      [id_arqueo]
    );

    if (arqueoResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Arqueo no encontrado'
      });
    }

    const arqueo = arqueoResult.rows[0];

    // Ventas registradas en este arqueo (no por rango de horas)
    const ventasResult = await query(
      `SELECT
         v.id_venta,
         v.numero_factura,
         v.fecha_venta,
         v.total,
         v.estado_venta,
         v.nombre_cliente,
         tm.codigo_moneda,
         tm.simbolo,
         COALESCE(
           json_agg(
             json_build_object(
               'nombre_producto', p.nombre_producto,
               'cantidad',        dv.cantidad,
               'precio_unitario', dv.precio_unitario,
               'subtotal',        dv.subtotal
             ) ORDER BY dv.id_detalle_venta
           ) FILTER (WHERE dv.id_detalle_venta IS NOT NULL),
           '[]'
         ) as items
       FROM ventas v
       JOIN tipos_moneda tm ON v.id_moneda = tm.id_moneda
       LEFT JOIN detalle_ventas dv ON v.id_venta = dv.id_venta
       LEFT JOIN productos p ON dv.id_producto = p.id_producto
       WHERE v.id_arqueo = $1
         AND v.estado_venta = 'COMPLETADA'
       GROUP BY v.id_venta, v.numero_factura, v.fecha_venta, v.total,
                v.estado_venta, v.nombre_cliente, tm.codigo_moneda, tm.simbolo
       ORDER BY v.fecha_venta DESC`,
      [arqueo.id_arqueo]
    );

    // Resumen de totales por moneda
    const resumen = ventasResult.rows.reduce((acc, v) => {
      const moneda = v.codigo_moneda;
      if (!acc[moneda]) acc[moneda] = 0;
      acc[moneda] += parseFloat(v.total);
      return acc;
    }, {});

    // Desglose por método de pago. Si el arqueo ya está cerrado y tiene el
    // snapshot guardado, se usa ese (histórico fijo); si no, se calcula en vivo.
    let resumenMetodosPago = arqueo.desglose_pagos;
    if (!resumenMetodosPago) {
      const { desglose } = await getResumenVentasWhere({ query }, 'v.id_arqueo = $1', [arqueo.id_arqueo]);
      resumenMetodosPago = desglose;
    }

    res.json({
      success: true,
      data: {
        arqueo,
        ventas: ventasResult.rows,
        total_ventas: ventasResult.rows.length,
        resumen_por_moneda: resumen,
        resumen_por_metodo_pago: resumenMetodosPago
      }
    });

  } catch (error) {
    console.error('Error al obtener ventas del arqueo:', error);
    res.status(500).json({
      success: false,
      message: 'Error al obtener ventas del arqueo',
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
  getHistorialArqueos,
  getVentasPorArqueo
};
