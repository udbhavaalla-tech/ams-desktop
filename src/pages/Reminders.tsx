import React, { useState, useMemo } from 'react';
import { useRows } from '../hooks/useRows';
import { Stat, Empty, Loading, PageHeading, ErrorBanner, SubNav } from '../components/ui';
import { Crud, type Field } from '../components/Crud';
import { format } from 'date-fns';
import { calculateReminderOccurrences } from '../shared/business';

export interface Reminder {
  id: string | number;
  title: string;
  message?: string | null;
  scheduled_at: string;
  recurrence?: 'once' | 'daily' | 'weekly' | 'monthly' | string;
  until_at?: string | null;
  completed?: number | boolean;
  notification_id?: string | null;
  created_at?: string;
  updated_at?: string;
}

type TabType = 'all' | 'pending' | 'delivered';

export default function Reminders() {
  const [activeTab, setActiveTab] = useState<TabType>('all');
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);
  const [deliveringId, setDeliveringId] = useState<string | number | null>(null);

  // Load reminders
  const remindersHook = useRows<Reminder>('reminders', 'scheduled_at ASC');

  const reminders: Reminder[] = useMemo(() => {
    if (Array.isArray(remindersHook)) return remindersHook[0] ?? [];
    return remindersHook?.rows ?? [];
  }, [remindersHook]);

  const remindersLoading = Array.isArray(remindersHook) ? remindersHook[1] : Boolean(remindersHook?.loading);
  const remindersError = Array.isArray(remindersHook) ? remindersHook[2] : (remindersHook?.error ?? null);
  const reloadReminders = Array.isArray(remindersHook)
    ? remindersHook[3]
    : remindersHook?.reload;

  // Safe date helper
  const parseDate = (dateStr?: string | null): Date | null => {
    if (!dateStr) return null;
    const d = new Date(dateStr);
    return isNaN(d.getTime()) ? null : d;
  };

  // Next occurrence helper using calculateReminderOccurrences
  const getNextOccurrence = (reminder: Reminder): Date | null => {
    if (!reminder.scheduled_at) return null;

    if (reminder.recurrence && reminder.recurrence !== 'once') {
      try {
        const horizon = new Date();
        horizon.setFullYear(horizon.getFullYear() + 2);
        const occurrences = calculateReminderOccurrences(
          reminder.scheduled_at,
          reminder.recurrence,
          reminder.until_at || null,
          horizon,
        );
        if (occurrences.length > 0) {
          const now = Date.now();
          const future = occurrences
            .map((item) => new Date(item))
            .find((date) => !isNaN(date.getTime()) && date.getTime() > now);
          if (future) return future;
          const first = new Date(occurrences[0]);
          if (!isNaN(first.getTime())) return first;
        }
      } catch (err) {
        console.warn('calculateReminderOccurrences failed', err);
      }
    }

    return parseDate(reminder.scheduled_at);
  };

  // 4. Stats Calculation
  const stats = useMemo(() => {
    const total = reminders.length;
    const pending = reminders.filter((r) => !r.completed || r.completed === 0).length;
    const delivered = reminders.filter((r) => r.completed === 1 || Boolean(r.notification_id)).length;
    const recurring = reminders.filter((r) => r.recurrence && r.recurrence !== 'once').length;

    return { total, pending, delivered, recurring };
  }, [reminders]);

  // 1. Upcoming Reminders Sorted by scheduled_at
  const upcomingReminders = useMemo(() => {
    const sorted = [...reminders].sort((a, b) => {
      const timeA = a.scheduled_at ? new Date(a.scheduled_at).getTime() : 0;
      const timeB = b.scheduled_at ? new Date(b.scheduled_at).getTime() : 0;
      return timeA - timeB;
    });

    if (activeTab === 'pending') {
      return sorted.filter((r) => !r.completed || r.completed === 0);
    }
    if (activeTab === 'delivered') {
      return sorted.filter((r) => r.completed === 1 || Boolean(r.notification_id));
    }
    return sorted;
  }, [reminders, activeTab]);

  // 2. Delivery handler with duplicate prevention & error handling
  const handleDeliverNow = async (reminder: Reminder) => {
    setActionError(null);
    setActionSuccess(null);

    // Duplicate check
    const isAlreadyDelivered = Boolean(reminder.notification_id) || reminder.completed === 1;
    if (isAlreadyDelivered) {
      setActionError(`Reminder "${reminder.title}" has already been delivered.`);
      return;
    }

    // Check notification support in window.ams
    const ams = typeof window !== 'undefined' ? (window as any).ams : undefined;
    if (!ams || typeof ams.notify !== 'function') {
      setActionError('Desktop notifications are not supported or the desktop bridge is unavailable.');
      return;
    }

    setDeliveringId(reminder.id);
    try {
      const title = reminder.title || 'Academic Reminder';
      const message = reminder.message || 'You have an upcoming academic reminder scheduled.';

      // Call desktop notification bridge
      const delivered = await ams.notify(title, message);

      if (delivered === false) {
        setActionError('The desktop notification could not be delivered.');
        setDeliveringId(null);
        return;
      }

      // Generate notification UUID
      const notificationId =
        typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
          ? crypto.randomUUID()
          : `notif-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;

      // Update reminder in DB
      if (ams.db && typeof ams.db.update === 'function') {
        await ams.db.update('reminders', reminder.id, {
          notification_id: notificationId,
          completed: 1,
        });
      }

      // Refresh list
      if (typeof reloadReminders === 'function') {
        await reloadReminders();
      }

      setActionSuccess(`Notification delivered successfully for "${reminder.title}"!`);
    } catch (err: any) {
      setActionError(err?.message || 'Failed to deliver notification.');
    } finally {
      setDeliveringId(null);
    }
  };

  // 3. Reminder CRUD Field Configuration
  const reminderFields: Field[] = useMemo(
    () => [
      {
        name: 'title',
        label: 'Reminder Title',
        type: 'text',
        required: true,
        placeholder: 'e.g., Submit Assignment 3 or Lab Prep',
      },
      {
        name: 'message',
        label: 'Message / Notes',
        type: 'textarea',
        placeholder: 'Details to display in the desktop notification...',
      },
      {
        name: 'scheduled_at',
        label: 'Scheduled Time',
        type: 'datetime-local',
        required: true,
      },
      {
        name: 'recurrence',
        label: 'Recurrence',
        type: 'select',
        options: [
          { label: 'Once', value: 'once' },
          { label: 'Daily', value: 'daily' },
          { label: 'Weekly', value: 'weekly' },
          { label: 'Monthly', value: 'monthly' },
        ],
        defaultValue: 'once',
      },
      {
        name: 'until_at',
        label: 'Repeat Until',
        type: 'datetime-local',
      },
      {
        name: 'completed',
        label: 'Completed / Delivered',
        type: 'checkbox',
        defaultValue: false,
      },
    ],
    []
  );

  // Recurrence badge styling helper
  const getRecurrenceBadge = (recurrence?: string) => {
    switch (recurrence) {
      case 'daily':
        return { label: 'Daily', color: '#06b6d4', bg: 'rgba(6, 182, 212, 0.15)', border: 'rgba(6, 182, 212, 0.3)' };
      case 'weekly':
        return { label: 'Weekly', color: '#818cf8', bg: 'rgba(129, 140, 248, 0.15)', border: 'rgba(129, 140, 248, 0.3)' };
      case 'monthly':
        return { label: 'Monthly', color: '#c084fc', bg: 'rgba(192, 132, 252, 0.15)', border: 'rgba(192, 132, 252, 0.3)' };
      case 'once':
      default:
        return { label: 'Once', color: '#94a3b8', bg: 'rgba(148, 163, 184, 0.15)', border: 'rgba(148, 163, 184, 0.3)' };
    }
  };

  // SubNav tabs items
  const subNavItems = useMemo(
    () => [
      { id: 'all', label: 'All Reminders', count: reminders.length },
      { id: 'pending', label: 'Pending Delivery', count: stats.pending },
      { id: 'delivered', label: 'Delivered', count: stats.delivered },
    ],
    [reminders.length, stats.pending, stats.delivered]
  );

  return (
    <div className="page-container" style={{ padding: '24px', maxWidth: '1280px', margin: '0 auto', color: '#e5e7eb' }}>
      {/* Page Heading */}
      <PageHeading
        title="Reminders"
        description="Schedule notifications and manage alerts for your academic deadlines and milestones."
      />

      {remindersError && <ErrorBanner message={remindersError} />}

      {/* Action banners */}
      {actionError && (
        <div style={{ marginBottom: '16px' }}>
          <ErrorBanner message={actionError} />
        </div>
      )}

      {actionSuccess && (
        <div
          style={{
            background: 'rgba(16, 185, 129, 0.15)',
            border: '1px solid rgba(16, 185, 129, 0.3)',
            borderRadius: '8px',
            padding: '12px 16px',
            marginBottom: '16px',
            color: '#10b981',
            fontSize: '14px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <span>✓ {actionSuccess}</span>
          <button
            onClick={() => setActionSuccess(null)}
            style={{ background: 'transparent', border: 'none', color: '#10b981', cursor: 'pointer' }}
          >
            ✕
          </button>
        </div>
      )}

      {/* 4. Stats Row */}
      <div
        className="stats-grid"
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
          gap: '16px',
          margin: '20px 0',
        }}
      >
        <Stat label="Total Reminders" value={stats.total} />
        <Stat label="Pending Delivery" value={stats.pending} accent="warning" />
        <Stat label="Delivered" value={stats.delivered} accent="success" />
        <Stat label="Recurring" value={stats.recurring} accent="info" />
      </div>

      {/* 5. Notification Info Panel */}
      <div
        style={{
          background: '#101626',
          border: '1px solid #1f293d',
          borderRadius: '10px',
          padding: '16px 20px',
          display: 'flex',
          alignItems: 'flex-start',
          gap: '14px',
          marginBottom: '28px',
          boxShadow: '0 2px 4px rgba(0, 0, 0, 0.2)',
        }}
      >
        <div style={{ fontSize: '22px', lineHeight: 1 }}>🔔</div>
        <div>
          <h4 style={{ margin: '0 0 6px 0', fontSize: '14px', color: '#e5e7eb', fontWeight: 600 }}>
            Desktop Notification Service
          </h4>
          <p style={{ margin: 0, fontSize: '13px', color: '#7f8aa3', lineHeight: 1.5 }}>
            Desktop notifications are dispatched via the native system tray while AMS is running.
            Please ensure AMS remains open or minimized in the background to receive alerts on schedule.
            Reminders and sound alerts are not guaranteed when the application is completely closed.
          </p>
        </div>
      </div>

      {/* SubNav Tabs */}
      <div style={{ marginBottom: '20px' }}>
        <SubNav
          {...({
            items: subNavItems,
            tabs: subNavItems,
            active: activeTab,
            activeTab: activeTab,
            onChange: (id: string) => setActiveTab(id as TabType),
            onTabChange: (id: string) => setActiveTab(id as TabType),
          } as any)}
        />
      </div>

      {/* 1. Upcoming Reminders Section & 2. Delivery Panel */}
      <div style={{ marginBottom: '40px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
          <div>
            <h2 style={{ fontSize: '18px', fontWeight: 600, color: '#e5e7eb', margin: '0 0 4px 0' }}>
              Upcoming Reminders & Delivery ({upcomingReminders.length})
            </h2>
            <p style={{ margin: 0, fontSize: '13px', color: '#7f8aa3' }}>
              Chronologically ordered alerts with instant desktop delivery controls.
            </p>
          </div>
        </div>

        {remindersLoading ? (
          <Loading />
        ) : upcomingReminders.length === 0 ? (
          <Empty message="No reminders found in this view." />
        ) : (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
              gap: '16px',
            }}
          >
            {upcomingReminders.map((reminder) => {
              const isDelivered = Boolean(reminder.notification_id) || reminder.completed === 1;
              const scheduledDate = parseDate(reminder.scheduled_at);
              const nextOccurrence = getNextOccurrence(reminder);
              const isRecurring = reminder.recurrence && reminder.recurrence !== 'once';
              const recBadge = getRecurrenceBadge(reminder.recurrence);
              const isDelivering = deliveringId === reminder.id;

              return (
                <div
                  key={reminder.id}
                  style={{
                    background: '#0d1324',
                    border: '1px solid #1f293d',
                    borderRadius: '10px',
                    padding: '18px',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                    gap: '14px',
                    boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.2)',
                  }}
                >
                  {/* Top Bar: Recurrence and Delivery Status */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
                    {/* Recurrence badge */}
                    <span
                      style={{
                        fontSize: '11px',
                        fontWeight: 600,
                        padding: '2px 8px',
                        borderRadius: '9999px',
                        color: recBadge.color,
                        background: recBadge.bg,
                        border: `1px solid ${recBadge.border}`,
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '4px',
                      }}
                    >
                      {isRecurring ? '🔄 ' : '📌 '}
                      {recBadge.label}
                    </span>

                    {/* Delivery Status Badge */}
                    <span
                      style={{
                        fontSize: '11px',
                        fontWeight: 600,
                        padding: '2px 8px',
                        borderRadius: '9999px',
                        color: isDelivered ? '#10b981' : '#f59e0b',
                        background: isDelivered ? 'rgba(16, 185, 129, 0.15)' : 'rgba(245, 158, 11, 0.15)',
                        border: isDelivered ? '1px solid rgba(16, 185, 129, 0.3)' : '1px solid rgba(245, 158, 11, 0.3)',
                      }}
                    >
                      {isDelivered ? '✓ Delivered' : '⏳ Pending'}
                    </span>
                  </div>

                  {/* Title & Message Preview */}
                  <div>
                    <h3
                      style={{
                        margin: '0 0 6px 0',
                        fontSize: '15px',
                        fontWeight: 600,
                        color: '#e5e7eb',
                        lineHeight: 1.3,
                      }}
                    >
                      {reminder.title}
                    </h3>
                    <p
                      style={{
                        margin: 0,
                        fontSize: '13px',
                        color: '#7f8aa3',
                        lineHeight: 1.4,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        display: '-webkit-box',
                        WebkitLineClamp: 2,
                        WebkitBoxOrient: 'vertical',
                      }}
                    >
                      {reminder.message || 'No additional message provided.'}
                    </p>
                  </div>

                  {/* Scheduled Times Info */}
                  <div
                    style={{
                      background: '#101626',
                      borderRadius: '6px',
                      padding: '10px 12px',
                      fontSize: '12px',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '4px',
                      color: '#94a3b8',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ color: '#7f8aa3' }}>Scheduled:</span>
                      <span style={{ fontWeight: 500, color: '#e5e7eb' }}>
                        {scheduledDate ? format(scheduledDate, 'MMM d, yyyy h:mm a') : 'Not set'}
                      </span>
                    </div>

                    {isRecurring && nextOccurrence && (
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ color: '#7f8aa3' }}>Next occurrence:</span>
                        <span style={{ fontWeight: 500, color: '#818cf8' }}>
                          {format(nextOccurrence, 'MMM d, yyyy h:mm a')}
                        </span>
                      </div>
                    )}

                    {reminder.until_at && (
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ color: '#7f8aa3' }}>Repeat until:</span>
                        <span>
                          {format(new Date(reminder.until_at), 'MMM d, yyyy')}
                        </span>
                      </div>
                    )}
                  </div>

                  {/* 2. Delivery Panel Action Button */}
                  <div style={{ marginTop: '4px' }}>
                    {isDelivered ? (
                      <button
                        disabled
                        style={{
                          width: '100%',
                          padding: '8px 14px',
                          fontSize: '13px',
                          fontWeight: 500,
                          borderRadius: '6px',
                          border: '1px solid #1f293d',
                          background: '#161f36',
                          color: '#64748b',
                          cursor: 'not-allowed',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: '6px',
                        }}
                      >
                        <span>✓</span>
                        Already delivered
                      </button>
                    ) : (
                      <button
                        onClick={() => handleDeliverNow(reminder)}
                        disabled={isDelivering}
                        style={{
                          width: '100%',
                          padding: '8px 14px',
                          fontSize: '13px',
                          fontWeight: 500,
                          borderRadius: '6px',
                          border: '1px solid #6366f1',
                          background: '#6366f1',
                          color: '#ffffff',
                          cursor: isDelivering ? 'wait' : 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: '6px',
                          transition: 'background 0.15s ease',
                        }}
                        onMouseEnter={(e) => {
                          if (!isDelivering) e.currentTarget.style.background = '#4f46e5';
                        }}
                        onMouseLeave={(e) => {
                          if (!isDelivering) e.currentTarget.style.background = '#6366f1';
                        }}
                      >
                        <span>🚀</span>
                        {isDelivering ? 'Delivering...' : 'Deliver now'}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* 3. Reminder CRUD Section */}
      <div id="reminder-crud-section" style={{ borderTop: '1px solid #1f293d', paddingTop: '32px' }}>
        <div style={{ marginBottom: '16px' }}>
          <h2 style={{ fontSize: '18px', fontWeight: 600, color: '#e5e7eb', margin: '0 0 4px 0' }}>
            Reminder Management Table
          </h2>
          <p style={{ margin: 0, fontSize: '13px', color: '#7f8aa3' }}>
            Add, update, or remove reminders and configure automated recurring alerts.
          </p>
        </div>

        <Crud
          entity="reminders"
          title="Reminder"
          fields={reminderFields}
        />
      </div>
    </div>
  );
}
