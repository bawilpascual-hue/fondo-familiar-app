// Las cuentas del fondo: quién debe, cuánto hay, préstamos, reglas para retirar y el resumen del mes.
// Aquí no se guarda nada: todo sale de los miembros y los movimientos (pagos, salidas y préstamos).
//
// Cómo se cuenta lo que debe cada uno: desde su primera fecha de pago hasta hoy se cuentan las fechas de pago
// que ya llegaron; a eso se le restan las cuotas que ha pagado. Si da más de cero, debe esas; si pagó de más,
// las tiene adelantadas. Así cada pago tacha primero las más viejas.

import { fechasDePago, proximasFechas, sumarDias } from "./calendario.js";

/** ¿Este movimiento cuenta para el dinero? (no está anulado y, si es una salida, ya se hizo) */
export function cuenta(mov) {
  if (!mov || mov.anulado) return false;
  if (mov.tipo === "salida" && mov.estado && mov.estado !== "hecha") return false;
  return true;
}

function hasta(movs, fecha) { return fecha ? movs.filter((x) => x.fecha <= fecha) : movs; }

/** Cuánto entró, cuánto salió y cuánto hay (en total, en efectivo y por transferencia). */
export function totales(movs, alDia) {
  const t = { entro: 0, salio: 0, fondo: 0, efectivo: 0, transferencia: 0 };
  for (const x of hasta(movs, alDia)) {
    if (!cuenta(x)) continue;
    const donde = (x.tipo === "pago" ? x.como : x.de) === "transferencia" ? "transferencia" : "efectivo";
    if (x.tipo === "pago") { t.entro += x.monto; t[donde] += x.monto; }
    else { t.salio += x.monto; t[donde] -= x.monto; }
  }
  t.fondo = t.efectivo + t.transferencia;
  return t;
}

/** Lo que hay disponible para sacar de efectivo o de transferencia. */
export function disponible(t, de) { return de === "transferencia" ? t.transferencia : t.efectivo; }

/** El préstamo que un miembro todavía está devolviendo (o null). */
export function prestamoDe(miembroId, movs, alDia) {
  const lista = hasta(movs, alDia);
  const prestamos = lista.filter((x) => x.tipo === "prestamo" && x.miembro === miembroId && cuenta(x))
    .sort((a, b) => (a.fecha + a.creado).localeCompare(b.fecha + b.creado));
  for (const p of prestamos) {
    const devuelto = lista.filter((x) => x.tipo === "pago" && x.prestamo === p.id && cuenta(x)).reduce((s, x) => s + (x.devolucion || 0), 0);
    const saldo = p.monto - devuelto;
    if (saldo > 0) return { id: p.id, mov: p, monto: p.monto, devuelto, saldo, porCuota: p.porCuota, nCuotas: p.nCuotas, fecha: p.fecha };
  }
  return null;
}

/** Cómo está un miembro hoy: cuántas debe, cuántas adelantó, cuánto debe y su préstamo. */
export function estadoMiembro(m, movs, ajustes, hoy) {
  const vencidas = m.desde ? fechasDePago(ajustes, m.desde, hoy) : [];
  const suyos = hasta(movs, hoy).filter((x) => x.tipo === "pago" && x.miembro === m.id && cuenta(x));
  const pagadas = suyos.reduce((s, x) => s + (x.n || 0), 0);
  const debe = Math.max(0, vencidas.length - pagadas);
  const adelantadas = Math.max(0, pagadas - vencidas.length);
  const cuota = m.cuota || ajustes.cuota || 0;
  return { vencidas, pagadas, debe, adelantadas, cuota, montoDebe: debe * cuota, prestamo: prestamoDe(m.id, movs, hoy), pagos: suyos };
}

