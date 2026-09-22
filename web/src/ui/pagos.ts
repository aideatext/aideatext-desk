/**
 * Los enlaces de pago de Stripe, en un solo sitio.
 *
 * Cada uno se verificó abriendo el checkout en un navegador real y leyendo
 * el nombre y el importe que ve el comprador — no el nombre que les dimos
 * nosotros, que es justamente lo que no obliga a nada. El documento del que
 * salieron (`DESK LINKS PRODUCTS.md`) traía el mismo enlace pegado en dos
 * productos de precio distinto: de haberlo cableado tal cual, cada empresa
 * habría pagado la tarifa de estudiante. De ahí `sinEnlacesRepetidos`.
 *
 * `importeMxn` no cobra nada: Stripe cobra lo suyo pase lo que pase aquí.
 * Está para que la cifra impresa en la página y la del checkout salgan del
 * mismo sitio, y para que una prueba pueda comparar las dos.
 */
export interface Producto {
  /** Nombre del producto tal y como aparece en el checkout de Stripe. */
  readonly nombre: string;
  /** Importe en pesos, el mismo que cobra Stripe. */
  readonly importeMxn: number;
  readonly url: string;
}

export const PRODUCTOS = {
  audio1hEstudiante: {
    nombre: 'Transcripción de documentos a audio, máximo 1 horas - estudiantes',
    importeMxn: 200,
    url: 'https://buy.stripe.com/bJeaEX0L9fuy8rM36H5c402',
  },
  audio4hEstudiante: {
    nombre:
      'Transcripción de documentos extensos a audio, máximo 4 horas - estudiantes',
    importeMxn: 500,
    url: 'https://buy.stripe.com/bJeaEX2Th6Y28rM5eP5c403',
  },
  audio1hEmpresa: {
    nombre: 'Transcripción de documentos a audio, máximo 1 horas - Empresas',
    importeMxn: 400,
    url: 'https://buy.stripe.com/3cI3cv1Pdcim37s8r15c400',
  },
  audio4hEmpresa: {
    nombre:
      'Transcripción de documentos extensos a audio, máximo 4 horas - Empresas',
    importeMxn: 800,
    url: 'https://buy.stripe.com/8x2cN579x2HM37sgXx5c401',
  },
  // Sustituye al enlace `…5c405`, que cobraba 300 por lo mismo. El
  // anterior puede seguir vivo en Stripe y en cualquier sitio donde se
  // haya compartido: si alguien lo abre, paga 300 por el producto de 200.
  // Archivarlo en el Dashboard es lo único que corta esa vía, y no se
  // puede hacer desde aquí.
  ocrEstudiante: {
    nombre: 'OCR de documento escaneado - para estudiantes',
    importeMxn: 200,
    url: 'https://buy.stripe.com/5kQ4gz65tdmq6jE0Yz5c407',
  },
  ocrEmpresa: {
    nombre: 'OCR de documento escaneado - para empresas',
    importeMxn: 500,
    url: 'https://buy.stripe.com/fZu5kDgK7aae9vQbDd5c404',
  },
} as const satisfies Record<string, Producto>;

/**
 * NO HAY PRODUCTO DE ASESORÍA AQUÍ, y su ausencia es deliberada.
 *
 * Existió: `…5c406`, 500 MXN. Se retiró cuando Calendly quedó conectado a
 * Stripe y la reserva pasó a cobrarse dentro del propio calendario. Tener
 * los dos vivos cobraba dos veces a quien pulsara el botón y después
 * reservara — y el enlace viejo sigue cobrando 500 MXN por lo que el
 * calendario cobra ahora en dólares, así que hay que archivarlo en el
 * Dashboard de Stripe. Eso no se puede hacer desde aquí.
 */

export type ClaveDeProducto = keyof typeof PRODUCTOS;

/**
 * El precio por hora, redondeado. Es lo que hace visible que las 4 horas
 * salen más baratas por hora que una sola: sin esta cifra al lado, el
 * tramo de 4 horas solo parece «más caro».
 */
export function porHora(producto: Producto, horas: number): number {
  return Math.round(producto.importeMxn / horas);
}
