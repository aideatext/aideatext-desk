import { describe, it, expect } from 'vitest';
/**
 * Lo que esta pagina promete se lee en el HTML servido, no en ninguna
 * funcion: un precio equivocado o un «avisame» roto no los atrapa ninguna
 * prueba de logica. Por eso el archivo se lee del disco tal cual, con el
 * sufijo `?raw` de Vite (`node:fs` rompe `tsc --noEmit`: este tsconfig no
 * incluye los tipos de Node).
 */
import html from '../index.html?raw';
import { PRODUCTOS, porHora } from './ui/pagos';

/** Texto visible, sin etiquetas ni saltos de linea de la maquetacion. */
const texto = html
  .replace(/<style[\s\S]*?<\/style>/g, ' ')
  .replace(/<!--[\s\S]*?-->/g, ' ')
  .replace(/<[^>]+>/g, ' ')
  .replace(/\s+/g, ' ');

/** El HTML sin la hoja de estilo ni los comentarios: sólo lo que se sirve
 *  como marcado. Necesario para no confundir un `<form>` mencionado en un
 *  comentario con uno de verdad. */
const marcado = html
  .replace(/<style[\s\S]*?<\/style>/g, ' ')
  .replace(/<!--[\s\S]*?-->/g, ' ');

const columnas = [...html.matchAll(/<div class="col">([\s\S]*?)\n    <\/div>/g)].map(
  (m) => m[1]
);

/** Prosa de una columna con los saltos de línea de la maquetación
 *  colapsados: «columnas\n mezcladas» y «columnas mezcladas» son la misma
 *  frase para quien la lee. */
const prosa = (col: string): string =>
  col.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');

describe('las tres columnas', () => {
  it('hay exactamente tres', () => {
    expect(columnas).toHaveLength(3);
  });

  it('cada una anuncia su servicio', () => {
    expect(columnas[0]).toContain('PDF → Markdown');
    expect(columnas[1]).toContain('Markdown → Audio (MP3)');
    expect(columnas[2]).toContain('Traducción ES ↔ EN');
  });

  // Las dos que no existen tienen que decirlo. Cobrar una lista de espera
  // disfrazada de producto disponible seria justo lo contrario de lo que
  // vende esta pagina.
  it('las columnas 2 y 3 declaran que no estan construidas', () => {
    expect(columnas[1]).toContain('en construcción');
    expect(columnas[2]).toContain('en construcción');
    // Control: la columna 1 SI esta construida y no lleva esa etiqueta.
    expect(columnas[0]).not.toContain('en construcción');
  });
});

