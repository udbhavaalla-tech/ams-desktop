import { useState, useMemo } from 'react';
import { useRows } from '../hooks/useRows';
import { Stat, Empty, Loading, PageHeading, ErrorBanner, SuccessBanner, SubNav } from '../components/ui';
import { format, startOfWeek, endOfWeek, subDays, isAfter, isBefore, parseISO } from 'date-fns';
import { analyticsFromRecords, calculateSyllabusCompletion, calculateHabitStreak, formatDate } from '../shared/business';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis, PieChart, Pie, Cell, LineChart, Line } from 'recharts';

interface StudySessionRow {
  id: number;
  subject_id: number | null;
  task_id: number | null;
  title: string;
  started_at: string;
  ended_at: string | null;
  duration_minutes: number;
  elapsed_seconds: number;
  notes: string | null;
  created_at: string;
}

interface TaskRow {
  id: number;
  title: string;
  description: string | null;
  subject_id: number | null;
  due_at: string | null;
  priority: 'low' | 'medium' | 'high';
  status: 'pending' | 'in_progress' | 'completed';
  estimated_minutes: number;
  created_at: string;
}

interface SubjectRow {
  id: number;
  semester_id: number;
  name: string;
  code: string | null;
  credits: number;
  color: string;
  description: string | null;
}

interface UnitRow {
  id: number;
  subject_id: number;
  name: string;
  description: string | null;
  order_index: number;
}

interface TopicRow {
  id: number;
  unit_id: number;
  name: string;
  completed: number;
  notes: string | null;
  order_index: number;
}

interface HabitRow {
  id: number;
  name: string;
  description: string | null;
  frequency: string;
  target: number;
  color: string;
  active: number;
}

interface HabitEntryRow {
  id: number;
  habit_id: number;
  entry_date: string;
  completed: number;
  count: number;
  notes: string | null;
}

interface TimetableSessionRow {
  id: number;
  title: string;
  subject_id: number | null;
  day_of_week: number;
  start_time: string;
  end_time: string;
  location: string | null;
  recurrence: string;
  active: number;
}

const TABS = [
  { key: 'all', label: 'All Analytics' },
  { key: 'study', label: 'Study Activity' },
  { key: 'academics', label: 'Academics & Tasks' },
  { key: 'habits', label: 'Habit Consistency' },
];

function safeParseDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  try {
    const normalized = value.includes(' ') ? value.replace(' ', 'T') : value;
    const parsed = parseISO(normalized);
    return isNaN(parsed.getTime()) ? null : parsed;
  } catch {
    return null;
  }
}

