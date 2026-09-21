# DESK — desk.aideatext.ai

Conversión de archivos para investigación académica, con **cero retención de datos**.

Parte del ecosistema [AIdeaText](https://aideatext.ai).

---

## Qué hace

| Servicio | Dónde se ejecuta | Precio |
|---|---|---|
| PDF con texto → Markdown | **En tu navegador** | Gratis |
| Diagnóstico de calidad de PDF | **En tu navegador** | Gratis |
| Muestra de OCR (1 página) | Servidor | Gratis |
| Muestra de transcripción (2 min) | Servidor | Gratis |
| PDF escaneado → Markdown (OCR) | Servidor | De pago |
| Audio / video → texto | Servidor | De pago |

## Principio de diseño

> **El borrado no depende de que nuestro código funcione bien.**

La eliminación de archivos está impuesta por políticas de la plataforma Azure, no por
lógica de aplicación. Si el servicio falla, se cae o desaparece, los archivos se
eliminan igual.

Ver [SECURITY.md](SECURITY.md) para el detalle del tratamiento de datos.

## Estado

✅ **Web cliente en producción** — https://desk.aideatext.ai
   Diagnóstico de PDF y conversión a Markdown, enteramente en el navegador.

🚧 **Transcripción de audio** — en desarrollo. Ver
   [el plan](docs/superpowers/plans/2026-09-20-desk-transcripcion.md).

## Arquitectura

```
web/    Sitio estático — Azure Static Web Apps (Free)
        PDF.js y ffmpeg.wasm corren en el navegador del usuario

api/    Azure Functions (Consumption) — orquestación de trabajos,
        Stripe, emisión de SAS, barrido de expirados

infra/  Bicep — infraestructura como código.
        Aquí viven las garantías de borrado, versionadas.
```

## Licencia

Por definir.
