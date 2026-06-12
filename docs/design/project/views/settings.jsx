// Settings — a dedicated, warm preferences page (not a modal).

const HOME_CHOICES = [
  {
    key: "myday",
    icon: "heart",
    title: "My Day",
    note: "Start on your own day — who you're carrying and what's due.",
  },
  {
    key: "board",
    icon: "doc",
    title: "The Board",
    note: "Start on the team's shared board, where the five of you think together.",
  },
];

const ROLE_OPTIONS = [
  "Campus Director",
  "Discipleship Lead",
  "Outreach",
  "Small Group Lead",
  "Prayer Coordinator",
  "Staff in Training",
  "Volunteer",
];

// Appearance modes (mirrors the Tweaks "Mode" control, plus "system").
const APPEARANCE = [
  { key: "light", icon: "sun", label: "Light", note: "Warm paper" },
  { key: "dark", icon: "moon", label: "Dark", note: "Quiet dusk" },
  { key: "system", icon: "settings", label: "System", note: "Match my device" },
];

// The four user types from "Viewing as" — described as labels, not permissions.
const NAV_LABEL = {
  dashboard: "Today", board: "The Board", contacts: "People",
  stage: "The Journey", attendance: "Gatherings", prayer: "Prayer", editlog: "History",
};
const ROLE_INFO = {
  ft:        { line: "Full-time staff. Sees the whole work — the team's board, every person, and the admin tools below." },
  trainee:   { line: "Staff in training. Walks alongside students with most of the workspace, minus the admin surfaces." },
  student:   { line: "A student in the community. Sees their own home, gatherings, and prayer — nothing administrative." },
  community: { line: "A friend of CISA. A gentle window into gatherings and prayer, and a way to stay connected." },
};

