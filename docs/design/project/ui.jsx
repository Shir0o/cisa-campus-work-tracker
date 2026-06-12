// Shared UI primitives: icons, avatars, sparkline, etc.

const Icon = ({ name, size = 14, color = "currentColor", className = "" }) => {
  const props = { width: size, height: size, viewBox: "0 0 24 24", fill: "none", stroke: color, strokeWidth: 1.6, strokeLinecap: "round", strokeLinejoin: "round", className: "ico " + className };
  switch (name) {
    case "dashboard": return (<svg {...props}><rect x="3" y="3" width="7" height="9" rx="1.5"/><rect x="14" y="3" width="7" height="5" rx="1.5"/><rect x="14" y="12" width="7" height="9" rx="1.5"/><rect x="3" y="16" width="7" height="5" rx="1.5"/></svg>);
    case "users": return (<svg {...props}><circle cx="9" cy="8" r="3.2"/><path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6"/><circle cx="17" cy="6" r="2.4"/><path d="M21 18c0-2.4-1.8-4.4-4-4.8"/></svg>);
    case "board": return (<svg {...props}><rect x="3" y="4" width="5" height="16" rx="1.5"/><rect x="10" y="4" width="5" height="10" rx="1.5"/><rect x="17" y="4" width="4" height="13" rx="1.5"/></svg>);
    case "calendar": return (<svg {...props}><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 9h18"/><path d="M8 3v4M16 3v4"/></svg>);
    case "praying": return (<svg {...props}><path d="M12 21c-3 0-5-2-5-5V10c0-3 2-5 5-5s5 2 5 5v6c0 3-2 5-5 5z"/><path d="M12 5V3M9 7l-2-2M15 7l2-2"/></svg>);
    case "history": return (<svg {...props}><path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/><path d="M12 7v5l3 2"/></svg>);
    case "form": return (<svg {...props}><rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 8h8M8 12h8M8 16h5"/></svg>);
    case "search": return (<svg {...props}><circle cx="11" cy="11" r="6.5"/><path d="m20 20-3.5-3.5"/></svg>);
    case "plus": return (<svg {...props}><path d="M12 5v14M5 12h14"/></svg>);
    case "filter": return (<svg {...props}><path d="M4 5h16M7 12h10M10 19h4"/></svg>);
    case "sort": return (<svg {...props}><path d="M7 4v16M7 4l-3 3M7 4l3 3"/><path d="M17 20V4M17 20l-3-3M17 20l3-3"/></svg>);
    case "more": return (<svg {...props}><circle cx="5" cy="12" r="1.4"/><circle cx="12" cy="12" r="1.4"/><circle cx="19" cy="12" r="1.4"/></svg>);
    case "phone": return (<svg {...props}><path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2z"/></svg>);
    case "mail": return (<svg {...props}><rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/></svg>);
    case "ig": return (<svg {...props}><rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.5" cy="6.5" r="0.6" fill="currentColor"/></svg>);
    case "house": return (<svg {...props}><path d="M3 11 12 3l9 8"/><path d="M5 10v10h14V10"/></svg>);
    case "tag": return (<svg {...props}><path d="M20 12 12 4H4v8l8 8 8-8z"/><circle cx="8" cy="8" r="1.4"/></svg>);
    case "check": return (<svg {...props}><path d="M5 13l4 4 10-10"/></svg>);
    case "x": return (<svg {...props}><path d="M6 6l12 12M18 6l-12 12"/></svg>);
    case "chev": return (<svg {...props}><path d="m9 6 6 6-6 6"/></svg>);
    case "down": return (<svg {...props}><path d="m6 9 6 6 6-6"/></svg>);
    case "settings": return (<svg {...props}><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1A1.7 1.7 0 0 0 9 19.4a1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1A1.7 1.7 0 0 0 4.6 9a1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1A1.7 1.7 0 0 0 15 4.6a1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/></svg>);
    case "spark": return (<svg {...props}><path d="M3 17 9 11l4 4 8-8"/></svg>);
    case "bolt": return (<svg {...props}><path d="M13 3 4 14h7l-1 7 9-11h-7l1-7z"/></svg>);
    case "heart": return (<svg {...props}><path d="M12 21s-7-4.5-9.3-9A5.3 5.3 0 0 1 12 6a5.3 5.3 0 0 1 9.3 6c-2.3 4.5-9.3 9-9.3 9z"/></svg>);
    case "edit": return (<svg {...props}><path d="M14 4l6 6M3 21l4-1 12-12-3-3L4 17l-1 4z"/></svg>);
    case "doc": return (<svg {...props}><path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><path d="M14 3v6h6"/></svg>);
    case "msg": return (<svg {...props}><path d="M21 12a8 8 0 1 1-3.3-6.5L21 4l-1 4.2A8 8 0 0 1 21 12z"/></svg>);
    case "coffee": return (<svg {...props}><path d="M4 8h13v6a4 4 0 0 1-4 4H8a4 4 0 0 1-4-4V8z"/><path d="M17 9h2a2 2 0 0 1 0 4h-2"/><path d="M7 4v2M11 4v2M15 4v2"/></svg>);
    case "command": return (<svg {...props}><path d="M9 6a3 3 0 1 0-3 3h12a3 3 0 1 0-3-3v12a3 3 0 1 0 3-3H6a3 3 0 1 0 3 3V6z"/></svg>);
    case "logo": return (<svg {...props}><path d="M12 3l4 5-4 5-4-5 4-5z"/><path d="M4 14l8 7 8-7"/></svg>);
    case "fire": return (<svg {...props}><path d="M12 21c-4 0-7-3-7-7 0-3 2-5 3-6 0 2 1 3 2 3 0-3 1-5 4-8 0 4 2 5 4 7s2 4 2 6c0 3-3 5-8 5z"/></svg>);
    case "users-small": return (<svg {...props}><circle cx="9" cy="8" r="3"/><path d="M3 19c0-3 3-5 6-5s6 2 6 5"/></svg>);
    case "pin": return (<svg {...props}><path d="M12 2l3 6 6 1-4.5 4 1 6L12 16l-5.5 3 1-6L3 9l6-1z"/></svg>);
    case "drag": return (<svg {...props}><circle cx="9" cy="6" r="1.2"/><circle cx="9" cy="12" r="1.2"/><circle cx="9" cy="18" r="1.2"/><circle cx="15" cy="6" r="1.2"/><circle cx="15" cy="12" r="1.2"/><circle cx="15" cy="18" r="1.2"/></svg>);
    case "external": return (<svg {...props}><path d="M14 4h6v6"/><path d="M20 4L10 14"/><path d="M20 13v6a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1h6"/></svg>);
    case "arrow-right": return (<svg {...props}><path d="M5 12h14M13 6l6 6-6 6"/></svg>);
    case "moon": return (<svg {...props}><path d="M20 14A8 8 0 1 1 10 4a7 7 0 0 0 10 10z"/></svg>);
    case "sun": return (<svg {...props}><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>);
    case "trash": return (<svg {...props}><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/></svg>);
    case "user": return (<svg {...props}><circle cx="12" cy="8" r="4"/><path d="M4 21c0-4.4 3.6-8 8-8s8 3.6 8 8"/></svg>);
    case "list": return (<svg {...props}><path d="M8 6h13M8 12h13M8 18h13"/><circle cx="4" cy="6" r="1"/><circle cx="4" cy="12" r="1"/><circle cx="4" cy="18" r="1"/></svg>);
    case "globe": return (<svg {...props}><circle cx="12" cy="12" r="9"/><path d="M3 12h18"/><path d="M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/></svg>);
    case "terminal": return (<svg {...props}><rect x="3" y="4" width="18" height="16" rx="2"/><path d="m7 9 3 3-3 3M13 15h4"/></svg>);
    case "inbox": return (<svg {...props}><path d="M3 12h5l1.5 3h5L16 12h5"/><path d="M5 5h14a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2z"/></svg>);
    case "sparkles": return (<svg {...props}><path d="M12 3l1.8 4.6L18.5 9l-4.7 1.4L12 15l-1.8-4.6L5.5 9l4.7-1.4L12 3z"/><path d="M18 14l.8 2.2L21 17l-2.2.8L18 20l-.8-2.2L15 17l2.2-.8L18 14z"/></svg>);
    case "copy": return (<svg {...props}><rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h8"/></svg>);
    case "send": return (<svg {...props}><path d="M22 2 11 13M22 2l-7 20-4-9-9-4 20-7z"/></svg>);
    case "clock": return (<svg {...props}><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>);
    case "key": return (<svg {...props}><circle cx="8" cy="15" r="4"/><path d="m10.8 12.2 8.2-8.2M16 4l3 3M14 6l2 2"/></svg>);
    case "bell": return (<svg {...props}><path d="M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.7 21a2 2 0 0 1-3.4 0"/></svg>);
    default: return null;
  }
};

const Avatar = ({ initials, color, size = "" }) => {
  const cls = "avatar " + (size || "");
  const palette = ["linear-gradient(140deg,#5a7da8,#3a5a82)","linear-gradient(140deg,#85966a,#6f8455)","linear-gradient(140deg,#a4748a,#8c5b73)","linear-gradient(140deg,#c79a52,#b0833a)","linear-gradient(140deg,#7ba391,#5d8071)","linear-gradient(140deg,#c08763,#b15c38)"];
  // deterministic palette pick by initials
  const code = (initials || "").split("").reduce((a,c)=>a+c.charCodeAt(0),0);
  const bg = color || palette[code % palette.length];
  return <div className={cls} style={{ background: bg }}>{(initials||"").slice(0,2)}</div>;
};

const StageChip = ({ stage, size }) => {
  const s = STAGE_BY_ID[stage];
  if (!s) return null;
  return <span className={`chip ${size === 's' ? 's' : ''} ${s.tone}`}><span className="dot"></span>{s.name}</span>;
};

const Sparkline = ({ data, width = 86, height = 32, color = "var(--accent)" }) => {
  if (!data || !data.length) return null;
  const max = Math.max(...data);
  const min = Math.min(...data);
  const range = max - min || 1;
  const stepX = width / (data.length - 1);
  const pts = data.map((v, i) => `${(i*stepX).toFixed(1)},${(height - ((v - min)/range) * (height-4) - 2).toFixed(1)}`);
  const linePath = `M${pts.join(" L")}`;
  const areaPath = `${linePath} L${(width).toFixed(1)},${height} L0,${height} Z`;
  return (
    <svg width={width} height={height} className="kpi-spark">
      <path d={areaPath} fill={color} opacity="0.14"/>
      <path d={linePath} stroke={color} strokeWidth="1.5" fill="none" strokeLinejoin="round"/>
    </svg>
  );
};

Object.assign(window, { Icon, Avatar, StageChip, Sparkline, useViewport });

function useViewport() {
  const get = () => {
    const w = window.innerWidth;
    return { w, isMobile: w <= 720, isTablet: w <= 1024 };
  };
  const [vp, setVp] = React.useState(get);
  React.useEffect(() => {
    let raf;
    const on = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => setVp(get()));
    };
    window.addEventListener("resize", on);
    return () => { cancelAnimationFrame(raf); window.removeEventListener("resize", on); };
  }, []);
  return vp;
}
