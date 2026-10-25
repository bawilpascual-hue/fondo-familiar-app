// La publicidad del dueño en el banner de arriba del Inicio (como en ARQUEO). Los anuncios los pone el dueño con su
// programita «Publicidad ARQUEO», que sube publicidad.json y las imágenes al repositorio público de ARQUEO.
// Se bajan al abrir y cada hora; se guarda una copia para mostrarlos sin internet. El de BAWIL sale siempre primero.

import { PUBLICIDAD } from "./config.js";
import { WHATSAPP, EMPRESA } from "./creador.js";
import { pareceTelefono, numeroWhatsApp } from "./whatsapp.js";

const GUARDADOS = "ff-publicidad";

export const DE_BAWIL = { id: "bawil", titulo: EMPRESA, subtitulo: "Reparación de celulares y computadoras · WhatsApp 829-696-3495", imagen: "", logo: true, enlace: "https://wa.me/" + WHATSAPP, activo: true };

/** Los que salen hoy: prendidos y dentro de sus fechas (igual que ARQUEO). */
export function vigentes(anuncios, hoy) {
  return (anuncios || []).filter((a) => a && a.activo !== false && (!a.desde || hoy >= a.desde) && (!a.hasta || hoy <= a.hasta) && (a.titulo || a.imagen));
}

/** A dónde lleva el anuncio al tocarlo: una página o, si trae un teléfono, su WhatsApp. Vacío = a ningún lado. */
export function destino(a) {
  const e = String((a && a.enlace) || "").trim();
  if (!e) return "";
  if (pareceTelefono(e)) return "https://wa.me/" + numeroWhatsApp(e);
  if (/^https?:\/\//i.test(e)) return e;
  if (/^[a-z]+:/i.test(e)) return "";      // nada de abrir programas raros
  return "https://" + e;
}

export function imagenDe(a) { return a.imagen ? PUBLICIDAD + encodeURIComponent(a.imagen.split(/[\\/]/).pop()) : ""; }

export function guardados() {
  try { return JSON.parse(localStorage.getItem(GUARDADOS) || "[]"); } catch { return []; }
}

/** Baja la lista nueva; si no hay internet devuelve la guardada. */
export async function actualizar() {
  try {
    const r = await fetch(PUBLICIDAD + "publicidad.json?v=" + Date.now(), { cache: "no-store" });
    if (!r.ok) throw new Error(r.status);
    const lista = (await r.json()).anuncios || [];
    try { localStorage.setItem(GUARDADOS, JSON.stringify(lista)); } catch { /* sin espacio: se usa sin guardar */ }
    return lista;
  } catch { return guardados(); }
}