/** Los cuadritos de la ficha: las últimas fechas de pago (✓ pagada o ✗ sin pagar) y las próximas. */
export function cuadritos(m, est, ajustes, hoy, cuantas = 7) {
  const res = [];
  const ultimas = est.vencidas.slice(-cuantas), primera = est.vencidas.length - ultimas.length;
  ultimas.forEach((f, i) => res.push({ fecha: f, estado: primera + i < est.pagadas ? "si" : "no" }));
  const desde = m.desde && m.desde > hoy ? m.desde : sumarDias(hoy, 1);
  // las adelantadas (hasta 4) y la próxima que le toca
  const adel = Math.min(est.adelantadas, 4);
  proximasFechas(ajustes, desde, adel + 1).forEach((f, i) => res.push({ fecha: f, estado: i < adel ? "adelantada" : "prox" }));
  return res;
}

/** Los miembros que están en el fondo (los dados de baja no cuentan). */
export function activos(miembros) { return miembros.filter((x) => x.activo !== false); }

/** La lista de los que deben, el que más debe primero. */
export function deudores(miembros, movs, ajustes, hoy) {
  return activos(miembros).map((m) => ({ m, est: estadoMiembro(m, movs, ajustes, hoy) }))
    .filter((x) => x.est.debe > 0).sort((a, b) => b.est.debe - a.est.debe || a.m.nombre.localeCompare(b.m.nombre));
}

/** Lo que paga en total: «n» cuotas y, si tiene préstamo, la parte del préstamo de esas mismas «n» cuotas. */
export function calcularPago(est, n, conPrestamo = true) {
  const cuotas = n * est.cuota;
  const devolucion = conPrestamo && est.prestamo ? Math.min(est.prestamo.saldo, n * est.prestamo.porCuota) : 0;
  return { cuotas, devolucion, total: cuotas + devolucion };
}

/** Reglas para retirar: «directo», «avisar» (se avisa a todos) o «acuerdo» (que digan «de acuerdo» la mitad). */
export function reglaRetiro(ajustes, monto) {
  const tope = ajustes.tope ?? 5000, regla = ajustes.reglaMas || "avisar";
  if (regla === "directo" || monto <= tope) return "directo";
  return regla;
}

/** Cuántos tienen que decir «de acuerdo» (la mitad de los miembros, redondeando hacia arriba). */
export function acuerdosNecesarios(cuantosMiembros) { return Math.max(1, Math.ceil(cuantosMiembros / 2)); }

/** El préstamo se devuelve en partes iguales (redondeando hacia arriba). */
export function porCuotaPrestamo(monto, nCuotas) { return Math.ceil(monto / Math.max(1, nCuotas)); }

/** El resumen de un mes (para el cierre de mes y el PDF). */
export function resumenMes(miembros, movs, ajustes, anio, mes, hoy) {
  const mm = String(mes).padStart(2, "0"), desde = anio + "-" + mm + "-01";
  const finMes = anio + "-" + mm + "-" + String(new Date(anio, mes, 0).getDate()).padStart(2, "0");
  const fin = hoy && hoy < finMes ? hoy : finMes;
  const delMes = movs.filter((x) => x.fecha >= desde && x.fecha <= fin && cuenta(x));
  const entro = delMes.filter((x) => x.tipo === "pago").reduce((s, x) => s + x.monto, 0);
  const salio = delMes.filter((x) => x.tipo !== "pago").reduce((s, x) => s + x.monto, 0);
  const t = totales(movs, fin);
  const lista = activos(miembros).map((m) => ({ m, est: estadoMiembro(m, movs, ajustes, fin) }));
  const deben = lista.filter((x) => x.est.debe > 0);
  const prestamos = lista.filter((x) => x.est.prestamo).reduce((s, x) => s + x.est.prestamo.saldo, 0);
  return { anio, mes, desde, hasta: fin, entro, salio, hay: t.fondo, efectivo: t.efectivo, transferencia: t.transferencia,
    miembros: lista.length, alDia: lista.length - deben.length, deben, prestamos, movimientos: delMes };
}
