# DESK Web Cliente — Plan de Implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Sitio estático desplegado en desk.aideatext.ai que diagnostica PDFs y los convierte a Markdown enteramente en el navegador, sin subir nada.

**Architecture:** Vite + TypeScript compilado a estáticos y servido por Azure Static Web Apps (plan Free, $0). PDF.js corre en el navegador del usuario; no existe backend. El módulo `lib/hash.ts` se escribe aquí pero lo consumirá también la API del Plan 2, por lo que su interfaz debe permanecer estable.

**Tech Stack:** TypeScript 5.x · Vite 6 · pdfjs-dist 4.x · Vitest · pdf-lib (solo para generar fixtures de prueba) · Azure Static Web Apps · GitHub Actions

**Spec:** [`docs/superpowers/specs/2026-09-20-desk-v01-design.md`](../specs/2026-09-20-desk-v01-design.md)

## Global Constraints

- **Cero peticiones de red al procesar archivos.** El usuario debe poder abrir DevTools → Red y no ver ninguna subida. Esto es verificable por el usuario y es el argumento central del producto (spec §2, §3).
- **Lenguaje: TypeScript**, nunca JavaScript plano. Se manejan duraciones y montos; el compilador debe atrapar errores de tipo (spec §6).
- **`lib/hash.ts` es código compartido** con la API del Plan 2. Su firma `sha256Hex(data: ArrayBuffer): Promise<string>` no debe cambiar sin actualizar ambos lados (spec §7, razón de cerrar Node/TS).
- **Ningún archivo de usuario se escribe a disco ni a `localStorage`.**
- **Idioma de la interfaz: español.** Copy de cara al usuario en español de México.
- **Nunca decir "no se puede".** Todo límite excedido deriva a `first.contact.desk@aideatext.ai` (spec §2.4).
- **Node ≥ 22.12** para el entorno de construcción y de CI. No es arbitrario: `vitest@5`
  declara `engines.node: "^22.12.0 || ^24.0.0 || >=26.0.0"`. Con Node 20, `npm test` falla
  mientras `npm run build` sigue funcionando —`vite@6` sí acepta Node 20—, lo que produce un
  fallo de CI desconcertante. La máquina de desarrollo corre Node v24.18.0.

---

### Task 1: Scaffolding y utilidad de hash

**Files:**
- Create: `web/package.json`
- Create: `web/tsconfig.json`
- Create: `web/vite.config.ts`
- Create: `web/src/lib/hash.ts`
- Test: `web/src/lib/hash.test.ts`

**Interfaces:**
- Consumes: nada (primera tarea)
- Produces: `sha256Hex(data: ArrayBuffer): Promise<string>` — devuelve el digest SHA-256 en hexadecimal minúsculas, 64 caracteres. Lo consumen la Task 4 y toda la API del Plan 2.

- [ ] **Step 1: Crear `web/package.json`**

```json
{
  "name": "desk-web",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc --noEmit && vite build",
    "preview": "vite preview",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "devDependencies": {
    "typescript": "^5.7.0",
    "vite": "^6.4.0",
    "vitest": "^5.0.0",
    "pdf-lib": "^1.17.1"
  },
  "dependencies": {
    "pdfjs-dist": "^4.9.155"
  }
}
```

- [ ] **Step 2: Crear `web/tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true,
    "skipLibCheck": true,
    "isolatedModules": true,
    "noEmit": true,
    "types": ["vitest/globals"]
  },
  "include": ["src"]
}
```

- [ ] **Step 3: Crear `web/vite.config.ts`**

```ts
// El import viene de 'vitest/config', NO de 'vite': la clave `test` no
// existe en el tipo de configuración de Vite y el compilador la rechaza.
import { defineConfig } from 'vitest/config';

export default defineConfig({
  build: {
    outDir: 'dist',
    target: 'es2022',
  },
  test: {
    globals: true,
    environment: 'node',
  },
});
```

- [ ] **Step 4: Instalar dependencias y verificar que Vite no se duplica**

Run: `cd web && npm install`
Expected: se crea `node_modules/` y `package-lock.json` sin errores.

Comprobar que existe **una sola** cadena de herramientas de Vite:

```bash
cd web && find node_modules -name package.json -path "*/vite/package.json" \
  | while read f; do printf "%-55s " "$f"; node -p "require('./$f').version"; done
```

Esperado: **exactamente una línea**, `node_modules/vite/package.json`.

> **Por qué se verifica.** Los rangos son `vitest ^5.0.0` con `vite ^6.4.0` porque vitest 5
> declara Vite como **peer** dependency (`^6.4.0 || ^7 || ^8`) y npm lo deduplica contra el
> paquete de nivel superior. Con `vitest ^2.x` —que lo declara como dependencia **dura**
> `^5.0.0`— npm instalaba tres Vite y tres esbuild distintos: las pruebas se transformaban con
> esbuild 0.21.5 y producción compilaba con 0.25.12. **Una suite en verde dejaba de ser
> evidencia sobre el artefacto que descarga el usuario**, y ahí vivían además las 5
> vulnerabilidades que reportaba `npm audit`. Si aparece más de una línea, no continuar.

- [ ] **Step 5: Escribir la prueba que falla**

Crear `web/src/lib/hash.test.ts`:

```ts
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
```

- [ ] **Step 6: Ejecutar la prueba y verificar que falla**

Run: `cd web && npm test`
Expected: FAIL — `Failed to resolve import "./hash"`.

- [ ] **Step 7: Implementar `web/src/lib/hash.ts`**

```ts
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
```

- [ ] **Step 8: Ejecutar la prueba y verificar que pasa**

Run: `cd web && npm test`
Expected: PASS — 4 pruebas.

- [ ] **Step 9: Commit**

```bash
git add web/package.json web/tsconfig.json web/vite.config.ts web/src/lib/hash.ts web/src/lib/hash.test.ts web/package-lock.json
git commit -m "feat(web): scaffolding Vite/TS y utilidad sha256Hex

sha256Hex usa Web Crypto, disponible en navegador y en Node >= 18, para
que la API del Plan 2 importe este mismo archivo. Si las dos
implementaciones divergieran, el comprobante de borrado dejaria de
coincidir."
```

