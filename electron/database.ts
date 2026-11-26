import fs from 'node:fs';
import path from 'node:path';
import { app } from 'electron';
import initSqlJs, { Database, SqlJsStatic, type SqlValue } from 'sql.js';
import { migrations, initialAcademicProfilePreset } from '../src/shared/schema';

const ENTITY_COLUMNS: Record<string, string[]> = {
  programmes: ['name', 'code', 'description', 'start_date', 'end_date', 'status'],
  semesters: ['programme_id', 'name', 'start_date', 'end_date', 'status'],
  subjects: ['semester_id', 'name', 'code', 'credits', 'color', 'description'],
  units: ['subject_id', 'name', 'description', 'order_index'],
  topics: ['unit_id', 'name', 'completed', 'notes', 'order_index'],
  calendar_events: ['title', 'description', 'event_type', 'start_at', 'end_at', 'all_day', 'subject_id', 'location', 'recurrence', 'color'],
  tasks: ['title', 'description', 'subject_id', 'due_at', 'priority', 'status', 'estimated_minutes'],
  reminders: ['title', 'message', 'scheduled_at', 'recurrence', 'until_at', 'completed', 'entity_type', 'entity_id', 'notification_id'],
  habits: ['name', 'description', 'frequency', 'target', 'color', 'active'],
  habit_entries: ['habit_id', 'entry_date', 'completed', 'count', 'notes'],
  study_sessions: ['subject_id', 'task_id', 'title', 'started_at', 'ended_at', 'duration_minutes', 'elapsed_seconds', 'notes'],
  availability: ['day_of_week', 'start_time', 'end_time', 'label', 'available'],
  timetable_sessions: ['title', 'subject_id', 'day_of_week', 'start_time', 'end_time', 'location', 'recurrence', 'active'],
  ai_divisions: ['name', 'color', 'description'],
  ai_tools: ['name', 'provider', 'category', 'model', 'access_type', 'modalities', 'capabilities', 'website', 'status', 'notes'],
  ai_agents: ['name', 'avatar', 'tool_id', 'division_id', 'role', 'purpose', 'specialization', 'capabilities', 'modalities', 'status', 'system_prompt', 'notes', 'last_active_at'],
  agent_tasks: ['title', 'description', 'project', 'division_id', 'agent_ids', 'tool_ids', 'priority', 'status', 'modality', 'due_at', 'started_at', 'completed_at', 'input_notes', 'output_result', 'handoff_instructions', 'review_notes'],
  agent_activity: ['event_type', 'description', 'agent_id', 'task_id', 'division_id'],
  work_sessions: ['title', 'status', 'started_at', 'last_resumed_at', 'paused_at', 'ended_at', 'elapsed_seconds', 'paused_seconds', 'task_id', 'agent_id', 'division_id', 'summary', 'notes', 'result'],
};

export class AmsDatabase {
  private db!: Database;
  private SQL!: SqlJsStatic;
  private dataFile: string;

  constructor() {
    this.dataFile = path.join(app.getPath('userData'), 'ams.sqlite');
  }

  async initialize(): Promise<void> {
    const wasmPath = app.isPackaged
      ? path.join(process.resourcesPath, 'app.asar.unpacked', 'node_modules', 'sql.js', 'dist', 'sql-wasm.wasm')
      : path.join(__dirname, '..', '..', 'node_modules', 'sql.js', 'dist', 'sql-wasm.wasm');
    const SQL: SqlJsStatic = await initSqlJs({
      locateFile: () => wasmPath,
      useOldExtensionFunctions: false,
    });
    this.SQL = SQL;
    if (fs.existsSync(this.dataFile)) {
      this.db = new SQL.Database(fs.readFileSync(this.dataFile));
    } else {
      this.db = new SQL.Database();
    }
    this.db.run('PRAGMA foreign_keys = ON');
    this.runMigrations();
    this.seedInitialProfileIfEmpty();
  }

  private seedInitialProfileIfEmpty(): void {
    const result = this.db.exec('SELECT COUNT(*) FROM programmes');
    if (!result.length || Number(result[0].values[0][0]) === 0) {
      try {
        this.db.run('BEGIN');
        this.db.run(initialAcademicProfilePreset);
        this.db.run("INSERT OR IGNORE INTO schema_migrations (id, name) VALUES (3, 'seed_personal_academic_profile')");
        this.db.run('COMMIT');
        this.persist();
      } catch (error) {
        this.db.run('ROLLBACK');
        throw error;
      }
    } else {
      this.db.run("INSERT OR IGNORE INTO schema_migrations (id, name) VALUES (3, 'seed_personal_academic_profile')");
      this.persist();
    }
  }