describe('columna 1: gratis y completa', () => {
  it('se anuncia como gratis y sin tope de paginas', () => {
    expect(columnas[0]).toContain('gratis y completo');
    expect(columnas[0]).toContain('sin límite de páginas');
  });

  // La correccion aceptada por el dueño: PDF→MD corre entero en el
  // navegador y cuesta 0, asi que un tope de dos paginas seria escasez
  // inventada. Si alguien vuelve a meterla, esta prueba lo dice.
  it('no reintroduce la prueba gratuita de dos paginas', () => {
    expect(texto).not.toMatch(/dos páginas/i);
    expect(texto).not.toMatch(/dos primeras páginas/i);
    expect(texto).not.toMatch(/dos minutos/i);
  });

  // Se midio: el Markdown sale ~2% MAS GRANDE que el texto del PDF. La
  // frase «consumiran menos tokens» era falsa y no puede volver.
  it('no afirma que el Markdown consuma menos tokens', () => {
    expect(texto).not.toMatch(/menos tokens/i);
    expect(texto).not.toMatch(/consumir[áa]n? menos/i);
    expect(texto).not.toMatch(/pesan? una fracción/i);
  });

  it('conserva el argumento verdadero, que es de calidad', () => {
    const p = prosa(columnas[0]);
    expect(p).toContain('saltos de línea absurdos');
    expect(p).toContain('columnas mezcladas');
    expect(p).toContain('encabezados y pies repetidos');
    expect(p).toContain('orden equivocado');
    expect(p).toMatch(/degrada la calidad/);
    expect(p).toMatch(/calidad, no de tamaño/);
  });

  // El precio del OCR estaba solo dentro del informe, o sea: solo lo veia
  // quien ya habia soltado un PDF escaneado. Quien llegaba a la pagina no
  // tenia forma de saber que esta columna vende algo ni cuanto cuesta.
  it('publica el precio del OCR sin esperar a que sueltes un archivo', () => {
    expect(columnas[0]).toContain(PRODUCTOS.ocrEstudiante.url);
    expect(columnas[0]).toContain(PRODUCTOS.ocrEmpresa.url);
    expect(columnas[0]).toContain(`${PRODUCTOS.ocrEstudiante.importeMxn} MXN`);
    expect(columnas[0]).toContain(`${PRODUCTOS.ocrEmpresa.importeMxn} MXN`);
  });

  it('no manda las dos tarifas de OCR al mismo enlace', () => {
    const enlaces = [
      ...columnas[0].matchAll(/https:\/\/buy\.stripe\.com\/\w+/g),
    ].map((m) => m[0]);
    expect(enlaces).toHaveLength(2);
    expect(new Set(enlaces).size).toBe(2);
  });

  // La columna 1 promete que el archivo no sale del navegador, y el OCR es
  // la unica excepcion. Si el boton se publica sin esa advertencia al
  // lado, la pagina usa la confianza que acaba de ganar para esconder
  // justo el caso donde no aplica.
  it('avisa de que el OCR si recibe el archivo, junto al precio', () => {
    expect(prosa(columnas[0])).toMatch(/sí recibe tu archivo/);
  });

  // Y no puede dejar de ser gratis lo que ya era gratis. El diagnostico
  // sigue sin costar nada: es lo que hace creible el precio de al lado.
  it('sigue diciendo que el diagnostico es gratis', () => {
    expect(prosa(columnas[0])).toMatch(/te decimos gratis si está escaneado/);
  });

  it('mantiene la herramienta real en su sitio', () => {
    expect(columnas[0]).toContain('id="zona"');
    expect(columnas[0]).toContain('id="archivo"');
    expect(columnas[0]).toContain('id="resultado"');
    expect(columnas[0]).toContain('id="ahorro"');
  });
});

