# Windows build

## Prerequisites

- Windows 10 or 11
- Node.js 20 or later
- npm
- For signed production release, a configured code-signing certificate

## Build

From the repository root:

```powershell
npm.cmd install
npm.cmd run build
```

The package script first type-checks and builds the Vite renderer, then invokes Electron Builder for an NSIS installer in `release/`.

## Local run

```powershell
npm.cmd run dev
```

Vite serves the renderer on port 5173 and Electron opens it after readiness.
