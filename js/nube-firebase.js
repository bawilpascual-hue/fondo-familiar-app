// La nube en Firebase (proyecto del dueño, ver FIREBASE en config.js).
//
// Cuentas: cada fondo tiene tres cuentas de Firebase Authentication, una por papel, con las mismas contraseñas
// del programa: «<código>-encargada», «<código>-suplente» y «<código>-miembros» @fondo-familiar.app (no son
// correos de verdad; nadie tiene que tener correo). El código es el del fondo sin el FF ni las rayas.
// Datos: fondos/<código>/docs/<colección>~<id> = { coleccion, doc, marca (hora del servidor) }.
// Las reglas (firebase/firestore.rules) dejan anotar solo a la encargada y la suplente; los miembros miran y
// pueden decir «de acuerdo».

import { nucleoCodigo } from "./licencia.js";

const VERSION_SDK = "10.14.1";
const sdk = (m) => "https://www.gstatic.com/firebasejs/" + VERSION_SDK + "/firebase-" + m + ".js";
const DOMINIO = "fondo-familiar.app";
const GUARDADO = "ff-nube-fondo";

export function correo(codigo, rol) { return nucleoCodigo(codigo).toLowerCase() + "-" + rol + "@" + DOMINIO; }
export function rolDeCorreo(c) { const m = /-(encargada|suplente|miembros)@/.exec(c || ""); return m ? m[1] : null; }

const PROPIOS = ["clave", "ya-existe", "sin-internet", "debil", "muchos", "permission-denied", "otro"];

/** Los errores de Firebase con los nombres que entiende el programa. */
export function traducir(e) {
  const c = (e && e.code) || "";
  if (PROPIOS.includes(c)) return e;
  const code = /invalid-credential|wrong-password|user-not-found|invalid-login|invalid-email|user-disabled/.test(c) ? "clave"
    : /email-already-in-use/.test(c) ? "ya-existe"
      : /network-request-failed|unavailable|deadline-exceeded/.test(c) ? "sin-internet"
        : /weak-password/.test(c) ? "debil"
          : /too-many-requests/.test(c) ? "muchos"
            : /permission-denied/.test(c) ? "permission-denied" : "otro";
  return Object.assign(new Error((e && e.message) || code), { code, original: c });
}

function leer() { try { return localStorage.getItem(GUARDADO) || ""; } catch { return ""; } }
function guardar(v) { try { if (v) localStorage.setItem(GUARDADO, v); else localStorage.removeItem(GUARDADO); } catch { /* sin espacio */ } }

export async function crearAdaptador(conf) {
  const [fa, fau, fs] = await Promise.all([import(sdk("app")), import(sdk("auth")), import(sdk("firestore"))]);
  const { tipo, ...opciones } = conf;
  const app = fa.initializeApp(opciones);
  const auth = fau.getAuth(app);
  const db = fs.getFirestore(app);
  // espera a saber si ya había una sesión guardada en este aparato
  let usuario = await new Promise((ok) => { const fin = fau.onAuthStateChanged(auth, (u) => { fin(); ok(u); }); });
  fau.onAuthStateChanged(auth, (u) => { usuario = u; });
  let fondo = leer();

  /** Una segunda conexión, para crear o cambiar otra cuenta sin cerrar la sesión de este aparato. */
  async function conOtra(fn) {
    const otra = fa.initializeApp(opciones, "ff-otra-" + Date.now());
    const a2 = fau.getAuth(otra);
    try {
      await fau.setPersistence(a2, fau.inMemoryPersistence);
      return await fn(a2);
    } finally {
      try { await fau.signOut(a2); } catch { /* ya estaba fuera */ }
      try { await fa.deleteApp(otra); } catch { /* nada */ }
    }
  }

  function ponerFondo(codigo) { fondo = nucleoCodigo(codigo); guardar(fondo); }

  return {
    nombre: "firebase",
    get listo() { return !!(usuario && fondo && (usuario.email || "").startsWith(fondo.toLowerCase() + "-")); },
    get rol() { return usuario ? rolDeCorreo(usuario.email) : null; },
    get fondo() { return fondo; },

    /** Entra a la nube del fondo con el papel y la contraseña (encargada, suplente o miembros). */
    async entrar(codigo, rol, clave) {
      try { await fau.signInWithEmailAndPassword(auth, correo(codigo, rol), clave); }
      catch (e) { throw traducir(e); }
      ponerFondo(codigo);
    },

    /**
     * Crea la cuenta de un papel. Con «sesion» este aparato queda dentro con ella (la encargada al crear el fondo).
     * Si ya existe y la contraseña es la misma, se da por buena (por si se repite después de un corte).
     */
    async crearCuenta(codigo, rol, clave, { sesion = false } = {}) {
      const c = correo(codigo, rol);
      const crear = async (a) => {
        try { await fau.createUserWithEmailAndPassword(a, c, clave); }
        catch (e) {
          const t = traducir(e);
          if (t.code !== "ya-existe") throw t;
          try { await fau.signInWithEmailAndPassword(a, c, clave); }
          catch { throw t; }
        }
      };
      if (sesion) { await crear(auth); ponerFondo(codigo); }
      else await conOtra(crear);
    },

    /** Cambia la contraseña de un papel (hace falta la actual). */
    async cambiarClave(codigo, rol, actual, nueva) {
      const c = correo(codigo, rol);
      try {
        if (usuario && usuario.email === c) {
          await fau.reauthenticateWithCredential(usuario, fau.EmailAuthProvider.credential(c, actual));
          await fau.updatePassword(usuario, nueva);
        } else {
          await conOtra(async (a) => {
            await fau.signInWithEmailAndPassword(a, c, actual);
            await fau.updatePassword(a.currentUser, nueva);
          });
        }
      } catch (e) { throw traducir(e); }
    },

    async salir() { try { await fau.signOut(auth); } catch { /* nada */ } fondo = ""; guardar(""); },

    async subir(coleccion, doc) {
      try {
        await fs.setDoc(fs.doc(db, "fondos", fondo, "docs", coleccion + "~" + doc.id),
          { coleccion, doc: JSON.parse(JSON.stringify(doc)), marca: fs.serverTimestamp() });
      } catch (e) { throw traducir(e); }
    },

    async bajarDesde(marca) {
      // se pide desde un minuto antes por si algo llegó a la nube con la hora un poquito atrasada (bajarlo dos veces no hace daño)
      const desde = fs.Timestamp.fromMillis(Math.max(0, (marca || 0) - 60000));
      let foto;
      try {
        foto = await fs.getDocs(fs.query(fs.collection(db, "fondos", fondo, "docs"), fs.where("marca", ">", desde), fs.orderBy("marca")));
      } catch (e) { throw traducir(e); }
      let nueva = marca || 0;
      const cambios = foto.docs.map((d) => {
        const x = d.data();
        if (x.marca && x.marca.toMillis) nueva = Math.max(nueva, x.marca.toMillis());
        return { coleccion: x.coleccion, doc: x.doc };
      }).filter((x) => x.coleccion && x.doc && x.doc.id);
      return { cambios, marca: nueva };
    },
  };
}
