import { describe, it, expect } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import { makeTextPdf, makeImagePdf } from './fixtures';

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
});
