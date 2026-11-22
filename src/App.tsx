import { useEffect, useMemo, useState } from 'react';
import { NavLink, Route, Routes } from 'react-router-dom';
import {
  addDays, addMonths, format, startOfMonth, endOfMonth, startOfWeek, endOfWeek,
  isSameMonth, isSameDay, startOfDay, endOfDay,
} from 'date-fns';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Crud, type Field } from './components/Crud';
import { calculateHabitStreak, calculateSyllabusCompletion, detectOverlap, elapsedSeconds, analyticsFromRecords } from './shared/business';

const navigation = [
  ['Dashboard', '/'], ['Academics', '/academics'], ['Calendar', '/calendar'],
  ['Timetable', '/timetable'], ['Tasks and Assignments', '/tasks'], ['Reminders', '/reminders'],
  ['Habit Tracker', '/habits'], ['Study Sessions', '/study'], ['Analytics', '/analytics'], ['Settings', '/settings'],
];

function useRows(entity: string, orderBy?: string) {
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  async function reload() {
    setLoading(true);
    setError('');
    try { setRows(await window.ams.db.list(entity, orderBy)); }
    catch (err) { setError(err instanceof Error ? err.message : 'Could not load records'); }
    finally { setLoading(false); }
  }
  useEffect(() => { void reload(); }, [entity, orderBy]);
  return { rows, loading, error, reload };
}

function Layout() {
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand"><div className="brand-mark">A</div><div><strong>AMS</strong><span>Academic Manager</span></div></div>
        <nav>{navigation.map(([label, path]) => (
          <NavLink key={path} to={path} end={path === '/'} className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>{label}</NavLink>
        ))}</nav>
        <div className="sidebar-status"><span className="status-dot"></span>Local database</div>
      </aside>
      <main className="main">
        <header className="topbar"><div className="breadcrumb">AMS / Workspace</div><div className="top-actions"><button className="icon-button" title="Notifications" onClick={() => void window.ams.notify('AMS Desktop', 'Notifications are active.')}>●</button></div></header>
        <div className="content"><Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/academics" element={<Academics />} />
          <Route path="/calendar" element={<CalendarPage />} />
          <Route path="/timetable" element={<Timetable />} />
          <Route path="/tasks" element={<Tasks />} />
          <Route path="/reminders" element={<Reminders />} />
          <Route path="/habits" element={<Habits />} />
          <Route path="/study" element={<StudySessions />} />
          <Route path="/analytics" element={<Analytics />} />
          <Route path="/settings" element={<Settings />} />
        </Routes></div>
      </main>
    </div>
  );
}

function Dashboard() {
  const programmes = useRows('programmes');
  const subjects = useRows('subjects');
  const tasks = useRows('tasks');
  const sessions = useRows('study_sessions');
  const events = useRows('calendar_events');
  const openTasks = tasks.rows.filter(task => task.status !== 'completed');
  const overdue = openTasks.filter(task => task.due_at && new Date(task.due_at) < new Date()).length;
  const totalMinutes = sessions.rows.reduce((sum, item) => sum + Number(item.duration_minutes || 0), 0);
  return (
    <div>
      <div className="page-heading"><div><h1>Dashboard</h1><p>{format(new Date(), 'EEEE, MMMM d')}</p></div></div>
      <div className="stats-grid">
        <Stat label="Active programmes" value={programmes.rows.length} />
        <Stat label="Subjects" value={subjects.rows.length} />
        <Stat label="Open tasks" value={openTasks.length} accent={overdue ? 'warning' : undefined} />
        <Stat label="Study minutes" value={totalMinutes} />
      </div>
      <div className="dashboard-grid">
        <section className="panel"><div className="panel-heading"><h3>Upcoming tasks</h3></div>
          {tasks.loading ? <div className="loading">Loading...</div> : openTasks.length === 0 ? <Empty compact text="No open tasks" /> :
            <div className="list">{openTasks.slice(0, 8).map(task => <div className="list-row" key={task.id}><span className={`priority ${task.priority}`}></span><div><strong>{task.title}</strong><small>{task.due_at ? format(new Date(task.due_at), 'MMM d, yyyy') : 'No due date'}</small></div><span className="badge">{task.status}</span></div>)}</div>}
        </section>
        <section className="panel"><div className="panel-heading"><h3>Upcoming calendar</h3></div>
          {events.rows.length === 0 ? <Empty compact text="No calendar events" /> :
            <div className="list">{events.rows.slice(0, 8).map(event => <div className="list-row" key={event.id}><span className="date-chip">{event.start_at ? format(new Date(event.start_at), 'dd') : '—'}</span><div><strong>{event.title}</strong><small>{event.start_at ? format(new Date(event.start_at), 'MMM d, p') : ''}</small></div></div>)}</div>}
        </section>
      </div>
    </div>
  );
}

