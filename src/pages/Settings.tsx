import { useState } from 'react';
import { useRows } from '../hooks/useRows';
import { PageHeading, ErrorBanner, SuccessBanner, Loading } from '../components/ui';

export default function Settings() {
  const [backupMessage, setBackupMessage] = useState('');
  const [backupError, setBackupError] = useState('');
  const [isBackingUp, setIsBackingUp] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);

  const [notificationStatus, setNotificationStatus] = useState('');

  // 4. Data Summary: Load counts using useRows for each entity
  const programmes = useRows('programmes');
  const semesters = useRows('semesters');
  const subjects = useRows('subjects');
  const units = useRows('units');
  const topics = useRows('topics');
  const tasks = useRows('tasks');
  const events = useRows('calendar_events');
  const habits = useRows('habits');
  const sessions = useRows('study_sessions');
  const reminders = useRows('reminders');

  const isDataSummaryLoading =
    programmes.loading &&
    semesters.loading &&
    subjects.loading &&
    units.loading &&
    topics.loading &&
    tasks.loading &&
    events.loading &&
    habits.loading &&
    sessions.loading &&
    reminders.loading;

  // 1. Database backup handlers
  async function handleBackup() {
    setBackupMessage('');
    setBackupError('');
    setIsBackingUp(true);
    try {
      const path = await window.ams.backup();
      if (path) {
        setBackupMessage(`Database backup successfully saved to: ${path}`);
      } else {
        setBackupMessage('Backup process was cancelled.');
      }
    } catch (err) {
      setBackupError(err instanceof Error ? err.message : 'An error occurred during database backup.');
    } finally {
      setIsBackingUp(false);
    }
  }

  async function handleRestore() {
    setBackupMessage('');
    setBackupError('');

    const confirmed = window.confirm(
      'Restore database from a backup file?\n\nWARNING: All current data will be overwritten with records from the chosen backup file.'
    );
    if (!confirmed) return;

    setIsRestoring(true);
    try {
      const path = await window.ams.restore();
      if (path) {
        setBackupMessage(`Database successfully restored from: ${path}. Reloading the application is recommended to synchronize all views.`);
      } else {
        setBackupMessage('Restore process was cancelled.');
      }
    } catch (err) {
      setBackupError(err instanceof Error ? err.message : 'An error occurred during database restoration.');
    } finally {
      setIsRestoring(false);
    }
  }

  // 2. Notifications test handler
  async function handleTestNotification() {
    setNotificationStatus('');
    try {
      const delivered = await window.ams.notify('AMS Desktop', 'Notifications are working!');
      if (delivered) {
        setNotificationStatus('Test notification sent! Check your desktop notification center.');
      } else {
        setNotificationStatus('Notification request dispatched. If nothing appeared, check OS notification settings.');
      }
    } catch (err) {
      setNotificationStatus(`Failed to send notification: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
  }

  const dataSummaryEntities = [
    { label: 'Programmes', count: programmes.rows.length, loading: programmes.loading },
    { label: 'Semesters', count: semesters.rows.length, loading: semesters.loading },
    { label: 'Subjects', count: subjects.rows.length, loading: subjects.loading },
    { label: 'Units', count: units.rows.length, loading: units.loading },
    { label: 'Topics', count: topics.rows.length, loading: topics.loading },
    { label: 'Tasks', count: tasks.rows.length, loading: tasks.loading },
    { label: 'Events', count: events.rows.length, loading: events.loading },
    { label: 'Habits', count: habits.rows.length, loading: habits.loading },
    { label: 'Sessions', count: sessions.rows.length, loading: sessions.loading },
    { label: 'Reminders', count: reminders.rows.length, loading: reminders.loading },
  ];

  return (
    <div>
      <PageHeading
        title="Settings & Maintenance"
        subtitle="Configure application preferences, local database backups, and data inspection"
      />

      {backupMessage && <SuccessBanner message={backupMessage} />}
      {backupError && <ErrorBanner message={backupError} />}

      {/* 1. Database Backup Section */}
      <section className="panel settings-panel">
        <div className="panel-heading" style={{ margin: '-18px -18px 14px', padding: '0 18px' }}>
          <h3>Database Backup & Recovery</h3>
        </div>
        <p>
          Save a complete copy of your local SQLite database file to your machine, or restore an earlier snapshot.
          Restoring replaces all current application data with the contents of the chosen backup file.
        </p>
        <div className="settings-actions">
          <button
            type="button"
            className="primary"
            onClick={() => void handleBackup()}
            disabled={isBackingUp || isRestoring}
          >
            {isBackingUp ? 'Creating backup...' : 'Create backup'}
          </button>
          <button
            type="button"
            className="danger"
            onClick={() => void handleRestore()}
            disabled={isBackingUp || isRestoring}
          >
            {isRestoring ? 'Restoring backup...' : 'Restore backup'}
          </button>
        </div>
      </section>

      {/* 2. Notifications Section */}
      <section className="panel settings-panel">
        <div className="panel-heading" style={{ margin: '-18px -18px 14px', padding: '0 18px' }}>
          <h3>Desktop Notifications</h3>
        </div>
        <p>
          Native desktop notifications keep you alerted of upcoming task deadlines, scheduled reminders,
          and study sessions via Electron&apos;s system notification integration.
        </p>
        <div
          style={{
            margin: '14px 0',
            padding: '12px 14px',
            borderRadius: '8px',
            background: '#0d1324',
            border: '1px solid #202940',
            fontSize: '12px',
            color: '#fbbf24',
          }}
        >
          <strong>Limitation Note:</strong> Notifications can only be delivered while AMS Desktop is actively running in the background. If the application is closed or the host operating system is asleep, reminders scheduled during that window will not fire.
        </div>
        {notificationStatus && (
          <div style={{ margin: '10px 0', fontSize: '12px', color: '#a7f3d0' }}>
            {notificationStatus}
          </div>
        )}
        <div className="settings-actions">
          <button
            type="button"
            className="ghost"
            onClick={() => void handleTestNotification()}
          >
            Test notification
          </button>
        </div>
      </section>

      {/* 3. Application Info Section */}
      <section className="panel settings-panel">
        <div className="panel-heading" style={{ margin: '-18px -18px 14px', padding: '0 18px' }}>
          <h3>Application Info</h3>
        </div>
        <p style={{ marginBottom: '16px' }}>
          System details and technology specifications for your installation.
        </p>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))',
            gap: '12px',
          }}
        >
          <div style={{ padding: '12px 14px', borderRadius: '8px', border: '1px solid #1c263b', background: '#0d1324' }}>
            <span style={{ fontSize: '11px', color: '#7f8aa3', display: 'block' }}>App Name</span>
            <strong style={{ fontSize: '14px', color: '#f8fafc' }}>AMS Desktop</strong>
          </div>
          <div style={{ padding: '12px 14px', borderRadius: '8px', border: '1px solid #1c263b', background: '#0d1324' }}>
            <span style={{ fontSize: '11px', color: '#7f8aa3', display: 'block' }}>Version</span>
            <strong style={{ fontSize: '14px', color: '#f8fafc' }}>1.0.0</strong>
          </div>
          <div style={{ padding: '12px 14px', borderRadius: '8px', border: '1px solid #1c263b', background: '#0d1324' }}>
            <span style={{ fontSize: '11px', color: '#7f8aa3', display: 'block' }}>Database</span>
            <strong style={{ fontSize: '14px', color: '#f8fafc' }}>Local SQLite (sql.js)</strong>
          </div>
          <div style={{ padding: '12px 14px', borderRadius: '8px', border: '1px solid #1c263b', background: '#0d1324' }}>
            <span style={{ fontSize: '11px', color: '#7f8aa3', display: 'block' }}>Framework</span>
            <strong style={{ fontSize: '14px', color: '#f8fafc' }}>Electron + React</strong>
          </div>
          <div style={{ padding: '12px 14px', borderRadius: '8px', border: '1px solid #1c263b', background: '#0d1324' }}>
            <span style={{ fontSize: '11px', color: '#7f8aa3', display: 'block' }}>Data Storage</span>
            <strong style={{ fontSize: '14px', color: '#f8fafc' }}>Local only, no cloud services</strong>
          </div>
        </div>
      </section>

      {/* 4. Data Summary Section */}
      <section className="panel settings-panel">
        <div className="panel-heading" style={{ margin: '-18px -18px 14px', padding: '0 18px' }}>
          <h3>Data Summary</h3>
          <span style={{ fontSize: '12px', color: '#7f8aa3' }}>
            Active table record tallies
          </span>
        </div>
        <p style={{ marginBottom: '16px' }}>
          Real-time count of records persisted across local database tables.
        </p>
        {isDataSummaryLoading ? (
          <Loading text="Tallying database records..." />
        ) : (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(170px, 1fr))',
              gap: '12px',
            }}
          >
            {dataSummaryEntities.map(entity => (
              <div
                key={entity.label}
                className="stat-card"
                style={{
                  background: '#0d1324',
                  minHeight: '84px',
                  padding: '14px 16px',
                }}
              >
                <span>{entity.label}</span>
                <strong>{entity.loading ? '...' : entity.count}</strong>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* 5. Privacy Section */}
      <section className="panel settings-panel">
        <div className="panel-heading" style={{ margin: '-18px -18px 14px', padding: '0 18px' }}>
          <h3>Privacy & Data Sovereignty</h3>
        </div>
        <p style={{ marginBottom: '12px' }}>
          AMS Desktop operates entirely offline. All data is stored locally in your operating system&apos;s
          application profile directory using an embedded SQLite database via sql.js.
        </p>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
            gap: '12px',
            marginTop: '14px',
          }}
        >
          <div
            style={{
              padding: '14px',
              borderRadius: '8px',
              background: '#0d1324',
              border: '1px solid #1c263b',
            }}
          >
            <strong style={{ color: '#818cf8', display: 'block', fontSize: '13px', marginBottom: '4px' }}>
              No Cloud Dependencies
            </strong>
            <p style={{ fontSize: '12px', color: '#9aa5bd', margin: 0 }}>
              Your academic coursework, schedules, and study records are never uploaded to any remote server or external cloud provider.
            </p>
          </div>
          <div
            style={{
              padding: '14px',
              borderRadius: '8px',
              background: '#0d1324',
              border: '1px solid #1c263b',
            }}
          >
            <strong style={{ color: '#818cf8', display: 'block', fontSize: '13px', marginBottom: '4px' }}>
              No Paid Services
            </strong>
            <p style={{ fontSize: '12px', color: '#9aa5bd', margin: 0 }}>
              All features—focus timer, syllabus tracker, analytics, and notification triggers—are fully available offline without subscriptions or paywalls.
            </p>
          </div>
          <div
            style={{
              padding: '14px',
              borderRadius: '8px',
              background: '#0d1324',
              border: '1px solid #1c263b',
            }}
          >
            <strong style={{ color: '#818cf8', display: 'block', fontSize: '13px', marginBottom: '4px' }}>
              Zero Telemetry & Tracking
            </strong>
            <p style={{ fontSize: '12px', color: '#9aa5bd', margin: 0 }}>
              No analytics beacons, tracking identifiers, or usage statistics are collected. Your productivity data remains private to you.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}
