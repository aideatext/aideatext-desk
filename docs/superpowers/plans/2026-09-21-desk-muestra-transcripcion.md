# DESK 2a — Muestra gratuita de transcripción

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Un tesista sube **un solo minuto** de su grabación y recibe la transcripción real de Azure, con comprobante de borrado — sin pagar, sin cuenta, y sin que el resto de su audio salga de su computadora.

**Architecture:** El navegador decodifica el audio, recorta el minuto elegido y lo codifica a WAV; **solo ese minuto se sube**, con una URL firmada, directo a Blob Storage. Azure Functions orquesta la transcripción por lote y borra todo al entregar. No hay pagos: esto es la rampa de confianza que alimenta los trabajos de pago del Plan 2b.

**Tech Stack:** TypeScript · Azure Functions v4 (Node 22) · Azure Blob Storage + SAS · Azure AI Speech batch (`api-version=2024-11-15`) · Azure Table Storage · Vitest · Bicep

**Spec:** [`docs/superpowers/specs/2026-09-20-desk-v01-design.md`](../specs/2026-09-20-desk-v01-design.md) — §2.2 pipeline de audio, §2.3 muestra gratuita, §2.5 anti-abuso, §3 borrado verificable.

---

## Global Constraints

- **Solo sube el minuto recortado, nunca el archivo completo.** Es la diferencia entre «arriesga 60 segundos» y «arriesga sus seis horas de entrevistas», y es el argumento entero de la muestra. Cualquier diseño que suba el original viola el spec §2.3.
- **El archivo no pasa por el servidor de aplicación.** Se sube con una URL firmada (SAS) directo a Blob Storage. La Function emite el permiso; no toca los bytes.
- **La base de datos nunca almacena contenido.** Solo `jobId`, estado, vencimiento y hashes. Ni audio, ni texto, ni nombre de archivo original (spec §2.2).
- **La IP nunca se almacena.** Solo `SHA-256(IP + salt rotatorio de 24 h)` (spec §2.5). Declarado en `SECURITY.md`.
- **El borrado no depende de que nuestro código funcione bien** (spec §3). Tres capas: borrado al entregar, barrido programado, y política de ciclo de vida de Azure como respaldo final.
- **`soft delete`, versionado y restauración puntual: DESACTIVADOS** en la cuenta de almacenamiento. Con los valores por defecto, un archivo «borrado» sigue siendo recuperable durante días y la promesa de cero retención sería falsa (spec §3).
- **Nunca decir «no se puede».** Todo límite excedido deriva a `first.contact.desk@aideatext.ai` (spec §2.4).
- **Idioma de la interfaz: español de México.** Revisar acentos.
- **TypeScript**, nunca JavaScript plano. `noUnusedLocals` está activo: un import sin usar es error de compilación.
- **Node ≥ 22.12.**
- **Cero peticiones de red al procesar en el navegador.** El recorte y la codificación a WAV ocurren localmente. La única petición permitida es la subida deliberada del minuto, tras la acción explícita del usuario.
- ⚠️ **La CSP de producción es `connect-src 'self'`.** La subida a Blob Storage es a `*.blob.core.windows.net`, **otro origen**. Hay que ampliar la directiva a ese host exacto — nunca a `*`. Ver Task 7.

---

## Restricciones de Azure verificadas (2026-09-21)

Verificadas contra la documentación antes de escribir este plan, no de memoria:

| Hecho | Consecuencia |
|---|---|
| **REST v3.0 y v3.2 se retiraron el 31-03-2026** | Usar `api-version=2024-11-15`. Cualquier código con `/v3.2/` está muerto |
| Endpoint: `POST /speechtotext/transcriptions:submit?api-version=2024-11-15` | Acción, no el viejo `createTranscription` |
| **`destinationContainerUrl` va dentro de `properties`** | En la raíz **se ignora en silencio** y los resultados van a un contenedor de Microsoft |
| `timeToLiveHours` es obligatorio, **mínimo 6 h** | ⚠️ Ver abajo |
| «Borrar el trabajo de transcripción borra también sus datos de resultado» | Es nuestra vía de escape |

### ⚠️ El TTL mínimo de 6 horas contradice nuestra promesa

Azure conserva el registro de transcripción **un mínimo de seis horas**; no se puede pedir menos. `SECURITY.md` promete borrado inmediato al entregar.

**Resolución:** se borra el trabajo de transcripción **explícitamente** vía `DELETE` en cuanto se recuperan los resultados, sin esperar al TTL. La documentación confirma que eso elimina también los datos de resultado. El `timeToLiveHours: 6` queda solo como red de seguridad si nuestro borrado falla.

Esto **debe** reflejarse en `SECURITY.md` (Task 9): la afirmación honesta es «borramos al entregar, y Azure lo elimina de todos modos a las 6 horas si nuestro borrado fallara», no «no existe en ningún lado ni un segundo».

---

## Estructura de archivos

```
web/src/audio/                 (navegador — ninguna petición de red)
├── decode.ts        Decodifica y mide duración con Web Audio API
├── slice.ts         Recorta N segundos de un AudioBuffer
├── wav.ts           Codifica un AudioBuffer a WAV PCM 16 bits
└── upload.ts        PUT del WAV a la URL firmada

api/                           (Azure Functions v4)
├── src/
│   ├── lib/
│   │   ├── ipHash.ts      SHA-256(IP + salt rotatorio). La IP nunca se guarda
│   │   ├── jobs.ts        Estado en Table Storage. Nunca contenido
│   │   ├── blob.ts        Emisión de SAS y borrado
│   │   └── speech.ts      Cliente de Azure Speech batch
│   └── functions/
│       ├── sampleStart.ts       POST  → valida, limita, emite SAS
│       ├── sampleTranscribe.ts  POST  → lanza la transcripción
│       ├── sampleStatus.ts      GET   → estado, texto, comprobante
│       └── sweeper.ts           timer → borrado de respaldo
├── host.json · package.json · tsconfig.json

infra/main.bicep               Garantías de borrado, versionadas
```

---

### Task 1: Decodificar audio y medir duración en el navegador

**Files:**
- Create: `web/src/audio/decode.ts`
- Test: `web/src/audio/decode.test.ts`

**Interfaces:**
- Consumes: nada.
- Produces:
  ```ts
  interface AudioInfo { duracionSegundos: number; canales: number; frecuencia: number; }
  decodificar(data: ArrayBuffer): Promise<AudioBuffer>
  medir(buffer: AudioBuffer): AudioInfo
  ```
  Los consumen las Tasks 2, 3 y 8.

> **Por qué Web Audio y no ffmpeg.wasm.** `decodeAudioData` ya decodifica mp3, m4a, ogg y wav de forma nativa en el navegador, sin dependencias ni megabytes de WASM. Video queda **fuera de alcance** en 2a y deriva al correo (spec §2.4): `decodeAudioData` sobre un contenedor mp4 es inconsistente entre navegadores, y fingir que funciona sería peor que no ofrecerlo.

- [ ] **Step 1: Escribir la prueba que falla**

Crear `web/src/audio/decode.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { decodificar, medir } from './decode';

/**
 * Genera un WAV PCM 16 bits mono con un tono, sin depender de ningún
 * archivo binario en el repositorio.
 */
function wavDePrueba(segundos: number, frecuencia = 16000): ArrayBuffer {
  const muestras = Math.floor(segundos * frecuencia);
  const buf = new ArrayBuffer(44 + muestras * 2);
  const v = new DataView(buf);
  const txt = (pos: number, s: string) =>
    [...s].forEach((c, i) => v.setUint8(pos + i, c.charCodeAt(0)));

  txt(0, 'RIFF');  v.setUint32(4, 36 + muestras * 2, true);
  txt(8, 'WAVE');  txt(12, 'fmt ');
  v.setUint32(16, 16, true);          // tamaño del bloque fmt
  v.setUint16(20, 1, true);           // PCM
  v.setUint16(22, 1, true);           // mono
  v.setUint32(24, frecuencia, true);
  v.setUint32(28, frecuencia * 2, true);
  v.setUint16(32, 2, true);
  v.setUint16(34, 16, true);          // bits por muestra
  txt(36, 'data'); v.setUint32(40, muestras * 2, true);

  for (let i = 0; i < muestras; i++) {
    v.setInt16(44 + i * 2, Math.sin((i / frecuencia) * 440 * 2 * Math.PI) * 16000, true);
  }
  return buf;
}

describe('decode', () => {
  it('mide la duración de un audio de 3 segundos', async () => {
    const info = medir(await decodificar(wavDePrueba(3)));
    // Tolerancia por redondeo de muestras, no por incertidumbre.
    expect(info.duracionSegundos).toBeCloseTo(3, 1);
  });

  it('mide la duración de un audio de 90 segundos', async () => {
    const info = medir(await decodificar(wavDePrueba(90)));
    expect(info.duracionSegundos).toBeCloseTo(90, 1);
    // Si devolviera una constante, esta prueba y la anterior no podrían
    // pasar a la vez.
  });

  it('reporta canales y frecuencia reales', async () => {
    const info = medir(await decodificar(wavDePrueba(1, 8000)));
    expect(info.canales).toBe(1);
    expect(info.frecuencia).toBe(8000);
  });

  it('rechaza datos que no son audio', async () => {
    await expect(decodificar(new TextEncoder().encode('esto no es audio').buffer as ArrayBuffer))
      .rejects.toThrow();
  });
});
```

- [ ] **Step 2: Ejecutar y verificar que falla**

Run: `cd web && npm test -- decode`
Expected: FAIL — `Cannot find module './decode'`.

- [ ] **Step 3: Añadir el entorno de navegador a Vitest**

