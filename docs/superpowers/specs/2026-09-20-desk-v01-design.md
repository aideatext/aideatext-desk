# DESK v01 — Diseño

**Fecha:** 2026-09-20
**Producto:** desk.aideatext.ai
**Estado:** diseño aprobado, pendiente plan de implementación

---

## 1. Problema y decisión de alcance

### Contexto

DESK es un servicio de conversión de archivos para investigación académica. Se relanza
con una restricción dura: **cero audiencia previa y cero presupuesto de publicidad.**

### Alcance descartado explícitamente

La petición original incluía siete subsistemas: transcripción, texto→audio, PDF→MD,
traducción, cobro, almacenamiento efímero y captación. Construir los cuatro conversores
antes de cobrar el primer peso es la falla clásica: meses de desarrollo sin una sola
prueba de demanda real.

**v01 sale con dos servicios**, elegidos por disposición a pagar:

| Conversor | ¿Pagan por esto? | v01 |
|---|---|---|
| Transcripción de entrevistas | **Sí.** Rev cobra $1.50 USD/min y tiene fila | ✅ |
| PDF → Markdown | Casi nadie paga. Existen alternativas gratuitas | ✅ *(como rampa de confianza, gratis)* |
| Texto → audio | Agradable, no urgente | ❌ Diferido |
| Traducción | Commoditizado (DeepL) | ❌ Diferido |

PDF→MD entra **gratis y sin servidor**, no por ingresos sino porque resuelve el problema
de confianza (§3) y genera el tráfico que alimenta el servicio de pago.

### Estrategia de salida al mercado

**Híbrido:** el motor se construye como producto autoservicio, pero los primeros
ingresos vienen de prospección directa, no de que desconocidos encuentren el sitio.
La landing pública se planta desde el día 1 porque cuesta $0 y el SEO tarda meses en
madurar.

---

## 2. Arquitectura

### Principio rector

> **La arquitectura *es* la garantía de confianza.** Cada decisión se deriva de que el
> archivo no pase por donde decimos que no pasa, y que sea comprobable.

### Pipeline 1 — PDF → Markdown (sin servidor)

```
Navegador del usuario
  └─ PDF.js (WASM, local) → diagnóstico → Markdown → descarga
     ⛔ CERO tráfico de red. Nada sube. Nada que borrar.
```

- Alojado como estáticos en **Azure Static Web Apps (Free)** — costo $0
- Verificable por el usuario en la pestaña Red de su navegador

**Diagnóstico local.** PDF.js determina sin subir nada:

| Detección | Confiable |
|---|---|
| ¿Capa de texto extraíble o pura imagen? | ✅ |
| ¿Tiene OCR previo aplicado? | ✅ |
| Resolución/DPI de imágenes incrustadas | ✅ |
| Documento mixto, página por página | ✅ |
| **Qué tan bien saldría el OCR** | ❌ **No se sabe sin correrlo** |

Esa última fila motiva el mecanismo de muestra gratuita (§2.3).

### Pipeline 2 — Audio/video → texto (de pago)

```
1. Navegador   elige archivo → calcula duración (Web Audio API)
                             → si es video: extrae audio con ffmpeg.wasm
                             → muestra precio exacto        ⛔ nada ha subido

2. Stripe      paga → webhook confirma → se emite SAS (un solo uso, 30 min)

3. Navegador   sube DIRECTO a Blob Storage    ⛔ no pasa por el servidor de app

4. Azure       Blob con TTL → Azure AI Speech (batch)

5. Entrega     enlace por correo (token, sin cuenta)

6. Borrado     origen + resultado + registro del trabajo
```

**Cuatro decisiones deliberadas:**

1. **Se cotiza antes de subir.** El usuario ve el precio sin entregar el archivo.
2. **Subida directa con SAS.** El archivo no toca el servidor de aplicación.
3. **Sin cuentas.** Solo correo para entregar. Mientras menos sepamos, menos tiene que
   confiarnos.
