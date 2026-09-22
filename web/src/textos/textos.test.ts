import { describe, it, expect } from 'vitest';
import { DICCIONARIOS, IDIOMA_POR_DEFECTO, idiomaDe, textos } from './index';
import type { Idioma, Textos } from './tipos';

/**
 * El diccionario existe porque vienen el francés y el portugués. Lo que
 * estas pruebas vigilan no es la calidad de la traducción —eso lo lee una
 * persona— sino que no se pueda desplegar una a medias.
 *
 * La primera línea de defensa es TypeScript: un archivo de idioma al que
 * le falte una clave no compila. Lo que TypeScript NO puede ver es una
 * clave presente pero copiada sin traducir, o una cadena vacía. De eso se
 * encargan estas.
 */

const IDIOMAS = Object.keys(DICCIONARIOS) as Idioma[];

/** Recorre el diccionario y devuelve `ruta -> texto` de todas las hojas. */
function aplanar(t: Textos): Record<string, string> {
  const salida: Record<string, string> = {};
  // Argumentos de relleno para las funciones. Los números son distintos
  // entre sí a propósito: si una traducción confunde dos parámetros, sale
  // una cifra en el sitio equivocado y se ve.
  const relleno = [312, 212, 100, 4] as const;
  for (const [seccion, valores] of Object.entries(t)) {
    for (const [clave, v] of Object.entries(valores as Record<string, unknown>)) {
      const ruta = `${seccion}.${clave}`;
      if (typeof v === 'function') {
        salida[ruta] = (v as (...a: unknown[]) => string)(...relleno);
      } else {
        salida[ruta] = String(v);
      }
    }
  }
  return salida;
}

describe('el diccionario de traducción', () => {
  it('tiene al menos el español y el inglés', () => {
    expect(IDIOMAS).toContain('es');
    expect(IDIOMAS).toContain('en');
  });

  // Si esta falla, un idioma tiene claves que otro no: alguien añadió una
  // cadena nueva y la tradujo en un solo sitio. TypeScript lo atrapa al
  // compilar, pero esto lo dice con el nombre de la clave que falta.
  it('todos los idiomas tienen exactamente las mismas claves', () => {
    const referencia = Object.keys(aplanar(DICCIONARIOS.es)).sort();
    for (const idioma of IDIOMAS) {
      expect(`${idioma}: ${Object.keys(aplanar(DICCIONARIOS[idioma])).sort().join(',')}`)
        .toBe(`${idioma}: ${referencia.join(',')}`);
    }
  });

  it('ninguna cadena está vacía en ningún idioma', () => {
    for (const idioma of IDIOMAS) {
      const vacias = Object.entries(aplanar(DICCIONARIOS[idioma]))
        .filter(([, v]) => v.trim() === '')
        .map(([k]) => k);
      expect(`${idioma}: ${vacias.join(',')}`).toBe(`${idioma}: `);
    }
  });

  // LA PRUEBA QUE JUSTIFICA EL ARCHIVO, y la que va a importar el día que
  // llegue el francés. Copiar `es.ts`, renombrarlo y traducir «lo que se
  // ve» deja decenas de cadenas en español que nadie nota hasta que las
  // lee un usuario que no habla español. Aquí sale la lista exacta.
  it('ninguna traducción es una copia literal del español', () => {
    const base = aplanar(DICCIONARIOS.es);
    // Hay cadenas que SON iguales en varios idiomas y es correcto: las que
    // solo llevan una cifra, una marca o el correo. Se declaran una a una
    // para que la excepción sea una decisión y no un agujero.
    const IGUALES_A_PROPOSITO = new Set<string>([
      'ahorro.tokens', // «~3,579 tokens»
    ]);
    for (const idioma of IDIOMAS) {
      if (idioma === 'es') continue;
      const copiadas = Object.entries(aplanar(DICCIONARIOS[idioma]))
        .filter(([k, v]) => !IGUALES_A_PROPOSITO.has(k) && v === base[k])
        .map(([k]) => k);
      expect(`${idioma} sin traducir: ${copiadas.join(', ')}`).toBe(
        `${idioma} sin traducir: `
      );
    }
  });

  // Las cifras van dentro de la frase. Si una traducción olvida
  // interpolarlas, el usuario lee «páginas: con texto extraíble».
  it('las funciones colocan de verdad los números que reciben', () => {
    for (const idioma of IDIOMAS) {
      const t = DICCIONARIOS[idioma];
      expect(`${idioma}`).toBe(`${idioma}`);
      expect(t.informe.paginasConTexto(312, 212, 100)).toContain('312');
      expect(t.informe.paginasConTexto(312, 212, 100)).toContain('212');
      expect(t.informe.paginasConTexto(312, 212, 100)).toContain('100');
      expect(t.informe.escaneadas(199, 1)).toContain('199');
      expect(t.ahorro.ahorras(37)).toContain('37');
      expect(t.ocr.estudiante(200)).toContain('200');
      expect(t.tarifa.institucional(200, 500, 4, 125)).toContain('125');
    }
  });

  // Regla del proyecto, en todos los idiomas: un límite nunca se comunica
  // como «no se puede». Es la que convierte un callejón sin salida en una
  // conversación por correo.
  it('ningún idioma dice «no se puede» ni su equivalente', () => {
    for (const idioma of IDIOMAS) {
      const todo = Object.values(aplanar(DICCIONARIOS[idioma])).join(' ').toLowerCase();
      expect(`${idioma}`).toBe(`${idioma}`);
      expect(todo).not.toContain('no se puede');
      expect(todo).not.toContain('not possible');
      expect(todo).not.toContain("can't be done");
    }
  });

  // El plural de las páginas escaneadas. En español «1 página escaneada»
  // y «2 páginas escaneadas»; en inglés «1 scanned page» / «2 scanned
  // pages». Una traducción que ignore el singular produce «1 pages».
  it('resuelve el singular y el plural', () => {
    for (const idioma of IDIOMAS) {
      const uno = DICCIONARIOS[idioma].ahorro.faltanEscaneadas(1);
      const varias = DICCIONARIOS[idioma].ahorro.faltanEscaneadas(5);
      expect(`${idioma}: ${uno === varias}`).toBe(`${idioma}: false`);
    }
  });
});

