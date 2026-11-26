import React, { useState, useMemo } from 'react';
import { useRows } from '../hooks/useRows';
import { Empty, Loading, PageHeading, ErrorBanner, SegmentedControl } from '../components/ui';
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
  parseISO,
} from 'date-fns';

interface CalendarEvent {
  id: number | string;
  title: string;
  description?: string;
  event_type: 'event' | 'exam' | 'deadline' | 'holiday' | 'study';
  start_at: string;
  end_at?: string;
  all_day?: number | boolean;
  subject_id?: number | string | null;
  location?: string;
  recurrence?: 'none' | 'daily' | 'weekly' | 'monthly';
  color?: string;
  created_at?: string;
  updated_at?: string;
}

interface Task {
  id: number | string;
  title: string;
  description?: string;
  due_at?: string;
  due_date?: string;
  status?: string;
  subject_id?: number | string | null;
  priority?: string;
}

interface StudySession {
  id: number | string;
  title?: string;
  topic?: string;
  subject_id?: number | string | null;
  start_at?: string;
  end_at?: string;
  date?: string;
  start_time?: string;
  end_time?: string;
  duration_minutes?: number;
  notes?: string;
}

interface Subject {
  id: number | string;
  name: string;
  code?: string;
  color?: string;
}

interface UnifiedItem {
  id: string;
  rawId: number | string;
  title: string;
  displayTitle: string;
  date: Date;
  endDate?: Date;
  allDay: boolean;
  timeLabel: string;
  type: 'calendar' | 'task' | 'study';
  eventType?: string;
  color?: string;
  location?: string;
  description?: string;
  subjectName?: string;
}

const VIEW_MODES = ['month', 'week', 'day', 'agenda'];

function parseDateSafe(dateVal: any): Date | null {
  if (!dateVal) return null;
  if (dateVal instanceof Date) return isNaN(dateVal.getTime()) ? null : dateVal;
  if (typeof dateVal === 'number') {
    const d = new Date(dateVal);
    return isNaN(d.getTime()) ? null : d;
  }
  if (typeof dateVal === 'string') {
    try {
      const normalized = dateVal.replace(' ', 'T');
      const parsed = parseISO(normalized);
      if (!isNaN(parsed.getTime())) return parsed;
    } catch {
      // fallback
    }
    const d = new Date(dateVal);
    return isNaN(d.getTime()) ? null : d;
  }
  return null;
}

