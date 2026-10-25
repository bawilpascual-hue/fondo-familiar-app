// Fechas del fondo. Todas las fechas se guardan como texto «aaaa-mm-dd» (sin horas), con la fecha del aparato
// (República Dominicana). Así no hay líos de zonas horarias al comparar.

const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
const MESES_CORTOS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
const DIAS = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];

export { MESES, DIAS };

function dos(n) { return String(n).padStart(2, "0"); }

/** La fecha de hoy en este aparato, como «aaaa-mm-dd». */
export function hoyISO(d = new Date()) {
  return d.getFullYear() + "-" + dos(d.getMonth() + 1) + "-" + dos(d.getDate());
}

/** De «aaaa-mm-dd» a fecha (al mediodía, para que nunca se corra de día). */
export function aFecha(iso) {
  const [a, m, d] = iso.split("-").map(Number);
  return new Date(a, m - 1, d, 12);
}

export function aISO(fecha) { return hoyISO(fecha); }

export function ultimoDiaMes(anio, mes1a12) { return new Date(anio, mes1a12, 0).getDate(); }

export function sumarDias(iso, n) { const f = aFecha(iso); f.setDate(f.getDate() + n); return aISO(f); }

/** Días entre dos fechas (b − a). */
export function diasEntre(a, b) { return Math.round((aFecha(b) - aFecha(a)) / 86400000); }

/** Las reglas de pago que vienen de Ajustes, con lo que falte puesto por defecto (15 y 30). */
export function reglas(ajustes = {}) {
  return {
    frecuencia: ajustes.frecuencia || "quincenal",
    dias: Array.isArray(ajustes.dias) && ajustes.dias.length ? ajustes.dias.slice().sort((a, b) => a - b) : [15, 30],
    diaSemana: Number.isInteger(ajustes.diaSemana) ? ajustes.diaSemana : 5,
    diaMes: ajustes.diaMes || 30,
  };
}

/** Las fechas de pago de un mes (si el mes es corto, el 30 pasa al último día: en febrero el 28 o el 29). */
function fechasDelMes(r, anio, mes) {
  const ult = ultimoDiaMes(anio, mes);
  if (r.frecuencia === "mensual") return [anio + "-" + dos(mes) + "-" + dos(Math.min(r.diaMes, ult))];
  if (r.frecuencia === "semanal") {
    const res = [];
    for (let d = 1; d <= ult; d++) if (new Date(anio, mes - 1, d, 12).getDay() === r.diaSemana) res.push(anio + "-" + dos(mes) + "-" + dos(d));
    return res;
  }
  const res = [];
  for (const d of r.dias) { const x = anio + "-" + dos(mes) + "-" + dos(Math.min(d, ult)); if (!res.includes(x)) res.push(x); }
  return res;
}

/** Todas las fechas de pago desde «desde» hasta «hasta» (las dos incluidas), de la más vieja a la más nueva. */
export function fechasDePago(ajustes, desde, hasta) {
  if (!desde || !hasta || desde > hasta) return [];
  const r = reglas(ajustes), res = [];
  let [a, m] = desde.split("-").map(Number);
  const [ah, mh] = hasta.split("-").map(Number);
  while (a < ah || (a === ah && m <= mh)) {
    for (const f of fechasDelMes(r, a, m)) if (f >= desde && f <= hasta) res.push(f);
    m++; if (m > 12) { m = 1; a++; }
  }
  return res;
}

/** Las próximas «n» fechas de pago a partir de «desde» (incluida). */
export function proximasFechas(ajustes, desde, n = 1) {
  // en 32 días por cada pago (más un mes) siempre caben «n» fechas, sea semanal, quincenal o mensual
  return fechasDePago(ajustes, desde, sumarDias(desde, 32 * n + 31)).slice(0, n);
}

export function proximaFecha(ajustes, desde) { return proximasFechas(ajustes, desde, 1)[0]; }

/** Las «n» fechas de pago anteriores a «antesDe» (sin incluirla), de la más vieja a la más nueva. */
export function fechasAnteriores(ajustes, antesDe, n) {
  const lista = fechasDePago(ajustes, sumarDias(antesDe, -40 * Math.max(1, n)), sumarDias(antesDe, -1));
  return lista.slice(-n);
}

/** «30 oct» */
export function corto(iso) { const [, m, d] = iso.split("-").map(Number); return d + " " + MESES_CORTOS[m - 1]; }

/** «30 de octubre de 2026» */
export function largo(iso) { const [a, m, d] = iso.split("-").map(Number); return d + " de " + MESES[m - 1] + " de " + a; }

/** «jueves 30 de octubre» (con «de 2026» si se pide el año) */
export function conDia(iso, conAnio = false) {
  const f = aFecha(iso), [a, m, d] = iso.split("-").map(Number);
  return DIAS[f.getDay()] + " " + d + " de " + MESES[m - 1] + (conAnio ? " de " + a : "");
}

/** «octubre 2026» */
export function nombreMes(anio, mes) { return MESES[mes - 1] + " " + anio; }

/** Cómo se llama cada pago según la frecuencia: quincena, semana o mes. */
export function nombrePeriodo(ajustes, n = 1) {
  const f = reglas(ajustes).frecuencia;
  const uno = f === "semanal" ? "semana" : f === "mensual" ? "mes" : "quincena";
  const varios = f === "mensual" ? "meses" : uno + "s";
  return n === 1 ? uno : varios;
}

/** «3 quincenas» */
export function periodos(ajustes, n) { return n + " " + nombrePeriodo(ajustes, n); }
