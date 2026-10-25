// Lo que cambia sin tocar el resto del programa.

/**
 * La nube donde se guardan los datos para que todos vean lo mismo.
 * null = todavía no hay nube: los datos se quedan solo en el aparato (falta que el dueño conteste p-SF1-nube).
 * Con Firebase quedaría así (los datos los da la consola de Firebase al crear la app web):
 *   export const NUBE = { tipo: "firebase", apiKey: "…", authDomain: "…", projectId: "…", appId: "…" };
 */
export const NUBE = null;

/** De dónde salen los anuncios del banner: los mismos de ARQUEO y Escaner (los sube «Publicidad ARQUEO.exe»). */
export const PUBLICIDAD = "https://raw.githubusercontent.com/bawilpascual-hue/arqueo-actualizaciones/main/publicidad/";
