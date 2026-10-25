// Avisos y recordatorios. Se calculan en el mismo aparato al abrir el programa y cada rato mientras está abierto:
//  · a cada miembro, el día de pago: «hoy toca la cuota»;
//  · al que debe: al día siguiente de la fecha de pago y cada semana hasta que pague;
//  · a la encargada (y la suplente): el día de pago, el día después «faltan por pagar» y el día 1 el cierre de mes.
// Salen como notificación del celular (si dio permiso) y, para WhatsApp, el Inicio le prepara los mensajes ya
// escritos para mandarlos con un toque. Para que lleguen con el programa cerrado hace falta la nube con
// mensajes al celular (pregunta p-SF1-avisos).

import { fechasDePago, diasEntre, sumarDias, nombreMes } from "./calendario.js";
import { estadoMiembro, deudores, activos } from "./cuentas.js";
import { dinero, estadoTexto } from "./textos.js";

export const AVISOS_DE_FABRICA = { diaPago: true, deben: true, recibo: true, entraDinero: true, faltan: true, canal: "ambos", hora: 9 };

export function conf(ajustes) { return { ...AVISOS_DE_FABRICA, ...(ajustes.avisos || {}) }; }

/** La última fecha de pago que ya llegó (hoy incluido), o null. */
export function ultimaFechaPago(ajustes, hoy) {
  const l = fechasDePago(ajustes, sumarDias(hoy, -40), hoy);
  return l.length ? l[l.length - 1] : null;
}

/** ¿Hoy toca recordarle al que debe? (al día siguiente de la fecha de pago y después cada 7 días) */
export function tocaRecordar(ajustes, hoy) {
  const u = ultimaFechaPago(ajustes, hoy);
  if (!u) return false;
  const d = diasEntre(u, hoy);
  return d >= 1 && d % 7 === 1;
}

/**
 * Los avisos que le tocan hoy a quien entró. «sesion» = { rol: "encargada"|"suplente"|"miembro", miembro }.
 * «hora» es la hora de ahora (0 a 23): antes de la hora escogida no sale nada.
 */
export function avisosDeHoy({ ajustes, miembros, movs, hoy, hora, sesion }) {
  const c = conf(ajustes), res = [], fondo = ajustes.nombre || "Fondo Familiar";
  if (!sesion || hora < c.hora || c.canal === "whatsapp") return res;
  const esDiaPago = ultimaFechaPago(ajustes, hoy) === hoy;
  if (sesion.rol === "miembro") {
    const m = miembros.find((x) => x.id === sesion.miembro);
    if (!m) return res;
    const est = estadoMiembro(m, movs, ajustes, hoy);
    if (c.diaPago && esDiaPago) res.push({ clave: "dia-" + hoy, texto: "Hoy toca la cuota de " + dinero(est.cuota) + " del " + fondo + "." + (est.debe > 1 ? " Debes " + estadoTexto(est, ajustes) + "." : "") });
    else if (c.deben && est.debe && tocaRecordar(ajustes, hoy)) res.push({ clave: "debe-" + hoy, texto: m.nombre + ": debes " + estadoTexto(est, ajustes) + ". Puedes pagar en efectivo o por transferencia." });
    return res;
  }
  const deben = deudores(miembros, movs, ajustes, hoy);
  if (c.diaPago && esDiaPago) res.push({ clave: "cobro-" + hoy, texto: "Hoy es día de pago del " + fondo + ": " + activos(miembros).length + " miembros." });
  const u = ultimaFechaPago(ajustes, hoy);
  if (c.faltan && u && diasEntre(u, hoy) === 1 && deben.length) res.push({ clave: "faltan-" + hoy, texto: "Faltan por pagar: " + juntar(deben.map((x) => x.m.nombre)) + "." });
  if (hoy.endsWith("-01")) {
    const [a, m] = sumarDias(hoy, -1).split("-").map(Number);
    res.push({ clave: "cierre-" + hoy, texto: "Hoy toca mandarles a todos el resumen de " + nombreMes(a, m) + " (en Ajustes, «Cierre de mes»)." });
  }
  return res;
}

/** «Luisanni, Carlos y Junior» */
export function juntar(nombres) {
  return nombres.length <= 1 ? nombres.join("") : nombres.slice(0, -1).join(", ") + " y " + nombres[nombres.length - 1];
}

const YA = "ff-avisados";
function yaAvisados() { try { return JSON.parse(localStorage.getItem(YA) || "[]"); } catch { return []; } }

/** Muestra los avisos que todavía no se habían mostrado (notificación del celular si hay permiso). Devuelve los nuevos. */
export async function mostrar(avisos, enPantalla) {
  const ya = yaAvisados(), nuevos = avisos.filter((a) => !ya.includes(a.clave));
  for (const a of nuevos) await notificar(a.texto, enPantalla, a.clave);
  if (nuevos.length) try { localStorage.setItem(YA, JSON.stringify([...ya, ...nuevos.map((a) => a.clave)].slice(-200))); } catch { /* sin espacio */ }
  return nuevos;
}

/** Una notificación del celular (si dio permiso) y también el aviso dentro del programa. */
export async function notificar(texto, enPantalla, clave) {
  if (enPantalla) enPantalla(texto);
  try {
    if (typeof Notification !== "undefined" && Notification.permission === "granted" && navigator.serviceWorker) {
      const reg = await navigator.serviceWorker.ready;
      await reg.showNotification("Fondo Familiar", { body: texto, icon: "iconos/icono-192.png", badge: "iconos/icono-192.png", tag: clave || undefined, lang: "es" });
    }
  } catch { /* sin notificaciones: se queda el aviso en pantalla */ }
}

export async function pedirPermiso() {
  if (typeof Notification === "undefined") return "no-hay";
  if (Notification.permission === "granted") return "granted";
  try { return await Notification.requestPermission(); } catch { return "denied"; }
}
