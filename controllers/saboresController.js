const { query } = require('../config/database');

/**
 * Obtener todos los sabores
 * GET /api/sabores
 */
const getSabores = async (req, res) => {
  try {
    const { disponible } = req.query;

    let sqlQuery = 'SELECT * FROM sabores WHERE 1=1';
    const params = [];

    if (disponible !== undefined) {
      params.push(disponible === 'true');
      sqlQuery += ` AND disponible = $${params.length}`;
    }

    sqlQuery += ' ORDER BY nombre_sabor';

    const result = await query(sqlQuery, params);

    res.json({
      success: true,
      data: result.rows,
      total: result.rows.length
    });

  } catch (error) {
    console.error('Error al obtener sabores:', error);
    res.status(500).json({
      success: false,
      message: 'Error al obtener sabores'
    });
  }
};

/**
 * Obtener sabor por ID
 * GET /api/sabores/:id
 */
const getSaborById = async (req, res) => {
  try {
    const { id } = req.params;

    const result = await query(
      'SELECT * FROM sabores WHERE id_sabor = $1',
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Sabor no encontrado'
      });
    }

    res.json({
      success: true,
      data: result.rows[0]
    });

  } catch (error) {
    console.error('Error al obtener sabor:', error);
    res.status(500).json({
      success: false,
      message: 'Error al obtener sabor'
    });
  }
};

/**
 * Crear sabor
 * POST /api/sabores
 */
const createSabor = async (req, res) => {
  try {
    const {
      nombre_sabor,
      descripcion,
      precio_adicional
    } = req.body;

    if (!nombre_sabor) {
      return res.status(400).json({
        success: false,
        message: 'El nombre del sabor es requerido'
      });
    }

    const result = await query(
      `INSERT INTO sabores (nombre_sabor, descripcion, precio_adicional)
       VALUES ($1, $2, $3)
       RETURNING *`,
      [nombre_sabor, descripcion || null, precio_adicional || 0]
    );

    res.status(201).json({
      success: true,
      message: 'Sabor creado exitosamente',
      data: result.rows[0]
    });

  } catch (error) {
    console.error('Error al crear sabor:', error);
    res.status(500).json({
      success: false,
      message: 'Error al crear sabor'
    });
  }
};

/**
 * Actualizar sabor
 * PUT /api/sabores/:id
 */
const updateSabor = async (req, res) => {
  try {
    const { id } = req.params;
    const {
      nombre_sabor,
      descripcion,
      precio_adicional,
      disponible
    } = req.body;

    const result = await query(
      `UPDATE sabores 
       SET nombre_sabor = COALESCE($1, nombre_sabor),
           descripcion = COALESCE($2, descripcion),
           precio_adicional = COALESCE($3, precio_adicional),
           disponible = COALESCE($4, disponible)
       WHERE id_sabor = $5
       RETURNING *`,
      [nombre_sabor, descripcion, precio_adicional, disponible, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Sabor no encontrado'
      });
    }

    res.json({
      success: true,
      message: 'Sabor actualizado exitosamente',
      data: result.rows[0]
    });

  } catch (error) {
    console.error('Error al actualizar sabor:', error);
    res.status(500).json({
      success: false,
      message: 'Error al actualizar sabor'
    });
  }
};

/**
 * Eliminar sabor
 * DELETE /api/sabores/:id
 */
const deleteSabor = async (req, res) => {
  try {
    const { id } = req.params;

    const result = await query(
      'DELETE FROM sabores WHERE id_sabor = $1 RETURNING *',
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Sabor no encontrado'
      });
    }

    res.json({
      success: true,
      message: 'Sabor eliminado exitosamente'
    });

  } catch (error) {
    console.error('Error al eliminar sabor:', error);
    res.status(500).json({
      success: false,
      message: 'Error al eliminar sabor'
    });
  }
};

module.exports = {
  getSabores,
  getSaborById,
  createSabor,
  updateSabor,
  deleteSabor
};