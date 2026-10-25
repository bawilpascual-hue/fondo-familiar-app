// Los textos que se mandan por WhatsApp o salen en pantalla: recibo, recordatorios, avisos y resumen del mes.

import { largo, corto, conDia, nombreMes, periodos } from "./calendario.js";
import { FIRMA, CONTACTO } from "./creador.js";

/** «RD$23,500» */
export function dinero(n) { return "RD$" + Math.round(n || 0).toLocaleString("en-US"); }

/** Lee una cantidad escrita a mano («5,000», «RD$ 1500») y devuelve el número (0 si no hay). */
export function leerMonto(texto) { return parseInt(String(texto || "").replace(/\D/g, ""), 10) || 0; }

/** «3 quincenas · RD$1,500» o «Al día» */
export function estadoTexto(est, ajustes) {
  if (est.debe) return periodos(ajustes, est.debe) + " · " + dinero(est.montoDebe);
  return est.adelantadas ? "Al día · " + est.adelantadas + (est.adelantadas === 1 ? " adelantada" : " adelantadas") : "Al día";
}

export function como(texto) { return texto === "transferencia" ? "Transferencia" : "Efectivo"; }

/** El recibo de un pago (también va por WhatsApp). */
export function recibo({ fondo, pago, miembro, estDespues, totalFondo, ajustes }) {
  const l = [];
  l.push((fondo || "Fondo Familiar").toUpperCase() + " · Recibo N.º " + pago.recibo);
  l.push("Fecha: " + largo(pago.fecha));
  l.push("Recibimos de: " + miembro.nombre);
  l.push("Pagó: " + periodos(ajustes, pago.n) + " · " + dinero(pago.monto) + " (" + como(pago.como) + ")");
  if (pago.devolucion) l.push("Incluye " + dinero(pago.devolucion) + " de devolución del préstamo" + (estDespues.prestamo ? " (le queda " + dinero(estDespues.prestamo.saldo) + ")" : " (préstamo saldado)"));
  if (pago.foto) l.push("Comprobante: adjunto 📎");
  l.push(estDespues.debe ? "Le queda pendiente: " + estadoTexto(estDespues, ajustes) : "Está al día. ¡Gracias!");
  l.push("El fondo tiene: " + dinero(totalFondo));
  if (pago.por) l.push("Anotó: " + pago.por);
  l.push("—");
  l.push(FIRMA + " · " + CONTACTO);
  return l.join("\n");
}

/** Recordatorio a uno que debe. */
export function recordatorio({ fondo, miembro, est, ajustes }) {
  return "Hola " + miembro.nombre + ", te recordamos del " + (fondo || "Fondo Familiar") + ": debes " + estadoTexto(est, ajustes) +
    ". Puedes pagar en efectivo o por transferencia. ¡Gracias!";
}

/** Aviso del día de pago. */
export function hoyToca({ fondo, miembro, cuota, hoy }) {
  return "Hola " + miembro.nombre + ", hoy " + conDia(hoy) + " toca la cuota de " + dinero(cuota) + " del " + (fondo || "Fondo Familiar") + ". ¡Gracias por estar al día!";
}

/** Aviso a todos cuando se saca más del tope. */
export function avisoRetiro({ fondo, salida, quien, hay, acuerdo }) {
  return (fondo || "Fondo Familiar") + ": " + (acuerdo ? "se quiere sacar " : "se sacaron ") + dinero(salida.monto) + " del fondo para " +
    salida.motivo.toLowerCase() + (quien ? " de " + quien : "") + (salida.nota ? " (" + salida.nota + ")" : "") + ". " +
    (acuerdo ? "Como pasa del tope, hace falta que la mitad diga «de acuerdo». Contesta «de acuerdo» si estás de acuerdo." : "Quedan " + dinero(hay) + " en el fondo.");
}

/** El resumen del mes (cierre de mes). */
export function resumen({ fondo, r, ajustes }) {
  const l = [];
  l.push((fondo || "Fondo Familiar").toUpperCase() + " · Resumen de " + nombreMes(r.anio, r.mes));
  l.push("Entró: " + dinero(r.entro));
  l.push("Salió: " + dinero(r.salio));
  l.push("Hay en el fondo: " + dinero(r.hay) + " (efectivo " + dinero(r.efectivo) + " · transferencia " + dinero(r.transferencia) + ")");
  l.push("Miembros: " + r.miembros + " · al día: " + r.alDia);
  l.push("Deben: " + (r.deben.length ? r.deben.map((x) => x.m.nombre + " (" + estadoTexto(x.est, ajustes) + ")").join(", ") : "nadie"));
  l.push("Préstamos por cobrar: " + dinero(r.prestamos));
  l.push("—");
  l.push(FIRMA);
  return l.join("\n");
}

/** El mensaje para pedirle la clave a BAWIL. */
export function pedirClave(codigo, fondo) {
  return "Hola, quiero activar Fondo Familiar" + (fondo && fondo !== "Fondo Familiar" ? " («" + fondo + "»)" : "") + ". Mi código es " + codigo;
}

/** Una línea del historial: «30 oct · 1 quincena · Efectivo» */
export function detallePago(p, ajustes) {
  return corto(p.fecha) + " · " + periodos(ajustes, p.n) + (p.devolucion ? " + préstamo" : "") + " · " + como(p.como) + (p.foto ? " · 📎 comprobante" : "");
}