`decodeAudioData` no existe en Node. Modificar `web/vite.config.ts`:

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  build: { outDir: 'dist', target: 'es2022' },
  test: {
    globals: true,
    // `node` por defecto; los archivos de audio necesitan APIs de navegador.
    environment: 'node',
    environmentMatchGlobs: [['src/audio/**', 'happy-dom']],
  },
});
```

Instalar: `cd web && npm install -D happy-dom`

> ⚠️ **Verificar antes de seguir** que `happy-dom` implementa `AudioContext.decodeAudioData`. Si no lo hace, **no fingir la prueba con un mock**: reportarlo. La alternativa es `vitest --browser` con Playwright, más pesada pero real. Una prueba de decodificación contra un mock no prueba nada, y este proyecto ya produjo cinco pruebas incapaces de fallar.

- [ ] **Step 4: Implementar `web/src/audio/decode.ts`**

```ts
export interface AudioInfo {
  duracionSegundos: number;
  canales: number;
  frecuencia: number;
}

/**
 * Decodifica audio en memoria. No realiza ninguna petición de red: es el
 * mismo fundamento verificable que el pipeline de PDF (spec §3).
 *
 * Se copia el buffer con `slice(0)` porque `decodeAudioData` **detacha**
 * el ArrayBuffer que recibe. Sin la copia, el llamador se queda con un
 * buffer vacío y cualquier hash posterior sería el de la cadena vacía —
 * exactamente el defecto que ya costó una ronda en el pipeline de PDF.
 */
export async function decodificar(data: ArrayBuffer): Promise<AudioBuffer> {
  const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
  try {
    return await ctx.decodeAudioData(data.slice(0));
  } finally {
    await ctx.close();
  }
}

export function medir(buffer: AudioBuffer): AudioInfo {
  return {
    duracionSegundos: buffer.duration,
    canales: buffer.numberOfChannels,
    frecuencia: buffer.sampleRate,
  };
}
```

- [ ] **Step 5: Ejecutar y verificar que pasa**

Run: `cd web && npm test -- decode`
Expected: PASS — 4 pruebas.

- [ ] **Step 6: Verificar que el buffer del llamador sobrevive**

Añadir a `decode.test.ts`:

```ts
it('no detacha el buffer del llamador', async () => {
  const pdf = wavDePrueba(2);
  await decodificar(pdf);
  // Si `decodeAudioData` recibiera el buffer original, esto sería 0 y
  // cualquier hash posterior seria el de vacio.
  expect(pdf.byteLength).toBeGreaterThan(0);
});
```

Run: `cd web && npm test -- decode` → 5 pruebas.

Verificar que muerde: quitar `.slice(0)` del código, la prueba debe ponerse roja. Restaurar.

- [ ] **Step 7: Commit**

```bash
git add web/src/audio/decode.ts web/src/audio/decode.test.ts web/vite.config.ts web/package.json web/package-lock.json
git commit -m "feat(web): decodificacion y medicion de audio en el navegador

decodeAudioData detacha el ArrayBuffer que recibe, asi que se le pasa una
copia. Sin eso el llamador se queda con un buffer vacio y cualquier hash
posterior seria el de la cadena vacia -- el mismo defecto que ya costo una
ronda en el pipeline de PDF.

Sin ffmpeg.wasm: el navegador ya decodifica mp3, m4a, ogg y wav de forma
nativa. Video queda fuera de alcance y deriva al correo."
```

---

### Task 2: Recortar el minuto y codificarlo a WAV

**Files:**
- Create: `web/src/audio/slice.ts`
- Create: `web/src/audio/wav.ts`
- Test: `web/src/audio/wav.test.ts`

**Interfaces:**
- Consumes: `decodificar`, `medir` (Task 1).
- Produces:
  ```ts
  recortar(buffer: AudioBuffer, desdeSegundos: number, duracionSegundos: number): AudioBuffer
  aWav(buffer: AudioBuffer): ArrayBuffer   // PCM 16 bits, mono, 16 kHz
  ```
  Los consumen las Tasks 3 y 8.

> **Por qué mono a 16 kHz.** Azure Speech recomienda WAV PCM sin pérdida, y 16 kHz mono es el formato nativo del reconocimiento: más frecuencia no mejora la transcripción y multiplica los bytes que el usuario sube. Un minuto queda en ~1,9 MB en vez de ~10.

- [ ] **Step 1: Escribir las pruebas que fallan**

Crear `web/src/audio/wav.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { decodificar, medir } from './decode';
import { recortar } from './slice';
import { aWav } from './wav';

function wavDePrueba(segundos: number, frecuencia = 16000): ArrayBuffer {
  const muestras = Math.floor(segundos * frecuencia);
  const buf = new ArrayBuffer(44 + muestras * 2);
  const v = new DataView(buf);
  const txt = (pos: number, s: string) =>
    [...s].forEach((c, i) => v.setUint8(pos + i, c.charCodeAt(0)));
  txt(0, 'RIFF');  v.setUint32(4, 36 + muestras * 2, true);
  txt(8, 'WAVE');  txt(12, 'fmt ');
  v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, frecuencia, true); v.setUint32(28, frecuencia * 2, true);
  v.setUint16(32, 2, true); v.setUint16(34, 16, true);
  txt(36, 'data'); v.setUint32(40, muestras * 2, true);
  for (let i = 0; i < muestras; i++) {
    v.setInt16(44 + i * 2, Math.sin((i / frecuencia) * 440 * 2 * Math.PI) * 16000, true);
  }
  return buf;
}

describe('recortar', () => {
  it('extrae exactamente la duración pedida', async () => {
    const b = await decodificar(wavDePrueba(90));
    expect(medir(recortar(b, 30, 60)).duracionSegundos).toBeCloseTo(60, 1);
  });

  it('recorta desde el punto pedido, no desde el principio', async () => {
    const b = await decodificar(wavDePrueba(90));
    const desdeCero = recortar(b, 0, 10).getChannelData(0);
    const desdeTreinta = recortar(b, 30, 10).getChannelData(0);
    // Un tono continuo difiere de fase entre dos ventanas distintas.
    // Si `recortar` ignorara el desplazamiento, serian identicos.
    const iguales = desdeCero.every((x, i) => Math.abs(x - desdeTreinta[i]) < 1e-6);
    expect(iguales).toBe(false);
  });

  it('no excede el final del audio', async () => {
    const b = await decodificar(wavDePrueba(30));
    // Se piden 60 s desde el segundo 20: solo quedan 10.
    expect(medir(recortar(b, 20, 60)).duracionSegundos).toBeCloseTo(10, 1);
  });
});

describe('aWav', () => {
  it('produce una cabecera RIFF/WAVE válida', async () => {
    const wav = aWav(recortar(await decodificar(wavDePrueba(5)), 0, 2));
    const t = new TextDecoder().decode(new Uint8Array(wav).slice(0, 12));
    expect(t.slice(0, 4)).toBe('RIFF');
    expect(t.slice(8, 12)).toBe('WAVE');
  });

  it('declara mono, 16 bits y 16 kHz en la cabecera', async () => {
    const wav = aWav(recortar(await decodificar(wavDePrueba(5, 44100)), 0, 2));
    const v = new DataView(wav);
    expect(v.getUint16(22, true)).toBe(1);      // canales
    expect(v.getUint32(24, true)).toBe(16000);  // frecuencia
    expect(v.getUint16(34, true)).toBe(16);     // bits
  });

  it('el tamaño declarado coincide con el tamaño real', async () => {
    const wav = aWav(recortar(await decodificar(wavDePrueba(5)), 0, 2));
    const v = new DataView(wav);
    // Un desajuste aqui produce un WAV que Azure rechaza sin decir por que.
    expect(v.getUint32(4, true)).toBe(wav.byteLength - 8);
    expect(v.getUint32(40, true)).toBe(wav.byteLength - 44);
  });

  it('un minuto pesa alrededor de 1,9 MB', async () => {
    const wav = aWav(recortar(await decodificar(wavDePrueba(70)), 0, 60));
    // 16000 muestras/s x 2 bytes x 60 s = 1 920 000 + cabecera
    expect(wav.byteLength).toBeGreaterThan(1_900_000);
    expect(wav.byteLength).toBeLessThan(1_950_000);
  });
});
```

- [ ] **Step 2: Ejecutar y verificar que falla**

Run: `cd web && npm test -- wav`
Expected: FAIL — `Cannot find module './slice'`.

- [ ] **Step 3: Implementar `web/src/audio/slice.ts`**

```ts
/**
 * Extrae una ventana del audio. Si la ventana excede el final, devuelve
 * lo que queda en vez de fallar: el usuario eligió un punto válido y
 * recortar de menos es mejor que un error.
 */
export function recortar(
  buffer: AudioBuffer,
  desdeSegundos: number,
  duracionSegundos: number
): AudioBuffer {
  const fr = buffer.sampleRate;
  const inicio = Math.max(0, Math.floor(desdeSegundos * fr));
  const largo = Math.min(
    Math.floor(duracionSegundos * fr),
    buffer.length - inicio
  );

  const ctx = new OfflineAudioContext(buffer.numberOfChannels, largo, fr);
  const salida = ctx.createBuffer(buffer.numberOfChannels, largo, fr);

  for (let c = 0; c < buffer.numberOfChannels; c++) {
    salida.copyToChannel(buffer.getChannelData(c).subarray(inicio, inicio + largo), c);
  }
  return salida;
}
```

- [ ] **Step 4: Implementar `web/src/audio/wav.ts`**

```ts
/** Frecuencia nativa del reconocimiento de voz. Más no mejora la transcripción. */
const FRECUENCIA_DESTINO = 16000;

