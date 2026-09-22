import { describe, it, expect } from 'vitest';
/**
 * El sitio pasa a tener cuatro páginas: dos idiomas × dos páginas. Lo que
 * se rompe en un sitio bilingüe no es la traducción —eso se ve— sino el
 * cableado: un selector que manda a la portada en vez de a la página
 * equivalente, un `hreflang` sin reciprocidad que Google descarta entero,
 * o una regla de CSP que cubre una ruta y no su gemela.
 *
 * Nada de eso se nota mirando la página.
 */
import config from '../public/staticwebapp.config.json';
import portadaEs from '../index.html?raw';
import portadaEn from '../en/index.html?raw';
import analisisEs from '../analisissemantico/index.html?raw';
import analisisEn from '../en/semantic-analysis/index.html?raw';

interface Pagina {
  nombre: string;
  html: string;
  lang: string;
  url: string;
  /** La equivalente en el otro idioma. */
  pareja: string;
}

const PAGINAS: Pagina[] = [
  {
    nombre: 'portada ES',
    html: portadaEs,
    lang: 'es-MX',
    url: 'https://aidesk.aideatext.ai/',
    pareja: '/en/',
  },
  {
    nombre: 'portada EN',
    html: portadaEn,
    lang: 'en',
    url: 'https://aidesk.aideatext.ai/en/',
    pareja: '/',
  },
  {
    nombre: 'análisis ES',
    html: analisisEs,
    lang: 'es-MX',
    url: 'https://aidesk.aideatext.ai/analisissemantico/',
    pareja: '/en/semantic-analysis/',
  },
  {
    nombre: 'análisis EN',
    html: analisisEn,
    lang: 'en',
    url: 'https://aidesk.aideatext.ai/en/semantic-analysis/',
    pareja: '/analisissemantico/',
  },
];

const atributo = (html: string, re: RegExp): string => html.match(re)?.[1] ?? '';

describe('las cuatro páginas', () => {
  it('declaran su idioma en el <html>', () => {
    for (const p of PAGINAS) {
      expect(`${p.nombre}: ${atributo(p.html, /<html lang="([^"]+)"/)}`).toBe(
        `${p.nombre}: ${p.lang}`
      );
    }
  });

  it('declaran su propio canónico', () => {
    for (const p of PAGINAS) {
      expect(`${p.nombre}: ${atributo(p.html, /<link rel="canonical" href="([^"]+)"/)}`).toBe(
        `${p.nombre}: ${p.url}`
      );
    }
  });
});

describe('el selector de idioma', () => {
  const selector = (html: string): string =>
    html.match(/<p class="idiomas">([\s\S]*?)<\/p>/)?.[1] ?? '';

  it('está en las cuatro páginas', () => {
    for (const p of PAGINAS) {
      expect(`${p.nombre}: ${selector(p.html) !== ''}`).toBe(`${p.nombre}: true`);
    }
  });

  // LA PRUEBA QUE JUSTIFICA EL ARCHIVO. Es tentador mandar el selector a
  // `/en/` desde cualquier página, y funciona: la gente llega a algo en su
  // idioma. Pero quien estaba leyendo la página de análisis y pulsa EN
  // acaba en la portada, y tiene que volver a buscar dónde estaba.
  // Cambiar de idioma no puede costarte el sitio donde estabas.
  it('lleva a la página EQUIVALENTE, no a la portada del otro idioma', () => {
    for (const p of PAGINAS) {
      const destino = selector(p.html).match(/href="([^"]+)"/)?.[1] ?? '';
      expect(`${p.nombre} → ${destino}`).toBe(`${p.nombre} → ${p.pareja}`);
    }
  });

  // El idioma activo no se enlaza a sí mismo, y se marca con
  // `aria-current` para que un lector de pantalla lo diga y no dependa
  // sólo del color de fondo.
  it('marca el idioma activo sin enlazarlo', () => {
    for (const p of PAGINAS) {
      const s = selector(p.html);
      expect(`${p.nombre}: ${/<span aria-current="true">/.test(s)}`).toBe(
        `${p.nombre}: true`
      );
      // Un solo enlace: el otro idioma. Si hubiera dos, uno apuntaría a
      // la página en la que ya estás.
      expect(`${p.nombre}: ${[...s.matchAll(/<a /g)].length}`).toBe(
        `${p.nombre}: 1`
      );
    }
  });
});

