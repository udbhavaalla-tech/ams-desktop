# Known limitations

- Native notifications require OS notification support and a running Electron process. The app does not guarantee delivery during shutdown or prolonged sleep.
- Reminders are recurring in stored metadata and occurrence calculation, but OS scheduling is currently manually triggered rather than a persistent background scheduler.
- The focus timer persists elapsed seconds on save and stores the running start in localStorage; crash recovery for an unfinished session is limited to display of its in-progress elapsed value.
- SQL.js exports the complete database after writes. It is suitable for a local desktop database but is not a shared network database.
- Calendar recurrence metadata is stored; expanded repeating calendar instances are not generated into separate event rows.
- The initial UI is desktop-first and minimum viewport behavior is 1020 px wide.
