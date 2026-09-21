import { describe, it, expect } from 'vitest';
import { pdfToMarkdown } from './toMarkdown';
import { makeTextPdf, makeImagePdf } from './fixtures';
import { sha256Hex } from '../lib/hash';

const LARGO = 'investigacion cualitativa '.repeat(10); // ~260 caracteres

describe('pdfToMarkdown', () => {
  it('extrae el texto de la pagina al markdown', async () => {
    const r = await pdfToMarkdown(await makeTextPdf([LARGO]));
    expect(r.markdown).toContain('investigacion cualitativa');
  });

  it('inserta un separador por pagina', async () => {
    const r = await pdfToMarkdown(await makeTextPdf([LARGO, LARGO]));
    expect(r.markdown).toContain('## Página 1');
    expect(r.markdown).toContain('## Página 2');
  });

  it('informa cuantas paginas convirtio', async () => {
    const r = await pdfToMarkdown(await makeTextPdf([LARGO, LARGO, LARGO]));
    expect(r.pagesConverted).toBe(3);
    expect(r.pagesSkipped).toEqual([]);
  });

  it('omite las paginas escaneadas y las reporta', async () => {
    const r = await pdfToMarkdown(await makeImagePdf(2));
    expect(r.pagesConverted).toBe(0);
    expect(r.pagesSkipped).toEqual([1, 2]);
  });

  it('el sourceHash coincide con el sha256 del archivo de entrada', async () => {
    const pdf = await makeTextPdf([LARGO]);
    const r = await pdfToMarkdown(pdf);
    expect(r.sourceHash).toBe(await sha256Hex(pdf));
  });

  /**
   * Regresión: `loadOptions` pasaba a PDF.js una VISTA del búfer del llamante,
   * que el worker transfería, dejándolo detached. Esta prueba calcula el hash
   * esperado ANTES de convertir a propósito: la prueba anterior lo calcula
   * después, y sobre un búfer detached ambos lados dan el SHA-256 del vacío,
   * con lo que pasaría en verde describiendo un producto roto.
   */
  it('no consume el ArrayBuffer de entrada', async () => {
    const pdf = await makeTextPdf([LARGO]);
    const esperado = await sha256Hex(pdf);
    const bytes = pdf.byteLength;

    const r = await pdfToMarkdown(pdf);

    expect(pdf.byteLength).toBe(bytes);
    expect(r.sourceHash).toBe(esperado);
  });
});
