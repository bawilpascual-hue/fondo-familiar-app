// Fondo Familiar · las pantallas. Todo lo que se anota pasa por el almacén (datos.js), que lo guarda en el aparato
// y lo deja listo para la nube (nube.js). Las cuentas salen de cuentas.js.

import * as cal from "./calendario.js";
import * as ct from "./cuentas.js";
import * as tx from "./textos.js";
import * as lic from "./licencia.js";
import * as claves from "./claves.js";
import * as pub from "./publicidad.js";
import * as av from "./avisos.js";
import { tomar } from "./fotos.js";
import { crearAlmacen, enAparato } from "./datos.js";
import { crearSincronizador, adaptadorConfigurado } from "./nube.js";
import { enlaceWhatsApp } from "./whatsapp.js";
import { FIRMA, CONTACTO, WHATSAPP, VERSION } from "./creador.js";

const $ = (id) => document.getElementById(id);
const hoy = () => cal.hoyISO();
const COLORES = ["#b4432a", "#1f7a5c", "#6b4fa0", "#c47a1b", "#2b6ea3", "#8a5a3c", "#3f7f6e", "#9a3b6e"];
const SESION = "ff-sesion";

let almacen, sinc, sesion = null, licenciaOk = false;
let vista = "cargando", volverA = "inicio", actual = null, movActual = null;
let pagoN = 1, pagoFoto = "", salidaFoto = "", nuevoFoto = null, editando = null, verBajas = false;
let pagosConocidos = new Set();

// ---------- ayudas para armar la pantalla

/** Crea un elemento: h("div", { className: "x", onclick }, "texto", otroElemento) */
function h(tag, props, ...hijos) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v == null || v === false) continue;
    if (k === "style" && typeof v === "object") Object.assign(el.style, v);
    else if (k.startsWith("--")) el.style.setProperty(k, v);
    else if (k in el && k !== "list") el[k] = v;
    else el.setAttribute(k, v === true ? "" : v);
  }
  for (const c of hijos.flat()) if (c != null && c !== false) el.append(c.nodeType ? c : String(c));
  return el;
}
function vaciar(el, ...hijos) { el.replaceChildren(...hijos.flat().filter((x) => x != null && x !== false)); }
function texto(id, t) { $(id).textContent = t; }

const A = () => almacen.ajustes;
const movs = () => almacen.movimientos;
const miembrosActivos = () => ct.activos(almacen.miembros);
const esPersonal = () => sesion && sesion.rol !== "miembro";
const nombrePeriodo = (n = 1) => cal.nombrePeriodo(A(), n);

function quienSoy() {
  if (!sesion) return "";
  if (sesion.rol === "encargada") return A().encargada || "Encargada";
  if (sesion.rol === "suplente") return (A().suplente || "Suplente") + " (suplente)";
  const m = almacen.miembro(sesion.miembro);
  return m ? m.nombre : "";
}

function color(id) { let s = 0; for (const c of String(id)) s = (s * 31 + c.charCodeAt(0)) >>> 0; return COLORES[s % COLORES.length]; }
function inicial(nombre) { return (String(nombre || "?").trim().charAt(0) || "?").toUpperCase(); }

const fotosCache = new Map();
async function verFoto(id) {
  if (!id) return "";
  if (!fotosCache.has(id)) fotosCache.set(id, await almacen.foto(id));
  return fotosCache.get(id);
}
/** La foto redonda de un miembro (con su inicial mientras no tenga foto). */
function fotoDe(m, grande) {
  const d = h("div", { className: "foto" + (grande ? " grande" : ""), "--c": color(m.id) }, inicial(m.nombre));
  if (m.foto) verFoto(m.foto).then((url) => { if (url) { d.style.backgroundImage = "url(" + url + ")"; d.textContent = ""; } });
  return d;
}

function avisoEn(id, t, clase = "aviso") { const el = $(id); el.className = clase; el.textContent = t; el.hidden = !t; }

let notifTimer = null;
function enPantalla(t) {
  texto("notif-txt", t); $("notif").hidden = false;
  clearTimeout(notifTimer); notifTimer = setTimeout(() => { $("notif").hidden = true; }, 5000);
}

function ponerWa(id, tel, t) { $(id).href = enlaceWhatsApp(tel, t); }

// ---------- navegación

const PESTANA = { inicio: "inicio", recordar: "inicio", pago: "inicio", salida: "inicio", miembros: "miembros", ficha: "miembros", nuevo: "miembros", prestamo: "miembros",
  historial: "historial", movimiento: "historial", ajustes: "ajustes", avisos: "ajustes", resumen: "ajustes" };
const SIN_SESION = ["cargando", "activar", "primera", "entrar"];
const VISTAS = [...document.querySelectorAll(".vista")].map((x) => x.id.slice(2));

function ir(v, { desde } = {}) {
  if (!SIN_SESION.includes(v)) {
    if (!licenciaOk) v = "activar";
    else if (!sesion) v = "entrar";
    else if (!esPersonal() && v !== "ficha") { v = "ficha"; actual = sesion.miembro; }
  }
  if (desde) volverA = desde;
  vista = v;
  for (const x of VISTAS) $("v-" + x).hidden = x !== v;
  const conPestanas = esPersonal() && !SIN_SESION.includes(v);
  $("pestanas").hidden = !conPestanas;
  document.querySelectorAll(".pestana").forEach((b) => b.setAttribute("aria-pressed", b.dataset.ir === PESTANA[v] ? "true" : "false"));
  pintar(v, true);
  const c = $("v-" + v).querySelector(".cuerpo"); if (c) c.scrollTop = 0;
}

/** Vuelve a pintar la pantalla que está a la vista (cuando cambian los datos). «nueva» = recién se entró a ella. */
function pintar(v = vista, nueva = false) {
  const p = {
    activar: pintarActivar, primera: () => {}, entrar: pintarEntrar, inicio: pintarInicio, recordar: pintarRecordar,
    miembros: pintarMiembros, ficha: pintarFicha, historial: pintarHistorial, movimiento: nueva ? () => { $("mv-aviso").hidden = true; pintarMovimiento(); } : pintarMovimiento,
    ajustes: nueva ? pintarAjustes : pintarDatos, avisos: pintarAvisos, resumen: nueva ? prepararResumen : pintarResumen,
    pago: nueva ? () => {} : pintarPago, salida: pintarHaySalida, nuevo: () => {}, prestamo: nueva ? prepararPrestamo : () => {},
  }[v];
  if (p) p();
}

document.addEventListener("click", (e) => {
  const b = e.target.closest("[data-ir], [data-volver]");
  if (!b) return;
  if (b.hasAttribute("data-volver")) { ir(volverA); return; }
  const v = b.dataset.ir;
  // desde el Inicio sale primero el que más debe; desde la ficha, ese miembro
  if (v === "pago") return abrirPago(vista === "inicio" ? null : actual, vista);
  if (v === "salida") prepararSalida();
  ir(v);
});

// ---------- arrancar

async function arrancar() {
  for (const el of document.querySelectorAll("[data-firma]")) { el.textContent = ""; el.append(FIRMA, h("br"), CONTACTO); }
  texto("a-version", "Fondo Familiar v" + VERSION);
  $("a-bawil").href = "https://wa.me/" + WHATSAPP + "?text=" + encodeURIComponent("Hola BAWIL, te escribo por el programa Fondo Familiar.");
  try {
    almacen = crearAlmacen(enAparato());
    await almacen.cargar();
  } catch (e) {
    vaciar($("v-cargando").querySelector(".cuerpo"), h("div", { className: "aviso mal" }, "No se pudo abrir el lugar donde se guardan los datos en este aparato (" + (e.message || e) + "). Si es una ventana privada (incógnito), ábrelo en una ventana normal."));
    return;
  }
  sinc = crearSincronizador(almacen, await adaptadorConfigurado().catch(() => null));
  pagosConocidos = new Set(movs().filter((x) => x.tipo === "pago").map((x) => x.id));
  almacen.alCambiar((origen) => { if (origen === "nube") entroDinero(); pintar(); pintarInternet(); });

  if (!A().licencia || !A().licencia.codigo) await almacen.cambiarAjustes({ licencia: { codigo: lic.codigoNuevo() } });
  licenciaOk = await lic.valida(A().licencia.codigo, A().licencia.clave || "");
  try { sesion = JSON.parse(localStorage.getItem(SESION) || "null"); } catch { sesion = null; }
  if (sesion && sesion.rol === "miembro" && !almacen.miembro(sesion.miembro)) sesion = null;

  if (!licenciaOk) ir("activar");
  else if (!A().claves || !A().claves.encargada) ir("primera");
  else if (!sesion) ir("entrar");
  else entrarComo(sesion);

  iniciarPublicidad();
  pintarInternet();
  window.addEventListener("online", subirAlVolver);
  window.addEventListener("offline", pintarInternet);
  document.addEventListener("visibilitychange", () => { if (!document.hidden) { sinc.sincronizar(); revisarAvisos(); if (vista === "inicio") pintarInicio(); } });
  setInterval(() => { revisarAvisos(); if (vista === "inicio") pintarInicio(); }, 10 * 60 * 1000);
  setInterval(() => sinc.sincronizar(), 2 * 60 * 1000);
  sinc.sincronizar();
}