4. **La base de datos nunca toca contenido.** Solo `job_id`, estado, vencimiento y
   referencia de pago. Aunque se filtrara, no hay nada de nadie.

### 2.3 Mecanismo de muestra gratuita

La calidad de un escaneo o de una grabación **no se conoce hasta procesarla**. En vez de
prometer un porcentaje:

- **PDF escaneado:** **1 página** gratis
- **Audio:** **1 minuto** gratis

**El usuario elige cuál**, y la interfaz le pide explícitamente el fragmento *más
difícil*:

> *"Sube el minuto más complejo de tu grabación — donde varias personas hablan a la vez,
> donde hay más ruido de fondo, o donde el audio se escucha peor. Así compruebas la
> calidad en el peor caso, no en el mejor."*

Y para PDF, la página más deteriorada del escaneo.

**Esto invierte la lógica habitual de las demos.** El efecto es doble:

1. Genera confianza: no estamos escogiendo nuestro mejor caso
2. **Elimina disputas posteriores:** nadie puede reclamar que no se le advirtió, si el
   sistema le pidió expresamente su peor fragmento

Resuelve además los dos problemas centrales:

| Problema | Cómo |
|---|---|
| Calidad desconocida | Ve su resultado real antes de pagar |
| Desconfianza | Entrega 1 página o 1 minuto, no su tesis completa |

Es una **escalera de confianza**: herramienta sin subida → muestra pequeña → trabajo
completo.

### 2.4 Desbordamiento: todo lo que excede los límites

Cualquier caso fuera de los límites técnicos se **deriva a correo**, no se rechaza:

- Video demasiado grande para ffmpeg.wasm (memoria del navegador)
- Audio de más de 5 h o más de 500 MB
- PDF escaneado con anotaciones manuscritas, ecuaciones o tablas complejas
- Volumen institucional (una cohorte completa)
- Cualquier formato no soportado

> **first.contact.desk@aideatext.ai** — se evalúa el caso y se cotiza a medida.

Esto convierte el límite técnico en entrada al **carril asistido**, que es el de mayor
margen. Un fallo no es una venta perdida: es una venta más grande que necesita una
persona.

La interfaz nunca dice "no se puede". Dice "esto requiere revisión, escríbenos".

### 2.5 Anti-abuso

**Riesgo:** subir una entrevista en trozos de 1 minuto para obtener la transcripción
completa gratis.

**Evaluación: riesgo bajo, por economía.** Robar 6 horas en trozos de 1 minuto exige
360 subidas, cada una cortando el archivo a mano y resolviendo un desafío. Son varias
horas de trabajo para ahorrar $8 USD. **El abuso cuesta más que pagar.**

Tres capas, suficientes para v01:

| Capa | Mecanismo |
|---|---|
| 1 | **Límite de 1 minuto / 1 página.** La barrera principal |
| 2 | **Cloudflare Turnstile** — gratis, invisible, sin fricción para el usuario |
| 3 | **Límite por hash de IP** — máximo 3 muestras por origen cada 24 h |

**La IP no se almacena.** Se guarda únicamente:

```
SHA-256(IP + salt_rotatorio)  →  contador
```

El salt rota cada 24 horas, lo que **invalida los hashes anteriores de forma
automática**: caducidad sin borrado que administrar, y en ningún momento existe una
dirección IP en la base de datos.

Debe declararse en `SECURITY.md`. Una IP es dato personal bajo la LFPDPPP mexicana y el
RGPD; guardarla sin declararlo destruiría el argumento central del producto.

**Descartado para v01:** rotación de proveedor de captcha. Es complejidad que se
justifica ante un atacante determinado, y todavía no existe. Se añaden capas cuando haya
evidencia de abuso real, no antes.

### Componentes y costo

