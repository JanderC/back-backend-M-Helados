const { query, getClient } = require("../config/database");

/**
 * Crear venta
 * POST /api/ventas
 */
const createVenta = async (req, res) => {
  const client = await getClient();

  try {
    const {
      id_cliente,
      productos, // Array de { id_producto, cantidad, toppings: [{ id_topping, cantidad }] }
      id_moneda,
      metodo_pago,
      notas,
    } = req.body;

    const idUsuario = req.user.id_usuario;

    if (!productos || productos.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Debe incluir al menos un producto",
      });
    }

    await client.query("BEGIN");

    // Calcular subtotal
    let subtotal = 0;

    for (const item of productos) {
      // Obtener precio del producto
      const productoResult = await client.query(
        "SELECT precio_base FROM productos WHERE id_producto = $1",
        [item.id_producto]
      );

      if (productoResult.rows.length === 0) {
        throw new Error(`Producto ${item.id_producto} no encontrado`);
      }

      const precioBase = parseFloat(productoResult.rows[0].precio_base);
      let precioToppings = 0;

      // Calcular precio de toppings
      if (item.toppings && item.toppings.length > 0) {
        for (const topping of item.toppings) {
          const toppingResult = await client.query(
            "SELECT precio_adicional FROM toppings WHERE id_topping = $1",
            [topping.id_topping]
          );

          if (toppingResult.rows.length > 0) {
            precioToppings +=
              parseFloat(toppingResult.rows[0].precio_adicional) *
              (topping.cantidad || 1);
          }
        }
      }

      subtotal += (precioBase + precioToppings) * item.cantidad;
    }

    const impuesto = 0; // Puedes agregar lógica de impuestos
    const descuento = 0; // Puedes agregar lógica de descuentos
    const total = subtotal + impuesto - descuento;

    // Generar número de factura único
    const numeroFactura = `F${Date.now()}`;

    // Crear venta
    const ventaResult = await client.query(
      `INSERT INTO ventas 
       (numero_factura, id_cliente, id_usuario, subtotal, impuesto, descuento, 
        total, id_moneda, monto_moneda_original, metodo_pago, notas, estado_venta)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 'PENDIENTE')
       RETURNING *`,
      [
        numeroFactura,
        id_cliente || null,
        idUsuario,
        subtotal,
        impuesto,
        descuento,
        total,
        id_moneda,
        total,
        metodo_pago,
        notas || null,
      ]
    );

    const venta = ventaResult.rows[0];

    // Insertar detalle de ventas
    for (const item of productos) {
      const productoResult = await client.query(
        "SELECT precio_base FROM productos WHERE id_producto = $1",
        [item.id_producto]
      );

      const precioBase = parseFloat(productoResult.rows[0].precio_base);
      let precioToppings = 0;

      // Calcular precio de toppings para este item
      if (item.toppings && item.toppings.length > 0) {
        for (const topping of item.toppings) {
          const toppingResult = await client.query(
            "SELECT precio_adicional FROM toppings WHERE id_topping = $1",
            [topping.id_topping]
          );
          if (toppingResult.rows.length > 0) {
            precioToppings +=
              parseFloat(toppingResult.rows[0].precio_adicional) *
              (topping.cantidad || 1);
          }
        }
      }

      const precioUnitario = precioBase + precioToppings;
      const subtotalItem = precioUnitario * item.cantidad;

      const detalleResult = await client.query(
        `INSERT INTO detalle_ventas 
         (id_venta, id_producto, cantidad, precio_unitario, subtotal)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING *`,
        [
          venta.id_venta,
          item.id_producto,
          item.cantidad,
          precioUnitario,
          subtotalItem,
        ]
      );

      const detalle = detalleResult.rows[0];

      // Insertar toppings del detalle
      if (item.toppings && item.toppings.length > 0) {
        for (const topping of item.toppings) {
          const toppingResult = await client.query(
            "SELECT precio_adicional FROM toppings WHERE id_topping = $1",
            [topping.id_topping]
          );

          if (toppingResult.rows.length > 0) {
            await client.query(
              `INSERT INTO detalle_ventas_toppings 
               (id_detalle_venta, id_topping, cantidad, precio_adicional)
               VALUES ($1, $2, $3, $4)`,
              [
                detalle.id_detalle_venta,
                topping.id_topping,
                topping.cantidad || 1,
                parseFloat(toppingResult.rows[0].precio_adicional),
              ]
            );
          }
        }
      }
    }

    await client.query("COMMIT");

    // Obtener venta completa con detalles
    const ventaCompleta = await getVentaCompleta(venta.id_venta);

    // Emitir evento de socket para actualizar en tiempo real
    if (req.app.get("io")) {
      req.app.get("io").emit("nueva_venta", ventaCompleta);
    }

    res.status(201).json({
      success: true,
      message: "Venta creada exitosamente",
      data: ventaCompleta,
    });
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Error al crear venta:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Error al crear venta",
    });
  } finally {
    client.release();
  }
};

