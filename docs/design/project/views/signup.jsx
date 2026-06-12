// Public Sign-up Form — "Field notes": a warm, human welcome (no IDs, no mono).

const SignupForm = ({ onBack, onSubmitted }) => {
  const [step, setStep] = React.useState(1);
  const [form, setForm] = React.useState({
    name: "", pronouns: "", year: "", major: "", phone: "", email: "", instagram: "",
    hall: "", howHeard: "", openToPrayer: "", interests: [], notes: ""
  });
  const set = (k, v) => setForm(prev => ({ ...prev, [k]: v }));
  const toggleInterest = (i) => setForm(prev => ({
    ...prev,
    interests: prev.interests.includes(i) ? prev.interests.filter(x => x !== i) : [...prev.interests, i]
  }));

  const interestsList = ["Friday gathering", "Small group", "Worship team", "Outreach", "Prayer group", "1:1 mentorship"];

  const submit = () => {
    setStep(3);
    setTimeout(() => onSubmitted && onSubmitted(form.name), 1800);
  };

  return (
    <div className="signup">
      {/* ---- Left: a warm welcome ---- */}
      <div className="signup-hero">
        <div className="su-brand">
          <div className="sidebar-logo" style={{ width: 38, height: 38, fontSize: 17, borderRadius: 9 }}>C</div>
          <div>
            <div className="su-brand-name">CISA Campus</div>
            <div className="su-brand-sub">Christian Fellowship · Spring '26</div>
          </div>
          <button className="btn btn-sm" style={{ marginLeft: "auto" }} onClick={onBack}>← Back to app</button>
        </div>

        <div>
          <h2 className="su-hero-title">Hey — we'd love<br/>to know you.</h2>
          <p className="su-hero-lead">
            We're a community of students figuring out what it means to follow Jesus on this campus. No assumptions, no pressure — just real conversations, shared meals, and questions held with honesty.
          </p>
        </div>

        <div className="su-feats">
          {[
            { icon: "users", title: "Real people", body: "Show up to a meal, a small group, or just a coffee." },
            { icon: "praying", title: "Honest faith", body: "Bring your questions. Nothing is off-limits." },
            { icon: "bolt", title: "Two minutes", body: "This takes about 120 seconds. We'll reach out within two days." },
          ].map(item => (
            <div key={item.title} className="su-feat">
              <div className="su-feat-ic"><Icon name={item.icon} size={16}/></div>
              <div>
                <div className="su-feat-t">{item.title}</div>
                <div className="su-feat-b">{item.body}</div>
              </div>
            </div>
          ))}
        </div>

        <div className="su-note">
          We hold your details with care, and never share them. You can ask us to remove them any time.
        </div>
      </div>

      {/* ---- Right: the form ---- */}
      <div className="signup-form">
        {step === 3 ? (
          <div className="su-done">
            <div className="su-done-ic"><Icon name="check" size={28}/></div>
            <h1>Thanks, {form.name.split(" ")[0]}.</h1>
            <p className="lead">We got it. Someone from the team — probably Jordan or Ana — will reach out within two days. If you'd like, you're always welcome at our Friday gathering this week (7pm, Lower Common Room).</p>
            <div className="row" style={{ marginTop: 8 }}>
              <button className="btn" onClick={onBack}>← Back to app</button>
              <button className="btn btn-primary" onClick={() => { setStep(1); setForm({ name: "", pronouns: "", year: "", major: "", phone: "", email: "", instagram: "", hall: "", howHeard: "", openToPrayer: "", interests: [], notes: "" }); }}>Add another</button>
            </div>
            <div className="su-note" style={{ marginTop: 16 }}>
              We'll only ever use this to stay in touch with you.
            </div>
          </div>
        ) : (
          <>
            <div>
              <div className="su-progress">
                <span className="su-step">Step {step} of 2</span>
                <div className="bar" style={{ flex: 1, maxWidth: 180 }}>
                  <span style={{ width: step === 1 ? "50%" : "100%" }}></span>
                </div>
              </div>
              <h1>{step === 1 ? "Tell us about you." : "And a little more."}</h1>
              <p className="lead">{step === 1 ? "Just the basics. We'll cover the rest in person." : "All optional — skip anything you'd rather not answer."}</p>
            </div>

            {step === 1 && (
              <div>
                <div className="field">
                  <label>Full name</label>
                  <input value={form.name} onChange={e => set("name", e.target.value)} placeholder="e.g. Naomi Park" />
                </div>
                <div className="field-row">
                  <div className="field">
                    <label>Pronouns (optional)</label>
                    <input value={form.pronouns} onChange={e => set("pronouns", e.target.value)} placeholder="she / her" />
                  </div>
                  <div className="field">
                    <label>Year</label>
                    <select value={form.year} onChange={e => set("year", e.target.value)}>
                      <option value="">Choose…</option>
                      <option>Freshman</option>
                      <option>Sophomore</option>
                      <option>Junior</option>
                      <option>Senior</option>
                      <option>Graduate</option>
                    </select>
                  </div>
                </div>
                <div className="field">
                  <label>Major</label>
                  <select value={form.major} onChange={e => set("major", e.target.value)}>
                    <option value="">Choose…</option>
                    {MAJORS.map(m => <option key={m}>{m}</option>)}
                    <option>Other / undecided</option>
                  </select>
                </div>
                <div className="field-row">
                  <div className="field">
                    <label>Phone</label>
                    <input value={form.phone} onChange={e => set("phone", e.target.value)} placeholder="(___) ___-____" />
                  </div>
                  <div className="field">
                    <label>Email</label>
                    <input value={form.email} onChange={e => set("email", e.target.value)} placeholder="you@umail.edu" />
                  </div>
                </div>
                <div className="field-row">
                  <div className="field">
                    <label>Instagram (optional)</label>
                    <input value={form.instagram} onChange={e => set("instagram", e.target.value)} placeholder="@handle" />
                  </div>
                  <div className="field">
                    <label>Where do you live?</label>
                    <select value={form.hall} onChange={e => set("hall", e.target.value)}>
                      <option value="">Choose…</option>
                      {HALLS.map(h => <option key={h}>{h}</option>)}
                    </select>
                  </div>
                </div>

                <div className="row" style={{ justifyContent: "space-between", marginTop: 6 }}>
                  <button className="btn btn-ghost" onClick={onBack}>Cancel</button>
                  <button className="btn btn-primary" onClick={() => setStep(2)} disabled={!form.name}>
                    Continue <Icon name="arrow-right" size={13}/>
                  </button>
                </div>
              </div>
            )}

            {step === 2 && (
              <div>
                <div className="field">
                  <label>How did you hear about us?</label>
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                    {["Friend", "Org Fair", "Welcome BBQ", "Dorm flyer", "Instagram", "Other"].map(o => (
                      <button key={o} className={"chip " + (form.howHeard === o ? "accent" : "")} style={{ cursor: "pointer" }} onClick={()=>set("howHeard", o)}>{o}</button>
                    ))}
                  </div>
                </div>

                <div className="field">
                  <label>What are you drawn to?</label>
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                    {interestsList.map(i => (
                      <button key={i} className={"chip " + (form.interests.includes(i) ? "accent" : "")} style={{ cursor: "pointer" }} onClick={()=>toggleInterest(i)}>
                        {form.interests.includes(i) && <Icon name="check" size={11}/>}
                        {i}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="field">
                  <label>Anything we can pray for?</label>
                  <textarea rows="3" value={form.openToPrayer} onChange={e => set("openToPrayer", e.target.value)} placeholder="Totally optional. We hold these confidentially." />
                </div>

                <div className="field">
                  <label>Anything else?</label>
                  <textarea rows="2" value={form.notes} onChange={e => set("notes", e.target.value)} placeholder="Allergies, schedule conflicts, questions…" />
                </div>

                <div className="row" style={{ justifyContent: "space-between", marginTop: 6 }}>
                  <button className="btn" onClick={() => setStep(1)}>← Back</button>
                  <button className="btn btn-primary" onClick={submit}>
                    Send it <Icon name="arrow-right" size={13}/>
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};

window.SignupForm = SignupForm;
