const { query, getClient } = require('../config/database');

/**
 * Obtener todas las ventas
 * GET /api/ventas
 */
const getVentas = async (req, res) => {
  try {
    const { 
      fecha_inicio, 
      fecha_fin, 
      estado, 
      id_usuario,
      id_cliente,
      limit = 100,
      offset = 0 
    } = req.query;

    let sqlQuery = `
      SELECT v.*, 
             tm.codigo_moneda, tm.simbolo,
             u.username as nombre_usuario
      FROM ventas v
      JOIN tipos_moneda tm ON v.id_moneda = tm.id_moneda
      JOIN usuarios u ON v.id_usuario = u.id_usuario
      WHERE 1=1
    `;
    const params = [];

    if (fecha_inicio) {
      params.push(fecha_inicio);
      sqlQuery += ` AND v.fecha_venta >= $${params.length}`;
    }

    if (fecha_fin) {
      params.push(fecha_fin);
      sqlQuery += ` AND v.fecha_venta <= $${params.length}`;
    }

    if (estado) {
      // Manejar múltiples estados separados por coma
      const estados = estado.split(',').map(e => e.trim());
      const estadosPlaceholders = estados.map((_, idx) => `$${params.length + idx + 1}`).join(',');
      estados.forEach(e => params.push(e));
      sqlQuery += ` AND v.estado_venta IN (${estadosPlaceholders})`;
    }

    if (id_usuario) {
      params.push(id_usuario);
      sqlQuery += ` AND v.id_usuario = $${params.length}`;
    }

    if (id_cliente) {
      params.push(id_cliente);
      sqlQuery += ` AND v.id_cliente = $${params.length}`;
    }

    sqlQuery += ` ORDER BY v.fecha_venta DESC`;
    
    params.push(limit);
    sqlQuery += ` LIMIT $${params.length}`;
    
    params.push(offset);
    sqlQuery += ` OFFSET $${params.length}`;

    const result = await query(sqlQuery, params);

    res.json({
      success: true,
      data: result.rows,
      total: result.rows.length
    });

  } catch (error) {
    console.error('Error al obtener ventas:', error);
    res.status(500).json({
      success: false,
      message: 'Error al obtener ventas'
    });
  }
};

/**
 * Obtener venta por ID con detalles completos
 * GET /api/ventas/:id
 */
const getVentaById = async (req, res) => {
  try {
    const { id } = req.params;

    // Obtener información de la venta
    const ventaResult = await query(
      `SELECT v.*, 
              tm.codigo_moneda, tm.simbolo, tm.tasa_cambio_usd,
              u.username as nombre_usuario
       FROM ventas v
       JOIN tipos_moneda tm ON v.id_moneda = tm.id_moneda
       JOIN usuarios u ON v.id_usuario = u.id_usuario
       WHERE v.id_venta = $1`,
      [id]
    );

    if (ventaResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Venta no encontrada'
      });
    }

    const venta = ventaResult.rows[0];

    // Obtener detalles de productos
    const detallesResult = await query(
      `SELECT dv.*, p.nombre_producto, p.imagen_url
       FROM detalle_ventas dv
       JOIN productos p ON dv.id_producto = p.id_producto
       WHERE dv.id_venta = $1`,
      [id]
    );

    // Para cada detalle, obtener toppings y sabores
    const detalles = await Promise.all(
      detallesResult.rows.map(async (detalle) => {
        // Obtener toppings
        const toppingsResult = await query(
          `SELECT dvt.*, t.nombre_topping
           FROM detalle_ventas_toppings dvt
           JOIN toppings t ON dvt.id_topping = t.id_topping
           WHERE dvt.id_detalle_venta = $1`,
          [detalle.id_detalle_venta]
        );

        // Obtener sabores
        const saboresResult = await query(
          `SELECT dvs.*, s.nombre_sabor
           FROM detalles_venta_sabores dvs
           JOIN sabores s ON dvs.id_sabor = s.id_sabor
           WHERE dvs.id_detalle_venta = $1`,
          [detalle.id_detalle_venta]
        );

        return {
          ...detalle,
          toppings: toppingsResult.rows,
          sabores: saboresResult.rows
        };
      })
    );

    res.json({
      success: true,
      data: {
        ...venta,
        items: detalles,
        detalles: detalles
      }
    });

  } catch (error) {
    console.error('Error al obtener venta:', error);
    res.status(500).json({
      success: false,
      message: 'Error al obtener venta'
    });
  }
};

