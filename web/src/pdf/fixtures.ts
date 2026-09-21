import { PDFDocument, StandardFonts } from 'pdf-lib';

/**
 * PDF con capa de texto real: una página por cada cadena recibida.
 * Representa el caso "PDF nativo", que se convierte sin OCR.
 */
export async function makeTextPdf(pages: string[]): Promise<ArrayBuffer> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  for (const text of pages) {
    const page = doc.addPage([595, 842]); // A4 en puntos
    page.drawText(text, { x: 50, y: 780, size: 12, font });
  }
  const bytes = await doc.save();
  return bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength
  ) as ArrayBuffer;
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
  const bytes = await doc.save();
  return bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength
  ) as ArrayBuffer;
}
