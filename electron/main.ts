import { app, BrowserWindow, ipcMain, dialog, Notification } from 'electron';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { AmsDatabase } from './database';
import { advanceReminderSchedule } from '../src/shared/business';

let win: BrowserWindow | null = null;
let database: AmsDatabase;
let startupError = '';
let reminderTimer: NodeJS.Timeout | null = null;

async function createWindow(): Promise<void> {
  win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1020,
    minHeight: 700,
    backgroundColor: '#0b1020',
    titleBarStyle: 'hiddenInset',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  if (!app.isPackaged) {
    await win.loadURL('http://localhost:5173');
  } else {
    await win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
  }
}

function registerIpc(): void {
  ipcMain.handle('app:status', () => ({
    ready: !startupError && Boolean(database),
    error: startupError,
  }));
  const requireDatabase = () => {
    if (!database) throw new Error(startupError || 'Database is not initialized');
    return database;
  };
  ipcMain.handle('db:list', (_event, entity: string, orderBy?: string) => requireDatabase().list(entity, orderBy));
  ipcMain.handle('db:get', (_event, entity: string, id: number) => requireDatabase().get(entity, id));
  ipcMain.handle('db:create', (_event, entity: string, input: Record<string, unknown>) => requireDatabase().create(entity, input));
  ipcMain.handle('db:update', (_event, entity: string, id: number, input: Record<string, unknown>) => requireDatabase().update(entity, id, input));
  ipcMain.handle('db:delete', (_event, entity: string, id: number) => requireDatabase().delete(entity, id));
  ipcMain.handle('db:query', (_event, sql: string, params?: unknown[]) => requireDatabase().custom(sql, params));
  ipcMain.handle('backup:create', async () => {
    const result = await dialog.showSaveDialog(win!, {
      defaultPath: `ams-backup-${new Date().toISOString().slice(0, 10)}.sqlite`,
      filters: [{ name: 'SQLite Backup', extensions: ['sqlite'] }],
    });
    if (result.canceled || !result.filePath) return null;
    requireDatabase().backup(result.filePath);
    return result.filePath;
  });
  ipcMain.handle('backup:restore', async () => {
    const result = await dialog.showOpenDialog(win!, {
      properties: ['openFile'],
      filters: [{ name: 'SQLite Backup', extensions: ['sqlite'] }],
    });
    if (result.canceled || !result.filePaths[0]) return null;
    requireDatabase().restore(result.filePaths[0]);
    return result.filePaths[0];
  });
  ipcMain.handle('notify', (_event, title: string, body: string) => {
    if (!Notification.isSupported()) return false;
    new Notification({ title, body }).show();
    return true;
  });
}

function startReminderScheduler(): void {
  if (!database || reminderTimer) return;

  const checkDueReminders = () => {
    if (!Notification.isSupported()) return;
    const now = new Date();
    for (const reminder of database.list('reminders', 'scheduled_at ASC') as Array<Record<string, unknown>>) {
      if (reminder.completed === 1 || reminder.notification_id) continue;
      const scheduledAt = typeof reminder.scheduled_at === 'string'
        ? new Date(reminder.scheduled_at)
        : null;
      if (!scheduledAt || isNaN(scheduledAt.getTime()) || scheduledAt > now) continue;

      const title = String(reminder.title || 'Academic Reminder');
      const body = String(reminder.message || 'You have an upcoming academic reminder.');
      new Notification({ title, body }).show();

      const recurrence = String(reminder.recurrence || 'once');
      if (recurrence === 'once') {
        database.update('reminders', Number(reminder.id), {
          completed: 1,
          notification_id: randomUUID(),
        });
        continue;
      }

      let next = advanceReminderSchedule(scheduledAt.toISOString(), recurrence);
      const until = typeof reminder.until_at === 'string' ? new Date(reminder.until_at) : null;
      let steps = 0;
      while (next && new Date(next) <= now && (!until || new Date(next) <= until) && steps < 10000) {
        next = advanceReminderSchedule(next, recurrence);
        steps += 1;
      }
      if (!next || (until && new Date(next) > until)) {
        database.update('reminders', Number(reminder.id), {
          completed: 1,
          notification_id: randomUUID(),
        });
      } else {
        database.update('reminders', Number(reminder.id), {
          scheduled_at: next,
          completed: 0,
          notification_id: null,
        });
      }
    }
  };

  checkDueReminders();
  reminderTimer = setInterval(checkDueReminders, 30_000);
}

app.whenReady().then(async () => {
  try {
    database = new AmsDatabase();
    await database.initialize();
  } catch (error) {
    startupError = error instanceof Error ? error.message : 'Unknown database initialization error';
  }
  registerIpc();
  startReminderScheduler();
  await createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) void createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', () => {
  if (reminderTimer) clearInterval(reminderTimer);
  database?.close();
});