/**
 * Codifica un AudioBuffer a WAV PCM 16 bits, mono, 16 kHz.
 *
 * Mono y 16 kHz no son una degradación descuidada: es el formato nativo
 * del reconocimiento de voz. Subir estéreo a 44,1 kHz multiplica por
 * cinco los bytes que el usuario envía sin mejorar una sola palabra.
 */
export function aWav(buffer: AudioBuffer): ArrayBuffer {
  const mono = mezclarAMono(buffer);
  const muestras = remuestrear(mono, buffer.sampleRate, FRECUENCIA_DESTINO);

  const bytes = muestras.length * 2;
  const out = new ArrayBuffer(44 + bytes);
  const v = new DataView(out);
  const txt = (pos: number, s: string) =>
    [...s].forEach((c, i) => v.setUint8(pos + i, c.charCodeAt(0)));

  txt(0, 'RIFF');
  v.setUint32(4, 36 + bytes, true);         // tamaño total menos 8
  txt(8, 'WAVE');
  txt(12, 'fmt ');
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true);                  // PCM sin comprimir
  v.setUint16(22, 1, true);                  // mono
  v.setUint32(24, FRECUENCIA_DESTINO, true);
  v.setUint32(28, FRECUENCIA_DESTINO * 2, true);
  v.setUint16(32, 2, true);
  v.setUint16(34, 16, true);
  txt(36, 'data');
  v.setUint32(40, bytes, true);

  for (let i = 0; i < muestras.length; i++) {
    const s = Math.max(-1, Math.min(1, muestras[i]));
    v.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  return out;
}

function mezclarAMono(buffer: AudioBuffer): Float32Array {
  if (buffer.numberOfChannels === 1) return buffer.getChannelData(0);
  const salida = new Float32Array(buffer.length);
  for (let c = 0; c < buffer.numberOfChannels; c++) {
    const canal = buffer.getChannelData(c);
    for (let i = 0; i < buffer.length; i++) salida[i] += canal[i] / buffer.numberOfChannels;
  }
  return salida;
}

/** Remuestreo lineal. Suficiente para voz; no es audio musical. */
function remuestrear(datos: Float32Array, desde: number, hasta: number): Float32Array {
  if (desde === hasta) return datos;
  const razon = desde / hasta;
  const salida = new Float32Array(Math.floor(datos.length / razon));
  for (let i = 0; i < salida.length; i++) {
    const pos = i * razon;
    const j = Math.floor(pos);
    const frac = pos - j;
    salida[i] = (datos[j] ?? 0) * (1 - frac) + (datos[j + 1] ?? datos[j] ?? 0) * frac;
  }
  return salida;
}
```

- [ ] **Step 5: Ejecutar y verificar que pasa**

Run: `cd web && npm test -- wav`
Expected: PASS — 8 pruebas.

- [ ] **Step 6: Commit**

```bash
git add web/src/audio/slice.ts web/src/audio/wav.ts web/src/audio/wav.test.ts
git commit -m "feat(web): recorte de audio y codificacion a WAV en el navegador

Mono a 16 kHz es el formato nativo del reconocimiento de voz, no una
degradacion: subir estereo a 44,1 kHz multiplica por cinco los bytes que
el usuario envia sin mejorar una sola palabra. Un minuto queda en ~1,9 MB.

La prueba de recorte compara dos ventanas distintas del mismo tono: si la
funcion ignorara el desplazamiento, serian identicas y la prueba lo
detecta. Y el tamano declarado en la cabecera se contrasta con el real,
porque un desajuste produce un WAV que Azure rechaza sin decir por que."
```

---

### Task 3: Hash de IP con salt rotatorio

**Files:**
- Create: `api/package.json`, `api/tsconfig.json`, `api/host.json`
- Create: `api/src/lib/ipHash.ts`
- Test: `api/src/lib/ipHash.test.ts`

**Interfaces:**
- Consumes: nada.
- Produces: `hashDeOrigen(ip: string, ahora?: Date): Promise<string>` — 64 hex. Lo consume la Task 5.

> **Por qué el salt rota.** Guardar la IP sería dato personal bajo la LFPDPPP y el RGPD, y `SECURITY.md` promete explícitamente que no se almacena. Con un salt que cambia cada 24 h, los hashes de ayer dejan de corresponder a nadie por sí solos: caducidad automática sin borrado que administrar.

- [ ] **Step 1: Crear `api/package.json`**

```json
{
  "name": "desk-api",
  "private": true,
  "type": "module",
  "engines": { "node": ">=22.12" },
  "scripts": {
    "build": "tsc",
    "test": "vitest run",
    "start": "func start"
  },
  "dependencies": {
    "@azure/functions": "^4.6.0",
    "@azure/storage-blob": "^12.26.0",
    "@azure/data-tables": "^13.3.0"
  },
  "devDependencies": {
    "typescript": "^5.7.0",
    "vitest": "^5.0.0",
    "@types/node": "^22.10.0"
  }
}
```

- [ ] **Step 2: Crear `api/tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022"],
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "skipLibCheck": true,
    "outDir": "dist",
    "rootDir": "src",
    "types": ["node", "vitest/globals"]
  },
  "include": ["src"]
}
```

- [ ] **Step 3: Crear `api/host.json`**

```json
{
  "version": "2.0",
  "logging": {
    "applicationInsights": {
      "samplingSettings": { "isEnabled": true }
    }
  },
  "extensionBundle": {
    "id": "Microsoft.Azure.Functions.ExtensionBundle",
    "version": "[4.*, 5.0.0)"
  }
}
```

> ⚠️ **Application Insights registra cuerpos de petición si se le deja** (spec §3). Antes de desplegar hay que confirmar que ningún contenido de usuario llega a los logs. Se verifica en la Task 9.

- [ ] **Step 4: Escribir la prueba que falla**

Crear `api/src/lib/ipHash.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { hashDeOrigen } from './ipHash';

describe('hashDeOrigen', () => {
  it('devuelve 64 hexadecimales en minúscula', async () => {
    expect(await hashDeOrigen('187.190.1.1')).toMatch(/^[0-9a-f]{64}$/);
  });

  it('es estable dentro del mismo día', async () => {
    const d = new Date('2026-09-21T03:00:00Z');
    expect(await hashDeOrigen('187.190.1.1', d))
      .toBe(await hashDeOrigen('187.190.1.1', new Date('2026-09-21T22:00:00Z')));
  });

  it('cambia al día siguiente: los hashes de ayer caducan solos', async () => {
    expect(await hashDeOrigen('187.190.1.1', new Date('2026-09-21T12:00:00Z')))
      .not.toBe(await hashDeOrigen('187.190.1.1', new Date('2026-09-22T12:00:00Z')));
  });

  it('distingue orígenes distintos', async () => {
    const d = new Date('2026-09-21T12:00:00Z');
    expect(await hashDeOrigen('187.190.1.1', d)).not.toBe(await hashDeOrigen('187.190.1.2', d));
  });

  it('no contiene la IP en claro', async () => {
    expect(await hashDeOrigen('187.190.1.1')).not.toContain('187');
  });
});
```

- [ ] **Step 5: Ejecutar y verificar que falla**

Run: `cd api && npm install && npm test`
Expected: FAIL — `Cannot find module './ipHash'`.

- [ ] **Step 6: Implementar `api/src/lib/ipHash.ts`**

```ts
import { createHash } from 'node:crypto';

/**
 * Convierte una dirección de origen en un identificador de conteo que no
 * es reversible ni duradero.
 *
 * El salt combina un secreto de entorno con la fecha UTC, así que rota
 * cada 24 horas: los hashes de ayer dejan de corresponder a nadie por sí
 * solos. Caducidad automática, sin borrado que administrar.
 *
 * La IP **nunca** se almacena. Una dirección IP es dato personal bajo la
 * LFPDPPP mexicana y el RGPD, y `SECURITY.md` lo promete explícitamente.
 */
export async function hashDeOrigen(ip: string, ahora: Date = new Date()): Promise<string> {
  const secreto = process.env.SALT_SECRETO;
  if (!secreto) throw new Error('Falta SALT_SECRETO');

  const dia = ahora.toISOString().slice(0, 10); // AAAA-MM-DD en UTC
  return createHash('sha256').update(`${ip}|${secreto}|${dia}`).digest('hex');
}
```

- [ ] **Step 7: Ejecutar y verificar que pasa**

Run: `cd api && SALT_SECRETO=prueba npm test`
Expected: PASS — 5 pruebas.

- [ ] **Step 8: Commit**

```bash
git add api/package.json api/tsconfig.json api/host.json api/src/lib/ipHash.ts api/src/lib/ipHash.test.ts api/package-lock.json
git commit -m "feat(api): hash de origen con salt rotatorio, la IP nunca se guarda

El salt combina un secreto de entorno con la fecha UTC, asi que rota cada
24 horas y los hashes de ayer dejan de corresponder a nadie por si solos.
Caducidad automatica sin borrado que administrar.