---

### Task 2: Generador de fixtures de PDF

**Files:**
- Create: `web/src/pdf/pdfjs.ts` *(punto de entrada único a PDF.js — ver nota)*
- Create: `web/src/pdf/fixtures.ts`
- Test: `web/src/pdf/fixtures.test.ts`

> **Por qué `pdfjs.ts` nace aquí.** PDF.js se debe importar desde **una sola** ruta en
> todo el proyecto. Si un módulo importara `pdfjs-dist/legacy/...` y otro
> `pdfjs-dist`, Vite cargaría **dos instancias distintas**, y el
> `GlobalWorkerOptions.workerSrc` configurado en una no aplicaría a la otra: el
> diagnóstico fallaría en el navegador sin fallar en las pruebas. Las pruebas de
> esta tarea ya necesitan PDF.js para verificar el contrato semántico de los
> fixtures, así que el módulo nace aquí y las Tasks 3, 4 y 5 lo consumen.

**Interfaces:**
- Consumes: nada
- Produces:
  - `makeTextPdf(pages: string[]): Promise<ArrayBuffer>` — PDF con capa de texto real, una página por elemento del arreglo. El texto se reparte en varias líneas (ver la nota en el código: una línea única se recorta al ancho de página y arruina el margen del umbral).
  - `makeImagePdf(pageCount: number): Promise<ArrayBuffer>` — PDF cuyas páginas contienen **una imagen PNG real incrustada** (`embedPng` + `drawImage`), sin texto extraíble. Simula un escaneo. **No es un rectángulo dibujado:** tiene que emitir un operador `paintImageXObject` auténtico, que es lo que detecta la Task 3.
  - Las consumen las Tasks 3 y 4.
  - Desde `pdfjs.ts`: `pdfjs` (reexport), `configureWorker(url: string): void` y
    `loadOptions(data: ArrayBuffer)`. Los consumen las Tasks 3, 4 y 5.

**Por qué existe esta tarea:** el diagnóstico de PDF no se puede probar sin PDFs de entrada deterministas. Generarlos en código evita comprometer archivos binarios al repositorio y hace las pruebas reproducibles.

- [ ] **Step 1: Crear el punto de entrada único `web/src/pdf/pdfjs.ts`**

```ts
/**
 * Punto de entrada UNICO a PDF.js para todo el proyecto.
 *
 * Nadie más importa 'pdfjs-dist' directamente. Si dos módulos lo importaran
 * por rutas distintas, el bundler cargaría dos instancias separadas y la
 * configuración del worker aplicada a una no afectaría a la otra —
 * un fallo que no aparece en las pruebas y sí en el navegador.
 *
 * Se usa la variante `legacy` porque es la que funciona tanto en el
 * entorno Node de Vitest como en el navegador.
 */
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';

export const pdfjs = pdfjsLib;

/** Configura el worker. Solo se invoca desde el navegador (`main.ts`). */
export function configureWorker(url: string): void {
  pdfjsLib.GlobalWorkerOptions.workerSrc = url;
}

/**
 * Opcodes de PDF.js que pintan contenido rasterizado.
 *
 * El conjunto se deriva **por nombre**, no enumerando constantes a mano, por
 * dos razones aprendidas a golpes:
 *
 * 1. Una constante inexistente rompe `tsc --noEmit` y por tanto `npm run
 *    build`. Ocurrió con `paintJpegXObject`, que no existe en pdfjs-dist 4.x.
 *    Derivar por nombre no puede fallar así.
 * 2. Enumerar a mano deja huecos. La lista escrita a ojo omitía
 *    `paintImageMaskXObject`, y **los escáneres de documentos producen
 *    imágenes bitonales que PDF codifica justamente como máscaras**: una tesis
 *    escaneada real se habría clasificado como `vacia` en vez de `escaneado`,
 *    diciéndole al usuario que su documento está vacío en lugar de ofrecerle
 *    el OCR.
 *
 * En pdfjs-dist 4.10.38 esto resuelve a 8 opcodes (83–90).
 */
const OPS_DE_IMAGEN: ReadonlySet<number> = new Set(
  Object.entries(pdfjsLib.OPS)
    .filter(([nombre]) => /^paint.*Image/.test(nombre))
    .map(([, codigo]) => codigo as number)
);

/**
 * ¿La lista de operadores de una página pinta algún contenido rasterizado?
 *
 * Se prefiere el falso positivo al falso negativo: solo se consulta cuando la
 * página ya tiene poco texto, así que clasificar de más como «escaneada»
 * ofrece OCR innecesariamente —inocuo—, mientras que clasificar de menos le
 * dice al usuario que su escaneo está vacío —caro y confuso—.
 */
export function tieneOperadorDeImagen(fnArray: readonly number[]): boolean {
  return fnArray.some((fn) => OPS_DE_IMAGEN.has(fn));
}

/** Opciones comunes de carga. */
export function loadOptions(data: ArrayBuffer) {
  return {
    data: new Uint8Array(data),
    // Sin red: evita descargar fuentes y mapas de caracteres remotos, lo
    // que contradiría la garantía de que nada sale del navegador.
    disableFontFace: true,
    isEvalSupported: false,
    // Silencia "Ensure that the `standardFontDataUrl` API parameter is
    // provided". Solo extraemos texto, nunca renderizamos glifos, así que
    // los datos de fuente no hacen falta. Verificado: con y sin esta
    // opcion se extraen exactamente los mismos caracteres.
    //
    // ⚠️ NO apuntar `standardFontDataUrl` a un CDN para callar el aviso:
    // seria precisamente la peticion de red que el producto promete que
    // no ocurre.
    verbosity: pdfjsLib.VerbosityLevel.ERRORS,
  };
}
```

- [ ] **Step 2: Escribir las pruebas que fallan**

