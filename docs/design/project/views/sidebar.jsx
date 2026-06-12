// Sidebar navigation

const NAV = [
  { id: "dashboard", label: "Today", icon: "dashboard", kbd: "1" },
  { id: "board", label: "The Board", icon: "doc", kbd: "2" },
  { id: "contacts", label: "People", icon: "users", kbd: "3" },
  { id: "stage", label: "The Journey", icon: "board", kbd: "4" },
  { id: "attendance", label: "Gatherings", icon: "calendar", kbd: "5" },
  { id: "prayer", label: "Prayer", icon: "praying", kbd: "6" },
  { id: "editlog", label: "History", icon: "history", kbd: "7" },
];

const SECONDARY = [
  { id: "signup", label: "Public Sign-up", icon: "form" },
];

const Sidebar = ({ view, setView, counts, role = "ft", persona, onOpenSettings }) => {
  const allowed = ROLE_NAV[role] || ROLE_NAV.ft;
  const nav = NAV.filter(item => allowed.includes(item.id));
  const isStaff = role === "ft" || role === "trainee";
  const p = persona || PERSONAS.ft;

  return (
    <aside className="sidebar">
      <div className="sidebar-header">
        <div className="sidebar-logo">C</div>
        <div>
          <div className="sidebar-title">CISA Campus</div>
          <div className="sidebar-sub">Spring · '26</div>
        </div>
      </div>

      <div className="sidebar-scroll">
      <div className="sidebar-section">
        <div className="sidebar-label">{isStaff ? "Workspace" : "Your space"}</div>
        {nav.map(item => (
          <div key={item.id}
               className={"nav-item " + (view === item.id ? "active" : "")}
               onClick={() => setView(item.id)}>
            <Icon name={item.icon} size={14} />
            <span>{item.id === "dashboard" && role === "ft" ? "My Day" : item.label}</span>
            {isStaff && counts[item.id] != null && <span className="count">{counts[item.id]}</span>}
          </div>
        ))}
      </div>

      {isStaff && (
        <div className="sidebar-section">
          <div className="sidebar-label">Public</div>
          {SECONDARY.map(item => (
            <div key={item.id}
                 className={"nav-item " + (view === item.id ? "active" : "")}
                 onClick={() => setView(item.id)}>
              <Icon name={item.icon} size={14} />
              <span>{item.label}</span>
              <Icon name="external" size={11} className="right" />
            </div>
          ))}
        </div>
      )}

      {role === "ft" && (
        <div className="sidebar-section">
          <div className="sidebar-label">Saved Views</div>
          <div className="nav-item" onClick={() => setView("contacts")}>
            <span className="dot" style={{ width: 6, height: 6, borderRadius: 99, background: "var(--accent)" }}></span>
            <span>New this week</span>
            <span className="count">4</span>
          </div>
          <div className="nav-item" onClick={() => setView("contacts")}>
            <span className="dot" style={{ width: 6, height: 6, borderRadius: 99, background: "var(--warn)" }}></span>
            <span>Needs follow-up</span>
            <span className="count">6</span>
          </div>
          <div className="nav-item" onClick={() => setView("contacts")}>
            <span className="dot" style={{ width: 6, height: 6, borderRadius: 99, background: "var(--violet)" }}></span>
            <span>Mentor cohort</span>
            <span className="count">3</span>
          </div>
        </div>
      )}
      </div>

      <div className="sidebar-foot">
        <Avatar initials={p.initials} size="l" />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 600, lineHeight: 1.15 }}>{p.name}</div>
          <div style={{ fontSize: 12, color: "var(--text-mute)", marginTop: 1 }}>{p.subtitle}</div>
        </div>
        {role === "ft" && (
          <button className="icon-btn" title="Settings" onClick={onOpenSettings}><Icon name="settings" size={15}/></button>
        )}
      </div>
    </aside>
  );
};

window.Sidebar = Sidebar;