describe('columna 2: precio y cobro del audio', () => {
  const audio = () => columnas[1];

  // Las cuatro cifras salen de `pagos.ts`, que copia lo que cobra Stripe.
  // Escribirlas a mano en el HTML fue exactamente el fallo anterior: la
  // pagina decia «200 MXN por hasta 4 horas» y el checkout cobraba 500 por
  // esas 4 horas. Quien hacia clic convencido por el 200 se encontraba 2.5x
  // mas caro, y nada en el codigo lo detectaba.
  it('publica los cuatro tramos con el importe que cobra Stripe', () => {
    for (const p of [
      PRODUCTOS.audio1hEstudiante,
      PRODUCTOS.audio4hEstudiante,
      PRODUCTOS.audio1hEmpresa,
      PRODUCTOS.audio4hEmpresa,
    ]) {
      expect(audio()).toContain(`${p.importeMxn} MXN`);
    }
    expect(audio()).toMatch(/sin fines de lucro/);
    expect(audio()).toMatch(/Empresas y profesionales/);
  });

  it('cablea los cuatro enlaces de pago del audio', () => {
    for (const p of [
      PRODUCTOS.audio1hEstudiante,
      PRODUCTOS.audio4hEstudiante,
      PRODUCTOS.audio1hEmpresa,
      PRODUCTOS.audio4hEmpresa,
    ]) {
      expect(audio()).toContain(p.url);
    }
  });

  // Cuatro botones que apuntan al mismo sitio es el fallo silencioso: la
  // pagina se ve perfecta y la diferencia solo aparece al cuadrar caja.
  it('no manda dos tramos al mismo enlace', () => {
    const enlaces = [
      ...audio().matchAll(/https:\/\/buy\.stripe\.com\/\w+/g),
    ].map((m) => m[0]);
    expect(enlaces).toHaveLength(4);
    expect(new Set(enlaces).size).toBe(4);
  });

  // El precio por hora del tramo largo es el unico argumento para comprarlo:
  // sin el, «500 por 4 horas» solo parece mas caro que «200 por 1 hora».
  it('muestra el precio por hora de cada tramo', () => {
    expect(audio()).toContain(
      `${porHora(PRODUCTOS.audio4hEstudiante, 4)} MXN la hora`
    );
    expect(audio()).toContain(
      `${porHora(PRODUCTOS.audio4hEmpresa, 4)} MXN la hora`
    );
  });

  it('dice sin rodeos que el precio bajo exige correo institucional', () => {
    expect(audio()).toMatch(/exige un correo institucional/);
  });

  it('ata el comprobador de tarifa institucional', () => {
    expect(audio()).toContain('class="correo-tarifa"');
    expect(html).toContain('/src/listaDeEspera.entry.ts');
  });

  // El servicio todavia se produce a mano. Cobrar por adelantado sin decir
  // que la entrega no es automatica es vender una cosa y entregar otra.
  it('avisa de que la entrega todavia es manual', () => {
    expect(prosa(audio())).toMatch(/a mano/);
  });

  it('describe un caso de uso propio y verdadero', () => {
    expect(audio()).toMatch(/una y dos horas/);
    expect(audio()).toMatch(/metro/);
  });
});

describe('columna 3: traduccion, sin producto todavia', () => {
  const trad = () => columnas[2];

  // NO hay enlace de cobro para la traduccion en la cuenta de Stripe. Un
  // precio publicado sin enlace detras es una cifra que nadie puede pagar,
  // y que el dia que exista el producto probablemente no sea esa.
  it('no publica ningun precio', () => {
    expect(trad()).not.toMatch(/\d+ MXN/);
  });

  it('no cablea ningun enlace de pago', () => {
    expect(trad()).not.toContain('buy.stripe.com');
  });

  it('dice que el precio todavia no esta cerrado', () => {
    expect(prosa(trad())).toMatch(/no tenemos precio cerrado/i);
  });

  it('sigue ofreciendo la lista de espera por mailto', () => {
    expect(trad()).toContain('Avísame cuando esté listo');
    expect(trad()).toMatch(
      /href="mailto:first\.contact@aideatext\.ai\?subject=[^"]*&amp;body=[^"]*"/
    );
  });

  it('describe un caso de uso propio y verdadero', () => {
    expect(trad()).toMatch(/exponer en inglés/);
    expect(trad()).toMatch(/escuchándolo en español/);
  });
});

