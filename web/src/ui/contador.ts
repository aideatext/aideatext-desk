/**
 * El contador público de conversiones.
 *
 * ─────────────────────────────────────────────────────────────────────
 * LA REGLA QUE MANDA AQUÍ
 * ─────────────────────────────────────────────────────────────────────
 *
 * El contador NUNCA puede estorbar a la conversión. Quien llega a esta
 * página viene a convertir su documento; el contador es nuestro, no suyo.
 * Por eso:
 *
 *   - `sumarConversion` no se espera (`void`, sin `await` en el camino
 *     del usuario) y se traga cualquier error.
 *   - Si el endpoint está caído, lento o bloqueado por un adblocker, la
 *     descarga del Markdown ocurre igual y el usuario no se entera.
 *
 * ─────────────────────────────────────────────────────────────────────
 * QUÉ SE ENVÍA
 * ─────────────────────────────────────────────────────────────────────
 *
 * Nada. Un `POST` con el cuerpo vacío. Ni el archivo, ni su nombre, ni su
 * tamaño, ni el número de páginas, ni nada que identifique a nadie.
 *
 * `CUERPO_DEL_AVISO` es esa misma verdad en forma de constante, y es lo
 * que la página enseña cuando el visitante pulsa «ver qué se envía». Si
 * alguien añade un dato al `fetch` de abajo y no lo añade aquí, la página
 * estaría mintiendo — y hay una prueba que compara los dos.
 */

/** Dónde vive el contador. Mismo origen: la CSP no cambia por esto. */
export const RUTA_CONTADOR = '/api/contador';

/**
 * El umbral por debajo del cual el contador NO se muestra.
 *
 * Un «3 documentos convertidos» es prueba social negativa: resta en vez
 * de sumar. El contador empieza a contar desde el primer día pero se
 * calla hasta que la cifra dice algo.
 */
export const UMBRAL_VISIBLE = 50;

/** Exactamente lo que viaja en la petición, para enseñárselo a quien pregunte. */
export const CUERPO_DEL_AVISO = `POST ${RUTA_CONTADOR}
(sin cuerpo)`;

export interface EntornoContador {
  enviar(ruta: string, opciones: { method: string }): Promise<{ ok: boolean; json(): Promise<unknown> }>;
}

const entornoReal: EntornoContador = {
  enviar: (ruta, opciones) => fetch(ruta, opciones),
};

/**
 * Suma 1 al contador. No lanza nunca y no devuelve nada útil a propósito:
 * quien la llama no debe poder condicionar nada a su resultado.
 */
export function sumarConversion(entorno: EntornoContador = entornoReal): void {
  void entorno
    .enviar(RUTA_CONTADOR, { method: 'POST' })
    .catch(() => undefined);
}

/**
 * Lee el total. Devuelve `null` cuando no se puede saber —endpoint caído,
 * respuesta rara, sin red—, y `null` significa «no lo sé», que es lo que
 * la interfaz tiene que mostrar en lugar de un 0 inventado.
 */
export async function leerTotal(
  entorno: EntornoContador = entornoReal
): Promise<number | null> {
  try {
    const r = await entorno.enviar(RUTA_CONTADOR, { method: 'GET' });
    if (!r.ok) return null;
    const cuerpo = (await r.json()) as { total?: unknown };
    const total = Number(cuerpo?.total);
    // `Number(undefined)` es NaN y `Number(null)` es 0: los dos tienen que
    // caer en `null`, no en un cero que se mostraria como cifra real.
    if (!Number.isFinite(total) || total < 0) return null;
    return Math.floor(total);
  } catch {
    return null;
  }
}

/** `true` si la cifra ya vale la pena enseñarla. */
export function debeMostrarse(total: number | null): boolean {
  return total !== null && total >= UMBRAL_VISIBLE;
}

/** Miles con separador, en el formato del idioma de la página. */
function conMiles(n: number, idioma: string): string {
  return new Intl.NumberFormat(idioma.startsWith('en') ? 'en-US' : 'es-MX').format(n);
}

/**
 * El HTML del contador, o cadena vacía si todavía no toca mostrarlo.
 *
 * Devolver `''` y no un recuadro con «—» es deliberado: un hueco vacío
 * donde se anunció una cifra es el mismo callejón silencioso que este
 * proyecto ya pagó una vez con el botón mudo.
 */
export function renderContador(
  total: number | null,
  plantilla: (n: string) => string,
  idioma = 'es'
): string {
  if (!debeMostrarse(total)) return '';
  return `<p class="contador">${plantilla(conMiles(total as number, idioma))}</p>`;
}
