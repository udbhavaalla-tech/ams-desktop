import React, { useState, useMemo } from 'react';
import { useRows } from '../hooks/useRows';
import { Stat, Empty, Loading, PageHeading, ErrorBanner, SubNav } from '../components/ui';
import { Crud, type Field } from '../components/Crud';
import { format, isPast, isThisWeek } from 'date-fns';

export interface Task {
  id: string | number;
  title: string;
  description?: string | null;
  subject_id?: string | number | null;
  due_at?: string | null;
  priority?: 'low' | 'medium' | 'high';
  status?: 'pending' | 'in_progress' | 'completed';
  estimated_minutes?: number | null;
  created_at?: string;
  updated_at?: string;
}

export interface Subject {
  id: string | number;
  name: string;
  code?: string;
  color?: string;
}

type StatusFilter = 'all' | 'pending' | 'in_progress' | 'completed';
type PriorityFilter = 'all' | 'high' | 'medium' | 'low';
type SubNavTab = 'all' | 'priority' | 'subject';

export default function Tasks() {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [priorityFilter, setPriorityFilter] = useState<PriorityFilter>('all');
  const [subjectFilter, setSubjectFilter] = useState<string>('all');
  const [activeTab, setActiveTab] = useState<SubNavTab>('all');
  const [selectedTaskId, setSelectedTaskId] = useState<string | number | null>(null);

  // Load tasks and subjects
  const tasksHook = useRows<Task>('tasks', 'due_at ASC');
  const subjectsHook = useRows<Subject>('subjects', 'name ASC');

  const tasks: Task[] = useMemo(() => {
    if (Array.isArray(tasksHook)) return tasksHook[0] ?? [];
    return tasksHook?.rows ?? [];
  }, [tasksHook]);

  const tasksLoading = Array.isArray(tasksHook) ? tasksHook[1] : Boolean(tasksHook?.loading);
  const tasksError = Array.isArray(tasksHook) ? tasksHook[2] : (tasksHook?.error ?? null);

  const subjects: Subject[] = useMemo(() => {
    if (Array.isArray(subjectsHook)) return subjectsHook[0] ?? [];
    return subjectsHook?.rows ?? [];
  }, [subjectsHook]);

  const subjectMap = useMemo(() => {
    const map = new Map<string | number, Subject>();
    subjects.forEach((s) => map.set(s.id, s));
    return map;
  }, [subjects]);

  // Safe date parser helper
  const parseDate = (dateStr?: string | null): Date | null => {
    if (!dateStr) return null;
    const d = new Date(dateStr);
    return isNaN(d.getTime()) ? null : d;
  };

  // Stats calculation
  const stats = useMemo(() => {
    const total = tasks.length;
    const completed = tasks.filter((t) => t.status === 'completed').length;
    const overdue = tasks.filter((t) => {
      if (t.status === 'completed') return false;
      const d = parseDate(t.due_at);
      return d ? isPast(d) : false;
    }).length;
    const dueThisWeek = tasks.filter((t) => {
      const d = parseDate(t.due_at);
      return d ? isThisWeek(d, { weekStartsOn: 1 }) : false;
    }).length;

    return { total, completed, overdue, dueThisWeek };
  }, [tasks]);

  // Filter tasks with useMemo
  const filteredTasks = useMemo(() => {
    return tasks.filter((task) => {
      // 1. Search filter by title (case-insensitive)
      if (search.trim()) {
        const query = search.toLowerCase();
        const matchesTitle = task.title?.toLowerCase().includes(query);
        const matchesDesc = task.description?.toLowerCase().includes(query);
        if (!matchesTitle && !matchesDesc) return false;
      }

      // 2. Status filter
      if (statusFilter !== 'all') {
        const taskStatus = task.status || 'pending';
        if (taskStatus !== statusFilter) return false;
      }

      // 3. Priority filter
      if (priorityFilter !== 'all') {
        const taskPriority = task.priority || 'medium';
        if (taskPriority !== priorityFilter) return false;
      }

      // 4. Subject filter
      if (subjectFilter !== 'all') {
        if (String(task.subject_id ?? '') !== String(subjectFilter)) return false;
      }

      return true;
    });
  }, [tasks, search, statusFilter, priorityFilter, subjectFilter]);

  // Priority metadata styling helper
  const getPriorityStyle = (priority?: string) => {
    switch (priority) {
      case 'high':
        return { label: 'High', color: '#ef4444', bg: 'rgba(239, 68, 68, 0.15)', border: 'rgba(239, 68, 68, 0.3)' };
      case 'medium':
        return { label: 'Medium', color: '#f59e0b', bg: 'rgba(245, 158, 11, 0.15)', border: 'rgba(245, 158, 11, 0.3)' };
      case 'low':
      default:
        return { label: 'Low', color: '#10b981', bg: 'rgba(16, 185, 129, 0.15)', border: 'rgba(16, 185, 129, 0.3)' };
    }
  };

  // Status metadata styling helper
  const getStatusBadge = (status?: string) => {
    switch (status) {
      case 'completed':
        return { label: 'Completed', color: '#10b981', bg: 'rgba(16, 185, 129, 0.15)', border: 'rgba(16, 185, 129, 0.3)' };
      case 'in_progress':
        return { label: 'In Progress', color: '#3b82f6', bg: 'rgba(59, 130, 246, 0.15)', border: 'rgba(59, 130, 246, 0.3)' };
      case 'pending':
      default:
        return { label: 'Pending', color: '#f59e0b', bg: 'rgba(245, 158, 11, 0.15)', border: 'rgba(245, 158, 11, 0.3)' };
    }
  };

  // Card click to open edit in Crud
  const handleCardClick = (taskId: string | number) => {
    setSelectedTaskId(taskId);
    const crudElement = document.getElementById('task-crud-section');
    if (crudElement) {
      crudElement.scrollIntoView({ behavior: 'smooth' });
      // Trigger edit button in Crud table if present
      setTimeout(() => {
        const editBtn = crudElement.querySelector(
          `button[data-edit-id="${taskId}"], button[data-id="${taskId}"], tr[data-id="${taskId}"] button`
        ) as HTMLButtonElement | null;
        if (editBtn) {
          editBtn.click();
        }
      }, 150);
    }
  };

  // Crud Fields specification
  const taskFields: Field[] = useMemo(
    () => [
      {
        name: 'title',
        label: 'Task Title',
        type: 'text',
        required: true,
        placeholder: 'Enter task title...',
      },
      {
        name: 'description',
        label: 'Description',
        type: 'textarea',
        placeholder: 'Task description, notes, or assignment criteria...',
      },
      {
        name: 'subject_id',
        label: 'Subject',
        type: 'select',
        options: [
          { label: 'None / General', value: '' },
          ...subjects.map((s) => ({
            label: s.code ? `[${s.code}] ${s.name}` : s.name,
            value: s.id,
          })),
        ],
      },
      {
        name: 'due_at',
        label: 'Due Date & Time',
        type: 'datetime-local',
      },
      {
        name: 'priority',
        label: 'Priority',
        type: 'select',
        options: [
          { label: 'Low', value: 'low' },
          { label: 'Medium', value: 'medium' },
          { label: 'High', value: 'high' },
        ],
        defaultValue: 'medium',
      },
      {
        name: 'status',
        label: 'Status',
        type: 'select',
        options: [
          { label: 'Pending', value: 'pending' },
          { label: 'In Progress', value: 'in_progress' },
          { label: 'Completed', value: 'completed' },
        ],
        defaultValue: 'pending',
      },
      {
        name: 'estimated_minutes',
        label: 'Estimated Minutes',
        type: 'number',
        placeholder: 'e.g. 45',
      },
    ],
    [subjects]
  );

  // Filter function passed to Crud component
  const crudFilter = useMemo(() => {
    return (item: any) => {
      if (search.trim()) {
        const query = search.toLowerCase();
        const matchesTitle = item.title?.toLowerCase().includes(query);
        const matchesDesc = item.description?.toLowerCase().includes(query);
        if (!matchesTitle && !matchesDesc) return false;
      }
      if (statusFilter !== 'all' && (item.status || 'pending') !== statusFilter) {
        return false;
      }
      if (priorityFilter !== 'all' && (item.priority || 'medium') !== priorityFilter) {
        return false;
      }
      if (subjectFilter !== 'all' && String(item.subject_id ?? '') !== String(subjectFilter)) {
        return false;
      }
      return true;
    };
  }, [search, statusFilter, priorityFilter, subjectFilter]);

  // SubNav tab items
  const subNavItems = useMemo(
    () => [
      { id: 'all', label: 'All Tasks', count: filteredTasks.length },
      { id: 'priority', label: 'By Priority' },
      { id: 'subject', label: 'By Subject' },
    ],
    [filteredTasks.length]
  );

  // Grouped tasks for 'By Priority' view
  const tasksByPriority = useMemo(() => {
    const high = filteredTasks.filter((t) => t.priority === 'high');
    const medium = filteredTasks.filter((t) => !t.priority || t.priority === 'medium');
    const low = filteredTasks.filter((t) => t.priority === 'low');
    return [
      { title: 'High Priority', priority: 'high', tasks: high },
      { title: 'Medium Priority', priority: 'medium', tasks: medium },
      { title: 'Low Priority', priority: 'low', tasks: low },
    ];
  }, [filteredTasks]);

  // Grouped tasks for 'By Subject' view
  const tasksBySubject = useMemo(() => {
    const groups: { [key: string]: { name: string; code?: string; tasks: Task[] } } = {};

    filteredTasks.forEach((t) => {
      const subId = t.subject_id ? String(t.subject_id) : 'none';
      if (!groups[subId]) {
        const sub = t.subject_id ? subjectMap.get(t.subject_id) : undefined;
        groups[subId] = {
          name: sub ? sub.name : 'Unassigned / General',
          code: sub?.code,
          tasks: [],
        };
      }
      groups[subId].tasks.push(t);
    });

    return Object.values(groups);
  }, [filteredTasks, subjectMap]);

  // Render an individual task card
  const renderTaskCard = (task: Task) => {
    const pStyle = getPriorityStyle(task.priority);
    const sBadge = getStatusBadge(task.status);
    const subject = task.subject_id ? subjectMap.get(task.subject_id) : null;
    const dueDate = parseDate(task.due_at);
    const isTaskOverdue = dueDate && isPast(dueDate) && task.status !== 'completed';

    return (
      <div
        key={task.id}
        onClick={() => handleCardClick(task.id)}
        style={{
          background: '#0d1324',
          border: selectedTaskId === task.id ? '1px solid #6366f1' : '1px solid #1f293d',
          borderRadius: '10px',
          padding: '16px',
          cursor: 'pointer',
          transition: 'all 0.2s ease',
          boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.2)',
          display: 'flex',
          flexDirection: 'column',
          gap: '12px',
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.borderColor = '#6366f1';
          e.currentTarget.style.transform = 'translateY(-2px)';
        }}
        onMouseLeave={(e) => {
          if (selectedTaskId !== task.id) {
            e.currentTarget.style.borderColor = '#1f293d';
          }
          e.currentTarget.style.transform = 'translateY(0)';
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
          {/* Priority indicator badge */}
          <span
            style={{
              fontSize: '11px',
              fontWeight: 700,
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
              padding: '2px 8px',
              borderRadius: '9999px',
              color: pStyle.color,
              background: pStyle.bg,
              border: `1px solid ${pStyle.border}`,
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px',
            }}
          >
            <span
              style={{
                width: '6px',
                height: '6px',
                borderRadius: '50%',
                backgroundColor: pStyle.color,
              }}
            />
            {pStyle.label}
          </span>

          {/* Status badge */}
          <span
            style={{
              fontSize: '11px',
              fontWeight: 600,
              padding: '2px 8px',
              borderRadius: '9999px',
              color: sBadge.color,
              background: sBadge.bg,
              border: `1px solid ${sBadge.border}`,
            }}
          >
            {sBadge.label}
          </span>
        </div>

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
            {task.title}
          </h3>
          {task.description && (
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
              {task.description}
            </p>
          )}
        </div>

        <div
          style={{
            marginTop: 'auto',
            paddingTop: '10px',
            borderTop: '1px solid #161f36',
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '8px',
            fontSize: '12px',
          }}
        >
          {/* Subject name */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#94a3b8' }}>
            <span style={{ color: '#6366f1' }}>📚</span>
            <span style={{ fontWeight: 500 }}>
              {subject ? (subject.code ? `${subject.code} · ${subject.name}` : subject.name) : 'No Subject'}
            </span>
          </div>

          {/* Due date */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              color: isTaskOverdue ? '#ef4444' : dueDate ? '#94a3b8' : '#64748b',
              fontWeight: isTaskOverdue ? 600 : 400,
            }}
          >
            <span>📅</span>
            <span>
              {dueDate ? format(dueDate, 'MMM d, h:mm a') : 'No due date'}
              {isTaskOverdue ? ' (Overdue)' : ''}
            </span>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="page-container" style={{ padding: '24px', maxWidth: '1280px', margin: '0 auto', color: '#e5e7eb' }}>
      {/* Page Heading */}
      <PageHeading
        title="Tasks"
        description="Organize, track, and prioritize your academic assignments and coursework."
      />

      {tasksError && <ErrorBanner message={tasksError} />}

      {/* 3. Stats row */}
      <div
        className="stats-grid"
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
          gap: '16px',
          margin: '20px 0',
        }}
      >
        <Stat label="Total Tasks" value={stats.total} />
        <Stat label="Completed" value={stats.completed} accent="success" />
        <Stat label="Overdue Tasks" value={stats.overdue} accent="warning" />
        <Stat label="Due This Week" value={stats.dueThisWeek} accent="info" />
      </div>

      {/* 1. Search Bar & 2. Filter Controls */}
      <div
        style={{
          background: '#0d1324',
          border: '1px solid #1f293d',
          borderRadius: '12px',
          padding: '20px',
          marginBottom: '24px',
          display: 'flex',
          flexDirection: 'column',
          gap: '16px',
        }}
      >
        {/* Search input */}
        <div style={{ position: 'relative', width: '100%' }}>
          <span
            style={{
              position: 'absolute',
              left: '14px',
              top: '50%',
              transform: 'translateY(-50%)',
              color: '#7f8aa3',
              fontSize: '16px',
              pointerEvents: 'none',
            }}
          >
            🔍
          </span>
          <input
            type="text"
            placeholder="Search tasks by title or description..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{
              width: '100%',
              boxSizing: 'border-box',
              padding: '12px 40px 12px 42px',
              background: '#080c18',
              border: '1px solid #1f293d',
              borderRadius: '8px',
              color: '#e5e7eb',
              fontSize: '14px',
              outline: 'none',
              transition: 'border-color 0.2s',
            }}
            onFocus={(e) => (e.target.style.borderColor = '#6366f1')}
            onBlur={(e) => (e.target.style.borderColor = '#1f293d')}
          />
          {search && (
            <button
              onClick={() => setSearch('')}
              style={{
                position: 'absolute',
                right: '12px',
                top: '50%',
                transform: 'translateY(-50%)',
                background: 'transparent',
                border: 'none',
                color: '#7f8aa3',
                cursor: 'pointer',
                fontSize: '16px',
                padding: '4px',
              }}
              title="Clear search"
            >
              ✕
            </button>
          )}
        </div>

        {/* Filters row */}
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '16px',
          }}
        >
          {/* Status buttons */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
            <span style={{ fontSize: '13px', color: '#7f8aa3', fontWeight: 500 }}>Status:</span>
            {(['all', 'pending', 'in_progress', 'completed'] as StatusFilter[]).map((st) => {
              const active = statusFilter === st;
              const labels: Record<StatusFilter, string> = {
                all: 'All',
                pending: 'Pending',
                in_progress: 'In Progress',
                completed: 'Completed',
              };
              return (
                <button
                  key={st}
                  onClick={() => setStatusFilter(st)}
                  style={{
                    padding: '6px 14px',
                    fontSize: '13px',
                    fontWeight: 500,
                    borderRadius: '6px',
                    border: active ? '1px solid #6366f1' : '1px solid #1f293d',
                    background: active ? '#6366f1' : '#101626',
                    color: active ? '#ffffff' : '#94a3b8',
                    cursor: 'pointer',
                    transition: 'all 0.15s ease',
                  }}
                >
                  {labels[st]}
                </button>
              );
            })}
          </div>

          {/* Priority buttons */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
            <span style={{ fontSize: '13px', color: '#7f8aa3', fontWeight: 500 }}>Priority:</span>
            {(['all', 'high', 'medium', 'low'] as PriorityFilter[]).map((pr) => {
              const active = priorityFilter === pr;
              const labels: Record<PriorityFilter, string> = {
                all: 'All',
                high: 'High',
                medium: 'Medium',
                low: 'Low',
              };
              return (
                <button
                  key={pr}
                  onClick={() => setPriorityFilter(pr)}
                  style={{
                    padding: '6px 14px',
                    fontSize: '13px',
                    fontWeight: 500,
                    borderRadius: '6px',
                    border: active ? '1px solid #6366f1' : '1px solid #1f293d',
                    background: active ? '#6366f1' : '#101626',
                    color: active ? '#ffffff' : '#94a3b8',
                    cursor: 'pointer',
                    transition: 'all 0.15s ease',
                  }}
                >
                  {labels[pr]}
                </button>
              );
            })}
          </div>

          {/* Subject dropdown */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '13px', color: '#7f8aa3', fontWeight: 500 }}>Subject:</span>
            <select
              value={subjectFilter}
              onChange={(e) => setSubjectFilter(e.target.value)}
              style={{
                padding: '7px 12px',
                background: '#101626',
                border: '1px solid #1f293d',
                borderRadius: '6px',
                color: '#e5e7eb',
                fontSize: '13px',
                outline: 'none',
                cursor: 'pointer',
              }}
            >
              <option value="all">All Subjects</option>
              {subjects.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.code ? `${s.code} - ${s.name}` : s.name}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* 4. Sub-navigation tabs */}
      <div style={{ marginBottom: '20px' }}>
        <SubNav
          {...({
            items: subNavItems,
            tabs: subNavItems,
            active: activeTab,
            activeTab: activeTab,
            onChange: (id: string) => setActiveTab(id as SubNavTab),
            onTabChange: (id: string) => setActiveTab(id as SubNavTab),
          } as any)}
        />
      </div>

      {/* 6. Filtered Task Cards (Above Crud) */}
      <div style={{ marginBottom: '36px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
          <h2 style={{ fontSize: '18px', fontWeight: 600, color: '#e5e7eb', margin: 0 }}>
            Filtered Tasks ({filteredTasks.length})
          </h2>
          <span style={{ fontSize: '13px', color: '#7f8aa3' }}>
            Click any task card to edit in the manager below
          </span>
        </div>

        {tasksLoading ? (
          <Loading />
        ) : filteredTasks.length === 0 ? (
          <Empty message="No tasks found matching your search and filter criteria." />
        ) : activeTab === 'all' ? (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
              gap: '16px',
            }}
          >
            {filteredTasks.map(renderTaskCard)}
          </div>
        ) : activeTab === 'priority' ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
            {tasksByPriority.map((group) => (
              <div key={group.priority}>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    marginBottom: '12px',
                    paddingBottom: '6px',
                    borderBottom: '1px solid #1f293d',
                  }}
                >
                  <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 600, color: '#e5e7eb' }}>
                    {group.title}
                  </h3>
                  <span
                    style={{
                      fontSize: '12px',
                      padding: '2px 8px',
                      borderRadius: '9999px',
                      background: '#161f36',
                      color: '#7f8aa3',
                    }}
                  >
                    {group.tasks.length}
                  </span>
                </div>
                {group.tasks.length === 0 ? (
                  <p style={{ margin: 0, fontSize: '13px', color: '#64748b', fontStyle: 'italic' }}>
                    No {group.title.toLowerCase()} tasks
                  </p>
                ) : (
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
                      gap: '16px',
                    }}
                  >
                    {group.tasks.map(renderTaskCard)}
                  </div>
                )}
              </div>
            ))}
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
            {tasksBySubject.map((group, idx) => (
              <div key={idx}>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    marginBottom: '12px',
                    paddingBottom: '6px',
                    borderBottom: '1px solid #1f293d',
                  }}
                >
                  <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 600, color: '#e5e7eb' }}>
                    {group.code ? `[${group.code}] ${group.name}` : group.name}
                  </h3>
                  <span
                    style={{
                      fontSize: '12px',
                      padding: '2px 8px',
                      borderRadius: '9999px',
                      background: '#161f36',
                      color: '#7f8aa3',
                    }}
                  >
                    {group.tasks.length}
                  </span>
                </div>
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
                    gap: '16px',
                  }}
                >
                  {group.tasks.map(renderTaskCard)}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 5. Task List CRUD Section */}
      <div id="task-crud-section" style={{ borderTop: '1px solid #1f293d', paddingTop: '32px' }}>
        <div style={{ marginBottom: '16px' }}>
          <h2 style={{ fontSize: '18px', fontWeight: 600, color: '#e5e7eb', margin: '0 0 4px 0' }}>
            Task Management Table
          </h2>
          <p style={{ margin: 0, fontSize: '13px', color: '#7f8aa3' }}>
            Create new tasks, modify details, or delete completed tasks below.
          </p>
        </div>

        <Crud
          entity="tasks"
          title="Task"
          fields={taskFields}
          {...({
            filter: crudFilter,
            filterFn: crudFilter,
            selectedId: selectedTaskId,
            editId: selectedTaskId,
          } as any)}
        />
      </div>
    </div>
  );
}