Crear `web/src/pdf/fixtures.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import { pdfjs, loadOptions, tieneOperadorDeImagen } from './pdfjs';
import { makeTextPdf, makeImagePdf } from './fixtures';

/** Texto de prueba que supera holgadamente el umbral de 100 caracteres. */
const LARGO = 'palabra '.repeat(30);

/** Lo que PDF.js observa en una página: es la lente que usará la Task 3. */
async function inspeccionar(data: ArrayBuffer, pagina = 1) {
  const doc = await pdfjs.getDocument(loadOptions(data)).promise;
  const page = await doc.getPage(pagina);
  const charCount = (await page.getTextContent()).items
    .map((i) => ('str' in i ? i.str : ''))
    .join('')
    .trim().length;
  const ops = await page.getOperatorList();
  const tieneImagen = tieneOperadorDeImagen(ops.fnArray);
  await doc.destroy();
  return { charCount, tieneImagen };
}

describe('fixtures de PDF', () => {
  it('makeTextPdf produce un PDF válido con la cabecera %PDF', async () => {
    const bytes = new Uint8Array(await makeTextPdf(['Hola']));
    expect(new TextDecoder().decode(bytes.slice(0, 5))).toBe('%PDF-');
  });

  it('makeTextPdf crea una página por cada elemento', async () => {
    // Se relee el PDF con pdf-lib para contar paginas de verdad.
    // Afirmar solo `byteLength > 0` no comprobaria nada de lo que
    // enuncia el nombre de la prueba.
    const doc = await PDFDocument.load(await makeTextPdf(['uno', 'dos', 'tres']));
    expect(doc.getPageCount()).toBe(3);
  });

  it('makeImagePdf produce un PDF válido con el numero de paginas pedido', async () => {
    const buf = await makeImagePdf(2);
    expect(new TextDecoder().decode(new Uint8Array(buf).slice(0, 5))).toBe('%PDF-');
    const doc = await PDFDocument.load(buf);
    expect(doc.getPageCount()).toBe(2);
  });

  // --- Contrato semántico: es lo que consumen las Tasks 3 y 4 ---
  //
  // Sin estas dos pruebas, cambiar `embedPng` por `drawRectangle` o borrar
  // el `drawText` dejaria las tres pruebas de arriba en verde y destruiria
  // en silencio la distincion sobre la que se construye el diagnostico.

  it('una página de makeTextPdf tiene texto extraíble y ninguna imagen', async () => {
    const { charCount, tieneImagen } = await inspeccionar(await makeTextPdf([LARGO]));
    // Holgado por encima del umbral de 100 de diagnose.ts. Con el texto en
    // una sola linea se extraerian ~101 y el margen seria de 1 caracter.
    expect(charCount).toBeGreaterThan(200);
    expect(tieneImagen).toBe(false);
  });

  it('una página de makeImagePdf tiene imagen y ningún texto extraíble', async () => {
    const { charCount, tieneImagen } = await inspeccionar(await makeImagePdf(2));
    expect(charCount).toBe(0);
    expect(tieneImagen).toBe(true);
  });
});
```

- [ ] **Step 3: Ejecutar y verificar que falla**

Run: `cd web && npm test -- fixtures`
Expected: FAIL — `Failed to resolve import "./fixtures"`.

- [ ] **Step 4: Implementar `web/src/pdf/fixtures.ts`**

```ts
import { PDFDocument, StandardFonts } from 'pdf-lib';

/**
 * Extrae un `ArrayBuffer` propio a partir de la vista que devuelve pdf-lib.
 *
 * El `slice` respeta `byteOffset`/`byteLength` en vez de devolver el búfer
 * subyacente completo, que es el error clásico aquí. El `as ArrayBuffer` es
 * necesario porque la librería moderna de TypeScript tipa `.buffer` como
 * `ArrayBufferLike`; es correcto porque pdf-lib siempre asigna un
 * `ArrayBuffer` común, nunca un `SharedArrayBuffer`.
 */
function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength
  ) as ArrayBuffer;
}

/** Caracteres por línea. A 12pt Helvetica caben holgados en A4 con margen de 50pt. */
const MAX_CARACTERES_POR_LINEA = 60;

/** Reparte un texto en líneas que quepan en el ancho de la página. */
function repartirEnLineas(texto: string): string[] {
  const lineas: string[] = [];
  let actual = '';
  for (const palabra of texto.split(' ')) {
    if (!palabra) continue;
    const candidata = actual ? `${actual} ${palabra}` : palabra;
    if (candidata.length > MAX_CARACTERES_POR_LINEA) {
      if (actual) lineas.push(actual);
      actual = palabra;
    } else {
      actual = candidata;
    }
  }
  if (actual) lineas.push(actual);
  return lineas;
}

/**
 * PDF con capa de texto real: una página por cada cadena recibida.
 * Representa el caso "PDF nativo", que se convierte sin OCR.
 *
 * ⚠️ El texto se reparte en varias líneas, y eso NO es cosmético.
 * Una sola llamada a `drawText` con un texto largo escribe una única línea
 * que se sale de la página, y PDF.js entonces extrae solo lo que cabe:
 * **exactamente ~101 caracteres, sin importar cuánto se haya escrito**
 * (medido: 30 repeticiones y 200 repeticiones extraen los mismos 101).
 * Frente al umbral de 100 caracteres de `diagnose.ts` eso dejaba un margen
 * de UN carácter, y ningún `repeat()` podía ampliarlo. Cualquier cambio de
 * versión de PDF.js o de métricas de fuente habría volteado la prueba a
 * rojo sin explicación aparente.
 * Con reparto en líneas la extracción escala: 239 caracteres para el mismo
 * texto, margen de 139.
 */
export async function makeTextPdf(pages: string[]): Promise<ArrayBuffer> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  for (const text of pages) {
    const page = doc.addPage([595, 842]); // A4 en puntos
    repartirEnLineas(text).forEach((linea, i) => {
      page.drawText(linea, { x: 50, y: 780 - i * 16, size: 12, font });
    });
  }
  return toArrayBuffer(await doc.save());
}

/**
 * PNG de 1x1 píxel, en base64.
 *
 * Se incrusta como imagen real —no como rectángulo dibujado— para que el
 * PDF contenga una operación `paintImageXObject` auténtica. Si el fixture
 * usara `drawRectangle`, el diagnóstico tendría que aceptar operaciones de
 * relleno como señal de escaneo, y entonces una página con un simple borde
 * quedaría mal clasificada.
 */
const PNG_1X1 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

/**
 * PDF sin texto extraíble: cada página contiene únicamente una imagen.
 * Representa el caso "escaneado", que requiere OCR en servidor.
 */
export async function makeImagePdf(pageCount: number): Promise<ArrayBuffer> {
  const doc = await PDFDocument.create();
  const png = await doc.embedPng(
    Uint8Array.from(atob(PNG_1X1), (c) => c.charCodeAt(0))
  );
  for (let i = 0; i < pageCount; i++) {
    const page = doc.addPage([595, 842]);
    page.drawImage(png, { x: 40, y: 40, width: 515, height: 762 });
  }
  return toArrayBuffer(await doc.save());
}
```

