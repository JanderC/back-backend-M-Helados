const { query } = require('../config/database');

/**
 * Listar métodos de pago
 * GET /api/metodos-pago?id_moneda=&activo=true
 * Sin id_moneda: devuelve todos (universales + los de todas las monedas)
 * Con id_moneda: devuelve los universales (id_moneda NULL) + los de esa moneda
 */
const getMetodosPago = async (req, res) => {
  try {
    const { id_moneda, activo } = req.query;

    let sqlQuery = `
      SELECT mp.*, tm.codigo_moneda
      FROM metodos_pago mp
      LEFT JOIN tipos_moneda tm ON mp.id_moneda = tm.id_moneda
      WHERE 1=1
    `;
    const params = [];

    if (activo !== undefined) {
      params.push(activo === 'true');
      sqlQuery += ` AND mp.activo = $${params.length}`;
    }

    if (id_moneda) {
      params.push(id_moneda);
      sqlQuery += ` AND (mp.id_moneda IS NULL OR mp.id_moneda = $${params.length})`;
    }

    sqlQuery += ' ORDER BY mp.orden ASC, mp.nombre ASC';

    const result = await query(sqlQuery, params);

    res.json({ success: true, data: result.rows });
  } catch (error) {
    console.error('Error al obtener métodos de pago:', error);
    res.status(500).json({ success: false, message: 'Error al obtener métodos de pago' });
  }
};

/**
 * Crear método de pago
 * POST /api/metodos-pago
 * body: { codigo, nombre, id_moneda?, icono?, orden? }
 */
const createMetodoPago = async (req, res) => {
  try {
    const { codigo, nombre, id_moneda = null, icono = 'bi-cash', orden = 0 } = req.body;

    if (!codigo || !nombre) {
      return res.status(400).json({ success: false, message: 'Código y nombre son requeridos' });
    }

    const codigoNormalizado = codigo.trim().toUpperCase().replace(/\s+/g, '_');

    const result = await query(
      `INSERT INTO metodos_pago (codigo, nombre, id_moneda, icono, orden)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [codigoNormalizado, nombre.trim(), id_moneda, icono, orden]
    );

    res.status(201).json({ success: true, message: 'Método de pago creado', data: result.rows[0] });
  } catch (error) {
    if (error.code === '23505') {
      return res.status(400).json({ success: false, message: 'Ya existe un método de pago con ese código' });
    }
    console.error('Error al crear método de pago:', error);
    res.status(500).json({ success: false, message: 'Error al crear método de pago' });
  }
};

/**
 * Actualizar método de pago
 * PUT /api/metodos-pago/:id
 */
const updateMetodoPago = async (req, res) => {
  try {
    const { id } = req.params;
    const { nombre, id_moneda, icono, orden } = req.body;

    const result = await query(
      `UPDATE metodos_pago
       SET nombre    = COALESCE($1, nombre),
           id_moneda = $2,
           icono     = COALESCE($3, icono),
           orden     = COALESCE($4, orden)
       WHERE id_metodo_pago = $5
       RETURNING *`,
      [nombre, id_moneda ?? null, icono, orden, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Método de pago no encontrado' });
    }

    res.json({ success: true, message: 'Método de pago actualizado', data: result.rows[0] });
  } catch (error) {
    console.error('Error al actualizar método de pago:', error);
    res.status(500).json({ success: false, message: 'Error al actualizar método de pago' });
  }
};

/**
 * Activar / desactivar método de pago
 * (no se borra nunca, así el histórico de ventas antiguas no se rompe)
 * PATCH /api/metodos-pago/:id/toggle
 */
const toggleMetodoPago = async (req, res) => {
  try {
    const { id } = req.params;

    const result = await query(
      `UPDATE metodos_pago SET activo = NOT activo WHERE id_metodo_pago = $1 RETURNING *`,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Método de pago no encontrado' });
    }

    res.json({ success: true, message: 'Estado actualizado', data: result.rows[0] });
  } catch (error) {
    console.error('Error al cambiar estado de método de pago:', error);
    res.status(500).json({ success: false, message: 'Error al cambiar estado de método de pago' });
  }
};

module.exports = { getMetodosPago, createMetodoPago, updateMetodoPago, toggleMetodoPago };
