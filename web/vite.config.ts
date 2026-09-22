// El import viene de 'vitest/config', NO de 'vite': la clave `test` no
// existe en el tipo de configuración de Vite y el compilador la rechaza.
import { defineConfig } from 'vitest/config';

export default defineConfig({
  build: {
    outDir: 'dist',
    target: 'es2022',
    // Dos paginas, no una. Sin declararla aqui, Vite solo empaqueta
    // `index.html` y `analisissemantico/` no llega a `dist/` — el sitio se
    // desplegaria con un 404 en el enlace que la portada anuncia.
    //
    // Va como `analisissemantico/index.html` y no como `analisissemantico.html`
    // para que la URL sea `/analisissemantico` sin extension y sin necesitar
    // una regla de reescritura en `staticwebapp.config.json`.
    rollupOptions: {
      input: {
        portada: 'index.html',
        asesoria: 'analisissemantico/index.html',
      },
    },
  },
  test: {
    globals: true,
    environment: 'node',
  },
});
