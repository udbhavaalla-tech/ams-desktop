import React, { useState, useMemo } from 'react';
import { useRows } from '../hooks/useRows';
import { Empty, Loading, PageHeading, ErrorBanner, SegmentedControl, Stat } from '../components/ui';
import { Crud, type Field } from '../components/Crud';
import {
  format,
  addDays,
  addMonths,
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  isSameMonth,
  isSameDay,
  startOfDay,
  endOfDay,
  isAfter,
  isBefore,
  addWeeks,
} from 'date-fns';
import { detectOverlap } from '../shared/business';

interface TimetableSession {
  id: number | string;
  title: string;
  subject_id?: number | string | null;
  day_of_week: number | string;
  start_time: string;
  end_time: string;
  location?: string;
  recurrence?: 'weekly' | 'daily' | 'none';
  active?: number | boolean;
  created_at?: string;
  updated_at?: string;
}

interface AvailabilityBlock {
  id: number | string;
  day_of_week: number | string;
  start_time: string;
  end_time: string;
  label?: string;
  available?: number | boolean;
}

interface Subject {
  id: number | string;
  name: string;
  code?: string;
  color?: string;
}

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function calculateHours(startTime: string, endTime: string): number {
  if (!startTime || !endTime) return 0;
  const [sh, sm] = startTime.split(':').map(Number);
  const [eh, em] = endTime.split(':').map(Number);
  if (isNaN(sh) || isNaN(sm) || isNaN(eh) || isNaN(em)) return 0;
  const minutes = eh * 60 + (em || 0) - (sh * 60 + (sm || 0));
  return minutes > 0 ? minutes / 60 : 0;
}