- [ ] **Step 5: Ejecutar y verificar que pasa**

Run: `cd web && npm test -- fixtures`
Expected: PASS — 5 pruebas.

Si falla al resolver `pdfjs-dist/legacy/build/pdf.mjs`, verificar la ruta real con
`ls web/node_modules/pdfjs-dist/legacy/build/` y ajustar el import **únicamente en
`pdfjs.ts`** — ese es el motivo de que ese módulo exista.

- [ ] **Step 6: Commit**

```bash
git add web/src/pdf/pdfjs.ts web/src/pdf/fixtures.ts web/src/pdf/fixtures.test.ts
git commit -m "test(web): fixtures de PDF con su contrato semantico verificado

Genera los PDFs de prueba en codigo en vez de comprometer binarios al
repositorio: reproducible y sin archivos opacos versionados.

Las dos ultimas pruebas protegen el contrato del que dependen las Tasks
3 y 4: una pagina de texto tiene texto extraible y ninguna imagen; una
pagina escaneada tiene imagen y cero texto. Sin ellas, cambiar embedPng
por drawRectangle o borrar el drawText dejaria la suite en verde y
destruiria en silencio la distincion sobre la que se construye el
diagnostico.

El texto se reparte en varias lineas porque una sola llamada a drawText
se recorta al ancho de pagina: PDF.js extrae ~101 caracteres sin
importar cuanto se escriba, lo que dejaba un margen de 1 caracter
contra el umbral de 100."
```

---

### Task 3: Diagnóstico de PDF

**Files:**
- Create: `web/src/pdf/diagnose.ts`
- Test: `web/src/pdf/diagnose.test.ts`

**Interfaces:**
- Consumes: `makeTextPdf`, `makeImagePdf` y `pdfjs`/`loadOptions` de la Task 2.
  **`pdfjs.ts` ya existe — no volver a crearlo, y no importar `pdfjs-dist`
  directamente desde ningún otro archivo.**
- Produces:
  ```ts
  type PageKind = 'texto' | 'escaneado' | 'vacia';
  interface PageReport { pageNumber: number; kind: PageKind; charCount: number; }
  interface PdfDiagnosis {
    pageCount: number;
    pages: PageReport[];
    overall: 'texto' | 'escaneado' | 'mixto' | 'vacio';
    convertibleInBrowser: boolean;
  }
  diagnosePdf(data: ArrayBuffer): Promise<PdfDiagnosis>
  ```
  Lo consumen las Tasks 4 y 5.

**Regla de clasificación (spec §2.2):** una página con 100 caracteres extraíbles o más es `texto`. Con menos de 100 y al menos una operación de imagen es `escaneado`. Con menos de 100 y sin imágenes es `vacia`. El umbral de 100 descarta encabezados y números de página sueltos que aparecen incluso en escaneos con OCR parcial.

- [ ] **Step 1: Escribir la prueba que falla**

Crear `web/src/pdf/diagnose.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { diagnosePdf } from './diagnose';
import { makeTextPdf, makeImagePdf } from './fixtures';

const LARGO = 'palabra '.repeat(30); // ~240 caracteres, supera el umbral de 100

describe('diagnosePdf', () => {
  it('clasifica como texto un PDF con capa de texto', async () => {
    const d = await diagnosePdf(await makeTextPdf([LARGO]));
    expect(d.overall).toBe('texto');
    expect(d.convertibleInBrowser).toBe(true);
    expect(d.pages[0].kind).toBe('texto');
    expect(d.pages[0].charCount).toBeGreaterThanOrEqual(100);
  });

  it('clasifica como escaneado un PDF sin texto extraible', async () => {
    const d = await diagnosePdf(await makeImagePdf(2));
    expect(d.overall).toBe('escaneado');
    expect(d.convertibleInBrowser).toBe(false);
  });

  it('cuenta correctamente las paginas', async () => {
    const d = await diagnosePdf(await makeTextPdf([LARGO, LARGO, LARGO]));
    expect(d.pageCount).toBe(3);
    expect(d.pages).toHaveLength(3);
  });

  it('numera las paginas desde 1', async () => {
    const d = await diagnosePdf(await makeTextPdf([LARGO, LARGO]));
    expect(d.pages.map((p) => p.pageNumber)).toEqual([1, 2]);
  });

  it('marca convertibleInBrowser false cuando ninguna pagina tiene texto', async () => {
    const d = await diagnosePdf(await makeImagePdf(1));
    expect(d.convertibleInBrowser).toBe(false);
  });
});
```

- [ ] **Step 2: Ejecutar y verificar que falla**

Run: `cd web && npm test -- diagnose`
Expected: FAIL — `Failed to resolve import "./diagnose"`.

- [ ] **Step 3: Implementar `web/src/pdf/diagnose.ts`**

