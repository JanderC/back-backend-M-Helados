const { query } = require('../config/database');

/**
 * Validar imagen base64
 */
const validateBase64Image = (base64String) => {
  if (!base64String) return true; // Permitir null/undefined
  
  // Verificar formato base64 de imagen
  const base64Regex = /^data:image\/(png|jpeg|jpg|gif|webp);base64,/;
  return base64Regex.test(base64String);
};

/**
 * Obtener todos los productos
 * GET /api/productos
 */
const getProductos = async (req, res) => {
  try {
    const { categoria, disponible } = req.query;

    let sqlQuery = `
      SELECT p.*, c.nombre_categoria 
      FROM productos p
      JOIN categorias_producto c ON p.id_categoria = c.id_categoria
      WHERE 1=1
    `;
    const params = [];

    if (categoria) {
      params.push(categoria);
      sqlQuery += ` AND p.id_categoria = $${params.length}`;
    }

    if (disponible !== undefined) {
      params.push(disponible === 'true');
      sqlQuery += ` AND p.disponible = $${params.length}`;
    }

    sqlQuery += ' ORDER BY p.nombre_producto';

    const result = await query(sqlQuery, params);

    res.json({
      success: true,
      data: result.rows,
      total: result.rows.length
    });

  } catch (error) {
    console.error('Error al obtener productos:', error);
    res.status(500).json({
      success: false,
      message: 'Error al obtener productos'
    });
  }
};

/**
 * Obtener producto por ID
 * GET /api/productos/:id
 */
const getProductoById = async (req, res) => {
  try {
    const { id } = req.params;

    const result = await query(
      `SELECT p.*, c.nombre_categoria 
       FROM productos p
       JOIN categorias_producto c ON p.id_categoria = c.id_categoria
       WHERE p.id_producto = $1`,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Producto no encontrado'
      });
    }

    res.json({
      success: true,
      data: result.rows[0]
    });

  } catch (error) {
    console.error('Error al obtener producto:', error);
    res.status(500).json({
      success: false,
      message: 'Error al obtener producto'
    });
  }
};

/**
 * Crear producto
 * POST /api/productos
 */
const createProducto = async (req, res) => {
  try {
    const {
      nombre_producto,
      descripcion,
      id_categoria,
      precio_base,
      costo_produccion,
      imagen_url
    } = req.body;

    if (!nombre_producto || !id_categoria || !precio_base) {
      return res.status(400).json({
        success: false,
        message: 'Nombre, categoría y precio son requeridos'
      });
    }

    // Validar formato base64 si se proporciona imagen
    if (imagen_url && !validateBase64Image(imagen_url)) {
      return res.status(400).json({
        success: false,
        message: 'Formato de imagen inválido. Debe ser base64 con formato data:image/[tipo];base64,...'
      });
    }

    const result = await query(
      `INSERT INTO productos (nombre_producto, descripcion, id_categoria, precio_base, costo_produccion, imagen_url)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [nombre_producto, descripcion, id_categoria, precio_base, costo_produccion || null, imagen_url || null]
    );

    res.status(201).json({
      success: true,
      message: 'Producto creado exitosamente',
      data: result.rows[0]
    });

  } catch (error) {
    console.error('Error al crear producto:', error);
    res.status(500).json({
      success: false,
      message: 'Error al crear producto'
    });
  }
};

/**
 * Actualizar producto
 * PUT /api/productos/:id
 */
const updateProducto = async (req, res) => {
  try {
    const { id } = req.params;
    const {
      nombre_producto,
      descripcion,
      id_categoria,
      precio_base,
      costo_produccion,
      disponible,
      imagen_url
    } = req.body;

    // Validar formato base64 si se proporciona imagen
    if (imagen_url && !validateBase64Image(imagen_url)) {
      return res.status(400).json({
        success: false,
        message: 'Formato de imagen inválido. Debe ser base64 con formato data:image/[tipo];base64,...'
      });
    }

    const result = await query(
      `UPDATE productos 
       SET nombre_producto = COALESCE($1, nombre_producto),
           descripcion = COALESCE($2, descripcion),
           id_categoria = COALESCE($3, id_categoria),
           precio_base = COALESCE($4, precio_base),
           costo_produccion = COALESCE($5, costo_produccion),
           disponible = COALESCE($6, disponible),
           imagen_url = COALESCE($7, imagen_url)
       WHERE id_producto = $8
       RETURNING *`,
      [nombre_producto, descripcion, id_categoria, precio_base, costo_produccion, disponible, imagen_url, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Producto no encontrado'
      });
    }

    res.json({
      success: true,
      message: 'Producto actualizado exitosamente',
      data: result.rows[0]
    });

  } catch (error) {
    console.error('Error al actualizar producto:', error);
    res.status(500).json({
      success: false,
      message: 'Error al actualizar producto'
    });
  }
};

/**
 * Eliminar producto
 * DELETE /api/productos/:id
 */
const deleteProducto = async (req, res) => {
  try {
    const { id } = req.params;

    const result = await query(
      'DELETE FROM productos WHERE id_producto = $1 RETURNING *',
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Producto no encontrado'
      });
    }

    res.json({
      success: true,
      message: 'Producto eliminado exitosamente'
    });

  } catch (error) {
    console.error('Error al eliminar producto:', error);
    res.status(500).json({
      success: false,
      message: 'Error al eliminar producto'
    });
  }
};

/**
 * Obtener categorías
 * GET /api/productos/categorias
 */
const getCategorias = async (req, res) => {
  try {
    const result = await query(
      'SELECT * FROM categorias_producto ORDER BY nombre_categoria'
    );

    res.json({
      success: true,
      data: result.rows
    });

  } catch (error) {
    console.error('Error al obtener categorías:', error);
    res.status(500).json({
      success: false,
      message: 'Error al obtener categorías'
    });
  }
};

module.exports = {
  getProductos,
  getProductoById,
  createProducto,
  updateProducto,
  deleteProducto,
  getCategorias
};