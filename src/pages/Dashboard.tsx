import React, { useMemo } from 'react';
import { useRows } from '../hooks/useRows';
import { Stat, Empty, Loading, PageHeading, ErrorBanner } from '../components/ui';
import { format, isAfter, isBefore, startOfWeek, endOfWeek, isToday } from 'date-fns';
import { calculateSyllabusCompletion } from '../shared/business';

interface Programme {
  id: string | number;
  name: string;
  code?: string;
  status?: string;
  description?: string;
}

interface Subject {
  id: string | number;
  semester_id?: string | number;
  name: string;
  code?: string;
  credits?: number;
  color?: string;
}

interface Unit {
  id: string | number;
  subject_id: string | number;
  name?: string;
  title?: string;
  unit_number?: number;
  order_index?: number;
}

interface Topic {
  id: string | number;
  unit_id: string | number;
  title: string;
  completed?: number | boolean;
  notes?: string;
  order_index?: number;
}

interface Task {
  id: string | number;
  subject_id?: string | number;
  title: string;
  due_at?: string;
  status?: string;
  priority?: 'low' | 'medium' | 'high' | 'urgent' | string;
  description?: string;
}

interface StudySession {
  id: string | number;
  subject_id?: string | number;
  title?: string;
  duration_minutes: number;
  created_at?: string;
  date?: string;
  notes?: string;
}

interface Habit {
  id: string | number;
  name?: string;
  title?: string;
  archived?: number | boolean;
}

interface HabitEntry {
  id: string | number;
  habit_id: string | number;
  date?: string;
  completed?: number | boolean;
}

interface TimetableSession {
  id: string | number;
  subject_id?: string | number;
  day_of_week: number;
  start_time: string;
  end_time?: string;
  room?: string;
  activity_type?: string;
  title?: string;
}

interface CalendarEvent {
  id: string | number;
  title: string;
  start_at: string;
  end_at?: string;
  location?: string;
  all_day?: number | boolean;
  description?: string;
}

interface ScheduleItem {
  id: string;
  type: 'timetable' | 'event';
  timeSortKey: string;
  timeDisplay: string;
  title: string;
  subtitle?: string;
  badge: string;
  badgeColor: string;
}

function safeParseDate(val: unknown): Date | null {
  if (!val) return null;
  if (val instanceof Date) return isNaN(val.getTime()) ? null : val;
  try {
    const d = new Date(val as string | number);
    return isNaN(d.getTime()) ? null : d;
  } catch {
    return null;
  }
}

function getTopicCompletion(relevantTopics: Topic[]): number {
  if (!relevantTopics || relevantTopics.length === 0) return 0;
  try {
    const res = calculateSyllabusCompletion(relevantTopics as any);
    if (typeof res === 'number') return Math.max(0, Math.min(100, Math.round(res)));
    if (res && typeof (res as any).percentage === 'number') {
      return Math.max(0, Math.min(100, Math.round((res as any).percentage)));
    }
  } catch {
    // fallback to manual calculation
  }
  const completed = relevantTopics.filter((t) => Number(t.completed) === 1 || t.completed === true).length;
  return Math.max(0, Math.min(100, Math.round((completed / relevantTopics.length) * 100)));
}