| Componente | Servicio | Costo en reposo |
|---|---|---|
| Landing + PDF→MD | Static Web Apps **Free** | **$0** |
| API / orquestador | Azure Functions (Consumption) | **$0** (1M ejecuciones gratis/mes) |
| Archivos efímeros | Blob Storage + lifecycle policy | ~$0 |
| Estado de trabajos | Table Storage | céntimos |
| Transcripción | Azure AI Speech | F0: 5 h/mes gratis, luego **$0.18/h** |
| OCR | Azure AI Document Intelligence (Read) | F0: 500 pág/mes, luego **$1.50/1000 pág** |
| Imágenes de contenedor | GitHub Container Registry | **$0** (evita ACR, ~$5/mes) |

> **Costo fijo mensual sin clientes: prácticamente $0.**

**Sin contenedores en v01.** La extracción de audio de video corre en el navegador con
ffmpeg.wasm, lo que elimina la necesidad de Container Apps.

### Restricciones verificadas (2026-09-20)

**Formatos aceptados por Azure Speech batch:** WAV, MP3, OPUS/OGG, FLAC, WMA, AAC,
ALAW/MULAW en contenedor WAV, AMR, WebM, SPEEX.

**MP4 NO está soportado** — confirmado en la práctica, no solo ausente de la lista.
De ahí la extracción con ffmpeg.wasm en el navegador, que además:
- evita subir el video completo (10–20× menos peso)
- mejora la garantía de privacidad: el video nunca sale de la máquina

⚠️ **Límite conocido:** ffmpeg.wasm está acotado por la memoria del navegador
(~2 GB de heap). Archivos muy grandes fallarán. Debe documentarse en la interfaz y
derivarse al carril asistido.

**Límites de Speech:** < 5 horas y < 500 MB por archivo (ruta de transcripción rápida;
verificar si batch difiere). Acceso a Blob vía **SAS URI** — confirmado compatible con
nuestra arquitectura.

**OCR:** Read = $1.50/1000 páginas ($0.0015/página). Una tesis escaneada de 300 páginas
cuesta **$0.45**. El tier F0 (500 páginas/mes, primeras 2 páginas por documento) cubre
exactamente la función de muestra gratuita.

> **Optimización anotada, no adoptada en v01:** Azure AI Content Understanding hace el
> mismo OCR a $1.00/1000 páginas. Evaluar tras el lanzamiento.

---

## 3. Borrado verificable

### Principio

> **El borrado no puede depender de que nuestro código funcione bien.**

Si eliminar es una línea en nuestra aplicación, un bug, una caída o una mentira
significan que el archivo sigue ahí. Debe estar impuesto por la plataforma.

### Tres capas

| Capa | Mecanismo | Cubre |
|---|---|---|
| Inmediata | La app borra al entregar | Caso normal |
| Barrido | Azure Function programada (cada 15 min) | Si la entrega falló |
| **Respaldo final** | **Lifecycle policy de Azure Blob** | **Si todo lo nuestro falló** |

### ⚠️ Configuración obligatoria

**Azure Blob Storage trae `soft delete` y `versioning` activados por defecto en varias
plantillas.** Con eso encendido, un archivo "borrado" sigue siendo recuperable durante
días — **la promesa de cero retención sería falsa sin que nos diéramos cuenta.**

La cuenta de almacenamiento debe crearse con:

- `soft delete` para blobs: **desactivado**
- `versioning`: **desactivado**
- `point-in-time restore`: **desactivado**
- Respaldos: **ninguno**
- **Cuenta de almacenamiento separada**, solo para datos efímeros

Todo declarado en `infra/main.bicep`. Si vive solo en clics del portal, se pierde y la
garantía se rompe en silencio.

**Application Insights** registra cuerpos de petición si se le deja. Debe excluirse
explícitamente.

### Cómo se demuestra

1. **Cronómetro visible** — "Tus archivos se eliminan en 03:47:12"
2. **Comprobante de borrado** — SHA-256 calculado en el navegador al subir; al eliminar
   se emite comprobante con hash y timestamps. Prueba *cuál* archivo se eliminó.
3. **Repositorio público** — el código es auditable. El moat nunca estuvo en el código,
   así que no cuesta nada competitivamente y compra credibilidad ante una audiencia
   académica.

> **Límite honesto, declarado en la web:** publicar el repositorio no demuestra que el
> servidor ejecute ese mismo código. Es señal de responsabilidad, no prueba
> criptográfica.

