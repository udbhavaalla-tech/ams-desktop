import { describe, expect, it } from 'vitest';
import initSqlJs from 'sql.js';
import path from 'node:path';
import {
  analyticsFromRecords,
  calculateHabitStreak,
  calculateReminderOccurrences,
  calculateSyllabusCompletion,
  detectOverlap,
  elapsedSeconds,
  advanceReminderSchedule,
} from '../src/shared/business';
import { migrations } from '../src/shared/schema';

describe('business rules', () => {
  it('detects timetable overlaps only on the same day', () => {
    expect(detectOverlap(
      { day: '1', start: '09:00', end: '10:30' },
      [{ day: '1', start: '10:00', end: '11:00' }],
    )).toBe(true);
    expect(detectOverlap(
      { day: '1', start: '09:00', end: '10:30' },
      [{ day: '2', start: '09:30', end: '10:00' }],
    )).toBe(false);
  });

  it('calculates syllabus completion from topic records', () => {
    expect(calculateSyllabusCompletion([])).toBe(0);
    expect(calculateSyllabusCompletion([{ completed: 1 }, { completed: 0 }, { completed: 1 }])).toBe(67);
  });

  it('calculates consecutive habit streaks through today', () => {
    const today = new Date(2026, 10, 22);
    expect(calculateHabitStreak([
      { entry_date: '2026-11-22', completed: 1 },
      { entry_date: '2026-11-21', completed: 1 },
      { entry_date: '2026-11-20', completed: 1 },
    ], today)).toBe(3);
  });

  it('generates bounded recurring reminder occurrences', () => {
    const occurrences = calculateReminderOccurrences(
      '2026-11-22T09:00:00.000Z',
      'daily',
      null,
      new Date('2026-11-25T09:00:00.000Z'),
    );
    expect(occurrences).toHaveLength(4);
  });

  it('advances recurring reminder schedules by day, week or month', () => {
    expect(advanceReminderSchedule('2026-11-22T09:00:00.000Z', 'daily'))
      .toBe('2026-11-23T09:00:00.000Z');
    expect(advanceReminderSchedule('2026-11-22T09:00:00.000Z', 'weekly'))
      .toBe('2026-11-29T09:00:00.000Z');
    expect(advanceReminderSchedule('2026-11-22T09:00:00.000Z', 'monthly'))
      .toBe('2026-12-22T09:00:00.000Z');
    expect(advanceReminderSchedule('2026-11-22T09:00:00.000Z', 'once')).toBeNull();
  });

  it('persists wall-clock elapsed seconds excluding the caller-provided pause offset', () => {
    expect(elapsedSeconds(1_000, 61_000, 120)).toBe(180);
  });

  it('builds analytics exclusively from supplied records', () => {
    const result = analyticsFromRecords({
      studySessions: [{ duration_minutes: 45, subject_id: 1, started_at: '2026-11-22T08:00:00Z' }],
      tasks: [{ status: 'completed', priority: 'high' }, { status: 'pending', priority: 'low' }],
      habits: [{ id: 1 }],
      habitEntries: [{ completed: 1 }, { completed: 0 }],
    });
    expect(result).toEqual({
      totalStudyMinutes: 45,
      completedTasks: 1,
      openTasks: 1,
      habitCompletionRate: 50,
      subjectMinutes: [{ name: '1', minutes: 45 }],
    });
  });
});

describe('SQLite migrations and repositories', () => {
  it('applies migrations, indexes, CRUD, cascade deletes and validation constraints', async () => {
    const SQL = await initSqlJs({
      locateFile: file => path.join(process.cwd(), 'node_modules', 'sql.js', 'dist', file),
    });
    const db = new SQL.Database();
    db.run('PRAGMA foreign_keys = ON');
    db.run(`CREATE TABLE IF NOT EXISTS schema_migrations (
      id INTEGER PRIMARY KEY, name TEXT NOT NULL UNIQUE,
      applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`);
    for (const [id, name, sql] of migrations) {
      db.run('BEGIN');
      db.run(sql);
      db.run('INSERT INTO schema_migrations (id, name) VALUES (?, ?)', [id, name]);
      db.run('COMMIT');
    }
    db.run("INSERT INTO programmes (name, code) VALUES (?, ?)", ['Computer Science', 'CS']);
    db.run("INSERT INTO semesters (programme_id, name) VALUES (?, ?)", [1, 'Semester 1']);
    db.run("INSERT INTO subjects (semester_id, name) VALUES (?, ?)", [1, 'Algorithms']);
    expect(() => db.run("INSERT INTO availability (day_of_week, start_time, end_time) VALUES (?, ?, ?)", [7, '09:00', '10:00'])).toThrow();

    db.run("INSERT INTO units (subject_id, name) VALUES (?, ?)", [1, 'Graph theory']);
    const unitId = db.exec('SELECT last_insert_rowid()')[0].values[0][0] as number;
    db.run("INSERT INTO topics (unit_id, name, completed) VALUES (?, ?, ?)", [unitId, 'Dijkstra', 1]);
    expect(db.exec('SELECT COUNT(*) FROM topics')[0].values[0][0]).toBe(1);

    db.run('DELETE FROM programmes WHERE id = 1');
    expect(db.exec('SELECT COUNT(*) FROM subjects')[0].values[0][0]).toBe(0);
    expect(db.exec("SELECT COUNT(*) FROM sqlite_master WHERE type = 'index' AND name = 'idx_tasks_due'")[0].values[0][0]).toBe(1);
    db.close();
  });

  it('preserves create, edit and delete changes across database export and reload', async () => {
    const SQL = await initSqlJs({
      locateFile: file => path.join(process.cwd(), 'node_modules', 'sql.js', 'dist', file),
    });
    const db = new SQL.Database();
    db.run('CREATE TABLE IF NOT EXISTS programmes (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL)');
    db.run('INSERT INTO programmes (name) VALUES (?)', ['Temporary Programme']);
    db.run('UPDATE programmes SET name = ? WHERE id = 1', ['Edited Programme']);
    const exported = db.export();
    db.close();

    const restored = new SQL.Database(exported);
    expect(restored.exec('SELECT name FROM programmes WHERE id = 1')[0].values[0][0]).toBe('Edited Programme');
    restored.run('DELETE FROM programmes WHERE id = 1');
    const deleted = restored.export();
    restored.close();

    const reloaded = new SQL.Database(deleted);
    expect(reloaded.exec('SELECT COUNT(*) FROM programmes')[0].values[0][0]).toBe(0);
    reloaded.close();
  });
});
