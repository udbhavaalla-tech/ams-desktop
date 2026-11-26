import React, { useState, useMemo } from 'react';
import { useRows } from '../hooks/useRows';
import { PageHeading, Empty, Loading, ErrorBanner } from '../components/ui';
import { Crud, type Field } from '../components/Crud';
import { calculateSyllabusCompletion } from '../shared/business';

type AcademicTab = 'programmes' | 'semesters' | 'subjects' | 'units' | 'topics';

interface Programme {
  id: string | number;
  name: string;
  code?: string;
  status?: string;
  description?: string;
}

interface Semester {
  id: string | number;
  programme_id: string | number;
  name: string;
  start_date?: string;
  end_date?: string;
  status?: string;
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
  title?: string;
  name?: string;
  unit_number?: number;
  order_index?: number;
  description?: string;
}

interface Topic {
  id: string | number;
  unit_id: string | number;
  title: string;
  completed?: number | boolean;
  notes?: string;
  order_index?: number;
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
    // fallback
  }
  const completed = relevantTopics.filter((t) => Number(t.completed) === 1 || t.completed === true).length;
  return Math.max(0, Math.min(100, Math.round((completed / relevantTopics.length) * 100)));
}

function getTopicVisualStatus(topic: Topic): { label: string; color: string; bg: string } {
  if (Number(topic.completed) === 1 || topic.completed === true) {
    return { label: 'Completed', color: '#10b981', bg: 'rgba(16, 185, 129, 0.15)' };
  }
  if (topic.notes === 'in_progress') {
    return { label: 'In Progress', color: '#6366f1', bg: 'rgba(99, 102, 241, 0.15)' };
  }
  if (topic.notes === 'needs_revision') {
    return { label: 'Needs Revision', color: '#f59e0b', bg: 'rgba(245, 158, 11, 0.15)' };
  }
  return { label: 'Not Started', color: '#7f8aa3', bg: 'rgba(127, 138, 163, 0.15)' };
}

