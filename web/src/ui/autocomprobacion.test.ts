import { describe, it, expect } from 'vitest';
import {
  ejecutarAutocomprobacion,
  renderAutocomprobacion,
  directivaDeConexion,
  DESTINO_EXTERNO,
  type EntornoAutocomprobacion,
  type ViolacionCsp,
  type ResultadoAutocomprobacion,
} from './autocomprobacion';

/**
 * Estas pruebas existen por una razón concreta: un botón que siempre
 * dijera «bloqueado» sería indistinguible de uno que funciona, y no vale
 * nada. Así que lo que se fija aquí, sobre todo, son los desenlaces que
 * NO son el esperado — `no-bloqueado` e `indeterminado` —, porque son los
 * que una implementación rota nunca alcanza.
 */

interface Guion {
  /** Qué hace el intento de conexión. */
  intento: 'rechaza' | 'resuelve';
  /** Violaciones que el navegador entrega, y cuándo. */
  violaciones?: Array<{ evento: ViolacionCsp; cuando: 'al-enviar' | 'en-el-turno' }>;
}

/** Registro de lo que el entorno vio hacer al código bajo prueba. */
interface Registro {
  entorno: EntornoAutocomprobacion;
  escuchando: number;
  turnos: number;
  envios: number;
}

function entornoFalso(guion: Guion): Registro {
  const manejadores: Array<(e: ViolacionCsp) => void> = [];
  const reg = {
    escuchando: 0,
    turnos: 0,
    envios: 0,
  } as Registro;

  const emitir = (cuando: 'al-enviar' | 'en-el-turno'): void => {
    for (const v of guion.violaciones ?? []) {
      if (v.cuando === cuando) for (const m of [...manejadores]) m(v.evento);
    }
  };

  reg.entorno = {
    escuchar: (m) => {
      manejadores.push(m);
      reg.escuchando++;
    },
    dejarDeEscuchar: (m) => {
      const i = manejadores.indexOf(m);
      if (i >= 0) manejadores.splice(i, 1);
      reg.escuchando--;
    },
    enviar: async () => {
      reg.envios++;
      emitir('al-enviar');
      if (guion.intento === 'rechaza') {
        // El mismo error que produce un `fetch` bloqueado por CSP... y
        // también el que produce estar sin red. Indistinguibles: ese es
        // justamente el motivo de que exista este módulo.
        throw new TypeError('Failed to fetch');
      }
      return { ok: true };
    },
    esperarUnTurno: async () => {
      reg.turnos++;
      emitir('en-el-turno');
    },
  };

  return reg;
}

const violacionConnect: ViolacionCsp = {
  violatedDirective: "connect-src 'self'",
  effectiveDirective: 'connect-src',
};

describe('ejecutarAutocomprobacion', () => {
  it('reporta «bloqueado» y la directiva cuando el navegador la activa', async () => {
    const r = entornoFalso({
      intento: 'rechaza',
      violaciones: [{ evento: violacionConnect, cuando: 'en-el-turno' }],
    });
    const res = await ejecutarAutocomprobacion(r.entorno);
    expect(res).toEqual({ estado: 'bloqueado', directiva: "connect-src 'self'" });
  });

  // El desenlace que una demo falsa nunca alcanza: si la petición llega,
  // la CSP no está protegiendo nada y hay que decirlo.
  it('reporta «no-bloqueado» cuando la petición sí llega', async () => {
    const r = entornoFalso({ intento: 'resuelve' });
    const res = await ejecutarAutocomprobacion(r.entorno);
    expect(res).toEqual({ estado: 'no-bloqueado' });
  });

  // El otro desenlace que una demo falsa nunca alcanza: un `fetch` que
  // falla sin violación es el usuario sin red, no una prueba de nada.
  it('reporta «indeterminado» cuando falla sin violación reportada', async () => {
    const r = entornoFalso({ intento: 'rechaza' });
    const res = await ejecutarAutocomprobacion(r.entorno);
    expect(res).toEqual({ estado: 'indeterminado' });
  });

  it('no cuenta la violación de otra directiva como bloqueo de conexión', async () => {
    const r = entornoFalso({
      intento: 'rechaza',
      violaciones: [
        {
          evento: {
            violatedDirective: "img-src 'self'",
            effectiveDirective: 'img-src',
          },
          cuando: 'en-el-turno',
        },
      ],
    });
    const res = await ejecutarAutocomprobacion(r.entorno);
    expect(res).toEqual({ estado: 'indeterminado' });
  });

  // Honestidad por encima del relato: si los datos salieron, salieron.
  // Una violación suelta de otra cosa no puede reescribir ese hecho.
  it('sigue diciendo «no-bloqueado» aunque llegue una violación suelta', async () => {
    const r = entornoFalso({
      intento: 'resuelve',
      violaciones: [{ evento: violacionConnect, cuando: 'en-el-turno' }],
    });
    const res = await ejecutarAutocomprobacion(r.entorno);
    expect(res).toEqual({ estado: 'no-bloqueado' });
  });

  it('acepta navegadores que sólo rellenan effectiveDirective', async () => {
    const r = entornoFalso({
      intento: 'rechaza',
      violaciones: [
        { evento: { effectiveDirective: 'connect-src' }, cuando: 'en-el-turno' },
      ],
    });
    const res = await ejecutarAutocomprobacion(r.entorno);
    expect(res).toEqual({ estado: 'bloqueado', directiva: 'connect-src' });
  });

  // Control de la carrera: el evento se entrega DESPUÉS de que el envío
  // rechace. Si el código leyera la bandera sin esperar el turno, esta
  // prueba diría «indeterminado» y el botón mentiría en un navegador que
  // acaba de bloquear de verdad.
  it('espera un turno antes de leer el resultado', async () => {
    const r = entornoFalso({
      intento: 'rechaza',
      violaciones: [{ evento: violacionConnect, cuando: 'en-el-turno' }],
    });
    const res = await ejecutarAutocomprobacion(r.entorno);
    expect(res.estado).toBe('bloqueado');
    expect(r.turnos).toBe(1);
  });

  it('también detecta la violación si llega durante el envío', async () => {
    const r = entornoFalso({
      intento: 'rechaza',
      violaciones: [{ evento: violacionConnect, cuando: 'al-enviar' }],
    });
    const res = await ejecutarAutocomprobacion(r.entorno);
    expect(res.estado).toBe('bloqueado');
  });

  it('desregistra el escucha al terminar, en los tres desenlaces', async () => {
    for (const guion of [
      { intento: 'resuelve' } as Guion,
      { intento: 'rechaza' } as Guion,
      {
        intento: 'rechaza',
        violaciones: [{ evento: violacionConnect, cuando: 'en-el-turno' }],
      } as Guion,
    ]) {
      const r = entornoFalso(guion);
      await ejecutarAutocomprobacion(r.entorno);
      expect(r.escuchando).toBe(0);
      expect(r.envios).toBe(1);
    }
  });

  // El sitio se sirve desde DOS dominios desde el cambio de nombre:
  // `aidesk.aideatext.ai` (el nuevo, canónico) y `desk.aideatext.ai` (el
  // viejo, que se deja vivo para no matar los enlaces ya compartidos).
  // Los dos son «el propio origen» para `connect-src 'self'`, así que el
  // destino de la comprobación no puede ser ninguno: contra ellos la CSP
  // no se activaría y el botón demostraría lo contrario de lo que dice.
  it('apunta a un origen externo: contra el propio la CSP no se activaría', () => {
    const propios = [
      'https://aidesk.aideatext.ai',
      'https://desk.aideatext.ai',
    ];
    expect(propios).not.toContain(new URL(DESTINO_EXTERNO).origin);
    expect(DESTINO_EXTERNO.startsWith('https://')).toBe(true);
  });
});

