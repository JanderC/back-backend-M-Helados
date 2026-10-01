const { Pool, types } = require('pg');
require('dotenv').config();

/**
 * Las columnas "timestamp without time zone" se guardan en UTC. Por defecto
 * pg las interpreta en la hora local del servidor, así que la hora cambiaba
 * según dónde corriera el backend. Se leen siempre como UTC.
 */
types.setTypeParser(types.builtins.TIMESTAMP, (valor) =>
  valor === null ? null : new Date(valor.replace(' ', 'T') + 'Z')
);

/**
 * Configuración de la conexión a PostgreSQL
 */
const pool = new Pool({
  host: process.env.DB_HOST || 'aws-1-us-west-2.pooler.supabase.com',
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME || 'postgres',
  user: process.env.DB_USER || 'postgres.xorvhmunbqfhvwftpjcb',
  password: process.env.DB_PASSWORD || 'Mhelados123*',
  max: 20, // Máximo de conexiones en el pool
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});
//Cambio
/**
 * Función para ejecutar queries
 */
const query = async (text, params) => {
  const start = Date.now();
  try {
    const res = await pool.query(text, params);
    const duration = Date.now() - start;
    console.log('Ejecutada query:', { text, duration, rows: res.rowCount });
    return res;
  } catch (error) {
    console.error('Error en query:', error);
    throw error;
  }
};

/**
 * Función para obtener un cliente del pool (transacciones)
 */
const getClient = async () => {
  const client = await pool.connect();
  const query = client.query;
  const release = client.release;

  // Modificar para logging
  client.query = (...args) => {
    client.lastQuery = args;
    return query.apply(client, args);
  };

  // Timeout para liberar automáticamente
  const timeout = setTimeout(() => {
    console.error('Cliente no liberado después de 5 segundos!');
    console.error('Última query ejecutada:', client.lastQuery);
  }, 5000);

  client.release = () => {
    clearTimeout(timeout);
    client.query = query;
    client.release = release;
    return release.apply(client);
  };

  return client;
};

/**
 * Test de conexión
 */
pool.on('connect', () => {
  console.log('✅ Conectado a PostgreSQL');
});

pool.on('error', (err) => {
  console.error('❌ Error inesperado en PostgreSQL:', err);
  process.exit(-1);
});

/**
 * Verificar conexión inicial
 */
const testConnection = async () => {
  try {
    const res = await query('SELECT NOW()');
    console.log('🔌 Base de datos conectada correctamente:', res.rows[0].now);
    return true;
  } catch (error) {
    console.error('❌ Error al conectar con la base de datos:', error.message);
    return false;
  }
};

module.exports = {
  query,
  getClient,
  pool,
  testConnection
};