function Stat({ label, value, accent }: { label: string; value: number; accent?: string }) {
  return <div className={`stat-card ${accent || ''}`}><span>{label}</span><strong>{value}</strong></div>;
}

function Empty({ text, compact }: { text: string; compact?: boolean }) {
  return <div className={compact ? 'empty compact' : 'empty-state'}><div className="empty-icon">◇</div><p>{text}</p></div>;
}

function Academics() {
  const [tab, setTab] = useState('programmes');
  const programmes = useRows('programmes');
  const semesters = useRows('semesters');
  const subjects = useRows('subjects');
  const units = useRows('units');
  const topics = useRows('topics');
  const programmeOptions = programmes.rows.map(row => ({ value: row.id, label: row.name }));
  const semesterOptions = semesters.rows.map(row => ({ value: row.id, label: row.name }));
  const subjectOptions = subjects.rows.map(row => ({ value: row.id, label: row.name }));
  const unitOptions = units.rows.map(row => ({ value: row.id, label: row.name }));
  const syllabus = units.rows.map(unit => {
    const unitTopics = topics.rows.filter(topic => topic.unit_id === unit.id);
    return { name: unit.name, completion: calculateSyllabusCompletion(unitTopics) };
  });
  const schemas: Record<string, { title: string; entity: string; fields: Field[] }> = {
    programmes: { title: 'Programmes', entity: 'programmes', fields: [
      { name: 'name', label: 'Name', required: true }, { name: 'code', label: 'Code' },
      { name: 'description', label: 'Description', type: 'textarea' }, { name: 'start_date', label: 'Start date', type: 'date' },
      { name: 'end_date', label: 'End date', type: 'date' }, { name: 'status', label: 'Status', type: 'select', options: [{ value: 'active', label: 'Active' }, { value: 'completed', label: 'Completed' }, { value: 'archived', label: 'Archived' }] },
    ] },
    semesters: { title: 'Semesters', entity: 'semesters', fields: [
      { name: 'programme_id', label: 'Programme', type: 'select', required: true, options: programmeOptions }, { name: 'name', label: 'Name', required: true },
      { name: 'start_date', label: 'Start date', type: 'date' }, { name: 'end_date', label: 'End date', type: 'date' },
      { name: 'status', label: 'Status', type: 'select', options: [{ value: 'active', label: 'Active' }, { value: 'completed', label: 'Completed' }] },
    ] },
    subjects: { title: 'Subjects', entity: 'subjects', fields: [
      { name: 'semester_id', label: 'Semester', type: 'select', required: true, options: semesterOptions }, { name: 'name', label: 'Name', required: true },
      { name: 'code', label: 'Code' }, { name: 'credits', label: 'Credits', type: 'number' },
      { name: 'color', label: 'Color' }, { name: 'description', label: 'Description', type: 'textarea' },
    ] },
    units: { title: 'Units', entity: 'units', fields: [
      { name: 'subject_id', label: 'Subject', type: 'select', required: true, options: subjectOptions }, { name: 'name', label: 'Name', required: true },
      { name: 'description', label: 'Description', type: 'textarea' }, { name: 'order_index', label: 'Order', type: 'number' },
    ] },
    topics: { title: 'Topics', entity: 'topics', fields: [
      { name: 'unit_id', label: 'Unit', type: 'select', required: true, options: unitOptions }, { name: 'name', label: 'Name', required: true },
      { name: 'completed', label: 'Completed', type: 'checkbox' }, { name: 'notes', label: 'Notes', type: 'textarea' }, { name: 'order_index', label: 'Order', type: 'number' },
    ] },
  };
  const active = schemas[tab];
  return (
    <div>
      <div className="subnav">{Object.entries(schemas).map(([key, value]) => <button key={key} className={tab === key ? 'active' : ''} onClick={() => setTab(key)}>{value.title}</button>)}</div>
      {syllabus.length > 0 && tab === 'topics' && <div className="completion-strip">{syllabus.map(unit => <div key={unit.name}><span>{unit.name}</span><div className="progress"><i style={{ width: `${unit.completion}%` }} /></div><strong>{unit.completion}%</strong></div>)}</div>}
      <Crud key={tab} title={active.title} entity={active.entity} fields={active.fields} />
    </div>
  );
}