Una IP es dato personal bajo LFPDPPP y RGPD, y SECURITY.md promete
explicitamente que no se almacena."
```

---

### Task 4: Estado de trabajos en Table Storage

**Files:**
- Create: `api/src/lib/jobs.ts`
- Test: `api/src/lib/jobs.test.ts`

**Interfaces:**
- Consumes: nada.
- Produces:
  ```ts
  type EstadoTrabajo = 'esperando_subida' | 'transcribiendo' | 'listo' | 'error' | 'borrado';
  interface Trabajo {
    jobId: string;
    estado: EstadoTrabajo;
    hashAudio: string;        // SHA-256 del WAV, calculado en el navegador
    hashOrigen: string;       // hash de IP, para el límite
    creadoEn: string;         // ISO
    venceEn: string;          // ISO
    transcripcionId?: string; // id del trabajo en Azure Speech
    borradoEn?: string;       // ISO, cuando se completó el borrado
  }
  crearTrabajo(t: Omit<Trabajo,'jobId'|'creadoEn'|'venceEn'>): Promise<Trabajo>
  leerTrabajo(jobId: string): Promise<Trabajo | undefined>
  actualizarTrabajo(jobId: string, cambios: Partial<Trabajo>): Promise<void>
  contarPorOrigen(hashOrigen: string): Promise<number>
  trabajosVencidos(ahora?: Date): Promise<Trabajo[]>
  ```
  Los consumen las Tasks 5, 6 y 7.

> **Lo que esta tabla NO guarda:** ni audio, ni texto transcrito, ni el nombre del archivo original, ni la IP. Solo identificadores, estado y hashes (spec §2.2). Aunque la tabla se filtrara, no habría nada de nadie.

- [ ] **Step 1: Escribir la prueba que falla**

Crear `api/src/lib/jobs.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { crearTrabajo, leerTrabajo, actualizarTrabajo, contarPorOrigen, trabajosVencidos, _limpiarParaPruebas } from './jobs';

const base = { estado: 'esperando_subida' as const, hashAudio: 'a'.repeat(64), hashOrigen: 'b'.repeat(64) };

beforeEach(() => _limpiarParaPruebas());

describe('jobs', () => {
  it('crea un trabajo con id y vencimiento', async () => {
    const t = await crearTrabajo(base);
    expect(t.jobId).toMatch(/^[0-9a-f-]{36}$/);
    expect(new Date(t.venceEn).getTime()).toBeGreaterThan(Date.now());
  });

  it('lee lo que escribió', async () => {
    const t = await crearTrabajo(base);
    expect((await leerTrabajo(t.jobId))?.hashAudio).toBe(base.hashAudio);
  });

  it('devuelve undefined para un id inexistente', async () => {
    expect(await leerTrabajo('no-existe')).toBeUndefined();
  });

  it('actualiza solo los campos indicados', async () => {
    const t = await crearTrabajo(base);
    await actualizarTrabajo(t.jobId, { estado: 'listo' });
    const l = await leerTrabajo(t.jobId);
    expect(l?.estado).toBe('listo');
    expect(l?.hashAudio).toBe(base.hashAudio); // no se perdio
  });

  it('cuenta los trabajos de un mismo origen', async () => {
    await crearTrabajo(base);
    await crearTrabajo(base);
    await crearTrabajo({ ...base, hashOrigen: 'c'.repeat(64) });
    expect(await contarPorOrigen(base.hashOrigen)).toBe(2);
  });

  it('encuentra los vencidos y NO los vigentes', async () => {
    const t = await crearTrabajo(base);
    // Dentro del plazo: no debe aparecer.
    expect((await trabajosVencidos()).map(x => x.jobId)).not.toContain(t.jobId);
    // Un dia despues: si.
    const manana = new Date(Date.now() + 25 * 3600_000);
    expect((await trabajosVencidos(manana)).map(x => x.jobId)).toContain(t.jobId);
  });

  it('nunca expone campos de contenido', async () => {
    const t = await crearTrabajo(base);
    const l = await leerTrabajo(t.jobId)!;
    // Si alguien anade texto o nombre de archivo al modelo, esto se pone rojo.
    expect(Object.keys(l!)).toEqual(
      expect.not.arrayContaining(['texto', 'transcripcion', 'nombreArchivo', 'ip'])
    );
  });
});
```

- [ ] **Step 2: Ejecutar y verificar que falla**

Run: `cd api && SALT_SECRETO=prueba npm test -- jobs`
Expected: FAIL — `Cannot find module './jobs'`.

- [ ] **Step 3: Implementar `api/src/lib/jobs.ts`**

```ts
import { TableClient } from '@azure/data-tables';
import { randomUUID } from 'node:crypto';

export type EstadoTrabajo =
  | 'esperando_subida' | 'transcribiendo' | 'listo' | 'error' | 'borrado';

export interface Trabajo {
  jobId: string;
  estado: EstadoTrabajo;
  /** SHA-256 del WAV, calculado en el navegador. Sirve al comprobante. */
  hashAudio: string;
  /** Hash de origen para el límite de uso. Nunca es una IP. */
  hashOrigen: string;
  creadoEn: string;
  venceEn: string;
  transcripcionId?: string;
  borradoEn?: string;
}

/** Vida de un trabajo antes de que el barrido lo elimine. */
const HORAS_DE_VIDA = 2;
const TABLA = 'trabajos';

/**
 * En pruebas se usa un mapa en memoria. No es un mock de la lógica bajo
 * prueba: es el almacén, y las aserciones son sobre nuestro
 * comportamiento, no sobre el de Azure.
 */
const memoria = new Map<string, Trabajo>();
const enPruebas = () => process.env.NODE_ENV === 'test' || process.env.VITEST === 'true';

export function _limpiarParaPruebas(): void { memoria.clear(); }

function cliente(): TableClient {
  const cs = process.env.STORAGE_CONNECTION_STRING;
  if (!cs) throw new Error('Falta STORAGE_CONNECTION_STRING');
  return TableClient.fromConnectionString(cs, TABLA);
}

export async function crearTrabajo(
  t: Omit<Trabajo, 'jobId' | 'creadoEn' | 'venceEn'>
): Promise<Trabajo> {
  const ahora = new Date();
  const trabajo: Trabajo = {
    ...t,
    jobId: randomUUID(),
    creadoEn: ahora.toISOString(),
    venceEn: new Date(ahora.getTime() + HORAS_DE_VIDA * 3600_000).toISOString(),
  };
  if (enPruebas()) { memoria.set(trabajo.jobId, trabajo); return trabajo; }
  await cliente().createEntity({ partitionKey: 'muestra', rowKey: trabajo.jobId, ...trabajo });
  return trabajo;
}

export async function leerTrabajo(jobId: string): Promise<Trabajo | undefined> {
  if (enPruebas()) return memoria.get(jobId);
  try {
    const e = await cliente().getEntity<Trabajo>('muestra', jobId);
    return { ...e } as unknown as Trabajo;
  } catch { return undefined; }
}

export async function actualizarTrabajo(jobId: string, cambios: Partial<Trabajo>): Promise<void> {
  if (enPruebas()) {
    const t = memoria.get(jobId);
    if (t) memoria.set(jobId, { ...t, ...cambios });
    return;
  }
  await cliente().updateEntity({ partitionKey: 'muestra', rowKey: jobId, ...cambios }, 'Merge');
}

export async function contarPorOrigen(hashOrigen: string): Promise<number> {
  if (enPruebas()) return [...memoria.values()].filter(t => t.hashOrigen === hashOrigen).length;
  let n = 0;
  const it = cliente().listEntities<Trabajo>({
    queryOptions: { filter: `PartitionKey eq 'muestra' and hashOrigen eq '${hashOrigen}'` },
  });
  for await (const _ of it) n++;
  return n;
}

export async function trabajosVencidos(ahora: Date = new Date()): Promise<Trabajo[]> {
  const corte = ahora.toISOString();
  if (enPruebas()) {
    return [...memoria.values()].filter(t => t.venceEn <= corte && t.estado !== 'borrado');
  }
  const salida: Trabajo[] = [];
  const it = cliente().listEntities<Trabajo>({
    queryOptions: { filter: `PartitionKey eq 'muestra' and venceEn le '${corte}'` },
  });
  for await (const e of it) {
    if ((e as unknown as Trabajo).estado !== 'borrado') salida.push({ ...e } as unknown as Trabajo);
  }
  return salida;
}
```

- [ ] **Step 4: Ejecutar y verificar que pasa**

Run: `cd api && SALT_SECRETO=prueba npm test -- jobs`
Expected: PASS — 7 pruebas.

- [ ] **Step 5: Commit**

```bash
git add api/src/lib/jobs.ts api/src/lib/jobs.test.ts
git commit -m "feat(api): estado de trabajos, sin contenido de usuario

La tabla guarda identificadores, estado y hashes. Ni audio, ni texto
transcrito, ni nombre de archivo, ni IP. Aunque se filtrara no habria
nada de nadie.

Una prueba afirma explicitamente que el modelo no expone campos de
contenido: si alguien anade texto o nombreArchivo mas adelante, se pone
roja."
```

---

### Task 5: `sampleStart` — validar, limitar y emitir la URL firmada

**Files:**
- Create: `api/src/lib/blob.ts`
- Create: `api/src/functions/sampleStart.ts`
- Test: `api/src/functions/sampleStart.test.ts`

**Interfaces:**
- Consumes: `hashDeOrigen` (Task 3); `crearTrabajo`, `contarPorOrigen` (Task 4).
- Produces:
  ```ts
  urlDeSubida(jobId: string): Promise<{ url: string; venceEn: string }>
  borrarBlob(jobId: string): Promise<void>
  ```
  desde `blob.ts`. Los consumen las Tasks 6 y 7.

  `POST /api/sample/start` con `{ hashAudio, duracionSegundos }` → `{ jobId, url, venceEn }`.

**Límite (spec §2.5):** **3 muestras por origen cada 24 horas**. Al excederlo no se dice «no se puede»: se deriva al correo.

- [ ] **Step 1: Escribir la prueba que falla**

Crear `api/src/functions/sampleStart.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { manejarStart } from './sampleStart';
import { _limpiarParaPruebas } from '../lib/jobs';

const peticion = (over: Record<string, unknown> = {}) => ({
  ip: '187.190.1.1',
  cuerpo: { hashAudio: 'a'.repeat(64), duracionSegundos: 60, ...over },
});

beforeEach(() => _limpiarParaPruebas());

