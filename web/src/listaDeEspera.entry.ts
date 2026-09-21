/**
 * Conexión de la comprobación de tarifa con el DOM.
 *
 * Las columnas 2 y 3 todavía no existen como servicio: lo único que hace
 * esta página por ellas es decir cuánto costarán y recoger a quien quiera
 * que le avisemos. Ese «avísame» es un enlace `mailto:`, no un formulario:
 * la CSP de este sitio declara `connect-src 'self'` y `form-action 'none'`,
 * así que un formulario hacia un servicio externo no se enviaría — la
 * página se rompería a sí misma en producción mientras presume de que
 * nada sale de aquí.
 *
 * Aquí sólo hay cables. La decisión de precio vive en `./ui/instituciones`,
 * sin DOM, donde se puede probar el caso que importa:
 * `@comunidad.unam.mx` es la UNAM y `@notunam.mx` no.
 */
import { tarifaPara } from './ui/instituciones';

const campos = document.querySelectorAll<HTMLInputElement>('input.correo-tarifa');

for (const campo of campos) {
  // El veredicto de cada campo es el elemento marcado dentro de su mismo
  // bloque. Si falta, no se ata nada: ningún cable se ejecuta a ciegas.
  const veredicto = campo
    .closest('.tarifa')
    ?.querySelector<HTMLElement>('.tarifa-veredicto');
  if (!veredicto) continue;

  const evaluar = (): void => {
    const valor = campo.value.trim();
    if (valor === '') {
      veredicto.textContent = '';
      veredicto.className = 'tarifa-veredicto';
      return;
    }
    const t = tarifaPara(valor);
    // `textContent`, nunca `innerHTML`: lo que escribe el usuario no
    // vuelve a la página como HTML.
    veredicto.textContent = t.mensaje;
    veredicto.className =
      'tarifa-veredicto ' + (t.institucional ? 'bien' : 'duda');
  };

  campo.addEventListener('input', evaluar);
  campo.addEventListener('change', evaluar);
}