function CalendarPage() {
  const [view, setView] = useState('month');
  const [cursor, setCursor] = useState(new Date());
  const { rows, loading, error } = useRows('calendar_events', 'start_at ASC');
  const eventsInView = useMemo(() => rows.filter(event => {
    const date = new Date(event.start_at);
    if (view === 'agenda') return date >= startOfDay(cursor);
    if (view === 'day') return isSameDay(date, cursor);
    if (view === 'week') return date >= startOfWeek(cursor) && date <= endOfWeek(cursor);
    return date >= startOfMonth(cursor) && date <= endOfMonth(cursor);
  }), [rows, cursor, view]);
  const monthStart = startOfWeek(startOfMonth(cursor));
  const monthDays = Array.from({ length: 42 }, (_, index) => addDays(monthStart, index));
  return (
    <div>
      <div className="page-heading"><div><h1>Calendar</h1><p>{format(cursor, 'MMMM yyyy')}</p></div>
        <div className="segmented">{['month','week','day','agenda'].map(value => <button key={value} className={view === value ? 'active' : ''} onClick={() => setView(value)}>{value}</button>)}</div>
      </div>
      <div className="calendar-toolbar"><button className="ghost" onClick={() => setCursor(view === 'month' ? addMonths(cursor, -1) : addDays(cursor, -7))}>‹</button><button className="ghost" onClick={() => setCursor(new Date())}>Today</button><button className="ghost" onClick={() => setCursor(view === 'month' ? addMonths(cursor, 1) : addDays(cursor, 7))}>›</button></div>
      {error && <div className="error-banner">{error}</div>}
      {loading ? <div className="loading">Loading...</div> : view === 'agenda' ? (
        <div className="panel list">{eventsInView.length ? eventsInView.map(event => <div className="list-row" key={event.id}><span className="date-chip">{format(new Date(event.start_at), 'dd')}</span><div><strong>{event.title}</strong><small>{format(new Date(event.start_at), 'MMM d, p')} · {event.location || 'No location'}</small></div></div>) : <Empty compact text="No upcoming events" />}</div>
      ) : view === 'day' ? (
        <div className="panel day-view">{eventsInView.length ? eventsInView.map(event => <div className="list-row" key={event.id}><strong>{event.title}</strong><small>{format(new Date(event.start_at), 'p')} – {event.end_at ? format(new Date(event.end_at), 'p') : 'No end'}</small></div>) : <Empty text="No events this day" />}</div>
      ) : view === 'week' ? (
        <div className="week-grid">{Array.from({ length: 7 }, (_, index) => { const day = addDays(startOfWeek(cursor), index); const dayEvents = eventsInView.filter(event => isSameDay(new Date(event.start_at), day)); return <div className="week-day" key={index}><strong>{format(day, 'EEE d')}</strong>{dayEvents.map(event => <span className="calendar-event" key={event.id}>{event.title}</span>)}</div>; })}</div>
      ) : (
        <div className="month-grid">{['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map(day => <div className="weekday" key={day}>{day}</div>)}{monthDays.map(day => {
          const dayEvents = rows.filter(event => isSameDay(new Date(event.start_at), day));
          return <div className={`month-day ${isSameMonth(day,cursor) ? '' : 'muted'} ${isSameDay(day,new Date()) ? 'today' : ''}`} key={day.toISOString()}><span>{format(day,'d')}</span>{dayEvents.slice(0,3).map(event => <div className="calendar-event" key={event.id}>{event.title}</div>)}</div>;
        })}</div>
      )}
      <Crud title="Calendar Events" entity="calendar_events" fields={[
        { name:'title', label:'Title', required:true }, { name:'description', label:'Description', type:'textarea' },
        { name:'event_type', label:'Type', type:'select', options:[{value:'event',label:'Event'},{value:'exam',label:'Exam'},{value:'deadline',label:'Deadline'}] },
        { name:'start_at', label:'Start', type:'datetime-local', required:true }, { name:'end_at', label:'End', type:'datetime-local' },
        { name:'all_day', label:'All day', type:'checkbox' }, { name:'location', label:'Location' }, { name:'recurrence', label:'Recurrence', type:'select', options:[{value:'none',label:'None'},{value:'daily',label:'Daily'},{value:'weekly',label:'Weekly'}] },
      ]} />
    </div>
  );
}

