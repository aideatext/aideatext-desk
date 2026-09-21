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
  // `vacio`, y tiene su propia rama. Sea cual sea el copy que acabe
  // teniendo ese caso, las dos reglas del spec 2.4 le aplican igual: no se
  // presenta como un fallo, y nunca es un callejon sin salida.
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

  // Simetrica de la de abajo, y no redundante. Al separar `vacio` de
  // `escaneado` las dos pruebas anteriores dejaron de distinguir las dos
  // ramas: el copy de `vacio` tampoco dice "no se puede" y tambien lleva
  // el correo, asi que ambas seguian verdes aunque la rama `escaneado`
  // desapareciera entera (verificado por mutacion). El agujero importa:
  // una tesis escaneada de 200 paginas recibiria «sin texto ni imagenes,
  // puede que este vacio» y no se le ofreceria nunca el OCR — que es
  // exactamente el fallo que `pdfjs.ts` documenta como razon de ser de
  // todo el diseno de opcodes de imagen, y ademas el servicio de pago.
  it('ofrece OCR ante un PDF escaneado', () => {
    const html = renderDiagnosis(
      base({
        overall: 'escaneado',
        convertibleInBrowser: false,
        pages: [{ pageNumber: 1, kind: 'escaneado', charCount: 0 }],
      })
    );
    expect(html).toContain('OCR');
  });

  // Un PDF sin texto Y sin imagenes no tiene nada que reconocer: ofrecerle
  // OCR de pago es vender un servicio que no puede hacer nada por ese
  // archivo. Fundir esta rama con `escaneado` reintroducia en la interfaz
  // la misma confusion que la Task 4 separo en los datos (`pagesScanned`
  // frente a `pagesBlank`); un arreglo en la capa de datos no sirve si la
  // capa de presentacion vuelve a mezclarlo.
  it('no ofrece OCR ni llama escaneadas a las paginas de un PDF vacio', () => {
    const html = renderDiagnosis(
      base({
        overall: 'vacio',
        convertibleInBrowser: false,
        pages: [{ pageNumber: 1, kind: 'vacia', charCount: 0 }],
      })
    ).toLowerCase();
    expect(html).not.toContain('ocr');
    expect(html).not.toContain('escaneada');
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
