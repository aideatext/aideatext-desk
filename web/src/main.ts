import workerUrl from 'pdfjs-dist/legacy/build/pdf.worker.min.mjs?url';
import { configureWorker } from './pdf/pdfjs';
import { diagnosePdf } from './pdf/diagnose';
import { pdfToMarkdown } from './pdf/toMarkdown';
import { extraerTextoCrudo } from './pdf/textoCrudo';
import { renderDiagnosis } from './ui/report';
import { renderAhorro } from './ui/tokens';

// El worker se sirve desde nuestro propio dominio, no desde un CDN:
// una peticion externa contradiria la garantia de "nada sale de aqui".
//
// Se configura a traves de ./pdf/pdfjs, que es la unica instancia de
// PDF.js del proyecto. Importar 'pdfjs-dist' aqui directamente crearia
// una segunda instancia y esta configuracion no tendria efecto.
// El worker debe venir de la variante `legacy`, la misma que usa pdfjs.ts.
configureWorker(workerUrl);

const zona = document.getElementById('zona') as HTMLDivElement;
const input = document.getElementById('archivo') as HTMLInputElement;
const salida = document.getElementById('resultado') as HTMLDivElement;
// El recuadro del ahorro de tokens. Va en su propio contenedor, debajo del
// informe, para no tocar lo que `renderDiagnosis` escribe: ese HTML esta
// probado y no tiene por que enterarse de esta medida.
const salidaAhorro = document.getElementById('ahorro') as HTMLDivElement | null;

zona.addEventListener('click', () => input.click());

zona.addEventListener('dragover', (e) => {
  e.preventDefault();
  zona.classList.add('activa');
});

zona.addEventListener('dragleave', () => zona.classList.remove('activa'));

zona.addEventListener('drop', (e) => {
  e.preventDefault();
  zona.classList.remove('activa');
  const file = e.dataTransfer?.files?.[0];
  if (file) void procesar(file);
});

input.addEventListener('change', () => {
  const file = input.files?.[0];
  // Se limpia el valor SIEMPRE, antes de procesar. Un input de archivo no
  // dispara `change` si el usuario vuelve a elegir el mismo archivo, asi
  // que sin esto el reintento tras un error no hace absolutamente nada:
  // el usuario hace clic, elige su archivo otra vez, y la pantalla no
  // cambia. Es el mismo callejon silencioso del boton mudo, entrando por
  // otra puerta -- y justo en el camino de salida del error.
  input.value = '';
  if (file) void procesar(file);
});

async function procesar(file: File): Promise<void> {
  salida.innerHTML = '<p>Analizando en tu navegador…</p>';
  // Se limpia SIEMPRE al empezar: si no, el ahorro medido sobre el archivo
  // anterior se quedaria en pantalla junto al diagnostico del nuevo, que es
  // la peor forma posible de equivocarse con un numero que el usuario va a
  // creerse.
  if (salidaAhorro) salidaAhorro.innerHTML = '';
  try {
    const data = await file.arrayBuffer();
    const diagnosis = await diagnosePdf(data);
    salida.innerHTML = renderDiagnosis(diagnosis);
    // El informe nace DEBAJO de la zona de arrastre, y la columna se
    // desplaza dentro de si misma para no empujar la pagina. Medido a
    // 1366x768: la columna dispone de ~615px y su contenido con informe
    // pasa de 700, asi que sin esta linea el veredicto puede quedar fuera
    // de la vista y el usuario cree que su clic no hizo nada. El mismo
    // callejon silencioso del boton mudo, por una tercera puerta.
    // `block: 'nearest'` desplaza lo justo, y solo el contenedor que hace
    // falta.
    salida.scrollIntoView({ block: 'nearest' });

    const boton = document.getElementById('descargar');
    if (boton) {
      boton.addEventListener('click', async () => {
        // `catch` PROPIO, no el del `try` de abajo: el rechazo de un
        // callback asincrono no se propaga al try que lo registro.
        //
        // Sin esto, si `pdfToMarkdown` falla el usuario hace clic y NO
        // OCURRE NADA: ni archivo, ni mensaje, ni cambio en pantalla. Es
        // el callejon sin salida mas silencioso posible, justo lo que la
        // regla de «nunca decir no se puede» existe para evitar.
        //
        // Y no es hipotetico: `sha256Hex` usa `crypto.subtle`, que no
        // existe fuera de un contexto seguro. Servir con `vite --host`
        // sobre una IP de red local deja el boton mudo.
        try {
          const r = await pdfToMarkdown(data);
          descargar(r.markdown, file.name.replace(/\.pdf$/i, '') + '.md');
          await mostrarAhorro(data, r.markdown, r.pagesScanned.length);
        } catch {
          salida.innerHTML = `
            <p>Algo falló al convertir este documento.</p>
            <p>Escríbenos a
               <a href="mailto:first.contact.desk@aideatext.ai">first.contact.desk@aideatext.ai</a>
               y lo revisamos contigo.</p>`;
        }
      });
    }
  } catch {
    salida.innerHTML = `
      <p>No pudimos leer este archivo. Puede estar protegido con contraseña
         o dañado.</p>
      <p>Escríbenos a
         <a href="mailto:first.contact.desk@aideatext.ai">first.contact.desk@aideatext.ai</a>
         y lo revisamos.</p>`;
  }
}