export default function Academics(): JSX.Element {
  const [activeTab, setActiveTab] = useState<AcademicTab>('programmes');

  // Load all academic entities using useRows
  const { rows: programmes = [], loading: progLoading, error: progError } = useRows<Programme>('programmes');
  const { rows: semesters = [], loading: semLoading, error: semError } = useRows<Semester>('semesters');
  const { rows: subjects = [], loading: subjLoading, error: subjError } = useRows<Subject>('subjects');
  const { rows: units = [], loading: unitsLoading, error: unitsError } = useRows<Unit>('units');
  const { rows: topics = [], loading: topicsLoading, error: topicsError } = useRows<Topic>('topics');

  // Quick lookup maps
  const programmesMap = useMemo(() => {
    const map = new Map<string, Programme>();
    programmes.forEach((p) => map.set(String(p.id), p));
    return map;
  }, [programmes]);

  const semestersMap = useMemo(() => {
    const map = new Map<string, Semester>();
    semesters.forEach((s) => map.set(String(s.id), s));
    return map;
  }, [semesters]);

  const subjectsMap = useMemo(() => {
    const map = new Map<string, Subject>();
    subjects.forEach((s) => map.set(String(s.id), s));
    return map;
  }, [subjects]);

  const unitsMap = useMemo(() => {
    const map = new Map<string, Unit>();
    units.forEach((u) => map.set(String(u.id), u));
    return map;
  }, [units]);

  // Field definitions for Crud matching database schema
  const programmeFields: Field[] = useMemo(
    () => [
      { name: 'name', label: 'Programme Name', type: 'text', required: true, placeholder: 'e.g. Bachelor of Science in CS' },
      { name: 'code', label: 'Code', type: 'text', required: false, placeholder: 'e.g. BSCS' },
      {
        name: 'status',
        label: 'Status',
        type: 'select',
        options: [
          { label: 'Active', value: 'active' },
          { label: 'Completed', value: 'completed' },
          { label: 'Archived', value: 'archived' },
        ],
        defaultValue: 'active',
      },
      { name: 'description', label: 'Description', type: 'textarea', placeholder: 'Programme details...' },
    ],
    []
  );

  const semesterFields: Field[] = useMemo(
    () => [
      {
        name: 'programme_id',
        label: 'Programme',
        type: 'select',
        required: true,
        options: programmes.map((p) => ({
          label: `${p.name}${p.code ? ` (${p.code})` : ''}`,
          value: p.id,
        })),
      },
      { name: 'name', label: 'Semester Name', type: 'text', required: true, placeholder: 'e.g. Semester 1 / Fall 2024' },
      { name: 'start_date', label: 'Start Date', type: 'date' },
      { name: 'end_date', label: 'End Date', type: 'date' },
      {
        name: 'status',
        label: 'Status',
        type: 'select',
        options: [
          { label: 'Upcoming', value: 'upcoming' },
          { label: 'Active', value: 'active' },
          { label: 'Completed', value: 'completed' },
        ],
        defaultValue: 'active',
      },
    ],
    [programmes]
  );

  const subjectFields: Field[] = useMemo(
    () => [
      {
        name: 'semester_id',
        label: 'Semester',
        type: 'select',
        required: true,
        options: semesters.map((s) => {
          const prog = programmesMap.get(String(s.programme_id));
          return {
            label: `${s.name}${prog ? ` · ${prog.name}` : ''}`,
            value: s.id,
          };
        }),
      },
      { name: 'name', label: 'Subject Name', type: 'text', required: true, placeholder: 'e.g. Data Structures & Algorithms' },
      { name: 'code', label: 'Subject Code', type: 'text', placeholder: 'e.g. CS201' },
      { name: 'credits', label: 'Credits', type: 'number', placeholder: 'e.g. 4' },
      { name: 'color', label: 'Color Hex', type: 'text', placeholder: 'e.g. #6366f1' },
    ],
    [semesters, programmesMap]
  );

  const unitFields: Field[] = useMemo(
    () => [
      {
        name: 'subject_id',
        label: 'Subject',
        type: 'select',
        required: true,
        options: subjects.map((subj) => ({
          label: `${subj.name}${subj.code ? ` (${subj.code})` : ''}`,
          value: subj.id,
        })),
      },
      { name: 'title', label: 'Unit Title', type: 'text', required: true, placeholder: 'e.g. Trees and Graphs' },
      { name: 'unit_number', label: 'Unit Number / Order', type: 'number', placeholder: 'e.g. 1' },
      { name: 'description', label: 'Description', type: 'textarea', placeholder: 'Topics covered in this unit...' },
    ],
    [subjects]
  );

  // Requirement 2: Topic status enhancement
  // completed=0 shown as 'Not Started', completed=1 shown as 'Completed'
  // notes field can contain 'in_progress' or 'needs_revision' as metadata
  const topicFields: Field[] = useMemo(
    () => [
      {
        name: 'unit_id',
        label: 'Unit',
        type: 'select',
        required: true,
        options: units.map((u) => {
          const subj = subjectsMap.get(String(u.subject_id));
          return {
            label: `${u.title || u.name || `Unit ${u.id}`}${subj ? ` (${subj.name})` : ''}`,
            value: u.id,
          };
        }),
      },
      { name: 'title', label: 'Topic Title', type: 'text', required: true, placeholder: 'e.g. Binary Search Trees' },
      {
        name: 'completed',
        label: 'Status',
        type: 'select',
        required: true,
        options: [
          { label: 'Not Started', value: 0 },
          { label: 'Completed', value: 1 },
        ],
        defaultValue: 0,
      },
      {
        name: 'notes',
        label: 'Progress Stage / Notes',
        type: 'select',
        options: [
          { label: 'Standard / None', value: '' },
          { label: 'In Progress (in_progress)', value: 'in_progress' },
          { label: 'Needs Revision (needs_revision)', value: 'needs_revision' },
        ],
        defaultValue: '',
      },
      { name: 'order_index', label: 'Order Index', type: 'number', placeholder: 'e.g. 1' },
    ],
    [units, subjectsMap]
  );

  // Requirement 3: Completion progress strip per unit when viewing topics
  const unitProgressList = useMemo(() => {
    return units.map((u) => {
      const subj = subjectsMap.get(String(u.subject_id));
      const unitTopics = topics.filter((t) => String(t.unit_id) === String(u.id));
      const completedCount = unitTopics.filter((t) => Number(t.completed) === 1 || t.completed === true).length;
      const totalCount = unitTopics.length;
      const percentage = getTopicCompletion(unitTopics);

      return {
        unit: u,
        subject: subj,
        totalCount,
        completedCount,
        percentage,
      };
    });
  }, [units, topics, subjectsMap]);

  // Requirement 6: Programme-level progress (traverse: programme -> semesters -> subjects -> units -> topics)
  const programmeProgressList = useMemo(() => {
    return programmes.map((p) => {
      const progSemesters = semesters.filter((s) => String(s.programme_id) === String(p.id));
      const semIds = new Set(progSemesters.map((s) => String(s.id)));

      const progSubjects = subjects.filter((subj) => semIds.has(String(subj.semester_id)));
      const subjIds = new Set(progSubjects.map((s) => String(s.id)));

      const progUnits = units.filter((u) => subjIds.has(String(u.subject_id)));
      const unitIds = new Set(progUnits.map((u) => String(u.id)));

      const progTopics = topics.filter((t) => unitIds.has(String(t.unit_id)));
      const completedTopics = progTopics.filter((t) => Number(t.completed) === 1 || t.completed === true).length;
      const percentage = getTopicCompletion(progTopics);

      return {
        programme: p,
        semestersCount: progSemesters.length,
        subjectsCount: progSubjects.length,
        unitsCount: progUnits.length,
        totalTopics: progTopics.length,
        completedTopics,
        percentage,
      };
    });
  }, [programmes, semesters, subjects, units, topics]);

  const hasLoading = progLoading || semLoading || subjLoading || unitsLoading || topicsLoading;
  const anyError = progError || semError || subjError || unitsError || topicsError;

  const tabOptions: Array<{ key: AcademicTab; label: string; count: number }> = [
    { key: 'programmes', label: 'Programmes', count: programmes.length },
    { key: 'semesters', label: 'Semesters', count: semesters.length },
    { key: 'subjects', label: 'Subjects', count: subjects.length },
    { key: 'units', label: 'Units', count: units.length },
    { key: 'topics', label: 'Topics', count: topics.length },
  ];

  return (
    <div className="page-container" style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <PageHeading
        title="Academic Hierarchy & Curriculum"
        subtitle="Manage programmes, semesters, subjects, units, and track topic completion"
      />

      {anyError && <ErrorBanner error={anyError} />}

      {/* 1. Sub-navigation Tabs */}
      <div
        style={{
          display: 'flex',
          gap: '8px',
          borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
          paddingBottom: '12px',
          overflowX: 'auto',
        }}
      >
        {tabOptions.map((tab) => {
          const isActive = activeTab === tab.key;
          return (
            <button
              key={tab.key}
              type="button"
              onClick={() => setActiveTab(tab.key)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '8px 18px',
                borderRadius: '8px',
                border: 'none',
                background: isActive ? '#6366f1' : '#0d1324',
                color: isActive ? '#ffffff' : '#9ca3af',
                fontWeight: isActive ? 600 : 400,
                fontSize: '0.9rem',
                cursor: 'pointer',
                transition: 'all 0.2s ease',
              }}
            >
              <span>{tab.label}</span>
              <span
                style={{
                  fontSize: '0.75rem',
                  padding: '2px 6px',
                  borderRadius: '10px',
                  background: isActive ? 'rgba(255, 255, 255, 0.25)' : '#101626',
                  color: isActive ? '#ffffff' : '#7f8aa3',
                }}
              >
                {tab.count}
              </span>
            </button>
          );
        })}
      </div>

      {/* Tab Specific Content */}
      {hasLoading && (
        <div style={{ padding: '20px 0' }}>
          <Loading />
        </div>
      )}

      {/* TAB: PROGRAMMES */}
      {activeTab === 'programmes' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          <Crud entity="programmes" title="Academic Programmes" fields={programmeFields} />

          {/* Requirement 6: Programme-level progress at bottom of Programmes view */}
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
            <div>
              <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 600, color: '#e5e7eb' }}>
                Overall Programme Syllabus Completion
              </h3>
              <p style={{ margin: '4px 0 0', fontSize: '0.82rem', color: '#7f8aa3' }}>
                Traversing programme → semesters → subjects → units → topics
              </p>
            </div>

            {programmeProgressList.length === 0 ? (
              <Empty message="No programmes defined yet" />
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '16px' }}>
                {programmeProgressList.map(
                  ({ programme, semestersCount, subjectsCount, unitsCount, totalTopics, completedTopics, percentage }) => (
                    <div
                      key={programme.id}
                      style={{
                        background: '#101626',
                        border: '1px solid rgba(255, 255, 255, 0.06)',
                        borderRadius: '8px',
                        padding: '16px',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '12px',
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                        <div>
                          <h4 style={{ margin: 0, fontSize: '1rem', color: '#f3f4f6', fontWeight: 600 }}>{programme.name}</h4>
                          {programme.code && (
                            <span style={{ fontSize: '0.8rem', color: '#818cf8', fontWeight: 500 }}>{programme.code}</span>
                          )}
                        </div>
                        <span
                          style={{
                            fontSize: '0.75rem',
                            padding: '3px 8px',
                            borderRadius: '4px',
                            background: programme.status === 'active' ? 'rgba(16, 185, 129, 0.15)' : 'rgba(255, 255, 255, 0.06)',
                            color: programme.status === 'active' ? '#34d399' : '#9ca3af',
                            textTransform: 'capitalize',
                          }}
                        >
                          {programme.status || 'active'}
                        </span>
                      </div>

                      <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', fontSize: '0.78rem', color: '#9ca3af' }}>
                        <span>
                          <strong style={{ color: '#e5e7eb' }}>{semestersCount}</strong> Semesters
                        </span>
                        <span>•</span>
                        <span>
                          <strong style={{ color: '#e5e7eb' }}>{subjectsCount}</strong> Subjects
                        </span>
                        <span>•</span>
                        <span>
                          <strong style={{ color: '#e5e7eb' }}>{unitsCount}</strong> Units
                        </span>
                        <span>•</span>
                        <span>
                          <strong style={{ color: '#e5e7eb' }}>{totalTopics}</strong> Topics
                        </span>
                      </div>

                      {/* Progress bar */}
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem' }}>
                          <span style={{ color: '#7f8aa3' }}>Curriculum Completion</span>
                          <span style={{ fontWeight: 600, color: percentage === 100 ? '#10b981' : '#818cf8' }}>
                            {percentage}% ({completedTopics}/{totalTopics})
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
                    </div>
                  )
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB: SEMESTERS */}
      {activeTab === 'semesters' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <Crud entity="semesters" title="Semesters" fields={semesterFields} />
        </div>
      )}

      {/* TAB: SUBJECTS */}
      {activeTab === 'subjects' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {/* Requirement 4: Academic hierarchy display for Subjects */}
          <div
            style={{
              background: '#0d1324',
              border: '1px solid rgba(255, 255, 255, 0.08)',
              borderRadius: '10px',
              padding: '16px 20px',
              display: 'flex',
              flexDirection: 'column',
              gap: '12px',
            }}
          >
            <h4 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 600, color: '#e5e7eb' }}>
              Subject Hierarchy (Programme → Semester → Subject)
            </h4>
            {subjects.length === 0 ? (
              <Empty message="No subjects found" />
            ) : (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px' }}>
                {subjects.map((subj) => {
                  const sem = semestersMap.get(String(subj.semester_id));
                  const prog = sem ? programmesMap.get(String(sem.programme_id)) : undefined;

                  return (
                    <div
                      key={subj.id}
                      style={{
                        padding: '8px 12px',
                        borderRadius: '6px',
                        background: '#101626',
                        border: '1px solid rgba(255, 255, 255, 0.05)',
                        fontSize: '0.82rem',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '2px',
                      }}
                    >
                      <span style={{ fontWeight: 600, color: '#f3f4f6' }}>
                        {subj.name} {subj.code ? `(${subj.code})` : ''}
                      </span>
                      <span style={{ color: '#7f8aa3', fontSize: '0.75rem' }}>
                        {prog?.name || 'No Programme'} › {sem?.name || 'No Semester'}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <Crud entity="subjects" title="Subjects" fields={subjectFields} />
        </div>
      )}

      {/* TAB: UNITS */}
      {activeTab === 'units' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {/* Requirement 4: Academic hierarchy display for Units */}
          <div
            style={{
              background: '#0d1324',
              border: '1px solid rgba(255, 255, 255, 0.08)',
              borderRadius: '10px',
              padding: '16px 20px',
              display: 'flex',
              flexDirection: 'column',
              gap: '12px',
            }}
          >
            <h4 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 600, color: '#e5e7eb' }}>
              Unit Hierarchy (Subject → Unit)
            </h4>
            {units.length === 0 ? (
              <Empty message="No units found" />
            ) : (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px' }}>
                {units.map((u) => {
                  const subj = subjectsMap.get(String(u.subject_id));
                  return (
                    <div
                      key={u.id}
                      style={{
                        padding: '8px 12px',
                        borderRadius: '6px',
                        background: '#101626',
                        border: '1px solid rgba(255, 255, 255, 0.05)',
                        fontSize: '0.82rem',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '2px',
                      }}
                    >
                      <span style={{ fontWeight: 600, color: '#f3f4f6' }}>{u.title || u.name || `Unit ${u.id}`}</span>
                      <span style={{ color: '#818cf8', fontSize: '0.75rem' }}>
                        Subject: {subj?.name || 'Unknown'} {subj?.code ? `(${subj.code})` : ''}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <Crud entity="units" title="Units" fields={unitFields} />
        </div>
      )}

      {/* TAB: TOPICS */}
      {activeTab === 'topics' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          {/* Requirement 3: Completion progress strip per unit when viewing topics */}
          <div
            style={{
              background: '#0d1324',
              border: '1px solid rgba(255, 255, 255, 0.08)',
              borderRadius: '10px',
              padding: '20px',
              display: 'flex',
              flexDirection: 'column',
              gap: '14px',
            }}
          >
            <div>
              <h4 style={{ margin: 0, fontSize: '1rem', fontWeight: 600, color: '#e5e7eb' }}>Per-Unit Syllabus Completion</h4>
              <p style={{ margin: '4px 0 0', fontSize: '0.8rem', color: '#7f8aa3' }}>
                Topic progress breakdown across all units
              </p>
            </div>

            {unitProgressList.length === 0 ? (
              <Empty message="No units created yet to track completion" />
            ) : (
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))',
                  gap: '12px',
                }}
              >
                {unitProgressList.map(({ unit, subject, totalCount, completedCount, percentage }) => (
                  <div
                    key={unit.id}
                    style={{
                      background: '#101626',
                      border: '1px solid rgba(255, 255, 255, 0.05)',
                      borderRadius: '8px',
                      padding: '12px',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '8px',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                      <span style={{ fontWeight: 600, fontSize: '0.88rem', color: '#f3f4f6' }}>
                        {unit.title || unit.name || `Unit ${unit.id}`}
                      </span>
                      <span style={{ fontSize: '0.8rem', fontWeight: 600, color: percentage === 100 ? '#10b981' : '#818cf8' }}>
                        {percentage}%
                      </span>
                    </div>

                    <div style={{ fontSize: '0.75rem', color: '#7f8aa3' }}>
                      {subject?.name || 'Subject'} {subject?.code ? `(${subject.code})` : ''}
                    </div>

                    <div
                      style={{
                        height: '6px',
                        width: '100%',
                        background: '#1e293b',
                        borderRadius: '3px',
                        overflow: 'hidden',
                      }}
                    >
                      <div
                        style={{
                          height: '100%',
                          width: `${percentage}%`,
                          background: percentage === 100 ? '#10b981' : '#6366f1',
                          borderRadius: '3px',
                        }}
                      />
                    </div>

                    <div style={{ fontSize: '0.72rem', color: '#9ca3af', textAlign: 'right' }}>
                      {completedCount} / {totalCount} topics
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Topics List with Visual Status & Hierarchy Tags */}
          <div
            style={{
              background: '#0d1324',
              border: '1px solid rgba(255, 255, 255, 0.08)',
              borderRadius: '10px',
              padding: '20px',
              display: 'flex',
              flexDirection: 'column',
              gap: '14px',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <h4 style={{ margin: 0, fontSize: '1rem', fontWeight: 600, color: '#e5e7eb' }}>
                  Topic Status & Hierarchy Overview
                </h4>
                <p style={{ margin: '4px 0 0', fontSize: '0.8rem', color: '#7f8aa3' }}>
                  Derived visual status (Not Started / In Progress / Needs Revision / Completed)
                </p>
              </div>
              <span style={{ fontSize: '0.8rem', color: '#7f8aa3' }}>{topics.length} total topics</span>
            </div>

            {topics.length === 0 ? (
              <Empty message="No topics found" />
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '360px', overflowY: 'auto' }}>
                {topics.map((topic) => {
                  const statusBadge = getTopicVisualStatus(topic);
                  const unit = unitsMap.get(String(topic.unit_id));
                  const subj = unit ? subjectsMap.get(String(unit.subject_id)) : undefined;

                  return (
                    <div
                      key={topic.id}
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
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                        <span style={{ fontWeight: 500, color: '#f3f4f6', fontSize: '0.9rem' }}>{topic.title}</span>
                        <span style={{ fontSize: '0.76rem', color: '#7f8aa3' }}>
                          Unit: {unit?.title || unit?.name || 'Unknown Unit'}{' '}
                          {subj ? `• ${subj.name}${subj.code ? ` (${subj.code})` : ''}` : ''}
                        </span>
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        {topic.notes && topic.notes !== 'in_progress' && topic.notes !== 'needs_revision' && (
                          <span style={{ fontSize: '0.75rem', color: '#9ca3af', fontStyle: 'italic' }}>{topic.notes}</span>
                        )}
                        <span
                          style={{
                            fontSize: '0.75rem',
                            fontWeight: 600,
                            padding: '3px 10px',
                            borderRadius: '6px',
                            color: statusBadge.color,
                            background: statusBadge.bg,
                          }}
                        >
                          {statusBadge.label}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Requirement 5: Topic CRUD */}
          <Crud entity="topics" title="Topics Management" fields={topicFields} />
        </div>
      )}
    </div>
  );
}