### Ficha de tratamiento de datos

Por cada trabajo se genera un PDF adjuntable a un protocolo de comité de ética: región
de procesamiento, retención, cifrado, declaración de no uso para entrenamiento, acceso
humano sí/no, hash y comprobante de borrado.

**Ningún conversor genérico entrega esto.** Convierte el obstáculo regulatorio en la
razón de compra.

*Pendiente:* decidir **región de datos**. Azure tiene México Central y Brasil Sur.
Verificar disponibilidad de Speech batch por región antes de fijarlo.

### Los dos carriles no dan la misma garantía

| | Autoservicio | Asistido |
|---|---|---|
| ¿Un humano ve el archivo? | **No** | **Sí** |
| Garantía | Arquitectónica | Personal, con acuerdo firmado |

Se declara explícitamente. Mezclarlos sería mentir.

---

## 4. Precios

### Hallazgo que ordena la sección

**La restricción no es el precio. Es la cobrabilidad.**

| País | ¿Cuenta Stripe? | ¿Pueden pagarte? |
|---|---|---|
| **México** | ✅ | ✅ Tarjeta + **OXXO efectivo** + SPEI + meses sin intereses |
| Perú | ❌ | ⚠️ Solo tarjeta internacional |
| Colombia | ❌ | ⚠️ Solo tarjeta internacional |
| Argentina | ❌ | ⚠️ Tarjeta, con restricciones cambiarias |
| España / EE.UU. | ✅ | ✅ Tarjeta |

~30% de los adultos en América Latina están sub-bancarizados. En México, **OXXO es más
del 30% de las transacciones**, y **30–40% del comercio electrónico usa meses sin
intereses**.

**Cuenta de Stripe confirmada en México** → OXXO, SPEI, MSI y liquidación en MXN
disponibles.

**México es la plaza de arranque**: es la única donde se le puede cobrar a alguien sin
tarjeta. Al resto de LATAM se vende con tarjeta internacional, sin pasarela adicional.

**Venta institucional** (ej. UNIFE comprando para una cohorte) elimina el problema de
rieles de pago por completo: una factura por transferencia.

### Modelo

**Por hora de audio, redondeado a 15 minutos** — es como el investigador ya piensa su
material.

| Nivel | Mercado | Precio/hora | Costo | Margen |
|---|---|---|---|---|
| A | México y LATAM | **$8 USD** (~160 MXN) | $0.18 | 44× |
| B | España / UE | **$15 EUR** | $0.18 | 80× |
| C | EE.UU. / resto | **$19 USD** | $0.18 | 100× |

Ancla de venta permanente: **Rev cobra $90 USD/hora. DESK, $8.**

### Mínimo de cobro: 30 minutos

**Razón: las comisiones de pasarela, no la avaricia.** Stripe México cobra
aproximadamente 3.6% + $3 MXN por transacción con tarjeta nacional:

| Monto | Comisión aprox. | % consumido |
|---|---|---|
| $1 USD (~20 MXN) | ~3.7 MXN | **18%** — inviable |
| $4 USD (~80 MXN) | ~6 MXN | 7.5% — aceptable |

Por debajo de ~$3 USD la transacción deja de tener sentido económico. El mínimo de
30 minutos ($4 en nivel A) sitúa la operación más pequeña en terreno viable.

Entrevistas de menos de 30 minutos se cobran como 30. Debe mostrarse antes de pagar,
nunca como sorpresa en el checkout.

### Mecánica de localización

**Adaptive Pricing de Stripe NO es paridad de poder adquisitivo** — solo convierte al
tipo de cambio local (2–4% de comisión que paga el cliente). Para precios realmente
diferenciados hay que fijar **`currency_options`** manualmente por moneda; Adaptive
Pricing respeta lo definido ahí y solo convierte donde no se tocó.

**Secuencia de detección:**

```
1. Carga la página  → solo hay IP  → Adaptive Pricing fija precio    ← AQUÍ
2. Escribe tarjeta  → el BIN revela país emisor → el precio YA se mostró
3. Paga             → Radar puede ver la discrepancia
```

