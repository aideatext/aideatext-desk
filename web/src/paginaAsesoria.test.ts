import { describe, it, expect } from 'vitest';
/**
 * La asesoría es el único servicio de DESK donde una persona lee el
 * documento del cliente. Todo lo que esta página promete se lee en el HTML
 * servido, así que se comprueba sobre el HTML servido.
 */
import html from '../asesoriatesis/index.html?raw';
import portada from '../index.html?raw';
import { PRODUCTOS } from './ui/pagos';

const marcado = html
  .replace(/<style[\s\S]*?<\/style>/g, ' ')
  .replace(/<!--[\s\S]*?-->/g, ' ');

const texto = marcado.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');

describe('la página de asesoría', () => {
  it('se llama como el servicio, no como la URL', () => {
    expect(texto).toMatch(
      /Asesoría: preparación de documentos académicos, administrativos y de proyectos/
    );
  });

  it('cobra la primera reunión con el enlace correcto', () => {
    expect(marcado).toContain(PRODUCTOS.asesoria.url);
    expect(texto).toContain(`${PRODUCTOS.asesoria.importeMxn} MXN`);
  });

  // Un solo enlace de pago. Si apareciera otro, sería el de otro servicio
  // —y el comprador pagaría por horas de audio creyendo que agenda una
  // reunión.
  it('no cablea ningún otro producto', () => {
    const enlaces = [
      ...marcado.matchAll(/https:\/\/buy\.stripe\.com\/\w+/g),
    ].map((m) => m[0]);
    expect(enlaces).toEqual([PRODUCTOS.asesoria.url]);
  });

  // ESTA es la prueba que justifica que la página exista aparte. La
  // portada se sostiene entera sobre que el archivo no sale del navegador;
  // este servicio es lo contrario. Si el aviso desaparece, la página queda
  // usando la confianza que gana la portada para vender justo el caso
  // donde esa promesa no aplica.
  it('dice sin rodeos que aquí sí se leen los documentos', () => {
    expect(texto).toMatch(/Aquí sí leemos tus documentos/);
    expect(texto).toMatch(/una persona lee lo que escribiste/);
  });

  // El aviso tiene que leerse ANTES de pagar, y «antes» aquí significa
  // literalmente más arriba en el documento. La primera versión de esta
  // página lo ponía debajo del botón: se leía igual de bien, pero se leía
  // después de haber pagado, y es justo la información que puede hacer que
  // alguien decida no contratar. Una advertencia que llega tarde no es una
  // advertencia.
  it('el aviso aparece antes del botón de pago, no después', () => {
    const aviso = marcado.indexOf('Aquí sí leemos tus documentos');
    const boton = marcado.indexOf(PRODUCTOS.asesoria.url);
    expect(aviso).toBeGreaterThan(-1);
    expect(boton).toBeGreaterThan(-1);
    expect(aviso).toBeLessThan(boton);
  });

  it('explica que del primer encuentro sale alcance, tiempo y precio', () => {
    expect(texto).toMatch(/alcance/i);
    expect(texto).toMatch(/precio cerrado/i);
    expect(texto).toMatch(/Cuántas reuniones/i);
    expect(texto).toMatch(/cuántos documentos/i);
  });

  it('no promete escribir la tesis por nadie', () => {
    expect(texto).toMatch(/No escribimos tu tesis por ti/);
  });

  // El descuento es un compromiso comercial, no un adorno: quien paga los
  // 500 lo lee y cuenta con el. Si desaparece del texto sin que nadie se
  // entere, la pagina deja de prometer algo que alguien ya compro.
  it('dice que los 500 se descuentan si contratan', () => {
    expect(texto).toMatch(/se descuentan del trabajo/);
  });

  // Sin `<form>` y sin peticiones: la misma CSP global cubre esta ruta, y
  // `form-action 'none'` haría que un envío no llegara a ninguna parte.
  it('no lleva ningún formulario', () => {
    expect(marcado).not.toMatch(/<form\b/i);
  });

  it('solo enlaza a destinos de la lista blanca', () => {
    const externos = [...html.matchAll(/href="(https?:[^"]+)"/g)].map(
      (m) => m[1]
    );
    const fuera = externos.filter(
      (e) => !/^https:\/\/(github\.com|aideatext\.ai|buy\.stripe\.com)/.test(e)
    );
    expect(fuera).toEqual([]);
    expect(externos.length).toBeGreaterThan(0);
  });

  it('lleva los dos logotipos al mismo tamaño que la portada', () => {
    const barra = html.match(/<header class="barra">([\s\S]*?)<\/header>/)?.[1] ?? '';
    expect(barra).toContain('/img/Logo_300x300.png');
    expect(barra).toContain('/img/nvidia-inception-color.svg');
    const altos = [...barra.matchAll(/height="(\d+)"/g)].map((m) => Number(m[1]));
    expect(altos).toHaveLength(2);
    for (const alto of altos) expect(alto).toBeGreaterThanOrEqual(56);
  });

  it('reproduce el aviso de marca de NVIDIA', () => {
    expect(texto).toMatch(
      /© 2025 NVIDIA, the NVIDIA logo are trademarks and\/or registered trademarks of NVIDIA Corporation in the U\.S\. and other countries\./
    );
  });

  it('se puede volver a la portada', () => {
    expect(marcado).toMatch(/href="\/"/);
  });
});

describe('la portada enlaza a la asesoría', () => {
  // Una página que no se enlaza desde ninguna parte no la visita nadie, y
  // este es el único servicio que el dueño entrega en persona.
  it('lleva el enlace en el pie', () => {
    const pie = portada.match(/<footer>([\s\S]*?)<\/footer>/)?.[1] ?? '';
    expect(pie).toContain('/asesoriatesis/');
  });

  const banda = () =>
    portada.match(/<section class="banda">([\s\S]*?)<\/section>/)?.[1] ?? '';

  it('la anuncia en una franja bajo las tres columnas', () => {
    expect(banda()).toContain('/asesoriatesis/');
    expect(banda()).toMatch(/Asesoría/);
  });

  // LA PRUEBA QUE IMPORTA DE LA FRANJA. El enlace de pago existe y
  // ponerlo aquí sería un clic menos, pero toda la advertencia de que en
  // este servicio SÍ leemos los documentos vive en `/asesoriatesis`.
  // Cobrar desde la portada se saltaría lo único que podría hacer que
  // alguien cambie de idea.
  it('la franja lleva a la página, NO al checkout', () => {
    expect(banda()).not.toContain('buy.stripe.com');
    expect(banda()).not.toContain(PRODUCTOS.asesoria.url);
  });

  // Y aun así la franja tiene que decirlo, porque hay quien pulsa sin
  // leer: la portada promete que nada sale del navegador y esta franja
  // vive debajo de esa promesa.
  it('la franja avisa de que este servicio sí lee lo que escribiste', () => {
    expect(banda().replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ')).toMatch(
      /sí leemos lo que escribiste/
    );
  });

  // La asesoría NO entra en las tres columnas: ahí el argumento es que el
  // archivo no sale del navegador, y este servicio lo contradice. Son dos
  // promesas distintas y no pueden compartir columna. Una franja aparte,
  // debajo y con otro fondo, se lee como lo que es: otra cosa.
  it('no la mete en las tres columnas', () => {
    const columnas = [
      ...portada.matchAll(/<div class="col">([\s\S]*?)\n    <\/div>/g),
    ].map((m) => m[1]);
    expect(columnas).toHaveLength(3);
    for (const col of columnas) {
      expect(col).not.toContain('/asesoriatesis');
      expect(col).not.toContain(PRODUCTOS.asesoria.url);
    }
  });
});