function entrarComo(s) {
  sesion = s;
  try { localStorage.setItem(SESION, JSON.stringify(s)); } catch { /* sin espacio: queda abierta mientras no se cierre */ }
  if (s.rol === "miembro") { actual = s.miembro; ir("ficha"); } else ir("inicio");
  revisarAvisos();
}

function cerrarSesion() {
  sesion = null;
  try { localStorage.removeItem(SESION); } catch { /* nada */ }
  ir("entrar");
}

// ---------- internet y nube

function pintarInternet() {
  const sin = typeof navigator !== "undefined" && navigator.onLine === false;
  $("franja-sin").hidden = !sin;
  const n = sinc && sinc.conectado ? almacen.pendientes : 0;
  texto("franja-sin-txt", "Sin internet · lo que anotes se guarda en el celular" + (sinc && sinc.conectado ? " y se sube solo cuando vuelva la señal" : "") + (n ? " · " + n + " pendiente" + (n === 1 ? "" : "s") + " de subir" : ""));
  if (vista === "ajustes") pintarDatos();
}

async function subirAlVolver() {
  pintarInternet();
  const r = await sinc.sincronizar();
  if (r.subidos) enPantalla("Volvió la señal: se subieron " + r.subidos + " cambio" + (r.subidos === 1 ? "" : "s") + " guardados en el celular.");
  pintarInternet();
}

/** Cuando la nube trae pagos anotados en otro aparato, se le avisa a la encargada. */
function entroDinero() {
  const nuevos = movs().filter((x) => x.tipo === "pago" && !pagosConocidos.has(x.id));
  for (const p of nuevos) pagosConocidos.add(p.id);
  if (!esPersonal() || !av.conf(A()).entraDinero) return;
  for (const p of nuevos.filter((x) => x.por !== quienSoy() && !x.anulado)) {
    const m = almacen.miembro(p.miembro);
    av.notificar((m ? m.nombre : "Alguien") + " pagó " + tx.dinero(p.monto) + " (" + tx.como(p.como).toLowerCase() + "). El fondo tiene " + tx.dinero(ct.totales(movs()).fondo) + ".", enPantalla, "pago-" + p.id);
  }
}

function revisarAvisos() {
  if (!sesion || !licenciaOk) return;
  av.mostrar(av.avisosDeHoy({ ajustes: A(), miembros: almacen.miembros, movs: movs(), hoy: hoy(), hora: new Date().getHours(), sesion }), enPantalla);
}

// ---------- ACTIVAR

function pintarActivar() {
  const cod = A().licencia ? A().licencia.codigo : "";
  texto("l-codigo", cod);
  $("l-wa").href = "https://wa.me/" + WHATSAPP + "?text=" + encodeURIComponent(tx.pedirClave(cod, A().nombre));
}
$("l-copiar").addEventListener("click", async () => {
  try { await navigator.clipboard.writeText($("l-codigo").textContent); texto("l-copiar", "Copiado ✓"); }
  catch { texto("l-copiar", "Mantén el dedo sobre el código para copiarlo"); }
  setTimeout(() => texto("l-copiar", "Copiar código"), 2200);
});
$("l-activar").addEventListener("click", async () => {
  const clave = $("l-clave").value.trim();
  if (!clave) { avisoEn("l-aviso", "Pega la clave de activación primero."); $("l-clave").focus(); return; }
  if (!(await lic.valida(A().licencia.codigo, clave))) {
    avisoEn("l-aviso", "Esa clave no sirve para este fondo. Revisa que la copiaste completa y que es para el código de arriba.", "aviso mal");
    return;
  }
  await almacen.cambiarAjustes({ licencia: { ...A().licencia, clave: lic.enGrupos(clave), fecha: hoy() } });
  licenciaOk = true;
  $("l-clave").value = "";
  avisoEn("l-aviso", "✓ Activado.", "aviso ok");
  sinc.sincronizar();
  setTimeout(() => ir(A().claves && A().claves.encargada ? "entrar" : "primera"), 700);
});
$("l-copia").addEventListener("click", recuperarCopia);

// ---------- PRIMERA VEZ

$("pv-guardar").addEventListener("click", async () => {
  const enc = $("pv-encargada").value.trim(), c1 = $("pv-clave").value, cm = $("pv-clave-m").value;
  if (!enc) { avisoEn("pv-aviso", "Escribe el nombre de la encargada.", "aviso mal"); return; }
  if (!claves.sirve(c1) || !claves.sirve(cm)) { avisoEn("pv-aviso", "Las contraseñas tienen que tener al menos 4 letras o números.", "aviso mal"); return; }
  if (c1 === cm) { avisoEn("pv-aviso", "La de los miembros tiene que ser distinta a la de la encargada (si no, todos podrían anotar).", "aviso mal"); return; }
  await almacen.cambiarAjustes({
    nombre: $("pv-nombre").value.trim() || "Fondo Familiar", encargada: enc, cuota: tx.leerMonto($("pv-cuota").value) || 500,
    frecuencia: "quincenal", dias: [15, 30], tope: 5000, reglaMas: "avisar", cierre: "si", siguienteRecibo: 1001,
    claves: { encargada: await claves.nueva(c1), miembros: await claves.nueva(cm), suplente: null },
  });
  sinc.sincronizar();
  entrarComo({ rol: "encargada" });
});

// ---------- ENTRAR

function pintarEntrar() {
  document.querySelectorAll("[data-nombre-fondo]").forEach((x) => { x.textContent = A().nombre || "Fondo Familiar"; });
  const s = $("e-quien"), antes = s.value;
  vaciar(s, h("option", { value: "encargada" }, "La encargada" + (A().encargada ? " (" + A().encargada + ")" : "")),
    A().suplente && A().claves && A().claves.suplente ? h("option", { value: "suplente" }, "La suplente (" + A().suplente + ")") : null,
    miembrosActivos().map((m) => h("option", { value: "m:" + m.id }, m.nombre)));
  if (antes && [...s.options].some((o) => o.value === antes)) s.value = antes;
  pintarInstalar();
}
async function entrar() {
  const quien = $("e-quien").value, clave = $("e-clave").value, c = A().claves || {};
  if (!clave) { avisoEn("e-aviso", "Escribe la contraseña."); return; }
  const rol = quien.startsWith("m:") ? "miembro" : quien;
  const guardada = rol === "miembro" ? c.miembros : c[rol];
  if (!(await claves.coincide(clave, guardada))) { avisoEn("e-aviso", "Esa contraseña no es. Pruébala otra vez.", "aviso mal"); return; }
  $("e-clave").value = "";
  avisoEn("e-aviso", "La encargada entra con su contraseña y puede todo. Un miembro entra con la contraseña de los miembros y solo ve lo suyo.");
  entrarComo(rol === "miembro" ? { rol, miembro: quien.slice(2) } : { rol });
}
$("e-entrar").addEventListener("click", entrar);
$("e-clave").addEventListener("keydown", (e) => { if (e.key === "Enter") entrar(); });

// ---------- filas de las listas

function filaMiembro(m, det, { flecha = true, est } = {}) {
  const e = est || ct.estadoMiembro(m, movs(), A(), hoy());
  return h("button", { type: "button", className: "fila", onclick: () => { actual = m.id; ir("ficha"); } },
    fotoDe(m), h("div", { className: "txt" }, h("div", { className: "nom" }, m.nombre), h("div", { className: "det" }, det)),
    h("span", { className: "chip " + (e.debe ? "debe" : "dia") }, e.debe ? "Debe" : "Al día"),
    flecha ? h("span", { className: "flecha" }, "›") : null);
}

function filaMovimiento(x, clic = true) {
  const m = x.miembro ? almacen.miembro(x.miembro) : null;
  let titulo, det, chip, cara;
  if (x.tipo === "pago") {
    titulo = m ? m.nombre : "Pago"; det = tx.detallePago(x, A());
    chip = h("span", { className: "chip dia" }, "+ " + tx.dinero(x.monto));
    cara = m ? fotoDe(m) : h("div", { className: "foto", "--c": "var(--dia)" }, "+");
  } else {
    titulo = (x.tipo === "prestamo" ? "Préstamo · " : "Salida · ") + (m ? m.nombre : "gasto del fondo");
    det = cal.corto(x.fecha) + " · " + (x.tipo === "prestamo" ? cal.periodos(A(), x.nCuotas) + " de " + tx.dinero(x.porCuota) : x.motivo) +
      " · " + tx.como(x.de) + (x.nota ? " · " + x.nota : "") + (x.foto ? " · 📎 foto" : "");
    const espera = x.tipo === "salida" && x.estado === "esperando";
    chip = h("span", { className: "chip " + (espera ? "espera" : "debe") }, espera ? "Esperando" : "− " + tx.dinero(x.monto));
    cara = h("div", { className: "foto", "--c": "var(--debe)" }, "−");
  }
  if (x.por) det += " · anotó: " + x.por;
  if (x.anulado) det = "ANULADO · " + det;
  const props = { className: "fila" + (x.anulado ? " anulado" : "") };
  if (clic && esPersonal()) { props.type = "button"; props.onclick = () => { movActual = x.id; ir("movimiento"); }; }
  return h(clic && esPersonal() ? "button" : "div", props, cara, h("div", { className: "txt" }, h("div", { className: "nom" }, titulo), h("div", { className: "det" }, det)), chip);
}

