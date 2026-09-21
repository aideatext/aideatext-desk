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

/** Opciones comunes de carga. */
export function loadOptions(data: ArrayBuffer) {
  return {
    data: new Uint8Array(data),
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
