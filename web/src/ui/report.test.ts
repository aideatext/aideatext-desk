import { describe, it, expect } from 'vitest';
import { renderDiagnosis } from './report';
import type { PdfDiagnosis } from '../pdf/diagnose';

const base = (over: Partial<PdfDiagnosis>): PdfDiagnosis => ({
  pageCount: 1,
  pages: [{ pageNumber: 1, kind: 'texto', charCount: 500 }],
  overall: 'texto',
  convertibleInBrowser: true,
  ...over,
});

describe('renderDiagnosis', () => {
  it('muestra el numero de paginas', () => {
    expect(renderDiagnosis(base({ pageCount: 312 }))).toContain('312');
  });

  it('ofrece la descarga cuando el PDF es convertible', () => {
    expect(renderDiagnosis(base({}))).toContain('Descargar Markdown');
  });

  it('nunca dice "no se puede" ante un PDF escaneado', () => {
    const html = renderDiagnosis(
      base({ overall: 'escaneado', convertibleInBrowser: false })
    );
    expect(html.toLowerCase()).not.toContain('no se puede');
  });

  it('ofrece el correo de contacto ante un PDF escaneado', () => {
    const html = renderDiagnosis(
      base({ overall: 'escaneado', convertibleInBrowser: false })
    );
    expect(html).toContain('first.contact.desk@aideatext.ai');
  });

  // Cuarto veredicto de `resumirPaginas`, y el unico que ninguna prueba
  // alcanzaba: un PDF cuyas paginas no tienen ni texto ni imagen produce
  // `vacio`, y cae en la misma rama final que un escaneado. Sea cual sea
  // el copy que acabe teniendo ese caso, las dos reglas del spec 2.4 le
  // aplican igual: no se presenta como un fallo, y nunca es un callejon
  // sin salida.
  it('tampoco es un callejon sin salida cuando el PDF esta vacio', () => {
    const html = renderDiagnosis(
      base({
        overall: 'vacio',
        convertibleInBrowser: false,
        pages: [{ pageNumber: 1, kind: 'vacia', charCount: 0 }],
      })
    );
    expect(html.toLowerCase()).not.toContain('no se puede');
    expect(html).toContain('first.contact.desk@aideatext.ai');
  });

  it('indica el caso mixto explicitamente', () => {
    const html = renderDiagnosis(
      base({
        overall: 'mixto',
        pageCount: 2,
        pages: [
          { pageNumber: 1, kind: 'texto', charCount: 500 },
          { pageNumber: 2, kind: 'escaneado', charCount: 0 },
        ],
      })
    );
    expect(html).toContain('mixto');
  });
});
