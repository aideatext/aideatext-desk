import { describe, it, expect } from 'vitest';
import {
  CARACTERES_POR_TOKEN,
  estimarTokens,
  ahorro,
  porcentajeAhorrado,
  renderAhorro,
  type MedidaDeAhorro,
} from './tokens';

describe('estimarTokens', () => {
  it('cuenta cuatro caracteres por token', () => {
    expect(CARACTERES_POR_TOKEN).toBe(4);
    expect(estimarTokens('abcd')).toBe(1);
    expect(estimarTokens('a'.repeat(4000))).toBe(1000);
  });

  it('un resto suelto sigue costando un token entero', () => {
    expect(estimarTokens('abcde')).toBe(2);
  });

  it('un texto vacio no cuesta nada', () => {
    expect(estimarTokens('')).toBe(0);
  });
});

describe('ahorro', () => {
  it('devuelve la fraccion ahorrada', () => {
    expect(ahorro(100, 40)).toBeCloseTo(0.6);
    // El ejemplo del dueño del producto, con sus cifras.
    expect(Math.round(ahorro(48300, 19100) * 100)).toBe(60);
  });

  // La prueba que impide «arreglar» el signo con un Math.max(0, …). Una
  // funcion que no puede dar malas noticias no esta midiendo nada.
  it('es negativa cuando el resultado es mas grande que el origen', () => {
    expect(ahorro(100, 130)).toBeCloseTo(-0.3);
    expect(ahorro(100, 130)).toBeLessThan(0);
  });

  it('es cero cuando no hay nada que ahorrar', () => {
    expect(ahorro(0, 0)).toBe(0);
    expect(ahorro(-5, 10)).toBe(0);
  });
});

const medida = (over: Partial<MedidaDeAhorro> = {}): MedidaDeAhorro => ({
  caracteresPdf: 193_200,
  caracteresMarkdown: 76_400,
  paginasEscaneadas: 0,
  ...over,
});

describe('renderAhorro', () => {
  it('muestra las dos cifras de tokens con separador de miles', () => {
    const html = renderAhorro(medida());
    expect(html).toContain('~48,300 tokens');
    expect(html).toContain('~19,100 tokens');
  });

  it('anuncia el porcentaje cuando de verdad se ahorra', () => {
    const html = renderAhorro(medida());
    expect(porcentajeAhorrado(medida())).toBe(60);
    expect(html).toContain('Ahorras 60%');
    // Control: la rama honesta NO debe aparecer aqui. Sin esto, un render
    // que concatenara los dos textos pasaria las dos pruebas.
    expect(html.toLowerCase()).not.toContain('no ahorras');
  });

  // El caso que este producto no puede maquillar. Se mide de verdad, asi
  // que puede salir negativo -- y con el conversor actual sale negativo a
  // menudo, porque el Markdown repite el texto del PDF y encima le añade
  // un encabezado por pagina.
  it('dice con todas sus letras que no hay ahorro cuando no lo hay', () => {
    const html = renderAhorro(
      medida({ caracteresPdf: 100_000, caracteresMarkdown: 102_000 })
    );
    expect(html).toContain('no ahorras tokens');
    expect(html).not.toContain('Ahorras ');
    // Y la cifra mayor se muestra tal cual, sin recortarla al tamaño del PDF.
    expect(html).toContain('~25,500 tokens');
  });

  it('tampoco anuncia ahorro por debajo del uno por ciento', () => {
    const html = renderAhorro(
      medida({ caracteresPdf: 100_000, caracteresMarkdown: 99_800 })
    );
    expect(html).not.toContain('Ahorras ');
    expect(html).toContain('no ahorras tokens');
  });

  // Un documento con paginas escaneadas produce un Markdown mas pequeño
  // porque le FALTA contenido, no porque el formato sea mas eficiente.
  // Cobrarse eso como ahorro seria la mentira mas facil de esta pantalla.
  it('avisa cuando la comparacion no es pareja por paginas escaneadas', () => {
    const html = renderAhorro(medida({ paginasEscaneadas: 12 }));
    expect(html).toContain('12 páginas escaneadas');
    expect(html).toContain('contenido que no está');
  });

  it('no inventa el aviso cuando no hay paginas escaneadas', () => {
    expect(renderAhorro(medida())).not.toContain('escaneada');
  });

  it('singulariza una sola pagina escaneada', () => {
    const html = renderAhorro(medida({ paginasEscaneadas: 1 }));
    expect(html).toContain('1 página escaneada,');
  });

  it('no compara contra la nada cuando el PDF no dio texto', () => {
    const html = renderAhorro(
      medida({ caracteresPdf: 0, caracteresMarkdown: 0 })
    );
    expect(html).toContain('No hay nada que medir');
    expect(html).not.toContain('Ahorras ');
  });
});
