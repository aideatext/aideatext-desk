import type { PdfDiagnosis } from '../pdf/diagnose';

const CONTACTO = 'first.contact.desk@aideatext.ai';

/**
 * Genera el HTML del informe de diagnóstico.
 *
 * Regla de copy (spec §2.4): un PDF no convertible en el navegador nunca
 * se presenta como un fallo. Es la entrada al servicio de OCR de pago.
 */
export function renderDiagnosis(d: PdfDiagnosis): string {
  const escaneadas = d.pages.filter((p) => p.kind === 'escaneado').length;
  // Se CUENTAN las de texto, no se restan las escaneadas. `pageCount -
  // escaneadas` metia las paginas en blanco en el saco de "con texto", y
  // `resumirPaginas` permite blancos tanto en `texto` como en `mixto` por
  // diseno: los separadores de capitulo y versos vacios son normales en
  // una tesis. Es la misma confusion de pagesBlank, ahora en la interfaz.
  const conTexto = d.pages.filter((p) => p.kind === 'texto').length;
  const enBlanco = d.pages.filter((p) => p.kind === 'vacia').length;

  if (d.convertibleInBrowser && d.overall === 'texto') {
    return `
      <p><strong>${d.pageCount}</strong> páginas: ${conTexto} con texto extraíble${
        enBlanco > 0 ? `, ${enBlanco} en blanco` : ''
      }.</p>
      <p>Se convierte aquí mismo, sin subir nada.</p>
      <button id="descargar">Descargar Markdown</button>`;
  }

  if (d.overall === 'mixto') {
    return `
      <p><strong>${d.pageCount}</strong> páginas: documento <strong>mixto</strong>.</p>
      <p>${conTexto} con texto, ${escaneadas} escaneadas${
        enBlanco > 0 ? `, ${enBlanco} en blanco` : ''
      }.</p>
      <p>Convertimos ahora las que tienen texto. Para las escaneadas hace
         falta OCR en servidor.</p>
      <button id="descargar">Descargar Markdown</button>
      <p>¿Necesitas también las escaneadas?
         <a href="mailto:${CONTACTO}">${CONTACTO}</a></p>`;
  }

  if (d.overall === 'escaneado') {
    return `
      <p><strong>${d.pageCount}</strong> páginas escaneadas, sin capa de texto.</p>
      <p>Este documento necesita OCR, que se procesa en servidor.
         Puedes probar <strong>una página gratis</strong> antes de decidir:
         elige la peor escaneada, para ver la calidad en el caso más difícil.</p>
      <p>Escríbenos a <a href="mailto:${CONTACTO}">${CONTACTO}</a>
         y evaluamos tu caso.</p>`;
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
    <p><strong>${d.pageCount}</strong> páginas, sin texto ni imágenes.</p>
    <p>Puede que el archivo esté dañado, protegido, o realmente vacío.</p>
    <p>Escríbenos a <a href="mailto:${CONTACTO}">${CONTACTO}</a>
       y lo revisamos contigo.</p>`;
}
