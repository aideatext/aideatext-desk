import type { Idioma, Textos } from './tipos';
import { es } from './es';
import { en } from './en';

export type { Idioma, Textos };

/**
 * Los diccionarios disponibles.
 *
 * `Record<Idioma, Textos>` es lo que ata el mapa al tipo: añadir `'fr'` a
 * `Idioma` sin añadir aquí su diccionario NO COMPILA. Es la otra mitad de
 * la garantía — la interfaz impide que un idioma esté incompleto, y esto
 * impide que un idioma declarado no exista.
 */
export const DICCIONARIOS: Record<Idioma, Textos> = { es, en };

/** El idioma por defecto cuando la página no declara uno reconocible. */
export const IDIOMA_POR_DEFECTO: Idioma = 'es';

/**
 * Qué idioma habla esta página.
 *
 * Se lee de `<html lang>`, que es de donde lo lee también el navegador y
 * el lector de pantalla: una sola fuente de verdad, ya escrita en el HTML,
 * en vez de una segunda declaración que se puede desincronizar.
 *
 * Acepta la forma larga (`es-MX`, `en-US`) quedándose con la subetiqueta
 * principal, que es como se identifican los idiomas en BCP 47. Un `lang`
 * vacío, ausente o desconocido cae al español y NO revienta: una página
 * mal etiquetada tiene que seguir funcionando.
 */
export function idiomaDe(lang: string | null | undefined): Idioma {
  const principal = (lang ?? '').trim().toLowerCase().split('-')[0];
  return principal in DICCIONARIOS ? (principal as Idioma) : IDIOMA_POR_DEFECTO;
}

/**
 * Los textos de la página actual.
 *
 * Se resuelve en cada llamada y no en una constante de módulo: una
 * constante se evaluaría al importar, antes de que nada garantice que el
 * `<html>` ya está, y dejaría el idioma congelado para siempre.
 */
export function textos(documento?: Document): Textos {
  // Sin `document` no se puede saber el idioma, y eso NO es un error: pasa
  // en las pruebas —que corren en Node— y pasaria en un worker o en un
  // render de servidor. Cae al idioma por defecto en vez de reventar.
  const d = documento ?? (typeof document === 'undefined' ? null : document);
  return DICCIONARIOS[idiomaDe(d?.documentElement.lang)];
}
