import { describe, it, expect } from 'vitest';
import { extraerTextoCrudo } from './textoCrudo';
import { pdfToMarkdown } from './toMarkdown';
import { makeTextPdf, makeImagePdf } from './fixtures';

const LARGO = 'investigacion cualitativa '.repeat(10); // ~260 caracteres

describe('extraerTextoCrudo', () => {
  it('devuelve el texto de todas las paginas', async () => {
    const crudo = await extraerTextoCrudo(await makeTextPdf([LARGO, LARGO]));
    expect(crudo).toContain('investigacion cualitativa');
    expect(crudo.length).toBeGreaterThan(400);
  });

  // Lo que distingue esta extraccion de la de `toMarkdown`: conserva los
  // saltos de linea de la maquetacion. Si se perdieran, el lado «antes» de
  // la comparacion de tokens seria mas pequeño que el texto real del PDF y
  // el ahorro anunciado saldria peor de lo que es.
  it('conserva los saltos de linea de la pagina', async () => {
    const crudo = await extraerTextoCrudo(await makeTextPdf([LARGO]));
    expect(crudo).toContain('\n');
  });

  // Y lo que NO hace: no añade encabezados, ni espacios entre fragmentos,
  // ni colapsa nada. Es el PDF, no nuestro producto.
  it('no incluye los encabezados que inventa el Markdown', async () => {
    const crudo = await extraerTextoCrudo(await makeTextPdf([LARGO]));
    expect(crudo).not.toContain('## Página');
  });

  it('no devuelve texto de un PDF escaneado', async () => {
    const crudo = await extraerTextoCrudo(await makeImagePdf(2));
    expect(crudo.trim()).toBe('');
  });

  // La prueba incomoda, y la razon de que esta medida exista. Con el
  // conversor actual el Markdown NO es mas pequeño que el texto del PDF:
  // repite el mismo texto, le mete un espacio entre cada fragmento y le
  // añade un encabezado por pagina. Se fija aqui para que nadie construya
  // sobre la suposicion contraria, y para que el dia en que la conversion
  // limpie de verdad (encabezados corrientes, numeros de pagina, guiones
  // de corte) esta prueba avise de que el mundo cambio.
  it('hoy el Markdown no es mas corto que el texto crudo del PDF', async () => {
    const pdf = await makeTextPdf([LARGO, LARGO, LARGO]);
    const crudo = await extraerTextoCrudo(pdf);
    const md = (await pdfToMarkdown(pdf)).markdown;
    expect(crudo.length).toBeGreaterThan(0);
    expect(md.length).toBeGreaterThanOrEqual(crudo.length);
  });
});
