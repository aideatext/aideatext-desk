import { pdfjs, loadOptions } from './pdfjs';

/**
 * Texto del PDF **tal cual sale**, con su ruido de maquetación.
 *
 * Es el término de comparación del recuadro de ahorro: lo que le costaría
 * al usuario pegar su PDF en un chat de IA, antes de que DESK lo limpie.
 * Por eso reproduce la extracción ingenua y no la buena:
 *
 * - Respeta los saltos de línea de la página (`hasEOL`), que es lo que
 *   produce copiar y pegar desde un lector de PDF.
 * - No colapsa espacios repetidos: la sangría de una tabla o los puntos
 *   suspensivos de un índice son exactamente el ruido que se quiere medir.
 * - No omite ninguna página, ni siquiera las escaneadas o en blanco.
 *
 * NO se une con espacios entre fragmentos, al contrario que `toMarkdown`:
 * eso inventaría caracteres que el PDF no tiene e inflaría artificialmente
 * el lado «antes» de la comparación. El número que vende el producto no
 * puede depender de una decisión de formato tomada a nuestro favor.
 *
 * Se lee en una pasada propia en vez de añadir un campo a
 * `ConversionResult`, para no tocar la conversión, que ya funciona y está
 * probada.
 */
export async function extraerTextoCrudo(data: ArrayBuffer): Promise<string> {
  // Se retiene la TAREA, no solo su promesa: sin `destroy()` el worker
  // dedicado y la copia completa del archivo del usuario sobreviven al
  // rechazo. Misma razón, y mismo `finally`, que en `diagnose.ts`.
  const task = pdfjs.getDocument(loadOptions(data));
  const partes: string[] = [];

  try {
    const doc = await task.promise;
    for (let n = 1; n <= doc.numPages; n++) {
      const page = await doc.getPage(n);
      const content = await page.getTextContent();
      for (const item of content.items) {
        if (!('str' in item)) continue;
        partes.push(item.str);
        if (item.hasEOL) partes.push('\n');
      }
    }
  } finally {
    await task.destroy();
  }

  return partes.join('');
}
