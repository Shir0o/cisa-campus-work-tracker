// Main app

const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "theme": "light",
  "density": "comfy",
  "sidebar": "visible",
  "accent": "#3a5a82",
  "defaultBoardView": "board",
  "preview": "desktop",
  "dashMood": "warm",
  "dashFeel": "blues",
  "viewAs": "ft"
}/*EDITMODE-END*/;

// When the app is rendered inside the mobile-preview iframe it carries ?embed=1.
// In that mode it always renders the real shell (never the phone frame) so we
// don't recurse, and it skips the Tweaks panel (the outer instance owns it).
const EMBED = new URLSearchParams(location.search).has("embed");

const ACCENT_OPTIONS = [
  ["#3a5a82", "#c0823f", "#5d8071"],  // slate-blue (default)
  ["#b15c38", "#8c5b73", "#6f8455"],  // terracotta
  ["#5d8071", "#3a5a82", "#b0833a"],  // sage
  ["#7d5a86", "#3a5a82", "#5d8071"],  // plum
];

const App = () => {
  const [view, setView] = React.useState("dashboard");
  const [openContact, setOpenContact] = React.useState(null);
  const [quickAdd, setQuickAdd] = React.useState(false);
  const [drawer, setDrawer] = React.useState(false);
  const [toast, setToast] = React.useState(null);
  const [t, setTweak] = useTweaks(TWEAK_DEFAULTS);
  const vp = useViewport();
  const [searchOpen, setSearchOpen] = React.useState(false);
  const [searchQ, setSearchQ] = React.useState("");
  const searchInputRef = React.useRef(null);
  const [quickAddMode, setQuickAddMode] = React.useState("palette");

  // FT default-landing ("home") — a real in-app control, persisted.
  const [ftHome, setFtHome] = React.useState(() => {
    try { return localStorage.getItem("cisa.ftHome") || "board"; } catch (e) { return "board"; }
  });
  const applyHome = (key) => {
    setFtHome(key);
    try { localStorage.setItem("cisa.ftHome", key); } catch (e) {}
    showToast(key === "board" ? "The Board is now your home." : "My Day is now your home.");
  };

  const role = t.viewAs || "ft";
  const persona = PERSONAS[role] || PERSONAS.ft;
  const allowedNav = ROLE_NAV[role] || ROLE_NAV.ft;
  const isStaff = role === "ft" || role === "trainee";

  // On first load, an FT lands on whichever surface is their home.
  const didInitHome = React.useRef(false);
  React.useEffect(() => {
    if (didInitHome.current) return;
    didInitHome.current = true;
    if (role === "ft") setView(ftHome === "board" ? "board" : "dashboard");
  }, [role]);

  // If the active view isn't available to this role, fall back to Today.
  React.useEffect(() => {
    if (view !== "signup" && view !== "dashboard" && view !== "settings" && !allowedNav.includes(view)) {
      setView("dashboard");
    }
    if (!isStaff) setOpenContact(null);
  }, [role]);

  // Theme — supports "light", "dark", and "system" (follows the OS preference
  // and updates live as it changes).
  React.useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const apply = () => {
      const resolved = t.theme === "system" ? (mq.matches ? "dark" : "light") : t.theme;
      document.documentElement.dataset.theme = resolved;
    };
    apply();
    if (t.theme === "system") {
      mq.addEventListener("change", apply);
      return () => mq.removeEventListener("change", apply);
    }
  }, [t.theme]);

  React.useEffect(() => {
    document.documentElement.style.setProperty("--accent", t.accent);
    // derive accent-soft/line from accent
    const rgb = hexToRgb(t.accent);
    if (rgb) {
      document.documentElement.style.setProperty("--accent-soft", `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.14)`);
      document.documentElement.style.setProperty("--accent-line", `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.32)`);
    }
  }, [t.accent]);

  // global keyboard shortcuts
  const navRef = React.useRef(allowedNav);
  navRef.current = allowedNav;
  React.useEffect(() => {
    const go = (v) => { if (navRef.current.includes(v)) setView(v); };
    const onKey = (e) => {
      const tag = (e.target.tagName || "").toLowerCase();
      if (tag === "input" || tag === "textarea" || tag === "select") return;
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") { e.preventDefault(); setSearchOpen(true); setTimeout(() => searchInputRef.current?.focus(), 50); return; }
      if (e.key === "1") go("dashboard");
      if (e.key === "2") go("board");
      if (e.key === "3") go("contacts");
      if (e.key === "4") go("stage");
      if (e.key === "5") go("attendance");
      if (e.key === "6") go("prayer");
      if (e.key === "7") go("editlog");
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const counts = {
    contacts: CONTACTS.length,
    stage: CONTACTS.length,
    board: (BOARD_SESSIONS.find(s => s.status === "today") || {}).agenda?.filter(a => a.status === "open").length || 0,
    prayer: PRAYERS.filter(p => p.status === "open").length,
    attendance: ATTENDANCE_SESSIONS.length,
    editlog: EDIT_LOG.length,
  };

  const handleOpen = (target) => {
    if (typeof target === "string" && target.startsWith("contact:")) {
      setOpenContact(target.slice(8));
      return;
    }
    setView(target);
    setOpenContact(null);
  };

  const showToast = (msg) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2500);
  };

  // Breadcrumbs
  const titleMap = {
    dashboard: "Today",
    board: "The Board",
    contacts: "People",
    stage: "The Journey",
    attendance: "Gatherings",
    prayer: "Prayer",
    editlog: "History",
    settings: "Settings",
    signup: "Public Sign-up",
  };
  const viewTitle = view === "dashboard" && role === "ft" ? "My Day" : (titleMap[view] || "Workspace");

  const isSignup = view === "signup";
  const isMobilePreview = t.preview === "phone" && !EMBED;

  // One shared TweaksPanel, rendered at the SAME position (index 1) in every
  // branch's root fragment below — so its open/closed state survives when the
  // body swaps between phone frame, signup, and the main shell.
  const tweaksPanel = !EMBED && (
    <TweaksPanel title="Tweaks">
      <TweakSection label="Viewing as" />
      <TweakSelect label="User type" value={t.viewAs} options={[
        { value: "ft", label: "Tony — Full-time staff" },
        { value: "trainee", label: "Zion — Trainee" },
        { value: "student", label: "Timothy — Student" },
        { value: "community", label: "Philip — Community" },
      ]} onChange={v => setTweak("viewAs", v)} />

      <TweakSection label="Theme" />
      <TweakRadio label="Mode" value={t.theme} options={["light", "dark", "system"]} onChange={v => setTweak("theme", v)} />
      <TweakRadio label="Density" value={t.density} options={["comfy", "compact"]} onChange={v => setTweak("density", v)} />
      <TweakColor label="Accent" value={t.accent} options={["#3a5a82","#5d8071","#b15c38","#7d5a86","#b0833a"]} onChange={v => setTweak("accent", v)} />

      <TweakSection label="Layout" />
      <TweakRadio label="Sidebar" value={t.sidebar} options={["visible", "hidden"]} onChange={v => setTweak("sidebar", v)} />

      <TweakSection label="Preview" />
      <TweakRadio label="Device" value={t.preview} options={["desktop", "phone"]} onChange={v => setTweak("preview", v)} />

      <TweakSection label="Dashboard" />
      <TweakSelect label="Mood" value={t.dashMood} options={[
        { value: "warm", label: "Warm & pastoral" },
        { value: "airy", label: "Calm & airy" },
        { value: "modern", label: "Friendly & modern" },
      ]} onChange={v => setTweak("dashMood", v)} />
      <TweakSelect label="Color feeling" value={t.dashFeel} options={[
        { value: "earth", label: "Warm earth" },
        { value: "natural", label: "Soft & natural" },
        { value: "blues", label: "Quiet blues & ink" },
        { value: "plum", label: "Muted plum / dusty rose" },
      ]} onChange={v => setTweak("dashFeel", v)} />

      <TweakSection label="Navigate" />
      <TweakButton label="Open The Board" onClick={() => setView("board")} />
      <TweakButton label="Open Public Sign-up" onClick={() => setView("signup")} />
      <TweakButton label="Search / Quick Add (⌘K)" onClick={() => { setSearchOpen(true); setTimeout(() => searchInputRef.current?.focus(), 50); }} />
      <TweakButton label="Open a contact profile" onClick={() => setOpenContact("C-0142")} />
    </TweaksPanel>
  );

  const toastEl = toast && <div className="toast-wrap"><div className="toast"><span className="dot"></span>{toast}</div></div>;

  const feedbackFAB = !EMBED && !isSignup && !isMobilePreview && (
    <FeedbackFAB persona={persona} />
  );

  // Mobile preview: render the full app inside a 390px-wide iframe so its own
  // viewport drives the real media queries + isMobile logic — a faithful render
  // rather than a faked-narrow container.
  if (isMobilePreview) {
    return (
      <>
        <div className="mobile-stage">
          <div className="phone">
            <iframe className="phone-screen" src="index.html?embed=1" title="Mobile preview" />
          </div>
        </div>
        {tweaksPanel}
        {toastEl}
      </>
    );
  }

  if (isSignup) {
    return (
      <>
        <div className="app" data-sidebar="hidden">
          <main className="main" style={{ gridColumn: "1 / -1" }}>
            <div className="content" data-screen-label="Public Sign-up">
              <SignupForm onBack={() => setView("dashboard")} onSubmitted={(n) => { showToast(`Welcome, ${n.split(' ')[0]} — added to contacts.`); setView("contacts"); }} />
            </div>
          </main>
        </div>
        {tweaksPanel}
        {toastEl}
      </>
    );
  }

  return (
    <>
    <div className="app" data-sidebar={t.sidebar} data-density={t.density}>
      <Sidebar view={view} setView={(v) => { setView(v); setOpenContact(null); }} counts={counts} role={role} persona={persona} onOpenSettings={() => setView("settings")} />

      {/* Mobile drawer */}
      {drawer && (
        <>
          <div className="drawer-scrim" style={{ display: "block" }} onClick={() => setDrawer(false)}></div>
          <div style={{
            position: "fixed", left: 0, top: 0, bottom: 0, width: "min(280px, 82vw)",
            background: "var(--bg-elev)", zIndex: 90,
            animation: "slidein 200ms ease",
            display: "flex", flexDirection: "column",
            borderRight: "1px solid var(--border-soft)"
          }}>
            <Sidebar view={view} setView={(v) => { setView(v); setOpenContact(null); setDrawer(false); }} counts={counts} role={role} persona={persona} onOpenSettings={() => { setView("settings"); setOpenContact(null); setDrawer(false); }} />
          </div>
        </>
      )}

      <main className="main">
        <div className="topbar">
          <button className="icon-btn hamburger" onClick={() => setDrawer(true)} title="Menu">
            <Icon name="list" size={16}/>
          </button>
          <div className="crumbs">
            <span className="dim">CISA</span>
            <span className="sep">/</span>
            <span className={openContact ? "dim" : "here"} style={{cursor: openContact ? "pointer" : "default"}} onClick={() => openContact && setOpenContact(null)}>{viewTitle}</span>
            {openContact && (
              <>
                <span className="sep">/</span>
                <span className="here">{contactById(openContact)?.name}</span>
              </>
            )}
          </div>
          <div className="topbar-spacer"></div>
          {isStaff ? (
            <div className="omni" style={{ position: "relative" }}>
              <span className="omni-search" onClick={() => setSearchOpen(true)}>
                <Icon name="search" size={13} />
                <input
                  ref={searchInputRef}
                  placeholder="Search people, conversations, notes…"
                  value={searchQ}
                  onChange={e => setSearchQ(e.target.value)}
                  onFocus={() => setSearchOpen(true)}
                  onKeyDown={e => {
                    if (e.key === "Escape") { setSearchOpen(false); setSearchQ(""); e.target.blur(); }
                  }}
                />
                {searchQ && (
                  <button className="gs-clear"
                          onClick={ev => { ev.stopPropagation(); setSearchQ(""); searchInputRef.current?.focus(); }}
                          title="Clear">
                    <Icon name="x" size={12} />
                  </button>
                )}
              </span>
              {searchOpen && (
                <GlobalSearch
                  q={searchQ}
                  onQChange={setSearchQ}
                  onClose={() => { setSearchOpen(false); setSearchQ(""); }}
                  onOpen={handleOpen}
                  onOpenContact={id => { setOpenContact(id); setSearchOpen(false); setSearchQ(""); }}
                  isStaff={isStaff}
                  isFullStaff={role === "ft"}
                  onNewContact={() => { setSearchOpen(false); setQuickAddMode("contact"); setQuickAdd(true); }}
                />
              )}
            </div>
          ) : (
            <div className="topbar-me">
              <span className="topbar-me-role">{persona.roleShort}</span>
              <Avatar initials={persona.initials} size="l" />
            </div>
          )}
          <NotificationBell role={role} persona={persona} onOpenContact={setOpenContact} onOpen={handleOpen} onToast={showToast} />
        </div>

        <div className="content" data-screen-label={viewTitle}>
          {openContact && isStaff ? (
            <ContactDetail contactId={openContact} onClose={() => setOpenContact(null)} onOpenContact={setOpenContact} isMobile={vp.isMobile} personaStaffId={persona.staffId} onToast={showToast} />
          ) : (
            <>
              {view === "dashboard" && <Landing role={role} onOpenContact={setOpenContact} onOpen={handleOpen} onToast={showToast} feel={t.dashFeel} home={ftHome} onSetHome={() => applyHome("myday")} />}
              {view === "board" && allowedNav.includes("board") && <BoardFT onOpen={handleOpen} onToast={showToast} feel={t.dashFeel} home={ftHome} onSetHome={() => applyHome("board")} />}
              {view === "contacts" && allowedNav.includes("contacts") && <Contacts onOpenContact={setOpenContact} onQuickAdd={() => setQuickAdd(true)} isMobile={vp.isMobile} />}
              {view === "stage" && allowedNav.includes("stage") && <StageBoard onOpenContact={setOpenContact} isMobile={vp.isMobile} />}
              {view === "attendance" && <Attendance onOpenContact={setOpenContact} isMobile={vp.isMobile} />}
              {view === "prayer" && <Prayer onOpenContact={setOpenContact} isMobile={vp.isMobile} />}
              {view === "editlog" && allowedNav.includes("editlog") && <EditLog onOpenContact={setOpenContact} isMobile={vp.isMobile} />}
              {view === "settings" && <SettingsPage persona={persona} role={role} home={ftHome} onSetHome={(key) => applyHome(key)} theme={t.theme} onSetTheme={(v) => setTweak("theme", v)} onToast={showToast} onOpen={handleOpen} />}
            </>
          )}
        </div>
      </main>

      {/* Mobile bottom nav */}
      {isStaff ? (
        <nav className="bottom-nav">
          <div className="bn-inner">
            <button className={"bn-item " + (view==="dashboard" && !openContact ? "active" : "")} onClick={() => { setOpenContact(null); setView("dashboard"); }}>
              <Icon name="dashboard" size={18}/>
              <span>Home</span>
            </button>
            <button className={"bn-item " + (view==="contacts" && !openContact ? "active" : "")} onClick={() => { setOpenContact(null); setView("contacts"); }}>
              <Icon name="users" size={18}/>
              <span>People</span>
            </button>
            <button className="bn-item" onClick={() => { setSearchQ(""); setSearchOpen(true); }}>
              <span className="fab-wrap"><Icon name="search" size={18}/></span>
            </button>
            <button className={"bn-item " + (view==="stage" && !openContact ? "active" : "")} onClick={() => { setOpenContact(null); setView("stage"); }}>
              <Icon name="board" size={18}/>
              <span>Journey</span>
            </button>
            <button className={"bn-item " + (view==="prayer" && !openContact ? "active" : "")} onClick={() => { setOpenContact(null); setView("prayer"); }}>
              <Icon name="praying" size={18}/>
              {counts.prayer > 0 && <span className="count">{counts.prayer}</span>}
              <span>Prayer</span>
            </button>
          </div>
        </nav>
      ) : (
        <nav className="bottom-nav">
          <div className="bn-inner">
            <button className={"bn-item " + (view==="dashboard" ? "active" : "")} onClick={() => setView("dashboard")}>
              <Icon name="dashboard" size={18}/>
              <span>Home</span>
            </button>
            <button className={"bn-item " + (view==="attendance" ? "active" : "")} onClick={() => setView("attendance")}>
              <Icon name="calendar" size={18}/>
              <span>Gatherings</span>
            </button>
            <button className={"bn-item " + (view==="prayer" ? "active" : "")} onClick={() => setView("prayer")}>
              <Icon name="praying" size={18}/>
              <span>Prayer</span>
            </button>
          </div>
        </nav>
      )}

      {searchOpen && isStaff && (
        <div className="gs-scrim" onClick={() => { setSearchOpen(false); setSearchQ(""); }} />
      )}
      {quickAdd && isStaff && (
        <QuickAdd
          initialMode={quickAddMode}
          onClose={() => { setQuickAdd(false); setQuickAddMode("palette"); }}
          onCreated={(name) => { setQuickAdd(false); setQuickAddMode("palette"); showToast(`Added ${name} — assigned to you.`); setView("contacts"); }}
          onOpen={(target) => { setQuickAdd(false); setQuickAddMode("palette"); handleOpen(target); }}
        />
      )}
    </div>
    {feedbackFAB}
    {tweaksPanel}
    {toastEl}
    </>
  );
};

function hexToRgb(h) {
  if (!h) return null;
  const m = h.replace("#", "");
  if (m.length !== 6) return null;
  return { r: parseInt(m.slice(0,2), 16), g: parseInt(m.slice(2,4), 16), b: parseInt(m.slice(4,6), 16) };
}

ReactDOM.createRoot(document.getElementById("root")).render(<App />);