```ts
import { pdfjs, loadOptions, tieneOperadorDeImagen } from './pdfjs';

/** Umbral de caracteres a partir del cual una página se considera texto real. */
const UMBRAL_TEXTO = 100;

export type PageKind = 'texto' | 'escaneado' | 'vacia';

export interface PageReport {
  pageNumber: number;
  kind: PageKind;
  charCount: number;
}

export interface PdfDiagnosis {
  pageCount: number;
  pages: PageReport[];
  overall: 'texto' | 'escaneado' | 'mixto' | 'vacio';
  /** true si al menos una página tiene texto extraíble sin OCR. */
  convertibleInBrowser: boolean;
}

/**
 * Analiza un PDF enteramente en memoria. No realiza ninguna petición de red:
 * es el fundamento verificable de la promesa de privacidad (spec §3).
 */
export async function diagnosePdf(data: ArrayBuffer): Promise<PdfDiagnosis> {
  const doc = await pdfjs.getDocument(loadOptions(data)).promise;

  // Se captura ANTES de destruir el documento: `doc.numPages` no es
  // accesible después de `doc.destroy()`.
  const pageCount = doc.numPages;
  const pages: PageReport[] = [];

  for (let n = 1; n <= pageCount; n++) {
    const page = await doc.getPage(n);
    const content = await page.getTextContent();
    const charCount = content.items
      .map((i) => ('str' in i ? i.str : ''))
      .join('')
      .trim().length;

    let kind: PageKind;
    if (charCount >= UMBRAL_TEXTO) {
      kind = 'texto';
    } else {
      // Solo operaciones de imagen auténticas. Deliberadamente NO cuenta
      // `OPS.fill`: un relleno es una forma dibujada, no un escaneo, y
      // aceptarlo clasificaría como escaneada cualquier página con un borde.
      // El conjunto de opcodes vive en `pdfjs.ts` y se deriva por nombre;
      // ver allí por qué no se enumeran a mano.
      const ops = await page.getOperatorList();
      kind = tieneOperadorDeImagen(ops.fnArray) ? 'escaneado' : 'vacia';
    }

    pages.push({ pageNumber: n, kind, charCount });
  }

  await doc.destroy();

  const conTexto = pages.filter((p) => p.kind === 'texto').length;
  const escaneadas = pages.filter((p) => p.kind === 'escaneado').length;

  let overall: PdfDiagnosis['overall'];
  if (conTexto === pages.length && conTexto > 0) overall = 'texto';
  else if (escaneadas === pages.length && escaneadas > 0) overall = 'escaneado';
  else if (conTexto > 0) overall = 'mixto';
  else overall = 'vacio';

  return { pageCount, pages, overall, convertibleInBrowser: conTexto > 0 };
}
```

- [ ] **Step 4: Ejecutar y verificar que pasa**

Run: `cd web && npm test -- diagnose`
Expected: PASS — 5 pruebas.

Si falla al resolver `pdfjs-dist/legacy/build/pdf.mjs`, verificar la ruta real con
`ls web/node_modules/pdfjs-dist/legacy/build/` y ajustar el import **únicamente en
`pdfjs.ts`** — ese es el motivo de que ese módulo exista.

- [ ] **Step 5: Commit**

```bash
git add web/src/pdf/diagnose.ts web/src/pdf/diagnose.test.ts
git commit -m "feat(web): diagnostico de PDF en el navegador

Clasifica cada pagina como texto, escaneado o vacia usando un umbral de
100 caracteres extraibles, que descarta encabezados sueltos presentes
incluso en escaneos con OCR parcial. No hace ninguna peticion de red."
```

---

### Task 4: Conversión PDF → Markdown

**Files:**
- Create: `web/src/pdf/toMarkdown.ts`
- Test: `web/src/pdf/toMarkdown.test.ts`

**Interfaces:**
- Consumes: `makeTextPdf`, `makeImagePdf` (Task 2); `diagnosePdf` (Task 3); `sha256Hex` (Task 1).
- Produces:
  ```ts
  interface ConversionResult {
    markdown: string;
    sourceHash: string;
    pagesConverted: number;
    pagesSkipped: number[];
  }
  pdfToMarkdown(data: ArrayBuffer): Promise<ConversionResult>
  ```
  Lo consume la Task 5.

**Nota de diseño:** `sourceHash` se calcula aquí aunque el archivo no se suba. Sirve para que el usuario pueda identificar de forma inequívoca qué archivo convirtió, y establece el mismo mecanismo que el comprobante de borrado del Plan 2.

- [ ] **Step 1: Escribir la prueba que falla**

Crear `web/src/pdf/toMarkdown.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { pdfToMarkdown } from './toMarkdown';
import { makeTextPdf, makeImagePdf } from './fixtures';
import { sha256Hex } from '../lib/hash';

const LARGO = 'investigacion cualitativa '.repeat(10); // ~260 caracteres

describe('pdfToMarkdown', () => {
  it('extrae el texto de la pagina al markdown', async () => {
    const r = await pdfToMarkdown(await makeTextPdf([LARGO]));
    expect(r.markdown).toContain('investigacion cualitativa');
  });

  it('inserta un separador por pagina', async () => {
    const r = await pdfToMarkdown(await makeTextPdf([LARGO, LARGO]));
    expect(r.markdown).toContain('## Página 1');
    expect(r.markdown).toContain('## Página 2');
  });

  it('informa cuantas paginas convirtio', async () => {
    const r = await pdfToMarkdown(await makeTextPdf([LARGO, LARGO, LARGO]));
    expect(r.pagesConverted).toBe(3);
    expect(r.pagesSkipped).toEqual([]);
  });

  it('omite las paginas escaneadas y las reporta', async () => {
    const r = await pdfToMarkdown(await makeImagePdf(2));
    expect(r.pagesConverted).toBe(0);
    expect(r.pagesSkipped).toEqual([1, 2]);
  });

  it('el sourceHash coincide con el sha256 del archivo de entrada', async () => {
    const pdf = await makeTextPdf([LARGO]);
    const r = await pdfToMarkdown(pdf);
    expect(r.sourceHash).toBe(await sha256Hex(pdf));
  });
});
```

