/**
 * Calcula el SHA-256 de un ArrayBuffer y lo devuelve en hexadecimal.
 *
 * Usa Web Crypto, disponible tanto en el navegador como en Node >= 18,
 * de modo que este mismo archivo lo consume la API (Plan 2) sin cambios.
 * Esa identidad es deliberada: el comprobante de borrado se calcula en el
 * navegador y se verifica en el servidor, y si las dos implementaciones
 * divergieran el comprobante dejaría de coincidir.
 */
export async function sha256Hex(data: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}
