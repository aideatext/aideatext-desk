import { PDFDocument, StandardFonts } from 'pdf-lib';

/**
 * Extrae un `ArrayBuffer` propio a partir de la vista que devuelve pdf-lib.
 *
 * El `slice` respeta `byteOffset`/`byteLength` en vez de devolver el búfer
 * subyacente completo, que es el error clásico aquí. El `as ArrayBuffer` es
 * necesario porque la librería moderna de TypeScript tipa `.buffer` como
 * `ArrayBufferLike`; es correcto porque pdf-lib siempre asigna un
 * `ArrayBuffer` común, nunca un `SharedArrayBuffer`.
 */
function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength
  ) as ArrayBuffer;
}

/** Caracteres por línea. A 12pt Helvetica caben holgados en A4 con margen de 50pt. */
const MAX_CARACTERES_POR_LINEA = 60;

/** Reparte un texto en líneas que quepan en el ancho de la página. */
function repartirEnLineas(texto: string): string[] {
  const lineas: string[] = [];
  let actual = '';
  for (const palabra of texto.split(' ')) {
    if (!palabra) continue;
    const candidata = actual ? `${actual} ${palabra}` : palabra;
    if (candidata.length > MAX_CARACTERES_POR_LINEA) {
      if (actual) lineas.push(actual);
      actual = palabra;
    } else {
      actual = candidata;
    }
  }
  if (actual) lineas.push(actual);
  return lineas;
}

/**
 * PDF con capa de texto real: una página por cada cadena recibida.
 * Representa el caso "PDF nativo", que se convierte sin OCR.
 *
 * ⚠️ El texto se reparte en varias líneas, y eso NO es cosmético.
 * Una sola llamada a `drawText` con un texto largo escribe una única línea
 * que se sale de la página, y PDF.js entonces extrae solo lo que cabe:
 * **exactamente ~101 caracteres, sin importar cuánto se haya escrito**
 * (medido: 30 repeticiones y 200 repeticiones extraen los mismos 101).
 * Frente al umbral de 100 caracteres de `diagnose.ts` eso dejaba un margen
 * de UN carácter, y ningún `repeat()` podía ampliarlo. Cualquier cambio de
 * versión de PDF.js o de métricas de fuente habría volteado la prueba a
 * rojo sin explicación aparente.
 * Con reparto en líneas la extracción escala: 239 caracteres para el mismo
 * texto, margen de 139.
 */
export async function makeTextPdf(pages: string[]): Promise<ArrayBuffer> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  for (const text of pages) {
    const page = doc.addPage([595, 842]); // A4 en puntos
    repartirEnLineas(text).forEach((linea, i) => {
      page.drawText(linea, { x: 50, y: 780 - i * 16, size: 12, font });
    });
  }
  return toArrayBuffer(await doc.save());
}

/**
 * PNG de 1x1 píxel, en base64.
 *
 * Se incrusta como imagen real —no como rectángulo dibujado— para que el
 * PDF contenga una operación `paintImageXObject` auténtica. Si el fixture
 * usara `drawRectangle`, el diagnóstico tendría que aceptar operaciones de
 * relleno como señal de escaneo, y entonces una página con un simple borde
 * quedaría mal clasificada.
 */
const PNG_1X1 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

/**
 * PDF sin texto extraíble: cada página contiene únicamente una imagen.
 * Representa el caso "escaneado", que requiere OCR en servidor.
 */
export async function makeImagePdf(pageCount: number): Promise<ArrayBuffer> {
  const doc = await PDFDocument.create();
  const png = await doc.embedPng(
    Uint8Array.from(atob(PNG_1X1), (c) => c.charCodeAt(0))
  );
  for (let i = 0; i < pageCount; i++) {
    const page = doc.addPage([595, 842]);
    page.drawImage(png, { x: 40, y: 40, width: 515, height: 762 });
  }
  return toArrayBuffer(await doc.save());
}
