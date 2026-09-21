/**
 * Punto de entrada UNICO a PDF.js para todo el proyecto.
 *
 * Nadie más importa 'pdfjs-dist' directamente. Si dos módulos lo importaran
 * por rutas distintas, el bundler cargaría dos instancias separadas y la
 * configuración del worker aplicada a una no afectaría a la otra —
 * un fallo que no aparece en las pruebas y sí en el navegador.
 *
 * Se usa la variante `legacy` porque es la que funciona tanto en el
 * entorno Node de Vitest como en el navegador.
 */
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';

export const pdfjs = pdfjsLib;

/** Configura el worker. Solo se invoca desde el navegador (`main.ts`). */
export function configureWorker(url: string): void {
  pdfjsLib.GlobalWorkerOptions.workerSrc = url;
}

/**
 * Opcodes de PDF.js que pintan contenido rasterizado.
 *
 * El conjunto se deriva **por nombre**, no enumerando constantes a mano, por
 * dos razones aprendidas a golpes:
 *
 * 1. Una constante inexistente rompe `tsc --noEmit` y por tanto `npm run
 *    build`. Ocurrió con `paintJpegXObject`, que no existe en pdfjs-dist 4.x.
 *    Derivar por nombre no puede fallar así.
 * 2. Enumerar a mano deja huecos. La lista escrita a ojo omitía
 *    `paintImageMaskXObject`, y **los escáneres de documentos producen
 *    imágenes bitonales que PDF codifica justamente como máscaras**: una tesis
 *    escaneada real se habría clasificado como `vacia` en vez de `escaneado`,
 *    diciéndole al usuario que su documento está vacío en lugar de ofrecerle
 *    el OCR.
 *
 * En pdfjs-dist 4.10.38 esto resuelve a 8 opcodes (83–90).
 */
const OPS_DE_IMAGEN: ReadonlySet<number> = new Set(
  Object.entries(pdfjsLib.OPS)
    .filter(([nombre]) => /^paint.*Image/.test(nombre))
    .map(([, codigo]) => codigo as number)
);

/**
 * ¿La lista de operadores de una página pinta algún contenido rasterizado?
 *
 * Se prefiere el falso positivo al falso negativo: solo se consulta cuando la
 * página ya tiene poco texto, así que clasificar de más como «escaneada»
 * ofrece OCR innecesariamente —inocuo—, mientras que clasificar de menos le
 * dice al usuario que su escaneo está vacío —caro y confuso—.
 */
export function tieneOperadorDeImagen(fnArray: readonly number[]): boolean {
  return fnArray.some((fn) => OPS_DE_IMAGEN.has(fn));
}

/** Opciones comunes de carga. */
export function loadOptions(data: ArrayBuffer) {
  return {
    // `data.slice(0)` copia. NO cambiar a `new Uint8Array(data)`: eso es una
    // VISTA sobre el búfer del llamante, y PDF.js lo transfiere al worker,
    // dejándolo **detached** (byteLength 0) en cuanto se llama a
    // `getDocument`. El llamante se queda sin su propio archivo.
    //
    // El fallo no avisa. `crypto.subtle.digest` sobre un búfer detached no
    // lanza: devuelve el SHA-256 del vacío (`e3b0c442…`), así que el
    // `sourceHash` sería idéntico para todos los archivos. Y un segundo
    // `getDocument` sobre el mismo búfer —diagnosticar y luego convertir, que
    // es justo el recorrido del producto— revienta con «Cannot perform
    // Construct on a detached ArrayBuffer».
    data: new Uint8Array(data.slice(0)),
    // Sin red: evita descargar fuentes y mapas de caracteres remotos, lo
    // que contradiría la garantía de que nada sale del navegador.
    disableFontFace: true,
    isEvalSupported: false,
    // Silencia "Ensure that the `standardFontDataUrl` API parameter is
    // provided". Solo extraemos texto, nunca renderizamos glifos, así que
    // los datos de fuente no hacen falta. Verificado: con y sin esta
    // opcion se extraen exactamente los mismos caracteres.
    //
    // ⚠️ NO apuntar `standardFontDataUrl` a un CDN para callar el aviso:
    // seria precisamente la peticion de red que el producto promete que
    // no ocurre.
    verbosity: pdfjsLib.VerbosityLevel.ERRORS,
  };
}
