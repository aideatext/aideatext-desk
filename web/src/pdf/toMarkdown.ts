// `tieneOperadorDeImagen` NO se importa aqui: `diagnosePdf` ya clasifico
// las paginas. Importarlo sin usarlo es error TS6133 con noUnusedLocals.
import { pdfjs, loadOptions } from './pdfjs';
import { diagnosePdf } from './diagnose';
import { sha256Hex } from '../lib/hash';

export interface ConversionResult {
  markdown: string;
  /** SHA-256 del PDF de origen. El archivo no sale del navegador. */
  sourceHash: string;
  pagesConverted: number;
  /**
   * Páginas escaneadas: tienen contenido, pero requiere OCR en servidor.
   * Son las facturables, y las unicas que deben mostrarse como pendientes.
   */
  pagesScanned: number[];
  /**
   * Páginas sin texto y sin imagen. No hay nada que convertir ni que cobrar.
   *
   * Se separan de `pagesScanned` a proposito. Un unico campo `pagesSkipped`
   * mezclaba ambas, perdiendo una distincion que `diagnosePdf` ya habia
   * calculado -- e invitando a cobrar OCR por los separadores de capitulo y
   * versos en blanco que abundan en una tesis. Es el mismo descuido que
   * corrompia el veredicto del documento antes de `resumirPaginas`.
   */
  pagesBlank: number[];
}

/**
 * Convierte a Markdown las páginas con capa de texto.
 * Las páginas escaneadas se omiten y se reportan: requieren OCR en
 * servidor, que es un servicio de pago (spec §2.3).
 *
 * La clasificación no se repite aquí: se delega entera en `diagnosePdf`,
 * que es quien conoce el umbral de texto y los opcodes de imagen. Duplicar
 * ese criterio permitiría que las dos copias divergieran, y entonces el
 * diagnóstico que se le muestra al usuario dejaría de describir lo que la
 * conversión hace realmente.
 */
export async function pdfToMarkdown(data: ArrayBuffer): Promise<ConversionResult> {
  const diagnosis = await diagnosePdf(data);
  const sourceHash = await sha256Hex(data);

  // Se retiene la TAREA de carga, no solo su promesa. Si `getDocument`
  // rechaza -- PDF cifrado, cabecera corrupta, fallo del worker -- la
  // promesa rechaza pero el worker dedicado y la copia completa del
  // archivo del usuario siguen vivos: PDF.js solo los libera con
  // `task.destroy()`, nunca por el rechazo de la promesa.
  //
  // No es hipotetico: la lista de verificacion final de este plan incluye
  // probar un PDF protegido con contrasena, y `main.ts` ya tiene copy para
  // ese caso. Ademas, desde que `loadOptions` copia el buffer, lo que se
  // filtraria es un duplicado COMPLETO del archivo, no una vista.
  //
  // `task.destroy()` tambien libera el documento, asi que sustituye a
  // `doc.destroy()` y cubre los dos caminos con un solo `finally`.
  const task = pdfjs.getDocument(loadOptions(data));

  const bloques: string[] = [];
  const pagesScanned: number[] = [];
  const pagesBlank: number[] = [];

  try {
    const doc = await task.promise;

    for (const reporte of diagnosis.pages) {
      if (reporte.kind !== 'texto') {
        if (reporte.kind === 'escaneado') pagesScanned.push(reporte.pageNumber);
        else pagesBlank.push(reporte.pageNumber);
        continue;
      }
      const page = await doc.getPage(reporte.pageNumber);
      const content = await page.getTextContent();
      const texto = content.items
        .map((i) => ('str' in i ? i.str : ''))
        .join(' ')
        .replace(/\s+/g, ' ')
        .trim();
      bloques.push(`## Página ${reporte.pageNumber}\n\n${texto}`);
    }
  } finally {
    await task.destroy();
  }

  return {
    markdown: bloques.join('\n\n'),
    sourceHash,
    pagesConverted: bloques.length,
    pagesScanned,
    pagesBlank,
  };
}
