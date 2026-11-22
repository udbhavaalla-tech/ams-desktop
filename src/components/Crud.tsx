import { FormEvent, useEffect, useState, type ReactNode } from 'react';

export type Field = {
  name: string;
  label: string;
  type?: 'text' | 'number' | 'date' | 'datetime-local' | 'time' | 'textarea' | 'select' | 'checkbox';
  options?: Array<{ value: string | number; label: string }>;
  required?: boolean;
  placeholder?: string;
  defaultValue?: string | number | boolean;
};

export function Crud({
  title,
  entity,
  fields,
  orderBy,
  renderExtra,
}: {
  title: string;
  entity: string;
  fields: Field[];
  orderBy?: string;
  renderExtra?: (row: any) => ReactNode;
}) {
  const [rows, setRows] = useState<any[]>([]);
  const [editing, setEditing] = useState<any | null>(null);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  async function reload() {
    setLoading(true);
    setError('');
    try {
      setRows(await window.ams.db.list(entity, orderBy));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load records');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void reload(); }, [entity]);

  function initialValues(row?: any) {
    const values: Record<string, unknown> = {};
    for (const field of fields) {
      values[field.name] = row?.[field.name] ??
        (field.type === 'checkbox' ? (field.defaultValue ? 1 : 0) : (field.defaultValue ?? ''));
    }
    return values;
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const values: Record<string, unknown> = {};
    for (const field of fields) {
      if (field.type === 'checkbox') values[field.name] = form.has(field.name) ? 1 : 0;
      else {
        const raw = form.get(field.name)?.toString() ?? '';
        if (field.type === 'number') values[field.name] = raw === '' ? null : Number(raw);
        else if (field.type === 'select') values[field.name] = raw === '' ? null : raw;
        else values[field.name] = raw;
      }
    }
    try {
      if (editing) await window.ams.db.update(entity, editing.id, values);
      else await window.ams.db.create(entity, values);
      setOpen(false);
      setEditing(null);
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save record');
    }
  }

  async function remove(row: any) {
    if (!window.confirm(`Delete "${row.name || row.title || 'this record'}"?`)) return;
    try {
      await window.ams.db.delete(entity, row.id);
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not delete record');
    }
  }

  const [values, setValues] = useState<Record<string, unknown>>({});
  useEffect(() => setValues(initialValues(editing)), [editing, open]);

  return (
    <div className="crud">
      <div className="page-heading">
        <div><h2>{title}</h2><p>{rows.length} record{rows.length === 1 ? '' : 's'}</p></div>
        <button className="primary" onClick={() => { setEditing(null); setOpen(true); }}>+ Add {title.replace(/s$/, '')}</button>
      </div>
      {error && <div className="error-banner">{error}</div>}
      {loading ? <div className="loading">Loading...</div> : rows.length === 0 ? (
        <div className="empty-state"><div className="empty-icon">◇</div><h3>No {title.toLowerCase()} yet</h3><p>Add the first record to get started.</p></div>
      ) : (
        <div className="table-wrap"><table>
          <thead><tr>{fields.map(field => <th key={field.name}>{field.label}</th>)}
            {renderExtra && <th>Details</th>}<th>Actions</th></tr></thead>
          <tbody>{rows.map(row => (
            <tr key={row.id} data-id={row.id}>{fields.map(field => <td key={field.name}>
              {field.type === 'checkbox' ? (row[field.name] ? 'Yes' : 'No') : String(row[field.name] ?? '—')}
            </td>)}
            {renderExtra && <td>{renderExtra(row)}</td>}
            <td className="row-actions">
              <button className="ghost" data-edit-id={row.id} onClick={() => { setEditing(row); setOpen(true); }}>Edit</button>
              <button className="danger" onClick={() => void remove(row)}>Delete</button>
            </td></tr>
          ))}</tbody>
        </table></div>
      )}
      {open && (
        <div className="modal-backdrop" role="presentation" onMouseDown={event => event.target === event.currentTarget && setOpen(false)}>
          <form className="modal" onSubmit={submit}>
            <div className="modal-title"><h3>{editing ? 'Edit' : 'Add'} {title.replace(/s$/, '')}</h3><button type="button" className="icon-button" onClick={() => setOpen(false)}>×</button></div>
            <div className="form-grid">{fields.map(field => (
              <label key={field.name} className={field.type === 'textarea' ? 'span-2' : ''}>
                <span>{field.label}</span>
                {field.type === 'textarea' ? <textarea name={field.name} required={field.required} defaultValue={String(values[field.name] ?? '')} /> :
                  field.type === 'select' ? <select name={field.name} required={field.required} defaultValue={String(values[field.name] ?? '')}>
                    <option value="">Select...</option>{field.options?.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
                  </select> :
                  field.type === 'checkbox' ? <input name={field.name} type="checkbox" defaultChecked={Boolean(values[field.name])} /> :
                  <input name={field.name} type={field.type || 'text'} required={field.required} placeholder={field.placeholder} defaultValue={String(values[field.name] ?? field.defaultValue ?? '')} />}
              </label>
            ))}</div>
            <div className="modal-actions"><button type="button" className="ghost" onClick={() => setOpen(false)}>Cancel</button><button className="primary" type="submit">Save</button></div>
          </form>
        </div>
      )}
    </div>
  );
}
