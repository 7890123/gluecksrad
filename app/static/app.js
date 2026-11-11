/* Glücksrad v2 – Frontend */
const TAU = Math.PI * 2;
const state = {
  user: null, view: "classes",
  classes: [], current: null, tab: "wheel",
  rotation: 0, spinning: false, pendingRating: false, drawn: null, winnerPos: null,
  flash: new Set(), flashUntil: 0, pointerKick: 0, lights: 0,
};

/* ---------------- Hilfsfunktionen ---------------- */
const $ = s => document.querySelector(s);
const esc = s => String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
// Turbo-Modus (pro Fach, im Browser gemerkt): Fragen aus dem Pool, Rad und Ton 5x schneller, eigene Schwellen
const TURBO_SPEED = 5;
const isTurbo = () => !!state.current && store.get("turbo:" + state.current.subject) === "1";
const outcomeOf = s => isTurbo() ? (s >= 90 ? "removed" : s >= 30 ? "kept" : "added") : s >= 70 ? "removed" : s >= 50 ? "kept" : "added";
const Q_DELAY = 10;            // Sekunden nach dem Ziehen, bis die Frage erscheint
const Q_OK = 50, Q_DONE = 3;   // Frage zählt ab 50 % als richtig, nach 3x richtig kommt sie ins Archiv (nicht gelöscht)
const isItac = () => store.get("itac") === "1";   // ITAC A Mode (pro Browser): weiße Zeichenfläche unter der Frage
// Fragen mit „(2P)“ oder „(3P)“ im Text kommen im normalen Modus dran, alle anderen nur im Turbo
const isNormalQ = q => /\(\s*[23]\s*P\s*\)/i.test(q.text);
const OUT_TEXT_STD = { removed: "fliegt aus dem Rad", kept: "bleibt im Rad", added: "kommt ein zusätzliches Mal ins Rad" };
const OUT_SHORT_STD = { removed: "raus", kept: "bleibt", added: "+1 im Rad" };
/* Saison-Themes: alles, was sich je Theme unterscheidet, an einer Stelle */
const SEASONS = {
  none: { icon: "✨", name: "Standard", hub: "logo.png", spin: "Drehen!", winLabel: "Gezogen wurde", tagline: "Wer ist dran?",
    out: OUT_TEXT_STD, short: OUT_SHORT_STD, palette: null,
    rim: ["#0a5ea8", "#06264a", "#0b4f8f"], bulbs: ["152,193,15", "235,100,32", "120,190,255"],
    confetti: ["#0062ab", "#98c10f", "#eb6420", "#2b8ad8", "#c3e05a", "#ffffff"], emoji: null },
  halloween: { icon: "🎃", name: "Halloween", hub: "halloween/pumpkin.svg", spin: "🎃 Verhexen!", winLabel: "Der Fluch trifft …", tagline: "Wer wird verhext?",
    out: { removed: "entkommt dem Fluch 👻 (raus)", kept: "bleibt im Spukrad 🕸️", added: "wird doppelt verhext 🧙 (+1 im Rad)" },
    short: { removed: "entkommen", kept: "bleibt", added: "verhext +1" },
    // Kürbis, Hexenlila, Gift-Grün, Blutrot, Senf, Nachtviolett
    palette: [[24, 100, 52], [268, 62, 48], [104, 62, 38], [356, 72, 44], [40, 88, 46], [282, 40, 30]],
    rim: ["#2a1240", "#0d0614", "#3b1a52"], bulbs: ["255,140,26", "160,90,255", "124,255,79"],
    confetti: ["#ff7a1a", "#8b5cf6", "#7cff4f", "#1a1024", "#ffd23f", "#f5f0ff"], emoji: ["🎃", "🦇", "👻", "🍬", "🕷️", "🍭"],
    font: { family: "Creepster", url: "https://fonts.googleapis.com/css2?family=Creepster&display=swap" } },
  christmas: { icon: "🎄", name: "Weihnachten", hub: "christmas/bauble.svg", spin: "🎁 Bescheren!", winLabel: "Das Christkind wählt …", tagline: "Wer kommt dran? Ho ho ho!",
    out: { removed: "darf sich ans Kaminfeuer setzen ☕ (raus)", kept: "bleibt am Baum 🎄", added: "bekommt eine Extra-Kugel 🎁 (+1 im Rad)" },
    short: { removed: "beschert", kept: "bleibt", added: "+1 Kugel" },
    // Rot, Tannengrün, Gold, Weinrot, Eisblau, Dunkelgrün
    palette: [[355, 78, 46], [140, 55, 32], [43, 90, 46], [345, 60, 32], [200, 60, 45], [155, 45, 24]],
    rim: ["#7a0b16", "#2b0508", "#14532d"], bulbs: ["255,236,170", "255,80,80", "110,231,140"],
    confetti: ["#e11d2e", "#16a34a", "#f5b800", "#ffffff", "#bfe3ff", "#7a0b16"], emoji: ["❄️", "🎁", "⭐", "🎄", "🔔", "🍪"],
    font: { family: "Mountains of Christmas", url: "https://fonts.googleapis.com/css2?family=Mountains+of+Christmas:wght@700&display=swap" } },
  easter: { icon: "🐰", name: "Ostern", hub: "easter/egg.svg", spin: "🐰 Hoppeln!", winLabel: "Der Osterhase bringt …", tagline: "Wer findet das Ei?",
    out: { removed: "hat alle Eier gefunden 🧺 (raus)", kept: "hoppelt weiter 🐰", added: "bekommt ein Extra-Ei 🥚 (+1 im Rad)" },
    short: { removed: "gefunden", kept: "hoppelt", added: "+1 Ei" },
    // Rosa, Minze, Zitrone, Lavendel, Himmelblau, Pfirsich – kräftig genug für weiße Schrift
    palette: [[333, 72, 58], [160, 52, 40], [45, 92, 46], [265, 52, 58], [200, 72, 48], [18, 86, 57]],
    rim: ["#6fbf6a", "#2f7a3a", "#9ad48a"], bulbs: ["255,170,210", "255,236,140", "150,220,255"],
    confetti: ["#ff9ac4", "#9ee6c9", "#fff08a", "#c9b6ff", "#9ad8ff", "#ffffff"], emoji: ["🥚", "🐣", "🐰", "🌷", "🐥", "🥕"],
    font: { family: "Fredoka", url: "https://fonts.googleapis.com/css2?family=Fredoka:wght@600&display=swap" } },
};
const seasonKey = () => SEASONS[document.documentElement.dataset.season] ? document.documentElement.dataset.season : "none";
const SEASON = () => SEASONS[seasonKey()];
const isHW = () => seasonKey() === "halloween";
const isXmas = () => seasonKey() === "christmas";
const isEaster = () => seasonKey() === "easter";
const NEXT_SEASON = { none: "halloween", halloween: "christmas", christmas: "easter", easter: "none" };
const OUT_TEXT = new Proxy({}, { get: (_, k) => SEASON().out[k] });
const OUT_SHORT = new Proxy({}, { get: (_, k) => SEASON().short[k] });
const store = { get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }, set(k, v) { try { localStorage.setItem(k, v); } catch (e) {} } };
const rand = (a, b) => a + Math.random() * (b - a);
const initials = n => n.split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0].toUpperCase()).join("");
const today = () => new Date().toLocaleDateString("sv");             // JJJJ-MM-TT in Ortszeit
const jokerToday = s => s.jokerDay === today();                       // Joker eingesetzt -> heute nicht im Rad
// heute schon dran / abwesend / außerhalb des Rads dran -> heute nicht im Rad dieses Fachs
const outToday = id => { const o = state.current && state.current.dayOut[id]; return o && o.day === today() ? o.reason : null; };
const OUT_TODAY = { drawn: "✓ gezogen", absent: "abwesend", other: "schon dran" };
const todayState = s => jokerToday(s) ? "joker" : outToday(s.id);   // Wert der Spalte „Heute“
const notToday = s => jokerToday(s) || !!outToday(s.id);
const fmtDay = ts => new Date(ts * 1000).toLocaleDateString("de-AT", { day: "2-digit", month: "2-digit" });

function studentIndex(id) { return state.current ? state.current.students.findIndex(s => s.id === id) : 0; }
function hueFor(id) { return (Math.max(0, studentIndex(id)) * 137.508 + 265) % 360; }
function segHSL(id) {
  const pal = SEASON().palette;
  if (pal) { const i = Math.max(0, studentIndex(id)); return pal[i % pal.length]; }
  return [hueFor(id), 78, 56];
}
function colorFor(id, l = 58) { const [h, s, b] = segHSL(id); return `hsl(${h} ${s}% ${b + (l - 58)}%)`; }

async function api(method, url, body) {
  const r = await fetch("/api" + url, { method, credentials: "same-origin",
    headers: { "Content-Type": "application/json", "X-Requested-With": "gluecksrad" }, body: body ? JSON.stringify(body) : undefined });
  const j = await r.json();
  if (r.status === 401 && !url.startsWith("/auth/")) { showAuth(false); throw new Error(j.error); }
  if (!r.ok) { if (!url.startsWith("/auth/")) toast(j.error || "Fehler"); throw new Error(j.error); }
  return j;
}
let toastT;
function toast(msg) { const t = $("#toast"); t.textContent = msg; t.classList.add("show"); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove("show"), 2200); }

/* ---------------- Klassen ---------------- */
async function loadClasses() { state.classes = await api("GET", "/classes"); renderClassList(); }
async function openClass(id, subjectId) {
  const subj = subjectId || store.get("lastSubject:" + id);
  let c;
  try { c = await api("GET", subj ? `/classes/${id}/subjects/${subj}` : "/classes/" + id); }
  catch (e) { c = await api("GET", "/classes/" + id); }
  store.set("lastClass", id);
  state.winnerPos = null;
  setCurrent(c);
}
function setCurrent(c) {
  if (!state.current || !c || state.current.id !== c.id || state.current.subject !== c.subject) state.histFilter = "";
  state.current = c;
  $("#mTitle").textContent = c ? c.name : "Glücksrad";
  store.set("lastSubject:" + c.id, c.subject);
  applyTurbo();
  const s = state.classes.find(x => x.id === c.id);
  if (s) { s.students = c.students.length; s.subjects = c.subjects.length; }
  renderClassList(); renderMain();
}
// URL für Aktionen im aktuell gewählten Fach
const subjUrl = (path = "") => `/classes/${state.current.id}/subjects/${state.current.subject}${path}`;
const currentSubject = () => state.current.subjects.find(f => f.id === state.current.subject) || { name: "" };
function renderClassList() {
  const ul = $("#classlist");
  ul.innerHTML = state.classes.map(c => `<li data-id="${c.id}" class="${state.current && state.current.id === c.id ? "active" : ""}">
    <span>${esc(c.name)}${c.members > 0 || !c.mine ? ' <span title="Teamteaching – geteilte Klasse">👥</span>' : ""}${!c.mine ? `<small class="owner">von ${esc(c.owner || "?")}</small>` : ""}</span><small>${c.students} SuS${c.subjects > 1 ? " · " + c.subjects + " Fächer" : ""}</small></li>`).join("") || `<li class="muted" style="cursor:default">Noch keine Klassen</li>`;
  ul.querySelectorAll("li[data-id]").forEach(li => li.onclick = () => { if (state.spinning || state.pendingRating) return; Sound.click(); state.view = "classes"; openClass(li.dataset.id); });
}

