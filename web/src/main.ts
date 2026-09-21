import workerUrl from 'pdfjs-dist/legacy/build/pdf.worker.min.mjs?url';
import { configureWorker } from './pdf/pdfjs';
import { diagnosePdf } from './pdf/diagnose';
import { pdfToMarkdown } from './pdf/toMarkdown';
import { renderDiagnosis } from './ui/report';

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
  if (file) void procesar(file);
});

async function procesar(file: File): Promise<void> {
  salida.innerHTML = '<p>Analizando en tu navegador…</p>';
  try {
    const data = await file.arrayBuffer();
    const diagnosis = await diagnosePdf(data);
    salida.innerHTML = renderDiagnosis(diagnosis);

    const boton = document.getElementById('descargar');
    if (boton) {
      boton.addEventListener('click', async () => {
        const r = await pdfToMarkdown(data);
        descargar(r.markdown, file.name.replace(/\.pdf$/i, '') + '.md');
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

function descargar(texto: string, nombre: string): void {
  const url = URL.createObjectURL(new Blob([texto], { type: 'text/markdown' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = nombre;
  a.click();
  URL.revokeObjectURL(url);
}
