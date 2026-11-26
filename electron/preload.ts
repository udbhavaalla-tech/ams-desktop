import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('ams', {
  getStatus: () => ipcRenderer.invoke('app:status'),
  db: {
    list: (entity: string, orderBy?: string) => ipcRenderer.invoke('db:list', entity, orderBy),
    get: (entity: string, id: number) => ipcRenderer.invoke('db:get', entity, id),
    create: (entity: string, input: Record<string, unknown>) => ipcRenderer.invoke('db:create', entity, input),
    update: (entity: string, id: number, input: Record<string, unknown>) => ipcRenderer.invoke('db:update', entity, id, input),
    delete: (entity: string, id: number) => ipcRenderer.invoke('db:delete', entity, id),
    query: (sql: string, params?: unknown[]) => ipcRenderer.invoke('db:query', sql, params),
  },
  backup: () => ipcRenderer.invoke('backup:create'),
  restore: () => ipcRenderer.invoke('backup:restore'),
  notify: (title: string, body: string) => ipcRenderer.invoke('notify', title, body),
});