function renderMain() {
  if (state.view === "users") return renderUsers();
  const c = state.current, m = $("#main");
  if (!c) { m.innerHTML = `<div class="glass empty muted">Lege links eine Klasse an oder wähle eine aus.</div>`; return; }
  const oldPool = m.querySelector(".pool"), poolScroll = oldPool && oldPool.dataset.key === c.id + ":" + c.subject ? oldPool.scrollTop : 0;
  m.innerHTML = `
    <div class="glass topbar">
      <h2>${esc(c.name)}</h2>
      <button class="btn ghost icon" id="renameBtn" title="Umbenennen">✏️</button>
      <button class="btn ghost teambtn" id="shareBtn" title="Klasse mit Kolleg/innen teilen">👥 Team${c.members.length ? ` <b>${c.members.length + 1}</b>` : ""}</button>
      <div class="seg">
        <button data-tab="wheel" class="${state.tab === "wheel" ? "on" : ""}">Glücksrad</button>
        <button data-tab="students" class="${state.tab === "students" ? "on" : ""}">Schülerliste</button>
        <button data-tab="questions" class="${state.tab === "questions" ? "on" : ""}">Fragen</button>
        <button data-tab="history" class="${state.tab === "history" ? "on" : ""}">Verlauf</button>
      </div>
      <div class="subjects">
        <span class="label" style="margin-right:4px">Fach</span>
        ${c.subjects.map(f => `<button class="chip ${f.id === c.subject ? "on" : ""}" data-subj="${f.id}">${esc(f.name)}<small>${f.pool}</small></button>`).join("")}
        <button class="chip add" id="addSubj" title="Fach hinzufügen">＋ Fach</button>
        <span style="flex:1"></span>
        <button class="btn ghost icon" id="renameSubj" title="Fach umbenennen">✏️</button>
        <button class="btn ghost icon danger" id="delSubj" title="Fach löschen" ${c.subjects.length < 2 ? "disabled" : ""}>🗑</button>
      </div>
    </div>
    <div id="tab"></div>`;
  m.querySelectorAll("[data-subj]").forEach(b => b.onclick = () => {
    if (state.spinning || state.pendingRating || b.dataset.subj === c.subject) return;
    Sound.click(); openClass(c.id, b.dataset.subj);
  });
  $("#addSubj").onclick = async () => {
    if (state.spinning || state.pendingRating) return;
    const n = prompt("Name des neuen Fachs (z. B. Mathematik):");
    if (n && n.trim()) { setCurrent(await api("POST", `/classes/${c.id}/subjects`, { name: n })); Sound.pop(); toast("Fach angelegt – alle Schüler/innen sind im Rad"); }
  };
  $("#renameSubj").onclick = async () => {
    const n = prompt("Fach umbenennen:", currentSubject().name);
    if (n && n.trim()) setCurrent(await api("PUT", subjUrl(), { name: n }));
  };
  $("#delSubj").onclick = async () => {
    if (state.spinning || state.pendingRating) return;
    if (!confirm(`Fach „${currentSubject().name}“ mit Rad und Verlauf löschen? Die Schülerliste bleibt erhalten.`)) return;
    setCurrent(await api("DELETE", subjUrl()));
  };
  m.querySelectorAll("[data-tab]").forEach(b => b.onclick = () => { if (state.spinning || state.pendingRating) return; Sound.click(); state.tab = b.dataset.tab; renderMain(); });
  $("#shareBtn").onclick = openShare;
  $("#renameBtn").onclick = async () => {
    const n = prompt("Neuer Name der Klasse:", c.name);
    if (n) setCurrent(await api("PUT", "/classes/" + c.id, { name: n, subject: c.subject }));
  };
  ({ wheel: renderWheelTab, students: renderStudentsTab, history: renderHistoryTab, questions: renderQuestionsTab })[state.tab]();
  const newPool = m.querySelector(".pool"); if (newPool && poolScroll) newPool.scrollTop = poolScroll;
}

/* ---------------- Glücksrad-Tab ---------------- */
// Segmente im Rad: Einträge von Schüler/innen mit heutigem Joker, die heute schon dran oder abwesend sind,
// bleiben gespeichert, werden aber nicht gezeigt.
// pos = Index im gespeicherten Rad (für die Bewertung)
function poolSegments() {
  const c = state.current, byId = Object.fromEntries(c.students.map(s => [s.id, s]));
  return c.pool.map((id, pos) => byId[id] && !notToday(byId[id]) ? { ...byId[id], pos } : null).filter(Boolean);
}

const POINTER_SVG = `<svg class="pointer" id="pointer" viewBox="0 0 54 70">
  <defs><linearGradient id="pg" x1="0" x2="1" y1="0" y2="1"><stop class="s1" offset="0" stop-color="#fff6c8"/><stop class="s2" offset=".45" stop-color="#ffcc33"/><stop class="s3" offset="1" stop-color="#e08a00"/></linearGradient></defs>
  <path d="M27 68 L6 22 A21 21 0 1 1 48 22 Z" fill="url(#pg)" stroke="rgba(0,0,0,.25)" stroke-width="1.5"/>
  <circle cx="27" cy="16" r="7" fill="#fff" opacity=".85"/></svg>`;

function renderWheelTab() {
  const c = state.current;
  const counts = {}; c.pool.forEach(id => counts[id] = (counts[id] || 0) + 1);
  const last = c.history.find(h => h.type === "rate");
  $("#tab").innerHTML = `
    <div class="wheelwrap">
      <div class="glass wheelcard">
        <div class="wheel" id="wheelBox"><div class="glow"></div>
          <canvas id="wheel" width="1100" height="1100"></canvas>${POINTER_SVG}
          <button class="hub" id="hub" title="Drehen (Leertaste)"><img src="${SEASON().hub}" alt="Drehen"></button>
        </div>
        <div class="controls">
          <button class="btn" id="shuffleBtn" title="Reihenfolge im Rad zufällig mischen">🎲 Mischen</button>
          <button class="btn primary" id="spin">${SEASON().spin}</button>
          <button class="btn" id="resetBtn" title="Jede/n genau einmal ins Rad">↺ Zurücksetzen</button>
          <button class="btn turbobtn ${isTurbo() ? "on" : ""}" id="turboBtn" title="Turbo: Fragen aus dem Pool der Reihe nach, Rad und Ton 5× schneller">⚡ Turbo</button>
        </div>
        <div class="hint">${isTurbo()
          ? `<span><b>⚡ Turbo</b> · ${activeQuestions(true).length} Fragen</span><span><b class="g">≥ 90 %</b> −1</span><span><b class="m">30–89 %</b> bleibt</span><span><b class="r">&lt; 30 %</b> +1 im Rad</span>`
          : `<span><b class="g">≥ 70 %</b> −1 (letzter → 3 Wochen Pause)</span><span><b class="m">50–69 %</b> bleibt</span><span><b class="r">&lt; 50 %</b> +1 im Rad</span>`}<span>Leertaste = drehen</span></div>
      </div>
      <div class="side">
        ${last ? `<div class="glass panel"><h3>Zuletzt gezogen</h3>
          <div class="last"><div class="avatar" style="background:${colorFor(last.studentId)}">${esc(initials(last.name))}</div>
          <div style="flex:1;min-width:0"><b>${esc(last.name)}</b><div class="muted">${last.score} %${last.note ? ` · <span title="${esc(last.note)}">${esc(last.note.length > 40 ? last.note.slice(0, 40) + "…" : last.note)}</span>` : ""}</div></div>
          <span class="pill o-${last.outcome}">${OUT_SHORT[last.outcome]}</span></div></div>` : ""}
        <div class="glass panel">
          <h3>Name hinzufügen</h3>
          <form id="quickAdd" class="row"><input type="text" id="quickName" placeholder="Name …"><button class="btn primary icon" title="Hinzufügen">＋</button></form>
          <div class="muted" style="font-size:12px;margin-top:6px">Landet an einer zufälligen Stelle im Rad.</div>
        </div>
        <div class="glass panel">
          <h3><span>Im Rad: ${poolSegments().length}</span><span class="muted" style="font-weight:400;font-size:13px">${c.students.length} SuS</span></h3>
          ${c.students.length ? `<div class="poolhead"><span>Name</span><span class="th-today" title="Heute nicht im Rad: abwesend, außerhalb des Rads drangekommen oder schon gezogen – gilt nur heute">Heute</span><span class="th-count">Anzahl</span></div>` : ""}
          ${c.students.length ? `<ul class="pool" data-key="${c.id}:${c.subject}">${c.students.map(s => `
            <li class="${counts[s.id] && !notToday(s) ? "" : "out"}"><span class="dot" style="background:${colorFor(s.id)}"></span>
              <span class="n" title="${esc(s.name)}">${esc(s.name)}${c.pauses[s.id] ? `<small class="state" title="Kommt am ${fmtDay(c.pauses[s.id])} wieder einmal ins Rad">⏸ bis ${fmtDay(c.pauses[s.id])}</small>` : ""}</span>
              <select class="today ${todayState(s) ? "on" : ""}" data-today="${s.id}" title="Heute nicht im Rad dieses Fachs (gilt nur heute)${s.jokers ? ` – noch ${s.jokers} Joker` : ""}">
                <option value="">–</option>${Object.entries(OUT_TODAY).filter(([r]) => r !== "drawn" || todayState(s) === "drawn")
                  .map(([r, l]) => `<option value="${r}" ${todayState(s) === r ? "selected" : ""}>${l}</option>`).join("")}
                ${s.jokers || jokerToday(s) ? `<option value="joker" ${todayState(s) === "joker" ? "selected" : ""}>🃏 Joker${jokerToday(s) ? "" : ` (${s.jokers})`}</option>` : ""}</select>
              <button class="btn" data-d="-1" data-id="${s.id}" ${counts[s.id] ? "" : "disabled"}>−</button>
              <span class="badge">${counts[s.id] || 0}</span>
              <button class="btn" data-d="1" data-id="${s.id}">+</button></li>`).join("")}</ul>`
            : `<div class="muted">Noch keine Schüler/innen – oben einen Namen eingeben oder im Tab „Schülerliste“ mehrere einfügen.</div>`}
        </div>
      </div>
    </div>`;
  drawWheel();
  setHub(hubAngle);
  if (isEaster()) hideEgg();
  setControls();
  $("#spin").onclick = $("#hub").onclick = spin;
  $("#shuffleBtn").onclick = shuffle;
  $("#turboBtn").onclick = () => {
    if (state.spinning || state.pendingRating) return;
    const on = !isTurbo(); store.set("turbo:" + c.subject, on ? "1" : "0");
    applyTurbo(); renderMain(); safe(() => { Sound.unlock(); on ? Sound.pop() : Sound.click(); });
    toast(on ? (activeQuestions(true).length ? "⚡ Turbo an – Fragen der Reihe nach" : "⚡ Turbo an – noch keine Fragen im Tab „Fragen“") : "Turbo aus");
  };
  $("#resetBtn").onclick = async () => {
    const paused = Object.keys(state.current.pauses).length;
    if (!confirm("Rad zurücksetzen? Jede/r Schüler/in ist danach genau einmal im Rad (zufällige Reihenfolge)."
      + (paused ? `\n\nAchtung: ${paused === 1 ? "1 laufende 3-Wochen-Pause endet" : `${paused} laufende 3-Wochen-Pausen enden`} dabei sofort.` : ""))) return;
    Sound.shuffle(); setCurrent(await api("POST", subjUrl("/reset")));
  };
  $("#quickAdd").onsubmit = async e => {
    e.preventDefault(); const n = $("#quickName").value.trim(); if (!n) return;
    await addNames([n]); $("#quickName").focus();
  };
  document.querySelectorAll(".pool button[data-id]").forEach(b => b.onclick = async () => {
    const d = +b.dataset.d; d > 0 ? Sound.pop() : Sound.click();
    const c2 = await api("POST", subjUrl("/pool"), { studentId: b.dataset.id, delta: d });
    if (d > 0) flashStudents([b.dataset.id]);
    setCurrent(c2);
  });
  document.querySelectorAll(".pool [data-today]").forEach(sel => sel.onchange = async () => {
    const s = c.students.find(x => x.id === sel.dataset.today), v = sel.value;
    try {
      if (v === "joker") { if (!await useJoker(s)) renderMain(); return; }
      if (jokerToday(s)) {
        if (!confirm(`Joker von ${s.name} zurücknehmen?`)) { renderMain(); return; }
        state.current = await api("DELETE", subjUrl(`/students/${s.id}/joker`), { day: today() });
      }
      setCurrent(await api("PUT", subjUrl(`/students/${s.id}/today`), { day: today(), reason: v || null }));
    } catch (e) { renderMain(); }
  });
}

async function useJoker(s, ask = true) {
  const c = state.current;
  if (ask && !confirm(`${s.name} setzt einen Joker ein und ist heute in ${currentSubject().name} nicht im Rad.\nDanach noch ${s.jokers - 1} Joker in diesem Fach.`)) return false;
  setCurrent(await api("POST", subjUrl(`/students/${s.id}/joker`), { day: today() }));
  safe(() => Sound.pop()); toast(`🃏 ${s.name} ist heute in ${currentSubject().name} nicht im Rad`);
  return true;
}

async function addNames(names) {
  const c = state.current, before = new Set(c.students.map(s => s.id));
  const c2 = await api("POST", "/classes/" + c.id + "/students", { names, subject: c.subject });
  const added = c2.students.filter(s => !before.has(s.id)).map(s => s.id);
  if (!added.length) { toast("Name ist schon in der Klasse"); return; }
  Sound.pop(); flashStudents(added);
  setCurrent(c2);
  toast(added.length === 1 ? "Hinzugefügt – an zufälliger Position" : `${added.length} Namen an zufälligen Positionen hinzugefügt`);
}
function flashStudents(ids) {
  state.flash = new Set(ids); state.flashUntil = performance.now() + 1800;
  const loop = () => { drawWheel(); if (performance.now() < state.flashUntil) requestAnimationFrame(loop); else { state.flash.clear(); drawWheel(); } };
  requestAnimationFrame(loop);
}