describe('directivaDeConexion', () => {
  it('prefiere violatedDirective cuando ambos están', () => {
    expect(directivaDeConexion(violacionConnect)).toBe("connect-src 'self'");
  });

  it('devuelve null si ninguna directiva es de conexión', () => {
    expect(
      directivaDeConexion({ violatedDirective: 'script-src', effectiveDirective: 'script-src' })
    ).toBeNull();
  });

  it('devuelve null con un evento vacío', () => {
    expect(directivaDeConexion({})).toBeNull();
  });

  // `connect-srcs` no existe, pero el prefijo suelto lo aceptaría; se fija
  // que al menos no se confunda con una directiva de otra familia que
  // empiece parecido.
  it('no confunde otras directivas', () => {
    expect(directivaDeConexion({ violatedDirective: 'default-src' })).toBeNull();
  });
});

describe('renderAutocomprobacion', () => {
  const html = (r: ResultadoAutocomprobacion): string => renderAutocomprobacion(r);

  it('muestra la directiva que se activó', () => {
    expect(html({ estado: 'bloqueado', directiva: "connect-src 'self'" })).toContain(
      "connect-src 'self'"
    );
  });

  it('en el caso bloqueado dice que el navegador lo impidió', () => {
    const s = html({ estado: 'bloqueado', directiva: "connect-src 'self'" });
    expect(s).toContain('impidió');
  });

  // Lo que no puede pasar nunca: que el caso roto se lea como un éxito.
  it('en el caso no-bloqueado dice sin rodeos que la política no funciona', () => {
    const s = html({ estado: 'no-bloqueado' });
    expect(s).toContain('no está funcionando');
    expect(s).not.toContain('impidió');
    expect(s).toContain('first.contact.desk@aideatext.ai');
  });

  it('en el caso indeterminado lo llama no concluyente y ofrece salida', () => {
    const s = html({ estado: 'indeterminado' });
    expect(s).toContain('no concluyente');
    expect(s).not.toContain('impidió');
    expect(s).toContain('first.contact.desk@aideatext.ai');
  });

  it('los tres desenlaces producen textos distintos', () => {
    const tres = [
      html({ estado: 'bloqueado', directiva: 'connect-src' }),
      html({ estado: 'no-bloqueado' }),
      html({ estado: 'indeterminado' }),
    ];
    expect(new Set(tres).size).toBe(3);
  });

  it('nunca dice «no se puede»', () => {
    for (const s of [
      html({ estado: 'bloqueado', directiva: 'connect-src' }),
      html({ estado: 'no-bloqueado' }),
      html({ estado: 'indeterminado' }),
    ]) {
      expect(s.toLowerCase()).not.toContain('no se puede');
    }
  });

  // La directiva viene del navegador y se inserta en HTML. No es una vía
  // de ataque plausible, pero escapar cuesta una línea y no escapar es la
  // clase de descuido que contradice el argumento de la página.
  it('escapa la directiva antes de meterla en el HTML', () => {
    const s = html({ estado: 'bloqueado', directiva: '<img src=x onerror=1>' });
    expect(s).not.toContain('<img');
    expect(s).toContain('&lt;img');
  });
});
