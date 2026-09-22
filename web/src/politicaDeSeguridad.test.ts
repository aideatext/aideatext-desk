import { describe, it, expect } from 'vitest';
/**
 * La CSP es el producto, no un detalle de configuración: la portada
 * promete que tu archivo no sale del navegador y esa promesa la impone el
 * navegador, no nuestro código. Embeber Calendly obligó a abrirla — pero
 * SOLO en `/analisissemantico`, que es la única página que no procesa ningún
 * archivo.
 *
 * Estas pruebas existen porque la forma natural de "arreglar" un widget
 * bloqueado es relajar la política global, y eso desmontaría en silencio
 * lo único que el sitio pide que compruebes.
 */
import config from '../public/staticwebapp.config.json';
import portada from '../index.html?raw';
import asesoria from '../analisissemantico/index.html?raw';

const global = config.globalHeaders['Content-Security-Policy'];
const rutaAsesoria = config.routes.find((r) => r.route === '/analisissemantico*');

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

describe('la excepción de /analisissemantico', () => {
  it('existe como ruta propia', () => {
    expect(rutaAsesoria).toBeDefined();
  });

  // `/analisissemantico/*` NO casaria con `/analisissemantico` sin barra: la
  // documentación de Azure lo dice explícitamente. El comodín va pegado
  // al nombre, y las dos URLs existen y responden 200.
  it('usa el comodín que sí cubre la ruta sin barra final', () => {
    expect(rutaAsesoria?.route).toBe('/analisissemantico*');
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

  // El cobro vive dentro de Calendly desde que se conectó a Stripe, así
  // que el enlace de pago suelto se retiró. Los dos juntos cobraban dos
  // veces a quien pulsara el botón y luego reservara.
  it('la asesoría no tiene enlace de pago propio: cobra el calendario', () => {
    const cuerpo = asesoria.slice(asesoria.indexOf('<body'));
    expect(cuerpo).not.toContain('buy.stripe.com');
    expect(cuerpo).toContain('calendly-inline-widget');
  });

  // El script de Calendly no lleva `integrity` a propósito: su URL no
  // lleva versión, así que un hash fijado rompería el calendario el día
  // que Calendly publique. Lo que acota el riesgo es que la CSP de esta
  // ruta permita UN SOLO origen — si alguien añadiera otro, esta prueba
  // y las de arriba lo dirían.
  it('el tercero permitido es exactamente uno', () => {
    const csp = rutaAsesoria?.headers?.['Content-Security-Policy'] ?? '';
    const origenes = [...csp.matchAll(/https:\/\/[\w.*-]+/g)].map((m) => m[0]);
    expect([...new Set(origenes)].sort()).toEqual([
      'https://*.calendly.com',
      'https://assets.calendly.com',
      'https://calendly.com',
    ]);
  });
});
