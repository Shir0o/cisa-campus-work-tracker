// Settings → "Quick add by text" — AI natural-language playground + the
// channels people can add contacts through (Siri/API, SMS, WhatsApp, GroupMe).

// ---- A copyable code / endpoint block ----
const CodeBlock = ({ code, label }) => {
  const [copied, setCopied] = React.useState(false);
  const copy = () => {
    try {
      navigator.clipboard.writeText(code);
    } catch (e) {}
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  };
  return (
    <div className="codeblock">
      {label && <div className="codeblock-label">{label}</div>}
      <div className="codeblock-body">
        <pre className="codeblock-pre">{code}</pre>
        <button className="codeblock-copy" onClick={copy} aria-label="Copy">
          <Icon name={copied ? "check" : "copy"} size={13} />
          <span>{copied ? "Copied" : "Copy"}</span>
        </button>
      </div>
    </div>
  );
};

// ---- A naive "Gemini-ish" parser, purely client-side for the demo ----
const YEARS = ["freshman", "sophomore", "junior", "senior", "graduate", "grad"];
const KNOWN_MAJORS = ["philosophy","biology","history","computer science","chemistry","physics","english","psychology","economics","engineering","mathematics","math","nursing","business","sociology","art","music","theology"];
function parseDescription(text) {
  const t = text.trim();
  if (!t) return null;
  const out = {};

  // name — after "met"/"meet" (verb matched loosely, but the captured name must
  // stay strictly Capitalized so we don't swallow following lowercase words).
  let m = t.match(/(?:[Mm]et|[Mm]eet)(?:\s+with)?\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,2})/);
  if (!m) {
    const stop = /^(Met|Meet|Sophomore|Freshman|Junior|Senior|Graduate)$/;
    const words = t.match(/\b[A-Z][a-z]+\b/g) || [];
    for (let i = 0; i < words.length - 1; i++) {
      if (!stop.test(words[i]) && !stop.test(words[i + 1])) { m = [null, words[i] + " " + words[i + 1]]; break; }
    }
  }
  out.name = m ? m[1] : "";

  const yr = YEARS.find(y => new RegExp("\\b" + y + "\\b", "i").test(t));
  out.year = yr ? (yr === "grad" ? "Graduate" : yr[0].toUpperCase() + yr.slice(1)) : "";

  let major = "";
  let mj = t.match(/major(?:ing)?\s+(?:in\s+)?([a-z ]+?)(?:[.,]|\s+(?:student|phone|and|who|she|he|they|is|interested|can)\b|$)/i);
  if (!mj) mj = t.match(/studying\s+([a-z ]+?)(?:[.,]|\s+(?:student|phone|and)\b|$)/i);
  if (!mj) mj = t.match(/\b([a-z]+)\s+(?:student|major)\b/i);
  if (mj) major = mj[1].trim();
  if (!major) major = KNOWN_MAJORS.find(k => new RegExp("\\b" + k + "\\b", "i").test(t)) || "";
  out.major = major ? major.replace(/\b\w/g, c => c.toUpperCase()) : "";

  const ph = t.match(/(\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}|\b\d{3}[\s.-]\d{4}\b)/);
  out.phone = ph ? ph[1] : "";

  const em = t.match(/[\w.+-]+@[\w-]+\.[\w.-]+/);
  out.email = em ? em[0] : "";

  const loc = t.match(/at\s+([A-Z][A-Za-z]+(?:\s+(?:Hall|Coffee|Center|Library|Cafe|Café|Cafeteria))?)/);
  out.where = loc ? loc[1] : "";

  const intr = t.match(/interested in\s+([a-z ]+?)(?:[.,]|$)/i);
  out.interest = intr ? intr[1].trim() : "";

  return out;
}

const AIPlayground = ({ onToast }) => {
  const example = "Met John Doe at Miller Hall. Sophomore philosophy student, phone is 555-1234. Interested in Friday discussions.";
  const [text, setText] = React.useState("");
  const [parsed, setParsed] = React.useState(null);
  const [busy, setBusy] = React.useState(false);

  const run = () => {
    const src = text.trim() || example;
    if (!text.trim()) setText(example);
    setBusy(true);
    setParsed(null);
    setTimeout(() => {
      setParsed(parseDescription(src));
      setBusy(false);
    }, 900);
  };

  const add = () => {
    onToast && onToast(`Added ${parsed.name || "a new contact"} — parsed from your note.`);
    setParsed(null);
    setText("");
  };

  const init = parsed && (parsed.name || "?").split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase();

  return (
    <div className="ai-play">
      <div className="ai-play-head">
        <span className="ai-play-ico"><Icon name="sparkles" size={16} /></span>
        <div>
          <div className="ai-play-title">Natural-language playground</div>
          <div className="ai-play-sub">
            Type or paste a note about someone you met — the way you'd text it or say it out loud.
            It's parsed and turned into a contact card, ready to keep.
          </div>
        </div>
      </div>

      <textarea
        className="ai-play-input"
        value={text}
        onChange={e => setText(e.target.value)}
        placeholder={"e.g.  " + example}
        rows={3}
      />

      <div className="ai-play-actions">
        <button className="btn btn-primary" onClick={run} disabled={busy}>
          <Icon name={busy ? "clock" : "sparkles"} size={13} />
          {busy ? "Reading…" : "Try Quick Add"}
        </button>
        {!text && <button className="btn btn-ghost" onClick={() => setText(example)}>Use the example</button>}
      </div>

      {parsed && (
        <div className="ai-result">
          <div className="ai-result-tag"><Icon name="sparkles" size={12} /> Parsed into a contact</div>
          <div className="ai-result-card">
            <Avatar initials={init} size="l" />
            <div className="ai-result-body">
              <div className="ai-result-name">{parsed.name || "Name not found"}</div>
              <div className="ai-result-meta">
                {[parsed.year, parsed.major].filter(Boolean).join(" · ") || "—"}
              </div>
              <div className="ai-result-fields">
                {parsed.phone && <span className="ai-field"><Icon name="phone" size={12} />{parsed.phone}</span>}
                {parsed.email && <span className="ai-field"><Icon name="mail" size={12} />{parsed.email}</span>}
                {parsed.where && <span className="ai-field"><Icon name="house" size={12} />Met at {parsed.where}</span>}
                {parsed.interest && <span className="ai-field"><Icon name="heart" size={12} />{parsed.interest}</span>}
              </div>
            </div>
          </div>
          <div className="ai-result-foot">
            <span className="muted">Looks right? Keep it, or edit the details after.</span>
            <button className="btn btn-primary" onClick={add}><Icon name="check" size={13} /> Add to People</button>
          </div>
        </div>
      )}
    </div>
  );
};

