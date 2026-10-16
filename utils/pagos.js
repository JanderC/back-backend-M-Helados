/**
 * Reglas de métodos de pago por moneda.
 *
 * En bolívares no se recibe efectivo: solo Pago Móvil o punto de venta.
 * Una moneda que no aparece aquí acepta cualquier método universal
 * (id_moneda NULL) o propio de esa moneda.
 */
const METODOS_POR_MONEDA = {
  VES: ['PAGO_MOVIL', 'TARJETA']
};

const NOMBRES_MONEDA = { VES: 'bolívares', COP: 'pesos', USD: 'dólares' };

/**
 * Monedas en las que se puede usar un método.
 * `metodo` = { codigo, codigo_moneda } (codigo_moneda null si es universal)
 */
const monedasPermitidas = (metodo, todasLasMonedas) => {
  const candidatas = metodo.codigo_moneda ? [metodo.codigo_moneda] : todasLasMonedas;
  return candidatas.filter((moneda) =>
    !METODOS_POR_MONEDA[moneda] || METODOS_POR_MONEDA[moneda].includes(metodo.codigo)
  );
};

/**
 * Mensaje de error si el método no se puede usar en esa moneda, o null.
 */
const validarMetodoEnMoneda = (metodo, codigoMoneda) => {
  if (metodo.codigo_moneda && metodo.codigo_moneda !== codigoMoneda) {
    return `${metodo.nombre} solo acepta ${NOMBRES_MONEDA[metodo.codigo_moneda] || metodo.codigo_moneda}`;
  }
  const permitidos = METODOS_POR_MONEDA[codigoMoneda];
  if (permitidos && !permitidos.includes(metodo.codigo)) {
    return `En ${NOMBRES_MONEDA[codigoMoneda] || codigoMoneda} solo se acepta Pago Móvil o punto de venta`;
  }
  return null;
};

module.exports = { METODOS_POR_MONEDA, monedasPermitidas, validarMetodoEnMoneda };