/* ---------------- Zeichnen ---------------- */
// Das Rad wird einmal in eine Offscreen-Ebene gezeichnet und pro Frame nur noch gedreht kopiert –
// das hält die Animation auch auf schwächeren Laptops flüssig.
const layerCache = { key: "", canvas: null }, rimCache = {};
function mkCanvas(W) { const c = document.createElement("canvas"); c.width = c.height = W; return c; }
const GEOM = W => { const Rrim = W / 2 - 12; return { cx: W / 2, cy: W / 2, Rrim, R: Rrim - 46 }; };

function rimLayer(W, pattern) {
  const S = SEASON(), key = W + ":" + pattern + ":" + seasonKey();
  if (rimCache[key]) return rimCache[key];
  const cv = mkCanvas(W), ctx = cv.getContext("2d"), { cx, cy, Rrim } = GEOM(W);
  const rim = ctx.createLinearGradient(0, 0, W, W);
  rim.addColorStop(0, S.rim[0]); rim.addColorStop(.5, S.rim[1]); rim.addColorStop(1, S.rim[2]);
  ctx.beginPath(); ctx.arc(cx, cy, Rrim, 0, TAU); ctx.fillStyle = rim; ctx.fill();
  ctx.lineWidth = 3; ctx.strokeStyle = "rgba(255,255,255,.25)"; ctx.stroke();
  const bulbs = 28;
  for (let i = 0; i < bulbs; i++) {
    const on = pattern === "all" ? true : pattern.startsWith("p2") ? (i + +pattern[3]) % 2 === 0 : (i + +pattern[3]) % 3 === 0;
    const ang = i / bulbs * TAU, x = cx + Math.cos(ang) * (Rrim - 23), y = cy + Math.sin(ang) * (Rrim - 23);
    const g = ctx.createRadialGradient(x, y, 0, x, y, 16);
    const bc = S.bulbs[i % 3];    // Lämpchen in den Theme-Farben
    g.addColorStop(0, on ? "rgba(255,255,240,1)" : "rgba(255,255,255,.25)");
    g.addColorStop(.45, on ? `rgba(${bc},.95)` : "rgba(255,255,255,.08)");
    g.addColorStop(1, `rgba(${bc},0)`);
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, 16, 0, TAU); ctx.fill();
  }
  return (rimCache[key] = cv);
}

function wheelLayer(W, segs) {
  const key = W + "|" + seasonKey() + "|" + segs.map(s => s.id + ":" + s.name + ":" + studentIndex(s.id)).join(",");
  if (layerCache.key === key) return layerCache.canvas;
  const cv = mkCanvas(W), ctx = cv.getContext("2d"), { cx, cy, R } = GEOM(W), n = segs.length, a = TAU / n;
  segs.forEach((s, k) => {
    const st = k * a, [h, sa, li] = segHSL(s.id);
    const g = ctx.createRadialGradient(cx, cy, R * 0.15, cx, cy, R);
    g.addColorStop(0, `hsl(${h} ${Math.min(100, sa + 7)}% ${li + 14}%)`); g.addColorStop(.7, `hsl(${h} ${sa}% ${li}%)`); g.addColorStop(1, `hsl(${h} ${sa - 8}% ${li - 14}%)`);
    ctx.beginPath(); ctx.moveTo(cx, cy); ctx.arc(cx, cy, R, st, st + a); ctx.closePath();
    ctx.fillStyle = g; ctx.fill();
    ctx.strokeStyle = "rgba(255,255,255,.35)"; ctx.lineWidth = n > 40 ? 1 : 2.5; ctx.stroke();
    ctx.save(); ctx.translate(cx, cy); ctx.rotate(st + a / 2);
    const fs = Math.max(15, Math.min(48, a * R * 0.5));
    ctx.font = `700 ${fs}px Outfit, system-ui, sans-serif`;
    ctx.textAlign = "right"; ctx.textBaseline = "middle";
    let t = s.name; while (ctx.measureText(t).width > R * 0.66 && t.length > 3) t = t.slice(0, -2) + "…";
    ctx.shadowColor = "rgba(0,0,0,.45)"; ctx.shadowBlur = 6; ctx.shadowOffsetY = 2;
    ctx.fillStyle = "#fff"; ctx.fillText(t, R - 28, 0); ctx.restore();
  });
  const shade = ctx.createRadialGradient(cx, cy, R * .55, cx, cy, R);
  shade.addColorStop(0, "rgba(0,0,0,0)"); shade.addColorStop(1, "rgba(0,0,0,.28)");
  ctx.beginPath(); ctx.arc(cx, cy, R, 0, TAU); ctx.fillStyle = shade; ctx.fill();
  layerCache.key = key; layerCache.canvas = cv;
  return cv;
}
// Schriftart nachgeladen -> Ebene neu zeichnen
if (document.fonts) document.fonts.ready.then(() => { layerCache.key = ""; drawWheel(); });

function drawWheel() {
  const cv = $("#wheel"); if (!cv || !state.current) return;
  const ctx = cv.getContext("2d"), W = cv.width, { cx, cy, R } = GEOM(W);
  const segs = poolSegments(), n = segs.length, now = performance.now();
  ctx.clearRect(0, 0, W, W);

  const pattern = state.spinning ? "p2_" + (state.lights % 2)
    : state.winnerPos !== null && !state.winnerSettled ? "p3_" + (Math.floor(now / 160) % 3) : "all";
  ctx.drawImage(rimLayer(W, pattern), 0, 0);

  if (!n) {
    ctx.beginPath(); ctx.arc(cx, cy, R, 0, TAU); ctx.fillStyle = "rgba(255,255,255,.08)"; ctx.fill();
    ctx.fillStyle = "rgba(255,255,255,.6)"; ctx.font = "600 44px Outfit, system-ui"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillText(state.current.pool.length ? "Alle waren heute dran" : "Rad ist leer", cx, cy - 150);
  } else {
    const a = TAU / n;
    ctx.save(); ctx.translate(cx, cy); ctx.rotate(state.rotation); ctx.drawImage(wheelLayer(W, segs), -cx, -cy); ctx.restore();

    if (state.flash.size && now < state.flashUntil) {
      ctx.fillStyle = `rgba(255,255,255,${0.35 + 0.35 * Math.sin(now / 90)})`;
      segs.forEach((s, k) => { if (!state.flash.has(s.id)) return; const st = state.rotation + k * a;
        ctx.beginPath(); ctx.moveTo(cx, cy); ctx.arc(cx, cy, R, st, st + a); ctx.closePath(); ctx.fill(); });
    }
    if (state.winnerPos !== null && !state.spinning && state.winnerPos < n) {
      const st = state.rotation + state.winnerPos * a;
      ctx.beginPath(); ctx.moveTo(cx, cy); ctx.arc(cx, cy, R, st + a, st + TAU); ctx.closePath();
      ctx.fillStyle = "rgba(8,8,25,.55)"; ctx.fill();
      ctx.save(); ctx.beginPath(); ctx.moveTo(cx, cy); ctx.arc(cx, cy, R, st, st + a); ctx.closePath();
      ctx.shadowColor = "rgba(255,220,120,.9)"; ctx.shadowBlur = 30;
      ctx.lineWidth = 8; ctx.strokeStyle = `rgba(255,230,150,${state.winnerSettled ? 1 : 0.7 + 0.3 * Math.sin(now / 150)})`; ctx.stroke(); ctx.restore();
    }
  }
  // Glanz + Kante (statisch, nicht mitgedreht)
  const gloss = ctx.createLinearGradient(0, cy - R, 0, cy + R);
  gloss.addColorStop(0, "rgba(255,255,255,.16)"); gloss.addColorStop(.5, "rgba(255,255,255,0)");
  ctx.beginPath(); ctx.arc(cx, cy, R, 0, TAU); ctx.fillStyle = gloss; ctx.fill();
  ctx.lineWidth = 6; ctx.strokeStyle = "rgba(255,255,255,.55)"; ctx.stroke();

  const p = $("#pointer"); if (p) p.style.transform = `rotate(${state.pointerKick}deg)`;
}

/* ---------------- Bewegung mit Spannung ---------------- */
// Baut ein Geschwindigkeitsprofil: Anlauf → schnelles Auslaufen → spannende Schlussphase (verschiedene Varianten).
const MODES = {
  // langsames Kriechen bis zum Stillstand
  creep:   { segs: [1.8, 2.8], T: [3.6, 4.6], f: u => Math.pow(1 - u, 1.6), j: a => rand(-.38, .38) * a },
  // stockend: wird langsamer, zieht wieder an, stockt wieder …
  stutter: { segs: [2.4, 3.6], T: [3.8, 4.8], f: u => Math.pow(1 - u, 1.15) * (0.55 + 0.45 * Math.cos(TAU * u * 2.5)), j: a => rand(-.35, .35) * a },
  // fast stehen geblieben – dann rutscht es doch noch knapp eine Grenze weiter
  almost:  { segs: [1.3, 2.0], T: [4.0, 5.0], f: u => u < .6 ? Math.pow(1 - u / .6, 2) : 0.22 * Math.sin(Math.PI * (u - .6) / .4), j: a => -(0.5 - rand(.04, .09)) * a },
  // schießt übers Ziel hinaus und pendelt zurück
  swing:   { segs: [1.6, 2.4], T: [3.6, 4.4], f: u => u < .75 ? Math.pow(1 - u / .75, 1.5) : -0.2 * Math.sin(Math.PI * (u - .75) / .25), j: a => (0.5 - rand(.05, .09)) * a },
};

function integrate(f, steps = 2000) { let s = 0; for (let i = 0; i < steps; i++) s += f((i + .5) / steps); return s / steps; }

function buildMotion(start, k, n) {
  const a = TAU / n;
  const modeName = Object.keys(MODES)[Math.floor(Math.random() * 4)];
  const M = MODES[modeName];
  const T0 = 0.4, TA = rand(4.4, 5.4), TB = rand(...M.T);
  const C = Math.min(rand(...M.segs) * a, 1.3 * Math.PI);           // Weg der Spannungsphase
  const IB = integrate(M.f), vB0 = C / (TB * IB);                      // Startgeschw. der Spannungsphase
  const gA = u => (Math.exp(-3 * u) - Math.exp(-3)) / (1 - Math.exp(-3)), G = integrate(gA);

  // Zielwinkel: Segment k unter dem Zeiger (oben, -90°)
  let target = -Math.PI / 2 - (k + 0.5) * a + M.j(a);
  target += TAU * Math.ceil((start - target) / TAU);
  let D = target - start + TAU * 7;
  while ((D - C - vB0 * TA * (1 - G)) / (0.5 * T0 + TA * G) < 3 * vB0 + 8) D += TAU;
  const v0 = (D - C - vB0 * TA * (1 - G)) / (0.5 * T0 + TA * G);

  const v = t => {
    if (t < T0) { const u = t / T0; return v0 * u * u * (3 - 2 * u); }
    t -= T0; if (t < TA) return vB0 + (v0 - vB0) * gA(t / TA);
    t -= TA; if (t < TB) return vB0 * M.f(t / TB);
    return 0;
  };
  const dt = 1 / 240, total = T0 + TA + TB, N = Math.ceil(total / dt);
  const cum = new Float64Array(N + 1);
  for (let i = 0; i < N; i++) cum[i + 1] = cum[i] + v((i + .5) * dt) * dt;
  const scale = D / cum[N];
  for (let i = 0; i <= N; i++) cum[i] *= scale;
  return { mode: modeName, total, suspenseAt: T0 + TA, dt, cum, start, vmax: v0 * scale,
    angleAt(t) { const x = Math.min(t, total) / dt, i = Math.floor(x), f = x - i; return start + (i >= N ? cum[N] : cum[i] + (cum[i + 1] - cum[i]) * f); } };
}

const pointerIndex = (rot, n) => Math.floor((((-Math.PI / 2 - rot) % TAU + TAU) % TAU) / (TAU / n)) % n;

function setControls() {
  const c = state.current; if (!c) return;
  const busy = state.spinning || state.pendingRating || dlg.open;
  const set = (sel, dis) => { const e = $(sel); if (e) e.disabled = dis; };
  const n = poolSegments().length;
  set("#spin", busy || !n); set("#hub", busy || !n);
  set("#shuffleBtn", busy || c.pool.length < 2); set("#resetBtn", busy);
}
const safe = fn => { try { fn(); } catch (e) { console.warn(e); } };   // Ton-Fehler dürfen nie die Animation stoppen