// ---- One integration channel (expandable) ----
const ChannelCard = ({ icon, title, blurb, defaultOpen, children }) => {
  const [open, setOpen] = React.useState(!!defaultOpen);
  return (
    <div className={"chan " + (open ? "is-open" : "")}>
      <button className="chan-head" onClick={() => setOpen(o => !o)} aria-expanded={open}>
        <span className="chan-ico"><Icon name={icon} size={16} /></span>
        <span className="chan-headtext">
          <span className="chan-title">{title}</span>
          <span className="chan-blurb">{blurb}</span>
        </span>
        <span className="chan-chev"><Icon name="down" size={15} /></span>
      </button>
      {open && <div className="chan-body">{children}</div>}
    </div>
  );
};

const Steps = ({ items }) => (
  <ol className="chan-steps">
    {items.map((s, i) => (
      <li key={i} className="chan-step">
        <span className="chan-step-n">{i + 1}</span>
        <span className="chan-step-t">{s}</span>
      </li>
    ))}
  </ol>
);

const Integrations = ({ onToast }) => {
  const curl =
`curl -X POST "https://cisa-campus-work-traker.pages.dev/api/quick-add" \\
  -H "Content-Type: application/json" \\
  -d '{"text": "Met Sarah Doe yesterday at Campus Coffee. She is a
       freshman majoring in biology and can be reached at
       sarah12@campus.edu or (555) 789-0123. Interested in study group."}'`;

  return (
    <div className="integrations">
      <AIPlayground onToast={onToast} />

      <div className="chan-list">
        <ChannelCard
          icon="command"
          title="Siri & the developer API"
          blurb="Add contacts from iOS Shortcuts, Siri, or your own automations."
          defaultOpen
        >
          <p className="chan-p">
            Say <em>“Hey Siri, Quick Add…”</em> and pass a raw description, or POST to the
            endpoint directly from any pipeline. Same parser, same result.
          </p>
          <CodeBlock label="POST  ·  curl request template" code={curl} />
        </ChannelCard>

        <ChannelCard
          icon="msg"
          title="SMS & WhatsApp"
          blurb="Text a new contact straight in from a single Twilio number."
        >
          <p className="chan-p">
            Point your Twilio number's inbound webhook here. Standard SMS and official
            WhatsApp messages both arrive at the same place.
          </p>
          <CodeBlock label="Twilio inbound webhook URL" code="https://cisa-campus-work-traker.pages.dev/api/webhook/sms" />
          <Steps items={[
            "In Twilio, choose your phone or sandbox number.",
            "Under the messaging webhook settings, paste this URL.",
            "Set the method to HTTP POST and save.",
          ]} />
        </ChannelCard>

        <ChannelCard
          icon="users"
          title="GroupMe bot"
          blurb="Let the whole group chat add contacts with a quick !add line."
        >
          <p className="chan-p">
            Everyone in the group can text new contacts using a trigger prefix.
            The bot reads the message, parses it, and files it for the team.
          </p>
          <CodeBlock label="GroupMe bot callback URL" code="https://cisa-campus-work-traker.pages.dev/api/webhook/groupme" />
          <Steps items={[
            "Go to dev.groupme.com and open the Bots menu.",
            "Click Create Bot and link your group chat.",
            "Paste this callback URL and submit.",
          ]} />

          <div className="chan-sub">
            <div className="chan-sub-title">Prefix triggers</div>
            <p className="chan-sub-p">Start a message with any of these so the bot knows to parse it:</p>
            <div className="trig-row">
              <code className="trig">!add</code>
              <code className="trig">/add</code>
              <code className="trig">add:</code>
            </div>
          </div>

          <div className="chan-sub">
            <div className="chan-sub-title">Parsing options</div>
            <p className="chan-sub-p">Add an optional keyword right after the prefix to steer the parser:</p>

            <div className="parse-opt">
              <div className="parse-opt-head">
                <code className="trig trig-accent">contact</code>
                <span className="parse-opt-default">default</span>
              </div>
              <p className="parse-opt-desc">
                Parses name, role, details and contact info, then creates a card or merges
                with an existing one.
              </p>
              <CodeBlock code="!add contact Jerry Doe is a sophomore majoring in history, phone 555-0192, met at cafeteria." />
            </div>

            <div className="parse-opt">
              <div className="parse-opt-head">
                <code className="trig trig-accent">interaction</code>
              </div>
              <p className="parse-opt-desc">
                Logs a follow-up conversation or prayer update in the history of an
                existing contact.
              </p>
              <CodeBlock code="!add interaction Jerry Doe and I studied Romans today, shared about exams and prayed together." />
            </div>
          </div>
        </ChannelCard>
      </div>
    </div>
  );
};

Object.assign(window, { CodeBlock, Integrations });