export default function Analytics() {
  const [activeTab, setActiveTab] = useState('all');
  const [dailyViewMode, setDailyViewMode] = useState<'bar' | 'line'>('bar');

  // Load database tables
  const sessionsQuery = useRows('study_sessions');
  const tasksQuery = useRows('tasks');
  const subjectsQuery = useRows('subjects');
  const unitsQuery = useRows('units');
  const topicsQuery = useRows('topics');
  const habitsQuery = useRows('habits');
  const habitEntriesQuery = useRows('habit_entries');
  const timetableSessionsQuery = useRows('timetable_sessions');

  const isLoading =
    sessionsQuery.loading ||
    tasksQuery.loading ||
    subjectsQuery.loading ||
    unitsQuery.loading ||
    topicsQuery.loading ||
    habitsQuery.loading ||
    habitEntriesQuery.loading ||
    timetableSessionsQuery.loading;

  const errorMessage =
    sessionsQuery.error ||
    tasksQuery.error ||
    subjectsQuery.error ||
    unitsQuery.error ||
    topicsQuery.error ||
    habitsQuery.error ||
    habitEntriesQuery.error ||
    timetableSessionsQuery.error;

  const sessions = (sessionsQuery.rows as StudySessionRow[]) || [];
  const tasks = (tasksQuery.rows as TaskRow[]) || [];
  const subjects = (subjectsQuery.rows as SubjectRow[]) || [];
  const units = (unitsQuery.rows as UnitRow[]) || [];
  const topics = (topicsQuery.rows as TopicRow[]) || [];
  const habits = (habitsQuery.rows as HabitRow[]) || [];
  const habitEntries = (habitEntriesQuery.rows as HabitEntryRow[]) || [];
  const timetableSessions = (timetableSessionsQuery.rows as TimetableSessionRow[]) || [];

  // Summary analytics from business logic
  const analyticsSummary = useMemo(() => {
    return analyticsFromRecords({
      studySessions: sessions.map(s => ({
        duration_minutes: Number(s.duration_minutes) || 0,
        subject_id: s.subject_id,
        started_at: s.started_at,
      })),
      tasks: tasks.map(t => ({
        status: t.status,
        priority: t.priority,
      })),
      habits: habits.map(h => ({ id: h.id })),
      habitEntries: habitEntries.map(e => ({ completed: e.completed })),
    });
  }, [sessions, tasks, habits, habitEntries]);

  // 1. Overview stats calculations
  const overviewStats = useMemo(() => {
    const totalMinutes = sessions.reduce((sum, s) => sum + (Number(s.duration_minutes) || 0), 0);
    const totalHours = (totalMinutes / 60).toFixed(1);

    const completedTasksCount = tasks.filter(t => t.status === 'completed').length;

    const now = new Date();
    const overdueTasksCount = tasks.filter(t => {
      if (t.status === 'completed' || !t.due_at) return false;
      const due = safeParseDate(t.due_at);
      return due ? isBefore(due, now) : false;
    }).length;

    const totalHabitEntries = habitEntries.length;
    const completedHabitEntries = habitEntries.filter(e => e.completed === 1).length;
    const habitRate = totalHabitEntries > 0 ? Math.round((completedHabitEntries / totalHabitEntries) * 100) : 0;

    return {
      totalHours,
      completedTasksCount,
      overdueTasksCount,
      habitRate,
    };
  }, [sessions, tasks, habitEntries]);

  // 2. Study time by subject
  const studyTimeBySubject = useMemo(() => {
    const subjectMap = new Map<number, string>(subjects.map(s => [s.id, s.name]));
    const minutesMap = new Map<string, number>();

    for (const sub of subjects) {
      minutesMap.set(sub.name, 0);
    }

    let unassignedMinutes = 0;
    for (const session of sessions) {
      const minutes = Number(session.duration_minutes) || 0;
      if (session.subject_id && subjectMap.has(session.subject_id)) {
        const name = subjectMap.get(session.subject_id)!;
        minutesMap.set(name, (minutesMap.get(name) || 0) + minutes);
      } else {
        unassignedMinutes += minutes;
      }
    }

    if (unassignedMinutes > 0) {
      minutesMap.set('Unassigned', unassignedMinutes);
    }

    const data = Array.from(minutesMap.entries()).map(([name, minutes]) => ({
      name,
      minutes,
    }));

    // If any subject has minutes, prioritize non-zero subjects for readability
    const hasAnyMinutes = data.some(d => d.minutes > 0);
    if (hasAnyMinutes) {
      return data.filter(d => d.minutes > 0);
    }
    return data;
  }, [subjects, sessions]);

  // 3. Daily study activity (last 14 days)
  const dailyStudyActivity = useMemo(() => {
    const today = new Date();
    const days: { date: string; rawDate: string; minutes: number }[] = [];

    for (let i = 13; i >= 0; i--) {
      const d = subDays(today, i);
      const dateKey = formatDate(d);
      const label = format(d, 'MMM d');
      days.push({
        date: label,
        rawDate: dateKey,
        minutes: 0,
      });
    }

    const dayMap = new Map<string, number>();
    for (const item of days) {
      dayMap.set(item.rawDate, 0);
    }

    for (const session of sessions) {
      const sDate = safeParseDate(session.started_at);
      if (sDate) {
        const key = formatDate(sDate);
        if (dayMap.has(key)) {
          dayMap.set(key, (dayMap.get(key) || 0) + (Number(session.duration_minutes) || 0));
        }
      }
    }

    return days.map(d => ({
      date: d.date,
      minutes: dayMap.get(d.rawDate) || 0,
    }));
  }, [sessions]);

  // 4. Weekly study activity (last 8 weeks)
  const weeklyStudyActivity = useMemo(() => {
    const today = new Date();
    const weeks: { week: string; start: Date; end: Date; minutes: number }[] = [];

    for (let i = 7; i >= 0; i--) {
      const targetDate = subDays(today, i * 7);
      const wStart = startOfWeek(targetDate, { weekStartsOn: 1 });
      const wEnd = endOfWeek(targetDate, { weekStartsOn: 1 });
      const label = `Week of ${format(wStart, 'MMM d')}`;
      weeks.push({
        week: label,
        start: wStart,
        end: wEnd,
        minutes: 0,
      });
    }

    for (const week of weeks) {
      let mins = 0;
      for (const session of sessions) {
        const sDate = safeParseDate(session.started_at);
        if (sDate) {
          const isCurrentOrAfterStart = isAfter(sDate, week.start) || sDate.getTime() === week.start.getTime();
          const isCurrentOrBeforeEnd = isBefore(sDate, week.end) || sDate.getTime() === week.end.getTime();
          if (isCurrentOrAfterStart && isCurrentOrBeforeEnd) {
            mins += Number(session.duration_minutes) || 0;
          }
        }
      }
      week.minutes = mins;
    }

    return weeks.map(w => ({
      week: w.week,
      minutes: w.minutes,
    }));
  }, [sessions]);

  // 5. Syllabus completion section
  const syllabusCompletionData = useMemo(() => {
    return subjects.map(subject => {
      const subjectUnits = units.filter(u => u.subject_id === subject.id);
      const unitIds = new Set(subjectUnits.map(u => u.id));
      const subjectTopics = topics.filter(t => unitIds.has(t.unit_id));
      const percentage = calculateSyllabusCompletion(subjectTopics);
      const completedCount = subjectTopics.filter(t => t.completed === 1).length;
      return {
        id: subject.id,
        name: subject.name,
        code: subject.code,
        color: subject.color || '#6366f1',
        totalTopics: subjectTopics.length,
        completedTopics: completedCount,
        percentage,
      };
    });
  }, [subjects, units, topics]);

  // 6. Task completion breakdown
  const taskBreakdown = useMemo(() => {
    const pendingCount = tasks.filter(t => t.status === 'pending').length;
    const inProgressCount = tasks.filter(t => t.status === 'in_progress').length;
    const completedCount = tasks.filter(t => t.status === 'completed').length;
    const totalCount = tasks.length;

    const chartData = [
      { status: 'Pending', count: pendingCount, fill: '#f59e0b' },
      { status: 'In Progress', count: inProgressCount, fill: '#6366f1' },
      { status: 'Completed', count: completedCount, fill: '#10b981' },
    ];

    return {
      pendingCount,
      inProgressCount,
      completedCount,
      totalCount,
      chartData,
    };
  }, [tasks]);

  // 7. Habit consistency
  const habitConsistencyData = useMemo(() => {
    const activeHabits = habits.filter(h => h.active !== 0);
    return activeHabits.map(habit => {
      const entriesForHabit = habitEntries.filter(e => e.habit_id === habit.id);
      const currentStreak = calculateHabitStreak(
        entriesForHabit.map(e => ({ entry_date: e.entry_date, completed: e.completed }))
      );
      const completedEntries = entriesForHabit.filter(e => e.completed === 1).length;
      const totalEntries = entriesForHabit.length;
      const completionRate = totalEntries > 0 ? Math.round((completedEntries / totalEntries) * 100) : 0;

      return {
        id: habit.id,
        name: habit.name,
        frequency: habit.frequency,
        target: habit.target,
        color: habit.color || '#10b981',
        currentStreak,
        completionRate,
        completedEntries,
        totalEntries,
      };
    });
  }, [habits, habitEntries]);

  // 8. Planned vs Completed sessions
  const plannedVsCompleted = useMemo(() => {
    const plannedCount = timetableSessions.filter(ts => ts.active !== 0).length;
    const now = new Date();
    const currentWeekStart = startOfWeek(now, { weekStartsOn: 1 });
    const currentWeekEnd = endOfWeek(now, { weekStartsOn: 1 });

    const completedThisWeek = sessions.filter(session => {
      const sDate = safeParseDate(session.started_at);
      if (!sDate) return false;
      const isCurrentOrAfterStart = isAfter(sDate, currentWeekStart) || sDate.getTime() === currentWeekStart.getTime();
      const isCurrentOrBeforeEnd = isBefore(sDate, currentWeekEnd) || sDate.getTime() === currentWeekEnd.getTime();
      return isCurrentOrAfterStart && isCurrentOrBeforeEnd;
    }).length;

    const completionRate = plannedCount > 0 ? Math.round((completedThisWeek / plannedCount) * 100) : 0;

    return {
      plannedCount,
      completedThisWeek,
      completionRate,
    };
  }, [timetableSessions, sessions]);

  if (isLoading) {
    return <Loading text="Loading analytics and performance metrics..." />;
  }

  const showStudy = activeTab === 'all' || activeTab === 'study';
  const showAcademics = activeTab === 'all' || activeTab === 'academics';
  const showHabits = activeTab === 'all' || activeTab === 'habits';

  return (
    <div>
      <PageHeading
        title="Analytics & Insights"
        subtitle="Comprehensive performance analysis from local academic records"
      />

      {errorMessage && <ErrorBanner message={errorMessage} />}

      <SubNav tabs={TABS} active={activeTab} onChange={setActiveTab} />

      {/* 1. Overview Stats Cards */}
      <div className="stats-grid">
        <Stat
          label="Total study hours"
          value={overviewStats.totalHours}
          suffix="h"
        />
        <Stat
          label="Completed tasks"
          value={overviewStats.completedTasksCount}
        />
        <Stat
          label="Overdue tasks"
          value={overviewStats.overdueTasksCount}
          accent="warning"
        />
        <Stat
          label="Habit completion rate"
          value={overviewStats.habitRate}
          suffix="%"
        />
      </div>

      {/* 8. Planned vs Completed Sessions Comparison Card */}
      {showStudy && (
        <section className="panel" style={{ padding: '18px 20px', marginBottom: '18px' }}>
          <div className="panel-heading" style={{ margin: '-18px -20px 14px', padding: '0 20px' }}>
            <h3>Planned vs Completed Sessions</h3>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '14px', alignItems: 'center' }}>
            <div className="stat-card" style={{ background: '#0c1222' }}>
              <span>Planned sessions (Timetable)</span>
              <strong>{plannedVsCompleted.plannedCount}</strong>
            </div>
            <div className="stat-card" style={{ background: '#0c1222' }}>
              <span>Completed sessions (This week)</span>
              <strong>{plannedVsCompleted.completedThisWeek}</strong>
            </div>
            <div style={{ padding: '10px 14px', border: '1px solid #202940', borderRadius: '10px', background: '#0e1526' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', marginBottom: '8px' }}>
                <span style={{ color: '#8e99b1' }}>Weekly Session Goal</span>
                <strong style={{ color: '#6366f1' }}>{plannedVsCompleted.completionRate}%</strong>
              </div>
              <div className="progress" style={{ height: '8px', background: '#1c263b', borderRadius: '4px' }}>
                <i
                  style={{
                    width: `${Math.min(100, plannedVsCompleted.completionRate)}%`,
                    background: plannedVsCompleted.completionRate >= 100 ? '#10b981' : '#6366f1',
                    borderRadius: '4px',
                  }}
                />
              </div>
              <p style={{ margin: '8px 0 0', fontSize: '11px', color: '#7f8aa3' }}>
                {plannedVsCompleted.plannedCount === 0
                  ? 'No recurring timetable sessions scheduled.'
                  : `${plannedVsCompleted.completedThisWeek} of ${plannedVsCompleted.plannedCount} planned sessions finished this week.`}
              </p>
            </div>
          </div>
        </section>
      )}

      {/* 2. Study Time by Subject */}
      {showStudy && (
        <section className="panel chart-panel" style={{ marginBottom: '18px', padding: '18px 20px' }}>
          <div className="panel-heading" style={{ margin: '-18px -20px 16px', padding: '0 20px' }}>
            <h3>Study Time by Subject (Minutes)</h3>
          </div>
          {studyTimeBySubject.length === 0 ? (
            <Empty text="No study sessions recorded yet to analyze subject breakdown." />
          ) : (
            <ResponsiveContainer width="100%" height={320}>
              <BarChart data={studyTimeBySubject} margin={{ top: 10, right: 15, left: -5, bottom: 25 }}>
                <CartesianGrid stroke="#26324d" strokeDasharray="3 3" />
                <XAxis
                  dataKey="name"
                  stroke="#94a3b8"
                  tick={{ fill: '#94a3b8', fontSize: 11 }}
                  interval={0}
                  angle={-15}
                  textAnchor="end"
                />
                <YAxis
                  stroke="#94a3b8"
                  tick={{ fill: '#94a3b8', fontSize: 11 }}
                  unit="m"
                />
                <Tooltip
                  contentStyle={{
                    background: '#111827',
                    border: '1px solid #26324d',
                    borderRadius: '8px',
                    color: '#e5e7eb',
                  }}
                  formatter={(value: number) => [`${value} minutes`, 'Time Studied']}
                />
                <Bar dataKey="minutes" fill="#6366f1" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </section>
      )}

      {/* 3 & 4. Daily and Weekly Study Activity */}
      {showStudy && (
        <div className="dashboard-grid" style={{ marginBottom: '18px' }}>
          {/* 3. Daily Study Activity */}
          <section className="panel chart-panel" style={{ padding: '18px 20px' }}>
            <div className="panel-heading" style={{ margin: '-18px -20px 16px', padding: '0 20px' }}>
              <h3>Daily Study Activity (Last 14 Days)</h3>
              <div style={{ display: 'flex', gap: '4px' }}>
                <button
                  type="button"
                  className={dailyViewMode === 'bar' ? 'primary' : 'ghost'}
                  style={{ padding: '4px 8px', fontSize: '11px' }}
                  onClick={() => setDailyViewMode('bar')}
                >
                  Bar
                </button>
                <button
                  type="button"
                  className={dailyViewMode === 'line' ? 'primary' : 'ghost'}
                  style={{ padding: '4px 8px', fontSize: '11px' }}
                  onClick={() => setDailyViewMode('line')}
                >
                  Trend
                </button>
              </div>
            </div>
            {dailyStudyActivity.every(d => d.minutes === 0) ? (
              <Empty compact text="No study sessions logged in the last 14 days." />
            ) : dailyViewMode === 'bar' ? (
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={dailyStudyActivity} margin={{ top: 10, right: 10, left: -10, bottom: 20 }}>
                  <CartesianGrid stroke="#26324d" strokeDasharray="3 3" />
                  <XAxis
                    dataKey="date"
                    stroke="#94a3b8"
                    tick={{ fill: '#94a3b8', fontSize: 10 }}
                    interval={1}
                  />
                  <YAxis
                    stroke="#94a3b8"
                    tick={{ fill: '#94a3b8', fontSize: 10 }}
                    unit="m"
                  />
                  <Tooltip
                    contentStyle={{
                      background: '#111827',
                      border: '1px solid #26324d',
                      borderRadius: '8px',
                      color: '#e5e7eb',
                    }}
                    formatter={(value: number) => [`${value} min`, 'Studied']}
                  />
                  <Bar dataKey="minutes" fill="#6366f1" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <ResponsiveContainer width="100%" height={260}>
                <LineChart data={dailyStudyActivity} margin={{ top: 10, right: 10, left: -10, bottom: 20 }}>
                  <CartesianGrid stroke="#26324d" strokeDasharray="3 3" />
                  <XAxis
                    dataKey="date"
                    stroke="#94a3b8"
                    tick={{ fill: '#94a3b8', fontSize: 10 }}
                    interval={1}
                  />
                  <YAxis
                    stroke="#94a3b8"
                    tick={{ fill: '#94a3b8', fontSize: 10 }}
                    unit="m"
                  />
                  <Tooltip
                    contentStyle={{
                      background: '#111827',
                      border: '1px solid #26324d',
                      borderRadius: '8px',
                      color: '#e5e7eb',
                    }}
                    formatter={(value: number) => [`${value} min`, 'Studied']}
                  />
                  <Line
                    type="monotone"
                    dataKey="minutes"
                    stroke="#818cf8"
                    strokeWidth={2}
                    dot={{ fill: '#6366f1', r: 3 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            )}
          </section>

          {/* 4. Weekly Study Activity */}
          <section className="panel chart-panel" style={{ padding: '18px 20px' }}>
            <div className="panel-heading" style={{ margin: '-18px -20px 16px', padding: '0 20px' }}>
              <h3>Weekly Study Activity (Last 8 Weeks)</h3>
            </div>
            {weeklyStudyActivity.every(w => w.minutes === 0) ? (
              <Empty compact text="No study sessions recorded across the last 8 weeks." />
            ) : (
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={weeklyStudyActivity} margin={{ top: 10, right: 10, left: -10, bottom: 20 }}>
                  <CartesianGrid stroke="#26324d" strokeDasharray="3 3" />
                  <XAxis
                    dataKey="week"
                    stroke="#94a3b8"
                    tick={{ fill: '#94a3b8', fontSize: 10 }}
                    angle={-15}
                    textAnchor="end"
                  />
                  <YAxis
                    stroke="#94a3b8"
                    tick={{ fill: '#94a3b8', fontSize: 10 }}
                    unit="m"
                  />
                  <Tooltip
                    contentStyle={{
                      background: '#111827',
                      border: '1px solid #26324d',
                      borderRadius: '8px',
                      color: '#e5e7eb',
                    }}
                    formatter={(value: number) => [`${value} min`, 'Total Time']}
                  />
                  <Bar dataKey="minutes" fill="#818cf8" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </section>
        </div>
      )}

      {/* 5. Syllabus Completion Section */}
      {showAcademics && (
        <section className="panel" style={{ padding: '18px 20px', marginBottom: '18px' }}>
          <div className="panel-heading" style={{ margin: '-18px -20px 16px', padding: '0 20px' }}>
            <h3>Syllabus Completion</h3>
            <span style={{ fontSize: '12px', color: '#7f8aa3' }}>
              Derived from Units & Topics progress
            </span>
          </div>

          {syllabusCompletionData.length === 0 ? (
            <Empty text="No subjects created yet. Add subjects, units, and topics in Academics to track syllabus completion." />
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              {syllabusCompletionData.map(subject => (
                <div
                  key={subject.id}
                  style={{
                    padding: '12px 14px',
                    borderRadius: '8px',
                    border: '1px solid #1c263b',
                    background: '#0d1324',
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      marginBottom: '8px',
                    }}
                  >
                    <div>
                      <strong style={{ fontSize: '13px', color: '#f8fafc' }}>{subject.name}</strong>
                      {subject.code && (
                        <span style={{ marginLeft: '8px', fontSize: '11px', color: '#7f8aa3' }}>
                          [{subject.code}]
                        </span>
                      )}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                      <span style={{ fontSize: '11px', color: '#8e99b1' }}>
                        {subject.completedTopics} of {subject.totalTopics} topics completed
                      </span>
                      <strong style={{ fontSize: '13px', color: subject.color, minWidth: '40px', textAlign: 'right' }}>
                        {subject.percentage}%
                      </strong>
                    </div>
                  </div>
                  <div className="progress" style={{ height: '7px', background: '#1c263b', borderRadius: '4px' }}>
                    <i
                      style={{
                        width: `${subject.percentage}%`,
                        background: subject.color,
                        borderRadius: '4px',
                        transition: 'width 0.3s ease',
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {/* 6. Task Completion Breakdown */}
      {showAcademics && (
        <section className="panel" style={{ padding: '18px 20px', marginBottom: '18px' }}>
          <div className="panel-heading" style={{ margin: '-18px -20px 16px', padding: '0 20px' }}>
            <h3>Task Completion Breakdown</h3>
            <span style={{ fontSize: '12px', color: '#7f8aa3' }}>Total: {taskBreakdown.totalCount} tasks</span>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px', marginBottom: '16px' }}>
            <div className="stat-card" style={{ background: '#0e1526' }}>
              <span>Pending</span>
              <strong style={{ color: '#f59e0b' }}>{taskBreakdown.pendingCount}</strong>
            </div>
            <div className="stat-card" style={{ background: '#0e1526' }}>
              <span>In Progress</span>
              <strong style={{ color: '#6366f1' }}>{taskBreakdown.inProgressCount}</strong>
            </div>
            <div className="stat-card" style={{ background: '#0e1526' }}>
              <span>Completed</span>
              <strong style={{ color: '#10b981' }}>{taskBreakdown.completedCount}</strong>
            </div>
          </div>

          {taskBreakdown.totalCount === 0 ? (
            <Empty compact text="No tasks created yet to generate completion distribution." />
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.2fr) minmax(0, 0.8fr)', gap: '16px', alignItems: 'center' }}>
              <ResponsiveContainer width="100%" height={160}>
                <BarChart data={taskBreakdown.chartData} layout="vertical" margin={{ top: 5, right: 25, left: 20, bottom: 5 }}>
                  <CartesianGrid stroke="#26324d" strokeDasharray="3 3" />
                  <XAxis type="number" stroke="#94a3b8" tick={{ fill: '#94a3b8', fontSize: 10 }} allowDecimals={false} />
                  <YAxis dataKey="status" type="category" stroke="#94a3b8" tick={{ fill: '#94a3b8', fontSize: 11 }} />
                  <Tooltip
                    contentStyle={{
                      background: '#111827',
                      border: '1px solid #26324d',
                      borderRadius: '8px',
                      color: '#e5e7eb',
                    }}
                  />
                  <Bar dataKey="count" radius={[0, 4, 4, 0]}>
                    {taskBreakdown.chartData.map((entry, index) => (
                      <Cell key={`task-bar-${index}`} fill={entry.fill} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>

              <div style={{ height: 160 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={taskBreakdown.chartData}
                      dataKey="count"
                      nameKey="status"
                      cx="50%"
                      cy="50%"
                      innerRadius={36}
                      outerRadius={62}
                      paddingAngle={4}
                    >
                      {taskBreakdown.chartData.map((entry, index) => (
                        <Cell key={`task-pie-${index}`} fill={entry.fill} />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={{
                        background: '#111827',
                        border: '1px solid #26324d',
                        borderRadius: '8px',
                        color: '#e5e7eb',
                      }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}
        </section>
      )}

      {/* 7. Habit Consistency */}
      {showHabits && (
        <section className="panel" style={{ padding: '18px 20px', marginBottom: '18px' }}>
          <div className="panel-heading" style={{ margin: '-18px -20px 16px', padding: '0 20px' }}>
            <h3>Habit Consistency</h3>
            <span style={{ fontSize: '12px', color: '#7f8aa3' }}>
              Active habits with streak and overall completion
            </span>
          </div>

          {habitConsistencyData.length === 0 ? (
            <Empty text="No active habits found. Create and track habits in the Habit Tracker page." />
          ) : (
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
                gap: '14px',
              }}
            >
              {habitConsistencyData.map(habit => (
                <div
                  key={habit.id}
                  style={{
                    border: '1px solid #202940',
                    borderRadius: '10px',
                    background: '#0d1324',
                    padding: '16px',
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      marginBottom: '10px',
                    }}
                  >
                    <strong style={{ fontSize: '14px', color: '#f8fafc' }}>{habit.name}</strong>
                    <span className="badge" style={{ background: '#1c263b', color: '#cbd5e1' }}>
                      {habit.frequency}
                    </span>
                  </div>

                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'flex-end',
                      marginTop: '12px',
                    }}
                  >
                    <div>
                      <span style={{ fontSize: '11px', color: '#7f8aa3', display: 'block' }}>Current Streak</span>
                      <strong style={{ fontSize: '20px', color: '#f8fafc' }}>
                        🔥 {habit.currentStreak}{' '}
                        <small style={{ fontSize: '11px', fontWeight: 400, color: '#7f8aa3' }}>
                          {habit.currentStreak === 1 ? 'day' : 'days'}
                        </small>
                      </strong>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <span style={{ fontSize: '11px', color: '#7f8aa3', display: 'block' }}>Completion Rate</span>
                      <strong style={{ fontSize: '20px', color: habit.color }}>{habit.completionRate}%</strong>
                    </div>
                  </div>

                  <div className="progress" style={{ height: '6px', marginTop: '10px', background: '#1c263b' }}>
                    <i
                      style={{
                        width: `${habit.completionRate}%`,
                        background: habit.color,
                        borderRadius: '3px',
                      }}
                    />
                  </div>

                  <div
                    style={{
                      fontSize: '11px',
                      color: '#7f8aa3',
                      marginTop: '8px',
                      display: 'flex',
                      justifyContent: 'space-between',
                    }}
                  >
                    <span>Target: {habit.target} / {habit.frequency}</span>
                    <span>
                      {habit.completedEntries} / {habit.totalEntries} entries
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      )}
    </div>
  );
}