  private runMigrations(): void {
    this.db.run(`CREATE TABLE IF NOT EXISTS schema_migrations (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`);
    for (const [id, name, sql] of migrations) {
      const result = this.db.exec('SELECT id FROM schema_migrations WHERE id = ?', [id]);
      if (!result.length) {
        this.db.run('BEGIN');
        try {
          this.db.run(sql);
          this.db.run('INSERT INTO schema_migrations (id, name) VALUES (?, ?)', [id, name]);
          this.db.run('COMMIT');
        } catch (error) {
          this.db.run('ROLLBACK');
          throw error;
        }
      }
    }
    this.persist();
  }

  list(entity: string, orderBy = 'id DESC'): unknown[] {
    this.assertEntity(entity);
    const safeOrder = /^[a-zA-Z_ ,]+$/.test(orderBy) ? orderBy : 'id DESC';
    return this.rows(entity, `SELECT * FROM ${entity} ORDER BY ${safeOrder}`);
  }

  get(entity: string, id: number): unknown | undefined {
    this.assertEntity(entity);
    return this.rows(entity, 'SELECT * FROM ' + entity + ' WHERE id = ?', [id])[0];
  }

  create(entity: string, input: Record<string, unknown>): unknown {
    this.assertEntity(entity);
    this.validate(entity, input);
    const columns = ENTITY_COLUMNS[entity].filter(column => column in input);
    const values = columns.map(column => this.sqlValue(input[column]));
    if (!columns.length) throw new Error('No valid fields supplied');
    this.db.run(
      `INSERT INTO ${entity} (${columns.join(', ')}) VALUES (${columns.map(() => '?').join(', ')})`,
      values,
    );
    this.persist();
    return this.get(entity, this.db.exec('SELECT last_insert_rowid() AS id')[0].values[0][0] as number);
  }

  update(entity: string, id: number, input: Record<string, unknown>): unknown {
    this.assertEntity(entity);
    this.validate(entity, input);
    const columns = ENTITY_COLUMNS[entity].filter(column => column in input);
    if (!columns.length) throw new Error('No valid fields supplied');
    this.db.run(
      `UPDATE ${entity} SET ${columns.map(column => `${column} = ?`).join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
      [...columns.map(column => this.sqlValue(input[column])), id],
    );
    this.persist();
    return this.get(entity, id);
  }

  delete(entity: string, id: number): void {
    this.assertEntity(entity);
    this.db.run(`DELETE FROM ${entity} WHERE id = ?`, [id]);
    this.persist();
  }

  custom(sql: string, params: unknown[] = []): unknown[] {
    const forbidden = /^\s*(insert|update|delete|drop|alter|create|pragma|attach|detach)/i;
    if (forbidden.test(sql)) throw new Error('Only read-only analytical queries are allowed');
    return this.rows('_custom', sql, params);
  }

  backup(destination: string): void {
    fs.writeFileSync(destination, Buffer.from(this.db.export()));
  }

  restore(source: string): void {
    if (!fs.existsSync(source)) throw new Error('Backup file does not exist');
    const restored = new this.SQL.Database(fs.readFileSync(source));
    this.db.close();
    this.db = restored;
    this.db.run('PRAGMA foreign_keys = ON');
    this.runMigrations();
    this.persist();
  }

  private assertEntity(entity: string): void {
    if (!Object.hasOwn(ENTITY_COLUMNS, entity)) throw new Error(`Unknown entity: ${entity}`);
  }

  private validate(entity: string, input: Record<string, unknown>): void {
    if (entity === 'habit_entries') {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(String(input.entry_date || ''))) throw new Error('Invalid entry date');
    }
    if (entity === 'availability' || entity === 'timetable_sessions') {
      if (input.start_time && input.end_time && String(input.start_time) >= String(input.end_time)) {
        throw new Error('Start time must be before end time');
      }
    }
  }

  private rows(_entity: string, sql: string, params: unknown[] = []): unknown[] {
    const statement = this.db.prepare(sql);
    if (params.length) statement.bind(params.map(param => this.sqlValue(param)));
    const result: unknown[] = [];
    while (statement.step()) result.push(statement.getAsObject());
    statement.free();
    return result;
  }

  private sqlValue(value: unknown): SqlValue {
    if (value === null || value === undefined) return null;
    if (typeof value === 'string' || typeof value === 'number') return value;
    if (typeof value === 'boolean') return value ? 1 : 0;
    if (value instanceof Uint8Array) return value;
    return String(value);
  }

  private persist(): void {
    fs.mkdirSync(path.dirname(this.dataFile), { recursive: true });
    fs.writeFileSync(this.dataFile, Buffer.from(this.db.export()));
  }

  close(): void {
    this.persist();
    this.db.close();
  }
}
