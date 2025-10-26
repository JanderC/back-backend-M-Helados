const { query } = require('../config/database');

/**
 * Obtener todos los clientes
 * GET /api/clientes
 */
const getClientes = async (req, res) => {
  try {
    const { search, limit = 50 } = req.query;

    let sqlQuery = 'SELECT * FROM clientes WHERE 1=1';
    const params = [];

    if (search) {
      params.push(`%${search}%`);
      sqlQuery += ` AND (nombre_cliente ILIKE $${params.length} OR telefono ILIKE $${params.length})`;
    }

    sqlQuery += ' ORDER BY nombre_cliente LIMIT $' + (params.length + 1);
    params.push(limit);

    const result = await query(sqlQuery, params);

    res.json({
      success: true,
      data: result.rows,
      total: result.rows.length
    });

  } catch (error) {
    console.error('Error al obtener clientes:', error);
    res.status(500).json({
      success: false,
      message: 'Error al obtener clientes'
    });
  }
};

/**
 * Obtener cliente por ID
 * GET /api/clientes/:id
 */
const getClienteById = async (req, res) => {
  try {
    const { id } = req.params;

    const result = await query(
      'SELECT * FROM clientes WHERE id_cliente = $1',
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Cliente no encontrado'
      });
    }

    res.json({
      success: true,
      data: result.rows[0]
    });

  } catch (error) {
    console.error('Error al obtener cliente:', error);
    res.status(500).json({
      success: false,
      message: 'Error al obtener cliente'
    });
  }
};

/**
 * Crear o buscar cliente
 * POST /api/clientes
 */
const createCliente = async (req, res) => {
  try {
    const { nombre_cliente, telefono, email, direccion } = req.body;

    if (!nombre_cliente) {
      return res.status(400).json({
        success: false,
        message: 'El nombre del cliente es requerido'
      });
    }

    // Verificar si ya existe un cliente con el mismo nombre o teléfono
    if (telefono) {
      const existente = await query(
        'SELECT * FROM clientes WHERE telefono = $1',
        [telefono]
      );

      if (existente.rows.length > 0) {
        return res.json({
          success: true,
          data: existente.rows[0],
          message: 'Cliente ya existe'
        });
      }
    }

    const result = await query(
      `INSERT INTO clientes (nombre_cliente, telefono, email, direccion)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [nombre_cliente, telefono || null, email || null, direccion || null]
    );

    res.status(201).json({
      success: true,
      message: 'Cliente creado exitosamente',
      data: result.rows[0]
    });

  } catch (error) {
    console.error('Error al crear cliente:', error);
    res.status(500).json({
      success: false,
      message: 'Error al crear cliente'
    });
  }
};

/**
 * Actualizar cliente
 * PUT /api/clientes/:id
 */
const updateCliente = async (req, res) => {
  try {
    const { id } = req.params;
    const { nombre_cliente, telefono, email, direccion } = req.body;

    const result = await query(
      `UPDATE clientes 
       SET nombre_cliente = COALESCE($1, nombre_cliente),
           telefono = COALESCE($2, telefono),
           email = COALESCE($3, email),
           direccion = COALESCE($4, direccion)
       WHERE id_cliente = $5
       RETURNING *`,
      [nombre_cliente, telefono, email, direccion, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Cliente no encontrado'
      });
    }

    res.json({
      success: true,
      message: 'Cliente actualizado exitosamente',
      data: result.rows[0]
    });

  } catch (error) {
    console.error('Error al actualizar cliente:', error);
    res.status(500).json({
      success: false,
      message: 'Error al actualizar cliente'
    });
  }
};

/**
 * Eliminar cliente
 * DELETE /api/clientes/:id
 */
const deleteCliente = async (req, res) => {
  try {
    const { id } = req.params;

    const result = await query(
      'DELETE FROM clientes WHERE id_cliente = $1 RETURNING *',
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Cliente no encontrado'
      });
    }

    res.json({
      success: true,
      message: 'Cliente eliminado exitosamente'
    });

  } catch (error) {
    console.error('Error al eliminar cliente:', error);
    res.status(500).json({
      success: false,
      message: 'Error al eliminar cliente'
    });
  }
};

module.exports = {
  getClientes,
  getClienteById,
  createCliente,
  updateCliente,
  deleteCliente
};