- [ ] **Step 2: Ejecutar y verificar que falla**

Run: `cd web && npm test -- toMarkdown`
Expected: FAIL — `Failed to resolve import "./toMarkdown"`.

- [ ] **Step 3: Implementar `web/src/pdf/toMarkdown.ts`**

```ts
import { pdfjs, loadOptions, tieneOperadorDeImagen } from './pdfjs';
import { diagnosePdf } from './diagnose';
import { sha256Hex } from '../lib/hash';

export interface ConversionResult {
  markdown: string;
  /** SHA-256 del PDF de origen. El archivo no sale del navegador. */
  sourceHash: string;
  pagesConverted: number;
  /** Números de página omitidas por no tener texto extraíble. */
  pagesSkipped: number[];
}

/**
 * Convierte a Markdown las páginas con capa de texto.
 * Las páginas escaneadas se omiten y se reportan: requieren OCR en
 * servidor, que es un servicio de pago (spec §2.3).
 */
export async function pdfToMarkdown(data: ArrayBuffer): Promise<ConversionResult> {
  const diagnosis = await diagnosePdf(data);
  const sourceHash = await sha256Hex(data);

  const doc = await pdfjs.getDocument(loadOptions(data)).promise;

  const bloques: string[] = [];
  const pagesSkipped: number[] = [];

  for (const reporte of diagnosis.pages) {
    if (reporte.kind !== 'texto') {
      pagesSkipped.push(reporte.pageNumber);
      continue;
    }
    const page = await doc.getPage(reporte.pageNumber);
    const content = await page.getTextContent();
    const texto = content.items
      .map((i) => ('str' in i ? i.str : ''))
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim();
    bloques.push(`## Página ${reporte.pageNumber}\n\n${texto}`);
  }

  await doc.destroy();

  return {
    markdown: bloques.join('\n\n'),
    sourceHash,
    pagesConverted: bloques.length,
    pagesSkipped,
  };
}
```

- [ ] **Step 4: Ejecutar y verificar que pasa**

Run: `cd web && npm test -- toMarkdown`
Expected: PASS — 5 pruebas.

- [ ] **Step 5: Ejecutar la suite completa**

Run: `cd web && npm test`
Expected: PASS — 17 pruebas en total (4 hash + 3 fixtures + 5 diagnose + 5 toMarkdown).

- [ ] **Step 6: Commit**

```bash
git add web/src/pdf/toMarkdown.ts web/src/pdf/toMarkdown.test.ts
git commit -m "feat(web): conversion de PDF a Markdown en el navegador

Omite las paginas sin capa de texto y las reporta en pagesSkipped: esas
requieren OCR en servidor, que es el servicio de pago. Calcula el
sha256 del origen aunque el archivo nunca salga del navegador, para que
el usuario pueda identificar inequivocamente que convirtio."
```

---

### Task 5: Interfaz de usuario

**Files:**
- Create: `web/index.html`
- Create: `web/src/main.ts`
- Create: `web/src/ui/report.ts`
- Test: `web/src/ui/report.test.ts`

**Interfaces:**
- Consumes: `configureWorker`, `diagnosePdf`, `PdfDiagnosis` (Task 3); `pdfToMarkdown` (Task 4).
- Produces: `renderDiagnosis(d: PdfDiagnosis): string` — devuelve HTML. Se separa de `main.ts` para poder probarla sin DOM.

⚠️ **`main.ts` nunca importa `pdfjs-dist` directamente.** Accede a PDF.js solo a
través de `./pdf/pdfjs` (Task 3). Ver la nota de esa tarea.

**Copy obligatorio (spec §2.4):** cuando `convertibleInBrowser` es `false`, la interfaz nunca dice "no se puede". Ofrece el OCR de pago y el correo de contacto.

- [ ] **Step 1: Escribir la prueba que falla**

Crear `web/src/ui/report.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { renderDiagnosis } from './report';
import type { PdfDiagnosis } from '../pdf/diagnose';

const base = (over: Partial<PdfDiagnosis>): PdfDiagnosis => ({
  pageCount: 1,
  pages: [{ pageNumber: 1, kind: 'texto', charCount: 500 }],
  overall: 'texto',
  convertibleInBrowser: true,
  ...over,
});

describe('renderDiagnosis', () => {
  it('muestra el numero de paginas', () => {
    expect(renderDiagnosis(base({ pageCount: 312 }))).toContain('312');
  });

  it('ofrece la descarga cuando el PDF es convertible', () => {
    expect(renderDiagnosis(base({}))).toContain('Descargar Markdown');
  });

  it('nunca dice "no se puede" ante un PDF escaneado', () => {
    const html = renderDiagnosis(
      base({ overall: 'escaneado', convertibleInBrowser: false })
    );
    expect(html.toLowerCase()).not.toContain('no se puede');
  });

  it('ofrece el correo de contacto ante un PDF escaneado', () => {
    const html = renderDiagnosis(
      base({ overall: 'escaneado', convertibleInBrowser: false })
    );
    expect(html).toContain('first.contact.desk@aideatext.ai');
  });

  it('indica el caso mixto explicitamente', () => {
    const html = renderDiagnosis(
      base({
        overall: 'mixto',
        pageCount: 2,
        pages: [
          { pageNumber: 1, kind: 'texto', charCount: 500 },
          { pageNumber: 2, kind: 'escaneado', charCount: 0 },
        ],
      })
    );
    expect(html).toContain('mixto');
  });
});
```

- [ ] **Step 2: Ejecutar y verificar que falla**

Run: `cd web && npm test -- report`
Expected: FAIL — `Failed to resolve import "./report"`.

- [ ] **Step 3: Implementar `web/src/ui/report.ts`**

```ts
import type { PdfDiagnosis } from '../pdf/diagnose';

