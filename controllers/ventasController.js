const { query, getClient } = require('../config/database');

/**
 * Obtener todas las ventas (con paginación real y total_count)
 * GET /api/ventas
 * Query params: fecha_inicio, fecha_fin, estado | estado_venta, id_usuario, id_cliente, limit, offset
 */
const getVentas = async (req, res) => {
  try {
    const {
      fecha_inicio,
      fecha_fin,
      estado,
      estado_venta, // alias del frontend
      id_usuario,
      id_cliente,
      limit  = 20,
      offset = 0,
    } = req.query;

    // Acepta tanto 'estado' como 'estado_venta'
    const estadoFiltro = estado_venta || estado;

    // ── WHERE compartido ──────────────────────────────────────────────────────
    let whereClause = 'WHERE 1=1';
    const params = [];

    if (fecha_inicio) {
      params.push(fecha_inicio);
      whereClause += ` AND v.fecha_venta >= $${params.length}::date`;
    }

    if (fecha_fin) {
      params.push(fecha_fin);
      // Incluye hasta el último segundo del día indicado
      whereClause += ` AND v.fecha_venta < ($${params.length}::date + INTERVAL '1 day')`;
    }

    if (estadoFiltro) {
      const estados = estadoFiltro.split(',').map(e => e.trim());
      const placeholders = estados.map((_, idx) => `$${params.length + idx + 1}`).join(',');
      estados.forEach(e => params.push(e));
      whereClause += ` AND v.estado_venta IN (${placeholders})`;
    }

    if (id_usuario) {
      params.push(id_usuario);
      whereClause += ` AND v.id_usuario = $${params.length}`;
    }

    if (id_cliente) {
      params.push(id_cliente);
      whereClause += ` AND v.id_cliente = $${params.length}`;
    }

    // ── COUNT total (mismos filtros, sin LIMIT/OFFSET) ────────────────────────
    const countResult = await query(
      `SELECT COUNT(*) AS total FROM ventas v ${whereClause}`,
      params
    );
    const totalCount = parseInt(countResult.rows[0].total, 10);

    // ── Datos paginados ───────────────────────────────────────────────────────
    const dataParams = [...params];

    dataParams.push(parseInt(limit, 10));
    const limitIdx = dataParams.length;

    dataParams.push(parseInt(offset, 10));
    const offsetIdx = dataParams.length;

    const dataResult = await query(
      `SELECT v.*,
              tm.codigo_moneda, tm.simbolo,
              u.username AS nombre_usuario
       FROM ventas v
       JOIN tipos_moneda tm ON v.id_moneda  = tm.id_moneda
       JOIN usuarios     u  ON v.id_usuario = u.id_usuario
       ${whereClause}
       ORDER BY v.fecha_venta DESC
       LIMIT  $${limitIdx}
       OFFSET $${offsetIdx}`,
      dataParams
    );

    res.json({
      success:     true,
      data:        dataResult.rows,
      total_count: totalCount,          // ← total real de registros que cumplen el filtro
      limit:       parseInt(limit, 10),
      offset:      parseInt(offset, 10),
    });

  } catch (error) {
    console.error('Error al obtener ventas:', error);
    res.status(500).json({
      success: false,
      message: 'Error al obtener ventas',
    });
  }
};

/**
 * Obtener venta por ID con detalles completos (incluye siropes)
 * GET /api/ventas/:id
 */
