// Small reusable UI atoms for the shared Team Calendar (no avatars).
import type { CSSProperties, ReactNode } from 'react';
import { CAT_BY_ID, type Category, type CategoryId } from "../../lib/calendar/calendar";

type IconName =
  | 'chevL' | 'chevR' | 'chevD' | 'chevU' | 'plus' | 'search' | 'close'
  | 'cal' | 'clock' | 'pin' | 'edit' | 'trash' | 'filter' | 'grid' | 'list'
  | 'bars' | 'year' | 'today' | 'drag' | 'check' | 'spark' | 'arrow' | 'bell'
  | 'repeat' | 'warn' | 'lock' | 'google' | 'logout' | 'shield';

const PATHS: Record<IconName, ReactNode> = {
  chevL: <polyline points="9.5 3.5 4.5 8 9.5 12.5" />,
  chevR: <polyline points="6.5 3.5 11.5 8 6.5 12.5" />,
  chevD: <polyline points="3.5 6 8 10.5 12.5 6" />,
  chevU: <polyline points="3.5 10 8 5.5 12.5 10" />,
  plus: <g><line x1="8" y1="3" x2="8" y2="13" /><line x1="3" y1="8" x2="13" y2="8" /></g>,
  search: <g><circle cx="7" cy="7" r="4.2" /><line x1="10.2" y1="10.2" x2="13" y2="13" /></g>,
  close: <g><line x1="4" y1="4" x2="12" y2="12" /><line x1="12" y1="4" x2="4" y2="12" /></g>,
  cal: <g><rect x="2.5" y="3.5" width="11" height="10" rx="1" /><line x1="2.5" y1="6.5" x2="13.5" y2="6.5" /><line x1="5.5" y1="2" x2="5.5" y2="5" /><line x1="10.5" y1="2" x2="10.5" y2="5" /></g>,
  clock: <g><circle cx="8" cy="8" r="5.5" /><polyline points="8 5 8 8 10.5 9.5" /></g>,
  pin: <g><path d="M8 14c0 0 4-4 4-7.5a4 4 0 0 0-8 0c0 3.5 4 7.5 4 7.5z" /><circle cx="8" cy="6.5" r="1.4" /></g>,
  edit: <g><path d="M3 13l1-3 7-7 2 2-7 7-3 1z" /><line x1="9.5" y1="4.5" x2="11.5" y2="6.5" /></g>,
  trash: <g><polyline points="2.5 4.5 13.5 4.5" /><path d="M4 4.5L4.5 13a1 1 0 0 0 1 1h5a1 1 0 0 0 1-1L12 4.5" /><path d="M6 4.5V3a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v1.5" /></g>,
  filter: <g><polygon points="2.5 3.5 13.5 3.5 9.5 8.5 9.5 13 6.5 11.5 6.5 8.5" /></g>,
  grid: <g><rect x="2.5" y="2.5" width="4.5" height="4.5" /><rect x="9" y="2.5" width="4.5" height="4.5" /><rect x="2.5" y="9" width="4.5" height="4.5" /><rect x="9" y="9" width="4.5" height="4.5" /></g>,
  list: <g><line x1="2.5" y1="4" x2="13.5" y2="4" /><line x1="2.5" y1="8" x2="13.5" y2="8" /><line x1="2.5" y1="12" x2="13.5" y2="12" /></g>,
  bars: <g><rect x="2.5" y="3.5" width="6" height="2.5" /><rect x="2.5" y="7" width="9" height="2.5" /><rect x="2.5" y="10.5" width="4" height="2.5" /></g>,
  year: <g><rect x="2.5" y="2.5" width="4" height="4" /><rect x="9" y="2.5" width="4" height="4" /><rect x="2.5" y="9" width="4" height="4" /><rect x="9" y="9" width="4" height="4" /></g>,
  today: <circle cx="8" cy="8" r="3" />,
  drag: <g><circle cx="6" cy="4" r="1" /><circle cx="10" cy="4" r="1" /><circle cx="6" cy="8" r="1" /><circle cx="10" cy="8" r="1" /><circle cx="6" cy="12" r="1" /><circle cx="10" cy="12" r="1" /></g>,
  check: <polyline points="3 8.5 6.5 12 13 4.5" />,
  spark: <g><path d="M8 2v4M8 10v4M2 8h4M10 8h4" /></g>,
  arrow: <g><line x1="3" y1="8" x2="13" y2="8" /><polyline points="9.5 4.5 13 8 9.5 11.5" /></g>,
  bell: <g><path d="M4 11V7.5a4 4 0 0 1 8 0V11l1 1.5H3z" /><path d="M6.5 13.5a1.5 1.5 0 0 0 3 0" /></g>,
  repeat: <g><polyline points="3 6 5 4 7 6" /><path d="M5 4v3.5a3 3 0 0 0 3 3h2" /><polyline points="13 10 11 12 9 10" /><path d="M11 12V8.5a3 3 0 0 0-3-3H6" /></g>,
  warn: <g><path d="M8 2.5L14.2 13H1.8z" /><line x1="8" y1="6.5" x2="8" y2="9.5" /><circle cx="8" cy="11.5" r="0.5" fill="currentColor" stroke="none" /></g>,
  lock: <g><rect x="3.5" y="7.5" width="9" height="6" rx="1" /><path d="M5 7.5V5.5a3 3 0 0 1 6 0V7.5" /></g>,
  logout: <g><path d="M6 3.5H3.5v9H6" /><polyline points="9 5 12.5 8 9 11" /><line x1="12.5" y1="8" x2="6" y2="8" /></g>,
  shield: <g><path d="M8 2l5 2v4c0 3-2.2 5.2-5 6-2.8-.8-5-3-5-6V4z" /><polyline points="5.8 8 7.3 9.5 10.2 6.5" /></g>,
  google: (
    <g stroke="none">
      <path fill="#4285F4" d="M14.4 8.16c0-.46-.04-.9-.12-1.32H8v2.5h3.6a3.08 3.08 0 0 1-1.33 2.02v1.68h2.15c1.26-1.16 1.98-2.87 1.98-4.88z" />
      <path fill="#34A853" d="M8 14.5c1.8 0 3.3-.6 4.4-1.62l-2.15-1.68c-.6.4-1.36.64-2.25.64-1.73 0-3.2-1.17-3.72-2.74H1.86v1.73A6.5 6.5 0 0 0 8 14.5z" />
      <path fill="#FBBC05" d="M4.28 9.1a3.9 3.9 0 0 1 0-2.2V5.17H1.86a6.5 6.5 0 0 0 0 5.86z" />
      <path fill="#EA4335" d="M8 4.16c.97 0 1.85.34 2.54 1l1.9-1.9A6.5 6.5 0 0 0 1.86 5.17L4.28 6.9C4.8 5.33 6.27 4.16 8 4.16z" />
    </g>
  ),
};

