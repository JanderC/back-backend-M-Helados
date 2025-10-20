const { query } = require('../config/database');

/**
 * Dashboard - Resumen general
 * GET /api/reportes/dashboard
 */
const getDashboard = async (req, res) => {
  try {
    const { periodo = 'hoy' } = req.query;
    
    let fechaInicio;
    const ahora = new Date();

    switch (periodo) {
      case 'hoy':
        fechaInicio = new Date(ahora.setHours(0, 0, 0, 0));
        break;
      case 'semana':
        fechaInicio = new Date(ahora.setDate(ahora.getDate() - 7));
        break;
      case 'mes':
        fechaInicio = new Date(ahora.setMonth(ahora.getMonth() - 1));
        break;
      default:
        fechaInicio = new Date(ahora.setHours(0, 0, 0, 0));
    }

    // Resumen de ventas GENERAL (en USD)
    const ventasResult = await query(
      `SELECT 
         COUNT(*) as total_ventas,
         COALESCE(SUM(total / tm.tasa_cambio_usd), 0) as total_usd,
         COALESCE(AVG(total / tm.tasa_cambio_usd), 0) as promedio_venta
       FROM ventas v
       JOIN tipos_moneda tm ON v.id_moneda = tm.id_moneda
       WHERE v.fecha_venta >= $1 AND v.estado_venta = 'COMPLETADA'`,
      [fechaInicio]
    );

    // Ventas POR MONEDA
    const ventasPorMonedaResult = await query(
      `SELECT 
         tm.codigo_moneda,
         tm.nombre_moneda,
         tm.simbolo,
         COUNT(*) as total_ventas,
         COALESCE(SUM(v.total), 0) as total_moneda,
         COALESCE(SUM(v.total / tm.tasa_cambio_usd), 0) as total_usd
       FROM ventas v
       JOIN tipos_moneda tm ON v.id_moneda = tm.id_moneda
       WHERE v.fecha_venta >= $1 AND v.estado_venta = 'COMPLETADA'
       GROUP BY tm.codigo_moneda, tm.nombre_moneda, tm.simbolo
       ORDER BY tm.codigo_moneda`,
      [fechaInicio]
    );

    // Productos más vendidos GENERAL
    const productosResult = await query(
      `SELECT p.nombre_producto, COUNT(dv.id_detalle_venta) as cantidad
       FROM detalle_ventas dv
       JOIN productos p ON dv.id_producto = p.id_producto
       JOIN ventas v ON dv.id_venta = v.id_venta
       WHERE v.fecha_venta >= $1 AND v.estado_venta = 'COMPLETADA'
       GROUP BY p.nombre_producto
       ORDER BY cantidad DESC
       LIMIT 5`,
      [fechaInicio]
    );

    // Toppings más usados
    const toppingsResult = await query(
      `SELECT 
         t.nombre_topping,
         COUNT(dvt.id_detalle_topping) as cantidad
       FROM detalle_ventas_toppings dvt
       JOIN toppings t ON dvt.id_topping = t.id_topping
       JOIN detalle_ventas dv ON dvt.id_detalle_venta = dv.id_detalle_venta
       JOIN ventas v ON dv.id_venta = v.id_venta
       WHERE v.fecha_venta >= $1 AND v.estado_venta = 'COMPLETADA'
       GROUP BY t.nombre_topping
       ORDER BY cantidad DESC
       LIMIT 5`,
      [fechaInicio]
    );

    // Contar productos y toppings disponibles
    const productosCountResult = await query(
      'SELECT COUNT(*) as total FROM productos WHERE disponible = true'
    );

    const toppingsCountResult = await query(
      'SELECT COUNT(*) as total FROM toppings WHERE disponible = true'
    );

    // Estado de caja
    const cajaResult = await query(
      "SELECT * FROM arqueo_caja WHERE estado = 'ABIERTA' ORDER BY fecha_apertura DESC LIMIT 1"
    );

    // Inventario bajo
    const inventarioBajoResult = await query(
      `SELECT nombre_topping, stock_actual, stock_minimo
       FROM toppings
       WHERE stock_actual < stock_minimo AND disponible = true
       ORDER BY (stock_minimo - stock_actual) DESC
       LIMIT 5`
    );

    // Ventas por estado
    const ventasEstadoResult = await query(
      `SELECT estado_venta, COUNT(*) as cantidad
       FROM ventas
       WHERE fecha_venta >= $1
       GROUP BY estado_venta`,
      [fechaInicio]
    );

    res.json({
      success: true,
      data: {
        resumen_ventas: ventasResult.rows[0],
        ventas_por_moneda: ventasPorMonedaResult.rows,
        productos_mas_vendidos: productosResult.rows,
        toppings_mas_usados: toppingsResult.rows,
        total_productos: parseInt(productosCountResult.rows[0].total),
        total_toppings: parseInt(toppingsCountResult.rows[0].total),
        estado_caja: cajaResult.rows[0] || null,
        inventario_bajo: inventarioBajoResult.rows,
        ventas_por_estado: ventasEstadoResult.rows,
        periodo
      }
    });

  } catch (error) {
    console.error('Error al obtener dashboard:', error);
    res.status(500).json({
      success: false,
      message: 'Error al obtener dashboard'
    });
  }
};

