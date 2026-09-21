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

🚧 **En diseño.** El spec vive en
[`docs/superpowers/specs/`](docs/superpowers/specs/2026-09-20-desk-v01-design.md).

No hay código de producto todavía.

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
