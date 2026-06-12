// Notification Center — "Field notes": not an alert feed, but gentle nudges and
// news from across the team. A bell in the topbar opens a small panel grouped
// into "Worth a look" (unread) and "Earlier". Each item is a warm, plain-spoken
// line tied to a real person or moment, with a tonal icon node like History.
//
// Read / dismissed state persists in localStorage, namespaced by viewing role
// so switching personas doesn't bleed. Items are generated from the live mock
// data (new faces, prayers, overdue care, gatherings) so the feed feels true.

// ---- helpers ----
const ntfFirst = (cid) => { const c = contactById(cid); return c ? c.name.split(" ")[0] : "them"; };
const ntfStaff = (uid) => { const s = staffById(uid); return s ? s.name.split(" ")[0] : "someone"; };

// Build the feed for a given role + persona. Returns newest-first.
// Each item: { id, tone, icon, title, body, at, contactId?, go?, fresh }
//   tone:  accent | violet | amber | teal | sage   (matches History nodes)
//   fresh: unread by default on a clean slate (the believable "new since")
function buildNotifications(role, persona) {
  const isStaff = role === "ft" || role === "trainee";

  if (isStaff) {
    return [
      {
        id: "n-newface", tone: "teal", icon: "users", at: hoursAgo(2), fresh: true,
        contactId: "C-0234",
        title: `${ntfFirst("C-0234")} just signed up`,
        body: "He found us through the Org Fair form and said his roommate keeps asking him about God. He's waiting to be welcomed.",
      },
      {
        id: "n-prayer-new", tone: "violet", icon: "praying", at: hoursAgo(3.5), fresh: true,
        contactId: "C-0167",
        title: `A new prayer for ${ntfFirst("C-0167")}`,
        body: `${ntfStaff("u3")} asked the team to carry her — wisdom on suffering, after losing her grandmother last year.`,
      },
      {
        id: "n-reach", tone: "accent", icon: "heart", at: hoursAgo(5), fresh: true,
        contactId: "C-0238",
        title: `It's been a little while with ${ntfFirst("C-0238")}`,
        body: "Eight days since anyone connected. She's skeptical but kind — the easy kind of person to let quietly slip.",
      },
      {
        id: "n-answered", tone: "sage", icon: "check", at: hoursAgo(7), fresh: true,
        contactId: "C-0195",
        title: "A prayer was answered",
        body: `${ntfStaff("u5")} marked ${ntfFirst("C-0195")}'s visa renewal answered — it came through this week.`,
      },
      {
        id: "n-gather", tone: "amber", icon: "calendar", at: daysAhead(2), go: "attendance", future: true,
        title: "Friday Night Gathering is coming up",
        body: "This Friday at 7 in the Lower Common Room. Thirteen people are planning to come.",
      },
      {
        id: "n-task", tone: "accent", icon: "clock", at: hoursAgo(10),
        contactId: "C-0203",
        title: `You said you'd pray with ${ntfFirst("C-0203")}`,
        body: "Her dad's check-up is tomorrow. She's been holding a lot of hard questions about suffering.",
      },
      {
        id: "n-journey", tone: "accent", icon: "arrow-right", at: hoursAgo(22),
        contactId: "C-0227",
        title: `${ntfStaff("u4")} walked ${ntfFirst("C-0227")} a step further`,
        body: "From Second Contact to Regular — she's on the worship team now.",
      },
      {
        id: "n-event", tone: "amber", icon: "calendar", at: daysAgo(2), go: "attendance",
        title: "Worship Night is on the calendar",
        body: `${ntfStaff("u1")} added it for the 17th, 8pm in the Chapel.`,
      },
    ];
  }

  // Student + community: a gentler, smaller window.
  return [
    {
      id: "n-m-gather", tone: "amber", icon: "calendar", at: daysAhead(2), go: "attendance", future: true,
      title: "Friday Night Gathering is in two days",
      body: "7:00 in the Lower Common Room. We'd love to see you there.",
    },
    {
      id: "n-m-prayer", tone: "violet", icon: "praying", at: hoursAgo(6), go: "prayer", fresh: true,
      title: "The team prayed for you this week",
      body: "Something you shared was carried in Tuesday's prayer huddle. You're not walking it alone.",
    },
    {
      id: "n-m-answered", tone: "sage", icon: "check", at: daysAgo(2), go: "prayer",
      title: "A prayer was answered",
      body: "One of the prayers the community has been holding was marked answered. Thanks be to God.",
    },
    {
      id: "n-m-worship", tone: "amber", icon: "calendar", at: daysAhead(14), go: "attendance", future: true,
      title: "Worship Night — save the date",
      body: "The 17th at 8 in the Chapel. Bring a friend.",
    },
  ];
}

// relTime, but phrases future items gently ("in 2 days", "Friday-ish").
function ntfWhen(item) {
  if (item.future) {
    const t = new Date(item.at).getTime();
    const days = Math.round((t - Date.now()) / 86400000);
    if (days <= 0) return "today";
    if (days === 1) return "tomorrow";
    if (days < 7) return `in ${days} days`;
    return `in ${Math.round(days / 7)} wk`;
  }
  return relTime(item.at);
}

