/**
 * Pinta el contador al cargar la página.
 *
 * Entrada aparte y no dentro de `main.ts` a propósito: leer el contador no
 * tiene nada que ver con convertir un PDF, y si el endpoint tarda no puede
 * retrasar el módulo del que depende la herramienta.
 */
import { leerTotal, renderContador } from './ui/contador';
import { textos } from './textos';

const hueco = document.getElementById('contador');

if (hueco) {
  void (async () => {
    const total = await leerTotal();
    // `renderContador` devuelve '' por debajo del umbral, así que esto
    // deja el hueco vacío sin dejar un recuadro huérfano.
    hueco.innerHTML = renderContador(
      total,
      textos().contador.convertidos,
      document.documentElement.lang
    );
  })();
}

/**
 * El botón «ver qué se envía».
 *
 * Enseña el cuerpo EXACTO de la petición, que es una línea y está vacío.
 * Mismo recurso que el botón de la CSP: en vez de pedir que nos crean,
 * se enseña. Y como la constante sale del mismo módulo que hace el
 * `fetch`, no puede desincronizarse con lo que de verdad viaja.
 */
import { CUERPO_DEL_AVISO } from './ui/contador';

const boton = document.getElementById('ver-envio');
const salida = document.getElementById('resultado-envio');

if (boton && salida) {
  boton.addEventListener('click', () => {
    const t = textos();
    salida.innerHTML =
      `<p class="apunte">${t.contador.queEnviamos}</p>` +
      `<pre class="envio"><code>${CUERPO_DEL_AVISO.replace(/</g, '&lt;')}</code></pre>`;
  });
}
