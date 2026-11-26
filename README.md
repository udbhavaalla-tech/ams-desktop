# AMS Desktop

AMS Desktop is a local-first Academics Management System for Windows, built with Electron, React, TypeScript, Vite, SQLite, Zustand-compatible state patterns, Recharts, date-fns, and Electron Builder.

## Features

- Academic hierarchy: programmes, semesters, subjects, units, topics
- Topic-based syllabus completion
- Calendar events with month, week, day, and agenda views
- Timetable sessions, availability, overlap and unavailable-time detection
- Tasks, reminders, habits and daily entries
- Persisted focus timer and study sessions
- Analytics derived only from database records
- Native notifications with persisted duplicate prevention
- SQLite backup and restore

## Run

```powershell
npm.cmd install
npm.cmd run dev
```

## Test

```powershell
npm.cmd test
npm.cmd run build:renderer
```

## Windows installer

```powershell
npm.cmd run build
```

The NSIS installer is written to `release/`.
