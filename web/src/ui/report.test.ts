import { describe, it, expect } from 'vitest';
import { renderDiagnosis } from './report';
import { PRODUCTOS } from './pagos';
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

  // Construye paginas de verdad en vez de fiarse de `pageCount`: la
  // aritmetica del informe es justo lo que se esta probando, asi que el
  // fixture no puede darla por buena.
  const paginas = (
    receta: Array<[PdfDiagnosis['pages'][number]['kind'], number]>
  ): PdfDiagnosis['pages'] => {
    const out: PdfDiagnosis['pages'] = [];
    for (const [kind, cuantas] of receta) {
      for (let i = 0; i < cuantas; i++) {
        out.push({
          pageNumber: out.length + 1,
          kind,
          charCount: kind === 'texto' ? 500 : 0,
        });
      }
    }
    return out;
  };

  // El documento de referencia del plan: una tesis de 312 paginas con 100
  // separadores en blanco. `resumirPaginas` la resume como 'texto', porque
  // decide por presencia y los blancos son normales en una tesis -- su
  // docblock lo dice con todas las letras. Antes el informe decia «312
  // paginas, TODAS con texto extraible» y el .md entregado traia 212
  // encabezados `## Pagina` con huecos en la numeracion. En un producto
  // cuyo argumento es que puedes comprobar lo que afirma, que lo dicho y
  // lo entregado no cuadren es lo unico que no puede pasar.
  it('no cuenta las paginas en blanco como paginas con texto', () => {
    const html = renderDiagnosis(
      base({
        pageCount: 312,
        pages: paginas([
          ['texto', 212],
          ['vacia', 100],
        ]),
      })
    );
    expect(html).toContain('212 con texto');
    expect(html).toContain('100 en blanco');
    expect(html.toLowerCase()).not.toContain('todas con texto');
  });

  // La misma confusion en la otra rama que admite blancos. Aqui era peor
  // que un adjetivo de mas: `pageCount - escaneadas` da un numero
  // directamente falso. Con 2 de texto, 1 escaneada y 1 en blanco decia
  // «3 con texto».
  it('tampoco los cuenta como texto en un documento mixto', () => {
    const html = renderDiagnosis(
      base({
        overall: 'mixto',
        pageCount: 4,
        pages: paginas([
          ['texto', 2],
          ['escaneado', 1],
          ['vacia', 1],
        ]),
      })
    );
    expect(html).toContain('2 con texto');
    expect(html).toContain('1 escaneadas');
    expect(html).toContain('1 en blanco');
    expect(html).not.toContain('3 con texto');
  });

  // Tercera rama que admite blancos, y la ultima que seguia usando
  // `pageCount`. `resumirPaginas` decide por PRESENCIA, asi que una tesis de
  // 199 paginas escaneadas con una portada vectorial en blanco cae aqui con
  // pageCount 200, y el informe anunciaba «200 paginas escaneadas» para 199
  // reales. Duele mas que en las otras ramas: ese numero es justo el que el
  // usuario mira para decidir si paga el OCR, que se cobra por pagina.
  //
  // La prueba falla con la expresion anterior (`${d.pageCount}`): esperaba
  // 199, obtenia 200, y no habia ningun «en blanco» que encontrar.
  it('no cuenta las paginas en blanco como escaneadas', () => {
    const html = renderDiagnosis(
      base({
        overall: 'escaneado',
        convertibleInBrowser: false,
        pageCount: 200,
        pages: paginas([
          ['escaneado', 199],
          ['vacia', 1],
        ]),
      })
    );
    // Se comprueba el RECUENTO, no la cadena suelta. Antes decia
    // `not.toContain('200')` sobre el HTML entero, y eso dejo de funcionar
    // el dia que el OCR de estudiante paso a costar 200 MXN: la prueba
    // fallaba por el precio impreso en el boton, no por el recuento. El
    // fallo original producia literalmente `<strong>200</strong> páginas`,
    // asi que esa es la forma que hay que vigilar.
    expect(html).toMatch(/<strong>199<\/strong>\s*páginas escaneadas/);
    expect(html).toContain('1 en blanco');
    expect(html).not.toMatch(/<strong>200<\/strong>\s*páginas/);
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
    expect(html).toContain('first.contact@aideatext.ai');
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
    expect(html).toContain('first.contact@aideatext.ai');
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

  // -- Botones de pago ------------------------------------------------

  const escaneado = () =>
    renderDiagnosis(
      base({
        overall: 'escaneado',
        convertibleInBrowser: false,
        pages: [{ pageNumber: 1, kind: 'escaneado', charCount: 0 }],
      })
    );

  it('ofrece las dos tarifas de OCR ante un PDF escaneado', () => {
    const html = escaneado();
    expect(html).toContain(PRODUCTOS.ocrEstudiante.url);
    expect(html).toContain(PRODUCTOS.ocrEmpresa.url);
  });

  // Cablear los dos botones al mismo enlace es el error que traía el
  // documento de origen, y el que menos se nota: la página se ve bien, no
  // falla nada, y la diferencia solo aparece al cuadrar caja.
  it('no manda las dos tarifas de OCR al mismo enlace', () => {
    const html = escaneado();
    const enlaces = [...html.matchAll(/https:\/\/buy\.stripe\.com\/\w+/g)].map(
      (m) => m[0]
    );
    expect(new Set(enlaces).size).toBe(enlaces.length);
  });

  // La cifra impresa junto al botón sale del mismo sitio que el enlace. Si
  // se separan, la página anuncia un precio y el checkout cobra otro —
  // exactamente lo que pasaba cuando la página decía «200 por 4 horas» y
  // Stripe cobraba 500 por esas 4 horas.
  it('imprime el importe que cobra cada enlace de OCR', () => {
    const html = escaneado();
    expect(html).toContain(`${PRODUCTOS.ocrEstudiante.importeMxn} MXN`);
    expect(html).toContain(`${PRODUCTOS.ocrEmpresa.importeMxn} MXN`);
  });

  // El argumento entero de la columna 1 es que el PDF no sale del
  // navegador. El OCR es la excepción, y el aviso tiene que viajar pegado
  // al botón: si se queda solo en el pie, quien paga se entera después.
  it('avisa junto al boton de que el OCR si envia el archivo', () => {
    expect(escaneado()).toContain('sí necesita tu archivo');
  });

  // Un PDF sin texto y sin imágenes no tiene nada que reconocer. Aquí el
  // botón no es solo inútil: cobra por un trabajo imposible.
  it('no ofrece ningun enlace de pago cuando el PDF esta vacio', () => {
    const html = renderDiagnosis(
      base({
        overall: 'vacio',
        convertibleInBrowser: false,
        pages: [{ pageNumber: 1, kind: 'vacia', charCount: 0 }],
      })
    );
    expect(html).not.toContain('buy.stripe.com');
  });

  // Un PDF que se convierte entero en el navegador no necesita OCR, y
  // ofrecérselo convierte un servicio gratuito que funciona en un embudo
  // de venta. La promesa de la columna 1 es que ahí no se cobra.
  it('no ofrece ningun enlace de pago cuando el PDF ya es convertible', () => {
    expect(renderDiagnosis(base({}))).not.toContain('buy.stripe.com');
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
