/**
 * Envío de la campaña de AIDesk.
 *
 * ─────────────────────────────────────────────────────────────────────
 * CÓMO SE USA
 * ─────────────────────────────────────────────────────────────────────
 *
 *   node enviar.mjs --prueba tu@correo.com   Manda UNO a esa dirección.
 *   node enviar.mjs --ensayo                 Muestra qué haría. No envía.
 *   node enviar.mjs --enviar                 Envía de verdad. Pide confirmar.
 *
 * La conexión sale de la variable de entorno ACS_CONEXION. No se escribe
 * aquí ni se guarda en ningún archivo del repositorio.
 *
 * ─────────────────────────────────────────────────────────────────────
 * DECISIONES QUE NO SON OBVIAS
 * ─────────────────────────────────────────────────────────────────────
 *
 * 1. EL CSV ESTÁ EN CP1252, no en UTF-8. Es un Excel de Windows en
 *    español. Leerlo como UTF-8 revienta —lo comprobamos— y leerlo como
 *    si nada convierte «Ocádiz» en basura. Se decodifica explícitamente.
 *
 * 2. LOS 45 NOMBRES TRAEN ESPACIOS SOBRANTES. Sin recortarlos el saludo
 *    sale «Hola, Marisol Ocádiz :», con un hueco antes de los dos puntos.
 *
 * 3. SE MANDA UNO A UNO, no en lote. Un envío con 45 destinatarios en
 *    copia los expone entre sí, y en copia oculta impide personalizar el
 *    saludo. Uno a uno además aísla el fallo: si una dirección rebota, se
 *    sabe cuál.
 *
 * 4. HAY PAUSA ENTRE ENVÍOS. Azure limita a 30 por minuto; el ritmo va
 *    por debajo a propósito. La prisa aquí no compra nada y un 429 sí
 *    cuesta.
 *
 * 5. SE ESCRIBE UN REGISTRO. Sin él, un envío a medias no se puede
 *    reanudar sin volver a escribir a quien ya recibió.
 */

import { readFileSync, appendFileSync, existsSync } from 'node:fs';
import { EmailClient } from '@azure/communication-email';
import { createInterface } from 'node:readline/promises';

/**
 * EL REMITENTE ES SU DIRECCION DE SIEMPRE, no el subdominio.
 *
 * Se monto primero `hola@correo.aideatext.ai` para aislar la reputacion
 * del envio masivo del correo de trabajo. El dueño prefiere que salga de
 * su direccion, y tiene un argumento mejor: estos 45 le conocen de un
 * curso. Un correo de «AIDesk» les dice poco; uno de Manuel Vargas
 * Alegria lo abren.
 *
 * El subdominio sigue verificado y enlazado. Si algun dia hay una lista
 * de gente que NO le conoce, ese es su sitio: alli un rebote alto no
 * toca la reputacion de `aideatext.ai`.
 */
const REMITENTE = 'Manuel Vargas Alegria <manuel.var.ale@aideatext.ai>';
const RESPONDER_A = 'first.contact@aideatext.ai';
const ASUNTO = 'Una herramienta para tus PDF (gratis, y no sube nada)';
const LISTA = '../EMAILS/emails_test_aidesk.csv';
const REGISTRO = 'enviados.log';
/** Por debajo del límite de Azure (30/min) a propósito. */
const PAUSA_MS = 2500;

/** Baja por correo: cero infraestructura y Gmail le pone su botón nativo. */
const BAJA = `mailto:${RESPONDER_A}?subject=BAJA`;

// ── La lista ─────────────────────────────────────────────────────────


/**
 * El saludo, ya armado.
 *
 * DIEZ DE LOS 45 NO TIENEN NOMBRE: el export puso el correo en esa
 * columna. Usarlo como saludo daría «Hola, sunombre@sucorreo.com:», que
 * es la firma inconfundible de un correo masivo mal hecho — y además a
 * alguien que te conoce de un curso.
 *
 * Cuando no hay nombre usable, el saludo es «Hola:» a secas. Se lee
 * natural y no parece roto, que es lo que importa. Devolver el saludo
 * entero y no solo el nombre es lo que permite esto: con «Hola,
 * {{NOMBRE}}:» un nombre vacío deja «Hola, :».
 */
function saludoPara(crudo) {
  const limpio = crudo.trim();
  // Un nombre que contiene una arroba no es un nombre.
  if (!limpio || limpio.includes('@')) return 'Hola:';
  const primero = limpio.split(/\s+/)[0];
  // El CSV trae nombres en MAYÚSCULAS y en minúsculas; se normaliza para
  // que el saludo no grite ni susurre.
  const nombre = primero.charAt(0).toLocaleUpperCase('es') +
    primero.slice(1).toLocaleLowerCase('es');
  return `Hola, ${nombre}:`;
}

/**
 * Lee el CSV y devuelve destinatarios limpios.
 *
 * No confía en la lista: valida, recorta y descarta lo que no sirve, y
 * DICE lo que descartó. Una lista que se filtra en silencio es una lista
 * que no sabes qué mandó.
 */
