import { useEffect, useMemo, useState } from 'react';
import { PageHeading, Stat, Empty, ErrorBanner } from '../components/ui';

type Row = Record<string, any> & { id: number };
const statuses = ['available', 'working', 'busy', 'waiting', 'offline', 'disabled'];
const taskStatuses = ['inbox', 'planned', 'assigned', 'in_progress', 'waiting', 'review', 'revision', 'completed', 'cancelled'];
const tabs = ['Overview', 'Agents', 'Divisions', 'AI Tools', 'Tasks', 'Work Sessions'];
const nowIso = () => new Date().toISOString();
const elapsedFor = (session: Row) => Number(session.elapsed_seconds || 0) + (session.status === 'running' && session.last_resumed_at ? Math.max(0, Math.floor((Date.now() - Date.parse(session.last_resumed_at)) / 1000)) : 0);
const fmt = (seconds: number) => `${String(Math.floor(seconds / 3600)).padStart(2, '0')}:${String(Math.floor((seconds % 3600) / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;

export default function AIAgentsCorner() {
  const [tab, setTab] = useState('Overview');
  const [agents, setAgents] = useState<Row[]>([]), [divisions, setDivisions] = useState<Row[]>([]), [tools, setTools] = useState<Row[]>([]), [tasks, setTasks] = useState<Row[]>([]), [sessions, setSessions] = useState<Row[]>([]), [activity, setActivity] = useState<Row[]>([]);
  const [error, setError] = useState('');
  const [title, setTitle] = useState('');
  const [summary, setSummary] = useState('');
  const [notes, setNotes] = useState('');
  const [selectedTask, setSelectedTask] = useState('');
  const [selectedAgent, setSelectedAgent] = useState('');
  const [selectedDivision, setSelectedDivision] = useState('');
  const [tick, setTick] = useState(0);

  const load = async () => {
    try {
      const [a, d, t, at, s, log] = await Promise.all([
        window.ams.db.list('ai_agents', 'name ASC'), window.ams.db.list('ai_divisions', 'name ASC'), window.ams.db.list('ai_tools', 'name ASC'),
        window.ams.db.list('agent_tasks', 'created_at DESC'), window.ams.db.list('work_sessions', 'created_at DESC'), window.ams.db.list('agent_activity', 'created_at DESC'),
      ]);
      setAgents(a); setDivisions(d); setTools(t); setTasks(at); setSessions(s); setActivity(log);
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not load AI workspace'); }
  };
  useEffect(() => { void load(); }, []);
  useEffect(() => { const id = window.setInterval(() => setTick((v) => v + 1), 1000); return () => window.clearInterval(id); }, []);
  void tick;

  const log = async (event_type: string, description: string, extra: Record<string, unknown> = {}) => {
    await window.ams.db.create('agent_activity', { event_type, description, ...extra });
  };
  const activeSession = sessions.find((s) => s.status === 'running' || s.status === 'paused');
  const stats = useMemo(() => ({ activeAgents: agents.filter((a) => ['working', 'busy'].includes(a.status)).length, assigned: tasks.filter((t) => ['assigned', 'in_progress'].includes(t.status)).length, completed: tasks.filter((t) => t.status === 'completed').length, review: tasks.filter((t) => t.status === 'review').length }), [agents, tasks]);

  const addAgent = async () => {
    if (!title.trim()) return setError('Enter an agent name first.');
    const row = await window.ams.db.create('ai_agents', { name: title.trim(), role: 'Configurable agent', division_id: selectedDivision ? Number(selectedDivision) : null, status: 'available' });
    await log('agent_created', `Created agent ${title.trim()}`, { agent_id: row.id, division_id: selectedDivision ? Number(selectedDivision) : null });
    setTitle(''); setSelectedDivision(''); await load();
  };
  const addTask = async () => {
    if (!title.trim()) return setError('Enter a task title first.');
    const row = await window.ams.db.create('agent_tasks', { title: title.trim(), description: summary.trim(), division_id: selectedDivision ? Number(selectedDivision) : null, agent_ids: selectedAgent ? JSON.stringify([Number(selectedAgent)]) : '[]', status: 'inbox', priority: 'medium' });
    await log('task_created', `Created task ${title.trim()}`, { task_id: row.id, division_id: selectedDivision ? Number(selectedDivision) : null, agent_id: selectedAgent ? Number(selectedAgent) : null });
    setTitle(''); setSummary(''); setSelectedAgent(''); setSelectedDivision(''); await load();
  };
  const addTool = async () => {
    if (!title.trim()) return setError('Enter a tool name first.');
    await window.ams.db.create('ai_tools', { name: title.trim(), category: 'Other', access_type: 'Other', status: 'active' });
    await log('tool_created', `Registered tool ${title.trim()}`); setTitle(''); await load();
  };
  const startSession = async () => {
    if (activeSession) return setError('Finish or discard the current work session before starting another.');
    if (!title.trim()) return setError('Enter a session title first.');
    const now = nowIso();
    const row = await window.ams.db.create('work_sessions', { title: title.trim(), status: 'running', started_at: now, last_resumed_at: now, task_id: selectedTask ? Number(selectedTask) : null, agent_id: selectedAgent ? Number(selectedAgent) : null, division_id: selectedDivision ? Number(selectedDivision) : null });
    await log('session_started', `Started work session ${title.trim()}`, { agent_id: selectedAgent ? Number(selectedAgent) : null, task_id: selectedTask ? Number(selectedTask) : null, division_id: selectedDivision ? Number(selectedDivision) : null });
    setTitle(''); setSelectedTask(''); setSelectedAgent(''); setSelectedDivision(''); await load();
  };
  const pauseResume = async () => {
    if (!activeSession) return;
    if (activeSession.status === 'running') {
      const seconds = elapsedFor(activeSession);
      await window.ams.db.update('work_sessions', activeSession.id, { status: 'paused', elapsed_seconds: seconds, paused_at: nowIso(), last_resumed_at: null });
      await log('session_paused', `Paused work session ${activeSession.title}`, { agent_id: activeSession.agent_id, task_id: activeSession.task_id, division_id: activeSession.division_id });
    } else {
      await window.ams.db.update('work_sessions', activeSession.id, { status: 'running', last_resumed_at: nowIso(), paused_at: null });
      await log('session_resumed', `Resumed work session ${activeSession.title}`, { agent_id: activeSession.agent_id, task_id: activeSession.task_id, division_id: activeSession.division_id });
    }
    await load();
  };
  const stopSession = async () => {
    if (!activeSession) return;
    const result = window.prompt('Session result / summary (optional):', summary) ?? '';
    const seconds = elapsedFor(activeSession);
    await window.ams.db.update('work_sessions', activeSession.id, { status: 'completed', ended_at: nowIso(), elapsed_seconds: seconds, summary: result, notes });
    await log('session_stopped', `Stopped work session ${activeSession.title}`, { agent_id: activeSession.agent_id, task_id: activeSession.task_id, division_id: activeSession.division_id });
    setSummary(''); setNotes(''); await load();
  };
  const removeSession = async () => { if (activeSession && window.confirm('Discard this active session?')) { await window.ams.db.delete('work_sessions', activeSession.id); await log('session_discarded', `Discarded work session ${activeSession.title}`); await load(); } };
  const cycleTask = async (task: Row) => { const next = taskStatuses[(taskStatuses.indexOf(task.status) + 1) % taskStatuses.length]; await window.ams.db.update('agent_tasks', task.id, { status: next, ...(next === 'completed' ? { completed_at: nowIso() } : {}) }); await log('task_status_changed', `${task.title} → ${next}`, { task_id: task.id, division_id: task.division_id }); await load(); };

  const form = (kind: 'agent' | 'task' | 'tool' | 'session') => <section className="panel ai-form"><div className="panel-heading"><h3>{kind === 'agent' ? 'Register agent' : kind === 'task' ? 'Create agent task' : kind === 'tool' ? 'Register AI tool' : 'Start work session'}</h3></div><div className="form-grid">
    <label className="span-2">{kind === 'tool' ? 'Tool name' : kind === 'session' ? 'Session title' : kind === 'task' ? 'Task title' : 'Agent name'}<input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Enter a real record..." /></label>
    {kind === 'task' && <label className="span-2">Description<textarea value={summary} onChange={(e) => setSummary(e.target.value)} /></label>}
    {kind !== 'tool' && <label>Division<select value={selectedDivision} onChange={(e) => setSelectedDivision(e.target.value)}><option value="">Unassigned</option>{divisions.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</select></label>}
    {['task', 'session'].includes(kind) && <label>Agent<select value={selectedAgent} onChange={(e) => setSelectedAgent(e.target.value)}><option value="">Unassigned</option>{agents.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select></label>}
    {kind === 'session' && <label>Task<select value={selectedTask} onChange={(e) => setSelectedTask(e.target.value)}><option value="">Unassigned</option>{tasks.filter((t) => t.status !== 'completed').map((t) => <option key={t.id} value={t.id}>{t.title}</option>)}</select></label>}
  </div><div className="modal-actions"><button className="primary" onClick={() => void (kind === 'agent' ? addAgent() : kind === 'task' ? addTask() : kind === 'tool' ? addTool() : startSession())}>{kind === 'session' ? 'Start' : 'Save'}</button></div></section>;

  return <div><PageHeading title="AI Agents Corner" subtitle="A local-first command centre for your configurable AI ecosystem and real work sessions." />{error && <ErrorBanner message={error} />}
    <div className="subnav">{tabs.map((item) => <button key={item} className={tab === item ? 'active' : ''} onClick={() => setTab(item)}>{item}</button>)}</div>
    {activeSession && <section className="focus-panel ai-session-bar"><div><small>{activeSession.status === 'running' ? 'WORK SESSION RUNNING' : 'SESSION PAUSED'}</small><h2>{activeSession.title}</h2><strong className="timer-small">{fmt(elapsedFor(activeSession))}</strong></div><div className="timer-controls"><button className="ghost" onClick={() => void pauseResume()}>{activeSession.status === 'running' ? 'Pause' : 'Resume'}</button><button className="primary" onClick={() => void stopSession()}>Stop & Save</button><button className="danger" onClick={() => void removeSession()}>Discard</button></div></section>}
    {tab === 'Overview' && <><div className="stats-grid"><Stat label="Registered Agents" value={agents.length} /><Stat label="Active Agents" value={stats.activeAgents} accent="info" /><Stat label="AI Tools" value={tools.length} /><Stat label="Tasks Assigned" value={stats.assigned} /><Stat label="Completed Tasks" value={stats.completed} accent="success" /><Stat label="Awaiting Review" value={stats.review} accent="warning" /></div><div className="dashboard-grid"><section className="panel"><div className="panel-heading"><h3>Division distribution</h3></div><div className="list">{divisions.map((d) => <div className="list-row" key={d.id}><span className="division-dot" style={{ background: d.color }} /><div><strong>{d.name}</strong><small>{agents.filter((a) => a.division_id === d.id).length} agents</small></div></div>)}</div></section><section className="panel"><div className="panel-heading"><h3>Recent activity</h3></div><div className="list">{activity.slice(0, 6).map((x) => <div className="list-row" key={x.id}><div><strong>{x.description}</strong><small>{new Date(x.created_at).toLocaleString()}</small></div></div>)}</div>{activity.length === 0 && <Empty text="Activity appears here as you use the workspace." />}</section></div></>}
    {tab === 'Agents' && <><div className="dashboard-grid">{form('agent')}<section className="panel"><div className="panel-heading"><h3>Configured agents</h3><span>{agents.length}</span></div><div className="list">{agents.map((a) => <div className="list-row" key={a.id}><div><strong>{a.name}</strong><small>{a.role || 'No role'} · {a.status}</small></div><span className="badge">{a.status}</span></div>)}</div>{agents.length === 0 && <Empty text="No agents registered yet." />}</section></div></>}
    {tab === 'Divisions' && <section className="panel"><div className="panel-heading"><h3>Default divisions</h3><span>Customise via database-ready records</span></div><div className="list">{divisions.map((d) => <div className="list-row" key={d.id}><span className="division-dot" style={{ background: d.color }} /><div><strong>{d.name}</strong><small>{d.description}</small></div><span className="badge">{agents.filter((a) => a.division_id === d.id).length} agents</span></div>)}</div></section>}
    {tab === 'AI Tools' && <><div className="dashboard-grid">{form('tool')}<section className="panel"><div className="panel-heading"><h3>AI tools</h3><span>{tools.length}</span></div><div className="list">{tools.map((t) => <div className="list-row" key={t.id}><div><strong>{t.name}</strong><small>{t.provider || 'Provider not set'} · {t.category}</small></div><span className="badge">{t.status}</span></div>)}</div></section></div></>}
    {tab === 'Tasks' && <><div className="dashboard-grid">{form('task')}<section className="panel"><div className="panel-heading"><h3>Workflow tasks</h3><span>{tasks.length}</span></div><div className="list">{tasks.map((t) => <div className="list-row" key={t.id}><div><strong>{t.title}</strong><small>{t.description || 'No description'}</small></div><button className="ghost" onClick={() => void cycleTask(t)}>{String(t.status).replace('_', ' ')}</button></div>)}</div></section></div></>}
    {tab === 'Work Sessions' && <><div className="dashboard-grid">{form('session')}<section className="panel"><div className="panel-heading"><h3>Session history</h3><span>{sessions.filter((s) => s.status === 'completed').length} saved</span></div><div className="list">{sessions.filter((s) => s.status === 'completed').map((s) => <div className="list-row" key={s.id}><div><strong>{s.title}</strong><small>{new Date(s.started_at).toLocaleString()} · {fmt(Number(s.elapsed_seconds || 0))}</small></div><span className="badge">completed</span></div>)}</div>{sessions.filter((s) => s.status === 'completed').length === 0 && <Empty text="Saved sessions will appear here after you stop the timer." />}</section></div></>}
  </div>;
}
