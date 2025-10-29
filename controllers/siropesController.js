const { query } = require('../config/database');

/**
 * Obtener todos los siropes
 * GET /api/siropes
 */
const getSiropes = async (req, res) => {
  try {
    const { disponible } = req.query;

    let sqlQuery = 'SELECT * FROM siropes WHERE 1=1';
    const params = [];

    if (disponible !== undefined) {
      params.push(disponible === 'true');
      sqlQuery += ` AND disponible = $${params.length}`;
    }

    sqlQuery += ' ORDER BY nombre_sirope';

    const result = await query(sqlQuery, params);

    res.json({
      success: true,
      data: result.rows,
      total: result.rows.length
    });

  } catch (error) {
    console.error('Error al obtener siropes:', error);
    res.status(500).json({
      success: false,
      message: 'Error al obtener siropes'
    });
  }
};

/**
 * Obtener sirope por ID
 * GET /api/siropes/:id
 */
const getSiropeById = async (req, res) => {
  try {
    const { id } = req.params;

    const result = await query(
      'SELECT * FROM siropes WHERE id_sirope = $1',
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Sirope no encontrado'
      });
    }

    res.json({
      success: true,
      data: result.rows[0]
    });

  } catch (error) {
    console.error('Error al obtener sirope:', error);
    res.status(500).json({
      success: false,
      message: 'Error al obtener sirope'
    });
  }
};

/**
 * Crear sirope
 * POST /api/siropes
 */
const createSirope = async (req, res) => {
  try {
    const {
      nombre_sirope,
      descripcion,
      precio_adicional_cop,
      precio_adicional_usd,
      costo_unitario_cop,
      costo_unitario_usd,
      stock_actual,
      stock_minimo,
      unidad_medida
    } = req.body;

    if (!nombre_sirope || precio_adicional_cop === undefined || precio_adicional_usd === undefined) {
      return res.status(400).json({
        success: false,
        message: 'Nombre, precio adicional en COP y USD son requeridos'
      });
    }

    const result = await query(
      `INSERT INTO siropes 
       (nombre_sirope, descripcion, precio_adicional_cop, precio_adicional_usd,
        costo_unitario_cop, costo_unitario_usd, stock_actual, stock_minimo, unidad_medida)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING *`,
      [
        nombre_sirope,
        descripcion || null,
        precio_adicional_cop,
        precio_adicional_usd,
        costo_unitario_cop || null,
        costo_unitario_usd || null,
        stock_actual || 0,
        stock_minimo || 10,
        unidad_medida || 'ml'
      ]
    );

    res.status(201).json({
      success: true,
      message: 'Sirope creado exitosamente',
      data: result.rows[0]
    });

  } catch (error) {
    console.error('Error al crear sirope:', error);
    res.status(500).json({
      success: false,
      message: 'Error al crear sirope'
    });
  }
};

/**
 * Actualizar sirope
 * PUT /api/siropes/:id
 */
const updateSirope = async (req, res) => {
  try {
    const { id } = req.params;
    const {
      nombre_sirope,
      descripcion,
      precio_adicional_cop,
      precio_adicional_usd,
      costo_unitario_cop,
      costo_unitario_usd,
      stock_actual,
      stock_minimo,
      unidad_medida,
      disponible
    } = req.body;

    const result = await query(
      `UPDATE siropes 
       SET nombre_sirope = COALESCE($1, nombre_sirope),
           descripcion = COALESCE($2, descripcion),
           precio_adicional_cop = COALESCE($3, precio_adicional_cop),
           precio_adicional_usd = COALESCE($4, precio_adicional_usd),
           costo_unitario_cop = COALESCE($5, costo_unitario_cop),
           costo_unitario_usd = COALESCE($6, costo_unitario_usd),
           stock_actual = COALESCE($7, stock_actual),
           stock_minimo = COALESCE($8, stock_minimo),
           unidad_medida = COALESCE($9, unidad_medida),
           disponible = COALESCE($10, disponible)
       WHERE id_sirope = $11
       RETURNING *`,
      [
        nombre_sirope,
        descripcion,
        precio_adicional_cop,
        precio_adicional_usd,
        costo_unitario_cop,
        costo_unitario_usd,
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
        message: 'Sirope no encontrado'
      });
    }

    res.json({
      success: true,
      message: 'Sirope actualizado exitosamente',
      data: result.rows[0]
    });

  } catch (error) {
    console.error('Error al actualizar sirope:', error);
    res.status(500).json({
      success: false,
      message: 'Error al actualizar sirope'
    });
  }
};

/**
 * Eliminar sirope
 * DELETE /api/siropes/:id
 */
const deleteSirope = async (req, res) => {
  try {
    const { id } = req.params;

    const result = await query(
      'DELETE FROM siropes WHERE id_sirope = $1 RETURNING *',
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Sirope no encontrado'
      });
    }

    res.json({
      success: true,
      message: 'Sirope eliminado exitosamente'
    });

  } catch (error) {
    console.error('Error al eliminar sirope:', error);
    res.status(500).json({
      success: false,
      message: 'Error al eliminar sirope'
    });
  }
};

/**
 * Ajustar stock de sirope
 * POST /api/siropes/:id/ajustar-stock
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
    const siropeResult = await query(
      'SELECT stock_actual FROM siropes WHERE id_sirope = $1',
      [id]
    );

    if (siropeResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Sirope no encontrado'
      });
    }

    const stockActual = parseFloat(siropeResult.rows[0].stock_actual);
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
      'UPDATE siropes SET stock_actual = $1 WHERE id_sirope = $2',
      [nuevoStock, id]
    );

    // Registrar movimiento en inventario
    const movimientoResult = await query(
      `INSERT INTO movimientos_inventario_siropes 
       (id_sirope, tipo_movimiento, cantidad, motivo, id_usuario)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [id, tipo_movimiento, cantidad, motivo || null, idUsuario]
    );

    // Obtener sirope actualizado
    const siropeActualizado = await query(
      'SELECT * FROM siropes WHERE id_sirope = $1',
      [id]
    );

    res.json({
      success: true,
      message: 'Stock ajustado exitosamente',
      data: {
        sirope: siropeActualizado.rows[0],
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
  getSiropes,
  getSiropeById,
  createSirope,
  updateSirope,
  deleteSirope,
  ajustarStock
};