function Timetable() {
  const sessions = useRows('timetable_sessions', 'day_of_week ASC, start_time ASC');
  const subjects = useRows('subjects');
  const availability = useRows('availability', 'day_of_week ASC, start_time ASC');
  const issues = useMemo(() => {
    const found: string[] = [];
    for (let i = 0; i < sessions.rows.length; i++) {
      for (let j = i + 1; j < sessions.rows.length; j++) {
        if (detectOverlap(
          { day: String(sessions.rows[i].day_of_week), start: sessions.rows[i].start_time, end: sessions.rows[i].end_time },
          [{ day: String(sessions.rows[j].day_of_week), start: sessions.rows[j].start_time, end: sessions.rows[j].end_time }],
        )) found.push(`${sessions.rows[i].title} overlaps ${sessions.rows[j].title}`);
      }
    }
    for (const session of sessions.rows) {
      const unavailable = availability.rows.some(row =>
        Number(row.day_of_week) === Number(session.day_of_week) &&
        row.available === 0 &&
        row.start_time < session.end_time &&
        session.start_time < row.end_time,
      );
      if (unavailable) found.push(`${session.title} conflicts with unavailable time`);
    }
    return found;
  }, [sessions.rows, availability.rows]);
  const dayNames = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
  return (
    <div>
      <div className="page-heading"><div><h1>Timetable</h1><p>Weekly recurring sessions</p></div></div>
      {issues.length > 0 && <div className="error-banner">{issues.join(' · ')}</div>}
      <div className="timetable-grid">{dayNames.map((day, dayIndex) => (
        <div className="timetable-day" key={day}><h3>{day}</h3>
          {sessions.rows.filter(row => Number(row.day_of_week) === dayIndex).sort((a,b) => a.start_time.localeCompare(b.start_time)).map(row =>
            <div className="timetable-card" key={row.id}><strong>{row.title}</strong><span>{row.start_time}–{row.end_time}</span><small>{row.location || 'No location'}</small></div>
          )}
        </div>
      ))}</div>
      <Crud title="Timetable Sessions" entity="timetable_sessions" orderBy="day_of_week ASC, start_time ASC" fields={[
        { name:'title', label:'Title', required:true }, { name:'subject_id', label:'Subject', type:'select', options:subjects.rows.map(row => ({value:row.id,label:row.name})) },
        { name:'day_of_week', label:'Day', type:'select', required:true, options:dayNames.map((label,index) => ({value:index,label})) },
        { name:'start_time', label:'Start', type:'time', required:true }, { name:'end_time', label:'End', type:'time', required:true },
        { name:'location', label:'Location' }, { name:'recurrence', label:'Recurrence', type:'select', options:[{value:'weekly',label:'Weekly'},{value:'daily',label:'Daily'},{value:'none',label:'One-off'}] },
        { name:'active', label:'Active', type:'checkbox' },
      ]} />
      <Crud title="Availability" entity="availability" orderBy="day_of_week ASC, start_time ASC" fields={[
        { name:'day_of_week', label:'Day', type:'select', required:true, options:dayNames.map((label,index) => ({value:index,label})) },
        { name:'start_time', label:'Start', type:'time', required:true }, { name:'end_time', label:'End', type:'time', required:true },
        { name:'label', label:'Label' }, { name:'available', label:'Available', type:'checkbox' },
      ]} />
    </div>
  );
}

