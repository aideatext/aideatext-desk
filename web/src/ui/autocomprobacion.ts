import { textos, type Textos } from '../textos';

/**
 * Autocomprobación de la política de seguridad (CSP).
 *
 * La página afirma que el navegador tiene prohibido enviar datos fuera de
 * este dominio. Este módulo le da al visitante escéptico la forma de
 * comprobarlo: intenta una conexión externa delante de él y reporta lo que
 * de verdad pasó.
 *
 * ─────────────────────────────────────────────────────────────────────
 * POR QUÉ NO BASTA CON `try`/`catch` ALREDEDOR DE `fetch`
 * ─────────────────────────────────────────────────────────────────────
 *
 * Un `fetch` bloqueado por CSP rechaza con un `TypeError`. Un `fetch` que
 * falla porque no hay red rechaza con un `TypeError` indistinguible. Un
 * `catch` no puede separarlos, así que una demo construida sobre el
 * `catch` diría «bloqueado» estando el usuario en un avión sin wifi, y
 * seguiría diciendo «bloqueado» el día en que alguien borre la CSP del
 * `staticwebapp.config.json`.
 *
 * Eso es exactamente una prueba que no puede fallar: en un producto cuyo
 * argumento entero es «no nos creas, compruébalo», sería peor que no
 * tener botón.
 *
 * La señal que SÍ discrimina es el evento `securitypolicyviolation`, que
 * el navegador dispara únicamente cuando una directiva se activa. De ahí
 * los tres desenlaces distinguibles de `ResultadoAutocomprobacion`.
 *
 * La lógica vive aquí, separada del DOM y recibiendo su entorno por
 * parámetro, para que las pruebas puedan forzar los tres desenlaces. Una
 * versión atada a `document` y a `globalThis.fetch` sólo se podría probar
 * en el desenlace que se dé en la máquina de pruebas.
 */

/**
 * Destino del intento. Tiene que ser un origen externo: contra `'self'`
 * la CSP no se activaría y el botón no probaría nada.
 *
 * httpbin.org es un servicio público de eco: no tiene sesión, no guarda
 * nada y el cuerpo que se le manda es la palabra «prueba». Aunque la CSP
 * fallara y la petición saliera de verdad, no se filtra nada del usuario;
 * ese caso es precisamente el que el botón debe poder reportar.
 */
export const DESTINO_EXTERNO = 'https://httpbin.org/post';

/** Cuerpo del intento. Deliberadamente trivial. Ver `DESTINO_EXTERNO`. */
export const CUERPO_DE_PRUEBA = 'prueba';

/** Correo al que se enruta cualquier desenlace que no sea el esperado. */

export type ResultadoAutocomprobacion =
  /** El navegador activó una directiva `connect-src`. Lo esperado. */
  | { estado: 'bloqueado'; directiva: string }
  /** La petición llegó a su destino: la CSP no está protegiendo nada. */
  | { estado: 'no-bloqueado' }
  /** Falló sin violación reportada: sin red, o navegador que no informa. */
  | { estado: 'indeterminado' };

/**
 * Lo mínimo que la lógica necesita de un `SecurityPolicyViolationEvent`.
 *
 * Ambos campos son opcionales a propósito: `violatedDirective` está
 * marcado como obsoleto en la especificación y hay navegadores que sólo
 * rellenan `effectiveDirective`. Exigir el primero dejaría al botón
 * diciendo «indeterminado» en un navegador que sí bloqueó.
 */
export interface ViolacionCsp {
  violatedDirective?: string;
  effectiveDirective?: string;
}

/**
 * El entorno del que depende la comprobación. En producción lo construye
 * `entornoDelNavegador()`; en pruebas se sustituye por uno de mentira.
 */
export interface EntornoAutocomprobacion {
  escuchar(manejador: (e: ViolacionCsp) => void): void;
  dejarDeEscuchar(manejador: (e: ViolacionCsp) => void): void;
  /** Intenta la conexión externa. Resuelve si llegó, rechaza si no. */
  enviar(): Promise<unknown>;
  /**
   * Cede el control antes de leer el resultado.
   *
   * El rechazo del `fetch` y la entrega del evento de violación son dos
   * tareas distintas, y el rechazo puede llegar primero. Leer la bandera
   * sin esperar este turno produce «indeterminado» en un navegador que
   * acaba de bloquear: la carrera silenciosa convertida en mentira.
   */
  esperarUnTurno(): Promise<void>;
}

const PREFIJO_CONEXION = 'connect-src';

