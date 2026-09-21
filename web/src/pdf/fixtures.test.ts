import { describe, it, expect } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import { pdfjs, loadOptions, tieneOperadorDeImagen } from './pdfjs';
import { makeTextPdf, makeImagePdf } from './fixtures';

/** Texto de prueba que supera holgadamente el umbral de 100 caracteres. */
const LARGO = 'palabra '.repeat(30);

/** Lo que PDF.js observa en una página: es la lente que usará la Task 3. */
async function inspeccionar(data: ArrayBuffer, pagina = 1) {
  const doc = await pdfjs.getDocument(loadOptions(data)).promise;
  const page = await doc.getPage(pagina);
  const charCount = (await page.getTextContent()).items
    .map((i) => ('str' in i ? i.str : ''))
    .join('')
    .trim().length;
  const ops = await page.getOperatorList();
  const tieneImagen = tieneOperadorDeImagen(ops.fnArray);
  await doc.destroy();
  return { charCount, tieneImagen };
}

describe('fixtures de PDF', () => {
  it('makeTextPdf produce un PDF válido con la cabecera %PDF', async () => {
    const bytes = new Uint8Array(await makeTextPdf(['Hola']));
    expect(new TextDecoder().decode(bytes.slice(0, 5))).toBe('%PDF-');
  });

  it('makeTextPdf crea una página por cada elemento', async () => {
    // Se relee el PDF con pdf-lib para contar paginas de verdad.
    // Afirmar solo `byteLength > 0` no comprobaria nada de lo que
    // enuncia el nombre de la prueba.
    const doc = await PDFDocument.load(await makeTextPdf(['uno', 'dos', 'tres']));
    expect(doc.getPageCount()).toBe(3);
  });

  it('makeImagePdf produce un PDF válido con el numero de paginas pedido', async () => {
    const buf = await makeImagePdf(2);
    expect(new TextDecoder().decode(new Uint8Array(buf).slice(0, 5))).toBe('%PDF-');
    const doc = await PDFDocument.load(buf);
    expect(doc.getPageCount()).toBe(2);
  });

  // --- Contrato semántico: es lo que consumen las Tasks 3 y 4 ---
  //
  // Sin estas dos pruebas, cambiar `embedPng` por `drawRectangle` o borrar
  // el `drawText` dejaria las tres pruebas de arriba en verde y destruiria
  // en silencio la distincion sobre la que se construye el diagnostico.

  it('una página de makeTextPdf tiene texto extraíble y ninguna imagen', async () => {
    const { charCount, tieneImagen } = await inspeccionar(await makeTextPdf([LARGO]));
    // Holgado por encima del umbral de 100 de diagnose.ts. Con el texto en
    // una sola linea se extraerian ~101 y el margen seria de 1 caracter.
    expect(charCount).toBeGreaterThan(200);
    expect(tieneImagen).toBe(false);
  });

  it('una página de makeImagePdf tiene imagen y ningún texto extraíble', async () => {
    const { charCount, tieneImagen } = await inspeccionar(await makeImagePdf(2));
    expect(charCount).toBe(0);
    expect(tieneImagen).toBe(true);
  });
});
