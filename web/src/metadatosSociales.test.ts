import { describe, it, expect } from 'vitest';
/**
 * El HTML se lee del disco tal cual, no se reconstruye: lo que se quiere
 * fijar es justo lo que se sirve. Un enlace compartido por WhatsApp no
 * ejecuta ninguna de nuestras funciones — solo lee estas etiquetas.
 *
 * Se importa con el sufijo `?raw` de Vite y no con `node:fs` a proposito:
 * el `tsconfig` de este proyecto no incluye los tipos de Node, asi que un
 * `readFileSync` aqui rompe `tsc --noEmit` y con el `npm run build`.
 */
import html from '../index.html?raw';
import asesoria from '../asesoriatesis/index.html?raw';

const contenidoDe = (patron: RegExp): string | null =>
  html.match(patron)?.[1] ?? null;

const og = (prop: string): string | null =>
  contenidoDe(
    new RegExp(`<meta\\s+property="og:${prop}"\\s+content="([^"]*)"`)
  );

const twitter = (nombre: string): string | null =>
  contenidoDe(
    new RegExp(`<meta\\s+name="twitter:${nombre}"\\s+content="([^"]*)"`)
  );

describe('metadatos sociales', () => {
  it('declara Open Graph, que es lo que leen WhatsApp, Facebook e Instagram', () => {
    expect(og('type')).toBe('website');
    expect(og('url')).toBe('https://aidesk.aideatext.ai/');
    expect(og('title')).toBeTruthy();
    expect(og('description')).toBeTruthy();
  });

  // La etiqueta que mas se rompe: ningun raspador social resuelve rutas
  // relativas, asi que un `/img/…` aqui deja la tarjeta sin imagen en cada
  // enlace compartido -- y en Mexico y Peru ese enlace viaja sobre todo por
  // WhatsApp.
  it('la imagen de Open Graph es una URL absoluta', () => {
    expect(og('image')).toBe('https://aidesk.aideatext.ai/img/AIdeaTextCard.jpg');
  });

  it('declara tambien la tarjeta de Twitter/X', () => {
    expect(twitter('card')).toBe('summary_large_image');
    expect(twitter('image')).toBe(
      'https://aidesk.aideatext.ai/img/AIdeaTextCard.jpg'
    );
    expect(twitter('title')).toBeTruthy();
  });

  it('deja escrito que la tarjeta es generica y esta pendiente', () => {
    expect(html).toContain('PENDIENTE');
  });
});

describe('la pagina no carga nada de fuera', () => {
  // Una pagina que promete que nada sale de aqui no puede pedirle una
  // tipografia a Google ni una imagen a un CDN: se desmentiria sola en la
  // pestana Red, delante del visitante que fue a comprobarlo. Las URLs
  // absolutas de los metadatos sociales no cuentan: son texto para los
  // raspadores, el navegador no las descarga.
  it('no referencia ningun recurso externo', () => {
    const recursos = [...html.matchAll(/<(?:img|script|link)[^>]*>/g)].map(
      (m) => m[0]
    );
    const externos = recursos
      // `rel="canonical"` se excluye porque NO CARGA NADA: es una
      // declaracion, igual que `og:url`, y el navegador nunca la pide. Lo
      // que esta prueba vigila es que la portada no descargue un recurso
      // de un tercero —una tipografia, un script, una imagen—, y eso
      // sigue vigilado: un `<link rel="stylesheet">` externo falla aqui.
      .filter((t) => !/rel="canonical"/.test(t))
      .filter((t) => /(?:src|href)="https?:/.test(t));
    expect(externos).toEqual([]);
  });
});

// ── El dominio canónico ──────────────────────────────────────────────
//
// El sitio se sirve desde dos dominios y seguirá así mientras el viejo
// tenga enlaces compartidos por ahí. Sin `canonical` son dos copias
// idénticas: un buscador las indexa por separado y reparte el peso.
describe('el dominio canónico', () => {
  const canonicoDe = (documento: string): string =>
    documento.match(/<link rel="canonical" href="([^"]+)"/)?.[1] ?? '';

  it('las dos páginas declaran su canónico en aidesk', () => {
    expect(canonicoDe(html)).toBe('https://aidesk.aideatext.ai/');
    expect(canonicoDe(asesoria)).toBe(
      'https://aidesk.aideatext.ai/asesoriatesis/'
    );
  });

  // Absoluto, no relativo: una ruta relativa se resuelve contra el
  // dominio que sirvió la página, que es exactamente lo que hay que
  // desambiguar. Un `canonical` relativo no desambigua nada.
  it('el canónico es absoluto y no apunta al dominio viejo', () => {
    for (const doc of [html, asesoria]) {
      expect(canonicoDe(doc)).toMatch(/^https:\/\/aidesk\.aideatext\.ai\//);
      expect(canonicoDe(doc)).not.toContain('//desk.aideatext.ai');
    }
  });

  // `og:url` y `canonical` tienen que decir lo mismo. Si discrepan, cada
  // consumidor cree a uno distinto: los buscadores al canónico, las redes
  // sociales al `og:url`.
  it('coincide con og:url en cada página', () => {
    const ogUrl = (d: string) =>
      d.match(/<meta property="og:url" content="([^"]+)"/)?.[1] ?? '';
    expect(canonicoDe(html)).toBe(ogUrl(html));
    expect(canonicoDe(asesoria)).toBe(ogUrl(asesoria));
  });
});