describe('manejarStart', () => {
  it('devuelve jobId y URL de subida', async () => {
    const r = await manejarStart(peticion());
    expect(r.estado).toBe(200);
    expect(r.cuerpo.jobId).toMatch(/^[0-9a-f-]{36}$/);
    expect(r.cuerpo.url).toContain('http');
  });

  it('rechaza un hash mal formado', async () => {
    const r = await manejarStart(peticion({ hashAudio: 'corto' }));
    expect(r.estado).toBe(400);
  });

  it('rechaza más de 60 segundos: la muestra es de un minuto', async () => {
    const r = await manejarStart(peticion({ duracionSegundos: 61 }));
    expect(r.estado).toBe(400);
  });

  it('acepta exactamente 60 segundos', async () => {
    expect((await manejarStart(peticion({ duracionSegundos: 60 }))).estado).toBe(200);
  });

  it('permite tres muestras y bloquea la cuarta', async () => {
    for (let i = 0; i < 3; i++) {
      expect((await manejarStart(peticion())).estado).toBe(200);
    }
    expect((await manejarStart(peticion())).estado).toBe(429);
  });

  it('el límite es por origen: otra IP no queda bloqueada', async () => {
    for (let i = 0; i < 3; i++) await manejarStart(peticion());
    const otra = await manejarStart({ ...peticion(), ip: '201.1.1.1' });
    // Si el limite fuera global en vez de por origen, esto seria 429.
    expect(otra.estado).toBe(200);
  });

  it('al bloquear, deriva al correo y NO dice "no se puede"', async () => {
    for (let i = 0; i < 3; i++) await manejarStart(peticion());
    const r = await manejarStart(peticion());
    expect(r.cuerpo.mensaje).toContain('first.contact.desk@aideatext.ai');
    expect(r.cuerpo.mensaje.toLowerCase()).not.toContain('no se puede');
  });

  it('no devuelve la IP en ninguna respuesta', async () => {
    const r = await manejarStart(peticion());
    expect(JSON.stringify(r)).not.toContain('187.190');
  });
});
```

- [ ] **Step 2: Ejecutar y verificar que falla**

Run: `cd api && SALT_SECRETO=prueba npm test -- sampleStart`
Expected: FAIL — `Cannot find module './sampleStart'`.

- [ ] **Step 3: Implementar `api/src/lib/blob.ts`**

```ts
import {
  BlobServiceClient, generateBlobSASQueryParameters,
  BlobSASPermissions, StorageSharedKeyCredential, SASProtocol,
} from '@azure/storage-blob';

const CONTENEDOR = 'muestras';
/** La URL firmada vive lo justo para una subida. */
const MINUTOS_DE_SAS = 30;

/** Misma deteccion que `jobs.ts`. Dos criterios distintos para lo mismo
 *  es como un modulo acaba creyendo que esta en pruebas y el otro no. */
const enPruebas = () => process.env.NODE_ENV === 'test' || process.env.VITEST === 'true';

function credencial(): { cuenta: string; clave: string } {
  const cuenta = process.env.STORAGE_ACCOUNT;
  const clave = process.env.STORAGE_KEY;
  if (!cuenta || !clave) throw new Error('Faltan STORAGE_ACCOUNT o STORAGE_KEY');
  return { cuenta, clave };
}

/**
 * Emite una URL firmada de **solo escritura**, para un blob concreto y
 * por treinta minutos.
 *
 * Esto es lo que permite que el archivo **no pase por el servidor de
 * aplicación**: el navegador escribe directo en el almacenamiento. La
 * Function concede el permiso; nunca toca los bytes (spec §2.2).
 */
export async function urlDeSubida(jobId: string): Promise<{ url: string; venceEn: string }> {
  if (enPruebas()) {
    return { url: `https://pruebas.invalid/${CONTENEDOR}/${jobId}?sig=prueba`,
             venceEn: new Date(Date.now() + MINUTOS_DE_SAS * 60_000).toISOString() };
  }
  const { cuenta, clave } = credencial();
  const cred = new StorageSharedKeyCredential(cuenta, clave);
  const vence = new Date(Date.now() + MINUTOS_DE_SAS * 60_000);

  const sas = generateBlobSASQueryParameters({
    containerName: CONTENEDOR,
    blobName: jobId,
    // Solo crear y escribir. Sin lectura, sin listado, sin borrado.
    permissions: BlobSASPermissions.parse('cw'),
    startsOn: new Date(Date.now() - 60_000), // margen de reloj
    expiresOn: vence,
    protocol: SASProtocol.Https,
  }, cred).toString();

  return {
    url: `https://${cuenta}.blob.core.windows.net/${CONTENEDOR}/${jobId}?${sas}`,
    venceEn: vence.toISOString(),
  };
}

export async function borrarBlob(jobId: string): Promise<void> {
  if (enPruebas()) return;
  const { cuenta, clave } = credencial();
  const svc = new BlobServiceClient(
    `https://${cuenta}.blob.core.windows.net`,
    new StorageSharedKeyCredential(cuenta, clave)
  );
  await svc.getContainerClient(CONTENEDOR).getBlockBlobClient(jobId).deleteIfExists();
}
```

- [ ] **Step 4: Implementar `api/src/functions/sampleStart.ts`**

```ts
import { hashDeOrigen } from '../lib/ipHash';
import { crearTrabajo, contarPorOrigen } from '../lib/jobs';
import { urlDeSubida } from '../lib/blob';

/** La muestra es de un minuto. Es el límite del spec §2.3, no una cifra suelta. */
const SEGUNDOS_MAXIMOS = 60;
/** Muestras permitidas por origen cada 24 h (spec §2.5). */
const MUESTRAS_POR_ORIGEN = 3;
const CONTACTO = 'first.contact.desk@aideatext.ai';

export interface PeticionStart {
  ip: string;
  cuerpo: { hashAudio?: unknown; duracionSegundos?: unknown };
}
export interface RespuestaStart {
  estado: number;
  cuerpo: Record<string, any>;
}

export async function manejarStart(p: PeticionStart): Promise<RespuestaStart> {
  const { hashAudio, duracionSegundos } = p.cuerpo;

  if (typeof hashAudio !== 'string' || !/^[0-9a-f]{64}$/.test(hashAudio)) {
    return { estado: 400, cuerpo: { mensaje: 'El identificador del audio no es válido.' } };
  }
  if (typeof duracionSegundos !== 'number' || duracionSegundos <= 0 ||
      duracionSegundos > SEGUNDOS_MAXIMOS) {
    return { estado: 400, cuerpo: {
      mensaje: `La muestra gratuita es de ${SEGUNDOS_MAXIMOS} segundos. ` +
               `Para tu grabación completa, escríbenos a ${CONTACTO}.` } };
  }

  const hashOrigen = await hashDeOrigen(p.ip);

  if (await contarPorOrigen(hashOrigen) >= MUESTRAS_POR_ORIGEN) {
    // No se dice «no se puede»: se deriva (spec §2.4).
    return { estado: 429, cuerpo: {
      mensaje: `Ya usaste tus ${MUESTRAS_POR_ORIGEN} muestras gratuitas de hoy. ` +
               `Escríbenos a ${CONTACTO} y vemos tu caso.` } };
  }

  const trabajo = await crearTrabajo({ estado: 'esperando_subida', hashAudio, hashOrigen });
  const { url, venceEn } = await urlDeSubida(trabajo.jobId);

  return { estado: 200, cuerpo: { jobId: trabajo.jobId, url, venceEn } };
}
```

- [ ] **Step 5: Ejecutar y verificar que pasa**

Run: `cd api && SALT_SECRETO=prueba npm test -- sampleStart`
Expected: PASS — 8 pruebas.

- [ ] **Step 6: Commit**

```bash
git add api/src/lib/blob.ts api/src/functions/sampleStart.ts api/src/functions/sampleStart.test.ts
git commit -m "feat(api): sampleStart valida, limita y emite la URL firmada

La SAS es de solo escritura, para un blob concreto y por treinta minutos.
Eso es lo que permite que el archivo no pase por el servidor de
aplicacion: el navegador escribe directo al almacenamiento y la Function
solo concede el permiso.

Limite de tres muestras por origen cada 24 h. Una prueba comprueba que el
limite es POR ORIGEN y no global -- con un contador global, otra IP
quedaria bloqueada y la prueba lo detecta. Al bloquear se deriva al
correo, nunca se dice 'no se puede'."
```

---

### Task 6: Azure Speech batch — lanzar y recuperar

**Files:**
- Create: `api/src/lib/speech.ts`
- Create: `api/src/functions/sampleTranscribe.ts`
- Test: `api/src/lib/speech.test.ts`

**Interfaces:**
- Consumes: `leerTrabajo`, `actualizarTrabajo` (Task 4); `urlDeSubida` (Task 5).
- Produces:
  ```ts
  lanzarTranscripcion(urlAudio: string): Promise<string>       // devuelve transcripcionId
  recuperarTexto(transcripcionId: string): Promise<string | null>  // null si aún no está
  borrarTranscripcion(transcripcionId: string): Promise<void>
  ```
  Los consumen las Tasks 7 y 8.

> ⚠️ **Step 0 obligatorio: verificar la API antes de escribir nada.** La v3.2 se retiró el 31 de marzo de 2026 y cualquier ejemplo anterior está muerto. Confirmar contra la [documentación vigente](https://learn.microsoft.com/en-us/azure/ai-services/speech-service/batch-transcription-create) que el endpoint, la versión y la forma del cuerpo coinciden con lo de abajo **antes** de implementar. Si difieren, reportarlo en vez de adaptar el código a ciegas.

- [ ] **Step 0: Verificar la API contra la documentación vigente**

Comprobar y anotar en el informe:
1. Endpoint: `POST https://{recurso}.cognitiveservices.azure.com/speechtotext/transcriptions:submit?api-version=2024-11-15`
2. Que `destinationContainerUrl` va **dentro de `properties`**, no en la raíz.
3. Que `timeToLiveHours` es obligatorio y su mínimo es 6.