// ---------- INICIO

function pintarInicio() {
  const a = A(), t = ct.totales(movs()), d = hoy();
  document.querySelectorAll("[data-nombre-fondo]").forEach((x) => { x.textContent = a.nombre || "Fondo Familiar"; });
  texto("i-fecha", cal.conDia(d, true));
  texto("i-total", "RD$ " + Math.round(t.fondo).toLocaleString("en-US"));
  texto("i-efectivo", tx.dinero(t.efectivo)); texto("i-transf", tx.dinero(t.transferencia));
  const prox = cal.proximaFecha(a, d);
  texto("i-prox", (prox === d ? "Hoy es día de pago" : "Próxima " + nombrePeriodo() + ": " + cal.conDia(prox)) + " · " + tx.dinero(a.cuota || 0) + " cada uno");
  const lista = miembrosActivos().map((m) => ({ m, est: ct.estadoMiembro(m, movs(), a, d) }));
  const deben = lista.filter((x) => x.est.debe > 0).sort((x, y) => y.est.debe - x.est.debe);
  texto("i-n-dia", lista.length - deben.length); texto("i-n-debe", deben.length);
  texto("i-t-debe", tx.dinero(deben.reduce((s, x) => s + x.est.montoDebe, 0)) + " en total");
  vaciar($("i-deben"), deben.length ? deben.map((x) => filaMiembro(x.m, "Debe " + tx.estadoTexto(x.est, a), { est: x.est }))
    : h("div", { className: "vacio" }, lista.length ? "Nadie debe. Todos al día." : "Todavía no hay miembros. Agrégalos en la pestaña Miembros."));
  const ult = movs().slice(0, 3);
  vaciar($("i-ultimos"), ult.length ? ult.map((x) => filaMovimiento(x)) : h("div", { className: "vacio" }, "Todavía no hay movimientos."));
  // las salidas que esperan que la mitad diga «de acuerdo»
  const esperan = movs().filter((x) => x.tipo === "salida" && x.estado === "esperando" && !x.anulado);
  $("i-esperan").hidden = !esperan.length;
  const nec = ct.acuerdosNecesarios(lista.length);
  vaciar($("i-esperan-lista"), esperan.map((x) => {
    const f = filaMovimiento(x);
    f.querySelector(".det").textContent = cal.corto(x.fecha) + " · " + tx.dinero(x.monto) + " · de acuerdo: " + (x.acuerdos || []).length + " de " + nec;
    return f;
  }));
  pintarTareas(deben);
}

/** «Para hoy»: los mensajes de WhatsApp que tocan hoy, ya escritos. */
function pintarTareas(deben) {
  const a = A(), c = av.conf(a), d = hoy(), tareas = [];
  if (c.canal !== "notificacion") {
    if (c.diaPago && av.ultimaFechaPago(a, d) === d) {
      tareas.push(h("a", { className: "boton wa chico", target: "_blank", rel: "noopener", href: enlaceWhatsApp("", "Hoy " + cal.conDia(d) + " toca la cuota del " + (a.nombre || "Fondo Familiar") + ". ¡Gracias a todos!") },
        "Avisar a todos que hoy toca la cuota (grupo de WhatsApp)"));
    }
    if (c.deben && deben.length && av.tocaRecordar(a, d)) tareas.push(h("button", { type: "button", className: "boton sec chico", onclick: () => ir("recordar") }, "🔔 Recordarles a los " + deben.length + " que deben"));
  }
  const dia = Number(d.slice(8));
  if (a.cierre !== "no" && dia <= 5) {
    const [y, m] = cal.sumarDias(d.slice(0, 8) + "01", -1).split("-").map(Number), clave = "ff-cierre-" + y + "-" + m;
    let hecho = false; try { hecho = !!localStorage.getItem(clave); } catch { /* nada */ }
    if (!hecho) tareas.push(h("button", { type: "button", className: "boton sec chico", onclick: () => { mesResumen = y + "-" + m; ir("resumen"); } }, "📊 Mandar el resumen de " + cal.nombreMes(y, m)));
  }
  $("i-tareas").hidden = !tareas.length;
  vaciar($("i-tareas-lista"), h("div", { className: "botones" }, tareas));
}

// ---------- RECORDAR

function pintarRecordar() {
  const a = A(), deben = ct.deudores(almacen.miembros, movs(), a, hoy());
  vaciar($("r-lista"), deben.length ? deben.map(({ m, est }) => h("div", { className: "fila" }, fotoDe(m),
    h("div", { className: "txt" }, h("div", { className: "nom" }, m.nombre), h("div", { className: "det" }, "Debe " + tx.estadoTexto(est, a) + (m.tel ? "" : " · sin teléfono"))),
    h("a", { className: "boton wa chico auto", target: "_blank", rel: "noopener", href: enlaceWhatsApp(m.tel, tx.recordatorio({ fondo: a.nombre, miembro: m, est, ajustes: a })) }, "WhatsApp")))
    : h("div", { className: "vacio" }, "Nadie debe, no hay a quién recordarle."));
  $("r-grupo").hidden = !deben.length;
  ponerWa("r-grupo", "", (a.nombre || "Fondo Familiar") + " · los que deben hoy:\n" + deben.map((x) => "• " + x.m.nombre + ": " + tx.estadoTexto(x.est, a)).join("\n"));
}

// ---------- MIEMBROS

function pintarMiembros() {
  const todos = almacen.miembros, act = ct.activos(todos), bajas = todos.filter((x) => x.activo === false);
  texto("m-cuantos", act.length + (act.length === 1 ? " persona" : " personas") + " · se pueden agregar más");
  const lista = verBajas ? bajas : act;
  vaciar($("m-lista"), lista.length ? lista.map((m) => {
    const est = ct.estadoMiembro(m, movs(), A(), hoy());
    return filaMiembro(m, (m.tel || "sin teléfono") + " · " + (verBajas ? "dado de baja" : tx.estadoTexto(est, A())), { est });
  }) : h("div", { className: "vacio" }, verBajas ? "No hay nadie dado de baja." : "Todavía no hay miembros. Toca «+ Agregar»."));
  $("m-ver-bajas").hidden = !bajas.length;
  texto("m-ver-bajas", verBajas ? "Ver los que están en el fondo" : "Ver los dados de baja (" + bajas.length + ")");
}
$("m-ver-bajas").addEventListener("click", () => { verBajas = !verBajas; pintarMiembros(); });
$("m-agregar").addEventListener("click", () => { prepararNuevo(null); ir("nuevo", { desde: "miembros" }); });

// ---------- FICHA

