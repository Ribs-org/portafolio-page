// El lint propio de la app: sin esto, `expo lint` sube al config de Next en la
// raíz, que ignora `mobile/**` por completo — o sea, cero lint sobre este código.
const { defineConfig } = require('eslint/config')
const expoConfig = require('eslint-config-expo/flat')

module.exports = defineConfig([
  expoConfig,
  { ignores: ['dist/*', '.expo/*'] },
])