describe('idiomaDe', () => {
  it('reconoce la forma corta y la larga', () => {
    expect(idiomaDe('es')).toBe('es');
    expect(idiomaDe('es-MX')).toBe('es');
    expect(idiomaDe('en')).toBe('en');
    expect(idiomaDe('en-US')).toBe('en');
    expect(idiomaDe('EN-gb')).toBe('en');
    expect(idiomaDe('  es-419  ')).toBe('es');
  });

  // Una página mal etiquetada tiene que seguir funcionando. Cae al idioma
  // por defecto en vez de dejar la herramienta muda.
  it('cae al idioma por defecto con lo desconocido, vacío o ausente', () => {
    for (const entrada of ['', '   ', 'zz', 'klingon', null, undefined]) {
      expect(`${String(entrada)} -> ${idiomaDe(entrada)}`).toBe(
        `${String(entrada)} -> ${IDIOMA_POR_DEFECTO}`
      );
    }
  });

  // El francés todavía no existe. Cuando exista, esta prueba habrá que
  // cambiarla — y ese cambio es justamente el recordatorio de revisar que
  // el diccionario esté completo.
  it('el francés y el portugués todavía no están', () => {
    expect(idiomaDe('fr')).toBe(IDIOMA_POR_DEFECTO);
    expect(idiomaDe('pt-BR')).toBe(IDIOMA_POR_DEFECTO);
  });
});

describe('textos()', () => {
  const documentoCon = (lang: string): Document =>
    ({ documentElement: { lang } }) as Document;

  it('elige el diccionario que declara la página', () => {
    expect(textos(documentoCon('en')).informe.descargar).toBe(
      DICCIONARIOS.en.informe.descargar
    );
    expect(textos(documentoCon('es-MX')).informe.descargar).toBe(
      DICCIONARIOS.es.informe.descargar
    );
  });

  // En Node no hay `document`. Que esto no reviente es lo que permite
  // probar los módulos sin montar un DOM entero.
  it('no revienta sin document', () => {
    expect(() => textos()).not.toThrow();
    expect(textos()).toBe(DICCIONARIOS[IDIOMA_POR_DEFECTO]);
  });
});
