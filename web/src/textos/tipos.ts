/**
 * EL CONTRATO DE TRADUCCIÓN.
 *
 * ─────────────────────────────────────────────────────────────────────
 * POR QUÉ UNA INTERFAZ Y NO UN `Record<string, string>`
 * ─────────────────────────────────────────────────────────────────────
 *
 * Vienen el francés y el portugués. Con un diccionario suelto, añadir un
 * idioma es copiar un archivo, traducir lo que uno ve y desplegar: las
 * claves que se olvidan quedan en español, nadie se entera, y el fallo
 * aparece en la pantalla de un usuario que no habla español.
 *
 * Con esta interfaz, un archivo de idioma al que le falte UNA cadena no
 * compila. `npm run build` corre `tsc --noEmit` antes de empaquetar, así
 * que una traducción incompleta no llega a producción: se queda en el
 * error de compilación, que es donde tiene que quedarse.
 *
 * Las funciones no son capricho. Las cifras van DENTRO de la frase y su
 * posición cambia con el idioma; una plantilla con `{n}` obliga a cada
 * traductor a respetar un orden que su idioma quizá no admite. Una
 * función recibe los números y devuelve la frase entera, ya armada.
 *
 * REGLA PARA QUIEN AÑADA UN IDIOMA: traducir el sentido, no las palabras.
 * Varias de estas frases existen para no mentir —«no ahorras tokens»,
 * «la petición salió»— y una traducción que las suavice rompe justo lo
 * que sostienen.
 */

/** Los idiomas que el sitio sirve hoy. Añadir uno empieza aquí. */
export type Idioma = 'es' | 'en';

export interface Textos {
  /** Informe del diagnóstico del PDF. */
  informe: {
    /** «312 páginas: 212 con texto extraíble, 100 en blanco.» */
    paginasConTexto(total: number, conTexto: number, enBlanco: number): string;
    seConvierteAqui: string;
    descargar: string;

    /** Documento mixto: parte texto, parte escaneado. */
    mixtoTitulo(total: number): string;
    mixtoDesglose(conTexto: number, escaneadas: number, enBlanco: number): string;
    mixtoExplicacion: string;
    dudasAntesDePagar: string;

    /** Documento escaneado entero. */
    escaneadas(escaneadas: number, enBlanco: number): string;
    necesitaOcr: string;

    /** Ni texto ni imágenes: no hay nada que reconocer. */
    vacioTitulo(total: number): string;
    vacioExplicacion: string;
    vacioSalida: string;
  };

  /** Los dos botones de OCR y su advertencia. */
  ocr: {
    /** La ÚNICA excepción a «tu archivo no sale del navegador». */
    aviso: string;
    estudiante(mxn: number): string;
    empresa(mxn: number): string;
  };

  /** Recuadro de medición de tokens. */
  ahorro: {
    tuPdf: string;
    elMarkdown: string;
    tokens(n: string): string;
    faltanEscaneadas(n: number): string;
    nadaQueMedir: string;
    nadaQueMedirDetalle: string;
    ahorras(pct: number): string;
    ahorrasDetalle: string;
    noAhorras: string;
    noAhorrasDetalle(unPocoMas: boolean): string;
  };

  /** Estados y errores de la conversión. */
  conversion: {
    analizando: string;
    midiendo: string;
    falloAlConvertir: string;
    noSePudoLeer: string;
    escribenosYRevisamos: string;
    noSePudoMedir: string;
  };

  /** La comprobación de la CSP en vivo. */
  csp: {
    bloqueadoTitulo: string;
    bloqueadoDetalle: string;
    directivaActivada: string;
    bloqueadoConsola: string;
    noBloqueadoTitulo: string;
    noBloqueadoDetalle: string;
    avisanosYCorregimos: string;
    indeterminadoTitulo: string;
    indeterminadoDetalle: string;
    indeterminadoAlternativa: string;
    siQuieresQueLoRevisemos: string;
  };

  /** Comprobador de tarifa institucional. */
  tarifa: {
    noEstaEnLaLista: string;
    institucional(corto: number, largo: number, horas: number, porHora: number): string;
    general(corto: number, largo: number, horas: number): string;
  };
}