export const Icon = ({
  name,
  size = 14,
  stroke = 1.6,
  className = '',
  style = {},
}: {
  name: IconName;
  size?: number;
  stroke?: number;
  className?: string;
  style?: CSSProperties;
}) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 16 16"
    fill="none"
    stroke={name === 'google' ? 'none' : 'currentColor'}
    strokeWidth={stroke}
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
    style={style}
    aria-hidden="true"
  >
    {PATHS[name] || null}
  </svg>
);

export const IconBtn = ({
  icon,
  label,
  onClick,
  active = false,
  size = 14,
  title,
}: {
  icon: IconName;
  label: string;
  onClick?: () => void;
  active?: boolean;
  size?: number;
  title?: string;
}) => (
  <button className={'iconbtn' + (active ? ' is-active' : '')} onClick={onClick} title={title || label} aria-label={label}>
    <Icon name={icon} size={size} />
  </button>
);

export const Btn = ({
  children,
  variant = 'ghost',
  onClick,
  leading,
  trailing,
  type = 'button',
  disabled,
  danger,
}: {
  children: ReactNode;
  variant?: 'ghost' | 'primary';
  onClick?: () => void;
  leading?: IconName;
  trailing?: IconName;
  type?: 'button' | 'submit';
  disabled?: boolean;
  danger?: boolean;
}) => (
  <button type={type} className={'btn btn-' + variant + (danger ? ' btn-danger' : '')} onClick={onClick} disabled={disabled}>
    {leading && <Icon name={leading} size={13} />}
    <span>{children}</span>
    {trailing && <Icon name={trailing} size={13} />}
  </button>
);

export const SegItem = ({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) => (
  <button className={'seg-item' + (active ? ' is-active' : '')} onClick={onClick}>
    {children}
  </button>
);

export const Kbd = ({ children }: { children: ReactNode }) => <kbd className="kbd">{children}</kbd>;

export const CatDot = ({ cat, size = 8 }: { cat: CategoryId | Category; size?: number }) => {
  const c = typeof cat === 'string' ? CAT_BY_ID[cat] : cat;
  if (!c) return null;
  return <span className="catdot" style={{ width: size, height: size, background: c.dot }} />;
};