export default function Dashboard(): JSX.Element {
  const { rows: programmes = [], loading: progLoading, error: progError } = useRows<Programme>('programmes');
  const { rows: subjects = [], loading: subjLoading, error: subjError } = useRows<Subject>('subjects');
  const { rows: units = [] } = useRows<Unit>('units');
  const { rows: topics = [] } = useRows<Topic>('topics');
  const { rows: tasks = [], loading: tasksLoading, error: tasksError } = useRows<Task>('tasks');
  const { rows: studySessions = [], loading: sessionsLoading, error: sessionsError } = useRows<StudySession>('study_sessions');
  const { rows: habits = [] } = useRows<Habit>('habits');
  const { rows: habitEntries = [] } = useRows<HabitEntry>('habit_entries');
  const { rows: timetableSessions = [] } = useRows<TimetableSession>('timetable_sessions');
  const { rows: calendarEvents = [] } = useRows<CalendarEvent>('calendar_events');

  const now = useMemo(() => new Date(), []);
  const todayStr = useMemo(() => format(now, 'yyyy-MM-dd'), [now]);

  const subjectsMap = useMemo(() => {
    const map = new Map<string, Subject>();
    subjects.forEach((s) => map.set(String(s.id), s));
    return map;
  }, [subjects]);

  // Top Row Stats (4 columns)
  // 1. Active programmes (count from programmes where status = 'active')
  const activeProgrammesCount = useMemo(() => {
    return programmes.filter((p) => p.status === 'active').length;
  }, [programmes]);

  // 2. Total subjects (count)
  const totalSubjectsCount = subjects.length;

  // 3. Open tasks (count where status !== 'completed')
  const openTasks = useMemo(() => {
    return tasks.filter((t) => t.status !== 'completed');
  }, [tasks]);

  // 4. Study time (total duration_minutes from study_sessions, display as hours e.g. '12.5 hrs')
  const studyTimeHoursStr = useMemo(() => {
    const totalMinutes = studySessions.reduce((acc, s) => acc + (Number(s.duration_minutes) || 0), 0);
    const hours = (totalMinutes / 60).toFixed(1);
    return `${hours} hrs`;
  }, [studySessions]);

  // Second Row Stats (4 columns)
  // 1. Upcoming assignments (tasks with due_at in the future)
  const upcomingAssignmentsCount = useMemo(() => {
    return tasks.filter((t) => {
      if (!t.due_at) return false;
      const d = safeParseDate(t.due_at);
      return d ? isAfter(d, now) : false;
    }).length;
  }, [tasks, now]);

  // 2. Overdue tasks (tasks with due_at in the past and status !== 'completed') - accent='warning'
  const overdueTasksCount = useMemo(() => {
    return tasks.filter((t) => {
      if (!t.due_at || t.status === 'completed') return false;
      const d = safeParseDate(t.due_at);
      return d ? isBefore(d, now) : false;
    }).length;
  }, [tasks, now]);

  // 3. Habit completion today (% of habits that have an entry for today marked completed)
  const habitCompletionTodayStr = useMemo(() => {
    const activeHabits = habits.filter((h) => !h.archived);
    const habitPool = activeHabits.length > 0 ? activeHabits : habits;
    if (habitPool.length === 0) return '0%';

    const completedCount = habitPool.filter((h) => {
      return habitEntries.some((e) => {
        const matchesHabit = String(e.habit_id) === String(h.id);
        const entryDate = e.date ? e.date.substring(0, 10) : '';
        const isEntryToday = entryDate === todayStr;
        const isCompleted = Number(e.completed) === 1 || e.completed === true;
        return matchesHabit && isEntryToday && isCompleted;
      });
    }).length;

    const rate = Math.round((completedCount / habitPool.length) * 100);
    return `${rate}%`;
  }, [habits, habitEntries, todayStr]);

  // 4. Calendar events this week
  const eventsThisWeekCount = useMemo(() => {
    const weekStart = startOfWeek(now, { weekStartsOn: 1 });
    const weekEnd = endOfWeek(now, { weekStartsOn: 1 });
    return calendarEvents.filter((e) => {
      const d = safeParseDate(e.start_at);
      return d ? d >= weekStart && d <= weekEnd : false;
    }).length;
  }, [calendarEvents, now]);

  // 3. Today's Schedule section (panel)
  const todaySchedule = useMemo<ScheduleItem[]>(() => {
    const items: ScheduleItem[] = [];
    const todayDayOfWeek = now.getDay();

    // Timetable sessions for today's day_of_week
    timetableSessions
      .filter((s) => Number(s.day_of_week) === todayDayOfWeek)
      .forEach((s) => {
        const subj = s.subject_id ? subjectsMap.get(String(s.subject_id)) : undefined;
        const title = subj ? `${subj.name}${subj.code ? ` (${subj.code})` : ''}` : s.title || 'Class Session';
        const subDetails = [s.activity_type, s.room ? `Room ${s.room}` : null].filter(Boolean).join(' • ');

        items.push({
          id: `tt-${s.id}`,
          type: 'timetable',
          timeSortKey: s.start_time || '00:00',
          timeDisplay: s.end_time ? `${s.start_time} - ${s.end_time}` : s.start_time,
          title,
          subtitle: subDetails || undefined,
          badge: 'Class',
          badgeColor: '#6366f1',
        });
      });

    // Calendar events where start_at is today
    calendarEvents
      .filter((e) => {
        const d = safeParseDate(e.start_at);
        return d ? isToday(d) : false;
      })
      .forEach((e) => {
        const d = safeParseDate(e.start_at)!;
        const timeSortKey = format(d, 'HH:mm');
        const timeDisplay = e.all_day ? 'All Day' : format(d, 'h:mm a');

        items.push({
          id: `cal-${e.id}`,
          type: 'event',
          timeSortKey: e.all_day ? '00:00' : timeSortKey,
          timeDisplay,
          title: e.title,
          subtitle: e.location ? `Location: ${e.location}` : undefined,
          badge: 'Event',
          badgeColor: '#10b981',
        });
      });

    return items.sort((a, b) => a.timeSortKey.localeCompare(b.timeSortKey));
  }, [timetableSessions, calendarEvents, now, subjectsMap]);

  // 4. Upcoming Tasks panel (up to 8 open tasks sorted by due_at)
  const upcomingTasks = useMemo(() => {
    return tasks
      .filter((t) => t.status !== 'completed')
      .sort((a, b) => {
        if (!a.due_at) return 1;
        if (!b.due_at) return -1;
        return new Date(a.due_at).getTime() - new Date(b.due_at).getTime();
      })
      .slice(0, 8);
  }, [tasks]);

  // 5. Upcoming Calendar Events panel (up to 8 future events)
  const upcomingEvents = useMemo(() => {
    return calendarEvents
      .filter((e) => {
        const d = safeParseDate(e.start_at);
        return d ? d >= now : false;
      })
      .sort((a, b) => {
        return new Date(a.start_at).getTime() - new Date(b.start_at).getTime();
      })
      .slice(0, 8);
  }, [calendarEvents, now]);

  // 6. Subject Progress panel (traverse: subject -> units -> topics)
  const subjectProgressList = useMemo(() => {
    return subjects.map((subj) => {
      const subjUnits = units.filter((u) => String(u.subject_id) === String(subj.id));
      const unitIds = new Set(subjUnits.map((u) => String(u.id)));
      const subjTopics = topics.filter((t) => unitIds.has(String(t.unit_id)));
      const totalTopics = subjTopics.length;
      const completedTopics = subjTopics.filter((t) => Number(t.completed) === 1 || t.completed === true).length;
      const percentage = getTopicCompletion(subjTopics);

      return {
        subject: subj,
        totalTopics,
        completedTopics,
        percentage,
      };
    });
  }, [subjects, units, topics]);

  // 7. Recent Activity panel (last 5 study sessions)
  const recentStudySessions = useMemo(() => {
    return studySessions
      .slice()
      .sort((a, b) => {
        const dateA = safeParseDate(a.created_at || a.date)?.getTime() || 0;
        const dateB = safeParseDate(b.created_at || b.date)?.getTime() || 0;
        return dateB - dateA;
      })
      .slice(0, 5);
  }, [studySessions]);

  const hasLoading = progLoading || subjLoading || tasksLoading || sessionsLoading;
  const primaryError = progError || subjError || tasksError || sessionsError;

  if (hasLoading && programmes.length === 0 && subjects.length === 0) {
    return <Loading />;
  }

  return (
    <div className="page-container" style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '24px' }}>
      <PageHeading title="Academic Dashboard" subtitle="Overview of your programmes, subjects, tasks, and daily schedule" />

      {primaryError && <ErrorBanner error={primaryError} />}

      {/* Row 1 Stats Grid (4 columns) */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px' }}>
        <Stat label="Active Programmes" value={activeProgrammesCount} />
        <Stat label="Total Subjects" value={totalSubjectsCount} />
        <Stat label="Open Tasks" value={openTasks.length} />
        <Stat label="Study Time" value={studyTimeHoursStr} />
      </div>

      {/* Row 2 Stats Grid (4 columns) */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px' }}>
        <Stat label="Upcoming Assignments" value={upcomingAssignmentsCount} />
        <Stat label="Overdue Tasks" value={overdueTasksCount} accent="warning" />
        <Stat label="Habit Completion Today" value={habitCompletionTodayStr} />
        <Stat label="Calendar Events This Week" value={eventsThisWeekCount} />
      </div>

      {/* Main Panels Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(420px, 1fr))', gap: '20px' }}>
        {/* Panel 3: Today's Schedule */}
        <div
          style={{
            background: '#0d1324',
            border: '1px solid rgba(255, 255, 255, 0.08)',
            borderRadius: '10px',
            padding: '20px',
            display: 'flex',
            flexDirection: 'column',
            gap: '16px',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 600, color: '#e5e7eb' }}>Today&apos;s Schedule</h3>
            <span style={{ fontSize: '0.8rem', color: '#7f8aa3', background: '#101626', padding: '4px 10px', borderRadius: '12px' }}>
              {format(now, 'EEEE, MMM d')}
            </span>
          </div>

          {todaySchedule.length === 0 ? (
            <Empty message="No classes or events scheduled for today" />
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {todaySchedule.map((item) => (
                <div
                  key={item.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '12px 14px',
                    borderRadius: '8px',
                    background: '#101626',
                    border: '1px solid rgba(255, 255, 255, 0.05)',
                  }}
                >
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{ fontWeight: 600, color: '#f3f4f6', fontSize: '0.95rem' }}>{item.title}</span>
                      <span
                        style={{
                          fontSize: '0.72rem',
                          padding: '2px 8px',
                          borderRadius: '6px',
                          color: item.badgeColor,
                          background: `${item.badgeColor}22`,
                          fontWeight: 500,
                        }}
                      >
                        {item.badge}
                      </span>
                    </div>
                    {item.subtitle && <span style={{ fontSize: '0.8rem', color: '#7f8aa3' }}>{item.subtitle}</span>}
                  </div>
                  <div style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                    <span style={{ fontSize: '0.85rem', fontWeight: 600, color: '#c7d2fe' }}>{item.timeDisplay}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Panel 4: Upcoming Tasks */}
        <div
          style={{
            background: '#0d1324',
            border: '1px solid rgba(255, 255, 255, 0.08)',
            borderRadius: '10px',
            padding: '20px',
            display: 'flex',
            flexDirection: 'column',
            gap: '16px',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 600, color: '#e5e7eb' }}>Upcoming Tasks</h3>
            <span style={{ fontSize: '0.8rem', color: '#7f8aa3' }}>{upcomingTasks.length} open</span>
          </div>

          {upcomingTasks.length === 0 ? (
            <Empty message="No pending tasks found" />
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {upcomingTasks.map((t) => {
                const dueDate = safeParseDate(t.due_at);
                const isTaskOverdue = dueDate && isBefore(dueDate, now);
                const priorityColor =
                  t.priority === 'urgent'
                    ? '#ef4444'
                    : t.priority === 'high'
                    ? '#f97316'
                    : t.priority === 'medium'
                    ? '#6366f1'
                    : '#7f8aa3';

                return (
                  <div
                    key={t.id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '10px 14px',
                      borderRadius: '8px',
                      background: '#101626',
                      border: '1px solid rgba(255, 255, 255, 0.05)',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <span
                        title={`Priority: ${t.priority || 'normal'}`}
                        style={{
                          width: '8px',
                          height: '8px',
                          borderRadius: '50%',
                          background: priorityColor,
                          flexShrink: 0,
                        }}
                      />
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                        <span style={{ fontSize: '0.92rem', color: '#f3f4f6', fontWeight: 500 }}>{t.title}</span>
                        {dueDate && (
                          <span
                            style={{
                              fontSize: '0.78rem',
                              color: isTaskOverdue ? '#f87171' : '#7f8aa3',
                            }}
                          >
                            Due: {format(dueDate, 'MMM d, yyyy')}
                            {isTaskOverdue && ' (Overdue)'}
                          </span>
                        )}
                      </div>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span
                        style={{
                          fontSize: '0.75rem',
                          padding: '3px 8px',
                          borderRadius: '4px',
                          background: 'rgba(255, 255, 255, 0.06)',
                          color: '#9ca3af',
                          textTransform: 'capitalize',
                        }}
                      >
                        {t.status || 'open'}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Panel 5: Upcoming Calendar Events */}
        <div
          style={{
            background: '#0d1324',
            border: '1px solid rgba(255, 255, 255, 0.08)',
            borderRadius: '10px',
            padding: '20px',
            display: 'flex',
            flexDirection: 'column',
            gap: '16px',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 600, color: '#e5e7eb' }}>Upcoming Calendar Events</h3>
            <span style={{ fontSize: '0.8rem', color: '#7f8aa3' }}>{upcomingEvents.length} events</span>
          </div>

          {upcomingEvents.length === 0 ? (
            <Empty message="No upcoming events found" />
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {upcomingEvents.map((e) => {
                const startDate = safeParseDate(e.start_at);
                const dateChip = startDate ? format(startDate, 'MMM d') : '';
                const timeText = startDate ? (e.all_day ? 'All day' : format(startDate, 'h:mm a')) : '';

                return (
                  <div
                    key={e.id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '10px 14px',
                      borderRadius: '8px',
                      background: '#101626',
                      border: '1px solid rgba(255, 255, 255, 0.05)',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                      <div
                        style={{
                          background: '#1e293b',
                          color: '#818cf8',
                          padding: '6px 10px',
                          borderRadius: '6px',
                          fontWeight: 600,
                          fontSize: '0.78rem',
                          textAlign: 'center',
                          minWidth: '55px',
                        }}
                      >
                        {dateChip}
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                        <span style={{ fontSize: '0.92rem', color: '#f3f4f6', fontWeight: 500 }}>{e.title}</span>
                        {e.location && <span style={{ fontSize: '0.78rem', color: '#7f8aa3' }}>{e.location}</span>}
                      </div>
                    </div>
                    <span style={{ fontSize: '0.82rem', color: '#9ca3af', fontWeight: 500 }}>{timeText}</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Panel 6: Subject Progress */}
        <div
          style={{
            background: '#0d1324',
            border: '1px solid rgba(255, 255, 255, 0.08)',
            borderRadius: '10px',
            padding: '20px',
            display: 'flex',
            flexDirection: 'column',
            gap: '16px',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 600, color: '#e5e7eb' }}>Subject Syllabus Progress</h3>
            <span style={{ fontSize: '0.8rem', color: '#7f8aa3' }}>{subjectProgressList.length} subjects</span>
          </div>

          {subjectProgressList.length === 0 ? (
            <Empty message="No subjects enrolled" />
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              {subjectProgressList.map(({ subject, totalTopics, completedTopics, percentage }) => (
                <div key={subject.id} style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.88rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{ fontWeight: 600, color: '#f3f4f6' }}>{subject.name}</span>
                      {subject.code && <span style={{ fontSize: '0.78rem', color: '#7f8aa3' }}>({subject.code})</span>}
                    </div>
                    <span style={{ fontWeight: 600, color: '#818cf8', fontSize: '0.85rem' }}>
                      {percentage}%{' '}
                      <span style={{ fontSize: '0.75rem', color: '#7f8aa3', fontWeight: 400 }}>
                        ({completedTopics}/{totalTopics} topics)
                      </span>
                    </span>
                  </div>
                  <div
                    style={{
                      height: '8px',
                      width: '100%',
                      background: '#1e293b',
                      borderRadius: '4px',
                      overflow: 'hidden',
                    }}
                  >
                    <div
                      style={{
                        height: '100%',
                        width: `${percentage}%`,
                        background: percentage === 100 ? '#10b981' : '#6366f1',
                        borderRadius: '4px',
                        transition: 'width 0.3s ease',
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Panel 7: Recent Activity Panel (Last 5 study sessions) */}
      <div
        style={{
          background: '#0d1324',
          border: '1px solid rgba(255, 255, 255, 0.08)',
          borderRadius: '10px',
          padding: '20px',
          display: 'flex',
          flexDirection: 'column',
          gap: '16px',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 600, color: '#e5e7eb' }}>Recent Study Activity</h3>
          <span style={{ fontSize: '0.8rem', color: '#7f8aa3' }}>Last 5 sessions</span>
        </div>

        {recentStudySessions.length === 0 ? (
          <Empty message="No recent study sessions recorded" />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {recentStudySessions.map((session) => {
              const sessionDate = safeParseDate(session.created_at || session.date);
              const subj = session.subject_id ? subjectsMap.get(String(session.subject_id)) : undefined;
              const title = session.title || (subj ? `Study: ${subj.name}` : 'Study Session');
              const dateText = sessionDate ? format(sessionDate, 'MMM d, yyyy · p') : 'Unknown date';

              return (
                <div
                  key={session.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '12px 14px',
                    borderRadius: '8px',
                    background: '#101626',
                    border: '1px solid rgba(255, 255, 255, 0.05)',
                  }}
                >
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                    <span style={{ fontWeight: 500, color: '#f3f4f6', fontSize: '0.92rem' }}>{title}</span>
                    <span style={{ fontSize: '0.78rem', color: '#7f8aa3' }}>{dateText}</span>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <span
                      style={{
                        fontSize: '0.82rem',
                        fontWeight: 600,
                        color: '#a5b4fc',
                        background: 'rgba(99, 102, 241, 0.12)',
                        padding: '4px 10px',
                        borderRadius: '6px',
                      }}
                    >
                      {session.duration_minutes} mins
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
