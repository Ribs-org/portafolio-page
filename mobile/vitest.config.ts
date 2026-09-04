import { defineConfig } from 'vitest/config'

// Solo la lógica pura de `lib/`: los componentes no se renderizan en pruebas, igual
// que en el resto del repositorio.
export default defineConfig({
  test: { include: ['lib/**/*.test.ts'], environment: 'node' },
})