const getVentaById = async (req, res) => {
  try {
    const { id } = req.params;

    const ventaResult = await query(
      `SELECT v.*,
              tm.codigo_moneda, tm.simbolo, tm.tasa_cambio_usd,
              u.username AS nombre_usuario
       FROM ventas v
       JOIN tipos_moneda tm ON v.id_moneda  = tm.id_moneda
       JOIN usuarios     u  ON v.id_usuario = u.id_usuario
       WHERE v.id_venta = $1`,
      [id]
    );

    if (ventaResult.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Venta no encontrada' });
    }

    const venta = ventaResult.rows[0];

    const detallesResult = await query(
      `SELECT dv.*, p.nombre_producto, p.imagen_url
       FROM detalle_ventas dv
       JOIN productos p ON dv.id_producto = p.id_producto
       WHERE dv.id_venta = $1`,
      [id]
    );

    const idsDetalle = detallesResult.rows.map(d => d.id_detalle_venta);

    // Si no hay detalles, evitamos hasta las 3 queries siguientes
    let toppingsRows = [], saboresRows = [], siropesRows = [];

    if (idsDetalle.length > 0) {
      // 3 queries en total para TODO el pedido, no 3 por producto
      const [toppingsResult, saboresResult, siropesResult] = await Promise.all([
        query(
          `SELECT dvt.*, t.nombre_topping
           FROM detalle_ventas_toppings dvt
           JOIN toppings t ON dvt.id_topping = t.id_topping
           WHERE dvt.id_detalle_venta = ANY($1::int[])`,
          [idsDetalle]
        ),
        query(
          `SELECT dvs.*, s.nombre_sabor
           FROM detalles_venta_sabores dvs
           JOIN sabores s ON dvs.id_sabor = s.id_sabor
           WHERE dvs.id_detalle_venta = ANY($1::int[])`,
          [idsDetalle]
        ),
        query(
          `SELECT dvsi.*, si.nombre_sirope
           FROM detalle_ventas_siropes dvsi
           JOIN siropes si ON dvsi.id_sirope = si.id_sirope
           WHERE dvsi.id_detalle_venta = ANY($1::int[])`,
          [idsDetalle]
        ),
      ]);
      toppingsRows = toppingsResult.rows;
      saboresRows  = saboresResult.rows;
      siropesRows  = siropesResult.rows;
    }

    // Repartimos en memoria (JS) los resultados a cada detalle, sin más queries
    const detalles = detallesResult.rows.map(detalle => ({
      ...detalle,
      toppings: toppingsRows.filter(t => t.id_detalle_venta === detalle.id_detalle_venta),
      sabores:  saboresRows.filter(s => s.id_detalle_venta === detalle.id_detalle_venta),
      siropes:  siropesRows.filter(s => s.id_detalle_venta === detalle.id_detalle_venta),
    }));

    res.json({
      success: true,
      data: { ...venta, items: detalles, detalles },
    });

  } catch (error) {
    console.error('Error al obtener venta:', error);
    res.status(500).json({ success: false, message: 'Error al obtener venta' });
  }
};

/**
 * Crear venta con sistema COP → USD → VES (incluye siropes)
 * POST /api/ventas
 */