function Tasks() {
  const subjects = useRows('subjects');
  return <Crud title="Tasks and Assignments" entity="tasks" orderBy="due_at ASC" fields={[
    { name:'title', label:'Title', required:true }, { name:'description', label:'Description', type:'textarea' },
    { name:'subject_id', label:'Subject', type:'select', options:subjects.rows.map(row => ({value:row.id,label:row.name})) },
    { name:'due_at', label:'Due', type:'datetime-local' },
    { name:'priority', label:'Priority', type:'select', options:[{value:'low',label:'Low'},{value:'medium',label:'Medium'},{value:'high',label:'High'}] },
    { name:'status', label:'Status', type:'select', options:[{value:'pending',label:'Pending'},{value:'in_progress',label:'In progress'},{value:'completed',label:'Completed'}] },
    { name:'estimated_minutes', label:'Estimate (minutes)', type:'number' },
  ]} />;
}

function Reminders() {
  const reminders = useRows('reminders', 'scheduled_at ASC');
  const [error, setError] = useState('');
  async function notifyNow(reminder: any) {
    if (reminder.notification_id) { setError('This reminder was already delivered.'); return; }
    const supported = await window.ams.notify(reminder.title, reminder.message || 'Reminder');
    if (supported) await window.ams.db.update('reminders', reminder.id, { notification_id: crypto.randomUUID(), completed: 1 });
    else setError('Native notifications are not supported in this environment.');
  }
  return (
    <div>
      {error && <div className="error-banner">{error}</div>}
      <Crud title="Reminders" entity="reminders" orderBy="scheduled_at ASC" fields={[
        { name:'title', label:'Title', required:true }, { name:'message', label:'Message', type:'textarea' },
        { name:'scheduled_at', label:'Scheduled at', type:'datetime-local', required:true },
        { name:'recurrence', label:'Recurrence', type:'select', options:[{value:'once',label:'Once'},{value:'daily',label:'Daily'},{value:'weekly',label:'Weekly'},{value:'monthly',label:'Monthly'}] },
        { name:'until_at', label:'Until', type:'datetime-local' }, { name:'completed', label:'Completed', type:'checkbox' },
      ]} />
      {reminders.rows.length > 0 && <div className="panel delivery-panel"><h3>Native delivery</h3>{reminders.rows.map(row =>
        <div className="list-row" key={row.id}><div><strong>{row.title}</strong><small>{row.notification_id ? 'Delivered once' : 'Pending delivery'}</small></div><button className="ghost" onClick={() => void notifyNow(row)}>Deliver now</button></div>
      )}</div>}
    </div>
  );
}