export default function Timetable(): JSX.Element {
  const [managerTab, setManagerTab] = useState<'sessions' | 'availability'>('sessions');
  const [showManager, setShowManager] = useState<boolean>(true);

  // Load database rows
  const {
    rows: sessions = [],
    loading: loadingSessions,
    error: errorSessions,
    reload: reloadSessions,
  } = useRows('timetable_sessions', 'day_of_week ASC, start_time ASC');

  const {
    rows: availabilities = [],
    loading: loadingAvailabilities,
    error: errorAvailabilities,
    reload: reloadAvailabilities,
  } = useRows('availability', 'day_of_week ASC, start_time ASC');

  const {
    rows: subjects = [],
  } = useRows('subjects');

  // Map subjects for quick lookup
  const subjectMap = useMemo(() => {
    const map = new Map<string | number, Subject>();
    subjects.forEach((s: Subject) => map.set(s.id, s));
    return map;
  }, [subjects]);

  // Overlap detection
  // 1. Check all sessions against each other
  // 2. Check sessions against unavailable times
  const { conflicts, conflictingSessionIds } = useMemo(() => {
    const foundConflicts: string[] = [];
    const conflictIds = new Set<string | number>();

    const activeSessions: TimetableSession[] = sessions.filter(
      (s: TimetableSession) => s.active === undefined || Boolean(s.active)
    );

    // Pairwise session overlap detection
    for (let i = 0; i < activeSessions.length; i++) {
      for (let j = i + 1; j < activeSessions.length; j++) {
        const s1 = activeSessions[i];
        const s2 = activeSessions[j];
        const d1 = Number(s1.day_of_week);
        const d2 = Number(s2.day_of_week);

        if (d1 === d2) {
          const overlaps = detectOverlap(
            { day: String(d1), start: s1.start_time, end: s1.end_time },
            [{ day: String(d2), start: s2.start_time, end: s2.end_time }],
          );

          if (overlaps) {
            conflictIds.add(s1.id);
            conflictIds.add(s2.id);
            foundConflicts.push(
              `"${s1.title}" and "${s2.title}" overlap on ${DAY_NAMES[d1]} (${s1.start_time}–${s1.end_time} vs ${s2.start_time}–${s2.end_time})`
            );
          }
        }
      }
    }

    // Sessions vs Unavailable times detection
    const unavailableBlocks: AvailabilityBlock[] = availabilities.filter(
      (a: AvailabilityBlock) => a.available === 0 || a.available === false
    );

    for (const session of activeSessions) {
      const sDay = Number(session.day_of_week);
      for (const unavail of unavailableBlocks) {
        const uDay = Number(unavail.day_of_week);
        if (sDay === uDay) {
          const overlaps = detectOverlap(
            { day: String(sDay), start: session.start_time, end: session.end_time },
            [{ day: String(uDay), start: unavail.start_time, end: unavail.end_time }],
          );

          if (overlaps) {
            conflictIds.add(session.id);
            foundConflicts.push(
              `"${session.title}" (${session.start_time}–${session.end_time}) conflicts with unavailable block "${unavail.label || 'Unavailable'}" (${unavail.start_time}–${unavail.end_time}) on ${DAY_NAMES[sDay]}`
            );
          }
        }
      }
    }

    return {
      conflicts: foundConflicts,
      conflictingSessionIds: conflictIds,
    };
  }, [sessions, availabilities]);

  // Summary statistics
  const activeSessions = useMemo(() => {
    return sessions.filter((s: TimetableSession) => s.active === undefined || Boolean(s.active));
  }, [sessions]);

  const totalSessionsCount = activeSessions.length;

  const totalScheduledHours = useMemo(() => {
    return activeSessions.reduce((acc: number, s: TimetableSession) => {
      return acc + calculateHours(s.start_time, s.end_time);
    }, 0);
  }, [activeSessions]);

  // Timetable Sessions CRUD fields
  const sessionFields = useMemo<Field[]>(() => {
    return [
      { name: 'title', label: 'Title', type: 'text', required: true },
      {
        name: 'subject_id',
        label: 'Subject',
        type: 'select',
        options: [
          { value: '', label: 'None' },
          ...subjects.map((s: Subject) => ({
            value: s.id,
            label: s.code ? `${s.code} - ${s.name}` : s.name,
          })),
        ],
      },
      {
        name: 'day_of_week',
        label: 'Day of Week',
        type: 'select',
        required: true,
        options: DAY_NAMES.map((label, index) => ({ value: index, label: `${label} (${index})` })),
      },
      { name: 'start_time', label: 'Start Time', type: 'time', required: true },
      { name: 'end_time', label: 'End Time', type: 'time', required: true },
      { name: 'location', label: 'Location', type: 'text' },
      {
        name: 'recurrence',
        label: 'Recurrence',
        type: 'select',
        options: [
          { value: 'weekly', label: 'Weekly' },
          { value: 'daily', label: 'Daily' },
          { value: 'none', label: 'None (One-off)' },
        ],
      },
      { name: 'active', label: 'Active', type: 'checkbox' },
    ];
  }, [subjects]);

  // Availability CRUD fields
  const availabilityFields = useMemo<Field[]>(() => {
    return [
      {
        name: 'day_of_week',
        label: 'Day of Week',
        type: 'select',
        required: true,
        options: DAY_NAMES.map((label, index) => ({ value: index, label: `${label} (${index})` })),
      },
      { name: 'start_time', label: 'Start Time', type: 'time', required: true },
      { name: 'end_time', label: 'End Time', type: 'time', required: true },
      { name: 'label', label: 'Label', type: 'text' },
      { name: 'available', label: 'Available', type: 'checkbox' },
    ];
  }, []);

  const isLoading = loadingSessions || loadingAvailabilities;
  const anyError = errorSessions || errorAvailabilities;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
      <PageHeading title="Timetable" subtitle="Weekly schedule, availability, and conflict detection">
        <button
          className={showManager ? 'primary' : 'ghost'}
          onClick={() => setShowManager((prev) => !prev)}
        >
          {showManager ? 'Hide Editor' : '⚙ Manage Schedule'}
        </button>
      </PageHeading>

      {/* 5. Summary stats at top */}
      <div className="stats-grid" style={{ gridTemplateColumns: 'repeat(3, minmax(0, 1fr))' }}>
        <Stat label="Total sessions this week" value={totalSessionsCount} />
        <Stat label="Total hours scheduled" value={totalScheduledHours.toFixed(1)} suffix="hrs" />
        <Stat
          label="Conflicts found"
          value={conflicts.length}
          accent={conflicts.length > 0 ? 'warning' : undefined}
        />
      </div>

      {/* 2. Overlap detection warnings in error banner */}
      {anyError && <ErrorBanner message={anyError} />}
      {conflicts.length > 0 && (
        <ErrorBanner
          message={`⚠️ Overlap Warnings (${conflicts.length}): ${conflicts.join(' • ')}`}
        />
      )}

      {isLoading ? (
        <Loading text="Loading weekly schedule..." />
      ) : (
        <>
          {/* 1. Weekly timetable grid (7 columns: Sunday to Saturday) */}
          <div className="timetable-grid">
            {DAY_NAMES.map((dayName, dayIndex) => {
              // Sessions for that day sorted by start_time
              const daySessions = sessions
                .filter((s: TimetableSession) => Number(s.day_of_week) === dayIndex)
                .sort((a: TimetableSession, b: TimetableSession) =>
                  (a.start_time || '').localeCompare(b.start_time || '')
                );

              // Availability blocks for that day sorted by start_time
              const dayAvailabilities = availabilities
                .filter((a: AvailabilityBlock) => Number(a.day_of_week) === dayIndex)
                .sort((a: AvailabilityBlock, b: AvailabilityBlock) =>
                  (a.start_time || '').localeCompare(b.start_time || '')
                );

              return (
                <div key={dayName} className="timetable-day">
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      borderBottom: '1px solid #202940',
                      paddingBottom: '6px',
                      marginBottom: '8px',
                    }}
                  >
                    <h3 style={{ margin: 0, fontSize: '12px', fontWeight: 700, color: '#f3f4f6' }}>
                      {dayName}
                    </h3>
                    <span style={{ fontSize: '10px', color: '#7f8aa3' }}>
                      {daySessions.length}
                    </span>
                  </div>

                  {/* 4. Availability blocks with styling: green for available, red for unavailable */}
                  {dayAvailabilities.length > 0 && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginBottom: '8px' }}>
                      {dayAvailabilities.map((block: AvailabilityBlock) => {
                        const isAvail = block.available === undefined || Boolean(block.available);
                        return (
                          <div
                            key={`avail-${block.id}`}
                            title={`${isAvail ? 'Available' : 'Unavailable'}: ${block.label || ''}`}
                            style={{
                              padding: '4px 6px',
                              borderRadius: '4px',
                              fontSize: '9px',
                              borderLeft: isAvail ? '3px solid #10b981' : '3px solid #ef4444',
                              backgroundColor: isAvail ? 'rgba(16, 185, 129, 0.12)' : 'rgba(239, 68, 68, 0.14)',
                              color: isAvail ? '#6ee7b7' : '#fca5a5',
                              display: 'flex',
                              justifyContent: 'space-between',
                              alignItems: 'center',
                            }}
                          >
                            <span style={{ fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {isAvail ? '✓' : '✗'} {block.label || (isAvail ? 'Available' : 'Unavailable')}
                            </span>
                            <span style={{ fontSize: '8px', opacity: 0.85, marginLeft: '4px', whiteSpace: 'nowrap' }}>
                              {block.start_time}–{block.end_time}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* Sessions list */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    {daySessions.length === 0 && dayAvailabilities.length === 0 ? (
                      <div style={{ textAlign: 'center', color: '#4c566d', fontSize: '11px', marginTop: '16px' }}>
                        No sessions
                      </div>
                    ) : (
                      daySessions.map((session: TimetableSession) => {
                        const subject = session.subject_id ? subjectMap.get(session.subject_id) : undefined;
                        const hasConflict = conflictingSessionIds.has(session.id);
                        const isInactive = session.active === 0 || session.active === false;

                        return (
                          <div
                            key={session.id}
                            className="timetable-card"
                            style={{
                              borderLeftColor: hasConflict ? '#ef4444' : (subject?.color || '#6366f1'),
                              opacity: isInactive ? 0.5 : 1,
                              backgroundColor: hasConflict ? '#261620' : '#1b2337',
                              border: hasConflict ? '1px solid #ef4444' : undefined,
                              borderLeftWidth: '3px',
                              position: 'relative',
                            }}
                          >
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '4px' }}>
                              <strong style={{ color: hasConflict ? '#fca5a5' : '#f8fafc', fontSize: '11px' }}>
                                {session.title}
                              </strong>
                              {hasConflict && (
                                <span title="Overlap Conflict" style={{ fontSize: '10px', color: '#ef4444' }}>
                                  ⚠️
                                </span>
                              )}
                            </div>

                            <span>
                              🕒 {session.start_time} – {session.end_time}
                            </span>

                            {session.location && (
                              <small>
                                📍 {session.location}
                              </small>
                            )}

                            {subject && (
                              <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginTop: '2px' }}>
                                <span
                                  style={{
                                    display: 'inline-block',
                                    width: '6px',
                                    height: '6px',
                                    borderRadius: '50%',
                                    backgroundColor: subject.color || '#6366f1',
                                  }}
                                />
                                <small style={{ color: '#c7d2fe', fontSize: '9px' }}>
                                  {subject.name}
                                </small>
                              </div>
                            )}

                            {session.recurrence && session.recurrence !== 'weekly' && (
                              <small style={{ color: '#7f8aa3', fontStyle: 'italic', fontSize: '8px' }}>
                                ({session.recurrence})
                              </small>
                            )}
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* 3 & 4. Timetable Sessions and Availability CRUD managers */}
          {showManager && (
            <div className="panel" style={{ padding: '16px' }}>
              <div className="subnav" style={{ marginBottom: '16px' }}>
                <button
                  className={managerTab === 'sessions' ? 'active' : ''}
                  onClick={() => setManagerTab('sessions')}
                >
                  Timetable Sessions ({sessions.length})
                </button>
                <button
                  className={managerTab === 'availability' ? 'active' : ''}
                  onClick={() => setManagerTab('availability')}
                >
                  Availability Blocks ({availabilities.length})
                </button>
              </div>

              {managerTab === 'sessions' && (
                <Crud
                  title="Timetable Sessions"
                  entity="timetable_sessions"
                  orderBy="day_of_week ASC, start_time ASC"
                  fields={sessionFields}
                />
              )}

              {managerTab === 'availability' && (
                <Crud
                  title="Availability"
                  entity="availability"
                  orderBy="day_of_week ASC, start_time ASC"
                  fields={availabilityFields}
                />
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
