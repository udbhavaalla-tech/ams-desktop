import { useEffect, useState } from 'react';
import { NavLink, Route, Routes } from 'react-router-dom';
import Dashboard from './pages/Dashboard';
import Academics from './pages/Academics';
import Calendar from './pages/Calendar';
import Timetable from './pages/Timetable';
import Tasks from './pages/Tasks';
import Reminders from './pages/Reminders';
import Habits from './pages/Habits';
import StudySessions from './pages/StudySessions';
import Analytics from './pages/Analytics';
import Settings from './pages/Settings';

const navigation = [
  ['Dashboard', '/'],
  ['Academics', '/academics'],
  ['Calendar', '/calendar'],
  ['Timetable', '/timetable'],
  ['Tasks and Assignments', '/tasks'],
  ['Reminders', '/reminders'],
  ['Habit Tracker', '/habits'],
  ['Study Sessions', '/study'],
  ['Analytics', '/analytics'],
  ['Settings', '/settings'],
];

function Layout() {
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">A</div>
          <div>
            <strong>AMS</strong>
            <span>Academic Manager</span>
          </div>
        </div>
        <nav>
          {navigation.map(([label, path]) => (
            <NavLink
              key={path}
              to={path}
              end={path === '/'}
              className={({ isActive }) => (isActive ? 'nav-link active' : 'nav-link')}
            >
              {label}
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-status">
          <span className="status-dot"></span>
          Local database
        </div>
      </aside>
      <main className="main">
        <header className="topbar">
          <div className="breadcrumb">AMS / Workspace</div>
          <div className="top-actions">
            <button
              className="icon-button"
              title="Notifications"
              onClick={() => void window.ams.notify('AMS Desktop', 'Notifications are active.')}
            >
              ●
            </button>
          </div>
        </header>
        <div className="content">
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/academics" element={<Academics />} />
            <Route path="/calendar" element={<Calendar />} />
            <Route path="/timetable" element={<Timetable />} />
            <Route path="/tasks" element={<Tasks />} />
            <Route path="/reminders" element={<Reminders />} />
            <Route path="/habits" element={<Habits />} />
            <Route path="/study" element={<StudySessions />} />
            <Route path="/analytics" element={<Analytics />} />
            <Route path="/settings" element={<Settings />} />
          </Routes>
        </div>
      </main>
    </div>
  );
}

export default function App() {
  const [status, setStatus] = useState<{ ready: boolean; error: string } | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined' || !window.ams) {
      setStatus({
        ready: false,
        error:
          'Electron bridge unavailable. AMS must be launched through the Electron desktop process; the database is never accessed directly by the renderer.',
      });
      return;
    }
    void window.ams
      .getStatus()
      .then(setStatus)
      .catch((error) =>
        setStatus({
          ready: false,
          error: error instanceof Error ? error.message : 'Could not verify database startup.',
        }),
      );
  }, []);

  if (!status) {
    return (
      <div className="boot-state">
        <div className="loading">Initializing local database...</div>
      </div>
    );
  }

  if (!status.ready) {
    return (
      <div className="boot-state">
        <section className="boot-error">
          <div className="empty-icon">!</div>
          <h1>AMS could not start safely</h1>
          <p>{status.error}</p>
          <p>
            Close AMS, verify access to the application data folder, then relaunch. If the problem persists,
            restore from a verified SQLite backup.
          </p>
          <button className="primary" onClick={() => window.location.reload()}>
            Retry startup
          </button>
        </section>
      </div>
    );
  }

  return <Layout />;
}
