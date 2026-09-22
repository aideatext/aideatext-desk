import { describe, it, expect } from 'vitest';
/**
 * La CSP es el producto, no un detalle de configuración: la portada
 * promete que tu archivo no sale del navegador y esa promesa la impone el
 * navegador, no nuestro código. Embeber Calendly obligó a abrirla — pero
 * SOLO en `/asesoriatesis`, que es la única página que no procesa ningún
 * archivo.
 *
 * Estas pruebas existen porque la forma natural de "arreglar" un widget
 * bloqueado es relajar la política global, y eso desmontaría en silencio
 * lo único que el sitio pide que compruebes.
 */
import config from '../public/staticwebapp.config.json';
import portada from '../index.html?raw';
import asesoria from '../asesoriatesis/index.html?raw';

const global = config.globalHeaders['Content-Security-Policy'];
const rutaAsesoria = config.routes.find((r) => r.route === '/asesoriatesis*');

const directiva = (csp: string, nombre: string): string => {
  const m = csp.match(new RegExp(`(?:^|;)\\s*${nombre}\\s+([^;]*)`));
  return m ? m[1].trim() : '';
};

describe('la política global', () => {
  // Si esta prueba falla, la portada dejó de poder demostrar lo que
  // afirma. Es el único assert del repositorio que no admite matices.
  it('sigue impidiendo que la portada hable con nadie', () => {
    expect(directiva(global, 'connect-src')).toBe("'self'");
  });

  it('sigue sin permitir scripts de terceros', () => {
    expect(directiva(global, 'script-src')).toBe("'self' 'wasm-unsafe-eval'");
  });

  it('no menciona Calendly por ninguna parte', () => {
    expect(global).not.toMatch(/calendly/i);
  });

  it('conserva las directivas que cierran el resto de puertas', () => {
    for (const [nombre, valor] of [
      ['object-src', "'none'"],
      ['base-uri', "'none'"],
      ['form-action', "'none'"],
      ['frame-ancestors', "'none'"],
    ]) {
      expect(`${nombre}=${directiva(global, nombre)}`).toBe(`${nombre}=${valor}`);
    }
  });
});

describe('la excepción de /asesoriatesis', () => {
  it('existe como ruta propia', () => {
    expect(rutaAsesoria).toBeDefined();
  });

  // `/asesoriatesis/*` NO casaria con `/asesoriatesis` sin barra: la
  // documentación de Azure lo dice explícitamente. El comodín va pegado
  // al nombre, y las dos URLs existen y responden 200.
  it('usa el comodín que sí cubre la ruta sin barra final', () => {
    expect(rutaAsesoria?.route).toBe('/asesoriatesis*');
  });

  it('abre exactamente lo que Calendly necesita, y nada más', () => {
    const csp = rutaAsesoria?.headers?.['Content-Security-Policy'] ?? '';
    expect(directiva(csp, 'script-src')).toBe("'self' https://assets.calendly.com");
    expect(directiva(csp, 'frame-src')).toBe('https://calendly.com');
    // Sin `'unsafe-eval'` ni comodines de esquema: abrir la puerta a un
    // dominio no es lo mismo que abrirla a cualquiera.
    expect(csp).not.toMatch(/'unsafe-eval'/);
    expect(csp).not.toMatch(/script-src[^;]*\*[^.]/);
    expect(csp).not.toMatch(/default-src[^;]*https:(?!\/\/)/);
  });

  it('mantiene cerradas las mismas puertas que la global', () => {
    const csp = rutaAsesoria?.headers?.['Content-Security-Policy'] ?? '';
    for (const [nombre, valor] of [
      ['object-src', "'none'"],
      ['base-uri', "'none'"],
      ['form-action', "'none'"],
      ['frame-ancestors', "'none'"],
    ]) {
      expect(`${nombre}=${directiva(csp, nombre)}`).toBe(`${nombre}=${valor}`);
    }
  });

  // La excepción es tolerable porque esta página no toca ningún archivo
  // del usuario. Si algún día procesara uno, dejaría de serlo.
  it('la página de la excepción no procesa archivos', () => {
    expect(asesoria).not.toMatch(/<input[^>]*type="file"/i);
    expect(asesoria).not.toMatch(/pdfjs|pdf\.worker/i);
  });
});

describe('el reparto de código de terceros', () => {
  // La portada es la que hace la promesa comprobable. Un solo `<script
  // src>` externo ahí la desmentiría en la pestaña Red, delante del
  // visitante que fue justamente a comprobarla.
  it('la portada no carga ni un script ni un marco externo', () => {
    const marcado = portada.replace(/<!--[\s\S]*?-->/g, ' ');
    expect(marcado).not.toMatch(/<script[^>]+src="https?:/i);
    expect(marcado).not.toMatch(/<iframe/i);
    expect(marcado).not.toMatch(/calendly/i);
  });

  it('el único tercero de la asesoría es Calendly', () => {
    const marcado = asesoria.replace(/<!--[\s\S]*?-->/g, ' ');
    const externos = [...marcado.matchAll(/<script[^>]+src="(https?:[^"]+)"/gi)].map(
      (m) => m[1]
    );
    expect(externos).toEqual([
      'https://assets.calendly.com/assets/external/widget.js',
    ]);
  });

  it('el calendario apunta al evento real, no a un ejemplo', () => {
    expect(asesoria).toContain(
      'data-url="https://calendly.com/manuel-var-ale-aideatext/30min"'
    );
  });

  // Pagar va ANTES de agendar en el documento. El calendario por sí solo
  // permite reservar sin pagar; al menos que el que llega lea el precio
  // primero.
  it('el pago aparece antes que el calendario', () => {
    // Se busca en el CUERPO, no en el archivo entero: la hoja de estilo
    // menciona `.calendly-inline-widget` mucho antes que el marcado, y
    // comparar esas posiciones no dice nada sobre lo que ve el visitante.
    const cuerpo = asesoria.slice(asesoria.indexOf('<body'));
    const pago = cuerpo.indexOf('buy.stripe.com');
    const calendario = cuerpo.indexOf('<div class="calendly-inline-widget"');
    expect(pago).toBeGreaterThan(-1);
    expect(calendario).toBeGreaterThan(-1);
    expect(pago).toBeLessThan(calendario);
  });
});
