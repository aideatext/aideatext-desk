# Tratamiento de datos en DESK

Este documento es público y describe exactamente qué ocurre con tus archivos.

---

## Lo que NO hacemos

- ✗ No pedimos cuenta ni registro
- ✗ No guardamos copia de seguridad de tus archivos
- ✗ No analizamos el contenido de tus documentos
- ✗ No usamos tus datos para entrenar modelos
- ✗ No tenemos `soft delete` activado
- ✗ No retenemos el nombre de tu archivo
- ✗ **No almacenamos tu dirección IP** (ver más abajo)

## Lo único que sí guardamos, y por qué

Para evitar que alguien abuse de las muestras gratuitas, necesitamos contar cuántas
solicita un mismo origen. Lo hacemos **sin almacenar tu dirección IP**:

```
SHA-256(tu IP + salt rotatorio)  →  un contador
```

Se guarda el resultado de esa operación, que es irreversible. **El salt rota cada 24
horas**, lo que invalida automáticamente todos los hashes anteriores.

Consecuencia práctica: en ningún momento existe una dirección IP en nuestra base de
datos, y el registro de conteo caduca solo, sin que nadie tenga que borrarlo.

Lo declaramos porque una dirección IP es dato personal bajo la LFPDPPP mexicana y el
RGPD europeo. Guardarla sin decirlo contradiría todo lo demás de este documento.

## Servicios que no suben nada

La conversión de **PDF con texto a Markdown**, el **diagnóstico de PDF** y la
**extracción de audio desde video** se ejecutan íntegramente en tu navegador.

Tu archivo no sale de tu computadora. Puedes comprobarlo: abre las herramientas de
desarrollo de tu navegador, pestaña **Red**, y verás que no hay ninguna petición de
subida.

## Servicios que sí procesan en servidor

La transcripción de audio y el OCR de PDFs escaneados requieren procesamiento remoto.
Para esos casos:

1. **Se cotiza antes de subir.** La duración del audio se calcula en tu navegador. Ves
   el precio exacto sin habernos entregado el archivo.
2. **Subida directa al almacenamiento.** El archivo se sube con una URL firmada (SAS)
   de un solo uso. No pasa por nuestro servidor de aplicación.
3. **La base de datos nunca toca tu contenido.** Solo guarda identificador de trabajo,
   estado, vencimiento y referencia de pago.
4. **Borrado en tres capas**, descritas abajo.

## Cómo se garantiza el borrado

| Capa | Mecanismo | Qué cubre |
|---|---|---|
| Inmediata | La aplicación borra al entregar | Caso normal |
| Barrido | Tarea programada cada 15 minutos | Si la entrega falló |
| **Respaldo final** | **Política de ciclo de vida de Azure** | **Si todo lo nuestro falló** |

La tercera capa la aplica Azure, no nosotros. **Aunque el servicio deje de existir, tus
archivos se eliminan igual.**

La cuenta de almacenamiento se crea con `soft delete`, versionado y restauración
puntual **desactivados**, y sin ninguna política de respaldo. Está declarado en
[`infra/main.bicep`](infra/main.bicep) y es auditable.

## Comprobante de borrado

Al subir, se calcula el SHA-256 del archivo **en tu navegador**. Al eliminarlo, emitimos:

```
Trabajo:     desk-xxxxxx
Archivo:     SHA-256 <hash>
Subido:      <timestamp UTC>
Eliminado:   <timestamp UTC>
Método:      blob delete + lifecycle policy
```

Puedes calcular el hash de tu archivo local y verificar que coincide. Eso prueba *cuál*
archivo se eliminó, no solo que se eliminó algo.

## Ficha para comité de ética

Si tu investigación involucra sujetos humanos, generamos automáticamente una **ficha de
tratamiento de datos** en PDF, adjuntable a tu protocolo: región de procesamiento,
tiempo de retención, cifrado, declaración de no uso para entrenamiento, y el
comprobante de borrado.

## Los dos carriles no dan la misma garantía

| | Autoservicio | Servicio asistido |
|---|---|---|
| ¿Un humano ve el archivo? | **No. Nadie.** | **Sí**, una persona identificada |
| Garantía | Arquitectónica | Acuerdo de confidencialidad firmado |

Si contratas el servicio asistido, una persona con nombre y credenciales verificables
procesa tu material bajo acuerdo de confidencialidad. Es una garantía distinta, no
la misma. No las presentamos como equivalentes.

## Límite de esta transparencia

El código de DESK es público, pero **publicar el repositorio no demuestra que el
servidor ejecute exactamente ese código**. Es una señal de responsabilidad, no una
prueba criptográfica. Lo decimos así porque exagerar aquí destruiría justamente lo que
intentamos construir.

## Contacto

- **Reportes de seguridad:** mv@aideatext.com
- **Casos que exceden los límites del sistema:** first.contact.desk@aideatext.ai

Si tu archivo es demasiado grande, tiene un formato no soportado, o tu investigación
necesita un tratamiento particular, escríbenos. Se evalúa el caso y se cotiza. El
sistema nunca te dirá "no se puede" sin ofrecerte una alternativa.
