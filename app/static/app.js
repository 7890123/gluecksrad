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
const outcomeOf = s => s >= 70 ? "removed" : s >= 50 ? "kept" : "added";
const OUT_TEXT = { removed: "fliegt aus dem Rad", kept: "bleibt im Rad", added: "kommt ein zusätzliches Mal ins Rad" };
const OUT_SHORT = { removed: "raus", kept: "bleibt", added: "+1 im Rad" };
const store = { get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }, set(k, v) { try { localStorage.setItem(k, v); } catch (e) {} } };
const rand = (a, b) => a + Math.random() * (b - a);
const initials = n => n.split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0].toUpperCase()).join("");

function studentIndex(id) { return state.current ? state.current.students.findIndex(s => s.id === id) : 0; }
function hueFor(id) { return (Math.max(0, studentIndex(id)) * 137.508 + 265) % 360; }
function colorFor(id, l = 58) { return `hsl(${hueFor(id)} 78% ${l}%)`; }

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
  state.current = c;
  store.set("lastSubject:" + c.id, c.subject);
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
  m.innerHTML = `
    <div class="glass topbar">
      <h2>${esc(c.name)}</h2>
      <button class="btn ghost icon" id="renameBtn" title="Umbenennen">✏️</button>
      <button class="btn ghost teambtn" id="shareBtn" title="Klasse mit Kolleg/innen teilen">👥 Team${c.members.length ? ` <b>${c.members.length + 1}</b>` : ""}</button>
      <div class="seg">
        <button data-tab="wheel" class="${state.tab === "wheel" ? "on" : ""}">Glücksrad</button>
        <button data-tab="students" class="${state.tab === "students" ? "on" : ""}">Schülerliste</button>
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
  ({ wheel: renderWheelTab, students: renderStudentsTab, history: renderHistoryTab })[state.tab]();
}

/* ---------------- Glücksrad-Tab ---------------- */
function poolSegments() {
  const c = state.current, byId = Object.fromEntries(c.students.map(s => [s.id, s]));
  return c.pool.filter(id => byId[id]).map(id => byId[id]);
}

const POINTER_SVG = `<svg class="pointer" id="pointer" viewBox="0 0 54 70">
  <defs><linearGradient id="pg" x1="0" x2="1" y1="0" y2="1"><stop offset="0" stop-color="#fff6c8"/><stop offset=".45" stop-color="#ffcc33"/><stop offset="1" stop-color="#e08a00"/></linearGradient></defs>
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
          <button class="hub" id="hub" title="Drehen (Leertaste)"><img src="logo.png" alt="Drehen"></button>
        </div>
        <div class="controls">
          <button class="btn" id="shuffleBtn" title="Reihenfolge im Rad zufällig mischen">🎲 Mischen</button>
          <button class="btn primary" id="spin">Drehen!</button>
          <button class="btn" id="resetBtn" title="Jede/n genau einmal ins Rad">↺ Zurücksetzen</button>
        </div>
        <div class="hint"><span><b class="g">≥ 70 %</b> raus</span><span><b class="m">50–69 %</b> bleibt</span><span><b class="r">&lt; 50 %</b> +1 im Rad</span><span>Leertaste = drehen</span></div>
      </div>
      <div class="side">
        ${last ? `<div class="glass panel"><h3>Zuletzt gezogen</h3>
          <div class="last"><div class="avatar" style="background:${colorFor(last.studentId)}">${esc(initials(last.name))}</div>
          <div style="flex:1"><b>${esc(last.name)}</b><div class="muted">${last.score} %</div></div>
          <span class="pill o-${last.outcome}">${OUT_SHORT[last.outcome]}</span></div></div>` : ""}
        <div class="glass panel">
          <h3>Name hinzufügen</h3>
          <form id="quickAdd" class="row"><input type="text" id="quickName" placeholder="Name …"><button class="btn primary icon" title="Hinzufügen">＋</button></form>
          <div class="muted" style="font-size:12px;margin-top:6px">Landet an einer zufälligen Stelle im Rad.</div>
        </div>
        <div class="glass panel">
          <h3><span>Im Rad: ${c.pool.length}</span><span class="muted" style="font-weight:400;font-size:13px">${c.students.length} SuS</span></h3>
          ${c.students.length ? `<ul class="pool">${c.students.map(s => `
            <li class="${counts[s.id] ? "" : "out"}"><span class="dot" style="background:${colorFor(s.id)}"></span><span class="n">${esc(s.name)}</span>
              <button class="btn" data-d="-1" data-id="${s.id}" ${counts[s.id] ? "" : "disabled"}>−</button>
              <span class="badge">${counts[s.id] || 0}</span>
              <button class="btn" data-d="1" data-id="${s.id}">+</button></li>`).join("")}</ul>`
            : `<div class="muted">Noch keine Schüler/innen – oben einen Namen eingeben oder im Tab „Schülerliste“ mehrere einfügen.</div>`}
        </div>
      </div>
    </div>`;
  drawWheel();
  setHub(hubAngle);
  setControls();
  $("#spin").onclick = $("#hub").onclick = spin;
  $("#shuffleBtn").onclick = shuffle;
  $("#resetBtn").onclick = async () => {
    if (!confirm("Rad zurücksetzen? Jede/r Schüler/in ist danach genau einmal im Rad (zufällige Reihenfolge).")) return;
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
  const key = W + ":" + pattern;
  if (rimCache[key]) return rimCache[key];
  const cv = mkCanvas(W), ctx = cv.getContext("2d"), { cx, cy, Rrim } = GEOM(W);
  const rim = ctx.createLinearGradient(0, 0, W, W);
  rim.addColorStop(0, "#0a5ea8"); rim.addColorStop(.5, "#06264a"); rim.addColorStop(1, "#0b4f8f");
  ctx.beginPath(); ctx.arc(cx, cy, Rrim, 0, TAU); ctx.fillStyle = rim; ctx.fill();
  ctx.lineWidth = 3; ctx.strokeStyle = "rgba(255,255,255,.25)"; ctx.stroke();
  const bulbs = 28;
  for (let i = 0; i < bulbs; i++) {
    const on = pattern === "all" ? true : pattern.startsWith("p2") ? (i + +pattern[3]) % 2 === 0 : (i + +pattern[3]) % 3 === 0;
    const ang = i / bulbs * TAU, x = cx + Math.cos(ang) * (Rrim - 23), y = cy + Math.sin(ang) * (Rrim - 23);
    const g = ctx.createRadialGradient(x, y, 0, x, y, 16);
    const bc = ["152,193,15", "235,100,32", "120,190,255"][i % 3];       // Logo-Farben als Lämpchen
    g.addColorStop(0, on ? "rgba(255,255,240,1)" : "rgba(255,255,255,.25)");
    g.addColorStop(.45, on ? `rgba(${bc},.95)` : "rgba(255,255,255,.08)");
    g.addColorStop(1, `rgba(${bc},0)`);
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, 16, 0, TAU); ctx.fill();
  }
  return (rimCache[key] = cv);
}

function wheelLayer(W, segs) {
  const key = W + "|" + segs.map(s => s.id + ":" + s.name + ":" + studentIndex(s.id)).join(",");
  if (layerCache.key === key) return layerCache.canvas;
  const cv = mkCanvas(W), ctx = cv.getContext("2d"), { cx, cy, R } = GEOM(W), n = segs.length, a = TAU / n;
  segs.forEach((s, k) => {
    const st = k * a, h = hueFor(s.id);
    const g = ctx.createRadialGradient(cx, cy, R * 0.15, cx, cy, R);
    g.addColorStop(0, `hsl(${h} 85% 70%)`); g.addColorStop(.7, `hsl(${h} 78% 56%)`); g.addColorStop(1, `hsl(${h} 70% 42%)`);
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

  const pattern = state.spinning ? "p2_" + (state.lights % 2) : state.winnerPos !== null ? "p3_" + (Math.floor(now / 160) % 3) : "all";
  ctx.drawImage(rimLayer(W, pattern), 0, 0);

  if (!n) {
    ctx.beginPath(); ctx.arc(cx, cy, R, 0, TAU); ctx.fillStyle = "rgba(255,255,255,.08)"; ctx.fill();
    ctx.fillStyle = "rgba(255,255,255,.6)"; ctx.font = "600 44px Outfit, system-ui"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillText("Rad ist leer", cx, cy - 150);
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
      ctx.lineWidth = 8; ctx.strokeStyle = `rgba(255,230,150,${0.7 + 0.3 * Math.sin(now / 150)})`; ctx.stroke(); ctx.restore();
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
  set("#spin", busy || !c.pool.length); set("#hub", busy || !c.pool.length);
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
    animateWinner(); setControls();
    setTimeout(() => { state.pendingRating = false; openRating(segs[pos], pos); }, 650);
  };
  (function frame(now) {
    const t = (now - t0) / 1000;
    const ang = mo.angleAt(t);
    try {
      const speed = Math.min(1, Math.abs(ang - lastAng) / (1 / 60) / mo.vmax);
      lastAng = ang; state.rotation = ang;
      setHub(-ang * 180 / Math.PI * 1.7);
      safe(() => Sound.spinSpeed(speed));
      const idx = pointerIndex(ang, n);
      if (idx !== lastIdx) { lastIdx = idx; safe(() => Sound.tick(speed)); state.pointerKick = -14 - 14 * (1 - speed); }
      state.pointerKick *= 0.82;
      if (now - lastLight > 90 + (1 - speed) * 250) { state.lights++; lastLight = now; }
      if (!rolling && t >= mo.suspenseAt) { rolling = true; safe(() => Sound.rollStart(mo.total - mo.suspenseAt)); }
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
function animateWinner() {
  const loop = () => { if (state.winnerPos === null || state.spinning) return; drawWheel(); requestAnimationFrame(loop); };
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
  const box = $("#resultBox");
  box.className = "result o-" + o; box.textContent = `${state.drawn ? state.drawn.name : ""} ${OUT_TEXT[o]}`;
}
range.oninput = () => setScore(range.value);
function openRating(s, pos) {
  state.drawn = s; state.drawnPos = pos;
  $("#winnerName").textContent = s.name;
  const av = $("#winAvatar"); av.textContent = initials(s.name); av.style.background = `linear-gradient(135deg, ${colorFor(s.id, 62)}, ${colorFor(s.id, 42)})`;
  setScore(60); if (!dlg.open) dlg.showModal(); $("#saveBtn").focus();
}
function closeRating() { if (dlg.open) dlg.close(); state.drawn = null; state.winnerPos = null; drawWheel(); setControls(); }
$("#skipBtn").onclick = closeRating;
dlg.addEventListener("cancel", e => { e.preventDefault(); closeRating(); });
$("#saveBtn").onclick = async () => {
  const c = state.current, s = state.drawn; if (!s) return;
  const score = +range.value, o = outcomeOf(score), pos = state.drawnPos;
  dlg.close(); state.drawn = null; state.winnerPos = null;
  safe(() => Sound[o]());
  if (o === "removed") safe(() => confetti(180));
  try {
    const c2 = await api("POST", `/classes/${c.id}/subjects/${c.subject}/rate`, { studentId: s.id, score, position: pos });
    if (o === "added") flashStudents([s.id]);
    setCurrent(c2);
  } catch (e) { renderMain(); }
};
document.addEventListener("keydown", e => {
  if (dlg.open) {
    if (e.key === "Enter") { e.preventDefault(); $("#saveBtn").click(); }
    else if (e.key === "ArrowRight" || e.key === "ArrowUp") { e.preventDefault(); setScore(+range.value + 5); }
    else if (e.key === "ArrowLeft" || e.key === "ArrowDown") { e.preventDefault(); setScore(+range.value - 5); }
    return;
  }
  if (e.code === "Space" && !e.repeat && state.tab === "wheel" && state.view !== "users" && state.user && !$("#pwDlg").open && !$("#soundDlg").open && !$("#shareDlg").open && !/INPUT|TEXTAREA/.test(document.activeElement.tagName)) { e.preventDefault(); spin(); }
});

/* ---------------- Konfetti ---------------- */
const cf = $("#confetti"), cfx = cf.getContext("2d"); let parts = [], cfRunning = false;
function confetti(count = 120, origin) {
  cf.width = innerWidth * devicePixelRatio; cf.height = innerHeight * devicePixelRatio;
  const cols = ["#0062ab", "#98c10f", "#eb6420", "#2b8ad8", "#c3e05a", "#ffffff"];
  for (let i = 0; i < count; i++) {
    const o = origin || { x: rand(0, innerWidth), y: -20 };
    const ang = origin ? rand(0, TAU) : rand(Math.PI * .35, Math.PI * .65), sp = origin ? rand(4, 13) : rand(2, 6);
    parts.push({ x: o.x, y: o.y, vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp - (origin ? 4 : 0), r: rand(0, TAU), vr: rand(-.3, .3),
      w: rand(6, 12), h: rand(8, 16), c: cols[i % cols.length], life: rand(90, 160) });
  }
  if (!cfRunning) { cfRunning = true; requestAnimationFrame(cfLoop); }
}
function cfLoop() {
  cfx.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0); cfx.clearRect(0, 0, innerWidth, innerHeight);
  parts = parts.filter(p => p.life-- > 0 && p.y < innerHeight + 40);
  for (const p of parts) {
    p.vy += .18; p.vx *= .99; p.x += p.vx; p.y += p.vy; p.r += p.vr;
    cfx.save(); cfx.translate(p.x, p.y); cfx.rotate(p.r); cfx.globalAlpha = Math.min(1, p.life / 40);
    cfx.fillStyle = p.c; cfx.fillRect(-p.w / 2, -p.h / 2 * Math.abs(Math.cos(p.r * 2)), p.w, p.h * Math.abs(Math.cos(p.r * 2)) + 1); cfx.restore();
  }
  if (parts.length) requestAnimationFrame(cfLoop); else { cfRunning = false; cfx.clearRect(0, 0, innerWidth, innerHeight); }
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
      <ul class="studs">${c.students.map(s => `<li><div class="avatar" style="background:${colorFor(s.id)}">${esc(initials(s.name))}</div><span>${esc(s.name)}</span>
        <button class="btn ghost icon" data-edit="${s.id}" title="Umbenennen">✏️</button><button class="btn ghost icon danger" data-del="${s.id}" title="Löschen">✕</button></li>`).join("")}</ul>
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
}

/* ---------------- Verlauf ---------------- */
function renderHistoryTab() {
  const c = state.current, rates = c.history.filter(h => h.type === "rate");
  const fmt = ts => new Date(ts * 1000).toLocaleString("de-AT", { dateStyle: "short", timeStyle: "short" });
  const avg = rates.length ? Math.round(rates.reduce((s, h) => s + h.score, 0) / rates.length) : "–";
  const cnt = o => rates.filter(h => h.outcome === o).length;
  const rows = c.history.map(h => h.type === "reset"
    ? `<tr><td>${fmt(h.ts)}</td><td colspan="3" class="muted">↺ Rad zurückgesetzt</td></tr>`
    : `<tr><td>${fmt(h.ts)}</td><td>${esc(h.name)}</td><td>${h.score} %</td><td><span class="pill o-${h.outcome}">${OUT_SHORT[h.outcome]}</span></td></tr>`).join("");
  $("#tab").innerHTML = `<div class="glass card">
    <div class="stats">
      <div class="stat"><span class="muted">Ziehungen</span><b>${rates.length}</b></div>
      <div class="stat"><span class="muted">Ø Bewertung</span><b>${avg}${rates.length ? " %" : ""}</b></div>
      <div class="stat"><span class="muted">Raus</span><b style="color:var(--good)">${cnt("removed")}</b></div>
      <div class="stat"><span class="muted">Bleibt</span><b style="color:var(--mid)">${cnt("kept")}</b></div>
      <div class="stat"><span class="muted">+1 im Rad</span><b style="color:var(--bad)">${cnt("added")}</b></div>
    </div>
    ${c.history.length ? `<table><tr><th>Zeit</th><th>Name</th><th>Bewertung</th><th>Folge</th></tr>${rows}</table>
      <div style="margin-top:14px"><button class="btn danger" id="clearHist">Verlauf leeren</button></div>`
      : `<div class="muted">Noch keine Ziehungen.</div>`}</div>`;
  const b = $("#clearHist");
  if (b) b.onclick = async () => { if (confirm("Verlauf wirklich leeren?")) setCurrent(await api("DELETE", subjUrl("/history"))); };
}

/* ---------------- Start ---------------- */
function applyTheme(t) { document.documentElement.dataset.theme = t; $("#themeBtn").textContent = t === "dark" ? "🌙" : "☀️"; store.set("theme", t); }
applyTheme(store.get("theme") || "dark");
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
$("#usersBtn").onclick = () => { if (state.spinning || state.pendingRating) return; state.view = "users"; state.current = null; renderClassList(); renderMain(); };
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
      <div class="muted" style="margin-top:14px;font-size:13px">Jede Lehrkraft sieht ihre eigenen und die mit ihr geteilten Klassen. Beim Löschen eines Benutzers gehen geteilte Klassen an die Team-Lehrkraft über, nicht geteilte werden gelöscht.</div>
    </div>`;
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