- [ ] **Step 1: Escribir la prueba que falla**

Crear `api/src/lib/speech.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { cuerpoDeSolicitud, extraerTexto } from './speech';

beforeEach(() => vi.restoreAllMocks());

describe('cuerpoDeSolicitud', () => {
  const c = () => cuerpoDeSolicitud('https://x.blob.core.windows.net/muestras/abc?sig=y');

  it('pone la URL del audio en contentUrls', () => {
    expect(c().contentUrls).toHaveLength(1);
  });

  it('pide español de México', () => {
    expect(c().locale).toBe('es-MX');
  });

  it('declara timeToLiveHours dentro de properties, no en la raíz', () => {
    // Es obligatorio y su minimo es 6 horas.
    expect(c().properties.timeToLiveHours).toBeGreaterThanOrEqual(6);
    expect((c() as any).timeToLiveHours).toBeUndefined();
  });

  it('NO pide marcas de tiempo por palabra', () => {
    // Una muestra de un minuto no las necesita y engordan la respuesta.
    expect(c().properties.wordLevelTimestampsEnabled).toBe(false);
  });

  it('incluye displayName, que el servicio exige', () => {
    expect(typeof c().displayName).toBe('string');
    expect(c().displayName.length).toBeGreaterThan(0);
  });
});

describe('extraerTexto', () => {
  it('concatena las frases reconocidas', () => {
    expect(extraerTexto({ combinedRecognizedPhrases: [{ display: 'Hola mundo.' }] }))
      .toBe('Hola mundo.');
  });

  it('devuelve cadena vacía si no hubo habla', () => {
    expect(extraerTexto({ combinedRecognizedPhrases: [] })).toBe('');
  });

  it('tolera una respuesta sin el campo', () => {
    expect(extraerTexto({} as any)).toBe('');
  });
});
```

- [ ] **Step 2: Ejecutar y verificar que falla**

Run: `cd api && SALT_SECRETO=prueba npm test -- speech`
Expected: FAIL — `Cannot find module './speech'`.

- [ ] **Step 3: Implementar `api/src/lib/speech.ts`**

```ts
/**
 * Cliente de Azure Speech batch.
 *
 * ⚠️ Las versiones v3.0 y v3.2 de esta API se retiraron el 31 de marzo de
 * 2026. Cualquier ejemplo con `/v3.2/transcriptions` en la ruta está
 * muerto. Se usa el endpoint de acción con versión por parámetro.
 */
const API_VERSION = '2024-11-15';
/** Mínimo que acepta el servicio. Es red de seguridad: borramos antes. */
const TTL_HORAS = 6;

interface CuerpoSolicitud {
  contentUrls: string[];
  locale: string;
  displayName: string;
  model: null;
  properties: {
    wordLevelTimestampsEnabled: boolean;
    timeToLiveHours: number;
  };
}

function base(): { url: string; clave: string } {
  const recurso = process.env.SPEECH_RESOURCE;
  const clave = process.env.SPEECH_KEY;
  if (!recurso || !clave) throw new Error('Faltan SPEECH_RESOURCE o SPEECH_KEY');
  return { url: `https://${recurso}.cognitiveservices.azure.com/speechtotext`, clave };
}

/**
 * Construye el cuerpo de la solicitud.
 *
 * ⚠️ Las opciones de comportamiento van DENTRO de `properties`. Puestas en
 * la raíz, el servicio **las ignora en silencio** — no devuelve error, y
 * el trabajo corre con valores por defecto. Es la causa más frecuente de
 * fallos silenciosos con esta API.
 */
export function cuerpoDeSolicitud(urlAudio: string): CuerpoSolicitud {
  return {
    contentUrls: [urlAudio],
    locale: 'es-MX',
    displayName: 'DESK muestra gratuita',
    model: null,
    properties: {
      // Una muestra de un minuto no necesita marcas por palabra.
      wordLevelTimestampsEnabled: false,
      timeToLiveHours: TTL_HORAS,
    },
  };
}

export async function lanzarTranscripcion(urlAudio: string): Promise<string> {
  const { url, clave } = base();
  const r = await fetch(`${url}/transcriptions:submit?api-version=${API_VERSION}`, {
    method: 'POST',
    headers: { 'Ocp-Apim-Subscription-Key': clave, 'Content-Type': 'application/json' },
    body: JSON.stringify(cuerpoDeSolicitud(urlAudio)),
  });
  if (!r.ok) throw new Error(`Speech respondió ${r.status}: ${await r.text()}`);
  const d = await r.json() as { self: string };
  const id = d.self.split('/').pop();
  if (!id) throw new Error('Speech no devolvió identificador de transcripción');
  return id;
}

export function extraerTexto(resultado: { combinedRecognizedPhrases?: { display: string }[] }): string {
  return (resultado.combinedRecognizedPhrases ?? []).map(f => f.display).join(' ').trim();
}

/** Devuelve el texto, o `null` si el trabajo aún no terminó. */
export async function recuperarTexto(transcripcionId: string): Promise<string | null> {
  const { url, clave } = base();
  const h = { 'Ocp-Apim-Subscription-Key': clave };

  const est = await fetch(`${url}/transcriptions/${transcripcionId}?api-version=${API_VERSION}`, { headers: h });
  if (!est.ok) throw new Error(`Speech respondió ${est.status}`);
  const { status } = await est.json() as { status: string };
  if (status === 'Failed') throw new Error('La transcripción falló en Azure');
  if (status !== 'Succeeded') return null;

  const arch = await fetch(`${url}/transcriptions/${transcripcionId}/files?api-version=${API_VERSION}`, { headers: h });
  const { values } = await arch.json() as { values: { kind: string; links: { contentUrl: string } }[] };
  const t = values.find(v => v.kind === 'Transcription');
  if (!t) return '';

  return extraerTexto(await (await fetch(t.links.contentUrl)).json());
}

/**
 * Borra el trabajo de transcripción **y sus resultados**.
 *
 * Es la única forma de cumplir lo que promete SECURITY.md: el mínimo de
 * `timeToLiveHours` es 6 horas, así que esperar al TTL dejaría el texto
 * del usuario en Azure durante ese tiempo. Se borra explícitamente al
 * entregar, y el TTL queda solo como respaldo si esto fallara.
 */
export async function borrarTranscripcion(transcripcionId: string): Promise<void> {
  const { url, clave } = base();
  await fetch(`${url}/transcriptions/${transcripcionId}?api-version=${API_VERSION}`, {
    method: 'DELETE',
    headers: { 'Ocp-Apim-Subscription-Key': clave },
  });
}
```

- [ ] **Step 4: Ejecutar y verificar que pasa**

Run: `cd api && SALT_SECRETO=prueba npm test -- speech`
Expected: PASS — 8 pruebas.

- [ ] **Step 5: Implementar `api/src/functions/sampleTranscribe.ts`**

```ts
import { leerTrabajo, actualizarTrabajo } from '../lib/jobs';
import { lanzarTranscripcion } from '../lib/speech';
import { urlDeSubida } from '../lib/blob';

const CONTACTO = 'first.contact.desk@aideatext.ai';

export async function manejarTranscribe(
  p: { cuerpo: { jobId?: unknown } }
): Promise<{ estado: number; cuerpo: Record<string, any> }> {
  const { jobId } = p.cuerpo;
  if (typeof jobId !== 'string') return { estado: 400, cuerpo: { mensaje: 'Falta el identificador.' } };

  const t = await leerTrabajo(jobId);
  if (!t) return { estado: 404, cuerpo: { mensaje: `No encontramos ese trabajo. Escríbenos a ${CONTACTO}.` } };
  if (t.estado !== 'esperando_subida') {
    return { estado: 409, cuerpo: { mensaje: 'Ese trabajo ya fue procesado.' } };
  }

  const { url } = await urlDeSubida(jobId);
  const transcripcionId = await lanzarTranscripcion(url);
  await actualizarTrabajo(jobId, { estado: 'transcribiendo', transcripcionId });

  return { estado: 202, cuerpo: { jobId, estado: 'transcribiendo' } };
}
```

- [ ] **Step 6: Commit**

```bash
git add api/src/lib/speech.ts api/src/functions/sampleTranscribe.ts api/src/lib/speech.test.ts
git commit -m "feat(api): cliente de Azure Speech batch, api-version 2024-11-15

Las versiones v3.0 y v3.2 se retiraron el 31 de marzo de 2026, asi que
cualquier ejemplo con /v3.2/ en la ruta esta muerto. Se usa el endpoint
de accion con la version por parametro.

Las opciones van dentro de properties: en la raiz el servicio las ignora
EN SILENCIO, sin devolver error, y el trabajo corre con valores por
defecto. Una prueba afirma que timeToLiveHours esta dentro y no en la
raiz.

borrarTranscripcion existe porque el minimo de timeToLiveHours es 6
horas: esperar al TTL dejaria el texto del usuario en Azure ese tiempo,
contradiciendo lo que promete SECURITY.md."
```

---

### Task 7: `sampleStatus`, comprobante de borrado y barrido

**Files:**
- Create: `api/src/functions/sampleStatus.ts`
- Create: `api/src/functions/sweeper.ts`
- Test: `api/src/functions/sampleStatus.test.ts`

**Interfaces:**
- Consumes: `leerTrabajo`, `actualizarTrabajo`, `trabajosVencidos` (Task 4); `borrarBlob` (Task 5); `recuperarTexto`, `borrarTranscripcion` (Task 6).
- Produces: `GET /api/sample/status/{jobId}` → `{ estado, texto?, comprobante? }`.

**El comprobante (spec §3):**
```
Trabajo:    <jobId>
Audio:      SHA-256 <hashAudio>
Subido:     <creadoEn>
Eliminado:  <borradoEn>
Método:     blob delete + transcription delete + lifecycle policy
```

- [ ] **Step 1: Escribir la prueba que falla**

Crear `api/src/functions/sampleStatus.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { construirComprobante } from './sampleStatus';

