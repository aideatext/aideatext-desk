import { describe, it, expect } from 'vitest';
import { diagnosePdf } from './diagnose';
import { makeTextPdf, makeImagePdf } from './fixtures';

const LARGO = 'palabra '.repeat(30); // ~240 caracteres, supera el umbral de 100

describe('diagnosePdf', () => {
  it('clasifica como texto un PDF con capa de texto', async () => {
    const d = await diagnosePdf(await makeTextPdf([LARGO]));
    expect(d.overall).toBe('texto');
    expect(d.convertibleInBrowser).toBe(true);
    expect(d.pages[0].kind).toBe('texto');
    expect(d.pages[0].charCount).toBeGreaterThanOrEqual(100);
  });

  it('clasifica como escaneado un PDF sin texto extraible', async () => {
    const d = await diagnosePdf(await makeImagePdf(2));
    expect(d.overall).toBe('escaneado');
    expect(d.convertibleInBrowser).toBe(false);
  });

  it('cuenta correctamente las paginas', async () => {
    const d = await diagnosePdf(await makeTextPdf([LARGO, LARGO, LARGO]));
    expect(d.pageCount).toBe(3);
    expect(d.pages).toHaveLength(3);
  });

  it('numera las paginas desde 1', async () => {
    const d = await diagnosePdf(await makeTextPdf([LARGO, LARGO]));
    expect(d.pages.map((p) => p.pageNumber)).toEqual([1, 2]);
  });

  it('marca convertibleInBrowser false cuando ninguna pagina tiene texto', async () => {
    const d = await diagnosePdf(await makeImagePdf(1));
    expect(d.convertibleInBrowser).toBe(false);
  });
});
