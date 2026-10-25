// Las contraseñas para entrar (encargada, suplente y miembros). No se guardan tal cual: se guarda una «huella»
// (SHA-256 con un poco de sal), así nadie las puede leer mirando los datos.

function hex(bytes) { return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join(""); }

export async function huella(clave, sal) {
  const datos = new TextEncoder().encode(sal + "|" + String(clave || ""));
  return hex(new Uint8Array(await crypto.subtle.digest("SHA-256", datos)));
}

/** Guarda una contraseña nueva: devuelve { sal, huella }. */
export async function nueva(clave) {
  const sal = hex(crypto.getRandomValues(new Uint8Array(12)));
  return { sal, huella: await huella(clave, sal) };
}

/** ¿Esta contraseña es la guardada? */
export async function coincide(clave, guardada) {
  if (!guardada || !guardada.sal || !clave) return false;
  return (await huella(clave, guardada.sal)) === guardada.huella;
}

/** Las contraseñas tienen que tener al menos 4 letras o números. */
export function sirve(clave) { return String(clave || "").trim().length >= 4; }
