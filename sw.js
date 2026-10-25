// El «service worker» del Fondo Familiar: guarda el programa en el aparato para que abra sin internet y se encarga
// de la actualización automática. IMPORTANTE: cada vez que se publique un cambio hay que subir VERSION (abajo);
// así a todos les sale «Hay una versión nueva» y con un toque se actualiza.

const VERSION = "1.1.0";
const CACHE = "fondo-familiar-" + VERSION;
const EXTERNO = "fondo-familiar-externo";
const ARCHIVOS = [
  "./", "index.html", "estilos.css", "manifest.webmanifest",
  "js/principal.js", "js/calendario.js", "js/cuentas.js", "js/textos.js", "js/licencia.js", "js/claves.js", "js/publicidad.js",
  "js/avisos.js", "js/fotos.js", "js/datos.js", "js/nube.js", "js/config.js", "js/whatsapp.js", "js/creador.js", "js/nube-firebase.js",
  "iconos/icono-192.png", "iconos/icono-512.png", "iconos/icono-180.png", "iconos/icono-maskable-512.png", "iconos/bawil_letras.png",
];

self.addEventListener("install", (e) => {
  // «reload» para no guardar una copia vieja que tenga el navegador
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ARCHIVOS.map((u) => new Request(u, { cache: "reload" })))));
});

// la página pide actualizar cuando la persona toca «Actualizar»
self.addEventListener("message", (e) => { if (e.data === "actualizar") self.skipWaiting(); });

self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE && k !== EXTERNO).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener("fetch", (e) => {
  const r = e.request;
  if (r.method !== "GET") return;
  const url = new URL(r.url);
  if (url.origin === location.origin) {
    if (url.pathname.includes("/pruebas/")) return;   // las pruebas siempre de internet
    if (r.mode === "navigate") { e.respondWith(caches.match("index.html").then((x) => x || fetch(r))); return; }
    e.respondWith(caches.match(r, { ignoreSearch: true }).then((x) => x || fetch(r)));
    return;
  }
  // la lista de anuncios la maneja la página (guarda su copia); las imágenes de los anuncios y las letras: de internet
  // y, sin señal, la última copia
  if (url.pathname.endsWith("publicidad.json")) return;
  // también los archivos de Firebase (www.gstatic.com), para que el programa abra sin señal
  if (url.hostname === "fonts.googleapis.com" || url.hostname === "fonts.gstatic.com" || url.hostname === "raw.githubusercontent.com" || url.hostname === "www.gstatic.com") {
    e.respondWith(caches.open(EXTERNO).then((c) => fetch(r).then((resp) => { if (resp.ok || resp.type === "opaque") c.put(r, resp.clone()); return resp; })
      .catch(() => c.match(r).then((x) => x || Response.error()))));
  }
});

// al tocar una notificación se abre el programa
self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  e.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((ls) => (ls.length ? ls[0].focus() : self.clients.openWindow("./"))));
});
