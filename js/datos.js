// Dónde se guardan los datos: primero en el aparato (IndexedDB, que no se borra al cerrar), y cada cambio queda
// en una «cola» para subirlo a la nube cuando haya internet (ver nube.js). Así se puede anotar sin señal.
//
// Colecciones: «ajustes» (un solo documento, «fondo»), «miembros», «movimientos» (pagos, salidas y préstamos)
// y «fotos» (fotos de los miembros, comprobantes y facturas, aparte para que lo demás cargue rápido).
// Cada documento lleva «actualizado» (milisegundos): si el mismo documento cambia en dos aparatos, gana el más nuevo.

export const COLECCIONES = ["ajustes", "miembros", "movimientos", "fotos"];
const TIENDAS = [...COLECCIONES, "cola", "meta"];

export function idNuevo() {
  return Date.now().toString(36) + "-" + Array.from(crypto.getRandomValues(new Uint8Array(5)), (b) => b.toString(36).padStart(2, "0")).join("");
}

// ---------- los dos lugares donde se puede guardar

/** En el aparato, con IndexedDB (el programa de verdad). */
export function enAparato(nombre = "fondo-familiar") {
  let db = null;
  function abrir() {
    if (db) return Promise.resolve(db);
    return new Promise((ok, mal) => {
      const r = indexedDB.open(nombre, 1);
      r.onupgradeneeded = () => {
        for (const t of TIENDAS) if (!r.result.objectStoreNames.contains(t)) r.result.createObjectStore(t, { keyPath: t === "cola" ? "clave" : "id" });
      };
      r.onsuccess = () => { db = r.result; ok(db); };
      r.onerror = () => mal(r.error);
    });
  }
  function hacer(tienda, modo, fn) {
    return abrir().then((d) => new Promise((ok, mal) => {
      const tx = d.transaction(tienda, modo), r = fn(tx.objectStore(tienda));
      tx.oncomplete = () => ok(r && r.result);
      tx.onerror = () => mal(tx.error);
      tx.onabort = () => mal(tx.error);
    }));
  }
  return {
    todos: (t) => hacer(t, "readonly", (s) => s.getAll()),
    uno: (t, id) => hacer(t, "readonly", (s) => s.get(id)),
    poner: (t, obj) => hacer(t, "readwrite", (s) => { s.put(obj); }),
    quitar: (t, id) => hacer(t, "readwrite", (s) => { s.delete(id); }),
    borrarTodo: () => Promise.all(TIENDAS.map((t) => hacer(t, "readwrite", (s) => { s.clear(); }))),
  };
}

/** En memoria (para las pruebas). */
export function enMemoria() {
  const t = Object.fromEntries(TIENDAS.map((x) => [x, new Map()]));
  const llave = (tienda, obj) => (tienda === "cola" ? obj.clave : obj.id);
  const copia = (o) => (o == null ? o : JSON.parse(JSON.stringify(o)));
  return {
    todos: async (x) => [...t[x].values()].map(copia),
    uno: async (x, id) => copia(t[x].get(id)),
    poner: async (x, obj) => { t[x].set(llave(x, obj), copia(obj)); },
    quitar: async (x, id) => { t[x].delete(id); },
    borrarTodo: async () => { for (const x of TIENDAS) t[x].clear(); },
  };
}

// ---------- el almacén que usa el programa