**Decisión: IP fija el precio. No se bloquea por discrepancia de BIN en v01.**

Razón de asimetría: bloquear a un cliente legítimo (mexicano con tarjeta extranjera,
alguien de viaje) cuesta más que el arbitraje. Y con margen 44×, un estadounidense
pagando $8 en lugar de $19 deja **$7.82** — es una ganancia menor, no una herida.

**OXXO se autoverifica:** exige entrar físicamente a una tienda en México.

### Decisión de ingeniería

El precio vive desde el día 1 en una tabla `país → moneda → precio`, poblada con tres
niveles. **Construimos la costura, no la función.** Añadir un país es cambiar una fila.

### Fiscal

Cobrando desde México: registro SAT e **IVA 16%** sobre servicios digitales a clientes
mexicanos. **Mostrar el precio con IVA incluido** — a un estudiante, un precio que crece
en el checkout lo espanta.

*Pendiente:* verificar en Stripe Dashboard → Payouts si USD está habilitado como moneda
de liquidación, dado que Adaptive Pricing lo exige.

---

## 5. Captación

### Objetivo de targeting

No "tesistas" en general, sino **un momento**: alguien que acaba de terminar trabajo de
campo, tiene horas de entrevistas sin transcribir y una fecha de entrega encima.

**Quién sabe quiénes son: sus asesores.** Un profesor de metodología cualitativa conoce
a todos sus estudiantes en campo. **Un profesor = acceso a quince estudiantes.**

### El activo de distribución

La credencial académica verificable (maestría ESAN, ex-administrador nacional del
SIAGIE, AIdeaText, piloto UNIFE, WebSummit Rio) **es** el canal. Un fundador anónimo no
recibe respuesta de un profesor de CIESAS; un académico con trayectoria, sí.

### Instituciones objetivo (México)

| Institución | Razón |
|---|---|
| **CIESAS** | Antropología social: **toda** tesis es etnográfica. Blanco perfecto |
| **FLACSO México** | Ciencias sociales, metodología cualitativa intensiva |
| **COLMEX** | Sociología, estudios de género, demografía |
| **UAM** | Vínculo preexistente por verificar |
| UNAM (FCPyS, Antropología) | Volumen alto, penetración más difícil |
| Ibero / ITESO | Privadas, mayor capacidad de pago |

**Canal caliente confirmado: UNIFE (Perú)** — contacto vivo, producto ya conversado.
Primera venta a perseguir, preferentemente como compra institucional.

### Táctica principal

> **Taller gratuito en línea, 45 minutos:**
> *"Cómo procesar entrevistas de investigación sin violar tu protocolo ético de datos"*

- Es valor real, no venta: el problema ético de §3 es genuino y poca gente sabe resolverlo
- Un profesor acepta un taller gratis; rechaza una demo de producto
- Un sí = una generación completa
- Repetible: mismo taller, veinte profesores

La herramienta aparece al final, como solución al problema explicado.

### Canales por velocidad

| Canal | Costo | Primer peso |
|---|---|---|
| Correo directo a profesores y coordinadores | $0 | 1–3 semanas |
| Taller gratuito | $0 | 2–4 semanas |
| Grupos de tesistas (Facebook/WhatsApp) | $0 | 2–6 semanas |
| ResearchGate (autores cualitativos recientes) | $0 | 3–6 semanas |
| SEO | $0 | 6–12 meses |
| Google Ads | 💰 | Inmediato, requiere capital |

**Descartados:** Product Hunt (audiencia equivocada), redes sin audiencia, TikTok masivo.
Un tesista en crisis no descubre servicios de transcripción en TikTok; le pregunta a su
asesor o busca en Google.

### Embudo esperado

```
40 correos → ~6 respuestas → ~3 talleres → ~45 estudiantes
           → ~5 muestras gratis → ~2-3 clientes de pago
```

