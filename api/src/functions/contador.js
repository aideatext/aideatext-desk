const { app } = require('@azure/functions');
const { TableClient } = require('@azure/data-tables');

/**
 * EL CONTADOR PÚBLICO DE CONVERSIONES.
 *
 * ─────────────────────────────────────────────────────────────────────
 * QUÉ GUARDA ESTE ENDPOINT, Y QUÉ NO
 * ─────────────────────────────────────────────────────────────────────
 *
 * Guarda UN NÚMERO. Uno solo, para todo el sitio.
 *
 * No recibe el archivo. No recibe su nombre, ni su tamaño, ni su número
 * de páginas. No recibe quién eres. No guarda tu IP ni nada derivado de
 * ella. El cuerpo de la petición que manda el navegador está vacío, y eso
 * se puede comprobar en la pestaña Red — la página tiene un botón que lo
 * enseña.
 *
 * Esto importa porque la portada promete que tu documento no sale de tu
 * navegador, e invita a comprobarlo. Añadir una petición a esa página
 * obliga a decir qué lleva. Si algún día este endpoint recibe un solo
 * dato más, esa promesa deja de ser cierta y hay que reescribirla.
 *
 * ─────────────────────────────────────────────────────────────────────
 * POR QUÉ UN `etag` Y UN BUCLE DE REINTENTOS
 * ─────────────────────────────────────────────────────────────────────
 *
 * Table Storage no tiene «suma 1». Hay que leer, sumar y escribir, y dos
 * conversiones simultáneas leerían el mismo valor y escribirían el mismo
 * resultado: dos conversiones, un incremento. La escritura va
 * condicionada al `etag` que se leyó, así que la segunda falla con 412 y
 * se reintenta con el valor nuevo.
 *
 * Sin esto el contador no se rompe de forma visible: simplemente cuenta
 * de menos, en silencio, y sólo bajo carga. Es el tipo de fallo que no
 * aparece hasta que el sitio empieza a funcionar.
 */

const TABLA = 'contador';
const PARTICION = 'aidesk';
const FILA = 'conversiones';
const MAX_REINTENTOS = 8;

function cliente() {
  const conexion = process.env.ALMACEN_CONTADOR;
  if (!conexion) throw new Error('Falta ALMACEN_CONTADOR');
  return TableClient.fromConnectionString(conexion, TABLA);
}

/** Lee el total. Si la fila no existe todavía, son 0. */
async function leer(tabla) {
  try {
    const e = await tabla.getEntity(PARTICION, FILA);
    return { total: Number(e.total) || 0, etag: e.etag };
  } catch (err) {
    if (err.statusCode === 404) return { total: 0, etag: null };
    throw err;
  }
}

/**
 * Suma 1 y devuelve el total nuevo.
 *
 * Devuelve `null` si no lo consigue tras todos los reintentos. Quien
 * llama decide qué decir; lo que NO hace es inventarse un número.
 */
async function sumarUno(tabla) {
  for (let intento = 0; intento < MAX_REINTENTOS; intento++) {
    const { total, etag } = await leer(tabla);
    const nuevo = total + 1;
    try {
      if (etag === null) {
        // `createEntity` falla con 409 si otro la creó primero, y ese 409
        // entra en el mismo reintento que el 412.
        await tabla.createEntity({
          partitionKey: PARTICION,
          rowKey: FILA,
          total: nuevo,
        });
      } else {
        await tabla.updateEntity(
          { partitionKey: PARTICION, rowKey: FILA, total: nuevo },
          'Replace',
          { etag }
        );
      }
      return nuevo;
    } catch (err) {
      // 412: alguien escribió entre nuestra lectura y nuestra escritura.
      // 409: alguien creó la fila entre medias. Los dos se reintentan.
      if (err.statusCode !== 412 && err.statusCode !== 409) throw err;
    }
  }
  return null;
}

app.http('contador', {
  methods: ['GET', 'POST'],
  authLevel: 'anonymous',
  route: 'contador',
  handler: async (peticion, contexto) => {
    // Cabeceras comunes. `no-store` porque un contador cacheado es un
    // contador que miente, y el sitio no puede permitirse eso justo en la
    // cifra que usa como prueba.
    const cabeceras = {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
    };

    try {
      const tabla = cliente();

      if (peticion.method === 'GET') {
        const { total } = await leer(tabla);
        return { status: 200, headers: cabeceras, jsonBody: { total } };
      }

      const total = await sumarUno(tabla);
      if (total === null) {
        // Se agotaron los reintentos. Se dice, no se finge.
        contexto.warn('contador: reintentos agotados');
        return {
          status: 503,
          headers: cabeceras,
          jsonBody: { error: 'ocupado' },
        };
      }
      return { status: 200, headers: cabeceras, jsonBody: { total } };
    } catch (err) {
      contexto.error('contador:', err.message);
      return {
        status: 500,
        headers: cabeceras,
        jsonBody: { error: 'no disponible' },
      };
    }
  },
});

module.exports = { sumarUno, leer };