/**
 * Obtener todas las ventas
 * GET /api/ventas
 */
const getVentas = async (req, res) => {
  try {
    const {
      fecha_inicio,
      fecha_fin,
      estado_venta,
      id_usuario,
      limit = 50,
      offset = 0,
    } = req.query;

    let sqlQuery = `
      SELECT v.*, 
             u.nombre_completo as nombre_usuario,
             c.nombre_cliente,
             tm.codigo_moneda, tm.simbolo
      FROM ventas v
      JOIN usuarios u ON v.id_usuario = u.id_usuario
      LEFT JOIN clientes c ON v.id_cliente = c.id_cliente
      JOIN tipos_moneda tm ON v.id_moneda = tm.id_moneda
      WHERE 1=1
    `;
    const params = [];
    let paramCounter = 1;

    if (fecha_inicio) {
      params.push(fecha_inicio);
      sqlQuery += ` AND v.fecha_venta >= $${paramCounter}`;
      paramCounter++;
    }

    if (fecha_fin) {
      params.push(fecha_fin);
      sqlQuery += ` AND v.fecha_venta <= $${paramCounter}`;
      paramCounter++;
    }

    if (estado_venta) {
      params.push(estado_venta);
      sqlQuery += ` AND v.estado_venta = $${paramCounter}`;
      paramCounter++;
    }

    if (id_usuario) {
      params.push(id_usuario);
      sqlQuery += ` AND v.id_usuario = $${paramCounter}`;
      paramCounter++;
    }

    sqlQuery += " ORDER BY v.fecha_venta DESC";

    params.push(limit);
    sqlQuery += ` LIMIT $${paramCounter}`;
    paramCounter++;

    params.push(offset);
    sqlQuery += ` OFFSET $${paramCounter}`;

    const result = await query(sqlQuery, params);

    // Obtener total de registros (con los mismos filtros)
    let countQuery = "SELECT COUNT(*) FROM ventas v WHERE 1=1";
    const countParams = [];
    let countCounter = 1;

    if (fecha_inicio) {
      countParams.push(fecha_inicio);
      countQuery += ` AND v.fecha_venta >= $${countCounter}`;
      countCounter++;
    }

    if (fecha_fin) {
      countParams.push(fecha_fin);
      countQuery += ` AND v.fecha_venta <= $${countCounter}`;
      countCounter++;
    }

    if (estado_venta) {
      countParams.push(estado_venta);
      countQuery += ` AND v.estado_venta = $${countCounter}`;
      countCounter++;
    }

    if (id_usuario) {
      countParams.push(id_usuario);
      countQuery += ` AND v.id_usuario = $${countCounter}`;
      countCounter++;
    }

    const countResult = await query(countQuery, countParams);

    res.json({
      success: true,
      data: result.rows,
      total: parseInt(countResult.rows[0].count),
      limit: parseInt(limit),
      offset: parseInt(offset),
    });
  } catch (error) {
    console.error("Error al obtener ventas:", error);
    res.status(500).json({
      success: false,
      message: "Error al obtener ventas",
    });
  }
};