export function crearAlmacen(guardado) {
  const estado = { ajustes: {}, miembros: new Map(), movimientos: new Map() };
  const oyentes = new Set();
  let cuantosEnCola = 0;

  function avisar(origen) { for (const fn of oyentes) { try { fn(origen); } catch (e) { console.error(e); } } }

  async function cargar() {
    estado.ajustes = (await guardado.uno("ajustes", "fondo")) || { id: "fondo" };
    estado.miembros = new Map((await guardado.todos("miembros")).map((x) => [x.id, x]));
    estado.movimientos = new Map((await guardado.todos("movimientos")).map((x) => [x.id, x]));
    cuantosEnCola = (await guardado.todos("cola")).length;
  }

  async function encolar(coleccion, doc) {
    await guardado.poner("cola", { clave: coleccion + "/" + doc.id, coleccion, id: doc.id, actualizado: doc.actualizado });
    cuantosEnCola = (await guardado.todos("cola")).length;
  }

  function aMemoria(coleccion, doc) {
    if (coleccion === "ajustes") estado.ajustes = doc;
    else if (coleccion === "miembros") estado.miembros.set(doc.id, doc);
    else if (coleccion === "movimientos") estado.movimientos.set(doc.id, doc);
  }

  /** Guarda un documento nuevo o cambiado (le pone id y fechas) y lo deja en la cola para la nube. */
  async function guardar(coleccion, doc) {
    const ahora = Date.now();
    const d = { ...doc, id: doc.id || idNuevo(), creado: doc.creado || ahora, actualizado: Math.max(ahora, (doc.actualizado || 0) + 1) };
    await guardado.poner(coleccion, d);
    aMemoria(coleccion, d);
    await encolar(coleccion, d);
    avisar("local");
    return d;
  }

  /** Cambia algunos campos de los ajustes del fondo. */
  function cambiarAjustes(cambios) { return guardar("ajustes", { ...estado.ajustes, ...cambios, id: "fondo" }); }

  /** Guarda una foto (como texto «data:image/jpeg;base64,…») y devuelve su id. */
  async function ponerFoto(datos) {
    const f = await guardar("fotos", { datos });
    return f.id;
  }
  async function foto(id) { const f = id ? await guardado.uno("fotos", id) : null; return f ? f.datos : ""; }

  /** Lo que viene de la nube: entra solo si es más nuevo que lo que hay aquí. Devuelve true si cambió algo. */
  async function mezclar(coleccion, remoto) {
    const local = await guardado.uno(coleccion, remoto.id);
    if (local && (local.actualizado || 0) >= (remoto.actualizado || 0)) return false;
    await guardado.poner(coleccion, remoto);
    aMemoria(coleccion, remoto);
    return true;
  }

  return {
    cargar, guardar, cambiarAjustes, ponerFoto, foto, mezclar,
    get ajustes() { return estado.ajustes; },
    get miembros() { return [...estado.miembros.values()].sort((a, b) => a.nombre.localeCompare(b.nombre)); },
    get movimientos() { return [...estado.movimientos.values()].sort((a, b) => (b.fecha + b.creado).localeCompare(a.fecha + a.creado)); },
    miembro: (id) => estado.miembros.get(id),
    movimiento: (id) => estado.movimientos.get(id),
    get pendientes() { return cuantosEnCola; },
    cola: () => guardado.todos("cola"),
    leer: (coleccion, id) => guardado.uno(coleccion, id),
    async quitarDeCola(clave, actualizado) {
      const c = await guardado.uno("cola", clave);
      if (c && c.actualizado <= actualizado) await guardado.quitar("cola", clave);
      cuantosEnCola = (await guardado.todos("cola")).length;
    },
    meta: async (id) => ((await guardado.uno("meta", id)) || {}).valor,
    ponerMeta: (id, valor) => guardado.poner("meta", { id, valor }),
    alCambiar(fn) { oyentes.add(fn); return () => oyentes.delete(fn); },
    avisar,
    /** Todo junto, para la copia de respaldo. */
    async copia() {
      const res = { programa: "Fondo Familiar", hecha: Date.now() };
      for (const c of COLECCIONES) res[c] = await guardado.todos(c);
      return res;
    },
    /** Deja el aparato vacío (para entrar a un fondo que ya está en la nube y bajarlo completo). */
    async reiniciar() {
      await guardado.borrarTodo();
      await cargar();
      avisar("copia");
    },
    /** Recupera una copia de respaldo (lo que hay se reemplaza). */
    async recuperar(copia) {
      if (!copia || copia.programa !== "Fondo Familiar") throw new Error("Ese archivo no es una copia del Fondo Familiar.");
      await guardado.borrarTodo();
      for (const c of COLECCIONES) for (const d of copia[c] || []) { await guardado.poner(c, d); await encolar(c, d); }
      await cargar();
      avisar("copia");
    },
  };
}