/**
 * Generar reporte mensual
 * POST /api/reportes/generar-mensual
 */
const generarReporteMensual = async (req, res) => {
  try {
    const { mes, anio } = req.body;
    const idUsuario = req.user.id_usuario;

    if (!mes || !anio) {
      return res.status(400).json({
        success: false,
        message: 'Mes y año son requeridos'
      });
    }

    // Llamar función de PostgreSQL
    const result = await query(
      'SELECT generar_reporte_mensual($1, $2, $3) as id_reporte',
      [mes, anio, idUsuario]
    );

    const idReporte = result.rows[0].id_reporte;

    // Obtener reporte generado
    const reporteResult = await query(
      'SELECT * FROM reportes_mensuales WHERE id_reporte = $1',
      [idReporte]
    );

    res.json({
      success: true,
      message: 'Reporte mensual generado exitosamente',
      data: reporteResult.rows[0]
    });

  } catch (error) {
    console.error('Error al generar reporte mensual:', error);
    res.status(500).json({
      success: false,
      message: 'Error al generar reporte mensual'
    });
  }
};

/**
 * Obtener reportes mensuales
 * GET /api/reportes/mensuales
 */
const getReportesMensuales = async (req, res) => {
  try {
    const { limit = 12 } = req.query;

    const result = await query(
      `SELECT rm.*, u.nombre_completo as generado_por
       FROM reportes_mensuales rm
       JOIN usuarios u ON rm.id_usuario_genera = u.id_usuario
       ORDER BY rm.anio DESC, rm.mes DESC
       LIMIT $1`,
      [limit]
    );

    res.json({
      success: true,
      data: result.rows
    });

  } catch (error) {
    console.error('Error al obtener reportes mensuales:', error);
    res.status(500).json({
      success: false,
      message: 'Error al obtener reportes mensuales'
    });
  }
};

/**
 * Productos más vendidos
 * GET /api/reportes/productos-vendidos
 */
const getProductosVendidos = async (req, res) => {
  try {
    const { fecha_inicio, fecha_fin, limit = 10 } = req.query;

    let sqlQuery = `
      SELECT 
        p.id_producto,
        p.nombre_producto,
        c.nombre_categoria,
        COUNT(dv.id_detalle_venta) as veces_vendido,
        SUM(dv.cantidad) as cantidad_total,
        SUM(dv.subtotal) as ingresos_totales
      FROM detalle_ventas dv
      JOIN productos p ON dv.id_producto = p.id_producto
      JOIN ventas v ON dv.id_venta = v.id_venta
      JOIN categorias_producto c ON p.id_categoria = c.id_categoria
      WHERE v.estado_venta = 'COMPLETADA'
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

    sqlQuery += `
      GROUP BY p.id_producto, p.nombre_producto, c.nombre_categoria
      ORDER BY cantidad_total DESC
    `;

    params.push(limit);
    sqlQuery += ` LIMIT $${params.length}`;

    const result = await query(sqlQuery, params);

    res.json({
      success: true,
      data: result.rows
    });

  } catch (error) {
    console.error('Error al obtener productos vendidos:', error);
    res.status(500).json({
      success: false,
      message: 'Error al obtener productos vendidos'
    });
  }
};

/**
 * Toppings más usados
 * GET /api/reportes/toppings-usados
 */
const getToppingsUsados = async (req, res) => {
  try {
    const { fecha_inicio, fecha_fin, limit = 10 } = req.query;

    let sqlQuery = `
      SELECT 
        t.id_topping,
        t.nombre_topping,
        COUNT(dvt.id_detalle_topping) as veces_usado,
        SUM(dvt.cantidad) as cantidad_total,
        SUM(dvt.precio_adicional * dvt.cantidad) as ingresos_totales
      FROM detalle_ventas_toppings dvt
      JOIN toppings t ON dvt.id_topping = t.id_topping
      JOIN detalle_ventas dv ON dvt.id_detalle_venta = dv.id_detalle_venta
      JOIN ventas v ON dv.id_venta = v.id_venta
      WHERE v.estado_venta = 'COMPLETADA'
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

    sqlQuery += `
      GROUP BY t.id_topping, t.nombre_topping
      ORDER BY cantidad_total DESC
    `;

    params.push(limit);
    sqlQuery += ` LIMIT $${params.length}`;

    const result = await query(sqlQuery, params);

    res.json({
      success: true,
      data: result.rows
    });

  } catch (error) {
    console.error('Error al obtener toppings usados:', error);
    res.status(500).json({
      success: false,
      message: 'Error al obtener toppings usados'
    });
  }
};

