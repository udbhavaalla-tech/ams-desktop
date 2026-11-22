interface AmsApi {
  db: {
    list(entity: string, orderBy?: string): Promise<any[]>;
    get(entity: string, id: number): Promise<any>;
    create(entity: string, input: Record<string, unknown>): Promise<any>;
    update(entity: string, id: number, input: Record<string, unknown>): Promise<any>;
    delete(entity: string, id: number): Promise<void>;
    query(sql: string, params?: unknown[]): Promise<any[]>;
  };
  backup(): Promise<string | null>;
  restore(): Promise<string | null>;
  notify(title: string, body: string): Promise<boolean>;
}

interface Window {
  ams: AmsApi;
}