function leerLista(ruta) {
  const texto = new TextDecoder('windows-1252').decode(readFileSync(ruta));
  const lineas = texto.split(/\r?\n/).filter((l) => l.trim() !== '');
  const cabecera = lineas.shift();
  if (!/nombre/i.test(cabecera) || !/correo/i.test(cabecera)) {
    throw new Error(`Cabecera inesperada: ${cabecera}`);
  }

  const RE = /^[^@\s,;]+@[^@\s,;]+\.[A-Za-z]{2,}$/;
  const buenos = [];
  const descartados = [];
  const vistos = new Set();

  for (const linea of lineas) {
    const partes = linea.split(',');
    const correo = (partes.pop() ?? '').trim().toLowerCase();
    const nombre = partes.join(',').trim();
    if (!RE.test(correo)) {
      descartados.push({ linea, motivo: 'correo no válido' });
      continue;
    }
    if (vistos.has(correo)) {
      descartados.push({ linea, motivo: 'duplicado' });
      continue;
    }
    vistos.add(correo);
    buenos.push({ saludo: saludoPara(nombre), correo });
  }
  return { buenos, descartados };
}

/** A quién ya se le escribió, para no repetir si el envío se corta. */
function yaEnviados() {
  if (!existsSync(REGISTRO)) return new Set();
  return new Set(
    readFileSync(REGISTRO, 'utf8')
      .split('\n')
      .map((l) => l.split('\t')[1])
      .filter(Boolean)
  );
}

// ── El mensaje ───────────────────────────────────────────────────────

function componer(destinatario) {
  const sustituir = (s) =>
    s.replaceAll('{{SALUDO}}', destinatario.saludo).replaceAll('{{BAJA}}', BAJA);
  return {
    senderAddress: REMITENTE.match(/<(.+)>/)[1],
    replyTo: [{ address: RESPONDER_A }],
    content: {
      subject: ASUNTO,
      html: sustituir(readFileSync('aidesk-es.html', 'utf8')),
      plainText: sustituir(readFileSync('aidesk-es.txt', 'utf8')),
    },
    recipients: { to: [{ address: destinatario.correo }] },
    headers: {
      // Gmail y Outlook pintan su propio botón de «Cancelar suscripción»
      // cuando ven esta cabecera. Es la baja que más se usa porque es la
      // que está donde la gente la busca.
      'List-Unsubscribe': `<${BAJA}>`,
    },
  };
}

// ── Envío ────────────────────────────────────────────────────────────

const dormir = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const args = process.argv.slice(2);
  const modo = args[0];
  const { buenos, descartados } = leerLista(LISTA);

  console.log(`\nLista: ${buenos.length} destinatarios válidos`);
  if (descartados.length) {
    console.log(`Descartados: ${descartados.length}`);
    for (const d of descartados) console.log(`  · ${d.motivo}`);
  }

  if (modo === '--ensayo') {
    const ejemplo = componer(buenos[0]);
    console.log(`\nDe      : ${REMITENTE}`);
    console.log(`Responde: ${RESPONDER_A}`);
    console.log(`Asunto  : ${ASUNTO}`);
    console.log(`Baja    : ${BAJA}`);
    const genericos = buenos.filter((d) => d.saludo === 'Hola:').length;
    console.log(`
Saludos: ${buenos.length - genericos} con nombre, ${genericos} genéricos`);
    console.log(`Ejemplos: ${buenos.slice(0, 4).map((d) => d.saludo).join('  |  ')}`);
    console.log(`HTML: ${ejemplo.content.html.length} caracteres` +
      (ejemplo.content.html.length > 102400 ? '  ⚠ Gmail recorta a 102 KB' : '  (bajo el corte de Gmail)'));
    console.log('\nEnsayo: no se envió nada.\n');
    return;
  }

  const conexion = process.env.ACS_CONEXION;
  if (!conexion) throw new Error('Falta ACS_CONEXION en el entorno');
  const cliente = new EmailClient(conexion);

  if (modo === '--prueba') {
    const destino = args[1];
    if (!destino) throw new Error('Uso: node enviar.mjs --prueba tu@correo.com');
    const mensaje = componer({ saludo: 'Hola, Manuel:', correo: destino });
    const op = await cliente.beginSend(mensaje);
    const r = await op.pollUntilDone();
    console.log(`\nPrueba a ${destino}: ${r.status}\n`);
    return;
  }

  if (modo !== '--enviar') {
    console.log('\nUso:\n  --ensayo\n  --prueba tu@correo.com\n  --enviar\n');
    return;
  }

  const hechos = yaEnviados();
  const pendientes = buenos.filter((d) => !hechos.has(d.correo));
  console.log(`Ya enviados: ${hechos.size}   Pendientes: ${pendientes.length}`);

  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const ok = await rl.question(`\n¿Enviar a ${pendientes.length} personas? Escribe ENVIAR: `);
  rl.close();
  if (ok.trim() !== 'ENVIAR') return console.log('Cancelado.\n');

  let bien = 0;
  let mal = 0;
  for (const [i, d] of pendientes.entries()) {
    try {
      const op = await cliente.beginSend(componer(d));
      const r = await op.pollUntilDone();
      appendFileSync(REGISTRO, `${new Date().toISOString()}\t${d.correo}\t${r.status}\n`);
      bien++;
      console.log(`  ${i + 1}/${pendientes.length}  ${d.correo}  ${r.status}`);
    } catch (err) {
      mal++;
      // Se registra el fallo Y se sigue. Un rebote no puede detener la
      // campaña, pero tampoco puede desaparecer sin dejar rastro.
      appendFileSync(REGISTRO, `${new Date().toISOString()}\t${d.correo}\tERROR\t${err.message}\n`);
      console.log(`  ${i + 1}/${pendientes.length}  ${d.correo}  ERROR: ${err.message}`);
    }
    if (i < pendientes.length - 1) await dormir(PAUSA_MS);
  }
  console.log(`\nEnviados: ${bien}   Fallos: ${mal}\n`);
}

main().catch((e) => {
  console.error('\n' + e.message + '\n');
  process.exit(1);
});
