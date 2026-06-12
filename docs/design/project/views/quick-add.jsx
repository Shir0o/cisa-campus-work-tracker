// Quick add modal (cmd+K-ish quick action palette + new contact)

const QuickAdd = ({ onClose, onCreated, onOpen, initialMode = "palette" }) => {
  const [mode, setMode] = React.useState(initialMode); // palette | contact
  const [q, setQ] = React.useState("");
  const [form, setForm] = React.useState({ name: "", year: "", major: "", phone: "", email: "", stage: "first" });
  const set = (k, v) => setForm(prev => ({ ...prev, [k]: v }));

  React.useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const actions = [
    { label: "New contact", icon: "user", onClick: () => setMode("contact") },
    { label: "Log interaction", icon: "coffee", onClick: () => { onOpen("contacts"); onClose(); } },
    { label: "Add prayer request", icon: "praying", onClick: () => { onOpen("prayer"); onClose(); } },
    { label: "Mark attendance", icon: "calendar", onClick: () => { onOpen("attendance"); onClose(); } },
    { label: "Create event", icon: "plus", onClick: () => { onOpen("attendance"); onClose(); } },
    { label: "Open public sign-up", icon: "globe", onClick: () => { onOpen("signup"); onClose(); } },
  ];

  const filteredActions = actions.filter(a => !q || a.label.toLowerCase().includes(q.toLowerCase()));
  const matchedContacts = q.length >= 1
    ? CONTACTS.filter(c => c.name.toLowerCase().includes(q.toLowerCase()) || c.id.toLowerCase().includes(q.toLowerCase())).slice(0, 4)
    : [];

  return (
    <div className="scrim" onClick={(e) => { if (e.target.classList.contains("scrim")) onClose(); }}>
      <div className="modal">
        {mode === "palette" && (
          <>
            <div className="modal-head">
              <Icon name="command" size={15}/>
              <input
                autoFocus
                value={q}
                onChange={e => setQ(e.target.value)}
                placeholder="Search for a contact, or pick an action…"
                style={{ background: "transparent", border: 0, outline: 0, color: "var(--text)", fontSize: 14, width: "100%" }}
              />
              <span className="right" style={{ fontSize: 11.5, color: "var(--text-mute)", padding: "2px 8px", border: "1px solid var(--border)", borderRadius: 6 }}>esc</span>
            </div>
            <div style={{ padding: 6 }}>
              {matchedContacts.length > 0 && (
                <>
                  <div style={{ fontSize: 11.5, padding: "8px 10px", color: "var(--text-mute)", fontWeight: 600, letterSpacing: 0.02 }}>People</div>
                  {matchedContacts.map(c => {
                    const init = c.name.split(' ').map(x=>x[0]).join('').slice(0,2);
                    return (
                      <div key={c.id} className="nav-item" style={{ margin: 0, padding: "0 10px", height: 32 }} onClick={() => { onClose(); onOpen("contact:" + c.id); }}>
                        <Avatar initials={init} size="s" />
                        <span>{c.name}</span>
                        <span className="muted right" style={{ fontSize: 12, color: "var(--text-mute)" }}>{c.year}</span>
                      </div>
                    );
                  })}
                </>
              )}
              <div style={{ fontSize: 11.5, padding: "8px 10px", color: "var(--text-mute)", fontWeight: 600, letterSpacing: 0.02 }}>Quick actions</div>
              {filteredActions.map((a, i) => (
                <div key={a.label} className="nav-item" style={{ margin: 0, padding: "0 10px", height: 32 }} onClick={a.onClick}>
                  <Icon name={a.icon} size={14}/>
                  <span>{a.label}</span>
                  {i === 0 && <span className="right" style={{ fontSize: 11, color: "var(--text-mute)" }}>↵ to select</span>}
                </div>
              ))}
            </div>
            <div className="modal-foot" style={{ justifyContent: "flex-start", fontSize: 11.5, color: "var(--text-mute)", gap: 14 }}>
              <span>↑↓ navigate</span>
              <span style={{ marginLeft: "auto" }}>cmd+K to open anywhere</span>
            </div>
          </>
        )}

        {mode === "contact" && (
          <>
            <div className="modal-head">
              <Icon name="user" size={15}/>
              <div style={{ fontWeight: 500 }}>New contact</div>
              <button className="icon-btn right" onClick={onClose}><Icon name="x" size={14}/></button>
            </div>
            <div className="modal-body">
              <div className="field">
                <label>Full name</label>
                <input autoFocus value={form.name} onChange={e => set("name", e.target.value)} placeholder="Aria Mendoza" />
              </div>
              <div className="field-row">
                <div className="field">
                  <label>Year</label>
                  <select value={form.year} onChange={e=>set("year", e.target.value)}>
                    <option value="">Choose…</option>
                    <option>Freshman</option><option>Sophomore</option><option>Junior</option><option>Senior</option><option>Graduate</option>
                  </select>
                </div>
                <div className="field">
                  <label>Major</label>
                  <select value={form.major} onChange={e=>set("major", e.target.value)}>
                    <option value="">Choose…</option>
                    {MAJORS.map(m => <option key={m}>{m}</option>)}
                  </select>
                </div>
              </div>
              <div className="field-row">
                <div className="field">
                  <label>Phone</label>
                  <input value={form.phone} onChange={e=>set("phone", e.target.value)} placeholder="(___) ___-____" />
                </div>
                <div className="field">
                  <label>Email</label>
                  <input value={form.email} onChange={e=>set("email", e.target.value)} placeholder="you@umail.edu" />
                </div>
              </div>
              <div className="field">
                <label>Stage</label>
                <div style={{ display: "flex", gap: 6 }}>
                  {STAGES.map(s => (
                    <button key={s.id} className={"chip " + (form.stage === s.id ? s.tone : "")} onClick={()=>set("stage", s.id)} style={{cursor:"pointer", padding:"4px 10px"}}>
                      {form.stage === s.id && <span className="dot"></span>}
                      {s.name}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <div className="modal-foot">
              <button className="btn btn-ghost" onClick={() => setMode("palette")}>← Back</button>
              <button className="btn" onClick={onClose}>Cancel</button>
              <button className="btn btn-primary" disabled={!form.name} onClick={() => { onCreated(form.name || "New Contact"); }}>
                <Icon name="check" size={13}/> Create
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

window.QuickAdd = QuickAdd;
