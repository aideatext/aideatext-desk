import type { PdfDiagnosis } from '../pdf/diagnose';
import { PRODUCTOS } from './pagos';

const CONTACTO = 'first.contact@aideatext.ai';

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
function botonesDeOcr(): string {
  return `
    <p class="ocr-aviso">
      El OCR <strong>sí necesita tu archivo</strong>: reconocer letras
      dentro de una imagen exige un modelo que corre en servidor. Se borra
      al entregarte el resultado; el detalle está en «Tratamiento de
      datos», abajo.
    </p>
    <p class="ocr-botones">
      <a class="boton" href="${PRODUCTOS.ocrEstudiante.url}">
        Soy estudiante · ${PRODUCTOS.ocrEstudiante.importeMxn} MXN
      </a>
      <a class="boton secundario" href="${PRODUCTOS.ocrEmpresa.url}">
        Empresa o profesional · ${PRODUCTOS.ocrEmpresa.importeMxn} MXN
      </a>
    </p>`;
}

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
      ${botonesDeOcr()}
      <p class="apunte">¿Dudas antes de pagar?
         <a href="mailto:${CONTACTO}">${CONTACTO}</a></p>`;
  }

  if (d.overall === 'escaneado') {
    // Se cuentan las ESCANEADAS, no `pageCount`. `resumirPaginas` devuelve
    // 'escaneado' por PRESENCIA, y admite blancos en ese veredicto igual que
    // en 'texto' y en 'mixto': una tesis de 199 paginas escaneadas con una
    // portada vectorial cae aqui con pageCount 200. Decir «200 paginas
    // escaneadas» inflaba el recuento, y encima es el numero sobre el que el
    // usuario decide si paga el OCR. Cuarta aparicion de los blancos
    // contados como otra cosa; por eso hay una prueba que lo fija.
    return `
      <p><strong>${escaneadas}</strong> páginas escaneadas, sin capa de texto${
        enBlanco > 0 ? `, y ${enBlanco} en blanco` : ''
      }.</p>
      <p>Este documento necesita OCR, que se procesa en servidor.
         Puedes probar <strong>una página gratis</strong> antes de decidir:
         elige la peor escaneada, para ver la calidad en el caso más difícil.
         Pídela en <a href="mailto:${CONTACTO}">${CONTACTO}</a>.</p>
      ${botonesDeOcr()}`;
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
