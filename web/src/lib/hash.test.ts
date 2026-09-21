import { describe, it, expect } from 'vitest';
import { sha256Hex } from './hash';

/** Convierte una cadena UTF-8 a ArrayBuffer. */
function buf(s: string): ArrayBuffer {
  return new TextEncoder().encode(s).buffer as ArrayBuffer;
}

describe('sha256Hex', () => {
  it('produce el digest conocido de la cadena vacía', async () => {
    expect(await sha256Hex(buf(''))).toBe(
      'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'
    );
  });

  it('produce el digest conocido de "abc"', async () => {
    expect(await sha256Hex(buf('abc'))).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad'
    );
  });

  it('devuelve 64 caracteres hexadecimales en minúscula', async () => {
    const h = await sha256Hex(buf('DESK'));
    expect(h).toMatch(/^[0-9a-f]{64}$/);
  });

  it('es determinista: la misma entrada da el mismo digest', async () => {
    expect(await sha256Hex(buf('tesis.pdf'))).toBe(await sha256Hex(buf('tesis.pdf')));
  });
});