/**
 * Crear venta con sistema COP → USD → VES
 * POST /api/ventas
 * 
 * Acepta múltiples formatos:
 * - productos o detalles
 * - id_moneda o codigo_moneda
 * - monto_total o total
 */
const createVenta = async (req, res) => {
  const client = await getClient();
  
  try {
    const { 
      productos,
      detalles, // Acepta también 'detalles'
      id_moneda,
      codigo_moneda, // Acepta también 'codigo_moneda'
      monto_total,
      total, // Acepta también 'total'
      nombre_cliente, // Nombre del cliente (opcional)
      metodo_pago,
      notas 
    } = req.body;
    
    const id_usuario = req.user.id_usuario;

    // Aceptar productos o detalles
    const items = productos || detalles;
    const totalVenta = monto_total || total;

    // Validaciones
    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Debe incluir al menos un producto'
      });
    }

    // Obtener id_moneda
    let monedaId = id_moneda;
    
    // Si viene codigo_moneda en lugar de id_moneda, buscarlo
    if (!monedaId && codigo_moneda) {
      const monedaResult = await client.query(
        'SELECT id_moneda FROM tipos_moneda WHERE codigo_moneda = $1',
        [codigo_moneda]
      );
      if (monedaResult.rows.length > 0) {
        monedaId = monedaResult.rows[0].id_moneda;
      }
    }

    if (!monedaId || !totalVenta) {
      return res.status(400).json({
        success: false,
        message: 'Moneda y monto total son requeridos'
      });
    }

    await client.query('BEGIN');

    // Generar número de factura único
    const facturaResult = await client.query(
      `SELECT COALESCE(MAX(CAST(SUBSTRING(numero_factura FROM 6) AS INTEGER)), 0) + 1 as next_num
       FROM ventas 
       WHERE numero_factura LIKE 'FACT-%'`
    );
    const numeroFactura = `FACT-${String(facturaResult.rows[0].next_num).padStart(6, '0')}`;

    // Calcular subtotal en COP (moneda base)
    let subtotalCOP = 0;
    for (const prod of items) {
      const precioProducto = parseFloat(prod.precio_unitario) * parseInt(prod.cantidad);
      const precioToppings = (prod.toppings || []).reduce((sum, t) => 
        sum + (parseFloat(t.precio_unitario || t.precio || 0) * parseInt(prod.cantidad)), 0
      );
      const precioSabores = (prod.sabores || []).reduce((sum, s) => 
        sum + (parseFloat(s.precio_unitario || s.precio || 0) * parseInt(prod.cantidad)), 0
      );
      subtotalCOP += precioProducto + precioToppings + precioSabores;
    }

    // Obtener información de la moneda seleccionada
    const monedaResult = await client.query(
      'SELECT tasa_cambio_usd, codigo_moneda FROM tipos_moneda WHERE id_moneda = $1',
      [monedaId]
    );

    if (monedaResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({
        success: false,
        message: 'Moneda no válida'
      });
    }

    const monedaSeleccionada = monedaResult.rows[0].codigo_moneda;
    let totalFinal = subtotalCOP;
    let montoMonedaOriginal = subtotalCOP;

    // Sistema de conversión COP → USD → VES
    if (monedaSeleccionada === 'VES') {
      // Paso 1: Obtener tasa COP → USD
      const tasaCOPResult = await client.query(
        "SELECT tasa_cambio_usd FROM tipos_moneda WHERE codigo_moneda = 'COP'"
      );

      if (tasaCOPResult.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(500).json({
          success: false,
          message: 'Tasa COP no configurada en el sistema'
        });
      }

      const tasaCOP_USD = parseFloat(tasaCOPResult.rows[0].tasa_cambio_usd);
      
      // Paso 2: Convertir COP a USD
      const totalUSD = subtotalCOP / tasaCOP_USD;

      // Paso 3: Obtener tasa USD → VES (BCV)
      const tasaVESResult = await client.query(
        "SELECT tasa_cambio_usd FROM tipos_moneda WHERE codigo_moneda = 'VES'"
      );

      if (tasaVESResult.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(500).json({
          success: false,
          message: 'Tasa VES no configurada en el sistema'
        });
      }

      const tasaUSD_VES = parseFloat(tasaVESResult.rows[0].tasa_cambio_usd);

      // Paso 4: Convertir USD a VES
      totalFinal = totalUSD * tasaUSD_VES;
      montoMonedaOriginal = totalFinal;

      console.log('Conversión COP→VES:', {
        subtotalCOP,
        tasaCOP_USD,
        totalUSD,
        tasaUSD_VES,
        totalVES: totalFinal
      });

    } else if (monedaSeleccionada === 'COP') {
      // Sin conversión, mantener precio en COP
      totalFinal = subtotalCOP;
      montoMonedaOriginal = subtotalCOP;
    } else if (monedaSeleccionada === 'USD') {
      // Convertir COP a USD
      const tasaCOPResult = await client.query(
        "SELECT tasa_cambio_usd FROM tipos_moneda WHERE codigo_moneda = 'COP'"
      );
      if (tasaCOPResult.rows.length > 0) {
        const tasaCOP_USD = parseFloat(tasaCOPResult.rows[0].tasa_cambio_usd);
        totalFinal = subtotalCOP / tasaCOP_USD;
        montoMonedaOriginal = totalFinal;
      }
    }

    // Insertar venta (incluye nombre_cliente)
    const ventaResult = await client.query(
      `INSERT INTO ventas 
       (numero_factura, nombre_cliente, id_usuario, subtotal, impuesto, descuento, 
        total, id_moneda, monto_moneda_original, metodo_pago, estado_venta, notas)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
       RETURNING *`,
      [
        numeroFactura,
        nombre_cliente || null,
        id_usuario,
        subtotalCOP,
        0,
        0,
        totalFinal,
        monedaId,
        montoMonedaOriginal,
        metodo_pago || 'EFECTIVO',
        'COMPLETADA',
        notas || null
      ]
    );

    const id_venta = ventaResult.rows[0].id_venta;

    // Insertar detalles de venta con toppings y sabores
    for (const prod of items) {
      // Insertar detalle del producto
      const detalleResult = await client.query(
        `INSERT INTO detalle_ventas 
         (id_venta, id_producto, cantidad, precio_unitario, subtotal)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id_detalle_venta`,
        [
          id_venta,
          prod.id_producto,
          prod.cantidad,
          prod.precio_unitario,
          parseFloat(prod.precio_unitario) * parseInt(prod.cantidad)
        ]
      );

      const id_detalle_venta = detalleResult.rows[0].id_detalle_venta;

      // Insertar toppings si existen
      if (prod.toppings && prod.toppings.length > 0) {
        for (const topping of prod.toppings) {
          await client.query(
            `INSERT INTO detalle_ventas_toppings 
             (id_detalle_venta, id_topping, cantidad, precio_unitario)
             VALUES ($1, $2, $3, $4)`,
            [
              id_detalle_venta,
              topping.id_topping,
              prod.cantidad,
              topping.precio_unitario || topping.precio
            ]
          );
        }
      }

      // Insertar sabores si existen
      if (prod.sabores && prod.sabores.length > 0) {
        for (const sabor of prod.sabores) {
          await client.query(
            `INSERT INTO detalles_venta_sabores 
             (id_detalle_venta, id_sabor)
             VALUES ($1, $2)`,
            [id_detalle_venta, sabor.id_sabor]
          );
        }
      }
    }

    await client.query('COMMIT');

    res.status(201).json({
      success: true,
      message: 'Venta creada exitosamente',
      data: {
        id_venta,
        numero_factura: numeroFactura,
        nombre_cliente: nombre_cliente || null,
        total: totalFinal,
        codigo_moneda: monedaSeleccionada
      }
    });

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error al crear venta:', error);
    res.status(500).json({
      success: false,
      message: 'Error al crear venta',
      error: error.message
    });
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
    const { id } = req.params;
    const { estado } = req.body;

    const estadosValidos = ['PENDIENTE', 'EN_PROCESO', 'COMPLETADA', 'CANCELADA'];
    if (!estadosValidos.includes(estado)) {
      return res.status(400).json({
        success: false,
        message: 'Estado no válido'
      });
    }

    const result = await query(
      `UPDATE ventas 
       SET estado_venta = $1
       WHERE id_venta = $2
       RETURNING *`,
      [estado, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Venta no encontrada'
      });
    }

    res.json({
      success: true,
      message: 'Estado actualizado correctamente',
      data: result.rows[0]
    });

  } catch (error) {
    console.error('Error al cambiar estado:', error);
    res.status(500).json({
      success: false,
      message: 'Error al cambiar estado'
    });
  }
};

module.exports = {
  getVentas,
  getVentaById,
  createVenta,
  cambiarEstadoVenta
};