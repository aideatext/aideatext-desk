import { describe, it, expect } from 'vitest';
import { diagnosePdf, resumirPaginas } from './diagnose';
import type { PageKind, PageReport, PdfDiagnosis } from './diagnose';
import { makeTextPdf, makeImagePdf } from './fixtures';

const LARGO = 'palabra '.repeat(30); // ~240 caracteres, supera el umbral de 100

/** Construye páginas sintéticas para probar la agregación sin PDFs. */
function paginas(...kinds: PageKind[]): PageReport[] {
  return kinds.map((kind, i) => ({
    pageNumber: i + 1,
    kind,
    charCount: kind === 'texto' ? 235 : 0,
  }));
}

describe('resumirPaginas', () => {
  // Las siete combinaciones posibles. Tres fallaban con la regla anterior,
  // que exigía totalidad en vez de presencia, y ninguna estaba cubierta:
  // ese hueco de cobertura es precisamente lo que ocultaba el defecto.
  const casos: Array<{
    kinds: PageKind[];
    esperado: PdfDiagnosis['overall'];
    nota: string;
  }> = [
    { kinds: [], esperado: 'vacio', nota: 'documento sin páginas' },
    { kinds: ['texto', 'texto'], esperado: 'texto', nota: 'todas con texto' },
    { kinds: ['escaneado', 'escaneado'], esperado: 'escaneado', nota: 'todas escaneadas' },
    { kinds: ['vacia', 'vacia'], esperado: 'vacio', nota: 'todas vacías' },
    { kinds: ['texto', 'escaneado'], esperado: 'mixto', nota: 'texto y escaneado' },
    { kinds: ['texto', 'vacia'], esperado: 'texto', nota: 'texto con una página en blanco' },
    { kinds: ['escaneado', 'vacia'], esperado: 'escaneado', nota: 'escaneado con una página en blanco' },
  ];

  for (const { kinds, esperado, nota } of casos) {
    it(`${nota} → ${esperado}`, () => {
      expect(resumirPaginas(paginas(...kinds))).toBe(esperado);
    });
  }

  it('una tesis casi enteramente escaneada NO se reporta como vacía', () => {
    // Regresión del defecto más grave: 199 páginas escaneadas más una
    // portada vectorial daban `vacio`, es decir «tu documento está vacío».
    const kinds: PageKind[] = [...Array(199).fill('escaneado' as PageKind), 'vacia'];
    expect(resumirPaginas(paginas(...kinds))).toBe('escaneado');
  });
});

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
