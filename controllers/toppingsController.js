const { query } = require('../config/database');

/**
 * Obtener todos los toppings
 * GET /api/toppings
 */
const getToppings = async (req, res) => {
  try {
    const { disponible } = req.query;

    let sqlQuery = 'SELECT * FROM toppings WHERE 1=1';
    const params = [];

    if (disponible !== undefined) {
      params.push(disponible === 'true');
      sqlQuery += ` AND disponible = $${params.length}`;
    }

    sqlQuery += ' ORDER BY nombre_topping';

    const result = await query(sqlQuery, params);

    res.json({
      success: true,
      data: result.rows,
      total: result.rows.length
    });

  } catch (error) {
    console.error('Error al obtener toppings:', error);
    res.status(500).json({
      success: false,
      message: 'Error al obtener toppings'
    });
  }
};

/**
 * Obtener topping por ID
 * GET /api/toppings/:id
 */
const getToppingById = async (req, res) => {
  try {
    const { id } = req.params;

    const result = await query(
      'SELECT * FROM toppings WHERE id_topping = $1',
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Topping no encontrado'
      });
    }

    res.json({
      success: true,
      data: result.rows[0]
    });

  } catch (error) {
    console.error('Error al obtener topping:', error);
    res.status(500).json({
      success: false,
      message: 'Error al obtener topping'
    });
  }
};

/**
 * Crear topping
 * POST /api/toppings
 */
const createTopping = async (req, res) => {
  try {
    const {
      nombre_topping,
      descripcion,
      precio_adicional,
      costo_unitario,
      stock_actual,
      stock_minimo,
      unidad_medida
    } = req.body;

    if (!nombre_topping || precio_adicional === undefined) {
      return res.status(400).json({
        success: false,
        message: 'Nombre y precio adicional son requeridos'
      });
    }

    const result = await query(
      `INSERT INTO toppings 
       (nombre_topping, descripcion, precio_adicional, costo_unitario, 
        stock_actual, stock_minimo, unidad_medida)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [
        nombre_topping,
        descripcion || null,
        precio_adicional,
        costo_unitario || null,
        stock_actual || 0,
        stock_minimo || 10,
        unidad_medida || 'unidades'
      ]
    );

    res.status(201).json({
      success: true,
      message: 'Topping creado exitosamente',
      data: result.rows[0]
    });

  } catch (error) {
    console.error('Error al crear topping:', error);
    res.status(500).json({
      success: false,
      message: 'Error al crear topping'
    });
  }
};

/**
 * Actualizar topping
 * PUT /api/toppings/:id
 */
const updateTopping = async (req, res) => {
  try {
    const { id } = req.params;
    const {
      nombre_topping,
      descripcion,
      precio_adicional,
      costo_unitario,
      stock_actual,
      stock_minimo,
      unidad_medida,
      disponible
    } = req.body;

    const result = await query(
      `UPDATE toppings 
       SET nombre_topping = COALESCE($1, nombre_topping),
           descripcion = COALESCE($2, descripcion),
           precio_adicional = COALESCE($3, precio_adicional),
           costo_unitario = COALESCE($4, costo_unitario),
           stock_actual = COALESCE($5, stock_actual),
           stock_minimo = COALESCE($6, stock_minimo),
           unidad_medida = COALESCE($7, unidad_medida),
           disponible = COALESCE($8, disponible)
       WHERE id_topping = $9
       RETURNING *`,
      [
        nombre_topping,
        descripcion,
        precio_adicional,
        costo_unitario,
        stock_actual,
        stock_minimo,
        unidad_medida,
        disponible,
        id
      ]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Topping no encontrado'
      });
    }

    res.json({
      success: true,
      message: 'Topping actualizado exitosamente',
      data: result.rows[0]
    });

  } catch (error) {
    console.error('Error al actualizar topping:', error);
    res.status(500).json({
      success: false,
      message: 'Error al actualizar topping'
    });
  }
};

/**
 * Eliminar topping
 * DELETE /api/toppings/:id
 */
const deleteTopping = async (req, res) => {
  try {
    const { id } = req.params;

    const result = await query(
      'DELETE FROM toppings WHERE id_topping = $1 RETURNING *',
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Topping no encontrado'
      });
    }

    res.json({
      success: true,
      message: 'Topping eliminado exitosamente'
    });

  } catch (error) {
    console.error('Error al eliminar topping:', error);
    res.status(500).json({
      success: false,
      message: 'Error al eliminar topping'
    });
  }
};

/**
 * Ajustar stock de topping
 * POST /api/toppings/:id/ajustar-stock
 */
const ajustarStock = async (req, res) => {
  try {
    const { id } = req.params;
    const { tipo_movimiento, cantidad, motivo } = req.body;
    const idUsuario = req.user.id_usuario;

    if (!tipo_movimiento || !cantidad) {
      return res.status(400).json({
        success: false,
        message: 'Tipo de movimiento y cantidad son requeridos'
      });
    }

    if (!['ENTRADA', 'SALIDA', 'AJUSTE'].includes(tipo_movimiento)) {
      return res.status(400).json({
        success: false,
        message: 'Tipo de movimiento inválido'
      });
    }

    // Obtener stock actual
    const toppingResult = await query(
      'SELECT stock_actual FROM toppings WHERE id_topping = $1',
      [id]
    );

    if (toppingResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Topping no encontrado'
      });
    }

    const stockActual = parseFloat(toppingResult.rows[0].stock_actual);
    let nuevoStock = stockActual;

    // Calcular nuevo stock según tipo de movimiento
    switch (tipo_movimiento) {
      case 'ENTRADA':
        nuevoStock += parseFloat(cantidad);
        break;
      case 'SALIDA':
        nuevoStock -= parseFloat(cantidad);
        if (nuevoStock < 0) {
          return res.status(400).json({
            success: false,
            message: 'Stock insuficiente'
          });
        }
        break;
      case 'AJUSTE':
        nuevoStock = parseFloat(cantidad);
        break;
    }

    // Actualizar stock
    await query(
      'UPDATE toppings SET stock_actual = $1 WHERE id_topping = $2',
      [nuevoStock, id]
    );

    // Registrar movimiento en inventario
    const movimientoResult = await query(
      `INSERT INTO movimientos_inventario 
       (id_topping, tipo_movimiento, cantidad, motivo, id_usuario)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [id, tipo_movimiento, cantidad, motivo || null, idUsuario]
    );

    // Obtener topping actualizado
    const toppingActualizado = await query(
      'SELECT * FROM toppings WHERE id_topping = $1',
      [id]
    );

    res.json({
      success: true,
      message: 'Stock ajustado exitosamente',
      data: {
        topping: toppingActualizado.rows[0],
        movimiento: movimientoResult.rows[0]
      }
    });

  } catch (error) {
    console.error('Error al ajustar stock:', error);
    res.status(500).json({
      success: false,
      message: 'Error al ajustar stock'
    });
  }
};

module.exports = {
  getToppings,
  getToppingById,
  createTopping,
  updateTopping,
  deleteTopping,
  ajustarStock
};