describe('hreflang', () => {
  const alternos = (html: string): Record<string, string> =>
    Object.fromEntries(
      [...html.matchAll(/<link rel="alternate" hreflang="([^"]+)" href="([^"]+)"/g)].map(
        (m) => [m[1], m[2]]
      )
    );

  // Google exige que cada versión se declare A SÍ MISMA además de a las
  // otras. Sin la autorreferencia descarta el grupo entero y las dos
  // versiones compiten como si no tuvieran nada que ver.
  it('cada página se declara a sí misma', () => {
    for (const p of PAGINAS) {
      const a = alternos(p.html);
      const propio = p.lang.startsWith('es') ? a.es : a.en;
      expect(`${p.nombre}: ${propio}`).toBe(`${p.nombre}: ${p.url}`);
    }
  });

  it('es recíproco entre las dos versiones de cada página', () => {
    for (const [a, b] of [
      [PAGINAS[0], PAGINAS[1]],
      [PAGINAS[2], PAGINAS[3]],
    ]) {
      expect(alternos(a.html)).toEqual(alternos(b.html));
      expect(alternos(a.html).es).toBe(a.lang.startsWith('es') ? a.url : b.url);
      expect(alternos(a.html).en).toBe(a.lang.startsWith('es') ? b.url : a.url);
    }
  });

  it('el x-default apunta al español, que es el mercado principal', () => {
    for (const p of PAGINAS) {
      expect(`${p.nombre}: ${alternos(p.html)['x-default']}`).toMatch(
        /aidesk\.aideatext\.ai\/(analisissemantico\/)?$/
      );
    }
  });
});

describe('la CSP cubre las DOS rutas del calendario', () => {
  const rutas = config.routes.map((r) => r.route);

  // El fallo silencioso de un sitio bilingüe: la regla de Azure casa por
  // PATRÓN DE RUTA, no por página. Añadir la versión en inglés sin añadir
  // su regla deja el calendario cargando en español y en blanco en inglés
  // — y `vitest` no lee cabeceras HTTP, así que sólo se ve en producción.
  it('hay una regla para cada idioma', () => {
    expect(rutas).toContain('/analisissemantico*');
    expect(rutas).toContain('/en/semantic-analysis*');
  });

  it('las dos abren exactamente lo mismo', () => {
    const csp = (ruta: string) =>
      config.routes.find((r) => r.route === ruta)?.headers?.[
        'Content-Security-Policy'
      ];
    expect(csp('/en/semantic-analysis*')).toBe(csp('/analisissemantico*'));
  });

  // Y la portada en inglés NO puede quedar cubierta por la excepción:
  // `/en/semantic-analysis*` no casa con `/en/`, pero si alguien lo
  // acortara a `/en*` abriría Calendly en la página que promete no
  // cargar nada de terceros.
  it('ninguna regla abre la portada en inglés', () => {
    for (const r of config.routes) {
      expect(`${r.route}`).not.toBe('/en*');
      expect(`${r.route}`).not.toBe('/en/*');
    }
  });
});

