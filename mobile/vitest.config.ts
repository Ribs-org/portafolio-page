import { defineConfig } from 'vitest/config'

// Solo la lógica pura de `src/lib/`: los componentes no se renderizan en pruebas, igual
// que en el resto del repositorio.
export default defineConfig({
  test: { include: ['src/lib/**/*.test.ts'], environment: 'node' },
})
