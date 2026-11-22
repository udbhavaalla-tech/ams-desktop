export type TimeRange = { start: string; end: string };

export function timeToMinutes(value: string): number {
  const [hours, minutes] = value.split(':').map(Number);
  return (hours || 0) * 60 + (minutes || 0);
}

export function rangesOverlap(a: TimeRange, b: TimeRange): boolean {
  return timeToMinutes(a.start) < timeToMinutes(b.end) &&
    timeToMinutes(b.start) < timeToMinutes(a.end);
}

export function detectOverlap(
  candidate: TimeRange & { day: string },
  existing: Array<TimeRange & { day: string }>,
): boolean {
  return existing.some(item => item.day === candidate.day && rangesOverlap(candidate, item));
}

export function calculateSyllabusCompletion(topics: Array<{ completed: number }>): number {
  if (!topics.length) return 0;
  return Math.round((topics.filter(topic => topic.completed === 1).length / topics.length) * 100);
}

export function calculateHabitStreak(entries: Array<{ entry_date: string; completed: number }>, today = new Date()) {
  const completed = new Set(entries.filter(item => item.completed === 1).map(item => item.entry_date));
  let cursor = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  let streak = 0;
  while (completed.has(formatDate(cursor))) {
    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}

export function formatDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function elapsedSeconds(startedAt: number, now = Date.now(), pausedSeconds = 0): number {
  return Math.max(0, pausedSeconds + Math.floor((now - startedAt) / 1000));
}

export function calculateReminderOccurrences(
  startAt: string,
  recurrence: string,
  until: string | null,
  windowEnd: Date,
): string[] {
  const start = new Date(startAt);
  const end = until ? new Date(Math.min(new Date(until).getTime(), windowEnd.getTime())) : windowEnd;
  if (end < start) return [];
  const occurrences: string[] = [];
  const cursor = new Date(start);
  while (cursor <= end && occurrences.length < 1000) {
    occurrences.push(cursor.toISOString());
    if (recurrence === 'daily') cursor.setDate(cursor.getDate() + 1);
    else if (recurrence === 'weekly') cursor.setDate(cursor.getDate() + 7);
    else if (recurrence === 'monthly') cursor.setMonth(cursor.getMonth() + 1);
    else break;
  }
  return occurrences;
}

export function analyticsFromRecords(records: {
  studySessions: Array<{ duration_minutes: number; subject_id: number | null; started_at: string }>;
  tasks: Array<{ status: string; priority: string }>;
  habits: Array<{ id: number }>;
  habitEntries: Array<{ completed: number }>;
}) {
  const subjectMinutes = new Map<string, number>();
  for (const session of records.studySessions) {
    const key = session.subject_id ? String(session.subject_id) : 'Unassigned';
    subjectMinutes.set(key, (subjectMinutes.get(key) || 0) + session.duration_minutes);
  }
  return {
    totalStudyMinutes: records.studySessions.reduce((sum, item) => sum + item.duration_minutes, 0),
    completedTasks: records.tasks.filter(task => task.status === 'completed').length,
    openTasks: records.tasks.filter(task => task.status !== 'completed').length,
    habitCompletionRate: records.habitEntries.length
      ? Math.round(records.habitEntries.filter(item => item.completed === 1).length / records.habitEntries.length * 100)
      : 0,
    subjectMinutes: [...subjectMinutes.entries()].map(([name, minutes]) => ({ name, minutes })),
  };
}
