import { describe, it, expect } from 'vitest';
/**
 * La asesoría es el único servicio de DESK donde una persona lee el
 * documento del cliente. Todo lo que esta página promete se lee en el HTML
 * servido, así que se comprueba sobre el HTML servido.
 */
import html from '../asesoriatesis/index.html?raw';
import portada from '../index.html?raw';

const marcado = html
  .replace(/<style[\s\S]*?<\/style>/g, ' ')
  .replace(/<!--[\s\S]*?-->/g, ' ');

const texto = marcado.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');

describe('la página de asesoría', () => {
  it('se llama como el servicio, no como la URL', () => {
    expect(texto).toMatch(
      /Asesoría para el análisis de documentos con grafos de razonamiento semántico/
    );
  });

  // La página se vació a propósito: lo que explica el servicio vive en la
  // sección 4 de la portada, que es de donde se llega. Esta prueba fija
  // esa decisión — si alguien vuelve a llenarla de prosa, el visitante
  // lee dos veces lo mismo antes de poder pagar.
  it('no repite la explicación que ya está en la portada', () => {
    expect(texto).not.toMatch(/Cómo funciona/);
    expect(texto).not.toMatch(/estrella|embudo|Coronas|lóbulos/);
  });

  // LA PRUEBA MÁS IMPORTANTE DE ESTA PÁGINA, y es una prohibición.
  // Calendly está conectado a Stripe: la reserva no se cierra sin pagar.
  // Un enlace de pago suelto AQUÍ, junto al calendario, es una trampa de
  // cobro doble — alguien pulsa el botón, paga, y después reserva y paga
  // otra vez. No falla nada, no avisa nadie, y se descubre cuando el
  // cliente reclama.
  it('no lleva ningún enlace de pago suelto: el calendario ya cobra', () => {
    expect(marcado).not.toContain('buy.stripe.com');
  });

  it('lleva el calendario que cobra, apuntando al evento real', () => {
    expect(marcado).toContain(
      'data-url="https://calendly.com/manuel-var-ale-aideatext/30min"'
    );
  });

  // El fragmento que da Calendly trae `height:700px` en un `style`
  // inline, y eso es lo que obligaba a la página a desplazarse. El alto
  // lo pone ahora la hoja de estilo, contra la fila que le toca.
  it('no fija el alto del calendario en el marcado', () => {
    expect(marcado).not.toMatch(/calendly-inline-widget[^>]*height:\s*\d+px/);
  });

  // ESTA es la prueba que justifica que la página exista aparte. La
  // portada se sostiene entera sobre que el archivo no sale del navegador;
  // este servicio es lo contrario. Si el aviso desaparece, la página queda
  // usando la confianza que gana la portada para vender justo el caso
  // donde esa promesa no aplica.
  it('dice sin rodeos que aquí sí se leen los documentos', () => {
    expect(texto).toMatch(/sí leemos tu documento/);
    expect(texto).toMatch(/no hay forma de asesorarte sin leerlo/);
  });

  // Al vaciar la página se quedó fuera todo el texto MENOS éste, y no por
  // descuido. Es el único servicio donde una persona lee la tesis del
  // cliente; cobrar por él sin decir en ninguna parte qué pasa con el
  // archivo no es una decisión de maquetación.
  it('conserva qué se hace con el archivo', () => {
    expect(texto).toMatch(/No lo publicamos, no lo compartimos/);
    expect(texto).toMatch(/no lo usamos para entrenar nada/);
    expect(texto).toMatch(/lo borramos al terminar, o antes si lo pides/);
  });

  // El aviso tiene que leerse ANTES de pagar, y «antes» aquí significa
  // literalmente más arriba en el documento. La primera versión de esta
  // página lo ponía debajo del botón: se leía igual de bien, pero se leía
  // después de haber pagado, y es justo la información que puede hacer que
  // alguien decida no contratar. Una advertencia que llega tarde no es una
  // advertencia.
  // El aviso ya no precede a un botón de pago, porque ese botón se fue.
  // Sigue teniendo que preceder al CALENDARIO: es la información que
  // puede hacer que alguien decida no reservar, y llega tarde si se lee
  // después de haber elegido día y hora.
  it('el aviso aparece antes del calendario, no después', () => {
    const cuerpo = marcado.slice(marcado.indexOf('<body'));
    const aviso = cuerpo.indexOf('sí leemos tu documento');
    const calendario = cuerpo.indexOf('calendly-inline-widget');
    expect(aviso).toBeGreaterThan(-1);
    expect(calendario).toBeGreaterThan(-1);
    expect(aviso).toBeLessThan(calendario);
  });

  // La página ya no explica «qué no es» porque ya no explica nada. La
  // regla que ese texto sostenía sigue viva como prohibición: ningún
  // copy futuro puede prometer que escribimos la tesis del cliente.
  it('no promete escribir la tesis de nadie', () => {
    const t = texto.toLowerCase();
    expect(t).not.toMatch(/escribimos tu tesis/);
    expect(t).not.toMatch(/te la dejamos lista/);
    expect(t).not.toMatch(/redactamos por ti/);
  });

  it('anuncia la duración y que se descuenta del trabajo', () => {
    expect(texto).toMatch(/30 min/);
    expect(texto).toMatch(/Se descuenta del trabajo si nos contratas/);
  });

  // El descuento es un compromiso comercial, no un adorno: quien paga los
  // 500 lo lee y cuenta con el. Si desaparece del texto sin que nadie se
  // entere, la pagina deja de prometer algo que alguien ya compro.
  // EL PRECIO NO SE ESCRIBE DOS VECES. Quien cobra ahora es Calendly, y
  // la página no puede anunciar una cifra propia que el checkout
  // contradiga: ya pasó una vez —la portada decía «200 MXN por 4 horas» y
  // Stripe cobraba 500— y no lo detectó nada. Aquí se dice la duración y
  // la condición; el importe lo pone quien lo cobra.
  it('no anuncia un importe que no cobra esta página', () => {
    expect(texto).not.toMatch(/\d+\s*MXN/);
  });

  // Sin `<form>` y sin peticiones: la CSP de esta ruta declara
  // `form-action 'none'`, así que un envío no llegaría a ninguna parte.
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

  const prosaBanda = () => banda().replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');

  it('la anuncia en una franja bajo las tres columnas', () => {
    expect(banda()).toContain('/asesoriatesis/');
    expect(banda()).toMatch(/Asesoría/);
    expect(prosaBanda()).toMatch(
      /análisis de documentos con grafos de razonamiento semántico/
    );
  });

  it('plantea las tres preguntas que el grafo responde', () => {
    const p = prosaBanda();
    expect(p).toMatch(/¿Qué razonamiento hay en tu argumentación\?/);
    expect(p).toMatch(/¿Qué concepto pesa más frente a los otros\?/);
    expect(p).toMatch(/¿Están todos los conceptos vinculados\?/);
  });

  // Las cuatro formas salen del guion de AIdeaText
  // (`AIdeaText_v61/explicacion/guion.md`), que es la fuente. Si alguna se
  // pierde al editar el copy, la respuesta a la primera pregunta deja de
  // ser una respuesta.
  it('nombra las cuatro formas del grafo', () => {
    const p = prosaBanda();
    for (const forma of ['estrella', 'embudo', 'Coronas', 'Dos lóbulos']) {
      expect(p).toContain(forma);
    }
  });

  // ─────────────────────────────────────────────────────────────────
  // LO QUE EL GUION PROHIBE DECIR
  // ─────────────────────────────────────────────────────────────────
  // `guion.md` cierra con una tabla de frases que son falsas y fáciles de
  // escribir sin querer. Esta página vende el método, así que es justo
  // donde aparecerían. La tabla se traduce aquí en asserts porque un
  // documento no impide nada y una prueba sí.
  it('no dice que detecte si el razonamiento es correcto', () => {
    const p = prosaBanda().toLowerCase();
    expect(p).not.toMatch(/razonamiento (es )?correcto/);
    expect(p).not.toMatch(/si está bien razonado[^:]/);
    // Control: la página SÍ dice lo contrario, explícitamente.
    expect(prosaBanda()).toMatch(/No dice si está bien razonado: dice cómo está armado/);
  });

  it('no dice que califique ni evalúe', () => {
    const p = prosaBanda().toLowerCase();
    expect(p).not.toContain('califica');
    expect(p).not.toContain('evalúa');
    expect(p).not.toContain('corrige');
  });

  // El guion es tajante: el estado de UNIFE es «planificada», y AIdeaText
  // no está en uso en ninguna universidad. Afirmarlo aquí sería falso.
  it('no afirma que se use en ninguna universidad', () => {
    const p = prosaBanda().toLowerCase();
    expect(p).not.toContain('unife');
    expect(p).not.toMatch(/lo usan? (en )?(la )?universidad/);
  });

  // «Grande no es importante: es frecuente». Es la confusión que el propio
  // guion señala como la más fácil de cometer, y la página la desmonta en
  // vez de esquivarla.
  it('aclara que el tamaño es frecuencia y no importancia', () => {
    // `\s*` antes de la coma: el énfasis va en `<strong>` y quitar la
    // etiqueta deja un espacio donde el lector no ve ninguno.
    expect(prosaBanda()).toMatch(/tamaño es frecuencia\s*, no importancia/);
  });

  // La confianza del detector no es una probabilidad. La página no la
  // menciona; esta prueba impide que aparezca como porcentaje si alguien
  // amplía el texto más adelante.
  it('no presenta ninguna confianza como porcentaje', () => {
    expect(prosaBanda()).not.toMatch(/\d+\s*%/);
  });

  // LA PRUEBA QUE IMPORTA DE LA FRANJA. El enlace de pago existe y
  // ponerlo aquí sería un clic menos, pero toda la advertencia de que en
  // este servicio SÍ leemos los documentos vive en `/asesoriatesis`.
  // Cobrar desde la portada se saltaría lo único que podría hacer que
  // alguien cambie de idea.
  it('la franja lleva a la página, NO al checkout', () => {
    expect(banda()).not.toContain('buy.stripe.com');
    expect(banda()).toContain('/asesoriatesis/');
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
    }
  });
});