function pintarFicha() {
  const m = almacen.miembro(actual);
  if (!m) { if (esPersonal()) ir("miembros"); else cerrarSesion(); return; }
  const a = A(), d = hoy(), est = ct.estadoMiembro(m, movs(), a, d), personal = esPersonal();
  texto("f-titulo", personal ? "Miembro" : "Mi cuenta");
  $("f-atras").hidden = !personal; $("f-editar").hidden = !personal; $("f-salir").hidden = personal;
  $("f-fondo").hidden = personal; $("f-firma").hidden = personal;
  $("f-acciones").hidden = !personal; $("f-prestar").hidden = !personal || !!est.prestamo || m.activo === false;
  if (!personal) {
    texto("f-fondo-total", tx.dinero(ct.totales(movs()).fondo));
    const prox = cal.proximaFecha(a, d);
    texto("f-fondo-prox", (prox === d ? "Hoy es día de pago" : "Próxima " + nombrePeriodo() + ": " + cal.conDia(prox)) + " · tu cuota: " + tx.dinero(est.cuota));
  }
  const f = $("f-foto"); f.replaceWith(Object.assign(fotoDe(m, true), { id: "f-foto" }));
  texto("f-nombre", m.nombre + (m.activo === false ? " (dado de baja)" : ""));
  texto("f-tel", (m.tel || "sin teléfono") + " · paga desde el " + cal.largo(m.desde));
  texto("f-cuota", "Cuota: " + tx.dinero(est.cuota) + " por " + nombrePeriodo() + (est.adelantadas ? " · " + est.adelantadas + " pagadas por adelantado" : ""));
  texto("f-debe-t", est.debe ? "Debe" : "Estado");
  texto("f-debe", est.debe ? tx.estadoTexto(est, a) : "Nada · está al día");
  $("f-debe").style.color = est.debe ? "var(--debe)" : "var(--dia)";
  const chip = $("f-chip"); chip.className = "chip " + (est.debe ? "debe" : "dia"); chip.textContent = est.debe ? "Debe" : "Al día";
  texto("f-quinc-t", (personal ? "Sus " : "Tus ") + nombrePeriodo(2));
  vaciar($("f-quinc"), ct.cuadritos(m, est, a, d).map((q) => h("div", { className: "q " + q.estado },
    h("span", { className: "s" }, q.estado === "si" || q.estado === "adelantada" ? "✓" : q.estado === "no" ? "✗" : "·"), cal.corto(q.fecha))));
  texto("f-pagar", "Anotar un pago de " + m.nombre);
  $("f-recordar").hidden = !est.debe;
  ponerWa("f-recordar", m.tel, tx.recordatorio({ fondo: a.nombre, miembro: m, est, ajustes: a }));
  const pr = est.prestamo;
  vaciar($("f-prestamo"), pr ? [h("div", { style: { fontWeight: 800 } }, "Debe del préstamo: " + tx.dinero(pr.saldo)),
    h("div", { className: "gris" }, "Le prestaron " + tx.dinero(pr.monto) + " el " + cal.corto(pr.fecha) + " · devuelve " + tx.dinero(pr.porCuota) + " cada " + nombrePeriodo() + " junto con su cuota")]
    : h("div", { className: "gris", style: { fontSize: "13px" } }, "No tiene préstamos del fondo."));
  const suyos = movs().filter((x) => x.tipo === "pago" && x.miembro === m.id);
  vaciar($("f-pagos"), suyos.length ? suyos.map((p) => h(personal ? "button" : "div", {
    type: personal ? "button" : null, className: "fila" + (p.anulado ? " anulado" : ""), onclick: personal ? () => { movActual = p.id; ir("movimiento"); } : null },
  h("div", { className: "txt" }, h("div", { className: "nom" }, cal.corto(p.fecha) + " · " + tx.dinero(p.monto) + (p.anulado ? " (anulado)" : "")), h("div", { className: "det" }, tx.detallePago(p, a) + (p.recibo ? " · recibo " + p.recibo : "")))))
    : h("div", { className: "vacio" }, "Todavía no tiene pagos anotados."));
  // un miembro puede decir «de acuerdo» a las salidas grandes
  const esperan = personal ? [] : movs().filter((x) => x.tipo === "salida" && x.estado === "esperando" && !x.anulado);
  $("f-esperan").hidden = !esperan.length;
  vaciar($("f-esperan-lista"), esperan.map((x) => {
    const ya = (x.acuerdos || []).includes(m.id), q = x.miembro ? almacen.miembro(x.miembro) : null;
    return h("div", { className: "fila" }, h("div", { className: "txt" }, h("div", { className: "nom" }, tx.dinero(x.monto) + " para " + x.motivo.toLowerCase() + (q ? " de " + q.nombre : "")),
      h("div", { className: "det" }, (x.nota || "") + " · de acuerdo: " + (x.acuerdos || []).length + " de " + ct.acuerdosNecesarios(miembrosActivos().length))),
    ya ? h("span", { className: "chip dia" }, "✓ De acuerdo") : h("button", { type: "button", className: "boton chico auto", onclick: async () => {
      await almacen.guardar("movimientos", { ...x, acuerdos: [...(x.acuerdos || []), m.id] }); sinc.sincronizar();
    } }, "Estoy de acuerdo"));
  }));
}
$("f-editar").addEventListener("click", () => { prepararNuevo(actual); ir("nuevo", { desde: "ficha" }); });
$("f-salir").addEventListener("click", cerrarSesion);
$("f-pagar").addEventListener("click", () => abrirPago(actual, "ficha"));
$("f-prestar").addEventListener("click", () => ir("prestamo"));

// ---------- PAGO

function abrirPago(miembroId, desde) {
  const act = miembrosActivos();
  if (!act.length) { prepararNuevo(null); ir("nuevo", { desde: "miembros" }); avisoEn("n-aviso", "Primero agrega a los miembros; después se anotan sus pagos."); return; }
  let id = miembroId && almacen.miembro(miembroId) && almacen.miembro(miembroId).activo !== false ? miembroId : null;
  if (!id) { const deben = ct.deudores(act, movs(), A(), hoy()); id = (deben[0] || { m: act[0] }).m.id; }
  actual = id;
  vaciar($("p-quien"), act.map((m) => { const e = ct.estadoMiembro(m, movs(), A(), hoy()); return h("option", { value: m.id }, m.nombre + (e.debe ? " · debe " + e.debe : " · al día")); }));
  $("p-quien").value = id;
  $("p-fecha").value = hoy(); $("p-fecha").max = hoy();
  $("p-como").value = "efectivo";
  pagoFoto = ""; $("p-foto-ver").hidden = true; texto("p-foto", "📎 Poner foto del comprobante (si fue transferencia)");
  $("p-prestamo").checked = true;
  $("p-formulario").hidden = false; $("p-hecho").hidden = true; $("p-error").hidden = true;
  pagoN = 1;
  ir("pago", { desde: desde || vista });
  pintarPago();
}

function pintarPago() {
  const m = almacen.miembro($("p-quien").value); if (!m) return;
  const a = A(), est = ct.estadoMiembro(m, movs(), a, hoy()), per = (n) => cal.periodos(a, n);
  texto("p-debe", est.debe ? tx.estadoTexto(est, a) : "Nada · está al día (este pago queda adelantado)");
  const opciones = [
    { n: 1, t: "1 " + nombrePeriodo() },
    { n: 2, t: est.debe ? per(2) + (est.debe === 2 ? " (todo)" : "") : "Adelantar 2" },
    est.debe > 2 ? { n: est.debe, t: "Todo lo que debe" } : { n: 3, t: est.debe ? per(3) : "Adelantar 3" },
  ];
  if (!opciones.some((o) => o.n === pagoN)) pagoN = 1;
  vaciar($("p-cuantas"), opciones.map((o) => h("button", { type: "button", "aria-pressed": o.n === pagoN ? "true" : "false", onclick: () => { pagoN = o.n; pintarPago(); } },
    o.t, h("small", null, tx.dinero(o.n * est.cuota) + (o.n > 3 ? " · " + per(o.n) : "")))));
  const pr = est.prestamo;
  $("p-prestamo-marca").hidden = !pr;
  const calc = ct.calcularPago(est, pagoN, $("p-prestamo").checked);
  if (pr) texto("p-prestamo-txt", "Además devuelve " + tx.dinero(Math.min(pr.saldo, pagoN * pr.porCuota)) + " de su préstamo (le quedan " + tx.dinero(pr.saldo) + ")");
  texto("p-total", "Recibes en total: " + tx.dinero(calc.total) + (calc.devolucion ? " (" + tx.dinero(calc.cuotas) + " de cuotas + " + tx.dinero(calc.devolucion) + " del préstamo)" : ""));
}
$("p-quien").addEventListener("change", () => { actual = $("p-quien").value; pagoN = 1; pintarPago(); });
$("p-prestamo").addEventListener("change", pintarPago);
$("p-foto").addEventListener("click", async () => {
  if (pagoFoto) { pagoFoto = ""; $("p-foto-ver").hidden = true; texto("p-foto", "📎 Poner foto del comprobante (si fue transferencia)"); return; }
  try { pagoFoto = await tomar(1280); } catch (e) { avisoEn("p-error", e.message, "aviso mal"); }
  if (pagoFoto) { $("p-foto-ver").src = pagoFoto; $("p-foto-ver").hidden = false; texto("p-foto", "✓ Comprobante puesto (tocar para quitarlo)"); }
});
$("p-guardar").addEventListener("click", async () => {
  const m = almacen.miembro($("p-quien").value), a = A();
  const fecha = $("p-fecha").value;
  if (!m) return;
  if (!fecha || fecha > hoy()) { avisoEn("p-error", "Revisa la fecha (no puede ser después de hoy).", "aviso mal"); return; }
  const est = ct.estadoMiembro(m, movs(), a, hoy()), calc = ct.calcularPago(est, pagoN, $("p-prestamo").checked);
  $("p-guardar").disabled = true;
  try {
    const foto = pagoFoto ? await almacen.ponerFoto(pagoFoto) : "";
    const numero = a.siguienteRecibo || 1001;
    await almacen.cambiarAjustes({ siguienteRecibo: numero + 1 });
    let pago = { tipo: "pago", miembro: m.id, fecha, n: pagoN, cuotas: calc.cuotas, devolucion: calc.devolucion, prestamo: calc.devolucion ? est.prestamo.id : "",
      monto: calc.total, como: $("p-como").value, foto, recibo: numero, por: quienSoy() };
    pago = await almacen.guardar("movimientos", pago);
    pagosConocidos.add(pago.id);
    const despues = ct.estadoMiembro(m, movs(), a, hoy()), total = ct.totales(movs()).fondo;
    const texto_ = tx.recibo({ fondo: a.nombre, pago, miembro: m, estDespues: despues, totalFondo: total, ajustes: a });
    await almacen.guardar("movimientos", { ...pago, texto: texto_ });
    texto("p-aviso", "✓ Pago de " + m.nombre + " guardado: " + tx.dinero(pago.monto) + ". " + (despues.debe ? "Todavía debe " + tx.estadoTexto(despues, a) + "." : "Quedó al día.") + " El fondo ahora tiene " + tx.dinero(total) + ".");
    texto("p-recibo-txt", texto_);
    ponerWa("p-wa", m.tel, texto_);
    $("p-formulario").hidden = true; $("p-hecho").hidden = false;
    $("v-pago").querySelector(".cuerpo").scrollTop = 0;
    sinc.sincronizar();
  } finally { $("p-guardar").disabled = false; }
});
$("p-listo").addEventListener("click", () => ir(volverA === "ficha" ? "ficha" : "inicio"));

