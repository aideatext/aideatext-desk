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
 * Resume las páginas en un veredicto de documento.
 *
 * Decide por **presencia**, no por totalidad. La versión anterior exigía que
 * *todas* las páginas fueran de un tipo, y entonces una sola página `vacia`
 * corrompía el veredicto en ambas direcciones:
 *
 * - Una tesis de 199 páginas escaneadas con una portada vectorial daba
 *   `vacio`: **«tu documento está vacío»**. Es exactamente el fallo que
 *   `pdfjs.ts` explica que el diseño existe para evitar — el nivel de página
 *   respetaba ese criterio y el nivel de documento lo tiraba a la basura.
 * - Un documento enteramente convertible con un verso en blanco daba
 *   `mixto`, ofreciendo un OCR de pago que no hacía ninguna falta.
 *
 * Las páginas en blanco son comunes en una tesis —separadores de capítulo,
 * versos vacíos, portadillas—, así que no era un caso exótico.
 *
 * Es una función pura sobre `PageReport[]` para poder probar las siete
 * combinaciones sin construir un PDF distinto por cada una.
 */
export function resumirPaginas(
  pages: readonly PageReport[]
): PdfDiagnosis['overall'] {
  const conTexto = pages.some((p) => p.kind === 'texto');
  const escaneadas = pages.some((p) => p.kind === 'escaneado');

  if (conTexto && escaneadas) return 'mixto';
  if (conTexto) return 'texto';
  if (escaneadas) return 'escaneado';
  return 'vacio'; // cero páginas, o todas vacías
}

/**
 * Analiza un PDF enteramente en memoria. No realiza ninguna petición de red:
 * es el fundamento verificable de la promesa de privacidad (spec §3).
 */
export async function diagnosePdf(data: ArrayBuffer): Promise<PdfDiagnosis> {
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

  let pageCount = 0;
  const pages: PageReport[] = [];

  // `finally`, no una llamada al final del cuerpo. Si `getPage`,
  // `getTextContent` o `getOperatorList` rechazan —PDF corrupto, que es
  // justo lo que esta herramienta existe para triar— el documento quedaría
  // sin destruir, reteniendo el transporte del worker y la copia completa
  // del archivo del usuario. En un producto cuyo argumento es que el archivo
  // no va a ninguna parte, conservarlo en memoria de más es inaceptable.
  try {
    const doc = await task.promise;
    pageCount = doc.numPages;

    for (let n = 1; n <= pageCount; n++) {
      const page = await doc.getPage(n);
      const content = await page.getTextContent();
      const charCount = content.items
        .map((i) => ('str' in i ? i.str : ''))
        // Se une sin separador a propósito: el espacio entre items que PDF.js
        // representa por posición y no por carácter no debe inflar la cuenta.
        // Es un subconteo leve y deliberadamente conservador. No cambiar a
        // `join(' ')` sin recalibrar UMBRAL_TEXTO.
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
  } finally {
    await task.destroy();
  }

  return {
    pageCount,
    pages,
    overall: resumirPaginas(pages),
    convertibleInBrowser: pages.some((p) => p.kind === 'texto'),
  };
}
