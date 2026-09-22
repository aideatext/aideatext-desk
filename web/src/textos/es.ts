import type { Textos } from './tipos';

const CONTACTO = 'first.contact@aideatext.ai';
const correo = `<a href="mailto:${CONTACTO}">${CONTACTO}</a>`;

/**
 * Español. Es el original: estas frases se escribieron primero y el resto
 * de idiomas traduce de aquí.
 *
 * `satisfies Textos` en vez de `: Textos` a propósito: comprueba que
 * cumple el contrato sin ensanchar los tipos, así que un error de dedo en
 * una clave sigue siendo un error de compilación.
 */
export const es = {
  informe: {
    paginasConTexto: (total, conTexto, enBlanco) =>
      `<strong>${total}</strong> páginas: ${conTexto} con texto extraíble` +
      (enBlanco > 0 ? `, ${enBlanco} en blanco` : '') +
      '.',
    seConvierteAqui: 'Se convierte aquí mismo, sin subir nada.',
    descargar: 'Descargar Markdown',

    mixtoTitulo: (total) =>
      `<strong>${total}</strong> páginas: documento <strong>mixto</strong>.`,
    mixtoDesglose: (conTexto, escaneadas, enBlanco) =>
      `${conTexto} con texto, ${escaneadas} escaneadas` +
      (enBlanco > 0 ? `, ${enBlanco} en blanco` : '') +
      '.',
    mixtoExplicacion:
      'Convertimos ahora las que tienen texto. Para las escaneadas hace ' +
      'falta OCR en servidor.',
    dudasAntesDePagar: `¿Dudas antes de pagar? ${correo}`,

    escaneadas: (escaneadas, enBlanco) =>
      `<strong>${escaneadas}</strong> páginas escaneadas, sin capa de texto` +
      (enBlanco > 0 ? `, y ${enBlanco} en blanco` : '') +
      '.',
    necesitaOcr:
      'Este documento necesita OCR, que se procesa en servidor. Puedes ' +
      'probar <strong>una página gratis</strong> antes de decidir: elige ' +
      `la peor escaneada, para ver la calidad en el caso más difícil. ` +
      `Pídela en ${correo}.`,

    vacioTitulo: (total) =>
      `<strong>${total}</strong> páginas, sin texto ni imágenes.`,
    vacioExplicacion:
      'Puede que el archivo esté dañado, protegido, o realmente vacío.',
    vacioSalida: `Escríbenos a ${correo} y lo revisamos contigo.`,
  },

  ocr: {
    aviso:
      'El OCR <strong>sí necesita tu archivo</strong>: reconocer letras ' +
      'dentro de una imagen exige un modelo que corre en servidor. Se borra ' +
      'al entregarte el resultado; el detalle está en «Tratamiento de ' +
      'datos», abajo.',
    estudiante: (mxn) => `Soy estudiante · ${mxn} MXN`,
    empresa: (mxn) => `Empresa o profesional · ${mxn} MXN`,
  },

  ahorro: {
    tuPdf: 'Tu PDF',
    elMarkdown: 'El Markdown',
    tokens: (n) => `~${n} tokens`,
    faltanEscaneadas: (n) =>
      `Ojo: al Markdown le faltan ${n} página${n === 1 ? '' : 's'} ` +
      `escaneada${n === 1 ? '' : 's'}, que necesitan OCR. Parte de la ` +
      'diferencia es contenido que no está, no texto ahorrado.',
    nadaQueMedir: 'No hay nada que medir.',
    nadaQueMedirDetalle:
      'No se extrajo texto de este PDF, así que no podemos compararlo con nada.',
    ahorras: (pct) => `Ahorras ${pct}%`,
    ahorrasDetalle: 'Estimado a 4 caracteres por token, sobre tu archivo.',
    noAhorras: 'En este archivo no ahorras tokens.',
    noAhorrasDetalle: (unPocoMas) =>
      `Pesa casi lo mismo que el texto de tu PDF${
        unPocoMas ? ', o un poco más' : ''
      }. Te lo decimos en vez de esconderlo: lo que ganas aquí es un ` +
      'archivo que la IA lee completo y que nunca salió de tu computadora.',
  },

  conversion: {
    analizando: 'Analizando en tu navegador…',
    midiendo: 'Midiendo el ahorro…',
    falloAlConvertir: 'Algo falló al convertir este documento.',
    noSePudoLeer:
      'No pudimos leer este archivo. Puede estar protegido con contraseña o dañado.',
    escribenosYRevisamos: `Escríbenos a ${correo} y lo revisamos contigo.`,
    noSePudoMedir:
      'Tu Markdown ya se descargó. No pudimos medir el ahorro de tokens de ' +
      'este archivo, y preferimos decírtelo a enseñarte un número inventado.',
  },

  csp: {
    bloqueadoTitulo: 'El navegador lo impidió.',
    bloqueadoDetalle:
      'Se intentó enviar la palabra «prueba» a <code>httpbin.org</code> y la ' +
      'petición no salió de tu computadora.',
    directivaActivada: 'Directiva que se activó:',
    bloqueadoConsola:
      'Tu navegador acaba de registrar esta violación en la consola (F12). ' +
      'Ahí está la misma prueba, escrita por él y no por nosotros.',
    noBloqueadoTitulo:
      'La petición salió. La política de seguridad no está funcionando en ' +
      'este navegador.',
    noBloqueadoDetalle:
      'No deberíamos poder hacer esto, y acabamos de hacerlo delante de ti. ' +
      'Mientras esto ocurra, la garantía de esta página no se sostiene en tu ' +
      'navegador y no queremos que nos creas.',
    avisanosYCorregimos: `Avísanos y lo corregimos: ${correo}`,
    indeterminadoTitulo: 'Resultado no concluyente.',
    indeterminadoDetalle:
      'La petición falló, pero tu navegador no reportó ninguna violación de ' +
      'política. Suele significar que estás sin conexión, o que tu navegador ' +
      'no informa de estas violaciones a la página.',
    indeterminadoAlternativa:
      'La otra comprobación sigue disponible y no depende de nosotros: abre ' +
      'las herramientas de desarrollo (F12), pestaña <strong>Red</strong>, y ' +
      'convierte un PDF. No verás ninguna petición de subida.',
    siQuieresQueLoRevisemos: `Si quieres que lo revisemos contigo, escríbenos a ${correo}`,
  },

  tarifa: {
    noEstaEnLaLista: `¿Tu institución no aparece? Escríbenos a ${CONTACTO} y la agregamos.`,
    institucional: (corto, largo, horas, porHora) =>
      `Tarifa institucional: ${corto} MXN por 1 hora de audio, o ${largo} ` +
      `MXN por hasta ${horas} horas (${porHora} MXN la hora). Validamos el ` +
      'correo al responderte.',
    general: (corto, largo, horas) =>
      `Con este correo aplica la tarifa general: ${corto} MXN por 1 hora, o ` +
      `${largo} MXN por hasta ${horas} horas.`,
  },
} satisfies Textos;
