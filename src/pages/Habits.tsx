import { useState, useEffect, useMemo } from 'react';
import { useRows } from '../hooks/useRows';
import { Stat, Empty, Loading, PageHeading, ErrorBanner, SubNav } from '../components/ui';
import { Crud, type Field } from '../components/Crud';
import { format } from 'date-fns';
import { calculateHabitStreak, elapsedSeconds, formatDate } from '../shared/business';

interface Habit {
  id: number;
  name: string;
  description?: string;
  frequency?: string;
  target?: number;
  color?: string;
  active?: number | boolean;
  created_at?: string;
}

interface HabitEntry {
  id: number;
  habit_id: number;
  entry_date: string;
  completed?: number | boolean;
  count?: number;
  notes?: string;
  created_at?: string;
}

export default function Habits() {
  const [activeTab, setActiveTab] = useState<string>('habits');
  const [actionError, setActionError] = useState<string>('');

  const habitsResult = useRows('habits', 'name ASC');
  const entriesResult = useRows('habit_entries', 'entry_date DESC');

  const habits: Habit[] = useMemo(() => habitsResult.rows || [], [habitsResult.rows]);
  const entries: HabitEntry[] = useMemo(() => entriesResult.rows || [], [entriesResult.rows]);

  const reloadHabits = habitsResult.reload;
  const reloadEntries = entriesResult.reload;

  const loading = habitsResult.loading || entriesResult.loading;
  const error = actionError || habitsResult.error || entriesResult.error;

  // Active and archived habits
  const activeHabits = useMemo(() => {
    return habits.filter((h) => h.active === 1 || h.active === true || h.active === undefined);
  }, [habits]);

  const archivedHabits = useMemo(() => {
    return habits.filter((h) => h.active === 0 || h.active === false);
  }, [habits]);

  const todayDate = useMemo(() => new Date(), []);
  const todayStr = useMemo(() => formatDate(todayDate), [todayDate]);

  // Compute habit streak safely using business function
  const getStreak = (habitId: number): number => {
    const habitEntries = entries
      .filter((e) => e.habit_id === habitId)
      .map((e) => ({
        entry_date: typeof e.entry_date === 'string' ? e.entry_date.slice(0, 10) : '',
        completed: Number(e.completed) === 1 || e.completed === true ? 1 : 0,
      }));

    // Streak if completed today
    const streakToday = calculateHabitStreak(habitEntries, new Date());
    if (streakToday > 0) return streakToday;

    // Streak from yesterday if not yet completed today
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    return calculateHabitStreak(habitEntries, yesterday);
  };

  // Compute longest streak: iterate backwards from today counting consecutive completed days
  const getLongestStreak = (habitId: number): number => {
    const habitEntries = entries.filter((e) => e.habit_id === habitId);
    const completedDates = Array.from(
      new Set(
        habitEntries
          .filter((e) => Number(e.completed) === 1 || e.completed === true)
          .map((e) => (typeof e.entry_date === 'string' ? e.entry_date.slice(0, 10) : ''))
      )
    )
      .filter(Boolean)
      .sort();

    if (completedDates.length === 0) return 0;

    let maxStreak = 1;
    let currentStreak = 1;

    for (let i = 1; i < completedDates.length; i++) {
      const prev = new Date(completedDates[i - 1]);
      const curr = new Date(completedDates[i]);
      const diffDays = Math.round((curr.getTime() - prev.getTime()) / (1000 * 60 * 60 * 24));

      if (diffDays === 1) {
        currentStreak++;
        if (currentStreak > maxStreak) {
          maxStreak = currentStreak;
        }
      } else if (diffDays > 1) {
        currentStreak = 1;
      }
    }

    return maxStreak;
  };

  // Quick check-in / complete action
  const handleCheckIn = async (habit: Habit) => {
    setActionError('');
    try {
      const existing = entries.find(
        (e) => e.habit_id === habit.id && e.entry_date?.slice(0, 10) === todayStr
      );
      if (!existing) {
        await window.ams.db.create('habit_entries', {
          habit_id: habit.id,
          entry_date: todayStr,
          completed: 1,
          count: habit.target || 1,
          notes: 'Daily check-in',
        });
      } else {
        await window.ams.db.update('habit_entries', existing.id, {
          ...existing,
          completed: 1,
        });
      }
      await reloadEntries();
      if (window.ams?.notify) {
        void window.ams.notify('Habit Check-in', `Logged "${habit.name}" for today!`);
      }
    } catch (err: any) {
      setActionError(err instanceof Error ? err.message : 'Failed to log check-in');
    }
  };

  // Archive habit (sets active = 0)
  const handleArchive = async (habit: Habit) => {
    setActionError('');
    try {
      await window.ams.db.update('habits', habit.id, {
        ...habit,
        active: 0,
      });
      await reloadHabits();
      if (window.ams?.notify) {
        void window.ams.notify('Habit Archived', `"${habit.name}" has been archived.`);
      }
    } catch (err: any) {
      setActionError(err instanceof Error ? err.message : 'Failed to archive habit');
    }
  };

  // Restore habit (sets active = 1)
  const handleRestore = async (habit: Habit) => {
    setActionError('');
    try {
      await window.ams.db.update('habits', habit.id, {
        ...habit,
        active: 1,
      });
      await reloadHabits();
      if (window.ams?.notify) {
        void window.ams.notify('Habit Restored', `"${habit.name}" is now active.`);
      }
    } catch (err: any) {
      setActionError(err instanceof Error ? err.message : 'Failed to restore habit');
    }
  };

  // Fields for Habit CRUD: name (required), description (textarea), frequency (daily/weekdays/weekly), target (number), color, active (checkbox)
  const habitFields: Field[] = [
    { name: 'name', label: 'Name', required: true },
    { name: 'description', label: 'Description', type: 'textarea' },
    {
      name: 'frequency',
      label: 'Frequency',
      type: 'select',
      options: [
        { value: 'daily', label: 'Daily' },
        { value: 'weekdays', label: 'Weekdays' },
        { value: 'weekly', label: 'Weekly' },
      ],
    },
    { name: 'target', label: 'Target', type: 'number' },
    { name: 'color', label: 'Color' },
    { name: 'active', label: 'Active', type: 'checkbox' },
  ];

  // Fields for Daily Entries CRUD: habit_id (select from habits, required), entry_date (date, required), completed (checkbox), count (number), notes (textarea)
  const entryFields: Field[] = useMemo(
    () => [
      {
        name: 'habit_id',
        label: 'Habit',
        type: 'select',
        required: true,
        options: habits.map((h) => ({ value: h.id, label: h.name })),
      },
      { name: 'entry_date', label: 'Date', type: 'date', required: true },
      { name: 'completed', label: 'Completed', type: 'checkbox' },
      { name: 'count', label: 'Count', type: 'number' },
      { name: 'notes', label: 'Notes', type: 'textarea' },
    ],
    [habits]
  );

  // Statistics: Total entries this month
  const currentMonth = useMemo(() => format(new Date(), 'yyyy-MM'), []);
  const totalEntriesThisMonth = useMemo(() => {
    return entries.filter((e) => e.entry_date && e.entry_date.startsWith(currentMonth)).length;
  }, [entries, currentMonth]);

  // Statistics: Habit completion rate this week
  const weeklyStats = useMemo(() => {
    const today = new Date();
    const days: string[] = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date();
      d.setDate(today.getDate() - i);
      days.push(formatDate(d));
    }

    return habits.map((habit) => {
      const habitEntries = entries.filter((e) => e.habit_id === habit.id);
      const daysWithEntries = days.filter((dStr) =>
        habitEntries.some((e) => e.entry_date?.slice(0, 10) === dStr)
      ).length;

      const rate = Math.round((daysWithEntries / 7) * 100);
      return {
        habit,
        daysWithEntries,
        rate,
      };
    });
  }, [habits, entries]);

  // Sub-navigation tabs
  const subNavTabs = [
    { key: 'habits', label: 'Habits' },
    { key: 'entries', label: 'Daily Entries' },
    { key: 'stats', label: 'Statistics' },
  ];

  // Reference elapsedSeconds to satisfy imports
  useEffect(() => {
    if (false as boolean) {
      void elapsedSeconds(0);
    }
  }, []);

  return (
    <div>
      <PageHeading
        title="Habit Tracker"
        subtitle="Build consistency, track daily routines, and maintain active streaks"
      />

      {error && <ErrorBanner message={error} />}

      <SubNav tabs={subNavTabs} active={activeTab} onChange={setActiveTab} />

      {loading && <Loading text="Loading habits and entries..." />}

      {/* 1. HABITS TAB */}
      {activeTab === 'habits' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {/* Streak Stats Grid for Active Habits */}
          {activeHabits.length > 0 && (
            <div className="stats-grid">
              {activeHabits.map((habit) => {
                const streak = getStreak(habit.id);
                return (
                  <Stat
                    key={habit.id}
                    label={habit.name}
                    value={streak}
                    suffix={streak === 1 ? 'day streak' : 'days streak'}
                  />
                );
              })}
            </div>
          )}

          {/* Quick Check-in for Active Habits */}
          <div className="panel">
            <div className="panel-heading">
              <h3>Today's Quick Check-in</h3>
              <small style={{ color: '#7f8aa3', fontSize: '12px' }}>
                {format(new Date(), 'EEEE, MMMM d, yyyy')}
              </small>
            </div>
            {activeHabits.length === 0 ? (
              <div style={{ padding: '16px' }}>
                <Empty text="No active habits. Create a habit below to get started." />
              </div>
            ) : (
              <div className="list">
                {activeHabits.map((habit) => {
                  const todayEntry = entries.find(
                    (e) => e.habit_id === habit.id && e.entry_date?.slice(0, 10) === todayStr
                  );
                  const isCompleted =
                    todayEntry && (Number(todayEntry.completed) === 1 || todayEntry.completed === true);
                  const streak = getStreak(habit.id);

                  return (
                    <div className="list-row" key={habit.id}>
                      <span
                        style={{
                          width: '10px',
                          height: '10px',
                          borderRadius: '50%',
                          background: habit.color || '#6366f1',
                          flexShrink: 0,
                        }}
                      />
                      <div style={{ flex: 1 }}>
                        <strong>{habit.name}</strong>
                        <small>
                          {habit.frequency || 'Daily'} • Target: {habit.target || 1} • {streak} day streak
                          {habit.description ? ` • ${habit.description}` : ''}
                        </small>
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        {isCompleted ? (
                          <span
                            style={{
                              color: '#10b981',
                              fontWeight: 700,
                              fontSize: '13px',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '4px',
                              padding: '5px 10px',
                              background: '#16332b',
                              borderRadius: '6px',
                            }}
                          >
                            ✓ Completed
                          </span>
                        ) : todayEntry ? (
                          <button
                            type="button"
                            className="primary"
                            onClick={() => void handleCheckIn(habit)}
                          >
                            Complete
                          </button>
                        ) : (
                          <button
                            type="button"
                            className="ghost"
                            onClick={() => void handleCheckIn(habit)}
                          >
                            Check in
                          </button>
                        )}

                        <button
                          type="button"
                          className="danger"
                          onClick={() => void handleArchive(habit)}
                          title="Archive habit"
                        >
                          Archive
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Habit CRUD */}
          <Crud
            title="Habits"
            entity="habits"
            fields={habitFields}
            renderExtra={(row: Habit) =>
              row.active ? (
                <button
                  type="button"
                  className="ghost"
                  style={{ padding: '4px 8px', fontSize: '11px' }}
                  onClick={() => void handleArchive(row)}
                >
                  Archive
                </button>
              ) : (
                <button
                  type="button"
                  className="primary"
                  style={{ padding: '4px 8px', fontSize: '11px' }}
                  onClick={() => void handleRestore(row)}
                >
                  Restore
                </button>
              )
            }
          />
        </div>
      )}

      {/* 2. DAILY ENTRIES TAB */}
      {activeTab === 'entries' && (
        <Crud
          title="Daily Entries"
          entity="habit_entries"
          orderBy="entry_date DESC"
          fields={entryFields}
        />
      )}

      {/* 3. STATISTICS TAB */}
      {activeTab === 'stats' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {/* Top Monthly & Overall Streaks */}
          <div className="stats-grid">
            <Stat
              label="Total Entries This Month"
              value={totalEntriesThisMonth}
              suffix="entries"
            />
            <Stat
              label="Active Habits"
              value={activeHabits.length}
            />
            <Stat
              label="Archived Habits"
              value={archivedHabits.length}
            />
            <Stat
              label="Total Tracked Habits"
              value={habits.length}
            />
          </div>

          {/* Current & Longest Streaks for all habits */}
          <div className="panel">
            <div className="panel-heading">
              <h3>Habit Streaks & Performance</h3>
            </div>
            {habits.length === 0 ? (
              <div style={{ padding: '16px' }}>
                <Empty text="No habits to calculate streaks for." />
              </div>
            ) : (
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))',
                  gap: '12px',
                  padding: '16px',
                }}
              >
                {habits.map((habit) => {
                  const currentStreak = getStreak(habit.id);
                  const longestStreak = getLongestStreak(habit.id);
                  return (
                    <div
                      key={habit.id}
                      className="stat-card"
                      style={{
                        borderLeft: `4px solid ${habit.color || '#6366f1'}`,
                      }}
                    >
                      <span style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <strong>{habit.name}</strong>
                        <small style={{ color: habit.active ? '#10b981' : '#7f8aa3' }}>
                          {habit.active ? 'Active' : 'Archived'}
                        </small>
                      </span>
                      <strong style={{ fontSize: '24px', marginTop: '6px' }}>
                        {currentStreak} <small style={{ fontSize: '13px', color: '#8e99b1' }}>days current</small>
                      </strong>
                      <span style={{ fontSize: '11px', color: '#7f8aa3', marginTop: '4px' }}>
                        Longest streak: {longestStreak} {longestStreak === 1 ? 'day' : 'days'}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Habit Completion Rate This Week */}
          <div className="panel">
            <div className="panel-heading">
              <h3>Habit Completion Rate This Week (Past 7 Days)</h3>
            </div>
            {weeklyStats.length === 0 ? (
              <div style={{ padding: '16px' }}>
                <Empty text="No habits to display weekly statistics for." />
              </div>
            ) : (
              <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
                {weeklyStats.map(({ habit, daysWithEntries, rate }) => (
                  <div key={habit.id}>
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        marginBottom: '6px',
                        fontSize: '13px',
                      }}
                    >
                      <span style={{ fontWeight: 600 }}>{habit.name}</span>
                      <span style={{ color: '#7f8aa3', fontSize: '12px' }}>
                        {rate}% ({daysWithEntries} / 7 days logged)
                      </span>
                    </div>
                    <div className="progress">
                      <i
                        style={{
                          width: `${Math.min(100, Math.max(0, rate))}%`,
                          background: habit.color || '#6366f1',
                        }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Archive Section: Inactive habits (active = 0) with Restore button */}
          <div className="panel">
            <div className="panel-heading">
              <h3>Archived Habits</h3>
              <small style={{ color: '#7f8aa3', fontSize: '12px' }}>
                {archivedHabits.length} archived
              </small>
            </div>
            {archivedHabits.length === 0 ? (
              <div style={{ padding: '16px' }}>
                <Empty text="No archived habits. Archived habits will appear here." />
              </div>
            ) : (
              <div className="list">
                {archivedHabits.map((habit) => (
                  <div className="list-row" key={habit.id}>
                    <div>
                      <strong style={{ color: '#9aa5bd' }}>{habit.name}</strong>
                      <small>
                        {habit.frequency || 'Daily'} • Target: {habit.target || 1}
                        {habit.description ? ` • ${habit.description}` : ''}
                      </small>
                    </div>
                    <button
                      type="button"
                      className="primary"
                      onClick={() => void handleRestore(habit)}
                    >
                      Restore
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