describe('las páginas en inglés conservan la estructura', () => {
  // El encargo era explícito: mantener barra de navegación, encabezados,
  // títulos y logos. Una traducción que rehace la maquetación deja de ser
  // la misma página en otro idioma.
  it('llevan los dos logotipos, al mismo tamaño', () => {
    for (const html of [portadaEn, analisisEn]) {
      const barra = html.match(/<header class="barra">([\s\S]*?)<\/header>/)?.[1] ?? '';
      expect(barra).toContain('/img/Logo_300x300.png');
      expect(barra).toContain('/img/nvidia-inception-color.svg');
      const altos = [...barra.matchAll(/height="(\d+)"/g)].map((m) => Number(m[1]));
      expect(altos).toEqual([81, 81]);
    }
  });

  it('usan la MISMA hoja de estilo que su equivalente en español', () => {
    expect(portadaEn).toContain('href="/css/portada.css"');
    expect(portadaEs).toContain('href="/css/portada.css"');
    expect(analisisEn).toContain('href="/css/interior.css"');
    expect(analisisEs).toContain('href="/css/interior.css"');
  });

  // Las cuatro columnas numeradas y la sección 4 son la estructura del
  // producto, no decoración del idioma.
  it('la portada en inglés tiene las tres columnas y la sección 4', () => {
    expect([...portadaEn.matchAll(/<div class="col">/g)]).toHaveLength(3);
    expect(portadaEn).toContain('<section class="banda">');
    for (const n of ['1', '2', '3', '4']) {
      expect(portadaEn).toContain(`<span class="paso">${n}</span>`);
    }
  });

  // Los identificadores que busca el JavaScript no se traducen: si
  // cambiaran, la herramienta dejaría de funcionar en inglés sin que
  // nada lo dijera.
  it('conserva los identificadores que usa el código', () => {
    for (const id of ['zona', 'archivo', 'resultado', 'ahorro', 'probar-csp', 'correo-audio']) {
      expect(`en: id="${id}" ${portadaEn.includes(`id="${id}"`)}`).toBe(
        `en: id="${id}" true`
      );
    }
    expect(portadaEn).toContain('class="correo-tarifa"');
  });
});

// ── Las tarjetas sociales ────────────────────────────────────────────
//
// Cada idioma tiene la suya, y servir la equivocada no se nota nunca
// desde el sitio: la tarjeta solo aparece cuando alguien pega el enlace
// en WhatsApp, y para entonces ya viajó. En México y Perú ese enlace
// viaja sobre todo por WhatsApp, así que es la etiqueta que más gente ve
// antes de entrar.
//
// Los `?url` no son decorativos: si el archivo no existe, el import
// revienta en la compilación en vez de dejar la tarjeta sin imagen.
import tarjetaEs from '../public/img/AIDesk_Card_v1_SP.png?url';
import tarjetaEn from '../public/img/AIDesk_Card_v1_EN.png?url';

describe('las tarjetas sociales', () => {
  /** Las medidas reales del PNG, medidas de su cabecera IHDR. */
  const ANCHO = 1057;
  const ALTO = 595;

  const meta = (html: string, clave: string): string =>
    html.match(
      new RegExp(`<meta (?:property|name)="${clave}" content="([^"]+)"`)
    )?.[1] ?? '';

  it('los dos archivos existen y se empaquetan', () => {
    expect(tarjetaEs).toContain('AIDesk_Card_v1_SP');
    expect(tarjetaEn).toContain('AIDesk_Card_v1_EN');
  });

  it('cada idioma sirve SU tarjeta, no la del otro', () => {
    for (const p of PAGINAS) {
      const esperada = p.lang.startsWith('es')
        ? 'AIDesk_Card_v1_SP.png'
        : 'AIDesk_Card_v1_EN.png';
      const prohibida = p.lang.startsWith('es')
        ? 'AIDesk_Card_v1_EN.png'
        : 'AIDesk_Card_v1_SP.png';
      for (const clave of ['og:image', 'twitter:image']) {
        expect(`${p.nombre} ${clave}`).toBe(`${p.nombre} ${clave}`);
        expect(meta(p.html, clave)).toContain(esperada);
        expect(meta(p.html, clave)).not.toContain(prohibida);
      }
    }
  });

  // Ningún raspador social resuelve rutas relativas: un `/img/…` aquí
  // deja la tarjeta sin imagen en cada enlace compartido.
  it('la URL de la tarjeta es absoluta en las cuatro', () => {
    for (const p of PAGINAS) {
      expect(`${p.nombre}: ${meta(p.html, 'og:image')}`).toMatch(
        /: https:\/\/aidesk\.aideatext\.ai\/img\//
      );
    }
  });

  // Las medidas declaradas son las del archivo. Si no coinciden, el
  // raspador reserva una caja de otra proporción y la imagen sale
  // recortada o con bandas — y es de lo último que uno mira.
  it('declara las medidas reales del PNG', () => {
    for (const p of PAGINAS) {
      expect(`${p.nombre}: ${meta(p.html, 'og:image:width')}`).toBe(
        `${p.nombre}: ${ANCHO}`
      );
      expect(`${p.nombre}: ${meta(p.html, 'og:image:height')}`).toBe(
        `${p.nombre}: ${ALTO}`
      );
    }
  });

  it('declara el tipo correcto: son PNG, no el JPG anterior', () => {
    for (const p of PAGINAS) {
      expect(`${p.nombre}: ${meta(p.html, 'og:image:type')}`).toBe(
        `${p.nombre}: image/png`
      );
      expect(p.html).not.toContain('AIdeaTextCard.jpg');
    }
  });

  it('el texto alternativo describe la tarjeta, no repite «AIdeaText»', () => {
    for (const p of PAGINAS) {
      expect(meta(p.html, 'og:image:alt')).toMatch(/^AIDesk — /);
      expect(meta(p.html, 'og:image:alt').length).toBeGreaterThan(20);
    }
  });
});