describe('construirComprobante', () => {
  const t = {
    jobId: 'abc-123', estado: 'listo' as const,
    hashAudio: 'f'.repeat(64), hashOrigen: 'b'.repeat(64),
    creadoEn: '2026-09-21T06:00:00.000Z', venceEn: '2026-09-21T08:00:00.000Z',
    borradoEn: '2026-09-21T06:02:11.000Z',
  };

  it('incluye el hash del audio para que el usuario lo verifique', () => {
    expect(construirComprobante(t)).toContain('f'.repeat(64));
  });

  it('incluye la hora exacta de eliminación', () => {
    expect(construirComprobante(t)).toContain('2026-09-21T06:02:11.000Z');
  });

  it('NO incluye el hash de origen: no es asunto del usuario', () => {
    // Si se colara, estariamos exponiendo el identificador de conteo.
    expect(construirComprobante(t)).not.toContain('b'.repeat(64));
  });

  it('nombra las tres capas de borrado', () => {
    const c = construirComprobante(t);
    expect(c).toContain('blob');
    expect(c).toContain('transcription');
    expect(c).toContain('lifecycle');
  });

  it('no se emite comprobante si el borrado no ocurrió', () => {
    // Afirmar un borrado que no paso seria mentir en el unico documento
    // que el usuario puede verificar.
    expect(construirComprobante({ ...t, borradoEn: undefined })).toBeNull();
  });
});
```

- [ ] **Step 2: Ejecutar y verificar que falla**

Run: `cd api && SALT_SECRETO=prueba npm test -- sampleStatus`
Expected: FAIL — `Cannot find module './sampleStatus'`.

- [ ] **Step 3: Implementar `api/src/functions/sampleStatus.ts`**

```ts
import { leerTrabajo, actualizarTrabajo, type Trabajo } from '../lib/jobs';
import { recuperarTexto, borrarTranscripcion } from '../lib/speech';
import { borrarBlob } from '../lib/blob';

const CONTACTO = 'first.contact.desk@aideatext.ai';

/**
 * Emite el comprobante de borrado, o `null` si el borrado no ha ocurrido.
 *
 * Devolver un comprobante sin borrado consumado sería mentir en el único
 * documento que el usuario puede verificar por su cuenta — comparando el
 * hash con el de su propio archivo.
 */
export function construirComprobante(t: Trabajo): string | null {
  if (!t.borradoEn) return null;
  return [
    `Trabajo:    ${t.jobId}`,
    `Audio:      SHA-256 ${t.hashAudio}`,
    `Subido:     ${t.creadoEn}`,
    `Eliminado:  ${t.borradoEn}`,
    `Método:     blob delete + transcription delete + lifecycle policy`,
  ].join('\n');
}

export async function manejarStatus(
  p: { jobId: string }
): Promise<{ estado: number; cuerpo: Record<string, any> }> {
  const t = await leerTrabajo(p.jobId);
  if (!t) return { estado: 404, cuerpo: { mensaje: `No encontramos ese trabajo. Escríbenos a ${CONTACTO}.` } };

  if (t.estado === 'listo' || t.estado === 'borrado') {
    return { estado: 200, cuerpo: { estado: t.estado, comprobante: construirComprobante(t) } };
  }
  if (t.estado !== 'transcribiendo' || !t.transcripcionId) {
    return { estado: 200, cuerpo: { estado: t.estado } };
  }

  const texto = await recuperarTexto(t.transcripcionId);
  if (texto === null) return { estado: 200, cuerpo: { estado: 'transcribiendo' } };

  // Se borra ANTES de responder. El usuario recibe el texto y el
  // comprobante en el mismo momento: no hay ventana en la que tengamos
  // su audio y él ya tenga su resultado.
  await borrarBlob(t.jobId);
  await borrarTranscripcion(t.transcripcionId);
  const borradoEn = new Date().toISOString();
  await actualizarTrabajo(t.jobId, { estado: 'listo', borradoEn });

  return { estado: 200, cuerpo: {
    estado: 'listo', texto,
    comprobante: construirComprobante({ ...t, borradoEn }),
  } };
}
```

- [ ] **Step 4: Implementar `api/src/functions/sweeper.ts`**

```ts
import { trabajosVencidos, actualizarTrabajo } from '../lib/jobs';
import { borrarBlob } from '../lib/blob';
import { borrarTranscripcion } from '../lib/speech';

/**
 * Segunda capa de borrado (spec §3): recoge lo que el camino normal dejó
 * atrás — una pestaña cerrada antes de recibir el resultado, una
 * transcripción que nunca terminó.
 *
 * Cada trabajo se aísla: si uno falla, los demás se borran igual. Un
 * barrido que se detiene en el primer error deja de ser una garantía.
 */
export async function barrer(): Promise<{ borrados: number; fallidos: number }> {
  let borrados = 0, fallidos = 0;

  for (const t of await trabajosVencidos()) {
    try {
      await borrarBlob(t.jobId);
      if (t.transcripcionId) await borrarTranscripcion(t.transcripcionId);
      await actualizarTrabajo(t.jobId, {
        estado: 'borrado',
        borradoEn: new Date().toISOString(),
      });
      borrados++;
    } catch {
      fallidos++;
      // Sin `throw`: la política de ciclo de vida de Azure es la tercera
      // capa y borrará el blob aunque esto siga fallando.
    }
  }
  return { borrados, fallidos };
}
```

- [ ] **Step 5: Ejecutar y verificar que pasa**

Run: `cd api && SALT_SECRETO=prueba npm test`
Expected: PASS — 33 pruebas en `api/` (5 ipHash + 7 jobs + 8 sampleStart + 8 speech + 5 sampleStatus).

- [ ] **Step 6: Commit**

```bash
git add api/src/functions/sampleStatus.ts api/src/functions/sweeper.ts api/src/functions/sampleStatus.test.ts
git commit -m "feat(api): estado, comprobante de borrado y barrido de respaldo

El borrado ocurre ANTES de responder: el usuario recibe el texto y el
comprobante en el mismo momento, asi que no existe ventana en la que
nosotros tengamos su audio y el ya tenga su resultado.

construirComprobante devuelve null si el borrado no ocurrio. Emitir un
comprobante sin borrado consumado seria mentir en el unico documento que
el usuario puede verificar por su cuenta, comparando el hash con el de su
propio archivo.

El barrido aisla cada trabajo: si uno falla los demas se borran igual. Un
barrido que se detiene en el primer error deja de ser una garantia."
```

---

### Task 8: Interfaz de la muestra

**Files:**
- Create: `web/src/audio/upload.ts`
- Create: `web/src/ui/muestra.ts`
- Modify: `web/index.html`, `web/src/main.ts`
- Test: `web/src/ui/muestra.test.ts`

**Interfaces:**
- Consumes: `decodificar`, `medir` (Task 1); `recortar`, `aWav` (Task 2); `sha256Hex` de `web/src/lib/hash.ts`.
- Produces: `renderMuestra(estado): string`.

**Copy obligatorio (spec §2.3):** al elegir el fragmento, la interfaz pide expresamente **el minuto más difícil**:

> *«Elige el minuto más complejo de tu grabación — donde varias personas hablan a la vez, donde hay más ruido, donde peor se escucha. Así compruebas la calidad en el peor caso, no en el mejor.»*

- [ ] **Step 1: Escribir la prueba que falla**

Crear `web/src/ui/muestra.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { renderMuestra } from './muestra';

describe('renderMuestra', () => {
  it('pide el minuto MÁS DIFÍCIL, no uno cualquiera', () => {
    const h = renderMuestra({ fase: 'eligiendo', duracionTotal: 3600 });
    expect(h).toContain('más complejo');
    expect(h).toContain('peor caso');
  });

  it('muestra la duración total en minutos', () => {
    expect(renderMuestra({ fase: 'eligiendo', duracionTotal: 3600 })).toContain('60');
  });

  it('deja claro que solo sube el minuto elegido', () => {
    const h = renderMuestra({ fase: 'eligiendo', duracionTotal: 3600 });
    expect(h.toLowerCase()).toContain('solo se sube');
  });

  it('muestra el texto transcrito cuando está listo', () => {
    expect(renderMuestra({ fase: 'listo', texto: 'Hola mundo', comprobante: 'x' }))
      .toContain('Hola mundo');
  });

  it('muestra el comprobante de borrado junto al texto', () => {
    expect(renderMuestra({ fase: 'listo', texto: 'a', comprobante: 'Eliminado: 2026' }))
      .toContain('Eliminado: 2026');
  });

  it('ante un error deriva al correo y NO dice "no se puede"', () => {
    const h = renderMuestra({ fase: 'error', mensaje: 'algo falló' });
    expect(h).toContain('first.contact.desk@aideatext.ai');
    expect(h.toLowerCase()).not.toContain('no se puede');
  });

  it('ofrece el servicio completo tras entregar la muestra', () => {
    // Es la razon de existir de la muestra: el siguiente peldano.
    expect(renderMuestra({ fase: 'listo', texto: 'a', comprobante: 'b' }))
      .toContain('first.contact.desk@aideatext.ai');
  });
});
```

- [ ] **Step 2: Ejecutar y verificar que falla**

Run: `cd web && npm test -- muestra`
Expected: FAIL — `Cannot find module './muestra'`.

- [ ] **Step 3: Implementar `web/src/audio/upload.ts`**

```ts
/**
 * Sube el WAV recortado a la URL firmada.
 *
 * Es la ÚNICA petición de red del pipeline de audio, y ocurre solo tras
 * una acción explícita del usuario. El resto —decodificar, recortar,
 * codificar, hashear— pasa entero en su navegador.
 */
