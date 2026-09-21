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

  if (d.convertibleInBrowser && d.overall === 'texto') {
    return `
      <p><strong>${d.pageCount}</strong> páginas, todas con texto extraíble.</p>
      <p>Se convierte aquí mismo, sin subir nada.</p>
      <button id="descargar">Descargar Markdown</button>`;
  }

  if (d.overall === 'mixto') {
    return `
      <p><strong>${d.pageCount}</strong> páginas: documento <strong>mixto</strong>.</p>
      <p>${d.pageCount - escaneadas} con texto, ${escaneadas} escaneadas.</p>
      <p>Convertimos ahora las que tienen texto. Para las escaneadas hace
         falta OCR en servidor.</p>
      <button id="descargar">Descargar Markdown</button>
      <p>¿Necesitas también las escaneadas?
         <a href="mailto:${CONTACTO}">${CONTACTO}</a></p>`;
  }

  return `
    <p><strong>${d.pageCount}</strong> páginas escaneadas, sin capa de texto.</p>
    <p>Este documento necesita OCR, que se procesa en servidor.
       Puedes probar <strong>una página gratis</strong> antes de decidir:
       elige la peor escaneada, para ver la calidad en el caso más difícil.</p>
    <p>Escríbenos a <a href="mailto:${CONTACTO}">${CONTACTO}</a>
       y evaluamos tu caso.</p>`;
}