// ── El titular, declarado dos veces ──────────────────────────────────
//
// Cada página declara su titular en `og:title` y en `twitter:title`.
// Editar uno y olvidar el otro deja la vista previa de WhatsApp diciendo
// una cosa y la de X otra, y nadie lo ve porque nadie mira las dos.
//
// El `<title>` NO entra en la comparación, y es deliberado: es el texto
// de la pestaña y legítimamente dice otra cosa —«Asesoría con grafos de
// razonamiento semántico | AIDesk» frente a «Analiza tu documento con
// grafos de razonamiento semántico»—. Exigir que coincidan seria inventar
// una regla que el sitio nunca siguió.
//
// No se fija el TEXTO —es copy y cambia— sino que los dos COINCIDAN.
describe('el titular no se contradice consigo mismo', () => {
  // El atributo `content` va a menudo en la línea siguiente, así que el
  // patrón tiene que cruzar el salto. Con `[^>]*?` en vez de un espacio
  // literal, `og:description` daba cadena vacía y la prueba de «no está
  // vacío» fallaba por el regex, no por la página.
  const meta = (html: string, clave: string): string =>
    html.match(
      new RegExp(`<meta (?:property|name)="${clave}"[^>]*?content="([^"]+)"`)
    )?.[1] ?? '';

  const titulo = (html: string): string =>
    html.match(/<title>([^<]+)<\/title>/)?.[1] ?? '';

  it('og:title y twitter:title dicen lo mismo en las cuatro páginas', () => {
    for (const p of PAGINAS) {
      expect(`${p.nombre}: ${meta(p.html, 'og:title')}`).toBe(
        `${p.nombre}: ${meta(p.html, 'twitter:title')}`
      );
    }
  });

  // Las DESCRIPCIONES no se comparan, y esto es un hallazgo, no un olvido:
  // difieren a proposito. La de X es mas corta —«…nada se sube.» frente a
  // «…nada se sube, y te lo demostramos en vivo.»— porque X trunca antes
  // que Facebook. Exigir que coincidan habria roto una decision correcta.
  // Lo que si se comprueba es que la de X no sea MAS LARGA que la otra:
  // si alguien alarga la corta, se pierde el motivo de tenerla aparte.
  it('la descripción de X no es más larga que la de Open Graph', () => {
    for (const p of PAGINAS) {
      const og = meta(p.html, 'og:description').length;
      const tw = meta(p.html, 'twitter:description').length;
      expect(`${p.nombre}: ${tw <= og}`).toBe(`${p.nombre}: true`);
    }
  });

  it('ninguno se quedó vacío', () => {
    for (const p of PAGINAS) {
      for (const clave of ['og:title', 'twitter:title', 'og:description']) {
        expect(`${p.nombre} ${clave}: ${meta(p.html, clave).length > 20}`).toBe(
          `${p.nombre} ${clave}: true`
        );
      }
      expect(titulo(p.html).length).toBeGreaterThan(20);
    }
  });
});