const CONTACTO = 'first.contact.desk@aideatext.ai';

/**
 * Genera el HTML del informe de diagnóstico.
 *
 * Regla de copy (spec §2.4): un PDF no convertible en el navegador nunca
 * se presenta como un fallo. Es la entrada al servicio de OCR de pago.
 */
export function renderDiagnosis(d: PdfDiagnosis): string {
  const escaneadas = d.pages.filter((p) => p.kind === 'escaneado').length;

  if (d.convertibleInBrowser && d.overall === 'texto') {
    return `
      <p><strong>${d.pageCount}</strong> páginas, todas con texto extraíble.</p>
      <p>Se convierte aquí mismo, sin subir nada.</p>
      <button id="descargar">Descargar Markdown</button>`;
  }

  if (d.overall === 'mixto') {
    return `
      <p><strong>${d.pageCount}</strong> páginas: documento <strong>mixto</strong>.</p>
      <p>${d.pageCount - escaneadas} con texto, ${escaneadas} escaneadas.</p>
      <p>Convertimos ahora las que tienen texto. Para las escaneadas hace
         falta OCR en servidor.</p>
      <button id="descargar">Descargar Markdown</button>
      <p>¿Necesitas también las escaneadas?
         <a href="mailto:${CONTACTO}">${CONTACTO}</a></p>`;
  }

  return `
    <p><strong>${d.pageCount}</strong> páginas escaneadas, sin capa de texto.</p>
    <p>Este documento necesita OCR, que se procesa en servidor.
       Puedes probar <strong>una página gratis</strong> antes de decidir:
       elige la peor escaneada, para ver la calidad en el caso más difícil.</p>
    <p>Escríbenos a <a href="mailto:${CONTACTO}">${CONTACTO}</a>
       y evaluamos tu caso.</p>`;
}
```

- [ ] **Step 4: Ejecutar y verificar que pasa**

Run: `cd web && npm test -- report`
Expected: PASS — 5 pruebas.

- [ ] **Step 5: Crear `web/index.html`**

```html
<!doctype html>
<html lang="es-MX">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>DESK — Convertir PDF a Markdown sin subir nada</title>
  <meta name="description"
        content="Convierte PDF a Markdown en tu navegador. Tu archivo nunca sale de tu computadora." />
  <style>
    body { font-family: system-ui, sans-serif; max-width: 42rem;
           margin: 2rem auto; padding: 0 1rem; line-height: 1.6; }
    #zona { border: 2px dashed #888; padding: 3rem 1rem;
            text-align: center; border-radius: 8px; cursor: pointer; }
    #zona.activa { border-color: #000; background: #f5f5f5; }
    .garantia { background: #f0f7f0; padding: 1rem; border-radius: 8px; }
    button { font-size: 1rem; padding: .6rem 1.2rem; cursor: pointer; }
  </style>
</head>
<body>
  <h1>PDF a Markdown, sin subir nada</h1>

  <p class="garantia">
    <strong>Tu archivo no sale de tu computadora.</strong>
    La conversión ocurre en tu navegador. Puedes comprobarlo: abre las
    herramientas de desarrollo, pestaña <em>Red</em>, y verás que no hay
    ninguna petición de subida.
  </p>

  <div id="zona">
    <p>Arrastra tu PDF aquí, o haz clic para elegirlo</p>
    <input type="file" id="archivo" accept="application/pdf" hidden />
  </div>

  <div id="resultado"></div>

  <script type="module" src="/src/main.ts"></script>
</body>
</html>
```

- [ ] **Step 6: Crear `web/src/main.ts`**

```ts
import workerUrl from 'pdfjs-dist/legacy/build/pdf.worker.min.mjs?url';
import { configureWorker } from './pdf/pdfjs';
import { diagnosePdf } from './pdf/diagnose';
import { pdfToMarkdown } from './pdf/toMarkdown';
import { renderDiagnosis } from './ui/report';

// El worker se sirve desde nuestro propio dominio, no desde un CDN:
// una peticion externa contradiria la garantia de "nada sale de aqui".
//
// Se configura a traves de ./pdf/pdfjs, que es la unica instancia de
// PDF.js del proyecto. Importar 'pdfjs-dist' aqui directamente crearia
// una segunda instancia y esta configuracion no tendria efecto.
// El worker debe venir de la variante `legacy`, la misma que usa pdfjs.ts.
configureWorker(workerUrl);

const zona = document.getElementById('zona') as HTMLDivElement;
const input = document.getElementById('archivo') as HTMLInputElement;
const salida = document.getElementById('resultado') as HTMLDivElement;

zona.addEventListener('click', () => input.click());

zona.addEventListener('dragover', (e) => {
  e.preventDefault();
  zona.classList.add('activa');
});

zona.addEventListener('dragleave', () => zona.classList.remove('activa'));

zona.addEventListener('drop', (e) => {
  e.preventDefault();
  zona.classList.remove('activa');
  const file = e.dataTransfer?.files?.[0];
  if (file) void procesar(file);
});

input.addEventListener('change', () => {
  const file = input.files?.[0];
  if (file) void procesar(file);
});

async function procesar(file: File): Promise<void> {
  salida.innerHTML = '<p>Analizando en tu navegador…</p>';
  try {
    const data = await file.arrayBuffer();
    const diagnosis = await diagnosePdf(data);
    salida.innerHTML = renderDiagnosis(diagnosis);

    const boton = document.getElementById('descargar');
    if (boton) {
      boton.addEventListener('click', async () => {
        const r = await pdfToMarkdown(data);
        descargar(r.markdown, file.name.replace(/\.pdf$/i, '') + '.md');
      });
    }
  } catch {
    salida.innerHTML = `
      <p>No pudimos leer este archivo. Puede estar protegido con contraseña
         o dañado.</p>
      <p>Escríbenos a
         <a href="mailto:first.contact.desk@aideatext.ai">first.contact.desk@aideatext.ai</a>
         y lo revisamos.</p>`;
  }
}

function descargar(texto: string, nombre: string): void {
  const url = URL.createObjectURL(new Blob([texto], { type: 'text/markdown' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = nombre;
  a.click();
  URL.revokeObjectURL(url);
}
```

- [ ] **Step 7: Verificar la construcción y el navegador**

Run: `cd web && npm run build`
Expected: compila sin errores de TypeScript y genera `web/dist/`.

Run: `cd web && npm run dev`
Abrir la URL que imprime, cargar un PDF de texto real y confirmar dos cosas:
1. Se descarga el `.md` con el contenido correcto.
2. **En DevTools → Red no aparece ninguna petición de subida.** Este es el
   requisito verificable del spec §3; si falla, la tarea no está completa.

- [ ] **Step 8: Commit**

```bash
git add web/index.html web/src/main.ts web/src/ui/report.ts web/src/ui/report.test.ts
git commit -m "feat(web): interfaz de carga, diagnostico y descarga

El worker de PDF.js se sirve desde el propio dominio y no desde un CDN:
una peticion externa contradiria la garantia de que nada sale del
navegador. El copy nunca dice 'no se puede' ante un PDF escaneado;
deriva al OCR de pago y al correo de contacto (spec 2.4)."
```

---

### Task 6: Despliegue en Azure Static Web Apps

**Files:**
- Create: `.github/workflows/deploy-web.yml`
- Modify: `README.md` (sección Estado)

**Interfaces:**
- Consumes: `web/dist/` producido por `npm run build` (Task 5).
- Produces: sitio en vivo. La URL alimenta el Plan 2 y la prospección del spec §5.

- [ ] **Step 1: Crear el recurso en Azure**

```bash
az staticwebapp create \
  --name desk-aideatext \
  --resource-group <TU-GRUPO> \
  --location eastus2 \
  --sku Free
```

Si no existe el grupo de recursos:
`az group create --name <TU-GRUPO> --location eastus2`

Anotar el token que devuelve:
```bash
az staticwebapp secrets list --name desk-aideatext \
  --query "properties.apiKey" -o tsv
```

- [ ] **Step 2: Guardar el token como secreto de GitHub**

En https://github.com/aideatext/aideatext-desk/settings/secrets/actions
crear `AZURE_STATIC_WEB_APPS_API_TOKEN` con el valor del paso anterior.

**No pegar ese token en ningún archivo del repositorio** (spec §6).

- [ ] **Step 3: Crear `.github/workflows/deploy-web.yml`**

```yaml
name: Desplegar web

on:
  push:
    branches: [main]
    paths: ['web/**', '.github/workflows/deploy-web.yml']
  pull_request:
    branches: [main]
    paths: ['web/**']

jobs:
  build-and-deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          # Node 24, no 20: vitest@5 exige ^22.12.0 || ^24.0.0 || >=26.0.0.
          # Con Node 20 este workflow fallaria en `npm test` pero pasaria el
          # build, porque vite@6 si acepta Node 20 -- un fallo desconcertante.
          node-version: '24'
          cache: npm
          cache-dependency-path: web/package-lock.json

      - name: Instalar dependencias
        working-directory: web
        run: npm ci

      - name: Ejecutar pruebas
        working-directory: web
        run: npm test

      - name: Construir
        working-directory: web
        run: npm run build

      - name: Desplegar
        uses: Azure/static-web-apps-deploy@v1
        with:
          azure_static_web_apps_api_token: ${{ secrets.AZURE_STATIC_WEB_APPS_API_TOKEN }}
          action: upload
          app_location: web/dist
          skip_app_build: true
```

Las pruebas corren antes de desplegar: si el diagnóstico se rompe, no llega a producción.

- [ ] **Step 4: Commit y verificar el despliegue**

```bash
git add .github/workflows/deploy-web.yml
git commit -m "ci: despliegue de la web a Azure Static Web Apps

Las pruebas corren antes del despliegue: si el diagnostico se rompe, no
llega a produccion."
git push
```

Verificar en la pestaña Actions del repositorio que el workflow termina en verde,
y abrir la URL que asigna Azure.

- [ ] **Step 5: Configurar el dominio propio**

```bash
az staticwebapp hostname set \
  --name desk-aideatext \
  --hostname desk.aideatext.ai
```

Añadir en el DNS de `aideatext.ai` el registro CNAME que indique el comando.
La propagación puede tardar hasta 48 h.

- [ ] **Step 6: Actualizar el README y commit**

Reemplazar la sección `## Estado` de `README.md` por:

```markdown
## Estado

✅ **Web cliente en producción** — https://desk.aideatext.ai
   Diagnóstico de PDF y conversión a Markdown, enteramente en el navegador.

🚧 **Transcripción de audio** — en desarrollo. Ver
   [el plan](docs/superpowers/plans/2026-09-20-desk-transcripcion.md).
```

```bash
git add README.md
git commit -m "docs: la web cliente esta en produccion"
git push
```

---

## Verificación final del plan

Al terminar las seis tareas, comprobar:

- [ ] `cd web && npm test` — 22 pruebas en verde
- [ ] `cd web && npm run build` — sin errores de TypeScript
- [ ] https://desk.aideatext.ai carga
- [ ] Un PDF de texto se convierte y descarga correctamente
- [ ] **DevTools → Red no muestra ninguna petición de subida al procesar** ← requisito del spec §3
- [ ] Un PDF escaneado muestra el mensaje de OCR y el correo de contacto, y **no** la frase "no se puede"
- [ ] Un PDF protegido con contraseña muestra el mensaje de error con el correo, sin romper la página

## Fuera de alcance de este plan

Van al plan de transcripción:

- ffmpeg.wasm para extraer audio de video
- Cálculo de duración de audio
- Stripe, precios por país y el mínimo de 30 minutos
- Azure Functions, Blob Storage, SAS
- Borrado verificable y comprobantes
- Cloudflare Turnstile y límite por hash de IP
- OCR en servidor con Document Intelligence
