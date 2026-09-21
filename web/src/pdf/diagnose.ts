import { pdfjs, loadOptions, tieneOperadorDeImagen } from './pdfjs';

/** Umbral de caracteres a partir del cual una página se considera texto real. */
const UMBRAL_TEXTO = 100;

export type PageKind = 'texto' | 'escaneado' | 'vacia';

export interface PageReport {
  pageNumber: number;
  kind: PageKind;
  charCount: number;
}

export interface PdfDiagnosis {
  pageCount: number;
  pages: PageReport[];
  overall: 'texto' | 'escaneado' | 'mixto' | 'vacio';
  /** true si al menos una página tiene texto extraíble sin OCR. */
  convertibleInBrowser: boolean;
}

/**
 * Analiza un PDF enteramente en memoria. No realiza ninguna petición de red:
 * es el fundamento verificable de la promesa de privacidad (spec §3).
 */
export async function diagnosePdf(data: ArrayBuffer): Promise<PdfDiagnosis> {
  const doc = await pdfjs.getDocument(loadOptions(data)).promise;

  // Se captura ANTES de destruir el documento: `doc.numPages` no es
  // accesible después de `doc.destroy()`.
  const pageCount = doc.numPages;
  const pages: PageReport[] = [];

  for (let n = 1; n <= pageCount; n++) {
    const page = await doc.getPage(n);
    const content = await page.getTextContent();
    const charCount = content.items
      .map((i) => ('str' in i ? i.str : ''))
      .join('')
      .trim().length;

    let kind: PageKind;
    if (charCount >= UMBRAL_TEXTO) {
      kind = 'texto';
    } else {
      // Solo operaciones de imagen auténticas. Deliberadamente NO cuenta
      // `OPS.fill`: un relleno es una forma dibujada, no un escaneo, y
      // aceptarlo clasificaría como escaneada cualquier página con un borde.
      // El conjunto de opcodes vive en `pdfjs.ts` y se deriva por nombre;
      // ver allí por qué no se enumeran a mano.
      const ops = await page.getOperatorList();
      kind = tieneOperadorDeImagen(ops.fnArray) ? 'escaneado' : 'vacia';
    }

    pages.push({ pageNumber: n, kind, charCount });
  }

  await doc.destroy();

  const conTexto = pages.filter((p) => p.kind === 'texto').length;
  const escaneadas = pages.filter((p) => p.kind === 'escaneado').length;

  let overall: PdfDiagnosis['overall'];
  if (conTexto === pages.length && conTexto > 0) overall = 'texto';
  else if (escaneadas === pages.length && escaneadas > 0) overall = 'escaneado';
  else if (conTexto > 0) overall = 'mixto';
  else overall = 'vacio';

  return { pageCount, pages, overall, convertibleInBrowser: conTexto > 0 };
}
