# Package Versions & package.json Template

## Resolve latest safe versions before scaffolding

Always run these before writing `package.json` to get current versions:

```bash
pnpm info @tanstack/react-router version
pnpm info @tanstack/react-query version
pnpm info vite version
pnpm info @vitejs/plugin-react version
pnpm info tailwindcss version
pnpm info typescript version
```

## package.json template

Pin all versions exactly — no `^` or `~`.

```json
{
  "name": "<app-name>",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc && vite build",
    "preview": "vite preview",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@tanstack/react-query": "<RESOLVED_VERSION>",
    "@tanstack/react-router": "<RESOLVED_VERSION>",
    "react": "<RESOLVED_VERSION>",
    "react-dom": "<RESOLVED_VERSION>"
  },
  "devDependencies": {
    "@tanstack/react-query-devtools": "<RESOLVED_VERSION>",
    "@tanstack/router-devtools": "<RESOLVED_VERSION>",
    "@tanstack/router-plugin": "<RESOLVED_VERSION>",
    "@types/react": "<RESOLVED_VERSION>",
    "@types/react-dom": "<RESOLVED_VERSION>",
    "@vitejs/plugin-react": "<RESOLVED_VERSION>",
    "tailwindcss": "<RESOLVED_VERSION>",
    "@tailwindcss/vite": "<RESOLVED_VERSION>",
    "typescript": "<RESOLVED_VERSION>",
    "vite": "<RESOLVED_VERSION>"
  }
}
```

## tsconfig.json

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "useDefineForClassFields": true,
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "skipLibCheck": true,
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "jsx": "react-jsx",
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true
  },
  "include": ["src"]
}
```

## vite.config.ts

Uses `@tanstack/router-plugin/vite` (the Vite plugin that auto-generates the route tree):

```ts
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { TanStackRouterVite } from '@tanstack/router-plugin/vite'

export default defineConfig({
  plugins: [
    TanStackRouterVite({ routesDirectory: './src/routes' }),
    react(),
    tailwindcss(),
  ],
})
```

> **Order matters**: `TanStackRouterVite` must come before `react()`.

## index.css (Tailwind v4)

Tailwind v4 uses a single import — no `tailwind.config.js` needed:

```css
@import "tailwindcss";
```