function spin() {
  if (state.spinning || state.pendingRating || dlg.open || !state.current) return;
  const segs = poolSegments(), n = segs.length; if (!n) return;
  safe(() => { Sound.unlock(); Sound.spinStart(); });
  const buf = new Uint32Array(1); crypto.getRandomValues(buf);
  const k = buf[0] % n, classId = state.current.id, subjId = state.current.subject;
  const mo = buildMotion(state.rotation % TAU, k, n);
  state.rotation = mo.start; state.spinning = true; state.winnerPos = null; state.drawn = null;
  setControls();
  const SP = isTurbo() ? TURBO_SPEED : 1;     // Turbo: Zeitachse der Bewegung 5x schneller
  if (isXmas()) snow(mo.total * 1000 / SP - 1500 / SP, 110);
  const box = $("#wheelBox"); if (box) box.classList.add("spinning");
  let lastIdx = pointerIndex(state.rotation, n), lastAng = state.rotation, rolling = false, lastLight = 0;
  const t0 = performance.now();
  const finish = ang => {
    safe(() => { Sound.rollStop(); Sound.spinStop(); });
    state.rotation = ((ang % TAU) + TAU) % TAU; state.spinning = false; state.pointerKick = 0;
    const bx = $("#wheelBox"); if (bx) bx.classList.remove("spinning");
    hubWobble();
    if (!state.current || state.current.id !== classId || state.current.subject !== subjId) { setControls(); return; }
    const pos = pointerIndex(state.rotation, n);
    state.winnerPos = pos; state.pendingRating = true;
    safe(() => Sound.win()); safe(() => confetti(70, { x: innerWidth / 2, y: innerHeight * 0.35 }));
    if (isHW()) bats(4);
    if (isXmas()) snow(5000, 90);
    if (isEaster()) bunnies(1);
    animateWinner(1600 / SP); setControls();
    setTimeout(() => { state.pendingRating = false; openRating(segs[pos], segs[pos].pos); }, 650 / SP);
  };
  (function frame(now) {
    const t = (now - t0) / 1000 * SP;
    const ang = mo.angleAt(t);
    try {
      const speed = Math.min(1, Math.abs(ang - lastAng) / (SP / 60) / mo.vmax);
      lastAng = ang; state.rotation = ang;
      setHub(-ang * 180 / Math.PI * 1.7);
      safe(() => Sound.spinSpeed(speed));
      const idx = pointerIndex(ang, n);
      if (idx !== lastIdx) { lastIdx = idx; safe(() => Sound.tick(speed)); state.pointerKick = -14 - 14 * (1 - speed); }
      state.pointerKick *= 0.82;
      if (now - lastLight > 90 + (1 - speed) * 250) { state.lights++; lastLight = now; }
      if (!rolling && t >= mo.suspenseAt) { rolling = true; safe(() => Sound.rollStart((mo.total - mo.suspenseAt) / SP)); }
      drawWheel();
    } catch (e) { console.warn(e); }
    if (t < mo.total) requestAnimationFrame(frame); else finish(ang);
  })(t0);
}
// Logo in der Radmitte: Propeller-Effekt
let hubAngle = 0;
function setHub(deg) {
  hubAngle = deg % 360;
  const img = document.querySelector("#hub img"); if (img) img.style.transform = `rotate(${hubAngle}deg)`;
}
function hubWobble() {
  const hub = $("#hub"); if (!hub) return;
  hub.style.setProperty("--a", hubAngle + "deg");
  const img = hub.querySelector("img"); if (img) img.style.transform = "";
  hub.classList.remove("wobble"); void hub.offsetWidth; hub.classList.add("wobble");
  setTimeout(() => { hub.classList.remove("wobble"); setHub(hubAngle); }, 1150);
}
// Gewinner-Feld kurz pulsieren lassen, dann statisch – keine Dauer-Animation im Leerlauf
// (sonst müssten Canvas und die Unschärfe hinter dem Bewertungsdialog ständig neu berechnet werden).
function animateWinner(ms = 1600) {
  const until = performance.now() + ms;
  const loop = () => {
    if (state.winnerPos === null || state.spinning) return;
    if (performance.now() < until) { drawWheel(); requestAnimationFrame(loop); }
    else { state.winnerSettled = true; drawWheel(); state.winnerSettled = false; }
  };
  requestAnimationFrame(loop);
}

async function shuffle() {
  if (state.spinning || state.pendingRating || dlg.open || !state.current) return;
  const c = state.current; safe(() => { Sound.unlock(); Sound.shuffle(); });
  state.spinning = true; state.winnerPos = null; setControls();
  try {
    const req = api("POST", subjUrl("/shuffle"));
    const start = state.rotation, t0 = performance.now(), dur = 900;
    let swapped = false;
    await new Promise(res => (function f(now) {
      const u = Math.min(1, (now - t0) / dur);
      state.rotation = start + TAU * (u < .5 ? 2 * u * u : 1 - Math.pow(-2 * u + 2, 2) / 2);
      if (u >= .5 && !swapped) { swapped = true; req.then(c2 => { if (state.current && state.current.id === c2.id && state.current.subject === c2.subject) state.current = c2; }, () => {}); }
      try { drawWheel(); } catch (e) {}
      u < 1 ? requestAnimationFrame(f) : res();
    })(t0));
    const c2 = await req;
    state.spinning = false; state.rotation %= TAU;
    if (state.current && state.current.id === c2.id) { setCurrent(c2); toast("Reihenfolge gemischt"); }
  } catch (e) { console.warn(e); }
  finally { state.spinning = false; setControls(); }
}

