---
name: tanstack-app
description: 'Scaffold a new TanStack application using the latest safe versions of @tanstack/react-router, @tanstack/react-query, Vite, Tailwind CSS v4, and pnpm. Use for: creating TanStack projects, setting up file-based routing, configuring TanStack Router with Vite plugin, avoiding supply chain vulnerabilities in TanStack setup, pinning safe package versions, TanStack starter template.'
argument-hint: 'Optional: app name or feature description'
---

# TanStack App Scaffold

Scaffold a production-ready TanStack application with verified, pinned dependencies to avoid supply chain vulnerabilities.

## Stack

| Tool | Purpose |
|------|---------|
| `pnpm` | Package manager (workspace support, strict lockfile) |
| `vite` + `@vitejs/plugin-react` | Build tool |
| `@tanstack/react-router` | Type-safe file-based routing |
| `@tanstack/react-query` | Server state management |
| `tailwindcss` v4 | Utility-first CSS (zero config) |
| TypeScript | Strict mode |

## Supply Chain Safety Rules

> Follow these on every scaffold. See [security reference](./references/security.md) for detail.

1. **Pin all deps to exact versions** — no `^` or `~` in `package.json`
2. **Commit `pnpm-lock.yaml`** — always, never `.gitignore` it
3. **Use `pnpm install --frozen-lockfile`** in CI
4. **Audit before adding packages**: `pnpm audit --audit-level=moderate`
5. **Approve build scripts explicitly**: run `pnpm approve-builds` and only allow known packages (`esbuild`, `@tailwindcss/oxide`)
6. **Verify package provenance**: prefer packages with npm provenance attestations

## Procedure

### 1. Check latest safe versions

Before writing `package.json`, resolve the current safe versions:

```bash
pnpm info @tanstack/react-router version
pnpm info @tanstack/react-query version
pnpm info @tanstack/router-devtools version
pnpm info @tanstack/react-query-devtools version
pnpm info vite version
pnpm info @vitejs/plugin-react version
pnpm info tailwindcss version
pnpm info typescript version
```

### 2. Create project structure

```
<app-name>/
├── pnpm-workspace.yaml       # if monorepo
├── package.json              # exact pinned versions, no ^ or ~
├── tsconfig.json
├── vite.config.ts            # includes TanStack Router Vite plugin
├── index.html
└── src/
    ├── main.tsx
    ├── router.tsx            # createRouter, declare module
    ├── routes/
    │   ├── __root.tsx        # Root layout with <Outlet />
    │   └── index.tsx         # Home route
    └── index.css             # @import "tailwindcss"
```

### 3. Use the file-based routing template

See [routing reference](./references/routing.md) for canonical file templates.

Key points:
- `vite.config.ts` must include `TanStackRouterVite()` plugin — it auto-generates `routeTree.gen.ts`
- Routes live in `src/routes/` by default
- Root route file is `src/routes/__root.tsx`
- Index route is `src/routes/index.tsx` (maps to `/`)
- Nested routes use dot notation: `src/routes/posts.$postId.tsx`
- Layout routes use `_layout.tsx` prefix

### 4. Install & approve builds

```bash
pnpm install
pnpm approve-builds   # interactive: approve only esbuild, @tailwindcss/oxide
pnpm audit --audit-level=moderate
```

### 5. Verify

```bash
pnpm tsc --noEmit     # type-check passes
pnpm dev              # app loads at localhost:5173
```

## Key Files Reference

- [Package versions & package.json template](./references/versions.md)
- [File-based routing templates](./references/routing.md)
- [Supply chain security rules](./references/security.md)
