import { describe, it, expect } from 'vitest';
import {
  sumarConversion,
  leerTotal,
  debeMostrarse,
  renderContador,
  RUTA_CONTADOR,
  CUERPO_DEL_AVISO,
  UMBRAL_VISIBLE,
  type EntornoContador,
} from './contador';

/** Entorno falso que registra lo que el código intentó enviar. */
function entornoFalso(respuesta: {
  ok?: boolean;
  cuerpo?: unknown;
  lanza?: boolean;
}): { entorno: EntornoContador; llamadas: Array<{ ruta: string; method: string }> } {
  const llamadas: Array<{ ruta: string; method: string }> = [];
  return {
    llamadas,
    entorno: {
      enviar: async (ruta, opciones) => {
        llamadas.push({ ruta, method: opciones.method });
        if (respuesta.lanza) throw new TypeError('Failed to fetch');
        return {
          ok: respuesta.ok ?? true,
          json: async () => respuesta.cuerpo,
        };
      },
    },
  };
}

describe('sumarConversion', () => {
  it('manda un POST a la ruta del contador', async () => {
    const { entorno, llamadas } = entornoFalso({ cuerpo: { total: 1 } });
    sumarConversion(entorno);
    await new Promise((r) => setTimeout(r, 0));
    expect(llamadas).toEqual([{ ruta: RUTA_CONTADOR, method: 'POST' }]);
  });

  // LA REGLA QUE MANDA EN ESTE MÓDULO. El usuario vino a convertir su
  // documento; el contador es nuestro. Si el endpoint está caído, si un
  // bloqueador lo corta o si no hay red, su Markdown ya se descargó y no
  // puede enterarse de nada.
  it('no lanza aunque el envío falle', async () => {
    const { entorno } = entornoFalso({ lanza: true });
    expect(() => sumarConversion(entorno)).not.toThrow();
    await new Promise((r) => setTimeout(r, 0));
  });

  it('no devuelve nada: nadie puede condicionar la descarga a su resultado', () => {
    const { entorno } = entornoFalso({ cuerpo: { total: 9 } });
    expect(sumarConversion(entorno)).toBeUndefined();
  });
});

describe('leerTotal', () => {
  it('devuelve el total cuando la respuesta es buena', async () => {
    const { entorno } = entornoFalso({ cuerpo: { total: 1247 } });
    expect(await leerTotal(entorno)).toBe(1247);
  });

  // `null` significa «no lo sé». Un 0 se mostraría como cifra real y
  // diría que nadie ha convertido nada, que es una afirmación distinta.
  it('devuelve null —no 0— cuando no se puede saber', async () => {
    for (const caso of [
      { lanza: true },
      { ok: false },
      { cuerpo: {} },
      { cuerpo: { total: 'muchos' } },
      { cuerpo: null },
      { cuerpo: { total: -3 } },
    ]) {
      const { entorno } = entornoFalso(caso);
      expect(`${JSON.stringify(caso)} -> ${await leerTotal(entorno)}`).toBe(
        `${JSON.stringify(caso)} -> null`
      );
    }
  });

  it('trunca un total con decimales en vez de mostrarlo roto', async () => {
    const { entorno } = entornoFalso({ cuerpo: { total: 42.9 } });
    expect(await leerTotal(entorno)).toBe(42);
  });
});

describe('el umbral', () => {
  // «3 documentos convertidos» es prueba social NEGATIVA: resta. El
  // contador cuenta desde el primer día y se calla hasta que la cifra
  // dice algo.
  it('no se muestra por debajo del umbral', () => {
    expect(debeMostrarse(0)).toBe(false);
    expect(debeMostrarse(3)).toBe(false);
    expect(debeMostrarse(UMBRAL_VISIBLE - 1)).toBe(false);
  });

  it('se muestra a partir del umbral', () => {
    expect(debeMostrarse(UMBRAL_VISIBLE)).toBe(true);
    expect(debeMostrarse(1247)).toBe(true);
  });

  it('no se muestra cuando no se sabe', () => {
    expect(debeMostrarse(null)).toBe(false);
  });
});

describe('renderContador', () => {
  const plantilla = (n: string) => `${n} convertidos`;

  // Cadena vacía y no un recuadro con «—»: un hueco donde se anunció una
  // cifra es el mismo callejón silencioso que el botón mudo.
  it('devuelve cadena vacía por debajo del umbral', () => {
    expect(renderContador(3, plantilla)).toBe('');
    expect(renderContador(null, plantilla)).toBe('');
  });

  it('separa los miles según el idioma', () => {
    expect(renderContador(1247, plantilla, 'es')).toContain('1,247');
    expect(renderContador(1247, plantilla, 'en')).toContain('1,247');
  });

  it('usa la plantilla del idioma que recibe', () => {
    expect(renderContador(100, (n) => `${n} documents converted`, 'en')).toContain(
      'documents converted'
    );
  });
});

// ── La promesa y el hecho ────────────────────────────────────────────
//
// La página le dice al visitante qué se envía. Si eso deja de ser verdad,
// el sitio pasa de «compruébalo» a «créenos», que es justo lo contrario
// de lo que vende.
describe('lo que se dice que se envía es lo que se envía', () => {
  it('el aviso describe un POST sin cuerpo, y eso es lo que se manda', async () => {
    expect(CUERPO_DEL_AVISO).toContain('POST');
    expect(CUERPO_DEL_AVISO).toContain(RUTA_CONTADOR);
    expect(CUERPO_DEL_AVISO.toLowerCase()).toContain('sin cuerpo');

    // Y ahora el hecho: la llamada real no lleva `body` ni cabeceras.
    const llamadas: Array<Record<string, unknown>> = [];
    const entorno: EntornoContador = {
      enviar: async (_ruta, opciones) => {
        llamadas.push(opciones as unknown as Record<string, unknown>);
        return { ok: true, json: async () => ({ total: 1 }) };
      },
    };
    sumarConversion(entorno);
    await new Promise((r) => setTimeout(r, 0));

    expect(Object.keys(llamadas[0]).sort()).toEqual(['method']);
    expect(llamadas[0].body).toBeUndefined();
  });

  // Mismo origen, así que `connect-src 'self'` no cambia. Si alguien
  // apuntara el contador a otro dominio, la CSP lo bloquearía en
  // producción y el contador dejaría de sumar en silencio.
  it('la ruta es del mismo origen', () => {
    expect(RUTA_CONTADOR.startsWith('/')).toBe(true);
    expect(RUTA_CONTADOR).not.toMatch(/^https?:/);
  });
});