/**
 * Mide y muestra el ahorro de tokens del archivo que se acaba de convertir.
 *
 * Nunca lanza. Va dentro del `try` que decide si la CONVERSION fallo, y si
 * dejara escapar un error el usuario veria «algo fallo al convertir» con su
 * Markdown ya descargado en la carpeta: un mensaje falso sobre lo unico que
 * de verdad le importaba.
 *
 * Tampoco se queda callada si no puede medir. Un recuadro vacio despues de
 * anunciar la medicion es el mismo callejon silencioso que este proyecto ya
 * pago una vez con el boton mudo.
 */
async function mostrarAhorro(
  data: ArrayBuffer,
  markdown: string,
  paginasEscaneadas: number
): Promise<void> {
  if (!salidaAhorro) return;
  salidaAhorro.innerHTML = '<p class="apunte">Midiendo el ahorro…</p>';
  try {
    const crudo = await extraerTextoCrudo(data);
    salidaAhorro.innerHTML = renderAhorro({
      caracteresPdf: crudo.length,
      caracteresMarkdown: markdown.length,
      paginasEscaneadas,
    });
  } catch {
    salidaAhorro.innerHTML = `
      <p class="apunte">Tu Markdown ya se descargó. No pudimos medir el
         ahorro de tokens de este archivo, y preferimos decírtelo a
         enseñarte un número inventado.</p>`;
  }
}

/** Milisegundos antes de liberar la URL del blob. Ver la nota de abajo. */
const MS_ANTES_DE_LIBERAR = 60_000;

function descargar(texto: string, nombre: string): void {
  const url = URL.createObjectURL(new Blob([texto], { type: 'text/markdown' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = nombre;
  a.click();

  // Se libera con retraso, NO justo despues de `click()`.
  //
  // `a.click()` solo *inicia* la descarga; el navegador lee el blob de
  // forma asincrona. Revocar de inmediato es una carrera: en algunos
  // navegadores el archivo llega vacio o la descarga se cancela, y el
  // usuario se queda sin su Markdown sin ningun mensaje de error.
  //
  // No se verifica, se elimina. Un navegador headless no puede distinguir
  // esta carrera -- se comprobo que un control que NUNCA revoca cancela
  // igual --, asi que confirmarla exigiria una prueba manual en cada
  // navegador. Sesenta segundos de una URL de blob viva no cuestan nada;
  // una descarga silenciosamente vacia cuesta el usuario.
  setTimeout(() => URL.revokeObjectURL(url), MS_ANTES_DE_LIBERAR);
}
