/**
 * Manejo de fechas del negocio.
 *
 * La BD guarda las fechas como "timestamp without time zone" en hora UTC
 * (CURRENT_TIMESTAMP con la sesión en UTC), pero la heladería trabaja en hora
 * de Venezuela. Un "día" de ventas es el día calendario del negocio, no el
 * día UTC: sin esta conversión, las ventas hechas después de las 8:00 p.m.
 * caen en el día siguiente.
 */
const TZ_ENV = process.env.TZ_NEGOCIO || 'America/Caracas';
// Se interpola en SQL, así que solo se aceptan nombres de zona válidos
const TZ_NEGOCIO = /^[A-Za-z_]+(\/[A-Za-z_+-]+)*$/.test(TZ_ENV) ? TZ_ENV : 'America/Caracas';

/**
 * Extrae 'YYYY-MM-DD' de lo que mande el cliente ('2026-09-30',
 * '2026-09-30T23:59:59', etc.). Devuelve null si no es una fecha válida.
 */
const soloFecha = (valor) => {
  if (typeof valor !== 'string') return null;
  const match = valor.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return null;
  const fecha = new Date(Date.UTC(+match[1], +match[2] - 1, +match[3]));
  if (isNaN(fecha.getTime()) || fecha.getUTCDate() !== +match[3]) return null;
  return match[0];
};

/**
 * Fecha de hoy ('YYYY-MM-DD') en la zona horaria del negocio
 */
const hoyNegocio = () =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ_NEGOCIO, year: 'numeric', month: '2-digit', day: '2-digit'
  }).format(new Date());

/**
 * SQL: instante (UTC, sin zona) en que empieza el día `placeholder` del negocio.
 * `diasOffset` permite desplazar el día (ej. -7 para "hace una semana").
 */
const inicioDiaSQL = (placeholder, diasOffset = 0) =>
  `((${placeholder}::date + ${parseInt(diasOffset, 10) || 0})::timestamp AT TIME ZONE '${TZ_NEGOCIO}' AT TIME ZONE 'UTC')`;

/**
 * SQL: instante (UTC, sin zona) en que termina el día `placeholder` del negocio
 * (exclusivo: es el inicio del día siguiente, se compara con "<").
 */
const finDiaSQL = (placeholder) => inicioDiaSQL(placeholder, 1);

module.exports = {
  TZ_NEGOCIO,
  soloFecha,
  hoyNegocio,
  inicioDiaSQL,
  finDiaSQL
};
