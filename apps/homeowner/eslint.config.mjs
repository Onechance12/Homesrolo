import coreWebVitals from 'eslint-config-next/core-web-vitals'
import typescript from 'eslint-config-next/typescript'

// eslint-config-next 16 ships native flat configs, so no FlatCompat here —
// the version is pinned to the Next runtime and imported directly.
export default [
  { ignores: ['.next/**', 'out/**', 'node_modules/**', 'next-env.d.ts'] },
  ...coreWebVitals,
  ...typescript,
  {
    rules: {
      // Phase 1 UI shell: no network from app code. The real authenticated
      // runtime arrives behind the data port, implemented by the integration
      // lane — not by a component quietly calling fetch.
      'no-restricted-globals': ['error', 'fetch', 'XMLHttpRequest', 'WebSocket'],
      '@typescript-eslint/no-unused-vars': ['error', {
        varsIgnorePattern: '^_',
        argsIgnorePattern: '^_',
        ignoreRestSiblings: true,
      }],
    },
  },
]
