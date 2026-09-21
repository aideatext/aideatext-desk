/**
 * Conexión de la autocomprobación con el DOM.
 *
 * Va en un módulo de entrada aparte, y no dentro de `main.ts`, para dejar
 * intacto el archivo que hace el trabajo que el usuario vino a hacer:
 * arrastrar, diagnosticar y descargar. Este botón es argumento, no
 * función esencial, y no tenía por qué tocar aquello.
 *
 * Lo que ese reparto NO da es aislamiento en producción: se comprobó en
 * el `dist` y Vite funde los dos `<script type="module">` del HTML en un
 * solo `chunk`, así que un fallo en el cuerpo de un módulo sí puede
 * arrastrar al otro. El comentario decía lo contrario hasta que se miró
 * la salida del build. Se deja escrito para que nadie vuelva a apoyarse
 * en una separación que el empaquetador deshace.
 *
 * La lógica está en `./ui/autocomprobacion`, sin DOM, para que se pueda
 * probar en los tres desenlaces. Aquí sólo hay cables, y ninguno se
 * ejecuta si los elementos no están.
 */
import {
  ejecutarAutocomprobacion,
  entornoDelNavegador,
  renderAutocomprobacion,
} from './ui/autocomprobacion';

const boton = document.getElementById('probar-csp') as HTMLButtonElement | null;
const salida = document.getElementById('resultado-csp') as HTMLDivElement | null;

if (boton && salida) {
  const etiquetaOriginal = boton.textContent ?? '';

  boton.addEventListener('click', () => {
    void (async () => {
      boton.disabled = true;
      boton.textContent = 'Intentando…';
      salida.innerHTML =
        '<p class="apunte">Intentando enviar datos a httpbin.org…</p>';
      try {
        salida.innerHTML = renderAutocomprobacion(
          await ejecutarAutocomprobacion(entornoDelNavegador())
        );
      } catch {
        // `ejecutarAutocomprobacion` no debería lanzar: su único `await`
        // arriesgado ya está envuelto. Pero dejar este `catch` vacío
        // dejaría el botón mudo, el callejón sin salida que este proyecto
        // ya pagó una vez. «No lo sabemos» es un veredicto legítimo.
        salida.innerHTML = renderAutocomprobacion({ estado: 'indeterminado' });
      } finally {
        boton.disabled = false;
        boton.textContent = etiquetaOriginal;
      }
    })();
  });
}
