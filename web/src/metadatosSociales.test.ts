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
    expect(og('url')).toBe('https://desk.aideatext.ai/');
    expect(og('title')).toBeTruthy();
    expect(og('description')).toBeTruthy();
  });

  // La etiqueta que mas se rompe: ningun raspador social resuelve rutas
  // relativas, asi que un `/img/…` aqui deja la tarjeta sin imagen en cada
  // enlace compartido -- y en Mexico y Peru ese enlace viaja sobre todo por
  // WhatsApp.
  it('la imagen de Open Graph es una URL absoluta', () => {
    expect(og('image')).toBe('https://desk.aideatext.ai/img/AIdeaTextCard.jpg');
  });

  it('declara tambien la tarjeta de Twitter/X', () => {
    expect(twitter('card')).toBe('summary_large_image');
    expect(twitter('image')).toBe(
      'https://desk.aideatext.ai/img/AIdeaTextCard.jpg'
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
    const externos = recursos.filter((t) => /(?:src|href)="https?:/.test(t));
    expect(externos).toEqual([]);
  });
});
