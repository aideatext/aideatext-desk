import { describe, it, expect } from 'vitest';
import {
  esInstitucional,
  dominioDe,
  tarifaPara,
  SUFIJOS_INSTITUCIONALES,
  PRECIO_INSTITUCIONAL_MXN,
  PRECIO_GENERAL_MXN,
  HORAS_INCLUIDAS,
} from './instituciones';

describe('esInstitucional', () => {
  // EL CASO QUE JUSTIFICA TODO EL MODULO. Las universidades mexicanas no
  // usan .edu.mx: el correo general de la UNAM es @comunidad.unam.mx. Un
  // patron «.edu» le cobraria 500 a media UNAM sin decir por que.
  it('reconoce el correo real de la UNAM, que no lleva .edu', () => {
    expect(esInstitucional('maria@comunidad.unam.mx')).toBe(true);
  });

  it('reconoce el dominio raiz de la regla', () => {
    expect(esInstitucional('juan@unam.mx')).toBe(true);
  });

  it('no regala la tarifa a un correo personal', () => {
    expect(esInstitucional('ana@gmail.com')).toBe(false);
    expect(esInstitucional('ana@hotmail.com')).toBe(false);
    expect(esInstitucional('ana@outlook.com.mx')).toBe(false);
  });

  // ─────────────────────────────────────────────────────────────────
  // LAS DOS PRUEBAS QUE DISTINGUEN UN SUFIJO DE UN includes()
  // ─────────────────────────────────────────────────────────────────
  // Se comprobo a mano: sustituyendo la comparacion por
  //   dominio.includes(sufijo)
  // estas dos pruebas fallan y ninguna de las de arriba se entera.

  it('no acepta un dominio que solo TERMINA pareciendose (notunam.mx)', () => {
    expect(esInstitucional('x@notunam.mx')).toBe(false);
    expect(esInstitucional('x@launam.mx')).toBe(false);
    // Sin frontera de punto tampoco a la izquierda del genérico:
    expect(esInstitucional('x@noedu.mx')).toBe(false);
  });

  it('no acepta un dominio atacante que lleve la regla en medio', () => {
    expect(esInstitucional('y@evil-unam.mx.attacker.com')).toBe(false);
    expect(esInstitucional('y@unam.mx.attacker.com')).toBe(false);
    expect(esInstitucional('y@edu.attacker.com')).toBe(false);
  });

  it('acepta los sufijos genericos, en frontera de punto', () => {
    expect(esInstitucional('a@harvard.edu')).toBe(true);
    expect(esInstitucional('a@correo.uady.edu.mx')).toBe(true);
    expect(esInstitucional('a@pucp.edu.pe')).toBe(true);
    expect(esInstitucional('a@ox.ac.uk')).toBe(true);
    // Control: «edu» en otra posicion no cuenta.
    expect(esInstitucional('a@educacion.com')).toBe(false);
  });

  it('cubre toda la lista inicial acordada', () => {
    for (const sufijo of SUFIJOS_INSTITUCIONALES) {
      // El dominio a secas solo se prueba cuando es un dominio de verdad:
      // «a@edu» no es un correo (un TLD desnudo no tiene buzón), y el
      // reconocedor lo rechaza antes de mirar la lista. La forma que
      // importa del genérico es la de abajo, con subdominio.
      if (sufijo.includes('.')) {
        expect(esInstitucional(`a@${sufijo}`)).toBe(true);
      }
      expect(esInstitucional(`a@subdominio.${sufijo}`)).toBe(true);
    }
    expect(SUFIJOS_INSTITUCIONALES).toContain('unam.mx');
    expect(SUFIJOS_INSTITUCIONALES).toContain('unife.edu.pe');
  });

  it('ignora mayusculas y espacios sobrantes', () => {
    expect(esInstitucional('  Maria@Comunidad.UNAM.MX  ')).toBe(true);
    expect(esInstitucional('A@OX.AC.UK')).toBe(true);
  });

  it('no se cae ni acepta con entradas que no son correos', () => {
    expect(esInstitucional('')).toBe(false);
    expect(esInstitucional('unam.mx')).toBe(false); // sin arroba
    expect(esInstitucional('@unam.mx')).toBe(false); // sin usuario
    expect(esInstitucional('a@')).toBe(false);
    expect(esInstitucional('a@b@unam.mx')).toBe(false);
    expect(esInstitucional('a@unam')).toBe(false);
    expect(esInstitucional('a@ unam.mx')).toBe(false);
  });
});

describe('dominioDe', () => {
  it('normaliza a minusculas y quita el punto final del FQDN', () => {
    expect(dominioDe('A@Comunidad.UNAM.MX.')).toBe('comunidad.unam.mx');
  });

  it('devuelve null cuando no hay dominio reconocible', () => {
    expect(dominioDe('sin-arroba')).toBeNull();
    expect(dominioDe('a@..mx')).toBeNull();
  });
});

describe('tarifaPara', () => {
  it('le da 200 MXN por 4 horas al correo institucional', () => {
    const t = tarifaPara('maria@comunidad.unam.mx');
    expect(t.institucional).toBe(true);
    expect(t.mxn).toBe(PRECIO_INSTITUCIONAL_MXN);
    expect(PRECIO_INSTITUCIONAL_MXN).toBe(200);
    expect(t.mensaje).toContain('200 MXN');
    expect(t.mensaje).toContain(`${HORAS_INCLUIDAS} horas`);
    // Control: al institucional no se le ofrece la lista de altas.
    expect(t.mensaje).not.toContain('no aparece');
  });

  it('le da 500 MXN al correo que no esta en la lista', () => {
    const t = tarifaPara('ana@gmail.com');
    expect(t.institucional).toBe(false);
    expect(t.mxn).toBe(PRECIO_GENERAL_MXN);
    expect(PRECIO_GENERAL_MXN).toBe(500);
    expect(t.mensaje).toContain('500 MXN');
  });

  // La regla de nunca decir «no se puede»: el que no coincide no recibe un
  // rechazo, recibe una salida. Y cada correo que llega por ahi le dice al
  // dueño que institucion falta en la lista.
  it('nunca cierra la puerta: ofrece dar de alta la institucion', () => {
    const t = tarifaPara('alguien@universidad-nueva.mx');
    expect(t.mensaje).toContain('first.contact.desk@aideatext.ai');
    expect(t.mensaje.toLowerCase()).toContain('agregamos');
    expect(t.mensaje.toLowerCase()).not.toContain('no se puede');
    expect(t.mensaje.toLowerCase()).not.toContain('no calificas');
  });

  it('el precio por hora sale de la division declarada', () => {
    expect(PRECIO_INSTITUCIONAL_MXN / HORAS_INCLUIDAS).toBe(50);
    expect(PRECIO_GENERAL_MXN / HORAS_INCLUIDAS).toBe(125);
  });
});
