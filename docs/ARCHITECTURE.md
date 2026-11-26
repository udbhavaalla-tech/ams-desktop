# Architecture

## Process boundaries

The Electron main process owns the SQLite database and native OS APIs. The renderer is a React application that cannot access Node.js or the filesystem. It communicates only through the context-isolated `window.ams` preload API and Electron IPC.

## Source layout

- `electron/main.ts`: application lifecycle and IPC registration
- `electron/preload.ts`: constrained renderer bridge
- `electron/database.ts`: SQLite repository and persistence
- `src/shared/schema.ts`: migration SQL
- `src/shared/business.ts`: pure calculations and validation helpers
- `src/components/Crud.tsx`: reusable CRUD form/table behavior
- `src/App.tsx`: navigation and feature screens

## Persistence

SQL.js provides a full SQLite database file in the Electron user-data directory. Every write re-exports the database to `ams.sqlite`, which keeps persistence reliable and portable. Foreign keys are enabled and migrations are transactionally tracked in `schema_migrations`.