/**
 * Devuelve la directiva de conexión que se activó, o `null` si el evento
 * corresponde a otra directiva.
 *
 * El filtro importa: si el usuario tiene una extensión que provoca una
 * violación de `img-src` mientras el botón corre, contarla como prueba
 * de que la conexión fue bloqueada sería inventarse el resultado.
 */
export function directivaDeConexion(e: ViolacionCsp): string | null {
  for (const d of [e.violatedDirective, e.effectiveDirective]) {
    if (typeof d === 'string' && d.startsWith(PREFIJO_CONEXION)) return d;
  }
  return null;
}

export async function ejecutarAutocomprobacion(
  entorno: EntornoAutocomprobacion
): Promise<ResultadoAutocomprobacion> {
  // Caja mutable en vez de un `let` capturado: TypeScript no sigue las
  // asignaciones hechas dentro de un closure, así que un `let` inicializado
  // a `null` se quedaría estrechado a `null` y la rama de «bloqueado»
  // sería inalcanzable para el compilador.
  const visto: { directiva: string | null } = { directiva: null };

  const alViolar = (e: ViolacionCsp): void => {
    if (visto.directiva === null) visto.directiva = directivaDeConexion(e);
  };

  entorno.escuchar(alViolar);

  let llego = false;
  try {
    await entorno.enviar();
    llego = true;
  } catch {
    // Esperado cuando el navegador bloquea. También ocurre sin red: por
    // eso el `catch` por sí solo no decide nada aquí.
  }

  await entorno.esperarUnTurno();
  entorno.dejarDeEscuchar(alViolar);

  // El orden no es arbitrario. Si la petición LLEGÓ, llegó: los datos
  // salieron del equipo del usuario y ninguna violación suelta de otra
  // directiva cambia ese hecho. Decir «bloqueado» ahí sería el fallo más
  // caro que este botón puede cometer.
  if (llego) return { estado: 'no-bloqueado' };
  if (visto.directiva !== null) {
    return { estado: 'bloqueado', directiva: visto.directiva };
  }
  return { estado: 'indeterminado' };
}

/** Construye el entorno real del navegador. */
export function entornoDelNavegador(
  tiempoLimiteMs = 8000
): EntornoAutocomprobacion {
  return {
    escuchar: (m) =>
      document.addEventListener(
        'securitypolicyviolation',
        m as EventListener
      ),
    dejarDeEscuchar: (m) =>
      document.removeEventListener(
        'securitypolicyviolation',
        m as EventListener
      ),
    // Con un límite de tiempo: si la CSP estuviera rota y el destino
    // externo no respondiera, sin esto el botón se quedaría girando para
    // siempre. Al abortar, el resultado es «indeterminado», que es la
    // lectura honesta de «no lo sabemos».
    enviar: () =>
      fetch(DESTINO_EXTERNO, {
        method: 'POST',
        body: CUERPO_DE_PRUEBA,
        signal: AbortSignal.timeout(tiempoLimiteMs),
      }),
    esperarUnTurno: () => new Promise((r) => setTimeout(r, 50)),
  };
}

function escapar(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * HTML del veredicto.
 *
 * Los tres desenlaces se redactan enteros y distintos. Nada de un texto
 * de éxito con matices: si la CSP no protege, esta función lo dice con
 * todas sus letras.
 */
export function renderAutocomprobacion(
  r: ResultadoAutocomprobacion,
  t: Textos = textos()
): string {
  if (r.estado === 'bloqueado') {
    return `
      <p class="veredicto bien"><strong>${t.csp.bloqueadoTitulo}</strong></p>
      <p>${t.csp.bloqueadoDetalle}</p>
      <p>${t.csp.directivaActivada} <code>${escapar(r.directiva)}</code></p>
      <p class="apunte">${t.csp.bloqueadoConsola}</p>`;
  }

  if (r.estado === 'no-bloqueado') {
    return `
      <p class="veredicto mal"><strong>${t.csp.noBloqueadoTitulo}</strong></p>
      <p>${t.csp.noBloqueadoDetalle}</p>
      <p>${t.csp.avisanosYCorregimos}</p>`;
  }

  return `
    <p class="veredicto duda"><strong>${t.csp.indeterminadoTitulo}</strong></p>
    <p>${t.csp.indeterminadoDetalle}</p>
    <p>${t.csp.indeterminadoAlternativa}</p>
    <p>${t.csp.siQuieresQueLoRevisemos}</p>`;
}