**Primer mes realista: 2–5 clientes, $50–200 USD.** No cubre gastos de subsistencia. Su
función es **probar que el embudo funciona**; uno que funciona se repite con 200 correos.

---

## 6. Repositorio y despliegue

### Estructura

```
AIdeaText_Desk_v01/
├── .github/workflows/
│   ├── deploy-web.yml          → Static Web Apps
│   └── deploy-api.yml          → Azure Functions
├── web/                        # estático
│   └── src/{pdf,audio,ui}/
├── api/                        # Azure Functions
│   ├── quote/                  # cotizar por duración y país
│   ├── checkout/               # sesión de Stripe
│   ├── stripe-webhook/         # pago confirmado → emite SAS
│   ├── transcribe/             # lanza Speech batch
│   ├── job-status/
│   └── sweeper/                # temporizador: borra expirados
├── infra/main.bicep            # garantías de borrado, versionadas
└── docs/superpowers/specs/
```

### Lenguaje

**Node/TypeScript** para la API, aunque v61 sea Python:

- El frontend ya es JavaScript → hash y duración se comparten sin duplicar
- Arranque en frío más rápido, relevante con `minReplicas=0`
- Python 3.14 local es muy reciente; el herramental de Functions va detrás
- No hay NLP pesado: Azure Speech hace el trabajo remoto

DESK no comparte código con v61, así que la inconsistencia no cuesta nada.

### CI/CD

| Componente | Mecanismo |
|---|---|
| `web/` | Static Web Apps, integración nativa con GitHub |
| `api/` | GitHub Actions → Azure Functions |
| Autenticación | **OIDC con credenciales federadas** |

OIDC evita guardar un secreto de larga vida en GitHub: se establece confianza entre
ambos y GitHub obtiene un token temporal por despliegue.

### Secretos

Claves de Stripe y Azure → **Azure Key Vault**, referenciadas por la Function App.
Nunca en el repositorio, en Actions, ni en un `.env` versionado.

> **Antecedente relevante:** el `CLAUDE.md` de v61 tiene pendiente rotar la contraseña de
> Cosmos DB, expuesta en texto plano en un anexo entregado a UNIFE. En DESK —donde el
> argumento de venta *es* el manejo de datos— una filtración así no sería un bug:
> destruiría el producto.

### Visibilidad

1. **Privado** al crear
2. Commit inicial + revisión de secretos
3. **Público** tras esa revisión

Nunca al revés: un secreto empujado a un repo público queda en el historial aunque se
borre después.

---

## 7. Pendientes antes de implementar

| # | Pendiente | Responsable | Bloquea |
|---|---|---|---|
| 1 | Confirmar lenguaje de API (Node/TS asumido) | Manuel | Plan de implementación |
| 2 | Verificar USD como moneda de liquidación en Stripe | Manuel | Configuración de precios |
| 3 | Confirmar mínimo de cobro de 30 min (propuesto) | Manuel | Función `quote` |
| 4 | Decidir región de datos (México Central / Brasil Sur) | Por verificar | `infra/main.bicep` |
| 5 | Confirmar límites de batch vs. transcripción rápida | Por verificar | Validación de subida |
| 6 | Verificar vínculo vivo con UAM | Manuel | Lista de prospección |
| 7 | Alta del buzón `first.contact.desk@aideatext.ai` | Manuel | Desbordamiento (§2.4) |

### Decisiones cerradas en esta sesión

- Muestra gratuita: **1 minuto / 1 página**, elegidos por el usuario, solicitando
  expresamente el fragmento más difícil (§2.3)
- Desbordamiento → **first.contact.desk@aideatext.ai** (§2.4)
- Anti-abuso: límite + Turnstile + **hash de IP con salt rotatorio**, nunca la IP (§2.5)
- Rotación de proveedor de captcha: **descartada en v01**

## 8. Fuera de alcance en v01

- Texto → audio (TTS)
- Traducción
- Pasarela de pagos local para Perú (Yape, PagoEfectivo)
- Cuentas de usuario
- Migración a Azure AI Content Understanding
- Blindaje contra arbitraje por VPN
