# Supply Chain Security for TanStack Projects

## Core rules (apply to every project)

### 1. Exact version pinning
Never use `^` or `~`. Write exact versions:
```json
// ✅ Safe
"@tanstack/react-router": "1.82.3"

// ❌ Dangerous
"@tanstack/react-router": "^1.82.3"
```

### 2. Always commit pnpm-lock.yaml
```gitignore
# Never add this to .gitignore:
pnpm-lock.yaml
```

### 3. Frozen lockfile in CI
```yaml
# GitHub Actions / any CI
- run: pnpm install --frozen-lockfile
```

### 4. Audit before adding packages
```bash
# Before installing any new package:
pnpm audit --audit-level=moderate

# After adding new deps:
pnpm install
pnpm audit --audit-level=moderate
```

### 5. Approve build scripts explicitly
pnpm blocks postinstall scripts by default (v9+). Only approve trusted packages:

```bash
pnpm approve-builds
# Select ONLY:
# - esbuild (required by vite)
# - @tailwindcss/oxide (required by tailwindcss v4)
```

Never approve unknown or unexpected packages in this list.

### 6. Verify npm provenance (optional but recommended)
```bash
# Check if a package has provenance attestation
npm info <package> dist.attestations
```
Prefer packages with provenance. All TanStack packages publish with provenance.

## Red flags when adding dependencies

- Package has very few downloads or was published recently
- Package name is similar to a popular package (typosquatting)
- `postinstall` / `preinstall` scripts that aren't documented
- `package.json` has unexpected `bin` entries
- No source code repository link

## TanStack-specific: verified official packages

Only install from these official scopes:
- `@tanstack/*` — official TanStack packages
- `@vitejs/*` — official Vite plugins  
- `@tailwindcss/*` — official Tailwind packages

## pnpm security settings (.npmrc)

Add to project root `.npmrc` for extra hardening:

```ini
# Prevent installing packages with known security issues
audit=true

# Require lockfile to exist before install
prefer-frozen-lockfile=true

# Disallow scripts unless explicitly approved
ignore-scripts=false
```

## Checking for known compromised packages

Cross-reference new packages against:
- [Socket.dev](https://socket.dev) — supply chain risk scores
- [OpenSSF Scorecard](https://securityscorecards.dev)
- GitHub Advisory Database: `https://github.com/advisories`

## Incident response: if a dep is compromised

1. `pnpm remove <package>` immediately
2. Rotate any secrets that the app used at runtime
3. Audit git history for any `pnpm-lock.yaml` changes that added the package
4. Check if `postinstall` ran: review `node_modules/.pnpm/<pkg>/node_modules/<pkg>/` for suspicious files
