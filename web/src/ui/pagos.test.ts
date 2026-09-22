import { describe, it, expect } from 'vitest';
import { PRODUCTOS, porHora, type Producto } from './pagos';

const todos = Object.entries(PRODUCTOS) as Array<[string, Producto]>;

describe('PRODUCTOS', () => {
  // ESTA es la prueba que justifica el archivo. El documento del que salieron
  // los enlaces tenía `...5c405` pegado en dos productos: «OCR estudiantes,
  // 300» y «OCR empresas, 500». Cablear eso habría cobrado 300 a toda
  // empresa — un error que no rompe nada, no lanza ninguna excepción y solo
  // se descubre al cuadrar caja. El enlace correcto para empresas es
  // `...5c404`, comprobado abriendo el checkout.
  it('no repite un enlace entre dos productos', () => {
    const urls = todos.map(([, p]) => p.url);
    const repetidos = urls.filter((u, i) => urls.indexOf(u) !== i);
    expect(repetidos).toEqual([]);
  });

  // Los siete enlaces de una cuenta comparten el prefijo y se distinguen por
  // el sufijo. Un dedazo de una letra en medio da un enlace que existe —el de
  // otro producto— o un 404 que nadie ve hasta que un cliente lo reporta.
  it('todos apuntan a buy.stripe.com por https', () => {
    for (const [clave, p] of todos) {
      expect(`${clave}: ${p.url}`).toMatch(
        /: https:\/\/buy\.stripe\.com\/[A-Za-z0-9]+$/
      );
    }
  });

  it('todos tienen un importe positivo en pesos', () => {
    // El mapa `clave -> importe` se compara entero contra un objeto de
    // esperados derivado de la propia regla, en vez de iterar con un
    // `expect` por vuelta: así el fallo dice QUÉ producto tiene el importe
    // malo, y no solo que alguno lo tiene.
    const noPositivos = todos
      .filter(([, p]) => !(p.importeMxn > 0))
      .map(([clave]) => clave);
    expect(noPositivos).toEqual([]);
  });

  // Los importes verificados uno a uno en el checkout renderizado. Si alguien
  // cambia un precio en el dashboard de Stripe y no aquí, la página anuncia
  // una cifra y el checkout cobra otra: es la contradicción que ya tuvo esta
  // página una vez (decía «200 por 4 horas», Stripe cobraba 500).
  it('conserva los importes que cobra Stripe', () => {
    expect(PRODUCTOS.audio1hEstudiante.importeMxn).toBe(200);
    expect(PRODUCTOS.audio4hEstudiante.importeMxn).toBe(500);
    expect(PRODUCTOS.audio1hEmpresa.importeMxn).toBe(400);
    expect(PRODUCTOS.audio4hEmpresa.importeMxn).toBe(800);
    expect(PRODUCTOS.ocrEstudiante.importeMxn).toBe(300);
    expect(PRODUCTOS.ocrEmpresa.importeMxn).toBe(500);
    expect(PRODUCTOS.asesoria.importeMxn).toBe(500);
  });

  // El tramo de 4 horas existe para que comprar más salga mejor. Si alguna
  // vez deja de cumplirse, el argumento de venta de la página («125 la hora
  // en vez de 200») pasa a ser falso.
  it('las 4 horas salen más baratas por hora que una sola', () => {
    expect(porHora(PRODUCTOS.audio4hEstudiante, 4)).toBeLessThan(
      porHora(PRODUCTOS.audio1hEstudiante, 1)
    );
    expect(porHora(PRODUCTOS.audio4hEmpresa, 4)).toBeLessThan(
      porHora(PRODUCTOS.audio1hEmpresa, 1)
    );
  });

  // La tarifa de estudiante tiene que ser más barata que la de empresa en
  // TODOS los pares, no solo en el que se mire. Es la promesa que la página
  // hace en letra grande y la razón por la que se pide un correo
  // institucional.
  it('la tarifa de estudiante es menor que la de empresa en cada par', () => {
    expect(PRODUCTOS.audio1hEstudiante.importeMxn).toBeLessThan(
      PRODUCTOS.audio1hEmpresa.importeMxn
    );
    expect(PRODUCTOS.audio4hEstudiante.importeMxn).toBeLessThan(
      PRODUCTOS.audio4hEmpresa.importeMxn
    );
    expect(PRODUCTOS.ocrEstudiante.importeMxn).toBeLessThan(
      PRODUCTOS.ocrEmpresa.importeMxn
    );
  });
});

describe('porHora', () => {
  it('divide el importe entre las horas', () => {
    expect(porHora(PRODUCTOS.audio4hEstudiante, 4)).toBe(125);
    expect(porHora(PRODUCTOS.audio1hEstudiante, 1)).toBe(200);
    expect(porHora(PRODUCTOS.audio4hEmpresa, 4)).toBe(200);
  });
});
