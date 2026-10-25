// Lo que cambia sin tocar el resto del programa.

/**
 * El proyecto de Firebase del dueño (creado el 25/10/2026 con bawilpascual@gmail.com, plan Spark gratis).
 * Estos datos no son secretos (van dentro del programa): la seguridad la ponen las contraseñas y las reglas
 * (firebase/firestore.rules).
 */
export const FIREBASE = {
  apiKey: "AIzaSyBj3G7Bd1JQ2a_02PL8GoulwfjEQ9Qmn4A",
  authDomain: "fondo-familiar-8aee6.firebaseapp.com",
  projectId: "fondo-familiar-8aee6",
  storageBucket: "fondo-familiar-8aee6.firebasestorage.app",
  messagingSenderId: "212982567395",
  appId: "1:212982567395:web:20ba6810d3d605fca450d6",
};

/**
 * La nube donde se guardan los datos para que todos vean lo mismo (null = solo en el aparato).
 */
export const NUBE = { tipo: "firebase", ...FIREBASE };

/** De dónde salen los anuncios del banner: los mismos de ARQUEO y Escaner (los sube «Publicidad ARQUEO.exe»). */
export const PUBLICIDAD = "https://raw.githubusercontent.com/bawilpascual-hue/arqueo-actualizaciones/main/publicidad/";
