/**
 * ¿Este correo tiene derecho a la tarifa institucional?
 *
 * ─────────────────────────────────────────────────────────────────────
 * POR QUÉ NO SE BUSCA «.edu» DENTRO DE LA CADENA
 * ─────────────────────────────────────────────────────────────────────
 *
 * Las universidades mexicanas NO usan `.edu.mx`. El correo general de la
 * UNAM es `@comunidad.unam.mx`, y `unam.edu` está suspendido. Un patrón
 * que buscara «.edu» le cobraría la tarifa de empresa (500) a media UNAM,
 * en silencio y sin que el usuario entendiera por qué.
 *
 * Y un `dominio.includes('unam.mx')` —la tentación opuesta— aceptaría
 * `notunam.mx` y `evil-unam.mx.attacker.com`, que no son la UNAM.
 *
 * Por eso la comparación es por SUFIJO DE DOMINIO con frontera de punto:
 * el dominio coincide si es exactamente la regla, o si termina en punto
 * más la regla. `comunidad.unam.mx` coincide con `unam.mx`;
 * `notunam.mx` no.
 *
 * Aquí no hay red, ni validación de la cuenta: esto decide qué PRECIO se
 * le muestra a alguien que escribe su correo. La validación real ocurre
 * después, por correo, entre personas.
 */

import { PRODUCTOS, porHora } from './pagos';

/**
 * Sufijos con tarifa institucional. Se guardan sin punto inicial; el
 * punto lo pone la comparación.
 *
 * Los cuatro últimos son genéricos (cubren universidades de fuera de la
 * lista); los anteriores existen precisamente porque sus instituciones no
 * caen bajo ningún genérico: `unam.mx`, `uam.mx`, `ipn.mx`, `colmex.mx`,
 * `ibero.mx` e `iteso.mx` no contienen «edu» por ningún lado.
 *
 * Esta lista SIEMPRE estará incompleta, y por eso la interfaz nunca
 * responde «no». Ver `MENSAJE_NO_ESTA_EN_LA_LISTA`.
 */
export const SUFIJOS_INSTITUCIONALES: readonly string[] = [
  // México
  'unam.mx',
  'uam.mx',
  'ipn.mx',
  'ciesas.edu.mx',
  'colmex.mx',
  'flacso.edu.mx',
  'ibero.mx',
  'iteso.mx',
  // Perú
  'unife.edu.pe',
  'pucp.edu.pe',
  'esan.edu.pe',
  // Genéricos
  'edu',
  'edu.mx',
  'edu.pe',
  'ac.uk',
];

/** Correo al que se enruta la universidad que no aparece en la lista. */
export const CONTACTO = 'first.contact@aideatext.ai';

/**
 * Lo que se le dice a quien no coincide. Nunca «no se puede»: la lista es
 * nuestra, no suya, y cada correo que llega por aquí le dice al dueño del
 * producto qué institución añadir.
 */
export const MENSAJE_NO_ESTA_EN_LA_LISTA =
  `¿Tu institución no aparece? Escríbenos a ${CONTACTO} y la agregamos.`;

/**
 * Extrae el dominio normalizado de un correo, o `null` si no lo parece.
 *
 * Se exporta para poder probar el reconocimiento aparte de la decisión de
 * precio.
 */
export function dominioDe(correo: string): string | null {
  const limpio = correo.trim().toLowerCase();
  const partes = limpio.split('@');
  // Exactamente una arroba: «a@b@unam.mx» no es un correo.
  if (partes.length !== 2) return null;
  const [usuario, resto] = partes;
  if (usuario === '') return null;
  // Un punto final es legal en un FQDN («unam.mx.») y designa el mismo
  // dominio; se quita para que no impida la coincidencia.
  const dominio = resto.replace(/\.+$/, '');
  if (!dominio.includes('.')) return null;
  // Sin espacios ni caracteres raros: si no parece un dominio, no lo es.
  if (!/^[a-z0-9.-]+$/.test(dominio)) return null;
  if (/\.\./.test(dominio)) return null;
  return dominio;
}

/**
 * `true` si el dominio del correo cae bajo alguno de los sufijos
 * institucionales, comparando en frontera de punto.
 *
 * Un `false` NO significa «no se puede»: significa «no está en la lista»,
 * y eso se resuelve escribiendo un correo.
 */
export function esInstitucional(correo: string): boolean {
  const dominio = dominioDe(correo);
  if (dominio === null) return false;
  return SUFIJOS_INSTITUCIONALES.some(
    (sufijo) => dominio === sufijo || dominio.endsWith('.' + sufijo)
  );
}

// ── Precios ──────────────────────────────────────────────────────────
// Ninguna cifra se escribe aquí: todas salen de `pagos.ts`, que a su vez
// copia lo que cobra Stripe. Antes vivían en este archivo como constantes
// propias, y el resultado fue que la página anunciaba «200 MXN por hasta 4
// horas» mientras el checkout cobraba 500 por esas mismas 4 horas. Un
// precio que se escribe en dos sitios acaba siendo dos precios.

/** Tramo corto: hasta una hora de audio. */
export const HORAS_TRAMO_CORTO = 1;
/** Tramo largo: hasta cuatro horas. Sale más barato por hora. */
export const HORAS_TRAMO_LARGO = 4;

export interface Tarifa {
  /** Si aplica el precio reducido. */
  institucional: boolean;
  /** Pesos por hasta `HORAS_TRAMO_CORTO` hora. */
  mxnCorto: number;
  /** Pesos por hasta `HORAS_TRAMO_LARGO` horas. */
  mxnLargo: number;
  /** Enlace de pago del tramo corto. */
  urlCorto: string;
  /** Enlace de pago del tramo largo. */
  urlLargo: string;
  /** Frase lista para mostrar. */
  mensaje: string;
}

/**
 * Qué tarifa le toca a un correo, con el texto que se le muestra.
 *
 * Es una función pura y sin DOM: devuelve texto plano, y quien la usa lo
 * inserta con `textContent`, no con `innerHTML`. Lo que escribe el
 * usuario nunca vuelve a la página como HTML.
 */
export function tarifaPara(correo: string): Tarifa {
  if (esInstitucional(correo)) {
    const corto = PRODUCTOS.audio1hEstudiante;
    const largo = PRODUCTOS.audio4hEstudiante;
    return {
      institucional: true,
      mxnCorto: corto.importeMxn,
      mxnLargo: largo.importeMxn,
      urlCorto: corto.url,
      urlLargo: largo.url,
      mensaje:
        `Tarifa institucional: ${corto.importeMxn} MXN por 1 hora de audio, ` +
        `o ${largo.importeMxn} MXN por hasta ${HORAS_TRAMO_LARGO} horas ` +
        `(${porHora(largo, HORAS_TRAMO_LARGO)} MXN la hora). Validamos el ` +
        `correo al responderte.`,
    };
  }
  const corto = PRODUCTOS.audio1hEmpresa;
  const largo = PRODUCTOS.audio4hEmpresa;
  return {
    institucional: false,
    mxnCorto: corto.importeMxn,
    mxnLargo: largo.importeMxn,
    urlCorto: corto.url,
    urlLargo: largo.url,
    mensaje:
      `Con este correo aplica la tarifa general: ${corto.importeMxn} MXN ` +
      `por 1 hora, o ${largo.importeMxn} MXN por hasta ` +
      `${HORAS_TRAMO_LARGO} horas. ${MENSAJE_NO_ESTA_EN_LA_LISTA}`,
  };
}
