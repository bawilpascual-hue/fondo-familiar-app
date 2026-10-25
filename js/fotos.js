// Fotos desde la cámara o la galería. Se achican antes de guardarlas para que no llenen el celular
// (la del miembro a 320 px, los comprobantes y facturas a 1280 px).

export function escoger() {
  return new Promise((ok) => {
    const i = document.createElement("input");
    i.type = "file"; i.accept = "image/*";
    i.onchange = () => ok(i.files && i.files[0] ? i.files[0] : null);
    // si cierra sin escoger, algunos celulares no avisan: se queda esperando sin problema
    i.click();
  });
}

export function achicar(archivo, lado = 1280, calidad = 0.82) {
  return new Promise((ok, mal) => {
    const url = URL.createObjectURL(archivo), img = new Image();
    img.onload = () => {
      const k = Math.min(1, lado / Math.max(img.width, img.height));
      const c = document.createElement("canvas");
      c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
      c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      ok(c.toDataURL("image/jpeg", calidad));
    };
    img.onerror = () => { URL.revokeObjectURL(url); mal(new Error("No se pudo abrir esa foto.")); };
    img.src = url;
  });
}

/** Pide la foto y la devuelve ya achicada (o "" si no escogió nada). */
export async function tomar(lado) {
  const a = await escoger();
  return a ? achicar(a, lado) : "";
}