// ---------- AGREGAR / EDITAR MIEMBRO

function prepararNuevo(id) {
  editando = id;
  const m = id ? almacen.miembro(id) : null, a = A(), d = hoy();
  texto("n-titulo", m ? "Editar miembro" : "Agregar miembro");
  $("n-nombre").value = m ? m.nombre : ""; $("n-tel").value = m ? m.tel || "" : "";
  $("n-cuota").value = m ? m.cuota : a.cuota || 500;
  nuevoFoto = null;
  const f = $("n-foto");
  if (m) { f.replaceWith(Object.assign(fotoDe(m, true), { id: "n-foto" })); }
  else { f.className = "foto grande vacia"; f.style.removeProperty("--c"); f.style.backgroundImage = ""; f.textContent = "📷"; }
  // las fechas para escoger: dos de antes, la próxima (la de siempre) y dos después
  const antes = cal.fechasAnteriores(a, d, 2), prox = cal.proximasFechas(a, d, 3);
  const fechas = [...antes, ...prox];
  if (m && m.desde && !fechas.includes(m.desde)) fechas.unshift(m.desde);
  vaciar($("n-desde"), fechas.map((x) => h("option", { value: x }, cal.largo(x) + (x === prox[0] ? (x === d ? " (hoy)" : " (la próxima)") : x < d ? " (ya pasó: queda debiéndola)" : ""))));
  $("n-desde").value = m ? m.desde : prox[0];
  $("n-baja").hidden = !m;
  texto("n-baja", m && m.activo === false ? "Volverlo a poner en el fondo" : "Dar de baja (sale de la lista, su historial se queda)");
  avisoEn("n-aviso", m ? "Cambia lo que haga falta y dale «Guardar»." : "Se pueden agregar los que quieran entrar, sin límite. Cada uno queda con su foto, su nombre y su teléfono.");
}
$("n-foto-btn").addEventListener("click", async () => {
  let datos = "";
  try { datos = await tomar(320); } catch (e) { avisoEn("n-aviso", e.message, "aviso mal"); }
  if (!datos) return;
  nuevoFoto = datos;
  const f = $("n-foto"); f.className = "foto grande"; f.style.backgroundImage = "url(" + datos + ")"; f.textContent = "";
});
$("n-guardar").addEventListener("click", async () => {
  const nombre = $("n-nombre").value.trim();
  if (!nombre) { avisoEn("n-aviso", "Escribe el nombre para guardarlo.", "aviso mal"); $("n-nombre").focus(); return; }
  const cuota = tx.leerMonto($("n-cuota").value);
  if (!cuota) { avisoEn("n-aviso", "Escribe la cuota (por ejemplo 500).", "aviso mal"); return; }
  const antes = editando ? almacen.miembro(editando) : {};
  const foto = nuevoFoto ? await almacen.ponerFoto(nuevoFoto) : antes.foto || "";
  const m = await almacen.guardar("miembros", { ...antes, nombre, tel: $("n-tel").value.trim(), cuota, desde: $("n-desde").value, foto, activo: antes.activo !== false });
  actual = m.id;
  avisoEn("n-aviso", "✓ " + nombre + (editando ? " quedó guardado." : " quedó en la lista. Paga desde el " + cal.largo(m.desde) + "."), "aviso ok");
  sinc.sincronizar();
  setTimeout(() => ir(editando ? "ficha" : "miembros"), 900);
});
$("n-baja").addEventListener("click", async () => {
  const m = almacen.miembro(editando); if (!m) return;
  const volver = m.activo === false;
  if (!volver && !confirm("¿Dar de baja a " + m.nombre + "? Sale de la lista y deja de sumar deudas. Su historial se queda.")) return;
  await almacen.guardar("miembros", { ...m, activo: volver });
  sinc.sincronizar();
  ir(volver ? "ficha" : "miembros");
});

// ---------- SALIDA

function prepararSalida() {
  vaciar($("s-quien"), miembrosActivos().map((m) => h("option", { value: m.id }, m.nombre)), h("option", { value: "" }, "Gasto del fondo (no es para un miembro)"));
  $("s-motivo").selectedIndex = 0; $("s-otra-campo").hidden = true; $("s-otra").value = "";
  $("s-monto").value = ""; $("s-nota").value = ""; $("s-de").value = "efectivo";
  $("s-fecha").value = hoy(); $("s-fecha").max = hoy();
  salidaFoto = ""; $("s-foto-ver").hidden = true; texto("s-foto", "📎 Poner foto de la factura o la receta");
  $("s-avisar").hidden = true; $("s-guardar").hidden = false;
  const a = A();
  avisoEn("s-aviso", "Cada salida queda en el historial con quién la recibió, para qué, cuánto y de dónde salió." +
    (a.reglaMas === "directo" ? "" : " Regla: hasta " + tx.dinero(a.tope ?? 5000) + " sale directo; más de eso, " + (a.reglaMas === "acuerdo" ? "la mitad de los miembros tiene que decir «de acuerdo»." : "se les avisa a todos los miembros.")));
}
function pintarHaySalida() {
  const t = ct.totales(movs());
  texto("s-hay", tx.dinero(t.fondo) + " · efectivo " + tx.dinero(t.efectivo) + " · transferencia " + tx.dinero(t.transferencia));
}
$("s-motivo").addEventListener("change", () => { $("s-otra-campo").hidden = $("s-motivo").value !== "otra"; });
$("s-foto").addEventListener("click", async () => {
  if (salidaFoto) { salidaFoto = ""; $("s-foto-ver").hidden = true; texto("s-foto", "📎 Poner foto de la factura o la receta"); return; }
  try { salidaFoto = await tomar(1280); } catch (e) { avisoEn("s-aviso", e.message, "aviso mal"); }
  if (salidaFoto) { $("s-foto-ver").src = salidaFoto; $("s-foto-ver").hidden = false; texto("s-foto", "✓ Foto puesta (tocar para quitarla)"); }
});
$("s-guardar").addEventListener("click", async () => {
  const a = A(), monto = tx.leerMonto($("s-monto").value), de = $("s-de").value, fecha = $("s-fecha").value;
  if (!monto) { avisoEn("s-aviso", "Escribe la cantidad que sale.", "aviso mal"); $("s-monto").focus(); return; }
  if (!fecha || fecha > hoy()) { avisoEn("s-aviso", "Revisa la fecha (no puede ser después de hoy).", "aviso mal"); return; }
  const hay = ct.disponible(ct.totales(movs()), de);
  if (monto > hay) { avisoEn("s-aviso", "No alcanza: en " + (de === "efectivo" ? "efectivo" : "transferencia") + " hay " + tx.dinero(hay) + ".", "aviso mal"); return; }
  let motivo = $("s-motivo").value === "otra" ? $("s-otra").value.trim() : $("s-motivo").value.replace(/ \(.*\)$/, "");
  if (!motivo) { avisoEn("s-aviso", "Escribe para qué es.", "aviso mal"); $("s-otra").focus(); return; }
  const regla = ct.reglaRetiro(a, monto);
  $("s-guardar").disabled = true;
  try {
    const foto = salidaFoto ? await almacen.ponerFoto(salidaFoto) : "";
    const s = await almacen.guardar("movimientos", { tipo: "salida", miembro: $("s-quien").value, motivo, monto, de, fecha, nota: $("s-nota").value.trim(), foto, por: quienSoy(),
      estado: regla === "acuerdo" ? "esperando" : "hecha", acuerdos: [] });
    sinc.sincronizar();
    const q = s.miembro ? almacen.miembro(s.miembro) : null, quedan = ct.totales(movs()).fondo;
    if (regla === "directo") {
      avisoEn("s-aviso", "✓ Salida guardada: " + tx.dinero(monto) + " (" + motivo + "). El fondo queda en " + tx.dinero(quedan) + ".", "aviso ok");
      setTimeout(() => ir("historial"), 1600);
      return;
    }
    const nec = ct.acuerdosNecesarios(miembrosActivos().length);
    avisoEn("s-aviso", regla === "acuerdo"
      ? "Quedó anotada, esperando: como pasa de " + tx.dinero(a.tope ?? 5000) + ", tienen que decir «de acuerdo» " + nec + " miembros. Todavía no se descuenta del fondo."
      : "✓ Salida guardada: " + tx.dinero(monto) + ". Como pasa de " + tx.dinero(a.tope ?? 5000) + ", mándales el aviso a todos.", "aviso ok");
    texto("s-avisar-txt", regla === "acuerdo" ? "Mándales el aviso; cuando contesten, márcalos en el Historial (toca la salida) o que lo marquen ellos al entrar." : "El mensaje ya va escrito; escoge el grupo de la familia.");
    ponerWa("s-avisar-grupo", "", tx.avisoRetiro({ fondo: a.nombre, salida: s, quien: q ? q.nombre : "", hay: quedan, acuerdo: regla === "acuerdo" }));
    $("s-avisar").hidden = false; $("s-guardar").hidden = true;
  } finally { $("s-guardar").disabled = false; }
});