/**
 * Obtener venta por ID
 * GET /api/ventas/:id
 */
const getVentaById = async (req, res) => {
  try {
    const { id } = req.params;

    const ventaCompleta = await getVentaCompleta(id);

    if (!ventaCompleta) {
      return res.status(404).json({
        success: false,
        message: "Venta no encontrada",
      });
    }

    res.json({
      success: true,
      data: ventaCompleta,
    });
  } catch (error) {
    console.error("Error al obtener venta:", error);
    res.status(500).json({
      success: false,
      message: "Error al obtener venta",
    });
  }
};

/**
 * Cambiar estado de venta
 * PUT /api/ventas/:id/estado
 */
const cambiarEstadoVenta = async (req, res) => {
  try {
    const { id } = req.params;
    const { estado_venta } = req.body;

    const estadosPermitidos = [
      "PENDIENTE",
      "EN_PROCESO",
      "COMPLETADA",
      "CANCELADA",
      "DEVUELTA",
    ];

    if (!estadosPermitidos.includes(estado_venta)) {
      return res.status(400).json({
        success: false,
        message: "Estado inválido",
      });
    }

    const result = await query(
      `UPDATE ventas 
       SET estado_venta = $1
       WHERE id_venta = $2
       RETURNING *`,
      [estado_venta, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Venta no encontrada",
      });
    }

    const ventaActualizada = await getVentaCompleta(id);

    // Emitir evento de socket para actualizar en tiempo real
    if (req.app.get("io")) {
      req.app.get("io").emit("estado_venta_actualizado", {
        id_venta: id,
        estado_venta,
        venta: ventaActualizada,
      });
    }

    res.json({
      success: true,
      message: `Estado cambiado a ${estado_venta} exitosamente`,
      data: ventaActualizada,
    });
  } catch (error) {
    console.error("Error al cambiar estado:", error);
    res.status(500).json({
      success: false,
      message: "Error al cambiar estado",
    });
  }
};

/**
 * Función auxiliar para obtener venta completa con detalles
 */
const getVentaCompleta = async (idVenta) => {
  try {
    // Obtener venta principal
    const ventaResult = await query(
      `SELECT v.*, 
              u.nombre_completo as nombre_usuario,
              c.nombre_cliente,
              tm.codigo_moneda, tm.simbolo, tm.tasa_cambio_usd
       FROM ventas v
       JOIN usuarios u ON v.id_usuario = u.id_usuario
       LEFT JOIN clientes c ON v.id_cliente = c.id_cliente
       JOIN tipos_moneda tm ON v.id_moneda = tm.id_moneda
       WHERE v.id_venta = $1`,
      [idVenta]
    );

    if (ventaResult.rows.length === 0) {
      return null;
    }

    const venta = ventaResult.rows[0];

    // Obtener detalles de productos
    const detallesResult = await query(
      `SELECT dv.*, p.nombre_producto, p.descripcion, p.imagen_url
       FROM detalle_ventas dv
       JOIN productos p ON dv.id_producto = p.id_producto
       WHERE dv.id_venta = $1`,
      [idVenta]
    );

    // Para cada detalle, obtener sus toppings
    for (let detalle of detallesResult.rows) {
      const toppingsResult = await query(
        `SELECT dvt.*, t.nombre_topping
         FROM detalle_ventas_toppings dvt
         JOIN toppings t ON dvt.id_topping = t.id_topping
         WHERE dvt.id_detalle_venta = $1`,
        [detalle.id_detalle_venta]
      );

      detalle.toppings = toppingsResult.rows;
    }

    venta.detalles = detallesResult.rows;

    return venta;
  } catch (error) {
    console.error("Error al obtener venta completa:", error);
    throw error;
  }
};

module.exports = {
  createVenta,
  getVentas,
  getVentaById,
  cambiarEstadoVenta,
};