// El sitio se escribió entero suponiendo que quien llega está haciendo una
// tesis, y no es así: sirve para cualquier documento. Estas pruebas fijan
// la corrección donde más se nota —el título, la tarjeta que viaja por
// WhatsApp y la primera frase de cada columna— porque es la clase de copy
// que se reescribe sin darse cuenta.
describe('el sitio no es solo para tesis', () => {
  it('el título y la tarjeta social hablan de documentos', () => {
    const cabeza = html.slice(0, html.indexOf('</head>'));
    expect(cabeza).toMatch(/<title>[^<]*documentos/);
    expect(cabeza).not.toMatch(/<title>[^<]*tu tesis/i);
    expect(cabeza).toMatch(/og:title" content="[^"]*documentos/);
  });

  // «Tesis» no desaparece: sigue siendo el mejor ejemplo concreto que
  // tenemos. Lo que no puede es ser el ÚNICO — un ejemplo solo se lee
  // como la definición del público.
  it('cada columna nombra más de un tipo de documento', () => {
    const ejemplos = /tesis|informe|expediente|manual|contrato|propuesta|ponencia|libro|peritaje/gi;
    for (const [i, col] of columnas.entries()) {
      const encontrados = new Set(
        (prosa(col).match(ejemplos) ?? []).map((x) => x.toLowerCase())
      );
      expect(`col${i + 1}: ${[...encontrados].join(',')}`).toMatch(
        /,/
      );
    }
  });
});

describe('las columnas 2 y 3 no se confunden entre si', () => {
  // La columna 2 ya se cobra, asi que su llamada a la accion es comprar.
  // La 3 todavia no tiene producto, asi que la suya es apuntarse. Dejar la
  // lista de espera en la columna que ya vende manda a la gente a escribir
  // un correo cuando podia pagar.
  it('la 2 vende y la 3 apunta', () => {
    expect(columnas[1]).toContain('buy.stripe.com');
    expect(columnas[1]).not.toContain('Avísame cuando esté listo');

    expect(columnas[2]).not.toContain('buy.stripe.com');
    expect(columnas[2]).toContain('Avísame cuando esté listo');
  });
});

describe('la pagina no envia nada a ninguna parte', () => {
  // `connect-src 'self'` y `form-action 'none'` bloquearian cualquiera de
  // las dos cosas; una pagina que las intentara se rompería a sí misma en
  // produccion mientras presume de que nada sale de aqui.
  it('no hay ningun <form>', () => {
    expect(marcado).not.toMatch(/<form\b/i);
    // Control de que el filtro no lo borra todo: el marcado sigue ahí.
    expect(marcado).toMatch(/<input\b/i);
  });

  // Lista blanca de destinos externos, no una regla general. Cada dominio
  // que entra aqui tiene que entrar a mano, y esta prueba es el unico sitio
  // donde eso se decide: si mañana alguien pega un iframe de analitica o un
  // script de un CDN, falla aqui antes de llegar a produccion.
  //
  // `buy.stripe.com` es el unico destino externo que recibe algo del
  // usuario, y lo recibe DESPUES de que haya pulsado: es una navegacion de
  // primer nivel a otra pagina, no una peticion desde esta. La diferencia
  // es la que sostiene toda la promesa del sitio — `connect-src 'self'`
  // sigue impidiendo que este codigo hable con nadie, incluido Stripe, y el
  // PDF nunca esta en el lado de la pagina cuando se abre el checkout.
  it('todo destino externo esta en la lista blanca', () => {
    const enlaces = [...html.matchAll(/href="([^"]+)"/g)].map((m) => m[1]);
    const externos = enlaces.filter((h) => /^https?:/.test(h));
    const fuera = externos.filter(
      (e) =>
        // `[\w-]+\.` cubre los subdominios propios: el sitio se sirve
        // desde `aidesk.aideatext.ai` y el canonico apunta ahi. Sin esto
        // la lista blanca trataba al propio sitio como un tercero.
        !/^https:\/\/(github\.com|(?:[\w-]+\.)?aideatext\.ai|buy\.stripe\.com)/.test(e)
    );
    expect(fuera).toEqual([]);
    // Control: el filtro encuentra enlaces de verdad, no una lista vacía
    // que pasaría la prueba por no mirar nada.
    expect(externos.length).toBeGreaterThan(0);
  });

  // El checkout se abre navegando, nunca con `fetch`: hablar con Stripe
  // desde este codigo exigiria abrir `connect-src`, y esa politica es el
  // producto, no un detalle de configuracion.
  it('no habla con Stripe desde el codigo de la pagina', () => {
    expect(marcado).not.toMatch(/fetch\([^)]*stripe/i);
    expect(marcado).not.toMatch(/js\.stripe\.com/i);
  });
});

describe('encabezado y pie', () => {
  it('lleva los dos logotipos juntos y a tamaño legible', () => {
    const barra = html.match(/<header class="barra">([\s\S]*?)<\/header>/)?.[1] ?? '';
    expect(barra).toContain('/img/Logo_300x300.png');
    expect(barra).toContain('/img/nvidia-inception-color.svg');
    // «Legible» aqui es medible. A 34px la palabra «Inception» del logo de
    // NVIDIA era una mancha verde; las reglas de uso de esa marca piden
    // que se lea. El suelo son 56px, y esta escrito como suelo y no como
    // valor exacto para que subirlos no rompa la prueba — bajarlos si.
    const altos = [...barra.matchAll(/height="(\d+)"/g)].map((m) => Number(m[1]));
    expect(altos).toHaveLength(2);
    for (const alto of altos) expect(alto).toBeGreaterThanOrEqual(56);
  });

  it('lleva AIDesk con su frase y su lema', () => {
    const barra = html.match(/<header class="barra">([\s\S]*?)<\/header>/)?.[1] ?? '';
    expect(barra).toContain('>AIDesk<');
    // `\s*` entre las dos mitades porque el nombre y la frase viven en
    // `<span>` distintos: quitar las etiquetas deja un espacio donde el
    // lector no ve ninguno. Lo que se fija es el texto, no el marcado.
    expect(prosa(barra)).toMatch(
      /AIDesk\s*, el taller de formatos de tus documentos\./
    );
    expect(prosa(barra)).toMatch(
      /El laboratorio de formatos digitales para la producción de tus\s*contenidos/
    );
    // La pertenencia al ecosistema se quedo: el dueño la repuso despues de
    // que yo la retirara por leer mal el encargo. Va DEBAJO del lema
    // nuevo, no en su lugar.
    expect(prosa(barra)).toMatch(
      /Una micro solución del ecosistema de\s*AIdeaText/
    );
  });

  // El eslogan «Ningún límite es un "no se puede"» estuvo aquí desde la
  // primera versión y el dueño lo retiró. Esta prueba impide que vuelva
  // por inercia al editar la cabecera — pero NO afloja la regla que la
  // frase enunciaba: `report.ts` e `instituciones.ts` siguen sin poder
  // responder «no se puede», y sus propias pruebas lo fijan. Se retiró el
  // eslogan, no el principio.
  it('ya no lleva el eslogan retirado', () => {
    expect(texto).not.toContain('Ningún límite es un «no se puede»');
  });

  it('el pie lleva los seis enlaces de la especificacion', () => {
    const pie = html.match(/<footer>([\s\S]*?)<\/footer>/)?.[1] ?? '';
    for (const etiqueta of [
      'Cómo funciona',
      'Seguridad',
      'Quién está detrás',
      'Código del proyecto',
      'Tratamiento de datos',
      'first.contact@aideatext.ai',
    ]) {
      expect(pie).toContain(etiqueta);
    }
  });

  it('reproduce el aviso de marca de NVIDIA textual', () => {
    expect(html).toContain(
      '© 2025 NVIDIA, the NVIDIA logo are trademarks and/or registered trademarks of NVIDIA Corporation in the U.S. and other countries.'
    );
  });

  // El boton de la CSP cambio de sitio (de la columna 2 al pie); lo que no
  // puede cambiar son los identificadores que `autocomprobacion.entry.ts`
  // busca. Sin esto, mover la seccion dejaria el boton mudo sin que nadie
  // se enterara hasta produccion.
  it('conserva el boton de autocomprobacion con sus identificadores', () => {
    const pie = html.match(/<footer>([\s\S]*?)<\/footer>/)?.[1] ?? '';
    expect(pie).toContain('id="probar-csp"');
    expect(pie).toContain('id="resultado-csp"');
    expect(pie).toContain("connect-src 'self'");
    expect(pie).toContain('Intentar enviar datos a un servidor externo');
  });
});
