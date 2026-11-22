# Database

The database file is `ams.sqlite` in Electron's per-user application data directory.

## Relationships

- programmes -> semesters
- semesters -> subjects
- subjects -> units -> topics
- subjects -> tasks and study sessions
- semesters and subjects use cascade deletes
- subject references on events/tasks/sessions use safe `SET NULL` behavior
- habits -> habit entries

## Migration strategy

Migrations run in the main process and are identified by numeric ID in `schema_migrations`. Each migration is applied inside a transaction. Migration 1 creates tables; migration 2 creates indexes.

## Indexes

Indexes cover semester, subject, unit, topic, event-start, task due/status, reminder schedule, habit date, study subject, timetable day, and availability day columns.

## Validation

Entity names are allowlisted before SQL construction. Field names are allowlisted per entity. Time ranges must start before they end. Dates, required fields, and topic completion constraints are validated by the UI and database constraints.

## Backup and restore

Settings -> Database backup invokes native save/open dialogs and writes or imports a complete SQLite file. Restore replaces the active in-memory database before the file is exported to the application data location.