// ---------- PRÉSTAMO

function prepararPrestamo() {
  const m = almacen.miembro(actual);
  texto("pr-quien", m ? m.nombre : "");
  $("pr-monto").value = ""; $("pr-fecha").value = hoy(); $("pr-fecha").max = hoy(); $("pr-guardar").hidden = false;
  calcPrestamo();
  avisoEn("pr-aviso", "El préstamo sale del fondo como una salida y se va devolviendo con los pagos: cada " + nombrePeriodo() + ", al anotar su cuota, el programa suma también la parte del préstamo. En su ficha se ve cuánto le falta.");
}
function calcPrestamo() {
  const monto = tx.leerMonto($("pr-monto").value), n = Number($("pr-cuotas").value);
  texto("pr-calc", monto ? "Devolvería " + tx.dinero(ct.porCuotaPrestamo(monto, n)) + " cada " + nombrePeriodo() + " durante " + cal.periodos(A(), n) + ", junto con su cuota." : "Escribe cuánto se le presta.");
}
$("pr-monto").addEventListener("input", calcPrestamo);
$("pr-cuotas").addEventListener("change", calcPrestamo);
$("pr-guardar").addEventListener("click", async () => {
  const m = almacen.miembro(actual), monto = tx.leerMonto($("pr-monto").value), n = Number($("pr-cuotas").value), de = $("pr-de").value, fecha = $("pr-fecha").value;
  if (!m) return;
  if (!monto) { avisoEn("pr-aviso", "Escribe cuánto se le presta.", "aviso mal"); return; }
  if (!fecha || fecha > hoy()) { avisoEn("pr-aviso", "Revisa la fecha (no puede ser después de hoy).", "aviso mal"); return; }
  if (ct.prestamoDe(m.id, movs())) { avisoEn("pr-aviso", m.nombre + " ya tiene un préstamo; primero lo termina de devolver.", "aviso mal"); return; }
  const hay = ct.disponible(ct.totales(movs()), de);
  if (monto > hay) { avisoEn("pr-aviso", "No alcanza: en " + de + " hay " + tx.dinero(hay) + ".", "aviso mal"); return; }
  const porCuota = ct.porCuotaPrestamo(monto, n);
  await almacen.guardar("movimientos", { tipo: "prestamo", miembro: m.id, monto, nCuotas: n, porCuota, de, fecha, por: quienSoy() });
  sinc.sincronizar();
  avisoEn("pr-aviso", "✓ Préstamo guardado. " + m.nombre + " devuelve " + tx.dinero(porCuota) + " por " + nombrePeriodo() + ".", "aviso ok");
  $("pr-guardar").hidden = true;
  setTimeout(() => ir("ficha"), 1400);
});

// ---------- HISTORIAL

function pintarHistorial() {
  const t = ct.totales(movs()), f = $("h-filtro").value;
  texto("h-entro", tx.dinero(t.entro)); texto("h-salio", tx.dinero(t.salio));
  const lista = movs().filter((x) => f === "todo" || (f === "pago" ? x.tipo === "pago" : x.tipo !== "pago"));
  vaciar($("h-lista"), lista.length ? lista.map((x) => filaMovimiento(x)) : h("div", { className: "vacio" }, "Todavía no hay movimientos."));
}
$("h-filtro").addEventListener("change", pintarHistorial);

// ---------- UN MOVIMIENTO (ver, reenviar el recibo, anular, «de acuerdo»)

function pintarMovimiento() {
  const x = almacen.movimiento(movActual);
  if (!x) { ir("historial"); return; }
  const a = A(), m = x.miembro ? almacen.miembro(x.miembro) : null, l = [];
  texto("mv-titulo", x.tipo === "pago" ? "Pago" : x.tipo === "prestamo" ? "Préstamo" : "Salida");
  if (x.tipo === "pago") l.push(x.texto || tx.detallePago(x, a) + "\n" + tx.dinero(x.monto));
  else {
    l.push((x.tipo === "prestamo" ? "Préstamo para " : "Salida para ") + (m ? m.nombre : "gasto del fondo"));
    l.push("Fecha: " + cal.largo(x.fecha));
    l.push("Cantidad: " + tx.dinero(x.monto) + " (" + tx.como(x.de) + ")");
    if (x.tipo === "prestamo") l.push("Se devuelve en " + cal.periodos(a, x.nCuotas) + " de " + tx.dinero(x.porCuota));
    else l.push("Para qué: " + x.motivo);
    if (x.nota) l.push("Nota: " + x.nota);
    if (x.estado === "esperando") l.push("Esperando «de acuerdo»: " + (x.acuerdos || []).length + " de " + ct.acuerdosNecesarios(miembrosActivos().length));
    l.push("Anotó: " + (x.por || ""));
  }
  if (x.anulado) l.push("\nANULADO por " + (x.anuladoPor || "") + " el " + cal.largo(x.anuladoEn || x.fecha));
  texto("mv-txt", l.join("\n"));
  const img = $("mv-foto"); img.hidden = true;
  if (x.foto) verFoto(x.foto).then((u) => { if (u && movActual === x.id) { img.src = u; img.hidden = false; } });
  const b = [];
  if (x.tipo === "pago" && !x.anulado && m) b.push(h("a", { className: "boton wa", target: "_blank", rel: "noopener", href: enlaceWhatsApp(m.tel, x.texto || "") }, "Enviar el recibo por WhatsApp otra vez"));
  if (x.tipo === "salida" && x.estado === "esperando" && !x.anulado) {
    const nec = ct.acuerdosNecesarios(miembrosActivos().length);
    b.push(h("div", { className: "tarjeta" }, h("h3", null, "¿Quién dijo «de acuerdo»?"), h("div", { className: "lista" }, miembrosActivos().map((mm) => {
      const c = h("input", { type: "checkbox", checked: (x.acuerdos || []).includes(mm.id) });
      c.addEventListener("change", async () => {
        const otros = (x.acuerdos || []).filter((i) => i !== mm.id);
        await almacen.guardar("movimientos", { ...x, acuerdos: c.checked ? [...otros, mm.id] : otros }); sinc.sincronizar();
      });
      return h("label", { className: "fila marca" }, h("div", { className: "txt" }, h("div", { className: "nom" }, mm.nombre)), c);
    }))));
    const listo = (x.acuerdos || []).length >= nec;
    b.push(h("button", { type: "button", className: "boton rojo", disabled: !listo, onclick: async () => {
      const hay = ct.disponible(ct.totales(movs()), x.de);
      if (x.monto > hay) { avisoEn("mv-aviso", "No alcanza: en " + x.de + " hay " + tx.dinero(hay) + ".", "aviso mal"); return; }
      await almacen.guardar("movimientos", { ...x, estado: "hecha" }); sinc.sincronizar();
      avisoEn("mv-aviso", "✓ Se sacó el dinero. El fondo queda en " + tx.dinero(ct.totales(movs()).fondo) + ".", "aviso ok");
    } }, listo ? "Ya dijeron «de acuerdo»: sacar el dinero" : "Faltan " + (nec - (x.acuerdos || []).length) + " por decir «de acuerdo»"));
  }
  if (!x.anulado) b.push(h("button", { type: "button", className: "boton sec chico", onclick: async () => {
    // si se anula un pago cuyo dinero ya se usó, esa parte del fondo queda en negativo: se avisa antes
    const t = ct.totales(movs()), donde = x.tipo === "pago" ? x.como : x.de, queda = ct.disponible(t, donde) - (x.tipo === "pago" && ct.cuenta(x) ? x.monto : 0);
    const ojo = queda < 0 ? "\n\nOjo: en " + donde + " quedaría " + tx.dinero(queda) + " (ese dinero ya se usó en otra cosa)." : "";
    if (!confirm("¿Anular este movimiento? Se queda en el historial tachado y deja de contar en el fondo." + ojo)) return;
    await almacen.guardar("movimientos", { ...x, anulado: true, anuladoPor: quienSoy(), anuladoEn: hoy() }); sinc.sincronizar();
    avisoEn("mv-aviso", "Anulado. Ya no cuenta en el fondo.", "aviso ok");
  } }, x.tipo === "salida" && x.estado === "esperando" ? "No se hizo (cancelarla)" : "Anular (se anotó por error)"));
  vaciar($("mv-botones"), b);
}

