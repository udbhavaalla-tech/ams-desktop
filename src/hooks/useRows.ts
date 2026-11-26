import { useEffect, useState, useCallback } from 'react';

/** Reactive list of rows from an entity table, with reload capability. */
export function useRows<T = any>(entity: string, orderBy?: string) {
  const [rows, setRows] = useState<T[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const reload = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await window.ams.db.list(entity, orderBy);
      setRows(data as T[]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load records');
    } finally {
      setLoading(false);
    }
  }, [entity, orderBy]);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { rows, loading, error, reload };
}

/** Run a read-only analytical query. */
export function useQuery<T = any>(sql: string, params: unknown[] = []) {
  const [rows, setRows] = useState<T[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const reload = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await window.ams.db.query(sql, params);
      setRows(data as T[]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Query failed');
    } finally {
      setLoading(false);
    }
  }, [sql, ...params]);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { rows, loading, error, reload };
}