/**
 * Reporte de inventario
 * GET /api/reportes/inventario
 */
const getReporteInventario = async (req, res) => {
  try {
    // Toppings
    const toppingsResult = await query(
      `SELECT 
         id_topping,
         nombre_topping,
         stock_actual,
         stock_minimo,
         unidad_medida,
         disponible,
         CASE 
           WHEN stock_actual < stock_minimo THEN 'BAJO'
           WHEN stock_actual < (stock_minimo * 1.5) THEN 'MEDIO'
           ELSE 'ALTO'
         END as nivel_stock
       FROM toppings
       ORDER BY 
         CASE 
           WHEN stock_actual < stock_minimo THEN 1
           WHEN stock_actual < (stock_minimo * 1.5) THEN 2
           ELSE 3
         END,
         nombre_topping`
    );

    // Materias primas
    const materiasResult = await query(
      `SELECT 
         id_materia_prima,
         nombre_materia,
         cantidad_actual,
         cantidad_minima,
         unidad_medida,
         fecha_vencimiento,
         CASE 
           WHEN cantidad_actual < cantidad_minima THEN 'BAJO'
           WHEN cantidad_actual < (cantidad_minima * 1.5) THEN 'MEDIO'
           ELSE 'ALTO'
         END as nivel_stock
       FROM inventario_materias_primas
       ORDER BY 
         CASE 
           WHEN cantidad_actual < cantidad_minima THEN 1
           WHEN cantidad_actual < (cantidad_minima * 1.5) THEN 2
           ELSE 3
         END,
         nombre_materia`
    );

    // Resumen
    const resumen = {
      toppings_bajo: toppingsResult.rows.filter(t => t.nivel_stock === 'BAJO').length,
      toppings_medio: toppingsResult.rows.filter(t => t.nivel_stock === 'MEDIO').length,
      toppings_alto: toppingsResult.rows.filter(t => t.nivel_stock === 'ALTO').length,
      materias_bajo: materiasResult.rows.filter(m => m.nivel_stock === 'BAJO').length,
      materias_medio: materiasResult.rows.filter(m => m.nivel_stock === 'MEDIO').length,
      materias_alto: materiasResult.rows.filter(m => m.nivel_stock === 'ALTO').length
    };

    res.json({
      success: true,
      data: {
        toppings: toppingsResult.rows,
        materias_primas: materiasResult.rows,
        resumen
      }
    });

  } catch (error) {
    console.error('Error al obtener reporte de inventario:', error);
    res.status(500).json({
      success: false,
      message: 'Error al obtener reporte de inventario'
    });
  }
};

/**
 * Ventas por categoría
 * GET /api/reportes/ventas-categoria
 */
const getVentasPorCategoria = async (req, res) => {
  try {
    const { fecha_inicio, fecha_fin } = req.query;

    let sqlQuery = `
      SELECT 
        c.id_categoria,
        c.nombre_categoria,
        COUNT(DISTINCT v.id_venta) as numero_ventas,
        SUM(dv.cantidad) as productos_vendidos,
        SUM(dv.subtotal) as ingresos_totales
      FROM detalle_ventas dv
      JOIN productos p ON dv.id_producto = p.id_producto
      JOIN categorias_producto c ON p.id_categoria = c.id_categoria
      JOIN ventas v ON dv.id_venta = v.id_venta
      WHERE v.estado_venta = 'COMPLETADA'
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

    sqlQuery += `
      GROUP BY c.id_categoria, c.nombre_categoria
      ORDER BY ingresos_totales DESC
    `;

    const result = await query(sqlQuery, params);

    // Calcular porcentajes
    const totalIngresos = result.rows.reduce((sum, row) => sum + parseFloat(row.ingresos_totales), 0);
    
    const dataConPorcentaje = result.rows.map(row => ({
      ...row,
      porcentaje: totalIngresos > 0 ? ((parseFloat(row.ingresos_totales) / totalIngresos) * 100).toFixed(2) : 0
    }));

    res.json({
      success: true,
      data: dataConPorcentaje,
      total_ingresos: totalIngresos
    });

  } catch (error) {
    console.error('Error al obtener ventas por categoría:', error);
    res.status(500).json({
      success: false,
      message: 'Error al obtener ventas por categoría'
    });
  }
};

module.exports = {
  getDashboard,
  generarReporteMensual,
  getReportesMensuales,
  getProductosVendidos,
  getToppingsUsados,
  getReporteInventario,
  getVentasPorCategoria
};