const NotificationBell = ({ role, persona, onOpenContact, onOpen, onToast }) => {
  const items = React.useMemo(() => buildNotifications(role, persona), [role, persona && persona.id]);
  const storeKey = `cisa.notif.read.${role}`;
  const dismissKey = `cisa.notif.dismiss.${role}`;

  // On a clean slate, everything NOT marked fresh starts read — so the badge
  // shows a believable "new since you last looked" count, not the whole feed.
  const [read, setRead] = React.useState(() => {
    try {
      const saved = localStorage.getItem(storeKey);
      if (saved) return new Set(JSON.parse(saved));
    } catch (e) {}
    return new Set(items.filter(i => !i.fresh).map(i => i.id));
  });
  const [dismissed, setDismissed] = React.useState(() => {
    try {
      const saved = localStorage.getItem(dismissKey);
      if (saved) return new Set(JSON.parse(saved));
    } catch (e) {}
    return new Set();
  });

  const [open, setOpen] = React.useState(false);
  const wrapRef = React.useRef(null);

  const persist = (key, set) => { try { localStorage.setItem(key, JSON.stringify([...set])); } catch (e) {} };

  const visible = items.filter(i => !dismissed.has(i.id));
  const unread = visible.filter(i => !read.has(i.id));

  const markRead = (id) => setRead(prev => { const n = new Set(prev); n.add(id); persist(storeKey, n); return n; });
  const markAllRead = () => setRead(() => { const n = new Set(items.map(i => i.id)); persist(storeKey, n); return n; });
  const dismiss = (id) => setDismissed(prev => { const n = new Set(prev); n.add(id); persist(dismissKey, n); return n; });

  // close on outside-click / Escape
  React.useEffect(() => {
    if (!open) return;
    const onDown = (e) => { if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false); };
    const onKey = (e) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDown); window.removeEventListener("keydown", onKey); };
  }, [open]);

  const handleActivate = (item) => {
    markRead(item.id);
    setOpen(false);
    if (item.contactId && onOpenContact) onOpenContact(item.contactId);
    else if (item.go && onOpen) onOpen(item.go);
  };

  const renderItem = (item) => (
    <div
      key={item.id}
      className={"ntf-item" + (read.has(item.id) ? " is-read" : "")}
      onClick={() => handleActivate(item)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === "Enter") handleActivate(item); }}
    >
      <span className={"ntf-ico " + item.tone}><Icon name={item.icon} size={15} /></span>
      <div className="ntf-main">
        <div className="ntf-title">{item.title}</div>
        <div className="ntf-body">{item.body}</div>
        <div className="ntf-when">{ntfWhen(item)}</div>
      </div>
      {!read.has(item.id) && <span className="ntf-unread-dot" aria-hidden="true"></span>}
      <button
        className="ntf-dismiss"
        title="Set aside"
        aria-label="Set aside"
        onClick={(e) => { e.stopPropagation(); dismiss(item.id); }}
      >
        <Icon name="x" size={13} />
      </button>
    </div>
  );

  const freshItems = visible.filter(i => !read.has(i.id));
  const earlierItems = visible.filter(i => read.has(i.id));

  return (
    <div className="ntf" ref={wrapRef}>
      <button
        className={"ntf-bell" + (open ? " is-open" : "")}
        onClick={() => setOpen(o => !o)}
        title="What's new"
        aria-label={unread.length ? `${unread.length} new notifications` : "Notifications"}
      >
        <Icon name="bell" size={17} />
        {unread.length > 0 && <span className="ntf-badge">{unread.length > 9 ? "9+" : unread.length}</span>}
      </button>

      {open && (
        <div className="ntf-panel" role="dialog" aria-label="Notifications">
          <div className="ntf-head">
            <div className="ntf-head-l">
              <div className="ntf-head-title">What's stirring</div>
              <div className="ntf-head-sub">
                {unread.length > 0
                  ? `${unread.length} ${unread.length === 1 ? "thing" : "things"} since you last looked`
                  : "You're all caught up"}
              </div>
            </div>
            {unread.length > 0 && (
              <button className="ntf-allread" onClick={markAllRead}>Mark all read</button>
            )}
          </div>

          <div className="ntf-scroll">
            {visible.length === 0 ? (
              <div className="ntf-empty">
                <span className="ntf-empty-ico"><Icon name="heart" size={20} /></span>
                <div className="ntf-empty-title">Nothing needs you right now</div>
                <div className="ntf-empty-sub">A quiet inbox is a kind of grace. We'll let you know when something stirs.</div>
              </div>
            ) : (
              <>
                {freshItems.length > 0 && (
                  <div className="ntf-group">
                    <div className="ntf-group-label">Worth a look</div>
                    {freshItems.map(renderItem)}
                  </div>
                )}
                {earlierItems.length > 0 && (
                  <div className="ntf-group">
                    <div className="ntf-group-label">Earlier</div>
                    {earlierItems.map(renderItem)}
                  </div>
                )}
              </>
            )}
          </div>

          <button
            className="ntf-foot"
            onClick={() => {
              setOpen(false);
              if ((role === "ft") && onOpen) onOpen("editlog");
              else if (onOpen) onOpen("prayer");
            }}
          >
            {role === "ft" ? "See the whole record in History" : "Open Prayer"}
            <Icon name="arrow-right" size={14} />
          </button>
        </div>
      )}
    </div>
  );
};

window.NotificationBell = NotificationBell;
