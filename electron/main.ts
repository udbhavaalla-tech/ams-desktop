import { app, BrowserWindow, ipcMain, dialog, Notification } from 'electron';
import path from 'node:path';
import { AmsDatabase } from './database';

let win: BrowserWindow | null = null;
let database: AmsDatabase;

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
  ipcMain.handle('db:list', (_event, entity: string, orderBy?: string) => database.list(entity, orderBy));
  ipcMain.handle('db:get', (_event, entity: string, id: number) => database.get(entity, id));
  ipcMain.handle('db:create', (_event, entity: string, input: Record<string, unknown>) => database.create(entity, input));
  ipcMain.handle('db:update', (_event, entity: string, id: number, input: Record<string, unknown>) => database.update(entity, id, input));
  ipcMain.handle('db:delete', (_event, entity: string, id: number) => database.delete(entity, id));
  ipcMain.handle('db:query', (_event, sql: string, params?: unknown[]) => database.custom(sql, params));
  ipcMain.handle('backup:create', async () => {
    const result = await dialog.showSaveDialog(win!, {
      defaultPath: `ams-backup-${new Date().toISOString().slice(0, 10)}.sqlite`,
      filters: [{ name: 'SQLite Backup', extensions: ['sqlite'] }],
    });
    if (result.canceled || !result.filePath) return null;
    database.backup(result.filePath);
    return result.filePath;
  });
  ipcMain.handle('backup:restore', async () => {
    const result = await dialog.showOpenDialog(win!, {
      properties: ['openFile'],
      filters: [{ name: 'SQLite Backup', extensions: ['sqlite'] }],
    });
    if (result.canceled || !result.filePaths[0]) return null;
    database.restore(result.filePaths[0]);
    return result.filePaths[0];
  });
  ipcMain.handle('notify', (_event, title: string, body: string) => {
    if (!Notification.isSupported()) return false;
    new Notification({ title, body }).show();
    return true;
  });
}

app.whenReady().then(async () => {
  database = new AmsDatabase();
  await database.initialize();
  registerIpc();
  await createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) void createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', () => database?.close());