// ---------- AJUSTES

function opcionesDias(sel, valor) {
  vaciar($(sel), Array.from({ length: 31 }, (_, i) => h("option", { value: i + 1 }, "El " + (i + 1) + (i + 1 >= 29 ? " (o el último del mes)" : ""))));
  $(sel).value = valor;
}
function pintarFrecuencia() {
  const f = $("a-frecuencia").value;
  $("a-dias-q").hidden = f !== "quincenal"; $("a-dias-s").hidden = f !== "semanal"; $("a-dias-m").hidden = f !== "mensual";
}
function pintarAjustes() {
  const a = A(), r = cal.reglas(a);
  $("a-nombre").value = a.nombre || "Fondo Familiar";
  $("a-cuota").value = a.cuota || 500;
  $("a-frecuencia").value = r.frecuencia;
  opcionesDias("a-dia1", r.dias[0]); opcionesDias("a-dia2", r.dias[1] || 30); opcionesDias("a-dia-mes", r.diaMes);
  $("a-dia-semana").value = String(r.diaSemana);
  pintarFrecuencia();
  $("a-encargada").value = a.encargada || ""; $("a-suplente").value = a.suplente || "";
  for (const id of ["a-clave", "a-clave-s", "a-clave-m"]) $(id).value = "";
  $("a-tope").value = (a.tope ?? 5000).toLocaleString("en-US");
  $("a-mas").value = a.reglaMas || "avisar";
  $("a-cierre").value = a.cierre || "si";
  $("a-aviso").hidden = true;
  // solo la encargada cambia las contraseñas de la encargada
  $("a-clave").disabled = sesion.rol !== "encargada";
  pintarDatos();
}
function pintarDatos() {
  const a = A();
  texto("a-licencia", "Código " + (a.licencia ? a.licencia.codigo : "") + (a.licencia && a.licencia.fecha ? " · clave puesta el " + a.licencia.fecha.split("-").reverse().join("/") : ""));
  texto("a-datos", sinc && sinc.conectado
    ? "Conectado a la nube: todos ven lo mismo." + (almacen.pendientes ? " Hay " + almacen.pendientes + " cambio(s) esperando señal para subir." : " Todo está subido.")
    : "Por ahora los datos se guardan solo en este aparato (falta conectar la nube para que los vean los demás). Guarda una copia de vez en cuando: si se borra el navegador o se pierde el celular, con la copia se recupera todo.");
  pintarInstalar();
}
$("a-frecuencia").addEventListener("change", pintarFrecuencia);
$("a-guardar").addEventListener("click", async () => {
  const a = A(), cambios = {
    nombre: $("a-nombre").value.trim() || "Fondo Familiar", cuota: tx.leerMonto($("a-cuota").value) || a.cuota || 500,
    frecuencia: $("a-frecuencia").value, dias: [Number($("a-dia1").value), Number($("a-dia2").value)].sort((x, y) => x - y),
    diaSemana: Number($("a-dia-semana").value), diaMes: Number($("a-dia-mes").value),
    encargada: $("a-encargada").value.trim() || a.encargada, suplente: $("a-suplente").value.trim(),
    tope: tx.leerMonto($("a-tope").value), reglaMas: $("a-mas").value, cierre: $("a-cierre").value,
  };
  if (cambios.frecuencia === "quincenal" && cambios.dias[0] === cambios.dias[1]) { avisoEn("a-aviso", "Los dos días de pago tienen que ser distintos.", "aviso mal"); return; }
  const c = { ...(a.claves || {}) }, c1 = $("a-clave").value, cs = $("a-clave-s").value, cm = $("a-clave-m").value;
  for (const v of [c1, cs, cm]) if (v && !claves.sirve(v)) { avisoEn("a-aviso", "Las contraseñas tienen que tener al menos 4 letras o números.", "aviso mal"); return; }
  if (c1) c.encargada = await claves.nueva(c1);
  if (cs) c.suplente = await claves.nueva(cs);
  if (cm) c.miembros = await claves.nueva(cm);
  if (cambios.suplente && !c.suplente) { avisoEn("a-aviso", "Ponle una contraseña a la suplente.", "aviso mal"); return; }
  if (!cambios.suplente) c.suplente = null;
  const cambioDias = cambios.frecuencia !== cal.reglas(a).frecuencia || String(cambios.dias) !== String(cal.reglas(a).dias);
  await almacen.cambiarAjustes({ ...cambios, claves: c });
  sinc.sincronizar();
  pintarAjustes();
  avisoEn("a-aviso", "✓ Cambios guardados." + (c1 || cs || cm ? " Las contraseñas nuevas ya sirven." : "") + (cambioDias ? " Las deudas se vuelven a contar con los días de pago nuevos." : ""), "aviso ok");
});
$("a-salir").addEventListener("click", cerrarSesion);
$("a-copia").addEventListener("click", async () => {
  const copia = await almacen.copia();
  const url = URL.createObjectURL(new Blob([JSON.stringify(copia)], { type: "application/json" }));
  const enlace = h("a", { href: url, download: "fondo-familiar-copia-" + hoy() + ".json" });
  document.body.append(enlace); enlace.click(); enlace.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
  avisoEn("a-aviso", "✓ Copia guardada en Descargas (fondo-familiar-copia-" + hoy() + ".json). Mándatela por WhatsApp o guárdala en otro lado.", "aviso ok");
});
$("a-recuperar").addEventListener("click", recuperarCopia);
function recuperarCopia() {
  const i = h("input", { type: "file", accept: ".json,application/json" });
  i.onchange = async () => {
    const f = i.files && i.files[0]; if (!f) return;
    try {
      const copia = JSON.parse(await f.text());
      if (!confirm("¿Recuperar esta copia? Lo que hay ahora en este aparato se reemplaza por lo de la copia.")) return;
      await almacen.recuperar(copia);
      fotosCache.clear();
      licenciaOk = !!(A().licencia && await lic.valida(A().licencia.codigo, A().licencia.clave || ""));
      sesion = null; try { localStorage.removeItem(SESION); } catch { /* nada */ }
      enPantalla("✓ Copia recuperada. Entra con tu contraseña.");
      ir(!licenciaOk ? "activar" : A().claves && A().claves.encargada ? "entrar" : "primera");
    } catch (e) { enPantalla("No se pudo recuperar: " + (e.message || "el archivo no sirve")); }
  };
  i.click();
}

// ---------- AVISOS

function pintarAvisos() {
  const c = av.conf(A());
  document.querySelectorAll("[data-aviso]").forEach((x) => { x.checked = !!c[x.dataset.aviso]; });
  $("av-canal").value = c.canal; $("av-hora").value = String(c.hora);
  const p = typeof Notification === "undefined" ? "no-hay" : Notification.permission;
  $("av-permiso").hidden = p === "granted";
  if (p === "denied") texto("av-permiso", "Los avisos están bloqueados en este aparato (se activan en los ajustes del navegador)");
}
async function guardarAvisos() {
  const c = { ...av.conf(A()) };
  document.querySelectorAll("[data-aviso]").forEach((x) => { c[x.dataset.aviso] = x.checked; });
  c.canal = $("av-canal").value; c.hora = Number($("av-hora").value);
  await almacen.cambiarAjustes({ avisos: c });
  sinc.sincronizar();
}
document.querySelectorAll("[data-aviso]").forEach((x) => x.addEventListener("change", guardarAvisos));
$("av-canal").addEventListener("change", guardarAvisos);
$("av-hora").addEventListener("change", guardarAvisos);
$("av-permiso").addEventListener("click", async () => {
  const r = await av.pedirPermiso();
  avisoEn("av-aviso", r === "granted" ? "✓ Listo: en este aparato salen los avisos." : r === "no-hay" ? "Este navegador no tiene avisos. En el iPhone hay que poner primero el icono en la pantalla de inicio." : "No se dio el permiso. Se puede dar después en los ajustes del navegador.", r === "granted" ? "aviso ok" : "aviso");
  pintarAvisos();
});
const EJEMPLOS = () => {
  const a = A(), deben = ct.deudores(almacen.miembros, movs(), a, hoy()), d = deben[0];
  return ["Hoy toca la cuota de " + tx.dinero(a.cuota || 500) + " del " + (a.nombre || "Fondo Familiar") + ". ¡Gracias por estar al día!",
    d ? d.m.nombre + ": debes " + tx.estadoTexto(d.est, a) + ". Puedes pagar en efectivo o por transferencia." : "Ana: debes 2 quincenas (RD$1,000). Puedes pagar en efectivo o por transferencia.",
    deben.length ? "Faltan por pagar: " + av.juntar(deben.map((x) => x.m.nombre)) + "." : "Faltan por pagar: nadie. ¡Todos al día!"];
};
let iEjemplo = 0;
$("av-probar").addEventListener("click", () => { const e = EJEMPLOS(); av.notificar(e[iEjemplo % e.length], enPantalla, "prueba"); iEjemplo++; });

