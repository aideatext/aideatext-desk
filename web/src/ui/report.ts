import type { PdfDiagnosis } from '../pdf/diagnose';
import { PRODUCTOS } from './pagos';
import { textos, type Textos } from '../textos';

/**
 * Genera el HTML del informe de diagnóstico.
 *
 * Regla de copy (spec §2.4): un PDF no convertible en el navegador nunca
 * se presenta como un fallo. Es la entrada al servicio de OCR de pago.
 *
 * El idioma se resuelve por defecto desde `<html lang>`, pero entra como
 * parámetro para que las pruebas puedan fijar uno sin montar un DOM: esa
 * es la diferencia entre poder probar las dos traducciones y tener que
 * fiarse de una.
 */
export function renderDiagnosis(d: PdfDiagnosis, t: Textos = textos()): string {
  const escaneadas = d.pages.filter((p) => p.kind === 'escaneado').length;
  // Se CUENTAN las de texto, no se restan las escaneadas. `pageCount -
  // escaneadas` metia las paginas en blanco en el saco de "con texto", y
  // `resumirPaginas` permite blancos tanto en `texto` como en `mixto` por
  // diseno: los separadores de capitulo y versos vacios son normales en
  // un documento largo.
  const conTexto = d.pages.filter((p) => p.kind === 'texto').length;
  const enBlanco = d.pages.filter((p) => p.kind === 'vacia').length;

  if (d.convertibleInBrowser && d.overall === 'texto') {
    return `
      <p>${t.informe.paginasConTexto(d.pageCount, conTexto, enBlanco)}</p>
      <p>${t.informe.seConvierteAqui}</p>
      <button id="descargar">${t.informe.descargar}</button>`;
  }

  if (d.overall === 'mixto') {
    return `
      <p>${t.informe.mixtoTitulo(d.pageCount)}</p>
      <p>${t.informe.mixtoDesglose(conTexto, escaneadas, enBlanco)}</p>
      <p>${t.informe.mixtoExplicacion}</p>
      <button id="descargar">${t.informe.descargar}</button>
      ${botonesDeOcr(t)}
      <p class="apunte">${t.informe.dudasAntesDePagar}</p>`;
  }

  if (d.overall === 'escaneado') {
    // Se cuentan las ESCANEADAS, no `pageCount`. `resumirPaginas` devuelve
    // 'escaneado' por PRESENCIA y admite blancos en ese veredicto: un
    // documento de 199 paginas escaneadas con una portada vectorial cae
    // aqui con pageCount 200. Decir «200 paginas escaneadas» inflaba el
    // recuento, y encima es el numero sobre el que el usuario decide si
    // paga el OCR.
    return `
      <p>${t.informe.escaneadas(escaneadas, enBlanco)}</p>
      <p>${t.informe.necesitaOcr}</p>
      ${botonesDeOcr(t)}`;
  }

  // `vacio` tiene su propio mensaje y NO ofrece OCR de pago.
  //
  // Un documento sin texto Y sin imagenes no tiene nada que reconocer: el
  // OCR no le serviria de nada y cobrarselo seria vender humo. Fundir esta
  // rama con `escaneado` reintroducia en la interfaz justo la confusion que
  // la Task 4 pago una ronda por separar en los datos (`pagesScanned` vs
  // `pagesBlank`). Un arreglo en la capa de datos no sirve si la capa de
  // presentacion vuelve a mezclarlo.
  return `
    <p>${t.informe.vacioTitulo(d.pageCount)}</p>
    <p>${t.informe.vacioExplicacion}</p>
    <p>${t.informe.vacioSalida}</p>`;
}

/**
 * Los dos botones de OCR.
 *
 * Enlaces planos, no `fetch`: la CSP declara `form-action 'none'` y
 * `connect-src 'self'`, y ninguna de las dos alcanza a una navegación de
 * primer nivel. Ir a Stripe haciendo clic funciona; intentar hablar con
 * Stripe desde este código no funcionaría, y es bueno que no funcione.
 *
 * El aviso de que el archivo SÍ se envía va aquí, pegado al botón, y no en
 * un pie de página. Toda la columna 1 acaba de demostrar que el PDF no sale
 * del navegador; cobrar por un servicio que rompe esa condición sin decirlo
 * en el mismo párrafo sería usar la confianza que acabamos de ganar para
 * esconder su excepción.
 */
function botonesDeOcr(t: Textos): string {
  return `
    <p class="ocr-aviso">${t.ocr.aviso}</p>
    <p class="ocr-botones">
      <a class="boton" href="${PRODUCTOS.ocrEstudiante.url}">
        ${t.ocr.estudiante(PRODUCTOS.ocrEstudiante.importeMxn)}
      </a>
      <a class="boton secundario" href="${PRODUCTOS.ocrEmpresa.url}">
        ${t.ocr.empresa(PRODUCTOS.ocrEmpresa.importeMxn)}
      </a>
    </p>`;
}
