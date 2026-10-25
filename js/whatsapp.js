// Enlaces de WhatsApp con el mensaje ya escrito: se tocan, se abre WhatsApp y solo hay que darle enviar.

/** El número como lo pide WhatsApp: con el 1 de República Dominicana delante y sin rayas. Vacío si no sirve. */
export function numeroWhatsApp(tel) {
  const n = String(tel || "").replace(/\D/g, "");
  if (n.length === 10 && /^8[024]9/.test(n)) return "1" + n;   // 809, 829 y 849
  if (n.length === 11 && n.startsWith("1")) return n;
  return n.length >= 10 ? n : "";
}

/** El enlace para mandar «texto» al teléfono «tel». Sin teléfono, WhatsApp deja escoger el chat (o un grupo). */
export function enlaceWhatsApp(tel, texto) {
  const n = numeroWhatsApp(tel);
  return "https://wa.me/" + n + "?text=" + encodeURIComponent(texto || "");
}

/** ¿Este texto parece un teléfono? (para los anuncios que traen un número en vez de una página) */
export function pareceTelefono(texto) {
  const t = String(texto || "").trim();
  return /^[+\d\s().-]+$/.test(t) && t.replace(/\D/g, "").length >= 10;
}
