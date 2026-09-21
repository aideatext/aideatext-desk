/**
 * Invariante: **toda tarea de carga que se crea, se destruye** — tanto si el
 * PDF carga bien como si `getDocument` rechaza.
 *
 * Vive en su propio archivo porque necesita `vi.mock` del modulo `./pdfjs`, y
 * el mock se aplica a todo el archivo. El resto de la suite prueba contra
 * PDF.js real, sin dobles; esa separacion es deliberada.
 *
 * Por que hace falta mockear: la fuga no es observable desde fuera. Con
 * `getDocument` fuera del `try`, un PDF ilegible rechaza igual y la suite
 * entera sigue en verde (comprobado por mutacion), porque el worker retenido
 * y la copia del archivo no se manifiestan en el resultado de la funcion. La
 * unica forma de afirmar que el `finally` corrio es contar las llamadas a
 * `task.destroy()`. `vi.spyOn(pdfjs, 'getDocument')` no sirve: el namespace de
 * un modulo ESM no es configurable.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

const creadas: number[] = [];
const destruidas: number[] = [];

vi.mock('./pdfjs', async () => {
  const real = await vi.importActual<typeof import('./pdfjs')>('./pdfjs');
  return {
    ...real,
    pdfjs: {
      ...real.pdfjs,
      getDocument(opts: unknown) {
        const task = (real.pdfjs as { getDocument: (o: unknown) => any }).getDocument(opts);
        creadas.push(1);
        const original = task.destroy.bind(task);
        task.destroy = async () => {
          destruidas.push(1);
          return original();
        };
        return task;
      },
    },
  };
});

const { diagnosePdf } = await import('./diagnose');
const { pdfToMarkdown } = await import('./toMarkdown');
const { makeTextPdf } = await import('./fixtures');

const LARGO = 'investigacion cualitativa '.repeat(10);

/** Bytes que no son un PDF: `getDocument` rechaza con InvalidPDFException. */
function pdfIlegible(): ArrayBuffer {
  return new TextEncoder().encode('esto no es un PDF').buffer as ArrayBuffer;
}

beforeEach(() => {
  creadas.length = 0;
  destruidas.length = 0;
});

describe('la tarea de carga siempre se destruye', () => {
  it('cuando getDocument rechaza', async () => {
    // Este es el camino que el usuario alcanza primero con un PDF cifrado o
    // corrupto, y el que la lista de verificacion final del plan ejercita.
    await expect(diagnosePdf(pdfIlegible())).rejects.toThrow(/Invalid PDF/i);

    expect(creadas.length).toBe(1);
    expect(destruidas.length).toBe(creadas.length);
  });

  it('cuando la conversion termina bien', async () => {
    // `pdfToMarkdown` abre dos tareas: la de `diagnosePdf` y la suya.
    await pdfToMarkdown(await makeTextPdf([LARGO]));

    expect(creadas.length).toBe(2);
    expect(destruidas.length).toBe(creadas.length);
  });
});
