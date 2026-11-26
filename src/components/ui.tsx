import React from 'react';

export function Stat({ label, value, accent, suffix }: { label: string; value: number | string; accent?: string; suffix?: string }) {
  return (
    <div className={`stat-card ${accent || ''}`}>
      <span>{label}</span>
      <strong>{value}{suffix && <small style={{ fontSize: '14px', fontWeight: 400, marginLeft: 4, color: '#8e99b1' }}>{suffix}</small>}</strong>
    </div>
  );
}

export function Empty({ text, message, compact }: { text?: string; message?: string; compact?: boolean }) {
  return (
    <div className={compact ? 'empty compact' : 'empty-state'}>
      <div className="empty-icon">◇</div>
      <p>{text || message || 'No records found'}</p>
    </div>
  );
}

export function ErrorBanner({ message, error }: { message?: string; error?: string }) {
  const content = message || error;
  if (!content) return null;
  return <div className="error-banner">{content}</div>;
}

export function SuccessBanner({ message }: { message: string }) {
  if (!message) return null;
  return <div className="success-banner">{message}</div>;
}

export function Loading({ text }: { text?: string }) {
  return <div className="loading">{text || 'Loading...'}</div>;
}

export function PageHeading({
  title,
  subtitle,
  description,
  children,
}: {
  title: string;
  subtitle?: string;
  description?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="page-heading">
      <div>
        <h1>{title}</h1>
        {(subtitle || description) && <p>{subtitle || description}</p>}
      </div>
      {children}
    </div>
  );
}

export function SubNav({
  tabs,
  items,
  active,
  activeTab,
  onChange,
  onTabChange,
}: {
  tabs?: Array<{ key?: string; id?: string; label: string; count?: number }>;
  items?: Array<{ key?: string; id?: string; label: string; count?: number }>;
  active?: string;
  activeTab?: string;
  onChange?: (key: string) => void;
  onTabChange?: (key: string) => void;
}) {
  const list = tabs || items || [];
  const current = active || activeTab || '';
  const handler = onChange || onTabChange || (() => {});

  return (
    <div className="subnav">
      {list.map((tab) => {
        const key = tab.key || tab.id || '';
        return (
          <button
            key={key}
            className={current === key ? 'active' : ''}
            onClick={() => handler(key)}
          >
            {tab.label}
            {typeof tab.count === 'number' && (
              <span style={{ marginLeft: 6, fontSize: '11px', opacity: 0.7 }}>({tab.count})</span>
            )}
          </button>
        );
      })}
    </div>
  );
}

export function SegmentedControl({ options, value, onChange }: { options: string[]; value: string; onChange: (v: string) => void }) {
  return (
    <div className="segmented">
      {options.map(opt => (
        <button key={opt} className={value === opt ? 'active' : ''} onClick={() => onChange(opt)}>
          {opt}
        </button>
      ))}
    </div>
  );
}
