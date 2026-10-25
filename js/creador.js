// La firma de quien hizo el programa (como en ARQUEO). Sale en la pantalla de entrar, en la de activar,
// en Ajustes («Acerca del programa») y al pie de cada recibo.

export const VERSION = "1.0";
export const PROGRAMA = "Fondo Familiar";
export const EMPRESA = "BAWIL COMPUSERVICE";
export const CONTACTO = "WhatsApp 829-696-3495";
/** El mismo WhatsApp con el código del país (1 = República Dominicana), solo números. */
export const WHATSAPP = "18296963495";

/** «Fondo Familiar v1.0 · Desarrollado por BAWIL COMPUSERVICE» */
export const FIRMA = PROGRAMA + " v" + VERSION + " · Desarrollado por " + EMPRESA;
export const FIRMA_COMPLETA = FIRMA + " · " + CONTACTO;
