import { describe, it, expect } from 'vitest';
/**
 * Lo que esta pagina promete se lee en el HTML servido, no en ninguna
 * funcion: un precio equivocado o un «avisame» roto no los atrapa ninguna
 * prueba de logica. Por eso el archivo se lee del disco tal cual, con el
 * sufijo `?raw` de Vite (`node:fs` rompe `tsc --noEmit`: este tsconfig no
 * incluye los tipos de Node).
 */
import html from '../index.html?raw';
import {
  PRECIO_INSTITUCIONAL_MXN,
  PRECIO_GENERAL_MXN,
  HORAS_INCLUIDAS,
} from './ui/instituciones';

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

  it('mantiene la herramienta real en su sitio', () => {
    expect(columnas[0]).toContain('id="zona"');
    expect(columnas[0]).toContain('id="archivo"');
    expect(columnas[0]).toContain('id="resultado"');
    expect(columnas[0]).toContain('id="ahorro"');
  });
});

describe('columnas 2 y 3: precio y lista de espera', () => {
  it('publican las dos tarifas con su precio por hora', () => {
    for (const col of [columnas[1], columnas[2]]) {
      expect(col).toContain(`${PRECIO_INSTITUCIONAL_MXN} MXN`);
      expect(col).toContain(`${PRECIO_GENERAL_MXN} MXN`);
      expect(col).toContain(`hasta ${HORAS_INCLUIDAS} horas de audio`);
      expect(col).toContain('50 MXN la hora');
      expect(col).toContain('125 MXN la hora');
      expect(col).toMatch(/sin fines de lucro/);
      expect(col).toMatch(/Empresas y profesionales/);
    }
  });

  it('dicen sin rodeos que el precio bajo exige correo institucional', () => {
    for (const col of [columnas[1], columnas[2]]) {
      expect(col).toMatch(/exige un correo institucional/);
    }
  });

  it('el aviso es un mailto prellenado, no un formulario', () => {
    for (const col of [columnas[1], columnas[2]]) {
      expect(col).toContain('Avísame cuando esté listo');
      expect(col).toMatch(
        /href="mailto:first\.contact\.desk@aideatext\.ai\?subject=[^"]*&amp;body=[^"]*"/
      );
    }
  });

  it('cada servicio manda un asunto distinto', () => {
    const asunto = (col: string): string =>
      col.match(/mailto:[^"]*subject=([^&]*)/)?.[1] ?? '';
    expect(asunto(columnas[1])).toContain('Markdown');
    expect(asunto(columnas[2])).toContain('traducci');
    expect(asunto(columnas[1])).not.toBe(asunto(columnas[2]));
  });

  it('describen un caso de uso propio y verdadero', () => {
    // Columna 2: el trayecto de 1-2 horas.
    expect(columnas[1]).toMatch(/una y dos horas/);
    expect(columnas[1]).toMatch(/metro/);
    // Columna 3: la especificacion lo dejo vacio; aqui hay uno escrito.
    expect(columnas[2]).toMatch(/congreso internacional/);
    expect(columnas[2]).toMatch(/inglés/);
  });

  it('atan el comprobador de tarifa institucional', () => {
    expect(columnas[1]).toContain('class="correo-tarifa"');
    expect(columnas[2]).toContain('class="correo-tarifa"');
    expect(html).toContain('/src/listaDeEspera.entry.ts');
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

  it('todo destino de contacto es mailto', () => {
    const enlaces = [...html.matchAll(/href="([^"]+)"/g)].map((m) => m[1]);
    const externos = enlaces.filter((h) => /^https?:/.test(h));
    // Los unicos enlaces externos son de lectura (repositorio y sitio),
    // nunca de envio.
    for (const e of externos) {
      expect(e).toMatch(/^https:\/\/(github\.com|aideatext\.ai)/);
    }
  });
});

describe('encabezado y pie', () => {
  it('lleva los dos logotipos juntos y a tamaño legible', () => {
    const barra = html.match(/<header class="barra">([\s\S]*?)<\/header>/)?.[1] ?? '';
    expect(barra).toContain('/img/Logo_300x300.png');
    expect(barra).toContain('/img/nvidia-inception-color.svg');
    // «Legible» aqui es medible: 34px de alto para los dos. Un logotipo
    // de 16px no se lee, y la especificacion lo pedia expresamente.
    const altos = [...barra.matchAll(/height="(\d+)"/g)].map((m) => Number(m[1]));
    expect(altos).toHaveLength(2);
    for (const alto of altos) expect(alto).toBeGreaterThanOrEqual(32);
  });

  it('lleva DESK con su frase y la promesa de la especificacion', () => {
    expect(html).toContain('>DESK<');
    expect(texto).toContain(
      'Ningún límite es un «no se puede»: escríbenos y lo resolvemos.'
    );
  });

  it('el pie lleva los seis enlaces de la especificacion', () => {
    const pie = html.match(/<footer>([\s\S]*?)<\/footer>/)?.[1] ?? '';
    for (const etiqueta of [
      'Cómo funciona',
      'Seguridad',
      'Quién está detrás',
      'Código del proyecto',
      'Tratamiento de datos',
      'first.contact.desk@aideatext.ai',
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
