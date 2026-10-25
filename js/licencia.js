// Licencia como en ARQUEO, pero por fondo en vez de por computadora.
// 1. Cada fondo tiene su «código del fondo» (FF-XXXX-XXXX-XXXX), que se crea al azar la primera vez.
// 2. El dueño, con su Generador de licencias (escogiendo «Fondo Familiar»), firma ese código con la clave privada
//    y da la «clave de activación».
// 3. El programa comprueba la firma con la clave pública de abajo. Con otro código la clave no sirve.
// La clave privada NUNCA va en este repositorio: vive junto al Generador del dueño (clave_privada_fondo.txt).

export const CLAVE_PUBLICA =
  "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAE8Ul86BjRRQ29dp+xIqCf/n4PFS9UIxWPBwW0bEZqWM6JA3rz9fLMRIBWb7CBQsBdVumLYRR23PSxD+BrlRp18w==";

const PREFIJO = "FONDO-LIC-1|";
const ALFABETO = "0123456789ABCDEFGHJKMNPQRSTVWXYZ"; // sin I, L, O ni U para no confundirse (igual que ARQUEO)

/** Mayúsculas, sin guiones ni espacios; O→0 e I/L→1 por si se escriben a mano (igual que ARQUEO). */
export function normalizar(s) {
  return Array.from(String(s || "").toUpperCase()).filter((c) => /[A-Z0-9]/.test(c))
    .map((c) => (c === "O" ? "0" : c === "I" || c === "L" ? "1" : c)).join("");
}

/** Las 12 letras del código, sin el «FF» de adelante. */
export function nucleoCodigo(codigo) {
  const n = normalizar(codigo);
  return n.length === 14 && n.startsWith("FF") ? n.slice(2) : n;
}

export function base32(bytes) {
  let s = "", buffer = 0, bits = 0;
  for (const b of bytes) {
    buffer = (buffer << 8) | b; bits += 8;
    while (bits >= 5) { s += ALFABETO[(buffer >> (bits - 5)) & 31]; bits -= 5; }
    buffer &= 0xff;
  }
  if (bits > 0) s += ALFABETO[(buffer << (5 - bits)) & 31];
  return s;
}

export function desdeBase32(s) {
  const res = []; let buffer = 0, bits = 0;
  for (const c of s) {
    const v = ALFABETO.indexOf(c);
    if (v < 0) return null;
    buffer = (buffer << 5) | v; bits += 5;
    if (bits >= 8) { res.push((buffer >> (bits - 8)) & 0xff); bits -= 8; }
    buffer &= 0xff;
  }
  return new Uint8Array(res);
}

/** Un código nuevo para el fondo, por ejemplo «FF-7K2M-9Q4D-X81B». */
export function codigoNuevo() {
  const c = base32(crypto.getRandomValues(new Uint8Array(8))).slice(0, 12);
  return "FF-" + c.slice(0, 4) + "-" + c.slice(4, 8) + "-" + c.slice(8);
}

function deBase64(b64) { return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0)); }

/** ¿La clave sirve para este código del fondo? */
export async function valida(codigo, clave, clavePublica = CLAVE_PUBLICA) {
  const firma = desdeBase32(normalizar(clave));
  if (!firma || firma.length !== 64) return false;
  try {
    const llave = await crypto.subtle.importKey("spki", deBase64(clavePublica), { name: "ECDSA", namedCurve: "P-256" }, false, ["verify"]);
    const mensaje = new TextEncoder().encode(PREFIJO + nucleoCodigo(codigo));
    return await crypto.subtle.verify({ name: "ECDSA", hash: "SHA-256" }, llave, firma, mensaje);
  } catch { return false; }
}

/** La clave en grupos de 5 letras, como la da el Generador. */
export function enGrupos(s) { return (normalizar(s).match(/.{1,5}/g) || []).join("-"); }

/** Solo para las pruebas: firma con una clave privada (en el programa de verdad lo hace el Generador). */
export async function firmarParaPruebas(codigo, llavePrivada) {
  const mensaje = new TextEncoder().encode(PREFIJO + nucleoCodigo(codigo));
  const firma = new Uint8Array(await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, llavePrivada, mensaje));
  return enGrupos(base32(firma));
}
