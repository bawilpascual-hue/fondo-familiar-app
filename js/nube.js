// La sincronización con la nube. Todo se anota primero en el aparato (datos.js) y queda en la cola; cuando hay
// internet, esto sube la cola y baja lo que anotaron los otros aparatos (la suplente, la computadora del dueño).
//
// La nube concreta va en un «adaptador» (nube-firebase.js) con:
//   listo                      → true si este aparato ya entró a la nube de su fondo
//   subir(coleccion, doc)      → guarda el documento en la nube
//   bajarDesde(marca)          → { cambios: [{ coleccion, doc }], marca } con lo que cambió en la nube después
//                                de «marca». La marca la pone la nube (no la hora de cada celular, que puede
//                                estar adelantada o atrasada); en Firebase es la hora del servidor.
//   entrar, crearCuenta, cambiarClave, salir → las cuentas del fondo (ver nube-firebase.js)
// Los errores llevan «code»: "clave", "ya-existe", "sin-internet", "debil", "muchos", "permission-denied" u "otro".

import { NUBE } from "./config.js";

const EN_ESTA_PC = typeof location !== "undefined" && /^(localhost|127\.0\.0\.1)$/.test(location.hostname);

/** El adaptador de la nube configurada (o null si no hay nube). */
export async function adaptadorConfigurado() {
  // para probar en la computadora: una nube de mentira que sirve herramientas/servidor-pruebas.py
  let prueba = "";
  try { prueba = EN_ESTA_PC ? localStorage.getItem("ff-nube-prueba") || "" : ""; } catch { prueba = ""; }
  if (prueba) {
    const m = await import("../../pruebas/nube-servidor.js");
    return m.crearAdaptador(prueba);
  }
  if (!NUBE || !NUBE.tipo) return null;
  if (NUBE.tipo === "firebase") {
    const m = await import("./nube-firebase.js");
    return m.crearAdaptador(NUBE);
  }
  return null;
}

/** Corta una espera que no termina (sin señal a medias) para no dejar la sincronización trancada. */
export function conTiempo(promesa, ms = 20000) {
  let reloj;
  const tope = new Promise((_, mal) => { reloj = setTimeout(() => mal(Object.assign(new Error("La nube no contestó a tiempo."), { code: "sin-internet" })), ms); });
  return Promise.race([promesa, tope]).finally(() => clearTimeout(reloj));
}

/** Una nube de mentira en memoria, para las pruebas (varios almacenes pueden compartirla, como dos celulares). */
export function nubeDePrueba() {
  const docs = new Map();
  let caida = false, numero = 0, prohibidas = new Set();
  return {
    nombre: "prueba",
    listo: true,
    docs,
    caer(si = true) { caida = si; },
    /** Para probar las reglas: lo que se suba de esta colección se rechaza. */
    prohibir(coleccion) { prohibidas.add(coleccion); },
    async subir(coleccion, doc) {
      if (caida) throw Object.assign(new Error("sin señal"), { code: "sin-internet" });
      if (prohibidas.has(coleccion)) throw Object.assign(new Error("no se permite"), { code: "permission-denied" });
      const clave = coleccion + "/" + doc.id, hay = docs.get(clave);
      if (!hay || (hay.doc.actualizado || 0) < (doc.actualizado || 0)) docs.set(clave, { coleccion, doc: JSON.parse(JSON.stringify(doc)), marca: ++numero });
    },
    async bajarDesde(marca) {
      if (caida) throw Object.assign(new Error("sin señal"), { code: "sin-internet" });
      const lista = [...docs.values()].filter((x) => x.marca > (marca || 0));
      return { cambios: lista.map((x) => ({ coleccion: x.coleccion, doc: JSON.parse(JSON.stringify(x.doc)) })), marca: Math.max(marca || 0, ...lista.map((x) => x.marca)) };
    },
  };
}

export function crearSincronizador(almacen, adaptador, enLinea = () => (typeof navigator === "undefined" ? true : navigator.onLine), alTerminar = null) {
  let corriendo = null;

  async function una() {
    const res = { subidos: 0, bajados: 0, rechazados: 0, sinNube: !adaptador, sinSesion: false, sinInternet: false, error: "" };
    if (!adaptador) return res;
    if (adaptador.listo === false) { res.sinSesion = true; return res; }
    if (!enLinea()) { res.sinInternet = true; return res; }
    try {
      for (const c of await almacen.cola()) {
        const d = await almacen.leer(c.coleccion, c.id);
        try {
          if (d) { await conTiempo(adaptador.subir(c.coleccion, d)); res.subidos++; }
        } catch (e) {
          // lo que las reglas no dejan (por ejemplo, un miembro) no se va a poder subir nunca: se saca de la cola
          if (!e || e.code !== "permission-denied") throw e;
          res.rechazados++;
        }
        await almacen.quitarDeCola(c.clave, c.actualizado);
      }
      const bajada = await conTiempo(adaptador.bajarDesde((await almacen.meta("ultimaBajada")) || 0), 60000);
      for (const { coleccion, doc } of bajada.cambios) if (await almacen.mezclar(coleccion, doc)) res.bajados++;
      await almacen.ponerMeta("ultimaBajada", bajada.marca);
    } catch (e) {
      // sin señal a medio camino: lo que no se subió sigue en la cola y se intenta otra vez
      res.error = (e && (e.code || e.message)) || "error";
    }
    if (res.bajados) almacen.avisar("nube");
    return res;
  }

  return {
    get conectado() { return !!adaptador; },
    get listo() { return !!adaptador && adaptador.listo !== false; },
    /** Sube y baja una vez (si ya está corriendo, espera esa misma vuelta). */
    sincronizar() {
      if (!corriendo) corriendo = una().then((r) => { if (alTerminar) alTerminar(r); return r; }).finally(() => { corriendo = null; });
      return corriendo;
    },
  };
}
