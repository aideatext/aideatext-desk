import { textos, type Textos } from '../textos';

/**
 * Medición del ahorro de tokens.
 *
 * El argumento de venta de DESK no puede ser una promesa redonda («ahorra
 * un 60%») escrita a mano en el HTML: sería un número inventado, y este
 * producto vende justamente que lo que afirma se puede comprobar. Así que
 * el ahorro se mide sobre el archivo del usuario, y se reporta tal como
 * salga —incluido el caso en que no haya ahorro ninguno—.
 *
 * Todo lo de aquí es aritmética pura sobre números y cadenas: sin DOM y
 * sin PDF.js, para que las tres ramas del veredicto se puedan probar sin
 * construir un PDF por cada una.
 */

/**
 * Regla estándar de la industria para estimar tokens sin cargar un
 * tokenizador: cuatro caracteres por token. Es una aproximación, no una
 * medición, y por eso la interfaz escribe siempre «~» delante del número.
 */
export const CARACTERES_POR_TOKEN = 4;

/**
 * Estimación de tokens a partir de un número de caracteres ya contado.
 *
 * Existe aparte de `estimarTokens` porque la interfaz recibe recuentos, no
 * textos: retener el texto de una tesis de 300 páginas dos veces en
 * memoria, en un producto cuyo argumento es que el archivo no va a ninguna
 * parte, sería gratuito y feo.
 */
export function tokensDeCaracteres(caracteres: number): number {
  return Math.ceil(Math.max(0, caracteres) / CARACTERES_POR_TOKEN);
}

/** Estimación de tokens de un texto. Redondea hacia arriba: un resto de un solo carácter sigue costando un token. */
export function estimarTokens(texto: string): number {
  return tokensDeCaracteres(texto.length);
}

/**
 * Fracción ahorrada al pasar de `antes` a `despues`.
 *
 * **Puede ser negativa**, y eso no es un error que haya que sujetar a
 * cero: si el Markdown resulta más grande que el texto del PDF, el
 * usuario merece verlo. `Math.max(0, …)` aquí convertiría esta función en
 * una que nunca puede dar malas noticias, que es la definición de una
 * medida que no mide.
 *
 * Con `antes <= 0` no hay nada de lo que ahorrar y la división no tendría
 * sentido: devuelve 0, y quien presenta el resultado distingue ese caso
 * por separado.
 */
export function ahorro(antes: number, despues: number): number {
  if (!(antes > 0)) return 0;
  return (antes - despues) / antes;
}

/** Lo medido sobre el archivo concreto del usuario. */
export interface MedidaDeAhorro {
  /** Caracteres del texto extraído del PDF, con su ruido de maquetación. */
  caracteresPdf: number;
  /** Caracteres del Markdown entregado. */
  caracteresMarkdown: number;
  /**
   * Páginas escaneadas que el Markdown no incluye, porque necesitan OCR.
   *
   * Si las hay, la comparación deja de ser pareja: el Markdown es más
   * pequeño porque le falta contenido, no porque esté mejor escrito.
   * Presentar eso como ahorro sería la mentira más fácil de esta pantalla.
   */
  paginasEscaneadas: number;
}

/** Separador de miles del español de México: 48300 → «48,300». */
function miles(n: number): string {
  return Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

/**
 * Porcentaje ahorrado, redondeado. Por debajo del 1% no se anuncia ahorro:
 * «Ahorras 0%» es ruido, y «Ahorras 0.4%» es una burla.
 */
export function porcentajeAhorrado(m: MedidaDeAhorro): number {
  return Math.round(ahorro(m.caracteresPdf, m.caracteresMarkdown) * 100);
}

/** HTML del recuadro de ahorro, con las tres ramas escritas enteras. */
export function renderAhorro(
  m: MedidaDeAhorro,
  t: Textos = textos()
): string {
  const tokensPdf = tokensDeCaracteres(m.caracteresPdf);
  const tokensMd = tokensDeCaracteres(m.caracteresMarkdown);
  const pct = porcentajeAhorrado(m);

  const cifras = `
      <dl class="ahorro-cifras">
        <div><dt>${t.ahorro.tuPdf}</dt><dd>${t.ahorro.tokens(miles(tokensPdf))}</dd></div>
        <div><dt>${t.ahorro.elMarkdown}</dt><dd>${t.ahorro.tokens(miles(tokensMd))}</dd></div>
      </dl>`;

  const aviso =
    m.paginasEscaneadas > 0
      ? `<p class="apunte">${t.ahorro.faltanEscaneadas(m.paginasEscaneadas)}</p>`
      : '';

  if (m.caracteresPdf <= 0) {
    return `${cifras}
      <p class="veredicto duda"><strong>${t.ahorro.nadaQueMedir}</strong></p>
      <p class="apunte">${t.ahorro.nadaQueMedirDetalle}</p>${aviso}`;
  }

  if (pct >= 1) {
    return `${cifras}
      <p class="veredicto bien"><strong>${t.ahorro.ahorras(pct)}</strong></p>
      <p class="apunte">${t.ahorro.ahorrasDetalle}</p>${aviso}`;
  }

  return `${cifras}
    <p class="veredicto duda"><strong>${t.ahorro.noAhorras}</strong></p>
    <p class="apunte">${t.ahorro.noAhorrasDetalle(pct < 0)}</p>${aviso}`;
}