export async function subirWav(url: string, wav: ArrayBuffer): Promise<void> {
  const r = await fetch(url, {
    method: 'PUT',
    headers: { 'x-ms-blob-type': 'BlockBlob', 'Content-Type': 'audio/wav' },
    body: wav,
  });
  if (!r.ok) throw new Error(`La subida falló con ${r.status}`);
}
```

- [ ] **Step 4: Implementar `web/src/ui/muestra.ts`**

```ts
const CONTACTO = 'first.contact.desk@aideatext.ai';

export type EstadoMuestra =
  | { fase: 'eligiendo'; duracionTotal: number }
  | { fase: 'subiendo' }
  | { fase: 'transcribiendo' }
  | { fase: 'listo'; texto: string; comprobante: string }
  | { fase: 'error'; mensaje: string };

export function renderMuestra(e: EstadoMuestra): string {
  switch (e.fase) {
    case 'eligiendo': {
      const min = Math.round(e.duracionTotal / 60);
      return `
        <p>Tu grabación dura <strong>${min}</strong> minutos.</p>
        <p><strong>Elige el minuto más complejo</strong> — donde varias personas
           hablan a la vez, donde hay más ruido, donde peor se escucha. Así
           compruebas la calidad en el peor caso, no en el mejor.</p>
        <p class="garantia"><strong>Solo se sube ese minuto.</strong> El resto de tu
           grabación no sale de tu computadora.</p>
        <input type="range" id="desde" min="0" max="${Math.max(0, Math.floor(e.duracionTotal - 60))}" value="0" />
        <button id="enviar-muestra">Transcribir este minuto, gratis</button>`;
    }
    case 'subiendo':
      return `<p>Subiendo el minuto elegido…</p>`;
    case 'transcribiendo':
      return `<p>Transcribiendo. Suele tardar menos de un minuto.</p>`;
    case 'listo':
      return `
        <h3>Tu transcripción</h3>
        <pre class="transcripcion">${escapar(e.texto)}</pre>
        <h4>Comprobante de borrado</h4>
        <pre class="comprobante">${escapar(e.comprobante)}</pre>
        <p>Puedes calcular el SHA-256 de tu archivo y comprobar que coincide.</p>
        <p>¿Tienes más horas de entrevistas? Escríbenos a
           <a href="mailto:${CONTACTO}">${CONTACTO}</a>.</p>`;
    case 'error':
      return `
        <p>${escapar(e.mensaje)}</p>
        <p>Escríbenos a <a href="mailto:${CONTACTO}">${CONTACTO}</a> y lo revisamos contigo.</p>`;
  }
}

function escapar(s: string): string {
  return s.replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
}
```

- [ ] **Step 5: Ejecutar y verificar que pasa**

Run: `cd web && npm test -- muestra`
Expected: PASS — 7 pruebas.

- [ ] **Step 6: Conectar en `main.ts` y `index.html`**

Añadir una segunda zona de carga para audio, debajo de la de PDF, que:
1. decodifica y mide → `renderMuestra({fase:'eligiendo'})`
2. al pulsar: recorta, codifica a WAV, calcula `sha256Hex`
3. `POST /api/sample/start` → sube con `subirWav` → `POST /api/sample/transcribe`
4. consulta `/api/sample/status/{jobId}` cada 3 s hasta `listo` o `error`

**Cada paso asíncrono lleva su propio `try`/`catch`.** El rechazo de un callback asíncrono no se propaga al `try` que lo registró, y un botón que no hace nada al pulsarlo es el peor fallo posible aquí — ya costó una ronda en el pipeline de PDF.

- [ ] **Step 7: Commit**

```bash
git add web/src/audio/upload.ts web/src/ui/muestra.ts web/src/ui/muestra.test.ts web/index.html web/src/main.ts
git commit -m "feat(web): interfaz de la muestra gratuita de transcripcion

La interfaz pide expresamente el minuto MAS DIFICIL, no uno cualquiera:
invierte la logica habitual de las demos y elimina reclamaciones
posteriores, porque nadie puede alegar que no se le advirtio.

Y dice explicitamente que solo sube ese minuto. Es la diferencia entre
'arriesga 60 segundos' y 'arriesga sus seis horas de entrevistas'."
```

---

### Task 9: Infraestructura, CSP y despliegue

**Files:**
- Create: `infra/main.bicep`
- Modify: `web/public/staticwebapp.config.json`
- Modify: `SECURITY.md`
- Modify: `.github/workflows/deploy-web.yml`

- [ ] **Step 1: Crear `infra/main.bicep` con las garantías de borrado**

La cuenta de almacenamiento **debe** crearse con:

```bicep
properties: {
  allowBlobPublicAccess: false
  minimumTlsVersion: 'TLS1_2'
}
// y en el servicio de blobs:
deleteRetentionPolicy: { enabled: false }
containerDeleteRetentionPolicy: { enabled: false }
isVersioningEnabled: false
restorePolicy: { enabled: false }
```

> ⚠️ **Esto no es opcional.** Con los valores por defecto, `soft delete` deja los blobs «borrados» recuperables durante días, y la promesa de cero retención de `SECURITY.md` sería **falsa sin que nos diéramos cuenta** (spec §3).

Más una regla de ciclo de vida que elimine todo lo del contenedor `muestras` con más de 1 día — la tercera capa, que se aplica aunque nuestro código no corra nunca.

- [ ] **Step 2: Ampliar la CSP al host del almacenamiento**

⚠️ La subida va a `*.blob.core.windows.net`, **otro origen**. Con `connect-src 'self'` el navegador la bloquea.

En `web/public/staticwebapp.config.json`, cambiar solo esa directiva al host exacto:

```
connect-src 'self' https://<cuenta>.blob.core.windows.net;
```

**Nunca `*.blob.core.windows.net` ni `*`.** Ampliar a un comodín permitiría subir a *cualquier* cuenta de almacenamiento de Azure y vaciaría de contenido la garantía que la landing demuestra en vivo.

Tras desplegar, **volver a ejecutar el control de subidas** de la landing: el `POST` a un host externo debe seguir bloqueado. Si deja de estarlo, la directiva quedó demasiado abierta.

- [ ] **Step 3: Actualizar `SECURITY.md` con la verdad sobre el TTL**

Añadir a la sección de borrado:

> **Transcripción.** El texto se genera en Azure AI Speech, que exige un tiempo mínimo de retención de 6 horas para el registro del trabajo. No esperamos a ese plazo: borramos el trabajo y sus resultados **en cuanto te entregamos el texto**, y el plazo de Azure queda solo como respaldo por si nuestro borrado fallara.

Y declarar el límite de 3 muestras por origen cada 24 horas, junto al hash de IP que ya está documentado.

- [ ] **Step 4: Desplegar y verificar de extremo a extremo**

Contra el sitio desplegado, no localmente:

- [ ] Sube un audio de 5 minutos: la interfaz dice «5 minutos» y ofrece elegir
- [ ] **DevTools → Red: al decodificar y recortar, cero peticiones.** La única petición es el `PUT` tras pulsar el botón
- [ ] **El `PUT` sube ~1,9 MB, no el archivo completo** ← esto es la promesa entera
- [ ] Llega la transcripción con su comprobante
- [ ] El hash del comprobante coincide con el SHA-256 del WAV
- [ ] Tras entregar, el blob ya no existe (404 con la URL firmada)
- [ ] La cuarta muestra desde el mismo origen responde 429 y deriva al correo
- [ ] El control de subidas de la landing **sigue bloqueado**

- [ ] **Step 5: Commit**

```bash
git add infra/main.bicep web/public/staticwebapp.config.json SECURITY.md .github/workflows/deploy-web.yml
git commit -m "feat(infra): almacenamiento sin retencion, CSP acotada y despliegue

La cuenta de almacenamiento se crea con soft delete, versionado y
restauracion puntual DESACTIVADOS. Con los valores por defecto un blob
borrado sigue siendo recuperable durante dias y la promesa de cero
retencion seria falsa sin que nos diesemos cuenta.

La CSP se amplia al host EXACTO de la cuenta, nunca a un comodin:
*.blob.core.windows.net permitiria subir a cualquier cuenta de Azure y
vaciaria de contenido la garantia que la landing demuestra en vivo.

SECURITY.md declara ahora la verdad sobre el TTL de Azure Speech: su
minimo es 6 horas, asi que borramos explicitamente al entregar en vez de
esperar al plazo."
```

---

## Verificación final

- [ ] `cd web && npm test` — 65 anteriores + 20 nuevas = **85**
- [ ] `cd api && npm test` — **33**
- [ ] `cd web && npm run build` — sin errores
- [ ] `cd api && npm run build` — sin errores
- [ ] La lista de extremo a extremo de la Task 9, completa
- [ ] **El `PUT` sube ~1,9 MB, nunca el archivo original** ← si esto falla, el producto miente

## Fuera de alcance en 2a

Van al Plan 2b:

- Stripe, cotización por duración, precios por país, OXXO
- Trabajos completos sin límite de un minuto
- Entrega por correo (la muestra se ve en pantalla)
- Ficha de tratamiento de datos en PDF
- Cloudflare Turnstile — el abuso de una muestra gratis cuesta $0.003 por intento; mil abusos son $3, lo que no justifica todavía una dependencia externa
- **Video** — `decodeAudioData` sobre contenedores mp4 es inconsistente entre navegadores. Deriva al correo
- OCR de PDF escaneado