const RolesReference = ({ activeRole }) => {
  const order = ["ft", "trainee", "student", "community"];
  return (
    <div className="roles">
      {order.map(key => {
        const p = PERSONAS[key];
        const nav = ROLE_NAV[key] || [];
        const active = key === activeRole;
        return (
          <div key={key} className={"role-card " + (active ? "is-active" : "")}>
            <Avatar initials={p.initials} size="l" />
            <div className="role-main">
              <div className="role-top">
                <span className="role-name">{p.role}</span>
                {active && <span className="role-now">viewing as this</span>}
              </div>
              <div className="role-who">{p.name} · {p.subtitle}</div>
              <p className="role-line">{ROLE_INFO[key].line}</p>
              <div className="role-access">
                {nav.map(n => <span key={n} className="role-chip">{NAV_LABEL[n] || n}</span>)}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
};

// ---- User Management ----

const InviteModal = ({ onClose, onInvite }) => {
  const [name, setName] = React.useState("");
  const [role, setRole] = React.useState(ROLE_OPTIONS[0]);
  const [email, setEmail] = React.useState("");
  const [sent, setSent] = React.useState(false);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!email.trim()) return;
    setSent(true);
    setTimeout(() => {
      onInvite({ name: name.trim() || email.trim().split("@")[0], role, email: email.trim() });
    }, 900);
  };

  return (
    <div className="um-modal-backdrop" onClick={onClose}>
      <div className="um-modal" onClick={e => e.stopPropagation()} role="dialog" aria-modal="true">
        <div className="um-modal-head">
          <h3 className="um-modal-title">Add someone by email</h3>
          <button className="icon-btn" onClick={onClose} aria-label="Close"><Icon name="x" size={16} /></button>
        </div>
        {sent ? (
          <div className="um-modal-sent">
            <div className="um-modal-sent-ico"><Icon name="mail" size={22} /></div>
            <p className="um-modal-sent-msg">Invitation sent to <strong>{email}</strong></p>
            <p className="um-modal-sent-sub">They'll get a link to set up their account.</p>
          </div>
        ) : (
          <form className="um-modal-form" onSubmit={handleSubmit}>
            <div className="um-field">
              <label className="um-label">Email <span className="um-req">required</span></label>
              <input
                className="um-input"
                type="email"
                placeholder="their@email.com"
                value={email}
                onChange={e => setEmail(e.target.value)}
                autoFocus
                required
              />
            </div>
            <div className="um-field">
              <label className="um-label">Name <span className="um-opt">optional</span></label>
              <input
                className="um-input"
                type="text"
                placeholder="Their full name"
                value={name}
                onChange={e => setName(e.target.value)}
              />
            </div>
            <div className="um-field">
              <label className="um-label">Role</label>
              <select className="um-input um-select" value={role} onChange={e => setRole(e.target.value)}>
                {ROLE_OPTIONS.map(r => (
                  <option key={r} value={r}>{r}</option>
                ))}
              </select>
            </div>
            <div className="um-modal-footer">
              <button type="button" className="um-btn-ghost" onClick={onClose}>Cancel</button>
              <button type="submit" className="um-btn-primary" disabled={!email.trim()}>
                Pre-add
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};

const EditRoleModal = ({ member, onClose, onSave }) => {
  const [role, setRole] = React.useState(member.role);

  const handleSubmit = (e) => {
    e.preventDefault();
    onSave(member.id, role);
  };

  return (
    <div className="um-modal-backdrop" onClick={onClose}>
      <div className="um-modal" onClick={e => e.stopPropagation()} role="dialog" aria-modal="true">
        <div className="um-modal-head">
          <h3 className="um-modal-title">Edit role</h3>
          <button className="icon-btn" onClick={onClose} aria-label="Close"><Icon name="x" size={16} /></button>
        </div>
        <div className="um-modal-who">
          <Avatar initials={member.initials} size="l" />
          <div>
            <div className="um-modal-who-name">{member.name}</div>
            <div className="um-modal-who-cur">{member.role}</div>
          </div>
        </div>
        <form className="um-modal-form" onSubmit={handleSubmit}>
          <div className="um-field">
            <label className="um-label">Role</label>
            <select className="um-input um-select" value={role} onChange={e => setRole(e.target.value)}>
              {ROLE_OPTIONS.map(r => (
                <option key={r} value={r}>{r}</option>
              ))}
            </select>
          </div>
          <div className="um-modal-footer">
            <button type="button" className="um-btn-ghost" onClick={onClose}>Cancel</button>
            <button type="submit" className="um-btn-primary">Save</button>
          </div>
        </form>
      </div>
    </div>
  );
};

const RemoveConfirmModal = ({ member, onClose, onConfirm }) => (
  <div className="um-modal-backdrop" onClick={onClose}>
    <div className="um-modal um-modal--sm" onClick={e => e.stopPropagation()} role="dialog" aria-modal="true">
      <div className="um-modal-head">
        <h3 className="um-modal-title">Remove from team?</h3>
        <button className="icon-btn" onClick={onClose} aria-label="Close"><Icon name="x" size={16} /></button>
      </div>
      <div className="um-modal-who">
        <Avatar initials={member.initials} size="l" />
        <div>
          <div className="um-modal-who-name">{member.name}</div>
          <div className="um-modal-who-cur">{member.role}</div>
        </div>
      </div>
      <p className="um-remove-note">
        {member.name.split(" ")[0]} will lose access to CISA. Their contacts, notes, and history will stay.
      </p>
      <div className="um-modal-footer">
        <button className="um-btn-ghost" onClick={onClose}>Cancel</button>
        <button className="um-btn-danger" onClick={() => onConfirm(member.id)}>Remove</button>
      </div>
    </div>
  </div>
);

const MemberCard = ({ member, isCurrentUser, onEdit, onRemove }) => {
  const [menuOpen, setMenuOpen] = React.useState(false);
  const menuRef = React.useRef(null);

  React.useEffect(() => {
    if (!menuOpen) return;
    const handler = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [menuOpen]);

  return (
    <div className={"um-member " + (isCurrentUser ? "um-member--you" : "")}>
      <Avatar initials={member.initials} size="l" />
      <div className="um-member-info">
        <div className="um-member-name">
          {member.name}
          {isCurrentUser && <span className="um-you-badge">you</span>}
        </div>
        <div className="um-member-role">{member.role}</div>
      </div>
      <div className="um-member-actions" ref={menuRef}>
        <button
          className="icon-btn um-more-btn"
          onClick={() => setMenuOpen(v => !v)}
          aria-label="Member options"
          aria-expanded={menuOpen}
        >
          <Icon name="more" size={15} />
        </button>
        {menuOpen && (
          <div className="um-menu">
            <button className="um-menu-item" onClick={() => { setMenuOpen(false); onEdit(member); }}>
              <Icon name="edit" size={13} /> Edit role
            </button>
            {!isCurrentUser && (
              <button className="um-menu-item um-menu-item--danger" onClick={() => { setMenuOpen(false); onRemove(member); }}>
                <Icon name="trash" size={13} /> Remove
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

const UserManagement = ({ persona, isAdmin }) => {
  const [members, setMembers] = React.useState(() =>
    STAFF.map(s => ({ ...s }))
  );
  const [invited, setInvited] = React.useState([]);
  const [requests, setRequests] = React.useState(() => ACCESS_REQUESTS.map(r => ({ ...r })));
  const [showInvite, setShowInvite] = React.useState(false);
  const [editTarget, setEditTarget] = React.useState(null);
  const [removeTarget, setRemoveTarget] = React.useState(null);

  const currentStaffId = persona?.staffId;

  const handleInvite = ({ name, role, email }) => {
    const initials = name.split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase();
    setInvited(prev => [...prev, { id: "inv-" + Date.now(), name, role, initials, email, pending: true }]);
    setShowInvite(false);
  };

  const handleEditSave = (id, newRole) => {
    setMembers(prev => prev.map(m => m.id === id ? { ...m, role: newRole } : m));
    setInvited(prev => prev.map(m => m.id === id ? { ...m, role: newRole } : m));
    setEditTarget(null);
  };

  const handleRemove = (id) => {
    setMembers(prev => prev.filter(m => m.id !== id));
    setInvited(prev => prev.filter(m => m.id !== id));
    setRemoveTarget(null);
  };

  const approveReq = (req) => {
    const initials = req.initials || req.name.split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase();
    setMembers(prev => [...prev, { id: req.id, name: req.name, initials, role: req.requestedRole, justAdded: true }]);
    setRequests(prev => prev.filter(r => r.id !== req.id));
  };
  const declineReq = (id) => setRequests(prev => prev.filter(r => r.id !== id));

  return (
    <div className="um-section">
      {isAdmin && requests.length > 0 && (
        <div className="req-block">
          <div className="req-head">
            <span className="req-ico"><Icon name="key" size={14} /></span>
            <span className="req-title">{requests.length} {requests.length === 1 ? "person is" : "people are"} asking to join</span>
          </div>
          {requests.map(r => (
            <div key={r.id} className="req-item">
              <Avatar initials={r.initials} size="l" />
              <div className="req-info">
                <div className="req-name">{r.name} <span className="req-want">wants {r.requestedRole}</span></div>
                <div className="req-email">{r.email} · {relTime(r.at)}</div>
                {r.note && <p className="req-note">“{r.note}”</p>}
              </div>
              <div className="req-actions">
                <button className="req-decline" onClick={() => declineReq(r.id)}>Not now</button>
                <button className="req-approve" onClick={() => approveReq(r)}><Icon name="check" size={13} /> Approve</button>
              </div>
            </div>
          ))}
        </div>
      )}
      <div className="um-list">
        {members.map(m => (
          <MemberCard
            key={m.id}
            member={m}
            isCurrentUser={m.id === currentStaffId}
            onEdit={setEditTarget}
            onRemove={setRemoveTarget}
          />
        ))}
        {invited.map(m => (
          <div key={m.id} className="um-member um-member--pending">
            <Avatar initials={m.initials} size="l" />
            <div className="um-member-info">
              <div className="um-member-name">
                {m.name}
                <span className="um-pending-badge">invite sent</span>
              </div>
              <div className="um-member-role">{m.role} · {m.email}</div>
            </div>
            <div className="um-member-actions">
              <button
                className="icon-btn um-more-btn"
                onClick={() => setRemoveTarget(m)}
                aria-label="Remove pending invite"
                title="Cancel invite"
              >
                <Icon name="x" size={14} />
              </button>
            </div>
          </div>
        ))}
      </div>

      <button className="um-invite-btn" onClick={() => setShowInvite(true)}>
        <span className="um-invite-ico"><Icon name="plus" size={14} /></span>
        Add someone by email
      </button>
      <p className="um-invite-note">Pre-add an email and they're matched automatically when they sign up.</p>

      {showInvite && (
        <InviteModal onClose={() => setShowInvite(false)} onInvite={handleInvite} />
      )}
      {editTarget && (
        <EditRoleModal
          member={editTarget}
          onClose={() => setEditTarget(null)}
          onSave={handleEditSave}
        />
      )}
      {removeTarget && (
        <RemoveConfirmModal
          member={removeTarget}
          onClose={() => setRemoveTarget(null)}
          onConfirm={handleRemove}
        />
      )}
    </div>
  );
};

// ---- Main settings page ----

const SettingsPage = ({ persona, role, home, onSetHome, theme, onSetTheme, onToast, onOpen }) => {
  const p = persona || {};
  const isFT = (role || p.id) === "ft";
  const isStaff = (role || p.id) === "ft" || (role || p.id) === "trainee";

  return (
    <div className="page settings-page" data-screen-label="Settings">
      <div className="page-head">
        <div>
          <h1 className="page-title">Settings</h1>
          <div className="page-sub">{p.name ? `Signed in as ${p.name} · ${p.role}` : "Your preferences"}</div>
        </div>
      </div>

      <section className="settings-block">
        <div className="settings-block-head">
          <h2 className="settings-block-title">Appearance</h2>
          <p className="settings-block-sub">How CISA looks. Choose paper, dusk, or follow your device.</p>
        </div>
        <div className="appear">
          {APPEARANCE.map(a => {
            const active = theme === a.key;
            return (
              <button
                key={a.key}
                className={"appear-card " + (active ? "is-active" : "")}
                onClick={() => onSetTheme && onSetTheme(a.key)}
                aria-pressed={active}
              >
                <span className="appear-ico"><Icon name={a.icon} size={17} /></span>
                <span className="appear-label">{a.label}</span>
                <span className="appear-note">{a.note}</span>
              </button>
            );
          })}
        </div>
      </section>

      {isFT && (
        <section className="settings-block">
          <div className="settings-block-head">
            <h2 className="settings-block-title">Where you land</h2>
            <p className="settings-block-sub">When you open CISA, start here.</p>
          </div>
          <div className="settings-home">
            {HOME_CHOICES.map(c => {
              const active = home === c.key;
              return (
                <button
                  key={c.key}
                  className={"settings-home-card " + (active ? "is-active" : "")}
                  onClick={() => onSetHome(c.key)}
                  aria-pressed={active}
                >
                  <span className="settings-home-ico"><Icon name={c.icon} size={18} /></span>
                  <span className="settings-home-main">
                    <span className="settings-home-title">{c.title}</span>
                    <span className="settings-home-note">{c.note}</span>
                  </span>
                  <span className={"settings-home-tick " + (active ? "on" : "")}>
                    {active && <Icon name="check" size={13} />}
                  </span>
                </button>
              );
            })}
          </div>
        </section>
      )}

      <section className="settings-block">
        <div className="settings-block-head">
          <h2 className="settings-block-title">Roles &amp; access</h2>
          <p className="settings-block-sub">Roles are labels — a way to know who carries what, and what each person sees.</p>
        </div>
        <RolesReference activeRole={role || p.id} />
      </section>

      {isStaff && (
        <section className="settings-block">
          <div className="settings-block-head">
            <h2 className="settings-block-title">Quick add by text</h2>
            <p className="settings-block-sub">Bring people in the way you actually meet them — a text, a voice note, a quick line in a group chat.</p>
          </div>
          <Integrations onToast={onToast} />
        </section>
      )}

      {isStaff && (
        <section className="settings-block">
          <div className="settings-block-head">
            <h2 className="settings-block-title">Your team</h2>
            <p className="settings-block-sub">Everyone with access to CISA. Their contacts, notes, and history stay with the work.</p>
          </div>
          <UserManagement persona={p} isAdmin={isFT} />
        </section>
      )}

      {isFT && (
        <section className="settings-block">
          <div className="settings-block-head">
            <h2 className="settings-block-title">What people are telling us</h2>
            <p className="settings-block-sub">Feedback from the team and the community. Read it like notes from friends.</p>
          </div>
          <FeedbackInbox />
        </section>
      )}

      {isFT && (
        <section className="settings-block">
          <div className="settings-block-head">
            <h2 className="settings-block-title">API &amp; webhook console</h2>
            <p className="settings-block-sub">A developer's view of every contact arriving by API, SMS, WhatsApp, or GroupMe — with the raw payloads.</p>
          </div>
          <DebuggerConsole />
        </section>
      )}
    </div>
  );
};

window.SettingsPage = SettingsPage;