// ---------- RESUMEN DEL MES (cierre de mes y PDF)

let mesResumen = "";
function prepararResumen() {
  const d = hoy(), [y, m] = d.split("-").map(Number), ops = [];
  for (let i = 0; i < 12; i++) { let mm = m - i, yy = y; while (mm < 1) { mm += 12; yy--; } ops.push(yy + "-" + mm); }
  vaciar($("rs-mes"), ops.map((x) => { const [yy, mm] = x.split("-").map(Number); return h("option", { value: x }, cal.nombreMes(yy, mm)); }));
  $("rs-mes").value = mesResumen && ops.includes(mesResumen) ? mesResumen : Number(d.slice(8)) <= 5 ? ops[1] : ops[0];
  mesResumen = "";
  pintarResumen();
}
function resumenElegido() {
  const [y, m] = $("rs-mes").value.split("-").map(Number);
  return ct.resumenMes(almacen.miembros, movs(), A(), y, m, hoy());
}
function pintarResumen() {
  if (!$("rs-mes").value) return;
  const r = resumenElegido(), t = tx.resumen({ fondo: A().nombre, r, ajustes: A() });
  texto("rs-txt", t);
  ponerWa("rs-wa", "", t);
}
$("rs-mes").addEventListener("change", pintarResumen);
$("rs-wa").addEventListener("click", () => { const [y, m] = $("rs-mes").value.split("-"); try { localStorage.setItem("ff-cierre-" + y + "-" + Number(m), "1"); } catch { /* nada */ } });
$("rs-pdf").addEventListener("click", () => {
  const a = A(), r = resumenElegido();
  const filas = r.movimientos.slice().sort((x, y) => x.fecha.localeCompare(y.fecha)).map((x) => {
    const m = x.miembro ? almacen.miembro(x.miembro) : null;
    const que = x.tipo === "pago" ? "Pago · " + cal.periodos(a, x.n) : x.tipo === "prestamo" ? "Préstamo" : "Salida · " + x.motivo;
    return h("tr", null, h("td", null, cal.corto(x.fecha)), h("td", null, m ? m.nombre : "Gasto del fondo"), h("td", null, que), h("td", null, tx.como(x.tipo === "pago" ? x.como : x.de)),
      h("td", { className: "der" }, (x.tipo === "pago" ? "+ " : "− ") + tx.dinero(x.monto)));
  });
  vaciar($("hoja-imprimir"),
    h("h1", null, (a.nombre || "Fondo Familiar") + " · Resumen de " + cal.nombreMes(r.anio, r.mes)),
    h("div", { style: { whiteSpace: "pre-line", fontSize: "13px" } }, tx.resumen({ fondo: a.nombre, r, ajustes: a })),
    h("table", null, h("thead", null, h("tr", null, h("th", null, "Fecha"), h("th", null, "Quién"), h("th", null, "Qué"), h("th", null, "Cómo"), h("th", { className: "der" }, "Cantidad"))),
      h("tbody", null, filas.length ? filas : h("tr", null, h("td", { colSpan: 5 }, "No hubo movimientos este mes.")))),
    h("p", { style: { fontSize: "11px", marginTop: "14px" } }, FIRMA + " · " + CONTACTO));
  window.print();
});

// ---------- PUBLICIDAD

let anuncios = [pub.DE_BAWIL], iAnuncio = 0;
function pintarAnuncio() {
  const a = anuncios[iAnuncio % anuncios.length], b = $("banner");
  b.className = "banner"; b.style.removeProperty("--c1"); b.style.removeProperty("--c2"); b.style.color = "";
  const tag = h("span", { className: "b-tag" }, "Publicidad");
  if (a.imagen) {
    b.classList.add("imagen");
    const img = h("img", { className: "todo", src: pub.imagenDe(a), alt: a.titulo || "Anuncio" });
    img.onerror = () => { a.imagen = ""; pintarAnuncio(); };
    vaciar(b, img, tag);
  } else if (a.logo) {
    b.style.setProperty("--c1", "#ffffff"); b.style.setProperty("--c2", "#e4eefa"); b.style.color = "#12304a";
    vaciar(b, h("span", { className: "b-logo", style: { background: "transparent", padding: 0 } }, h("img", { src: "iconos/bawil_letras.png", alt: "BAWIL Compuservice" })),
      h("span", { className: "b-txt" }, a.subtitulo), tag);
  } else {
    b.style.setProperty("--c1", a.color1 || "#1F6FB2"); b.style.setProperty("--c2", a.color2 || "#1E9E50");
    vaciar(b, h("span", { className: "b-txt" }, h("b", null, a.titulo), a.subtitulo || ""), tag);
  }
  b.setAttribute("aria-label", "Publicidad: " + (a.titulo || "") + " " + (a.subtitulo || ""));
}
async function cargarAnuncios() {
  const lista = await pub.actualizar();
  anuncios = [pub.DE_BAWIL, ...pub.vigentes(lista, hoy())];
  if (iAnuncio >= anuncios.length) iAnuncio = 0;
  pintarAnuncio();
}
function iniciarPublicidad() {
  anuncios = [pub.DE_BAWIL, ...pub.vigentes(pub.guardados(), hoy())];
  pintarAnuncio();
  cargarAnuncios();
  setInterval(() => { if (anuncios.length > 1) { iAnuncio = (iAnuncio + 1) % anuncios.length; if (vista === "inicio") pintarAnuncio(); } }, 6000);
  setInterval(cargarAnuncios, 60 * 60 * 1000);
}
$("banner").addEventListener("click", () => {
  const url = pub.destino(anuncios[iAnuncio % anuncios.length]);
  if (url) window.open(url, "_blank", "noopener");
});

// ---------- ICONO (instalar) Y ACTUALIZACIÓN AUTOMÁTICA

let pedidoInstalar = null;
const instalado = () => window.matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
const esIphone = () => /iphone|ipad|ipod/i.test(navigator.userAgent);
function pintarInstalar() {
  document.querySelectorAll("[data-instalar]").forEach((b) => { b.hidden = instalado() || (!pedidoInstalar && !esIphone()); });
  texto("a-icono-txt", instalado() ? "✓ Ya está puesto: se abre tocando el icono del Fondo Familiar."
    : esIphone() ? "En el iPhone: abre esta página en Safari, toca el botón Compartir (el cuadrito con la flecha) y escoge «Agregar a inicio»."
      : "En el celular (Chrome): menú ⋮ → «Agregar a la pantalla principal» o el botón de abajo. En la computadora (Chrome o Edge): el icono de instalar en la barra de direcciones; queda en el escritorio.");
}
window.addEventListener("beforeinstallprompt", (e) => { e.preventDefault(); pedidoInstalar = e; pintarInstalar(); });
window.addEventListener("appinstalled", () => { pedidoInstalar = null; pintarInstalar(); enPantalla("✓ Listo: el icono del Fondo Familiar quedó en la pantalla."); });
document.querySelectorAll("[data-instalar]").forEach((b) => b.addEventListener("click", async () => {
  if (pedidoInstalar) { pedidoInstalar.prompt(); await pedidoInstalar.userChoice.catch(() => null); pedidoInstalar = null; pintarInstalar(); }
  else if (esIphone()) enPantalla("En Safari: toca Compartir (el cuadrito con la flecha) y escoge «Agregar a inicio».");
}));

function registrarActualizacion() {
  if (!("serviceWorker" in navigator)) return;
  // se recarga solo cuando la persona tocó «Actualizar» (la primera vez que se instala no hace falta)
  let pidio = false;
  navigator.serviceWorker.addEventListener("controllerchange", () => { if (pidio) { pidio = false; location.reload(); } });
  navigator.serviceWorker.register("sw.js").then((reg) => {
    const avisar = (w) => {
      if (!w || !navigator.serviceWorker.controller) return;
      $("franja-nueva").hidden = false;
      $("actualizar").onclick = () => { pidio = true; texto("actualizar", "Actualizando…"); w.postMessage("actualizar"); };
    };
    avisar(reg.waiting);
    reg.addEventListener("updatefound", () => {
      const w = reg.installing;
      w.addEventListener("statechange", () => { if (w.state === "installed") avisar(w); });
    });
    // busca versión nueva al abrir, al volver al programa y cada hora
    setInterval(() => reg.update().catch(() => {}), 60 * 60 * 1000);
    document.addEventListener("visibilitychange", () => { if (!document.hidden) reg.update().catch(() => {}); });
  }).catch(() => { /* sin service worker: funciona igual, pero sin trabajar sin internet */ });
}

$("notif").addEventListener("click", () => { $("notif").hidden = true; });
registrarActualizacion();
arrancar();
