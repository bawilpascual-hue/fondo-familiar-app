// La sincronización con la nube. Todo se anota primero en el aparato (datos.js) y queda en la cola; cuando hay
// internet, esto sube la cola y baja lo que anotaron los otros aparatos (la suplente, la computadora del dueño).
//
// La nube concreta va en un «adaptador» con dos funciones:
//   subir(coleccion, doc)      → guarda el documento en la nube
//   bajarDesde(marca)          → { cambios: [{ coleccion, doc }], marca } con lo que cambió en la nube después
//                                de «marca». La marca la pone la nube (no la hora de cada celular, que puede
//                                estar adelantada o atrasada); en Firebase es la hora del servidor.
// Mientras el dueño no escoja la nube (pregunta p-SF1-nube; la recomendada es Firebase), no hay adaptador y los
// datos se quedan solo en este aparato. Para conectarla: llenar NUBE en config.js y agregar su adaptador abajo.

import { NUBE } from "./config.js";

/** El adaptador de la nube configurada (o null si todavía no hay nube). */
export async function adaptadorConfigurado() {
  if (!NUBE || !NUBE.tipo) return null;
  if (NUBE.tipo === "firebase") {
    const m = await import("./nube-firebase.js");
    return m.crearAdaptador(NUBE);
  }
  return null;
}

/** Una nube de mentira en memoria, para las pruebas (varios almacenes pueden compartirla, como dos celulares). */
export function nubeDePrueba() {
  const docs = new Map();
  let caida = false, numero = 0;
  return {
    nombre: "prueba",
    docs,
    caer(si = true) { caida = si; },
    async subir(coleccion, doc) {
      if (caida) throw new Error("sin señal");
      const clave = coleccion + "/" + doc.id, hay = docs.get(clave);
      if (!hay || (hay.doc.actualizado || 0) < (doc.actualizado || 0)) docs.set(clave, { coleccion, doc: JSON.parse(JSON.stringify(doc)), marca: ++numero });
    },
    async bajarDesde(marca) {
      if (caida) throw new Error("sin señal");
      const lista = [...docs.values()].filter((x) => x.marca > (marca || 0));
      return { cambios: lista.map((x) => ({ coleccion: x.coleccion, doc: JSON.parse(JSON.stringify(x.doc)) })), marca: Math.max(marca || 0, ...lista.map((x) => x.marca)) };
    },
  };
}

export function crearSincronizador(almacen, adaptador, enLinea = () => (typeof navigator === "undefined" ? true : navigator.onLine)) {
  let corriendo = null;

  async function una() {
    const res = { subidos: 0, bajados: 0, sinNube: !adaptador, sinInternet: false, error: "" };
    if (!adaptador) return res;
    if (!enLinea()) { res.sinInternet = true; return res; }
    try {
      for (const c of await almacen.cola()) {
        const d = await almacen.leer(c.coleccion, c.id);
        if (d) await adaptador.subir(c.coleccion, d);
        await almacen.quitarDeCola(c.clave, c.actualizado);
        res.subidos++;
      }
      const bajada = await adaptador.bajarDesde((await almacen.meta("ultimaBajada")) || 0);
      for (const { coleccion, doc } of bajada.cambios) if (await almacen.mezclar(coleccion, doc)) res.bajados++;
      await almacen.ponerMeta("ultimaBajada", bajada.marca);
    } catch (e) {
      // sin señal a medio camino: lo que no se subió sigue en la cola y se intenta otra vez
      res.error = (e && e.message) || "error";
    }
    if (res.bajados) almacen.avisar("nube");
    return res;
  }

  return {
    get conectado() { return !!adaptador; },
    /** Sube y baja una vez (si ya está corriendo, espera esa misma vuelta). */
    sincronizar() {
      if (!corriendo) corriendo = una().finally(() => { corriendo = null; });
      return corriendo;
    },
  };
}
