import type { Textos } from './tipos';

const CONTACTO = 'first.contact@aideatext.ai';
const correo = `<a href="mailto:${CONTACTO}">${CONTACTO}</a>`;

/**
 * English. Traducido del español, que es el original.
 *
 * Varias de estas frases existen para NO mentir: «you save no tokens
 * here», «the request went through». Se traduce el sentido, no las
 * palabras, y sobre todo no se suavizan — son las que sostienen que el
 * sitio diga lo que pasa de verdad.
 */
export const en = {
  informe: {
    paginasConTexto: (total, conTexto, enBlanco) =>
      `<strong>${total}</strong> pages: ${conTexto} with extractable text` +
      (enBlanco > 0 ? `, ${enBlanco} blank` : '') +
      '.',
    seConvierteAqui: 'It is converted right here, nothing is uploaded.',
    descargar: 'Download Markdown',

    mixtoTitulo: (total) =>
      `<strong>${total}</strong> pages: <strong>mixed</strong> document.`,
    mixtoDesglose: (conTexto, escaneadas, enBlanco) =>
      `${conTexto} with text, ${escaneadas} scanned` +
      (enBlanco > 0 ? `, ${enBlanco} blank` : '') +
      '.',
    mixtoExplicacion:
      'We convert the ones with text now. The scanned ones need OCR on a ' +
      'server.',
    dudasAntesDePagar: `Questions before paying? ${correo}`,

    escaneadas: (escaneadas, enBlanco) =>
      `<strong>${escaneadas}</strong> scanned pages, with no text layer` +
      (enBlanco > 0 ? `, and ${enBlanco} blank` : '') +
      '.',
    necesitaOcr:
      'This document needs OCR, which runs on a server. You can try ' +
      '<strong>one page free</strong> before deciding: pick the worst scan, ' +
      `so you see the quality in the hardest case. Ask for it at ${correo}.`,

    vacioTitulo: (total) =>
      `<strong>${total}</strong> pages, with no text and no images.`,
    vacioExplicacion:
      'The file may be damaged, protected, or genuinely empty.',
    vacioSalida: `Write to us at ${correo} and we will look at it with you.`,
  },

  ocr: {
    aviso:
      'OCR <strong>does need your file</strong>: recognising letters inside ' +
      'an image requires a model that runs on a server. It is deleted when ' +
      'we hand you the result; the detail is under «Data handling», below.',
    estudiante: (mxn) => `I am a student · ${mxn} MXN`,
    empresa: (mxn) => `Company or professional · ${mxn} MXN`,
  },

  ahorro: {
    tuPdf: 'Your PDF',
    elMarkdown: 'The Markdown',
    tokens: (n) => `~${n} tokens`,
    faltanEscaneadas: (n) =>
      `Note: the Markdown is missing ${n} scanned page${n === 1 ? '' : 's'}, ` +
      'which need OCR. Part of the difference is content that is not there, ' +
      'not text you saved.',
    nadaQueMedir: 'There is nothing to measure.',
    nadaQueMedirDetalle:
      'No text was extracted from this PDF, so we cannot compare it with ' +
      'anything.',
    ahorras: (pct) => `You save ${pct}%`,
    ahorrasDetalle: 'Estimated at 4 characters per token, on your file.',
    noAhorras: 'You save no tokens on this file.',
    noAhorrasDetalle: (unPocoMas) =>
      `It weighs almost the same as the text in your PDF${
        unPocoMas ? ', or slightly more' : ''
      }. We tell you instead of hiding it: what you gain here is a file the ` +
      'AI reads in full and that never left your computer.',
  },

  conversion: {
    analizando: 'Analysing in your browser…',
    midiendo: 'Measuring the saving…',
    falloAlConvertir: 'Something failed while converting this document.',
    noSePudoLeer:
      'We could not read this file. It may be password-protected or damaged.',
    escribenosYRevisamos: `Write to us at ${correo} and we will look at it with you.`,
    noSePudoMedir:
      'Your Markdown has already downloaded. We could not measure the token ' +
      'saving for this file, and we would rather tell you than show you a ' +
      'made-up number.',
  },

  csp: {
    bloqueadoTitulo: 'The browser stopped it.',
    bloqueadoDetalle:
      'We tried to send the word «prueba» to <code>httpbin.org</code> and the ' +
      'request never left your computer.',
    directivaActivada: 'Directive that fired:',
    bloqueadoConsola:
      'Your browser has just logged this violation in the console (F12). The ' +
      'same proof is there, written by it and not by us.',
    noBloqueadoTitulo:
      'The request went through. The security policy is not working in this ' +
      'browser.',
    noBloqueadoDetalle:
      'We should not be able to do this, and we just did it in front of you. ' +
      'While this happens, the guarantee on this page does not hold in your ' +
      'browser and we do not want you to take our word for it.',
    avisanosYCorregimos: `Tell us and we will fix it: ${correo}`,
    indeterminadoTitulo: 'Inconclusive result.',
    indeterminadoDetalle:
      'The request failed, but your browser reported no policy violation. ' +
      'That usually means you are offline, or that your browser does not ' +
      'report these violations to the page.',
    indeterminadoAlternativa:
      'The other check is still available and does not depend on us: open the ' +
      'developer tools (F12), <strong>Network</strong> tab, and convert a ' +
      'PDF. You will not see a single upload request.',
    siQuieresQueLoRevisemos: `If you want us to look at it with you, write to ${correo}`,
  },

  contador: {
    convertidos: (n) =>
      `<strong>${n} documents</strong> converted here, without a single one ` +
      "leaving its owner's browser.",
    loUnicoQueEnviamos: 'The one thing we do send',
    queEnviamos:
      'When a conversion finishes, your browser adds 1 to a public counter. ' +
      'It goes <strong>without your file, without your name and without ' +
      'your IP</strong>: it is literally a +1, with an empty request body. ' +
      'You can see it in the Network tab, next to the absence of any upload.',
    verQueSeEnvia: 'See what is sent',
  },

  tarifa: {
    noEstaEnLaLista: `Institution not listed? Write to ${CONTACTO} and we will add it.`,
    institucional: (corto, largo, horas, porHora) =>
      `Institutional rate: ${corto} MXN for 1 hour of audio, or ${largo} MXN ` +
      `for up to ${horas} hours (${porHora} MXN per hour). We validate the ` +
      'email when we reply.',
    general: (corto, largo, horas) =>
      `This email gets the general rate: ${corto} MXN for 1 hour, or ` +
      `${largo} MXN for up to ${horas} hours.`,
  },
} satisfies Textos;
