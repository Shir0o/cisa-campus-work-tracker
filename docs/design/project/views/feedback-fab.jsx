// views/feedback-fab.jsx
// FeedbackFAB — warm "leave a note" floating button, visible to ALL roles.
// Opens a compact panel; submitted items push to the live FEEDBACK array so
// FeedbackInbox picks them up the next time it mounts.

const FFAB_KINDS = [
  { id: "thought",  label: "A thought"       },
  { id: "idea",     label: "An idea"         },
  { id: "off",      label: "Something's off" },
  { id: "request",  label: "A request"       },
];

const FFAB_PLACEHOLDER = {
  thought:  "What's on your mind?",
  idea:     "What if we tried…",
  off:      "Something felt a bit off when…",
  request:  "It would help if…",
};

let _ffabIdSeq = 200;

const FeedbackFAB = ({ persona }) => {
  const [open, setOpen]   = React.useState(false);
  const [kind, setKind]   = React.useState("thought");
  const [msg, setMsg]     = React.useState("");
  const [phase, setPhase] = React.useState("idle"); // idle | busy | done
  const areaRef           = React.useRef(null);

  const reset = () => { setKind("thought"); setMsg(""); setPhase("idle"); };

  const close = () => {
    setOpen(false);
    setTimeout(reset, 320);
  };

  // Focus textarea when panel opens
  React.useEffect(() => {
    if (open && areaRef.current) {
      setTimeout(() => areaRef.current && areaRef.current.focus(), 80);
    }
  }, [open]);

  const submit = () => {
    if (!msg.trim() || phase !== "idle") return;
    setPhase("busy");
    setTimeout(() => {
      const item = {
        id: "fb-u" + (++_ffabIdSeq),
        fromName:  persona.name,
        fromRole:  persona.role,
        initials:  persona.initials,
        channel:   "in-app",
        message:   msg.trim(),
        at:        new Date().toISOString(),
        status:    "new",
      };
      // Write into the live mock array so FeedbackInbox sees it next open
      if (Array.isArray(window.FEEDBACK)) window.FEEDBACK.unshift(item);
      setPhase("done");
      setTimeout(close, 2200);
    }, 550);
  };

  const canSend = msg.trim().length > 0 && phase === "idle";

  return (
    <>
      {/* ── Scrim (closes panel on outside click) ── */}
      {open && <div className="ffab-scrim" onClick={close} aria-hidden="true" />}

      {/* ── Floating button ── */}
      <button
        className={"ffab-btn" + (open ? " is-open" : "")}
        onClick={() => open ? close() : setOpen(true)}
        title="Leave a note for the team"
        aria-label={open ? "Close feedback panel" : "Leave a note for the team"}
        aria-expanded={open}
      >
        {open ? (
          /* × close */
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
            <path d="M2 2l10 10M12 2L2 12" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"/>
          </svg>
        ) : (
          /* pencil */
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <path d="M11.5 1.5a1.414 1.414 0 012 2L4.5 12.5l-3 .5.5-3 9.5-8.5z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" fill="none"/>
          </svg>
        )}
      </button>

      {/* ── Panel ── */}
      {open && (
        <div
          className={"ffab-panel" + (phase === "done" ? " is-done" : "")}
          role="dialog"
          aria-modal="true"
          aria-label="Leave a note for the team"
        >
          {phase === "done" ? (

            /* ── Success ── */
            <div className="ffab-thanks">
              <div className="ffab-thanks-mark">✦</div>
              <p className="ffab-thanks-head">We got your note.</p>
              <p className="ffab-thanks-sub">Thank you for taking the time, {persona.first}.</p>
            </div>

          ) : (

            /* ── Form ── */
            <>
              <div className="ffab-hd">
                <p className="ffab-title">Leave a note</p>
                <p className="ffab-subtitle">Ideas, friction, appreciation — all welcome.</p>
              </div>

              <div className="ffab-kinds" role="group" aria-label="Kind of note">
                {FFAB_KINDS.map(k => (
                  <button
                    key={k.id}
                    className={"ffab-kind" + (kind === k.id ? " on" : "")}
                    onClick={() => setKind(k.id)}
                    type="button"
                  >{k.label}</button>
                ))}
              </div>

              <textarea
                ref={areaRef}
                className="ffab-area"
                placeholder={FFAB_PLACEHOLDER[kind]}
                value={msg}
                onChange={e => setMsg(e.target.value)}
                onKeyDown={e => { if ((e.metaKey || e.ctrlKey) && e.key === "Enter") submit(); }}
                rows={4}
                maxLength={600}
              />

              <div className="ffab-ft">
                <span className="ffab-from">{persona.name} · {persona.roleShort}</span>
                <button
                  className={"ffab-send" + (canSend ? "" : " dim")}
                  onClick={submit}
                  disabled={!canSend}
                  type="button"
                >
                  {phase === "busy" ? "Sending…" : "Send"}
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </>
  );
};

Object.assign(window, { FeedbackFAB });