function Habits() {
  const [tab, setTab] = useState('habits');
  const habits = useRows('habits');
  const entries = useRows('habit_entries', 'entry_date DESC');
  const today = format(new Date(), 'yyyy-MM-dd');
  const streaks = habits.rows.map(habit => ({
    name: habit.name,
    streak: calculateHabitStreak(entries.rows.filter(entry => entry.habit_id === habit.id), new Date()),
  }));
  return (
    <div>
      <div className="subnav"><button className={tab === 'habits' ? 'active' : ''} onClick={() => setTab('habits')}>Habits</button><button className={tab === 'entries' ? 'active' : ''} onClick={() => setTab('entries')}>Daily entries</button></div>
      {tab === 'habits' ? <>
        {streaks.length > 0 && <div className="stats-grid">{streaks.map(item => <Stat key={item.name} label={item.name} value={item.streak} />)}</div>}
        <Crud title="Habits" entity="habits" fields={[
          { name:'name', label:'Name', required:true }, { name:'description', label:'Description', type:'textarea' },
          { name:'frequency', label:'Frequency', type:'select', options:[{value:'daily',label:'Daily'},{value:'weekdays',label:'Weekdays'},{value:'weekly',label:'Weekly'}] },
          { name:'target', label:'Target', type:'number' }, { name:'color', label:'Color' }, { name:'active', label:'Active', type:'checkbox' },
        ]} />
      </> : <Crud title="Habit Entries" entity="habit_entries" orderBy="entry_date DESC" fields={[
        { name:'habit_id', label:'Habit', type:'select', required:true, options:habits.rows.map(row => ({value:row.id,label:row.name})) },
        { name:'entry_date', label:'Date', type:'date', required:true },
        { name:'completed', label:'Completed', type:'checkbox' }, { name:'count', label:'Count', type:'number' }, { name:'notes', label:'Notes', type:'textarea' },
      ]} />}
    </div>
  );
}