const createVenta = async (req, res) => {
  const client = await getClient();

  try {
    const {
      productos, detalles,
      id_moneda, codigo_moneda,
      monto_total, total,
      nombre_cliente, metodo_pago, notas,
    } = req.body;

    const id_usuario  = req.user.id_usuario;
    const items       = productos || detalles;
    const totalVenta  = monto_total || total;

    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ success: false, message: 'Debe incluir al menos un producto' });
    }

    let monedaId = id_moneda;
    if (!monedaId && codigo_moneda) {
      const r = await client.query('SELECT id_moneda FROM tipos_moneda WHERE codigo_moneda = $1', [codigo_moneda]);
      if (r.rows.length > 0) monedaId = r.rows[0].id_moneda;
    }

    if (!monedaId || !totalVenta) {
      return res.status(400).json({ success: false, message: 'Moneda y monto total son requeridos' });
    }

    await client.query('BEGIN');

    const facturaResult = await client.query(
      `SELECT COALESCE(MAX(CAST(SUBSTRING(numero_factura FROM 6) AS INTEGER)), 0) + 1 AS next_num
       FROM ventas WHERE numero_factura LIKE 'FACT-%'`
    );
    const numeroFactura = `FACT-${String(facturaResult.rows[0].next_num).padStart(6, '0')}`;

    let subtotalCOP = 0;
    for (const prod of items) {
      const precioProducto = parseFloat(prod.precio_unitario) * parseInt(prod.cantidad);
      const precioToppings = (prod.toppings || []).reduce((s, t) => s + (parseFloat(t.precio_unitario || t.precio || 0) * parseInt(prod.cantidad)), 0);
      const precioSabores  = (prod.sabores  || []).reduce((s, sb) => s + (parseFloat(sb.precio_unitario || sb.precio || 0) * parseInt(prod.cantidad)), 0);
      const precioSiropes  = (prod.siropes  || []).reduce((s, si) => s + (parseFloat(si.precio_unitario || si.precio || 0) * parseInt(prod.cantidad)), 0);
      subtotalCOP += precioProducto + precioToppings + precioSabores + precioSiropes;
    }

    const monedaResult = await client.query(
      'SELECT tasa_cambio_usd, codigo_moneda FROM tipos_moneda WHERE id_moneda = $1', [monedaId]
    );
    if (monedaResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({ success: false, message: 'Moneda no válida' });
    }

    const monedaSeleccionada  = monedaResult.rows[0].codigo_moneda;
    const tasaCambio          = parseFloat(monedaResult.rows[0].tasa_cambio_usd);
    let totalFinal            = subtotalCOP;
    let montoMonedaOriginal   = parseFloat(totalVenta);

    if (monedaSeleccionada !== 'COP') {
      totalFinal = subtotalCOP; // mantén tu lógica original aquí
    }

    const ventaResult = await client.query(
      `INSERT INTO ventas
       (numero_factura, nombre_cliente, id_usuario, subtotal, impuesto, descuento,
        total, id_moneda, monto_moneda_original, metodo_pago, estado_venta, notas)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
       RETURNING *`,
      [numeroFactura, nombre_cliente || null, id_usuario, totalFinal, 0, 0,
       totalFinal, monedaId, montoMonedaOriginal, metodo_pago || 'EFECTIVO', 'PENDIENTE', notas || null]
    );

    const id_venta = ventaResult.rows[0].id_venta;

    for (const prod of items) {
      const detalleResult = await client.query(
        `INSERT INTO detalle_ventas (id_venta, id_producto, cantidad, precio_unitario, subtotal)
         VALUES ($1,$2,$3,$4,$5) RETURNING id_detalle_venta`,
        [id_venta, prod.id_producto, prod.cantidad, prod.precio_unitario,
         parseFloat(prod.precio_unitario) * parseInt(prod.cantidad)]
      );
      const id_detalle_venta = detalleResult.rows[0].id_detalle_venta;

      if (prod.toppings?.length) {
        for (const t of prod.toppings) {
          await client.query(
            `INSERT INTO detalle_ventas_toppings (id_detalle_venta, id_topping, cantidad, precio_adicional)
             VALUES ($1,$2,$3,$4)`,
            [id_detalle_venta, t.id_topping, prod.cantidad, t.precio_unitario || t.precio || 0]
          );
        }
      }
      if (prod.sabores?.length) {
        for (const s of prod.sabores) {
          await client.query(
            `INSERT INTO detalles_venta_sabores (id_detalle_venta, id_sabor) VALUES ($1,$2)`,
            [id_detalle_venta, s.id_sabor]
          );
        }
      }
      if (prod.siropes?.length) {
        for (const si of prod.siropes) {
          await client.query(
            `INSERT INTO detalle_ventas_siropes (id_detalle_venta, id_sirope, cantidad, precio_adicional)
             VALUES ($1,$2,$3,$4)`,
            [id_detalle_venta, si.id_sirope, prod.cantidad, si.precio_unitario || si.precio || 0]
          );
        }
      }
    }

    await client.query('COMMIT');

    // Cargar detalles completos para socket
    const detallesResult = await client.query(
      `SELECT dv.*, p.nombre_producto, p.imagen_url
       FROM detalle_ventas dv
       JOIN productos p ON dv.id_producto = p.id_producto
       WHERE dv.id_venta = $1`, [id_venta]
    );
    const detallesCompletos = await Promise.all(
      detallesResult.rows.map(async (detalle) => {
        const [tr, sr, sir] = await Promise.all([
          client.query(`SELECT dvt.*, t.nombre_topping FROM detalle_ventas_toppings dvt JOIN toppings t ON dvt.id_topping = t.id_topping WHERE dvt.id_detalle_venta = $1`, [detalle.id_detalle_venta]),
          client.query(`SELECT dvs.*, s.nombre_sabor FROM detalles_venta_sabores dvs JOIN sabores s ON dvs.id_sabor = s.id_sabor WHERE dvs.id_detalle_venta = $1`, [detalle.id_detalle_venta]),
          client.query(`SELECT dvsi.*, si.nombre_sirope FROM detalle_ventas_siropes dvsi JOIN siropes si ON dvsi.id_sirope = si.id_sirope WHERE dvsi.id_detalle_venta = $1`, [detalle.id_detalle_venta]),
        ]);
        return { ...detalle, toppings: tr.rows, sabores: sr.rows, siropes: sir.rows };
      })
    );

    const io = req.app.get('io');
    if (io) {
      const ventaCompleta = {
        id_venta, numero_factura: numeroFactura,
        nombre_cliente: nombre_cliente || 'Cliente General',
        total: totalFinal, codigo_moneda: monedaSeleccionada,
        estado_venta: 'PENDIENTE', fecha_venta: new Date(),
        cantidad_items: items.length,
        items: detallesCompletos, detalles: detallesCompletos,
      };
      console.log('📡 Emitiendo evento de nueva venta:', numeroFactura);
      io.to('despensadores').emit('pedido_nuevo', { venta: ventaCompleta, mensaje: `Nueva orden: ${numeroFactura}`, timestamp: new Date() });
      io.to('admins').emit('venta_registrada', ventaCompleta);
    }

    res.status(201).json({
      success: true,
      message: 'Venta creada exitosamente',
      data: { id_venta, numero_factura: numeroFactura, nombre_cliente: nombre_cliente || null, total: totalFinal, codigo_moneda: monedaSeleccionada },
    });

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error al crear venta:', error);
    res.status(500).json({ success: false, message: 'Error al crear venta', error: error.message });
  } finally {
    client.release();
  }
};

