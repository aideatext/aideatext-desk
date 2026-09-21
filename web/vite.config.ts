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