function StudySessions() {
  const subjects = useRows('subjects');
  const sessions = useRows('study_sessions', 'started_at DESC');
  const [subjectId, setSubjectId] = useState('');
  const [title, setTitle] = useState('');
  const [running, setRunning] = useState(false);
  const [elapsed, setElapsed] = useState(() => Number(localStorage.getItem('ams-timer-elapsed') || 0));
  const [elapsedBase, setElapsedBase] = useState(() => Number(localStorage.getItem('ams-timer-elapsed') || 0));
  const [startedAt, setStartedAt] = useState(() => Number(localStorage.getItem('ams-timer-started') || 0));
  const [error, setError] = useState('');

  useEffect(() => {
    if (!running) return;
    const timer = window.setInterval(() => {
      setElapsed(elapsedSeconds(startedAt, Date.now(), elapsedBase));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [running, startedAt, elapsedBase]);

  function start() {
    const now = Date.now();
    setElapsedBase(elapsed);
    setStartedAt(now);
    localStorage.setItem('ams-timer-started', String(now));
    setRunning(true);
  }

  function pause() {
    const value = elapsedSeconds(startedAt, Date.now(), elapsedBase);
    setElapsed(value);
    setRunning(false);
    localStorage.setItem('ams-timer-elapsed', String(value));
  }

  async function finish() {
    const seconds = running ? elapsedSeconds(startedAt, Date.now(), elapsedBase) : elapsed;
    if (!title.trim()) {
      setError('Give this study session a title.');
      return;
    }
    try {
      await window.ams.db.create('study_sessions', {
        subject_id: subjectId ? Number(subjectId) : null,
        title: title.trim(),
        started_at: startedAt ? new Date(startedAt).toISOString() : new Date().toISOString(),
        ended_at: new Date().toISOString(),
        duration_minutes: Math.max(1, Math.round(seconds / 60)),
        elapsed_seconds: seconds,
        notes: '',
      });
      setElapsed(0);
      setElapsedBase(0);
      setStartedAt(0);
      setRunning(false);
      setTitle('');
      localStorage.removeItem('ams-timer-elapsed');
      localStorage.removeItem('ams-timer-started');
      setError('');
      void sessions.reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save study session');
    }
  }

  const display = `${String(Math.floor(elapsed / 3600)).padStart(2,'0')}:${String(Math.floor((elapsed % 3600) / 60)).padStart(2,'0')}:${String(elapsed % 60).padStart(2,'0')}`;
  return (
    <div>
      <div className="page-heading"><div><h1>Study Sessions</h1><p>Focus timer</p></div></div>
      {error && <div className="error-banner">{error}</div>}
      <section className="focus-panel">
        <div className="timer">{display}</div>
        <div className="timer-controls">
          <input value={title} onChange={event => setTitle(event.target.value)} placeholder="Session title" />
          <select value={subjectId} onChange={event => setSubjectId(event.target.value)}><option value="">Unassigned subject</option>{subjects.rows.map(row => <option value={row.id} key={row.id}>{row.name}</option>)}</select>
          {!running ? <button className="primary" onClick={start}>Start</button> : <button className="ghost" onClick={pause}>Pause</button>}
          <button className="danger" onClick={() => void finish()}>Finish & save</button>
        </div>
      </section>
      {sessions.loading ? <div className="loading">Loading...</div> : sessions.rows.length === 0 ? <Empty text="No study sessions recorded" /> : <div className="panel list">{sessions.rows.map(row =>
        <div className="list-row" key={row.id}><div><strong>{row.title}</strong><small>{format(new Date(row.started_at), 'MMM d, yyyy p')} · {row.elapsed_seconds || row.duration_minutes * 60} seconds</small></div><span className="badge">{row.duration_minutes} min</span></div>
      )}</div>}
    </div>
  );
}

function Analytics() {
  const sessions = useRows('study_sessions');
  const tasks = useRows('tasks');
  const habits = useRows('habits');
  const entries = useRows('habit_entries');
  const subjects = useRows('subjects');
  const data = analyticsFromRecords({
    studySessions: sessions.rows,
    tasks: tasks.rows,
    habits: habits.rows,
    habitEntries: entries.rows,
  });
  const subjectName = (item: { name: string; minutes: number }) => {
    const subject = subjects.rows.find(row => String(row.id) === item.name);
    return { name: subject?.name || item.name, minutes: item.minutes };
  };
  const chartData = data.subjectMinutes.map(subjectName);
  return (
    <div>
      <div className="page-heading"><div><h1>Analytics</h1><p>Calculated only from stored records</p></div></div>
      <div className="stats-grid"><Stat label="Study minutes" value={data.totalStudyMinutes} /><Stat label="Completed tasks" value={data.completedTasks} /><Stat label="Open tasks" value={data.openTasks} /><Stat label="Habit completion" value={data.habitCompletionRate} /></div>
      <section className="panel chart-panel"><div className="panel-heading"><h3>Study time by subject</h3></div>{chartData.length ? (
        <ResponsiveContainer width="100%" height={340}><BarChart data={chartData}><CartesianGrid stroke="#26324d" strokeDasharray="3 3" /><XAxis dataKey="name" stroke="#94a3b8" /><YAxis stroke="#94a3b8" /><Tooltip contentStyle={{ background:'#111827', border:'1px solid #26324d' }} /><Bar dataKey="minutes" fill="#6366f1" radius={[6,6,0,0]} /></BarChart></ResponsiveContainer>
      ) : <Empty text="No study records for analytics" />}</section>
    </div>
  );
}

function Settings() {
  const [message, setMessage] = useState('');
  async function backup() {
    const path = await window.ams.backup();
    setMessage(path ? `Backup created at ${path}` : 'Backup cancelled.');
  }
  async function restore() {
    if (!window.confirm('Restore from a backup? Current data will be replaced.')) return;
    const path = await window.ams.restore();
    setMessage(path ? `Database restored from ${path}. Reload the app to refresh all views.` : 'Restore cancelled.');
  }
  return (
    <div>
      <div className="page-heading"><div><h1>Settings</h1><p>Local data and application</p></div></div>
      {message && <div className="success-banner">{message}</div>}
      <section className="panel settings-panel"><h3>Database backup</h3><p>Create a SQLite backup or restore a previous backup file.</p><div className="settings-actions"><button className="primary" onClick={() => void backup()}>Create backup</button><button className="danger" onClick={() => void restore()}>Restore backup</button></div></section>
      <section className="panel settings-panel"><h3>Notifications</h3><p>Native desktop notifications are supported where Electron exposes notification permissions. Delivery can occur only while the app process is running; missed reminders are not guaranteed after shutdown or sleep. Duplicate delivery is prevented by a persisted notification ID.</p></section>
      <section className="panel settings-panel"><h3>Privacy</h3><p>AMS stores all academic and study data locally in the operating-user database directory. There are no cloud services or paid integrations.</p></section>
    </div>
  );
}

export default function App() {
  return <Layout />;
}