/* ---------------- Bewertung ---------------- */
const dlg = $("#rateDlg"), range = $("#scoreRange");
$("#quick").innerHTML = [100, 90, 80, 70, 60, 50, 40, 30, 20, 0].map(v => `<button class="btn" data-v="${v}">${v}</button>`).join("");
document.querySelectorAll("#quick button").forEach(b => b.onclick = () => { Sound.click(); setScore(+b.dataset.v); });
function setScore(v) {
  v = Math.max(0, Math.min(100, Math.round(+v || 0)));
  range.value = v;
  const o = outcomeOf(v), col = { removed: "var(--good)", kept: "var(--mid)", added: "var(--bad)" }[o];
  $("#scoreBig").textContent = v + " %"; $("#scoreBig").style.color = col;
  const box = $("#resultBox"), s = state.drawn;
  const last = s && o === "removed" && state.current.pool.filter(id => id === s.id).length === 1;
  box.className = "result o-" + o;
  const q = !state.qRevealAt && currentQuestion();   // erst zählen, wenn die Frage sichtbar ist
  box.textContent = `${s ? s.name : ""} ${OUT_TEXT[o]}${last ? " – 3 Wochen Pause, danach wieder 1× im Rad" : ""}`
    + (q ? ` · Frage ${v >= Q_OK ? `richtig (${q.correct + 1}/${Q_DONE})${q.correct + 1 >= Q_DONE ? " – kommt ins Archiv" : ""}` : "nicht richtig"}` : "");
}
range.oninput = () => setScore(range.value);
// Schnell-Notizen: Klick fügt den Text ins Notizfeld ein
const NOTE_CHIPS = ["Hausübung fehlt", "gut vorbereitet", "Vokabeln", "Tafel", "Wiederholung", "mündlich", "nachfragen"];
$("#noteChips").innerHTML = NOTE_CHIPS.map(t => `<button type="button" class="chip">${esc(t)}</button>`).join("");
$("#noteChips").querySelectorAll(".chip").forEach(b => b.onclick = () => {
  const ta = $("#noteInput"); ta.value = (ta.value.trim() ? ta.value.trim() + ", " : "") + b.textContent; ta.focus();
});
function openRating(s, pos) {
  state.drawn = s; state.drawnPos = pos;
  $("#noteInput").value = "";
  $("#winnerName").textContent = s.name;
  $("#winLabel").textContent = SEASON().winLabel;
  const av = $("#winAvatar"); av.textContent = initials(s.name); av.style.background = `linear-gradient(135deg, ${colorFor(s.id, 62)}, ${colorFor(s.id, 42)})`;
  const live = state.current.students.find(x => x.id === s.id) || s, jb = $("#jokerBtn");
  jb.hidden = !live.jokers; jb.textContent = `🃏 Joker (${live.jokers})`;
  state.qSkip = 0; state.qRand = null; startQuestionDelay(); renderQuestionBox();
  setScore(60); if (!dlg.open) dlg.showModal();
  $("#saveBtn").focus({ preventScroll: true }); dlg.scrollTop = 0;   // Name und Frage oben sichtbar lassen (ITAC A: Dialog ist hoch)
}
// YAML-Einzeiler in Fragen ({ a: { b: [ x ] } }) als eingerückten Block darstellen; der Text bleibt unverändert gespeichert
function parseFlowYaml(src) {
  let i = 0;
  const ws = () => { while (/\s/.test(src[i] || "")) i++; };
  const quoted = () => { const q = src[i++]; let out = q; while (i < src.length && src[i] !== q) out += src[i++]; if (src[i] !== q) throw 0; i++; return out + q; };
  const plain = stop => { let out = ""; while (i < src.length && !stop()) out += src[i++]; out = out.trim(); if (!out) throw 0; return out; };
  function value() {
    ws();
    if (src[i] === "{") {
      i++; const m = []; ws();
      while (src[i] !== "}") {
        ws(); const k = /["']/.test(src[i]) ? quoted() : plain(() => src[i] === ":" && /[\s{["']/.test(src[i + 1] || " ") || /[,{}[\]]/.test(src[i]));
        ws(); if (src[i++] !== ":") throw 0;
        m.push([k, value()]); ws();
        if (src[i] === ",") i++; else if (src[i] !== "}") throw 0;
        ws();
      }
      i++; return { map: m };
    }
    if (src[i] === "[") {
      i++; const l = []; ws();
      while (src[i] !== "]") {
        l.push(value()); ws();
        if (src[i] === ",") i++; else if (src[i] !== "]") throw 0;
        ws();
      }
      i++; return { seq: l };
    }
    return /["']/.test(src[i]) ? quoted() : plain(() => /[,{}[\]]/.test(src[i]));
  }
  const v = value(); return { v, end: i };
}
function dumpYaml(v, ind = "") {
  if (typeof v === "string") return v;
  if (v.map) return v.map.length ? v.map.map(([k, x]) => typeof x === "string" || !(x.map || x.seq).length
    ? `${ind}${k}: ${typeof x === "string" ? x : x.map ? "{}" : "[]"}` : `${ind}${k}:\n${dumpYaml(x, ind + "  ")}`).join("\n") : ind + "{}";
  return v.seq.length ? v.seq.map(x => typeof x === "string" ? `${ind}- ${x}`
    : `${ind}- ${dumpYaml(x, ind + "  ").trimStart()}`).join("\n") : ind + "[]";
}
function fmtQuestion(text) {
  let html = "", pos = 0;
  for (let k = text.indexOf("{"); k >= 0; k = text.indexOf("{", k + 1)) {
    if (k < pos) continue;
    let r; try { r = parseFlowYaml(text.slice(k)); } catch (e) { continue; }
    if (!r.v.map || !r.v.map.length || !/[{[]/.test(text.slice(k + 1, k + r.end))) continue;   // nur verschachtelte Einzeiler
    let a = k, b = k + r.end, v = r.v;
    // führende Schlüssel („services: { … }“) dazunehmen, wenn sie direkt nach einem Anführungszeichen oder am Anfang stehen
    const lead = text.slice(pos, k).match(/(^|["'„“])\s*((?:[\w.$-]+:\s*)+)$/);
    if (lead) {
      a = k - lead[2].length;
      v = lead[2].trim().split(/:\s*/).filter(Boolean).reduceRight((x, key) => ({ map: [[key, x]] }), v);
    }
    if (/["'„“]/.test(text[a - 1] || "") && /["'“”]/.test(text[b] || "")) { a--; b++; }   // umschließende Anführungszeichen weglassen
    html += esc(text.slice(pos, a).trimEnd()) + `<pre class="yaml">${esc(dumpYaml(v))}</pre>`;
    pos = b; k = b - 1;
  }
  return html + esc(text.slice(pos).trimStart());
}
// Fragen der Reihe nach – die nächste nach der zuletzt gestellten (je Modus getrennt) – oder zufällig (pro Fach umschaltbar);
// „andere Frage“ springt eine weiter
function activeQuestions(turbo = isTurbo()) {
  return state.current ? state.current.questions.filter(q => !q.done && isNormalQ(q) !== turbo) : [];
}
function randomOrder(qs, last) {
  // pro Dialog einmal mischen (openRating setzt state.qRand zurück); die zuletzt gestellte Frage nicht gleich wieder
  const key = qs.map(q => q.id).join(",");
  if (state.qRand && state.qRand.key === key) return state.qRand.order;
  const order = qs.slice();
  for (let i = order.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [order[i], order[j]] = [order[j], order[i]]; }
  if (order.length > 1 && order[0].sort === last) order.push(order.shift());
  state.qRand = { key, order };
  return order;
}
function currentQuestion(turbo = isTurbo()) {
  const qs = activeQuestions(turbo); if (!qs.length) return null;
  const last = turbo ? state.current.turboLast : state.current.normalLast, skip = turbo === isTurbo() ? state.qSkip || 0 : 0;
  if (state.current.qRandom) return turbo === isTurbo() ? randomOrder(qs, last)[skip % qs.length] : null;
  const start = Math.max(0, qs.findIndex(q => q.sort > last));
  return qs[(start + skip) % qs.length];
}
function renderQuestionBox() {
  const box = $("#qBox"), turbo = isTurbo(), qs = activeQuestions(), q = currentQuestion();
  box.hidden = !turbo && !q;    // normaler Modus ohne (2P)/(3P)-Fragen: keine Box
  box.classList.toggle("turbo", turbo);
  $("#qBoard").hidden = box.hidden || !isItac(); $("#qItac").classList.toggle("on", isItac());
  dlg.classList.toggle("itac", !box.hidden && isItac());
  if (box.hidden) return;
  const wait = q ? Math.ceil((state.qRevealAt - Date.now()) / 1000) : 0;
  box.classList.toggle("waiting", wait > 0);
  $("#qWait").hidden = wait <= 0; $("#qText").hidden = wait > 0; $("#qNext").hidden = wait > 0 || qs.length < 2;
  if (wait > 0) $("#qWaitN").textContent = wait;
  $("#qText").innerHTML = q ? fmtQuestion(q.text) : "Noch keine Fragen – im Tab „Fragen“ anlegen.";
  $("#qMeta").textContent = (turbo ? "⚡ " : "❓ ") + (q ? `${state.current.qRandom ? "Zufallsfrage" : `Frage ${qs.indexOf(q) + 1} von ${qs.length}`} · ${"✓".repeat(q.correct)}${"○".repeat(Q_DONE - q.correct)}` : "Turbo");
}
// Frage erst Q_DELAY Sekunden nach dem Ziehen zeigen (Countdown, vorzeitig per Klick)
function startQuestionDelay() {
  clearInterval(state.qTimer);
  state.qRevealAt = Date.now() + Q_DELAY * 1000;
  state.qTimer = setInterval(() => {
    if (!dlg.open || Date.now() >= state.qRevealAt) { clearInterval(state.qTimer); if (dlg.open) revealQuestion(); }
    else renderQuestionBox();
  }, 250);
}
function revealQuestion() { clearInterval(state.qTimer); state.qRevealAt = 0; renderQuestionBox(); setScore(range.value); if (!$("#qBox").hidden) safe(() => Sound.pop()); }
$("#qShow").onclick = revealQuestion;
$("#qItac").onclick = () => { store.set("itac", isItac() ? "0" : "1"); renderQuestionBox(); Sound.click(); };
$("#qNext").onclick = () => { state.qSkip = (state.qSkip || 0) + 1; renderQuestionBox(); setScore(range.value); Sound.click(); };
function applyTurbo() {
  const on = isTurbo();
  document.documentElement.classList.toggle("turbo", on);
  safe(() => Sound.setSpeed(on ? TURBO_SPEED : 1));
}
$("#jokerBtn").onclick = async () => {
  const s = state.drawn; if (!s) return;
  closeRating();
  try { await useJoker(s, false); } catch (e) { renderMain(); }
};
function closeRating() { clearInterval(state.qTimer); if (dlg.open) dlg.close(); state.drawn = null; state.winnerPos = null; drawWheel(); setControls(); }
$("#skipBtn").onclick = closeRating;
dlg.addEventListener("cancel", e => { e.preventDefault(); closeRating(); });
$("#saveBtn").onclick = async () => {
  const c = state.current, s = state.drawn; if (!s) return;
  const score = +range.value, o = outcomeOf(score), pos = state.drawnPos, note = $("#noteInput").value.trim();
  const turbo = isTurbo(), q = state.qRevealAt ? null : currentQuestion();   // vor dem Aufdecken gespeichert: Frage zählt nicht
  dlg.close(); state.drawn = null; state.winnerPos = null;
  safe(() => Sound[o]());
  if (o === "removed") safe(() => confetti(180));
  try {
    const c2 = await api("POST", `/classes/${c.id}/subjects/${c.subject}/rate`, { studentId: s.id, score, position: pos, note, day: today(),
      turbo, questionId: q ? q.id : null });
    if (o === "added") flashStudents([s.id]);
    if (q && score >= Q_OK && q.correct + 1 >= Q_DONE) toast(`Frage 3× richtig beantwortet – ins Archiv verschoben`);
    setCurrent(c2);
  } catch (e) { renderMain(); }
};
document.addEventListener("keydown", e => {
  if (dlg.open) {
    const typing = document.activeElement && document.activeElement.id === "noteInput";
    if (e.key === "Enter" && !(typing && e.shiftKey)) { e.preventDefault(); $("#saveBtn").click(); }
    else if (typing) return;   // beim Tippen der Notiz keine Pfeiltasten-Bewertung
    else if (e.key === "ArrowRight" || e.key === "ArrowUp") { e.preventDefault(); setScore(+range.value + 5); }
    else if (e.key === "ArrowLeft" || e.key === "ArrowDown") { e.preventDefault(); setScore(+range.value - 5); }
    return;
  }
  if (e.code === "Space" && !e.repeat && state.tab === "wheel" && state.view !== "users" && state.user && !$("#pwDlg").open && !$("#soundDlg").open && !$("#shareDlg").open && !/INPUT|SELECT|TEXTAREA/.test(document.activeElement.tagName)) { e.preventDefault(); spin(); }
});

/* ---------------- Konfetti ---------------- */
const cf = $("#confetti"), cfx = cf.getContext("2d"); let parts = [], cfRunning = false, cfUntil = 0;
function confetti(count = 120, origin) {
  cf.width = innerWidth * devicePixelRatio; cf.height = innerHeight * devicePixelRatio;
  const cols = SEASON().confetti, emo = SEASON().emoji;
  for (let i = 0; i < count; i++) {
    const o = origin || { x: rand(0, innerWidth), y: -20 };
    const ang = origin ? rand(0, TAU) : rand(Math.PI * .35, Math.PI * .65), sp = origin ? rand(4, 13) : rand(2, 6);
    parts.push({ x: o.x, y: o.y, vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp - (origin ? 4 : 0), r: rand(0, TAU), vr: rand(-.3, .3),
      w: rand(6, 12), h: rand(8, 16), c: cols[i % cols.length], life: rand(90, 160),
      e: emo && i % 3 === 0 ? emo[i % emo.length] : null, fs: rand(18, 30) });
  }
  cfUntil = performance.now() + 3200;               // Konfetti läuft höchstens ~3 s
  if (!cfRunning) { cfRunning = true; requestAnimationFrame(cfLoop); }
}
// Schneefall: zeitlich begrenzt (z. B. während der Drehung), keine Dauerlast im Leerlauf
function snow(ms = 4000, count = 70) {
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  cf.width = innerWidth * devicePixelRatio; cf.height = innerHeight * devicePixelRatio;
  const until = performance.now() + ms;
  for (let i = 0; i < count; i++)
    parts.push({ flake: true, x: rand(0, innerWidth), y: rand(-innerHeight * .6, -10), vx: rand(-.3, .3), vy: rand(.8, 2.2),
      r: rand(1.5, 4), ph: rand(0, 300), until: until + rand(0, 1500) });
  cfUntil = Math.max(cfUntil, until + 4000);
  if (!cfRunning) { cfRunning = true; requestAnimationFrame(cfLoop); }
}
function cfLoop() {
  cfx.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0); cfx.clearRect(0, 0, innerWidth, innerHeight);
  parts = parts.filter(p => (p.flake || p.life-- > 0) && p.y < innerHeight + 40 && !(p.flake && performance.now() > p.until));
  for (const p of parts) {
    if (p.flake) {   // Schneeflocke: langsam, leicht schaukelnd
      p.x += p.vx + Math.sin((p.y + p.ph) / 40) * .6; p.y += p.vy;
      cfx.globalAlpha = .9; cfx.fillStyle = "#fff"; cfx.beginPath(); cfx.arc(p.x, p.y, p.r, 0, TAU); cfx.fill(); continue;
    }
    p.vy += .18; p.vx *= .99; p.x += p.vx; p.y += p.vy; p.r += p.vr;
    cfx.save(); cfx.translate(p.x, p.y); cfx.rotate(p.r); cfx.globalAlpha = Math.min(1, p.life / 40);
    if (p.e) { cfx.font = `${p.fs}px serif`; cfx.textAlign = "center"; cfx.textBaseline = "middle"; cfx.fillText(p.e, 0, 0); cfx.restore(); continue; }
    cfx.fillStyle = p.c; cfx.fillRect(-p.w / 2, -p.h / 2 * Math.abs(Math.cos(p.r * 2)), p.w, p.h * Math.abs(Math.cos(p.r * 2)) + 1); cfx.restore();
  }
  if (parts.length && performance.now() < cfUntil) requestAnimationFrame(cfLoop);
  else { parts = []; cfRunning = false; cfx.clearRect(0, 0, innerWidth, innerHeight); }
}

/* ---------------- Schülerliste ---------------- */
function renderStudentsTab() {
  const c = state.current;
  $("#tab").innerHTML = `
    <div class="glass card">
      <div class="label">Schüler/innen hinzufügen</div>
      <div class="muted" style="margin:4px 0 10px">Ein Name pro Zeile – Einfügen aus Excel funktioniert auch. Neue Namen landen an zufälligen Positionen im Rad.</div>
      <textarea id="names" rows="5" placeholder="Anna Müller&#10;Ben Huber&#10;…"></textarea>
      <div class="row" style="margin-top:10px;justify-content:space-between">
        <span class="muted">${c.students.length} Schüler/innen in der Klasse</span>
        <button class="btn primary" id="addBtn">Hinzufügen</button>
      </div>
      <div class="row jokerbar">
        <span class="label">🃏 Joker · ${esc(currentSubject().name)}</span>
        <span class="muted small" style="flex:1">Joker gelten pro Fach (oben wählen). Mit − / + bei den Namen einzeln setzen. Ein Joker nimmt eine/n Schüler/in für den Tag aus dem Rad dieses Fachs.</span>
        <button class="btn" id="jokerAll">Allen +1 Joker</button>
      </div>
      <ul class="studs">${c.students.map(s => `<li><div class="avatar" style="background:${colorFor(s.id)}">${esc(initials(s.name))}</div><span class="nm" title="${esc(s.name)}">${esc(s.name)}</span>
        <div class="ctl"><span class="jk" title="Joker in ${esc(currentSubject().name)}"><button class="btn ghost small" data-jk="-1" data-sid="${s.id}" ${s.jokers ? "" : "disabled"}>−</button><b>🃏 ${s.jokers}</b><button class="btn ghost small" data-jk="1" data-sid="${s.id}">+</button></span>
        <button class="btn ghost icon" data-edit="${s.id}" title="Umbenennen">✏️</button><button class="btn ghost icon danger" data-del="${s.id}" title="Löschen">✕</button></div></li>`).join("")}</ul>
      <div style="margin-top:22px;border-top:1px solid var(--stroke);padding-top:16px">${c.isOwner
        ? `<button class="btn danger" id="delClass">Klasse löschen</button>`
        : `<button class="btn danger" id="leaveClass">Klasse verlassen</button> <span class="muted small">Die Klasse gehört ${esc(c.owner ? c.owner.username : "")}.</span>`}</div>
    </div>`;
  $("#addBtn").onclick = async () => {
    const names = $("#names").value.split(/\r?\n|;|\t/).map(x => x.trim()).filter(Boolean);
    if (names.length) await addNames(names);
  };
  document.querySelectorAll("[data-del]").forEach(b => b.onclick = async () => {
    const s = c.students.find(x => x.id === b.dataset.del);
    if (confirm(`${s.name} aus der Klasse löschen?`)) setCurrent(await api("DELETE", `/classes/${c.id}/students/${s.id}`, { subject: c.subject }));
  });
  document.querySelectorAll("[data-edit]").forEach(b => b.onclick = async () => {
    const s = c.students.find(x => x.id === b.dataset.edit), n = prompt("Name:", s.name);
    if (n) setCurrent(await api("PUT", `/classes/${c.id}/students/${s.id}`, { name: n, subject: c.subject }));
  });
  if ($("#delClass")) $("#delClass").onclick = async () => {
    const team = c.members.length ? `\nAchtung: Die Klasse ist mit ${c.members.map(m => m.username).join(", ")} geteilt und verschwindet auch dort.` : "";
    if (!confirm(`Klasse „${c.name}“ mit allen Daten löschen?${team}`)) return;
    await api("DELETE", "/classes/" + c.id); state.current = null; await loadClasses(); renderMain();
  };
  if ($("#leaveClass")) $("#leaveClass").onclick = leaveClass;
  $("#jokerAll").onclick = async () => {
    if (!confirm(`Allen ${c.students.length} Schüler/innen der Klasse ${c.name} einen Joker in ${currentSubject().name} geben?`)) return;
    setCurrent(await api("POST", subjUrl("/jokers"))); Sound.pop(); toast(`🃏 Alle haben einen Joker mehr in ${currentSubject().name}`);
  };
  document.querySelectorAll("[data-jk]").forEach(b => b.onclick = async () =>
    setCurrent(await api("PUT", subjUrl(`/students/${b.dataset.sid}/joker`), { delta: +b.dataset.jk })));
}

/* ---------------- Fragen ---------------- */
function renderQuestionsTab() {
  const c = state.current, qs = c.questions.filter(q => !q.done), done = c.questions.filter(q => q.done);
  const nextN = !c.qRandom && currentQuestion(false), nextT = !c.qRandom && currentQuestion(true), nN = activeQuestions(false).length;
  const mode = q => isNormalQ(q) ? `<span class="qmode n" title="Normaler Modus">${q === nextN ? "▶ " : ""}Normal</span>`
    : `<span class="qmode t" title="Nur im Turbo">${q === nextT ? "▶ " : ""}⚡ Turbo</span>`;
  const dots = q => `<span class="qdots" title="${q.correct} von ${Q_DONE} richtig">${"✓".repeat(q.correct)}${"○".repeat(Math.max(0, Q_DONE - q.correct))}</span>`;
  $("#tab").innerHTML = `<div class="glass card">
    <div class="row" style="justify-content:space-between;flex-wrap:wrap"><div class="label">Fragen · ${esc(currentSubject().name)}</div>
      <div class="seg qorder" title="Gilt für dieses Fach, für alle Lehrkräfte der Klasse"><button data-qorder="0" class="${c.qRandom ? "" : "on"}">↓ der Reihe nach</button><button data-qorder="1" class="${c.qRandom ? "on" : ""}">🎲 zufällig</button></div></div>
    <div class="muted" style="margin:4px 0 10px">Eine Frage pro Zeile – neue werden unten angehängt, sie kommen ${c.qRandom ? "in zufälliger Reihenfolge" : "der Reihe nach (▶ = nächste)"} dran, im Dialog erst ${Q_DELAY} s nach dem Ziehen.
      Fragen mit <b>(2P)</b> oder <b>(3P)</b> im Text kommen im normalen Modus, alle anderen nur im ⚡ Turbo.
      Ab ${Q_OK} % zählt eine Antwort als richtig; nach ${Q_DONE} richtigen Antworten wird die Frage inaktiv und ins Archiv verschoben (unten, jederzeit reaktivierbar).</div>
    <textarea id="qNew" rows="4" placeholder="Was ist die Hauptstadt von Frankreich?&#10;Nenne drei Laubbäume.&#10;…"></textarea>
    <div class="row" style="margin-top:10px;justify-content:space-between">
      <span class="muted">${qs.length} Fragen im Pool (${nN} normal, ${qs.length - nN} Turbo)${done.length ? ` · ${done.length} im Archiv` : ""}</span>
      <span class="row"><button class="btn" id="qCopy" title="Alle Fragen dieses Fachs (Pool, dann Archiv) kopieren – eine Zeile pro Frage, z. B. zum Einfügen in einem anderen Fach">📋 Alle kopieren</button>
        <button class="btn primary" id="qAdd">Anhängen</button></span>
    </div>
    ${qs.length ? `<ol class="qlist">${qs.map(q => `<li class="${q === nextN || q === nextT ? "next" : ""}">${mode(q)}<span class="qt">${fmtQuestion(q.text)}</span>${dots(q)}
      <button class="btn ghost icon" data-qedit="${q.id}" title="Bearbeiten">✏️</button><button class="btn ghost icon" data-qarch="${q.id}" title="Inaktiv setzen (ins Archiv)">📦</button><button class="btn ghost icon danger" data-qdel="${q.id}" title="Löschen">✕</button></li>`).join("")}</ol>` : ""}
    ${done.length ? `<details class="qdone"><summary>📦 Archiv (${done.length})</summary><ul class="qlist">${done.map(q => `<li>${mode(q)}<span class="qt">${fmtQuestion(q.text)}</span>${dots(q)}
      <button class="btn ghost small" data-qrestore="${q.id}" title="Wieder aktiv: hinten anhängen, Zähler auf 0">↺ reaktivieren</button><button class="btn ghost icon danger" data-qdel="${q.id}" title="Löschen">✕</button></li>`).join("")}</ul></details>` : ""}
  </div>`;
  const byId = id => c.questions.find(q => String(q.id) === id);
  document.querySelectorAll("[data-qorder]").forEach(b => b.onclick = async () => {
    const random = b.dataset.qorder === "1"; if (random === c.qRandom) return;
    setCurrent(await api("PUT", subjUrl("/qorder"), { random })); Sound.click();
    toast(random ? "🎲 Fragen in zufälliger Reihenfolge" : "Fragen der Reihe nach");
  });
  $("#qCopy").disabled = !c.questions.length;
  $("#qCopy").onclick = async () => {
    const all = qs.concat(done), text = all.map(q => q.text.replace(/\s*\n\s*/g, " ")).join("\n");
    try { await navigator.clipboard.writeText(text); }
    catch (e) {   // z. B. ohne HTTPS: über ein unsichtbares Textfeld kopieren
      const ta = document.createElement("textarea"); ta.value = text; document.body.append(ta); ta.select();
      document.execCommand("copy"); ta.remove();
    }
    Sound.click(); toast(`${all.length} Fragen kopiert`);
  };
  $("#qAdd").onclick = async () => {
    const texts = $("#qNew").value.split(/\r?\n/).map(x => x.trim()).filter(Boolean);
    if (!texts.length) return;
    setCurrent(await api("POST", subjUrl("/questions"), { texts })); Sound.pop();
    toast(texts.length === 1 ? "Frage angehängt" : `${texts.length} Fragen angehängt`);
  };
  document.querySelectorAll("[data-qedit]").forEach(b => b.onclick = async () => {
    const q = byId(b.dataset.qedit), t = prompt("Frage:", q.text);
    if (t && t.trim()) setCurrent(await api("PUT", subjUrl("/questions/" + q.id), { text: t }));
  });
  document.querySelectorAll("[data-qdel]").forEach(b => b.onclick = async () => {
    const q = byId(b.dataset.qdel);
    if (confirm(`Frage löschen?\n\n${q.text}`)) setCurrent(await api("DELETE", subjUrl("/questions/" + q.id)));
  });
  document.querySelectorAll("[data-qarch]").forEach(b => b.onclick = async () =>
    setCurrent(await api("PUT", subjUrl("/questions/" + b.dataset.qarch), { archive: true })));
  document.querySelectorAll("[data-qrestore]").forEach(b => b.onclick = async () =>
    setCurrent(await api("PUT", subjUrl("/questions/" + b.dataset.qrestore), { restore: true })));
}

/* ---------------- Verlauf ---------------- */
function renderHistoryTab() {
  const c = state.current, filter = state.histFilter || "";
  const rates = c.history.filter(h => h.type === "rate" && (!filter || h.studentId === filter));   // Statistik passt zum Filter
  const fmt = ts => new Date(ts * 1000).toLocaleString("de-AT", { dateStyle: "short", timeStyle: "short" });
  const avg = rates.length ? Math.round(rates.reduce((s, h) => s + h.score, 0) / rates.length) : "–";
  const cnt = o => rates.filter(h => h.outcome === o).length;
  const absents = c.history.filter(h => h.type === "absent" && (!filter || h.studentId === filter));
  const absDay = d => new Date(d + "T12:00").toLocaleDateString("de-AT", { weekday: "short", day: "2-digit", month: "2-digit", year: "numeric" });
  const shown = c.history.filter(h => !filter || (h.type !== "reset" && h.studentId === filter));
  const team = c.members && c.members.length > 0;
  const rows = shown.map(h => h.type === "reset"
    ? `<tr><td>${fmt(h.ts)}</td><td colspan="4" class="muted">↺ Rad zurückgesetzt</td></tr>`
    : h.type === "joker"
    ? `<tr><td class="nowrap">${fmt(h.ts)}${team && h.by ? `<div class="muted small">${esc(h.by)}</div>` : ""}</td>
        <td><a href="#" class="stud" data-stud="${h.studentId}">${esc(h.name)}</a></td><td colspan="3" class="muted">🃏 Joker eingesetzt – an dem Tag nicht im Rad dieses Fachs</td></tr>`
    : h.type === "absent"
    ? `<tr class="absent"><td class="nowrap">${fmt(h.ts)}${team && h.by ? `<div class="muted small">${esc(h.by)}</div>` : ""}</td>
        <td><a href="#" class="stud" data-stud="${h.studentId}">${esc(h.name)}</a></td><td colspan="3">🚫 abwesend${h.note ? ` am ${absDay(h.note)}` : ""}</td></tr>`
    : `<tr><td class="nowrap">${fmt(h.ts)}${team && h.by ? `<div class="muted small">${esc(h.by)}</div>` : ""}</td>
        <td><a href="#" class="stud" data-stud="${h.studentId}">${esc(h.name)}</a></td><td class="nowrap">${h.score} %</td>
        <td><span class="pill o-${h.outcome}">${OUT_SHORT[h.outcome]}</span></td>
        <td class="notecell"><span class="notetext">${h.question ? `<span class="qline">❓ ${esc(h.question)}</span>` : ""}${h.note ? esc(h.note) : h.question ? "" : '<span class="muted">–</span>'}</span>
          <button class="btn ghost icon small" data-note="${h.id}" title="Notiz bearbeiten">✏️</button></td></tr>`).join("");
  const fname = filter ? (c.students.find(s => s.id === filter) || {}).name : "";
  $("#tab").innerHTML = `<div class="glass card">
    <div class="stats">
      <div class="stat"><span class="muted">Ziehungen</span><b>${rates.length}</b></div>
      <div class="stat"><span class="muted">Ø Bewertung</span><b>${avg}${rates.length ? " %" : ""}</b></div>
      <div class="stat"><span class="muted">Raus</span><b style="color:var(--good)">${cnt("removed")}</b></div>
      <div class="stat"><span class="muted">Bleibt</span><b style="color:var(--mid)">${cnt("kept")}</b></div>
      <div class="stat"><span class="muted">+1 im Rad</span><b style="color:var(--bad)">${cnt("added")}</b></div>
      <div class="stat"><span class="muted">Abwesend</span><b>${absents.length}</b></div>
    </div>
    ${filter ? `<div class="filterbar">Nur <b>${esc(fname || "?")}</b> <button class="btn ghost small" id="clearFilter">✕ alle anzeigen</button></div>` : ""}
    ${shown.length ? `<div class="tablewrap"><table class="hist"><tr><th>Zeit</th><th>Name</th><th>Bewertung</th><th>Folge</th><th>Notiz</th></tr>${rows}</table></div>
      ${filter ? "" : `<div style="margin-top:14px"><button class="btn danger" id="clearHist">Verlauf leeren</button></div>`}`
      : `<div class="muted">Noch keine Ziehungen.</div>`}</div>`;
  const b = $("#clearHist");
  if (b) b.onclick = async () => { if (confirm("Verlauf wirklich leeren? Dabei gehen auch alle Notizen verloren.")) setCurrent(await api("DELETE", subjUrl("/history"))); };
  if ($("#clearFilter")) $("#clearFilter").onclick = () => { state.histFilter = ""; renderHistoryTab(); };
  document.querySelectorAll("a.stud").forEach(a => a.onclick = e => { e.preventDefault(); state.histFilter = a.dataset.stud; renderHistoryTab(); });
  document.querySelectorAll("[data-note]").forEach(btn => btn.onclick = async () => {
    const h = c.history.find(x => String(x.id) === btn.dataset.note);
    const n = prompt(`Notiz zu ${h.name} (${h.score} %):`, h.note || "");
    if (n === null) return;
    setCurrent(await api("PUT", subjUrl("/history/" + h.id), { note: n }));
  });
}

/* ---------------- Start ---------------- */
function applyTheme(t) { document.documentElement.dataset.theme = t; $("#themeBtn").textContent = t === "dark" ? "🌙" : "☀️"; store.set("theme", t); }
applyTheme(store.get("theme") || "dark");
/* ---------------- Halloween-Theme (optional, pro Benutzer gespeichert) ---------------- */
let batTimer = null;
function applySeason(s, save = false) {
  if (!SEASONS[s]) s = "none";
  document.documentElement.dataset.season = s;
  const S = SEASONS[s];
  store.set("season", s);
  safe(() => Sound.setSeason(s));
  const next = SEASONS[NEXT_SEASON[s]];
  $("#seasonBtn").textContent = S.icon;
  $("#seasonBtn").classList.toggle("on", s !== "none");
  $("#seasonBtn").title = `Theme: ${S.name} – klicken für ${next.name}`;
  if (S.font && !document.getElementById("font-" + s)) {
    const l = document.createElement("link"); l.id = "font-" + s; l.rel = "stylesheet"; l.href = S.font.url; document.head.appendChild(l);
  }
  $(".tagline").textContent = S.tagline;
  layerCache.key = ""; for (const k in rimCache) delete rimCache[k];
  if (!state.spinning && !state.pendingRating) renderMain(); else drawWheel();
  clearTimeout(batTimer);
  if (s === "halloween") ambientBats();
  if (save && state.user) api("PUT", "/me/settings", { season: s }).catch(() => {});
}
// Ab und zu flattert eine Fledermaus vorbei – kurze Einzel-Animation, keine Dauerlast im Leerlauf
function ambientBats() {
  batTimer = setTimeout(() => { if (isHW() && !document.hidden) bats(1); ambientBats(); }, 25000 + Math.random() * 25000);
}
function bats(n) {
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  for (let i = 0; i < n; i++) {
    const b = document.createElement("img");
    b.src = "halloween/bat.svg"; b.className = "bat"; b.alt = "";
    const fromLeft = Math.random() < .5, y = rand(5, 55);
    b.style.cssText = `top:${y}vh;--dx:${fromLeft ? 1 : -1};--dy:${rand(-25, 15)}vh;--s:${rand(.6, 1.2)};animation-delay:${i * .25}s;${fromLeft ? "left:-80px" : "right:-80px"}`;
    b.addEventListener("animationend", () => b.remove());
    document.body.appendChild(b);
  }
}
// Osterhase hoppelt einmal über den unteren Bildschirmrand
function bunnies(n) {
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  for (let i = 0; i < n; i++) {
    const w = document.createElement("div"); w.className = "bunny"; w.style.animationDelay = i * .7 + "s";
    if (Math.random() < .5) w.classList.add("rtl");
    w.innerHTML = '<img src="easter/bunny.svg" alt="">';
    w.addEventListener("animationend", () => w.remove());
    document.body.appendChild(w);
  }
}
// Ostereier-Suche: im Glücksrad-Tab versteckt sich irgendwo ein kleines Ei
let eggsFound = 0;
function hideEgg() {
  document.querySelectorAll(".hidden-egg").forEach(e => e.remove());
  if (!isEaster() || state.tab !== "wheel") return;
  const spots = [...document.querySelectorAll("#tab .panel, #tab .wheelcard, .topbar")];
  if (!spots.length) return;
  const host = spots[Math.floor(Math.random() * spots.length)];
  const egg = document.createElement("img");
  egg.src = "easter/egg.svg"; egg.className = "hidden-egg"; egg.alt = "Osterei"; egg.title = "Nanu?";
  const corner = [["left", "top"], ["right", "top"], ["left", "bottom"], ["right", "bottom"]][Math.floor(Math.random() * 4)];
  egg.style.cssText = `${corner[0]}:${rand(6, 30)}px;${corner[1]}:${rand(4, 14)}px;transform:rotate(${rand(-35, 35)}deg)`;
  egg.onclick = e => {
    e.stopPropagation(); eggsFound++;
    const r = egg.getBoundingClientRect(); egg.remove();
    safe(() => { Sound.unlock(); Sound.removed(); }); confetti(50, { x: r.left + r.width / 2, y: r.top });
    toast(eggsFound === 1 ? "🥚 Osterei gefunden!" : `🥚 Schon ${eggsFound} Ostereier gefunden!`);
  };
  host.appendChild(egg);
}

$("#seasonBtn").onclick = () => {
  const next = NEXT_SEASON[seasonKey()];
  applySeason(next, true);
  safe(() => Sound.unlock());
  if (next === "halloween") { bats(3); safe(() => Sound.added()); toast("🎃 Halloween-Modus an – Muahaha!"); }
  else if (next === "christmas") { snow(5000, 120); safe(() => Sound.win()); toast("🎄 Weihnachts-Modus an – Ho ho ho!"); }
  else if (next === "easter") { bunnies(2); safe(() => Sound.win()); toast("🐰 Oster-Modus an – fröhliches Eiersuchen!"); }
  else toast("Standard-Theme");
};
applySeason(store.get("season") || "none");

$("#themeBtn").onclick = () => applyTheme(document.documentElement.dataset.theme === "dark" ? "light" : "dark");
$("#soundBtn").textContent = Sound.muted ? "🔇" : "🔊";
$("#soundBtn").onclick = () => { $("#soundBtn").textContent = Sound.toggle() ? "🔇" : "🔊"; Sound.click(); };

/* ---------------- Sound-Einstellungen (pro Benutzer am Server) ---------------- */
const TICK_LABELS = { ratchet: "Ratsche (klassisches Glücksrad)", wood: "Holz-Klick (tief)", show: "Spielshow (Metallstift)", soft: "Sanft", custom: "Eigene Datei" };
const WIN_LABELS = { fanfare: "Fanfare", ding: "Glocke", applause: "Applaus", none: "Kein Ton", custom: "Eigene Datei" };
let soundState = { sounds: { tick: false, win: false } };

async function loadSoundSettings() {
  try {
    const r = await api("GET", "/me/settings");
    soundState = r; Sound.configure(r.settings);
    if (r.settings.season && r.settings.season !== (document.documentElement.dataset.season || "none")) applySeason(r.settings.season);
    for (const k of ["tick", "win"]) {
      if (r.sounds[k]) {
        const res = await fetch(`/api/me/sounds/${k}`, { credentials: "same-origin" });
        if (res.ok) await Sound.setCustom(k, await res.arrayBuffer());
      } else await Sound.setCustom(k, null);
    }
  } catch (e) { console.warn(e); }
}
function fileToBase64(file) {
  return new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result).split(",")[1]); r.onerror = rej; r.readAsDataURL(file); });
}
function renderSoundDlg() {
  const c = Sound.config, has = soundState.sounds;
  const opts = (labels, sel) => Object.entries(labels).map(([k, v]) => `<option value="${k}" ${k === sel ? "selected" : ""}>${v}</option>`).join("");
  const fileRow = kind => `<div class="filerow">
      <span class="muted">${has[kind] ? "✓ eigene Datei gespeichert" : "noch keine eigene Datei"}</span>
      <label class="btn">Datei wählen…<input type="file" accept="audio/*" data-upload="${kind}" hidden></label>
      ${has[kind] ? `<button class="btn ghost danger" data-remove="${kind}">Entfernen</button>` : ""}</div>`;
  $("#soundBody").innerHTML = `
    <div class="label">Klick beim Drehen</div>
    <div class="row"><select id="sTick">${opts(TICK_LABELS, c.tick)}</select><button class="btn" id="pTick">▶ Probe</button></div>
    ${fileRow("tick")}
    <div class="muted small">Kurze Datei (unter 0,6 s) = wird bei jedem Feld abgespielt. Längere Datei = läuft während der Drehung mit und wird beim Auslaufen langsamer und tiefer.</div>
    <div class="label" style="margin-top:16px">Ton beim Stillstand</div>
    <div class="row"><select id="sWin">${opts(WIN_LABELS, c.win)}</select><button class="btn" id="pWin">▶ Probe</button></div>
    ${fileRow("win")}
    <label class="row" style="margin-top:16px"><input type="checkbox" id="sRoll" ${c.roll ? "checked" : ""}> Trommelwirbel in der Schlussphase</label>
    <div class="label" style="margin-top:16px">Lautstärke</div>
    <input type="range" id="sVol" class="plain" min="0" max="1" step="0.05" value="${c.volume}">
    <div class="muted small" style="margin-top:12px">Eigene Dateien: mp3, wav, ogg oder m4a, max. 2 MB. Bitte nur Sounds verwenden, die du nutzen darfst (z. B. lizenzfreie von pixabay.com/sound-effects).</div>`;
  const collect = () => ({ tick: $("#sTick").value, win: $("#sWin").value, roll: $("#sRoll").checked, volume: +$("#sVol").value });
  const save = async () => { const st = collect(); Sound.configure(st); try { await api("PUT", "/me/settings", st); } catch (e) {} };
  ["#sTick", "#sWin", "#sRoll", "#sVol"].forEach(id => $(id).onchange = save);
  $("#sVol").oninput = () => Sound.configure(collect());
  $("#pTick").onclick = () => { Sound.unlock(); Sound.configure(collect()); Sound.preview($("#sTick").value); };
  $("#pWin").onclick = () => { Sound.unlock(); Sound.configure(collect()); Sound.win($("#sWin").value); };
  document.querySelectorAll("[data-upload]").forEach(inp => inp.onchange = async () => {
    const f = inp.files[0], kind = inp.dataset.upload; if (!f) return;
    if (f.size > 2 * 1024 * 1024) { toast("Datei zu groß (max. 2 MB)"); return; }
    try {
      Sound.unlock();
      const dur = await Sound.setCustom(kind, await f.arrayBuffer());
      if (dur === null) { toast("Diese Audiodatei kann der Browser nicht abspielen"); await loadSoundSettings(); renderSoundDlg(); return; }
      await api("PUT", "/me/sounds/" + kind, { mime: f.type || "audio/mpeg", data: await fileToBase64(f) });
      soundState.sounds[kind] = true;
      $(kind === "tick" ? "#sTick" : "#sWin").value = "custom"; await save();
      toast(kind === "tick" ? (dur < 0.6 ? "Klick-Sound gespeichert" : "Dreh-Sound gespeichert (läuft während der Drehung)") : "Gewinn-Sound gespeichert");
      renderSoundDlg();
    } catch (e) { toast(e.message || "Upload fehlgeschlagen"); }
  });
  document.querySelectorAll("[data-remove]").forEach(b => b.onclick = async () => {
    const kind = b.dataset.remove;
    await api("DELETE", "/me/sounds/" + kind); soundState.sounds[kind] = false; await Sound.setCustom(kind, null);
    const sel = $(kind === "tick" ? "#sTick" : "#sWin"); if (sel.value === "custom") sel.value = kind === "tick" ? "ratchet" : "fanfare";
    await save(); renderSoundDlg();
  });
}
$("#soundSetBtn").onclick = () => { renderSoundDlg(); $("#soundDlg").showModal(); };
$("#soundClose").onclick = () => $("#soundDlg").close();
$("#newclass").onsubmit = async e => {
  e.preventDefault(); const inp = $("#newclassname");
  const c = await api("POST", "/classes", { name: inp.value }); inp.value = "";
  state.view = "classes"; await loadClasses(); state.tab = "students"; openClass(c.id);
};
addEventListener("resize", () => drawWheel());

/* ---------------- Handy: Menü, Installation, Service Worker ---------------- */
const closeDrawer = () => document.body.classList.remove("drawer");
$("#menuBtn").onclick = () => document.body.classList.toggle("drawer");
$("#scrim").onclick = closeDrawer;
$("#classlist").addEventListener("click", e => { if (e.target.closest("li[data-id]")) closeDrawer(); });
$("#usersBtn").addEventListener("click", closeDrawer);
$("#newclass").addEventListener("submit", closeDrawer);

let installEvt = null;
addEventListener("beforeinstallprompt", e => { e.preventDefault(); installEvt = e; $("#installBtn").hidden = false; });
$("#installBtn").onclick = async () => {
  if (!installEvt) return;
  installEvt.prompt(); await installEvt.userChoice; installEvt = null; $("#installBtn").hidden = true;
};
addEventListener("appinstalled", () => { $("#installBtn").hidden = true; toast("App installiert 🎉"); });
if ("serviceWorker" in navigator) addEventListener("load", () => navigator.serviceWorker.register("/sw.js").catch(() => {}));
// Easter Egg: Logo in der Seitenleiste anklicken
$("#sideLogo").onclick = () => {
  const l = $("#sideLogo"); l.classList.remove("whirl"); void l.offsetWidth; l.classList.add("whirl");
  safe(() => { Sound.unlock(); Sound.shuffle(); });
};

/* ---------------- Teamteaching: Klasse teilen ---------------- */
async function leaveClass() {
  const c = state.current;
  if (!confirm(`Klasse „${c.name}“ verlassen? Sie verschwindet aus deiner Liste, bleibt aber bei ${c.owner.username} erhalten.`)) return;
  await api("DELETE", `/classes/${c.id}/members/${state.user.id}`);
  $("#shareDlg").open && $("#shareDlg").close();
  state.current = null; await loadClasses(); renderMain(); toast("Klasse verlassen");
}
async function openShare() {
  const c = state.current;
  const teachers = c.isOwner ? await api("GET", "/teachers") : [];
  const inTeam = new Set([c.owner.id, ...c.members.map(m => m.id)]);
  const avail = teachers.filter(t => !inTeam.has(t.id));
  const row = (u, tag, actions = "") => `<li><div class="avatar sm">${esc(initials(u.username))}</div>
    <span class="grow"><b>${esc(u.username)}</b>${u.id === state.user.id ? ' <span class="muted">(du)</span>' : ""}<br><span class="muted small">${tag}</span></span>${actions}</li>`;
  $("#shareBody").innerHTML = `
    <p class="muted" style="margin-top:0">Alle im Team sehen und bearbeiten dieselbe Klasse: Schülerliste, Fächer, Glücksrad und Verlauf.</p>
    <ul class="team">
      ${row(c.owner, "Besitzer/in")}
      ${c.members.map(m => row(m, "Team-Lehrkraft",
        c.isOwner ? `<button class="btn ghost small" data-owner="${m.id}" title="Besitz übergeben">Übergeben</button><button class="btn ghost danger small" data-rm="${m.id}">Entfernen</button>`
        : m.id === state.user.id ? `<button class="btn ghost danger small" id="leaveBtn2">Verlassen</button>` : "")).join("")}
    </ul>
    ${c.isOwner ? (avail.length ? `<div class="label" style="margin-top:16px">Lehrkraft hinzufügen</div>
      <div class="row" style="margin-top:6px"><select id="shareSel" style="flex:1">${avail.map(t => `<option value="${t.id}">${esc(t.username)}</option>`).join("")}</select>
      <button class="btn primary" id="shareAdd">Hinzufügen</button></div>`
      : `<p class="muted small" style="margin-top:14px">Es gibt keine weiteren Lehrkräfte. Ein/e Administrator/in kann sie unter 👥 Benutzerverwaltung anlegen.</p>`)
      : `<p class="muted small" style="margin-top:14px">Nur ${esc(c.owner.username)} kann weitere Lehrkräfte hinzufügen.</p>`}`;
  const refresh = c2 => { setCurrent(c2); openShare(); };
  if ($("#shareAdd")) $("#shareAdd").onclick = async () => { refresh(await api("POST", `/classes/${c.id}/members`, { userId: $("#shareSel").value, subject: c.subject })); Sound.pop(); toast("Klasse geteilt"); };
  document.querySelectorAll("[data-rm]").forEach(b => b.onclick = async () => {
    const m = c.members.find(x => x.id === b.dataset.rm);
    if (confirm(`${m.username} aus dem Team entfernen?`)) refresh(await api("DELETE", `/classes/${c.id}/members/${m.id}`, { subject: c.subject }));
  });
  document.querySelectorAll("[data-owner]").forEach(b => b.onclick = async () => {
    const m = c.members.find(x => x.id === b.dataset.owner);
    if (confirm(`Klasse an ${m.username} übergeben? Du bleibst im Team, kannst sie danach aber nicht mehr löschen oder teilen.`))
      refresh(await api("PUT", `/classes/${c.id}/owner`, { userId: m.id, subject: c.subject }));
  });
  if ($("#leaveBtn2")) $("#leaveBtn2").onclick = leaveClass;
  if (!$("#shareDlg").open) $("#shareDlg").showModal();
}
$("#shareClose").onclick = () => $("#shareDlg").close();

// Teamteaching: beim Zurückkehren ins Fenster neuesten Stand holen (Kolleg/in könnte etwas geändert haben)
addEventListener("focus", async () => {
  if (!state.user || state.view !== "classes" || state.spinning || state.pendingRating || document.querySelector("dialog[open]")) return;
  try {
    await loadClasses();
    if (state.current && state.classes.some(c => c.id === state.current.id)) {
      const c2 = await api("GET", `/classes/${state.current.id}/subjects/${state.current.subject}`);
      if (!state.spinning && !state.pendingRating && JSON.stringify(c2) !== JSON.stringify(state.current)) setCurrent(c2);
    } else if (state.current) { state.current = null; renderMain(); }
  } catch (e) {}
});

/* ---------------- Anmeldung & Benutzer ---------------- */
let setupMode = false;
function showAuth(setup) {
  setupMode = setup;
  $("#appRoot").hidden = true; $("#authScreen").hidden = false;
  $("#authHint").textContent = setup ? "Willkommen! Lege das erste Administrator-Konto an." : "Bitte anmelden";
  $("#authBtn").textContent = setup ? "Konto anlegen & starten" : "Anmelden";
  $("#authPw2Wrap").hidden = !setup; $("#authPw2").required = setup;
  $("#authPw").autocomplete = setup ? "new-password" : "current-password";
  $("#authErr").textContent = ""; $("#authPw").value = ""; $("#authPw2").value = "";
  setTimeout(() => $("#authUser").focus(), 50);
}
$("#authForm").onsubmit = async e => {
  e.preventDefault(); $("#authErr").textContent = "";
  const username = $("#authUser").value.trim(), password = $("#authPw").value;
  if (setupMode && password !== $("#authPw2").value) { $("#authErr").textContent = "Passwörter stimmen nicht überein"; return; }
  $("#authBtn").disabled = true;
  try {
    const r = await api("POST", setupMode ? "/auth/setup" : "/auth/login", { username, password });
    await enterApp(r.user);
  } catch (err) { $("#authErr").textContent = err.message; }
  finally { $("#authBtn").disabled = false; }
};
async function enterApp(user) {
  state.user = user; state.view = "classes"; state.current = null;
  $("#authScreen").hidden = true; $("#appRoot").hidden = false;
  $("#meName").textContent = user.username; $("#meAvatar").textContent = initials(user.username);
  $("#meRole").textContent = user.role === "admin" ? "Administrator/in" : "Lehrkraft";
  $("#usersBtn").hidden = user.role !== "admin";
  loadSoundSettings();
  await loadClasses();
  const last = store.get("lastClass");
  if (last && state.classes.some(c => c.id === last)) openClass(last);
  else if (state.classes.length) openClass(state.classes[0].id);
  else renderMain();
}
$("#logoutBtn").onclick = async () => { await api("POST", "/auth/logout"); state.user = null; showAuth(false); };
$("#usersBtn").onclick = () => { if (state.spinning || state.pendingRating) return; state.view = "users"; state.current = null; applyTurbo(); renderClassList(); renderMain(); };
$("#pwBtn").onclick = () => { $("#pwForm").reset(); $("#pwDlg").showModal(); };
$("#pwCancel").onclick = () => $("#pwDlg").close();
$("#pwForm").onsubmit = async e => {
  e.preventDefault();
  if ($("#pwNew").value !== $("#pwNew2").value) { toast("Neue Passwörter stimmen nicht überein"); return; }
  try { await api("POST", "/auth/password", { old: $("#pwOld").value, new: $("#pwNew").value }); $("#pwDlg").close(); toast("Passwort geändert"); }
  catch (err) { toast(err.message); }
};

async function renderUsers() {
  const users = await api("GET", "/users");
  const fmt = ts => new Date(ts * 1000).toLocaleDateString("de-AT");
  $("#main").innerHTML = `
    <div class="glass topbar"><h2>Benutzerverwaltung</h2></div>
    <div class="glass card">
      <div class="label" style="margin-bottom:8px">Neuen Benutzer anlegen</div>
      <form class="userform" id="newUser">
        <input type="text" id="nuName" placeholder="Benutzername" autocomplete="off" required>
        <input type="password" id="nuPw" placeholder="Passwort (min. 8 Zeichen)" autocomplete="new-password" minlength="8" required>
        <select id="nuRole"><option value="teacher">Lehrkraft</option><option value="admin">Administrator/in</option></select>
        <button class="btn primary">Anlegen</button>
      </form>
      <table style="margin-top:20px"><tr><th>Benutzer</th><th>Rolle</th><th>Klassen</th><th>Geteilt</th><th>Angelegt</th><th></th></tr>
      ${users.map(u => `<tr><td><b>${esc(u.username)}</b>${u.id === state.user.id ? ' <span class="muted">(du)</span>' : ""}</td>
        <td><select data-role="${u.id}"><option value="teacher" ${u.role === "teacher" ? "selected" : ""}>Lehrkraft</option><option value="admin" ${u.role === "admin" ? "selected" : ""}>Administrator/in</option></select></td>
        <td>${u.classes}</td><td>${u.shared}</td><td>${fmt(u.created_at)}</td>
        <td style="text-align:right;white-space:nowrap"><button class="btn" data-pw="${u.id}">Passwort setzen</button>
        ${u.id === state.user.id ? "" : `<button class="btn danger" data-deluser="${u.id}">Löschen</button>`}</td></tr>`).join("")}
      </table>
      <div class="row jokerbar" style="margin-top:20px">
        <span class="label">🃏 Joker</span>
        <span class="muted small" style="flex:1">Gibt allen Schüler/innen in allen Klassen (aller Lehrkräfte) einen Joker – in jedem Fach. Einzeln oder pro Fach: Klasse öffnen → Schülerliste.</span>
        <button class="btn" id="jokerGlobal">Allen +1 Joker</button>
      </div>
      <div class="muted" style="margin-top:14px;font-size:13px">Jede Lehrkraft sieht ihre eigenen und die mit ihr geteilten Klassen. Beim Löschen eines Benutzers gehen geteilte Klassen an die Team-Lehrkraft über, nicht geteilte werden gelöscht.</div>
    </div>`;
  $("#jokerGlobal").onclick = async () => {
    if (!confirm("Allen Schüler/innen in allen Klassen einen Joker geben – in jedem Fach?")) return;
    try { const r = await api("POST", "/jokers"); Sound.pop(); toast(`🃏 ${r.students} Schüler/innen haben einen Joker mehr`); } catch (err) {}
  };
  $("#newUser").onsubmit = async e => {
    e.preventDefault();
    try { await api("POST", "/users", { username: $("#nuName").value.trim(), password: $("#nuPw").value, role: $("#nuRole").value }); toast("Benutzer angelegt"); renderUsers(); }
    catch (err) {}
  };
  document.querySelectorAll("[data-role]").forEach(sel => sel.onchange = async () => {
    try { await api("PUT", "/users/" + sel.dataset.role, { role: sel.value }); toast("Rolle geändert"); } catch (err) {}
    renderUsers();
  });
  document.querySelectorAll("[data-pw]").forEach(b => b.onclick = async () => {
    const u = users.find(x => x.id === b.dataset.pw), pw = prompt(`Neues Passwort für ${u.username} (min. 8 Zeichen):`);
    if (!pw) return;
    try { await api("PUT", "/users/" + u.id, { password: pw }); toast("Passwort gesetzt"); } catch (err) {}
  });
  document.querySelectorAll("[data-deluser]").forEach(b => b.onclick = async () => {
    const u = users.find(x => x.id === b.dataset.deluser);
    if (!confirm(`Benutzer „${u.username}“ und alle seine ${u.classes} Klassen löschen?`)) return;
    try { await api("DELETE", "/users/" + u.id); toast("Benutzer gelöscht"); } catch (err) {}
    renderUsers();
  });
}

(async () => {
  const st = await api("GET", "/auth/status");
  if (st.user) enterApp(st.user); else showAuth(st.setup);
})();