/**
 * Cambiar estado de venta
 * PUT /api/ventas/:id/estado
 */
const cambiarEstadoVenta = async (req, res) => {
  try {
    const { id }           = req.params;
    const { estado_venta } = req.body;

    const estadosValidos = ['PENDIENTE', 'EN_PROCESO', 'COMPLETADA', 'CANCELADA'];
    if (!estadosValidos.includes(estado_venta)) {
      return res.status(400).json({ success: false, message: 'Estado no válido' });
    }

    const result = await query(
      `UPDATE ventas SET estado_venta = $1 WHERE id_venta = $2 RETURNING *`,
      [estado_venta, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Venta no encontrada' });
    }

    const io = req.app.get('io');
    if (io) {
      console.log(`📡 Emitiendo cambio de estado: Venta ${id} -> ${estado_venta}`);
      io.emit('estado_pedido_actualizado', {
        id_venta: id, estado_venta,
        actualizado_por: req.user?.username || 'Sistema',
        timestamp: new Date(),
      });
    }

    res.json({ success: true, message: 'Estado actualizado correctamente', data: result.rows[0] });

  } catch (error) {
    console.error('Error al cambiar estado:', error);
    res.status(500).json({ success: false, message: 'Error al cambiar estado' });
  }
};

module.exports = { getVentas, getVentaById, createVenta, cambiarEstadoVenta };