export default function Calendar(): JSX.Element {
  const [viewMode, setViewMode] = useState<string>('month');
  const [currentDate, setCurrentDate] = useState<Date>(new Date());
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [showCrud, setShowCrud] = useState<boolean>(false);

  // Cross-module data loading
  const {
    rows: calendarEvents = [],
    loading: loadingEvents,
    error: errorEvents,
    reload: reloadEvents,
  } = useRows('calendar_events');

  const {
    rows: tasks = [],
    loading: loadingTasks,
  } = useRows('tasks');

  const {
    rows: studySessions = [],
    loading: loadingSessions,
  } = useRows('study_sessions');

  const {
    rows: subjects = [],
  } = useRows('subjects');

  // Map subjects for quick lookup
  const subjectMap = useMemo(() => {
    const map = new Map<string | number, Subject>();
    subjects.forEach((s: Subject) => map.set(s.id, s));
    return map;
  }, [subjects]);

  // Combine calendar_events, tasks (where due_at is set), and study_sessions into a unified list
  const unifiedItems = useMemo<UnifiedItem[]>(() => {
    const items: UnifiedItem[] = [];

    // 1. Calendar Events (shown normally)
    calendarEvents.forEach((ev: CalendarEvent) => {
      const parsedStart = parseDateSafe(ev.start_at);
      if (!parsedStart) return;
      const parsedEnd = parseDateSafe(ev.end_at);
      const isAllDay = Boolean(ev.all_day);
      const subject = ev.subject_id ? subjectMap.get(ev.subject_id) : undefined;

      let timeLabel = 'All Day';
      if (!isAllDay) {
        if (parsedEnd) {
          timeLabel = `${format(parsedStart, 'HH:mm')} - ${format(parsedEnd, 'HH:mm')}`;
        } else {
          timeLabel = format(parsedStart, 'HH:mm');
        }
      }

      items.push({
        id: `cal-${ev.id}`,
        rawId: ev.id,
        title: ev.title,
        displayTitle: ev.title,
        date: parsedStart,
        endDate: parsedEnd || undefined,
        allDay: isAllDay,
        timeLabel,
        type: 'calendar',
        eventType: ev.event_type || 'event',
        color: ev.color || subject?.color || '#6366f1',
        location: ev.location,
        description: ev.description,
        subjectName: subject?.name,
      });
    });

    // 2. Tasks with due dates (prefixed with 📋)
    tasks.forEach((t: Task) => {
      const dueStr = t.due_at || t.due_date;
      if (!dueStr) return;
      const parsedDue = parseDateSafe(dueStr);
      if (!parsedDue) return;
      const subject = t.subject_id ? subjectMap.get(t.subject_id) : undefined;
      const hasTime = dueStr.includes('T') || dueStr.includes(':');

      items.push({
        id: `task-${t.id}`,
        rawId: t.id,
        title: t.title,
        displayTitle: `📋 ${t.title}`,
        date: parsedDue,
        allDay: !hasTime,
        timeLabel: hasTime ? `Due ${format(parsedDue, 'HH:mm')}` : 'Due today',
        type: 'task',
        eventType: 'task',
        color: subject?.color || '#f59e0b',
        description: t.description,
        subjectName: subject?.name,
      });
    });

    // 3. Study Sessions (prefixed with 📚)
    studySessions.forEach((s: StudySession) => {
      const dateStr = s.start_at || s.date;
      if (!dateStr) return;
      let parsedStart = parseDateSafe(dateStr);
      if (!parsedStart) return;

      if (s.start_time && !dateStr.includes('T') && !dateStr.includes(':')) {
        const timeParts = s.start_time.split(':');
        if (timeParts.length >= 2) {
          parsedStart = new Date(parsedStart);
          parsedStart.setHours(parseInt(timeParts[0], 10), parseInt(timeParts[1], 10), 0, 0);
        }
      }

      const subject = s.subject_id ? subjectMap.get(s.subject_id) : undefined;
      const title = s.title || s.topic || (subject ? `${subject.name} Study` : 'Study Session');

      let timeLabel = 'Study';
      if (s.start_time && s.end_time) {
        timeLabel = `${s.start_time} - ${s.end_time}`;
      } else if (s.duration_minutes) {
        timeLabel = `${s.duration_minutes}m session`;
      } else {
        timeLabel = format(parsedStart, 'HH:mm');
      }

      items.push({
        id: `study-${s.id}`,
        rawId: s.id,
        title,
        displayTitle: `📚 ${title}`,
        date: parsedStart,
        allDay: false,
        timeLabel,
        type: 'study',
        eventType: 'study',
        color: subject?.color || '#10b981',
        description: s.notes,
        subjectName: subject?.name,
      });
    });

    // Sort chronologically
    return items.sort((a, b) => a.date.getTime() - b.date.getTime());
  }, [calendarEvents, tasks, studySessions, subjectMap]);

  // Navigation handlers
  const handlePrev = () => {
    if (viewMode === 'month') {
      setCurrentDate((prev) => addMonths(prev, -1));
    } else if (viewMode === 'week') {
      setCurrentDate((prev) => addWeeks(prev, -1));
    } else if (viewMode === 'day') {
      const nextDay = addDays(selectedDate, -1);
      setSelectedDate(nextDay);
      setCurrentDate(nextDay);
    } else {
      setCurrentDate((prev) => addDays(prev, -7));
    }
  };

  const handleNext = () => {
    if (viewMode === 'month') {
      setCurrentDate((prev) => addMonths(prev, 1));
    } else if (viewMode === 'week') {
      setCurrentDate((prev) => addWeeks(prev, 1));
    } else if (viewMode === 'day') {
      const nextDay = addDays(selectedDate, 1);
      setSelectedDate(nextDay);
      setCurrentDate(nextDay);
    } else {
      setCurrentDate((prev) => addDays(prev, 7));
    }
  };

  const handleToday = () => {
    const now = new Date();
    setCurrentDate(now);
    setSelectedDate(now);
  };

  // Month heading showing current month and year
  const monthHeadingText = useMemo(() => {
    return format(currentDate, 'MMMM yyyy');
  }, [currentDate]);

  // 42 cells for Month view (6 weeks)
  const monthDays = useMemo(() => {
    const monthStart = startOfMonth(currentDate);
    const gridStart = startOfWeek(monthStart, { weekStartsOn: 0 }); // Sunday
    const days: Date[] = [];
    for (let i = 0; i < 42; i++) {
      days.push(addDays(gridStart, i));
    }
    return days;
  }, [currentDate]);

  // 7 days for Week view
  const weekDays = useMemo(() => {
    const weekStart = startOfWeek(currentDate, { weekStartsOn: 0 });
    return Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  }, [currentDate]);

  // Filter items for Day view
  const dayItems = useMemo(() => {
    return unifiedItems.filter((item) => isSameDay(item.date, selectedDate));
  }, [unifiedItems, selectedDate]);

  // Items for Agenda view (upcoming events from cursor date onward)
  const agendaItems = useMemo(() => {
    const startCursor = startOfDay(currentDate);
    return unifiedItems.filter((item) => !isBefore(startOfDay(item.date), startCursor));
  }, [unifiedItems, currentDate]);

  // Group agenda items by date
  const groupedAgenda = useMemo(() => {
    const groups: { [dateKey: string]: { date: Date; items: UnifiedItem[] } } = {};
    agendaItems.forEach((item) => {
      const key = format(item.date, 'yyyy-MM-dd');
      if (!groups[key]) {
        groups[key] = { date: item.date, items: [] };
      }
      groups[key].items.push(item);
    });
    return Object.values(groups);
  }, [agendaItems]);

  // CRUD Fields for calendar_events
  const crudFields = useMemo<Field[]>(() => {
    return [
      { name: 'title', label: 'Title', type: 'text', required: true },
      { name: 'description', label: 'Description', type: 'textarea' },
      {
        name: 'event_type',
        label: 'Event Type',
        type: 'select',
        required: true,
        options: [
          { label: 'Event', value: 'event' },
          { label: 'Exam', value: 'exam' },
          { label: 'Deadline', value: 'deadline' },
          { label: 'Holiday', value: 'holiday' },
          { label: 'Study', value: 'study' },
        ],
      },
      { name: 'start_at', label: 'Start Time', type: 'datetime-local', required: true },
      { name: 'end_at', label: 'End Time', type: 'datetime-local' },
      { name: 'all_day', label: 'All Day', type: 'checkbox' },
      {
        name: 'subject_id',
        label: 'Subject',
        type: 'select',
        options: [
          { label: 'None', value: '' },
          ...subjects.map((s: Subject) => ({
            label: s.code ? `${s.code} - ${s.name}` : s.name,
            value: s.id,
          })),
        ],
      },
      { name: 'location', label: 'Location', type: 'text' },
      {
        name: 'recurrence',
        label: 'Recurrence',
        type: 'select',
        options: [
          { label: 'None', value: 'none' },
          { label: 'Daily', value: 'daily' },
          { label: 'Weekly', value: 'weekly' },
          { label: 'Monthly', value: 'monthly' },
        ],
      },
      { name: 'color', label: 'Color', type: 'text' },
    ];
  }, [subjects]);

  const isLoading = loadingEvents || loadingTasks || loadingSessions;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
      <PageHeading title="Calendar" subtitle="Schedule, exams, deadlines, and study sessions">
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <SegmentedControl
            options={VIEW_MODES}
            value={viewMode}
            onChange={(v) => setViewMode(v)}
          />
          <button
            className={showCrud ? 'primary' : 'ghost'}
            onClick={() => setShowCrud((prev) => !prev)}
          >
            {showCrud ? 'Hide Event Manager' : '+ Manage Events'}
          </button>
        </div>
      </PageHeading>

      {/* Navigation bar with Month Heading */}
      <div className="calendar-toolbar" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
        <h2 style={{ margin: 0, fontSize: '20px', fontWeight: 700, color: '#f8fafc' }}>
          {viewMode === 'day' ? format(selectedDate, 'EEEE, MMMM d, yyyy') : monthHeadingText}
        </h2>

        <div style={{ display: 'inline-flex', gap: '6px' }}>
          <button className="ghost" onClick={handlePrev} title="Previous">
            ◀ Prev
          </button>
          <button className="ghost" onClick={handleToday} title="Go to today">
            Today
          </button>
          <button className="ghost" onClick={handleNext} title="Next">
            Next ▶
          </button>
        </div>
      </div>

      {errorEvents && <ErrorBanner message={errorEvents} />}

      {/* Event CRUD Section */}
      {showCrud && (
        <div style={{ marginBottom: '16px' }}>
          <Crud
            title="Calendar Events"
            entity="calendar_events"
            fields={crudFields}
            orderBy="start_at ASC"
          />
        </div>
      )}

      {isLoading ? (
        <Loading text="Loading calendar data..." />
      ) : (
        <>
          {/* 1. Month View (42 cells, 6 weeks, Sun-Sat) */}
          {viewMode === 'month' && (
            <div className="month-grid">
              {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => (
                <div key={d} className="weekday">
                  {d}
                </div>
              ))}

              {monthDays.map((day) => {
                const isToday = isSameDay(day, new Date());
                const isCurrentMonthDay = isSameMonth(day, currentDate);
                const dayEvents = unifiedItems.filter((it) => isSameDay(it.date, day));
                const maxDisplay = 3;
                const visibleEvents = dayEvents.slice(0, maxDisplay);
                const remainingCount = dayEvents.length - maxDisplay;

                return (
                  <div
                    key={day.toISOString()}
                    onClick={() => {
                      setSelectedDate(day);
                      setViewMode('day');
                    }}
                    className={`month-day ${isToday ? 'today' : ''} ${!isCurrentMonthDay ? 'muted' : ''}`}
                    style={{
                      cursor: 'pointer',
                      display: 'flex',
                      flexDirection: 'column',
                    }}
                  >
                    <span style={{ fontWeight: 600, fontSize: '11px', marginBottom: '4px' }}>
                      {format(day, 'd')}
                    </span>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '3px', flex: 1, minWidth: 0 }}>
                      {visibleEvents.map((item) => (
                        <div
                          key={item.id}
                          className="calendar-event"
                          title={`${item.displayTitle} (${item.timeLabel})`}
                          style={{
                            borderLeftColor: item.color || '#818cf8',
                            fontSize: '10px',
                            margin: 0,
                          }}
                        >
                          {item.displayTitle}
                        </div>
                      ))}

                      {remainingCount > 0 && (
                        <div style={{ fontSize: '10px', color: '#818cf8', fontWeight: 600, marginTop: '2px' }}>
                          +{remainingCount} more
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* 2. Week View (7 columns, day name + date, events) */}
          {viewMode === 'week' && (
            <div className="week-grid">
              {weekDays.map((day) => {
                const isToday = isSameDay(day, new Date());
                const dayEvents = unifiedItems.filter((it) => isSameDay(it.date, day));

                return (
                  <div
                    key={day.toISOString()}
                    className="week-day"
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '8px',
                      background: isToday ? '#141c30' : '#101626',
                    }}
                  >
                    <div style={{ borderBottom: '1px solid #202940', paddingBottom: '6px', textAlign: 'center' }}>
                      <div style={{ fontSize: '11px', color: isToday ? '#818cf8' : '#7f8aa3', textTransform: 'uppercase' }}>
                        {format(day, 'EEE')}
                      </div>
                      <strong style={{ fontSize: '13px', color: isToday ? '#fff' : '#cbd5e1' }}>
                        {format(day, 'MMM d')}
                      </strong>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', flex: 1 }}>
                      {dayEvents.length === 0 ? (
                        <div style={{ textAlign: 'center', color: '#4c566d', fontSize: '11px', marginTop: '16px' }}>
                          —
                        </div>
                      ) : (
                        dayEvents.map((item) => (
                          <div
                            key={item.id}
                            className="calendar-event"
                            style={{
                              borderLeftColor: item.color || '#818cf8',
                              whiteSpace: 'normal',
                              display: 'flex',
                              flexDirection: 'column',
                              gap: '2px',
                              padding: '6px 7px',
                              margin: 0,
                            }}
                          >
                            <span style={{ fontSize: '9px', color: '#9aa5bd' }}>
                              {item.timeLabel}
                            </span>
                            <strong style={{ fontSize: '11px', color: '#fff' }}>
                              {item.displayTitle}
                            </strong>
                            {item.location && (
                              <small style={{ fontSize: '9px', color: '#7e8aa6' }}>
                                📍 {item.location}
                              </small>
                            )}
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* 3. Day View (list of events with time ranges) */}
          {viewMode === 'day' && (
            <div className="panel day-view">
              <div className="panel-heading">
                <h3>{format(selectedDate, 'EEEE, MMMM d, yyyy')}</h3>
                <span className="badge">{dayItems.length} item{dayItems.length === 1 ? '' : 's'}</span>
              </div>

              {dayItems.length === 0 ? (
                <Empty text="No events scheduled for this day." />
              ) : (
                <div className="list">
                  {dayItems.map((item) => (
                    <div key={item.id} className="list-row" style={{ borderLeft: `3px solid ${item.color || '#818cf8'}` }}>
                      <div className="date-chip" style={{ width: 'auto', minWidth: '70px', padding: '0 8px', fontSize: '11px' }}>
                        {item.timeLabel}
                      </div>

                      <div style={{ flex: 1 }}>
                        <strong style={{ fontSize: '13px' }}>{item.displayTitle}</strong>
                        {item.description && (
                          <small style={{ color: '#9aa5bd', marginTop: '2px' }}>
                            {item.description}
                          </small>
                        )}
                        <div style={{ display: 'flex', gap: '12px', fontSize: '11px', color: '#7f8aa3', marginTop: '3px' }}>
                          {item.location && <span>📍 {item.location}</span>}
                          {item.subjectName && <span>📖 {item.subjectName}</span>}
                        </div>
                      </div>

                      <span className="badge">{item.eventType || item.type}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* 4. Agenda View (upcoming events from cursor date onward) */}
          {viewMode === 'agenda' && (
            <div className="panel">
              <div className="panel-heading">
                <h3>Upcoming Agenda from {format(currentDate, 'MMM d, yyyy')}</h3>
                <span className="badge">{agendaItems.length} total</span>
              </div>

              {groupedAgenda.length === 0 ? (
                <Empty text="No upcoming events found from this date onward." />
              ) : (
                <div className="list">
                  {groupedAgenda.map((group) => (
                    <div key={group.date.toISOString()} style={{ borderBottom: '1px solid #1c263b' }}>
                      <div
                        style={{
                          padding: '10px 16px',
                          background: '#0d1324',
                          color: '#818cf8',
                          fontSize: '12px',
                          fontWeight: 700,
                          display: 'flex',
                          alignItems: 'center',
                          gap: '8px',
                        }}
                      >
                        <span>📅 {format(group.date, 'EEEE, MMMM d, yyyy')}</span>
                        {isSameDay(group.date, new Date()) && (
                          <span className="badge" style={{ background: '#312e81', color: '#c7d2fe' }}>
                            Today
                          </span>
                        )}
                      </div>

                      {group.items.map((item) => (
                        <div key={item.id} className="list-row" style={{ borderLeft: `3px solid ${item.color || '#818cf8'}` }}>
                          <div style={{ minWidth: '90px' }}>
                            <strong style={{ fontSize: '12px', color: '#9aa5bd' }}>
                              {item.timeLabel}
                            </strong>
                          </div>

                          <div style={{ flex: 1 }}>
                            <strong>{item.displayTitle}</strong>
                            {item.description && <small>{item.description}</small>}
                          </div>

                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            {item.location && <small style={{ color: '#7f8aa3' }}>📍 {item.location}</small>}
                            {item.subjectName && (
                              <span className="badge" style={{ background: '#1c263b' }}>
                                {item.subjectName}
                              </span>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
