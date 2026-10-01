const { getClient } = require('./database');

/**
 * Migraciones de esquema. Se ejecutan al iniciar el servidor y son
 * idempotentes: correrlas varias veces no cambia nada.
 */

/**
 * Caja por turno: cada venta y cada movimiento manual queda amarrado al
 * arqueo (caja) que estaba abierto cuando se registró. Así la caja cuadra
 * con sus propias ventas y no depende de comparar fechas/horas.
 */
const migrarCajaPorTurno = async (client) => {
  const columna = await client.query(
    `SELECT 1 FROM information_schema.columns
     WHERE table_schema = current_schema() AND table_name = 'ventas' AND column_name = 'id_arqueo'`
  );
  const primeraVez = columna.rows.length === 0;

  await client.query(`ALTER TABLE ventas      ADD COLUMN IF NOT EXISTS id_arqueo INTEGER REFERENCES arqueo_caja(id_arqueo)`);
  await client.query(`ALTER TABLE flujo_caja  ADD COLUMN IF NOT EXISTS id_arqueo INTEGER REFERENCES arqueo_caja(id_arqueo)`);
  await client.query(`ALTER TABLE arqueo_caja ADD COLUMN IF NOT EXISTS resumen_cierre JSONB`);

  await client.query(`CREATE INDEX IF NOT EXISTS idx_ventas_arqueo     ON ventas(id_arqueo)`);
  await client.query(`CREATE INDEX IF NOT EXISTS idx_flujo_caja_arqueo ON flujo_caja(id_arqueo)`);

  // Nunca puede haber dos cajas abiertas a la vez
  await client.query(
    `CREATE UNIQUE INDEX IF NOT EXISTS uq_arqueo_caja_una_abierta
     ON arqueo_caja (estado) WHERE estado = 'ABIERTA'`
  );

  if (primeraVez) {
    // Históricos: se asignan a la caja que estaba abierta a la hora del registro
    const ventas = await client.query(
      `UPDATE ventas v
       SET id_arqueo = (
         SELECT a.id_arqueo FROM arqueo_caja a
         WHERE v.fecha_venta >= a.fecha_apertura
           AND (a.fecha_cierre IS NULL OR v.fecha_venta <= a.fecha_cierre)
         ORDER BY a.fecha_apertura DESC
         LIMIT 1
       )
       WHERE v.id_arqueo IS NULL`
    );
    const movimientos = await client.query(
      `UPDATE flujo_caja fc
       SET id_arqueo = (
         SELECT a.id_arqueo FROM arqueo_caja a
         WHERE fc.fecha_transaccion >= a.fecha_apertura
           AND (a.fecha_cierre IS NULL OR fc.fecha_transaccion <= a.fecha_cierre)
         ORDER BY a.fecha_apertura DESC
         LIMIT 1
       )
       WHERE fc.id_arqueo IS NULL`
    );
    console.log(`🗄️  Caja por turno: ${ventas.rowCount} ventas y ${movimientos.rowCount} movimientos revisados`);
  }
};

const runMigrations = async () => {
  const client = await getClient();
  try {
    await client.query('BEGIN');
    await migrarCajaPorTurno(client);
    await client.query('COMMIT');
    console.log('✅ Esquema de base de datos al día');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

module.exports = { runMigrations, migrarCajaPorTurno };
