// Fuel Tracker – client. All data lives in localStorage on the phone.
const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];
const STORE_KEY = "fuel.v1";

// ---------- state ----------
let NUTRIENTS = [];
let state = load();
let currentDate = todayStr();
let pending = []; // items waiting for review before saving
let photo = null; // { media_type, data, url }

function load() {
  try {
    const s = JSON.parse(localStorage.getItem(STORE_KEY));
    if (s && Array.isArray(s.entries)) return { profile: {}, weights: [], password: "", ...s };
  } catch {}
  return { profile: {}, entries: [], weights: [], password: "" };
}
function save() {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); }
  catch { toast("Couldn't save – storage full or blocked."); }
}

function todayStr(d = new Date()) {
  const z = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return z.toISOString().slice(0, 10);
}
function shiftDate(str, days) {
  const d = new Date(str + "T12:00:00");
  d.setDate(d.getDate() + days);
  return todayStr(d);
}
const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const r0 = (n) => Math.round(n || 0);
const fmt = (n) => (n >= 100 ? r0(n) : n >= 10 ? Math.round(n * 10) / 10 : Math.round(n * 100) / 100);

function toast(msg, ms = 2800) {
  const t = $("#toast");
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(toast._t);
  toast._t = setTimeout(() => (t.hidden = true), ms);
}

async function api(path, opts = {}) {
  const res = await fetch(path, {
    ...opts,
    headers: { "Content-Type": "application/json", "x-app-password": state.password || "", ...(opts.headers || {}) },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

// ---------- targets ----------
// Adult RDA / AI values (US NIH). "limit" = stay under.
const MICRO_TARGETS = {
  omega3: { male: 1.6, female: 1.1 },
  cholesterol: { limit: 300 },
  sodium: { limit: 2300 },
  potassium: { male: 3400, female: 2600 },
  calcium: { all: 1000 },
  iron: { male: 8, female: 18 },
  magnesium: { male: 420, female: 320 },
  zinc: { male: 11, female: 8 },
  phosphorus: { all: 700 },
  selenium: { all: 55 },
  vitamin_a: { male: 900, female: 700 },
  vitamin_c: { male: 90, female: 75 },
  vitamin_d: { all: 15 },
  vitamin_e: { all: 15 },
  vitamin_k: { male: 120, female: 90 },
  thiamin: { male: 1.2, female: 1.1 },
  riboflavin: { male: 1.3, female: 1.1 },
  niacin: { male: 16, female: 14 },
  vitamin_b6: { male: 1.3, female: 1.3 },
  folate: { all: 400 },
  vitamin_b12: { all: 2.4 },
  choline: { male: 550, female: 425 },
};

function hasProfile() {
  const p = state.profile;
  return p.weight && p.height && p.age;
}

function computeTargets(p = state.profile) {
  const sex = p.sex || "male";
  const weight = Number(p.weight) || 75;
  const height = Number(p.height) || 178;
  const age = Number(p.age) || 28;
  const activity = Number(p.activity) || 1.55;
  const surplus = Number(p.surplus) || 400;
  const ppk = Number(p.proteinPerKg) || 2.0;

  const bmr = 10 * weight + 6.25 * height - 5 * age + (sex === "male" ? 5 : -161); // Mifflin-St Jeor
  const tdee = bmr * activity;
  const calories = Number(p.calOverride) || Math.round((tdee + surplus) / 10) * 10;
  const protein = Math.round(weight * ppk);
  const performance = (p.style || "performance") === "performance";
  // Very low-fat diets are linked to lower testosterone, so performance mode keeps fat higher.
  const fat = Math.round((calories * (performance ? 0.35 : 0.27)) / 9);
  const carbs = Math.max(0, Math.round((calories - protein * 4 - fat * 9) / 4));

  const t = {
    calories: { goal: calories },
    protein: { goal: protein },
    carbs: { goal: carbs },
    fat: { goal: fat },
    fiber: { goal: Math.round((calories / 1000) * 14) },
    sugar: { limit: Math.round((calories * 0.1) / 4) }, // added-sugar guideline, shown as a soft cap
    saturated_fat: { limit: Math.round((calories * 0.1) / 9) },
  };
  for (const [k, v] of Object.entries(MICRO_TARGETS)) {
    if (v.limit) t[k] = { limit: v.limit };
    else {
      let goal = v.all ?? v[sex];
      if (k === "vitamin_b6" && age > 50) goal = sex === "male" ? 1.7 : 1.5;
      if (k === "iron" && sex === "female" && age > 50) goal = 8;
      if (k === "magnesium" && age < 31) goal = sex === "male" ? 400 : 310;
      t[k] = { goal };
    }
  }
  if (performance) {
    // No caps on cholesterol (testosterone's building block) or saturated fat; tracked for info only.
    delete t.cholesterol;
    delete t.saturated_fat;
    t.sodium = { limit: 4000 }; // training + sweat raises needs
    // Hormone-supporting nutrients set above the basic RDA, still well under safe upper limits.
    const male = sex === "male";
    t.vitamin_d = { goal: 50 }; // 2000 IU
    t.zinc = { goal: male ? 20 : 12 };
    t.magnesium = { goal: male ? 500 : 400 };
    t.omega3 = { goal: 2.5 };
    t.selenium = { goal: 100 };
    t.choline = { goal: male ? 600 : 500 };
  }
  return { ...t, _tdee: Math.round(tdee), _style: performance ? "performance" : "standard" };
}

// ---------- totals ----------
const emptyTotals = () => Object.fromEntries(NUTRIENTS.map((n) => [n.key, 0]));
function totalsFor(entries) {
  const t = emptyTotals();
  for (const e of entries) for (const k in t) t[k] += Number(e.nutrients?.[k]) || 0;
  return t;
}
const entriesOn = (date) => state.entries.filter((e) => e.date === date);
function scaleNutrients(n, factor) {
  return Object.fromEntries(Object.entries(n).map(([k, v]) => [k, (Number(v) || 0) * factor]));
}

// ---------- rendering: today ----------
function renderToday() {
  const targets = computeTargets();
  const entries = entriesOn(currentDate);
  const tot = totalsFor(entries);

  $("#dateLabel").textContent =
    currentDate === todayStr()
      ? "Today"
      : currentDate === shiftDate(todayStr(), -1)
        ? "Yesterday"
        : new Date(currentDate + "T12:00:00").toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
  $("#nextDay").style.visibility = currentDate >= todayStr() ? "hidden" : "visible";
  $("#setupHint").hidden = Boolean(hasProfile());

  // Calorie ring
  const goal = targets.calories.goal;
  const pct = Math.min(1, tot.calories / goal);
  const C = 2 * Math.PI * 52;
  const ring = $("#calRing");
  ring.style.strokeDasharray = C;
  ring.style.strokeDashoffset = C * (1 - pct);
  $("#calEaten").textContent = r0(tot.calories);
  const left = goal - tot.calories;
  $("#calTarget").textContent = left > 0 ? `${r0(left)} kcal to go` : `goal hit (+${r0(-left)})`;

  // Macro bars
  const macro = (key, label, unit) => {
    const g = targets[key].goal;
    const v = tot[key];
    return `<div><div class="bar-label"><span>${label}</span><span>${r0(v)} / ${g} ${unit}</span></div>
      <div class="bar ${key}"><i style="width:${Math.min(100, (v / g) * 100)}%"></i></div></div>`;
  };
  $("#macroBars").innerHTML = macro("protein", "Protein", "g") + macro("carbs", "Carbs", "g") + macro("fat", "Fat", "g");

  // Meals
  const order = ["Breakfast", "Lunch", "Dinner", "Snack", "Pre/Post workout"];
  const groups = {};
  for (const e of entries) (groups[e.meal] ||= []).push(e);
  const mealNames = Object.keys(groups).sort((a, b) => order.indexOf(a) - order.indexOf(b));
  $("#meals").innerHTML = mealNames.length
    ? mealNames
        .map((m) => {
          const items = groups[m];
          const mt = totalsFor(items);
          return `<div class="card meal"><h3><span>${esc(m)}</span><span class="muted">${r0(mt.calories)} kcal · ${r0(mt.protein)} g P</span></h3>
            ${items
              .map(
                (e) => `<div class="entry" data-id="${e.id}">
                  <div><div class="name">${esc(e.name)}${e.confidence === "low" ? '<span class="badge low">rough</span>' : ""}</div>
                  <div class="meta">${esc(e.portion || r0(e.grams) + " g")}</div></div>
                  <div class="kcal">${r0(e.nutrients.calories)} kcal<div class="meta">${fmt(e.nutrients.protein)} g P</div></div>
                </div>`,
              )
              .join("")}</div>`;
        })
        .join("")
    : `<div class="card"><p class="muted">Nothing logged ${currentDate === todayStr() ? "yet today" : "this day"}. Tap ＋ to speak, type, scan or snap your food.</p></div>`;

  renderMicros(tot, targets);
}

function renderMicros(tot, targets) {
  const groups = [
    ["macro", "Carbs & fiber"],
    ["fat", "Fats"],
    ["mineral", "Minerals"],
    ["vitamin", "Vitamins"],
  ];
  let met = 0, counted = 0;
  const html = groups
    .map(([g, title]) => {
      const rows = NUTRIENTS.filter((n) => n.group === g && !["protein", "carbs", "fat"].includes(n.key))
        .map((n) => {
          const v = tot[n.key];
          const t = targets[n.key];
          let right = `${fmt(v)} ${n.unit}`;
          let bar = "";
          if (t?.goal) {
            const p = (v / t.goal) * 100;
            counted++;
            if (p >= 100) met++;
            right += ` / ${t.goal} · ${r0(p)}%`;
            bar = `<div class="bar ${p >= 100 ? "ok" : "low"}"><i style="width:${Math.min(100, p)}%"></i></div>`;
          } else if (t?.limit) {
            const p = (v / t.limit) * 100;
            right += ` · max ${t.limit}`;
            bar = `<div class="bar ${p > 100 ? "over" : ""}"><i style="width:${Math.min(100, p)}%"></i></div>`;
          }
          return `<div class="micro"><span>${esc(n.label)}</span><span class="muted">${right}</span>${bar}</div>`;
        })
        .join("");
      return `<div class="micro-group"><h4>${title}</h4>${rows}</div>`;
    })
    .join("");
  $("#microList").innerHTML = html;
  $("#microSummary").textContent = `${met}/${counted} targets met`;
}

// Tap an entry to change the amount or delete it
$("#meals").addEventListener("click", (ev) => {
  const row = ev.target.closest(".entry");
  if (!row) return;
  const next = row.nextElementSibling;
  if (next?.classList.contains("entry-edit")) return next.remove();
  $$(".entry-edit").forEach((x) => x.remove());
  const e = state.entries.find((x) => x.id === row.dataset.id);
  const edit = document.createElement("div");
  edit.className = "entry-edit";
  edit.innerHTML = `<input type="number" inputmode="decimal" value="${r0(e.grams)}" aria-label="grams"/><span class="muted" style="align-self:center">g</span>
    <button class="btn small" data-act="save">Update</button><button class="btn small ghost" data-act="del">Delete</button>`;
  row.after(edit);
  edit.addEventListener("click", (x) => {
    const act = x.target.dataset.act;
    if (act === "del") {
      state.entries = state.entries.filter((y) => y.id !== e.id);
      save();
      renderToday();
      toast("Deleted");
    } else if (act === "save") {
      const g = Number(edit.querySelector("input").value);
      if (!(g > 0)) return toast("Enter grams");
      e.nutrients = scaleNutrients(e.nutrients, g / e.grams);
      e.portion = `${r0(g)} g`;
      e.grams = g;
      save();
      renderToday();
    }
  });
});

// ---------- coach ----------
$("#coachBtn").addEventListener("click", async () => {
  const btn = $("#coachBtn");
  const targets = computeTargets();
  const tot = totalsFor(entriesOn(currentDate));
  const remaining = {};
  for (const n of NUTRIENTS) {
    const g = targets[n.key]?.goal;
    if (g && tot[n.key] < g) remaining[`${n.key} (${n.unit})`] = fmt(g - tot[n.key]);
  }
  btn.disabled = true;
  $("#coachText").textContent = "Thinking…";
  try {
    const { advice } = await api("/api/coach", {
      method: "POST",
      body: JSON.stringify({
        remaining,
        eatenToday: entriesOn(currentDate).map((e) => `${e.name} (${e.portion})`),
        profile: { goal: "gain muscle", style: computeTargets()._style, sex: state.profile.sex, weightKg: state.profile.weight, timeNow: new Date().toLocaleTimeString() },
      }),
    });
    $("#coachText").textContent = advice;
  } catch (err) {
    $("#coachText").textContent = err.message;
  } finally {
    btn.disabled = false;
  }
});

// ---------- add sheet ----------
function openSheet() {
  $("#addSheet").hidden = false;
  showStep("input");
  $("#mealSelect").value = guessMeal();
  renderRecent();
}
function closeSheet() {
  stopScanner();
  stopMic();
  $("#addSheet").hidden = true;
  resetInput();
}
function resetInput() {
  $("#foodText").value = "";
  clearPhoto();
  pending = [];
}
function showStep(step) {
  for (const s of ["input", "scan", "review"]) $(`#${s}Step`).hidden = s !== step;
  $("#loading").hidden = true;
}
function setLoading(on, text = "Analyzing…") {
  $("#loading").hidden = !on;
  $("#loadingText").textContent = text;
  if (on) for (const s of ["input", "scan", "review"]) $(`#${s}Step`).hidden = true;
}
function guessMeal() {
  const h = new Date().getHours();
  return h < 11 ? "Breakfast" : h < 15 ? "Lunch" : h < 17 ? "Snack" : h < 22 ? "Dinner" : "Snack";
}

$("#addBtn").addEventListener("click", openSheet);
$("#addSheet").addEventListener("click", (e) => {
  if (e.target.id === "addSheet" || e.target.closest("[data-close]")) closeSheet();
});

// Recent foods for one-tap re-logging
function renderRecent() {
  const seen = new Set();
  const recent = [];
  for (const e of [...state.entries].reverse()) {
    const k = e.name.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    recent.push(e);
    if (recent.length >= 10) break;
  }
  $("#recentWrap").hidden = !recent.length;
  $("#recentList").innerHTML = recent
    .map((e) => `<button class="chip" data-id="${e.id}">${esc(e.name)} · ${r0(e.grams)} g</button>`)
    .join("");
}
$("#recentList").addEventListener("click", (ev) => {
  const id = ev.target.closest(".chip")?.dataset.id;
  const e = state.entries.find((x) => x.id === id);
  if (!e) return;
  pending = [{ name: e.name, portion: e.portion, grams: e.grams, confidence: e.confidence, nutrients: { ...e.nutrients }, source: "recent" }];
  showReview("From your recent foods – adjust grams if needed.");
});

// ---------- voice ----------
const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
let rec = null;
function stopMic() {
  try { rec?.stop(); } catch {}
}
$("#micBtn").addEventListener("click", () => {
  if (!SR) {
    $("#micStatus").textContent = "Voice input isn't supported in this browser – use your keyboard's 🎤 button instead.";
    $("#foodText").focus();
    return;
  }
  if (rec) return stopMic();
  rec = new SR();
  rec.lang = navigator.language || "en-US";
  rec.interimResults = true;
  rec.continuous = true;
  const base = $("#foodText").value.trim();
  let finalText = "";
  rec.onresult = (ev) => {
    let interim = "";
    for (let i = ev.resultIndex; i < ev.results.length; i++) {
      const r = ev.results[i];
      if (r.isFinal) finalText += r[0].transcript + " ";
      else interim += r[0].transcript;
    }
    $("#foodText").value = [base, finalText + interim].filter(Boolean).join(" ").trim();
  };
  rec.onerror = (ev) => {
    $("#micStatus").textContent = ev.error === "not-allowed" ? "Microphone permission denied." : `Voice error: ${ev.error}`;
  };
  rec.onend = () => {
    rec = null;
    $("#micBtn").classList.remove("on");
    $("#micStatus").textContent = $("#foodText").value ? "Got it. Tap Analyze, or edit the text first." : "";
  };
  rec.start();
  $("#micBtn").classList.add("on");
  $("#micStatus").textContent = "Listening… say what you ate, with amounts. Tap 🎤 again to stop.";
});

// ---------- photo ----------
async function handlePhoto(file) {
  if (!file) return;
  try {
    photo = await resizeImage(file);
    $("#photoImg").src = photo.url;
    $("#photoPreview").hidden = false;
    $("#foodText").placeholder = "Optional: add details (e.g. 'large plate', 'cooked in olive oil', 'I ate half')";
  } catch {
    toast("Couldn't read that image.");
  }
}
function clearPhoto() {
  photo = null;
  $("#photoPreview").hidden = true;
  $("#photoInput").value = "";
  $("#galleryInput").value = "";
  $("#foodText").placeholder = "e.g. 3 eggs scrambled in butter, 2 slices sourdough, 300 ml whole milk";
}
$("#photoInput").addEventListener("change", (e) => handlePhoto(e.target.files[0]));
$("#galleryInput").addEventListener("change", (e) => handlePhoto(e.target.files[0]));
$("#clearPhoto").addEventListener("click", clearPhoto);

// Shrink to ≤1568 px JPEG – plenty for food recognition, fast to upload.
function resizeImage(file, max = 1568) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const src = URL.createObjectURL(file);
    img.onload = () => {
      const scale = Math.min(1, max / Math.max(img.width, img.height));
      const c = document.createElement("canvas");
      c.width = Math.round(img.width * scale);
      c.height = Math.round(img.height * scale);
      c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(src);
      const url = c.toDataURL("image/jpeg", 0.85);
      resolve({ media_type: "image/jpeg", data: url.split(",")[1], url });
    };
    img.onerror = reject;
    img.src = src;
  });
}

// ---------- analyze (text / voice / photo) ----------
$("#analyzeBtn").addEventListener("click", async () => {
  stopMic();
  const text = $("#foodText").value.trim();
  if (!text && !photo) return toast("Say, type or snap what you ate first.");
  setLoading(true, photo ? "Looking at your plate…" : "Working out the nutrients…");
  try {
    const res = await api("/api/analyze", {
      method: "POST",
      body: JSON.stringify({ text, image: photo ? { media_type: photo.media_type, data: photo.data } : undefined }),
    });
    if (!res.items.length) {
      showStep("input");
      return toast(res.notes || "No food found – try adding more detail.", 4500);
    }
    pending = res.items.map((i) => ({ ...i, source: photo ? "photo" : "text" }));
    showReview(res.notes);
  } catch (err) {
    showStep("input");
    toast(err.message, 4500);
  }
});

// ---------- review ----------
function showReview(notes) {
  showStep("review");
  $("#reviewNotes").textContent = notes || "";
  renderReview();
}
function renderReview() {
  $("#reviewItems").innerHTML = pending
    .map(
      (it, i) => `<div class="review-item" data-i="${i}">
        <div class="row-between"><div><b>${esc(it.name)}</b>${it.confidence === "low" ? '<span class="badge low">rough guess</span>' : ""}
          <div class="mini">${esc(it.portion)}</div></div>
          <button class="icon-btn" data-remove aria-label="Remove">✕</button></div>
        <div class="grams"><input type="number" inputmode="decimal" value="${r0(it.grams)}" data-grams /> <span class="muted">g</span></div>
        <div class="mini">${r0(it.nutrients.calories)} kcal · ${fmt(it.nutrients.protein)} P · ${fmt(it.nutrients.carbs)} C · ${fmt(it.nutrients.fat)} F</div>
      </div>`,
    )
    .join("");
  const t = totalsFor(pending);
  $("#reviewTotal").textContent = `Total: ${r0(t.calories)} kcal · ${r0(t.protein)} g protein`;
  $("#saveItems").disabled = !pending.length;
}
$("#reviewItems").addEventListener("click", (e) => {
  if (!e.target.closest("[data-remove]")) return;
  pending.splice(Number(e.target.closest(".review-item").dataset.i), 1);
  renderReview();
});
$("#reviewItems").addEventListener("change", (e) => {
  if (!e.target.matches("[data-grams]")) return;
  const it = pending[Number(e.target.closest(".review-item").dataset.i)];
  const g = Number(e.target.value);
  if (!(g > 0) || !it.grams) return renderReview();
  it.nutrients = scaleNutrients(it.nutrients, g / it.grams);
  it.portion = `${r0(g)} g`;
  it.grams = g;
  renderReview();
});
$("#saveItems").addEventListener("click", () => {
  const meal = $("#mealSelect").value;
  const time = new Date().toISOString();
  for (const it of pending) {
    state.entries.push({
      id: uid(), date: currentDate, time, meal,
      name: it.name, portion: it.portion, grams: it.grams, confidence: it.confidence,
      source: it.source, nutrients: it.nutrients,
    });
  }
  save();
  toast(`Added ${pending.length} item${pending.length > 1 ? "s" : ""}`);
  closeSheet();
  renderToday();
});
$("#backFromReview").addEventListener("click", () => { pending = []; showStep("input"); });

// ---------- barcode ----------
let scanner = null;
function loadScript(src) {
  return new Promise((res, rej) => {
    if (document.querySelector(`script[src="${src}"]`)) return res();
    const s = document.createElement("script");
    s.src = src;
    s.onload = res;
    s.onerror = rej;
    document.head.appendChild(s);
  });
}
async function stopScanner() {
  if (!scanner) return;
  const s = scanner;
  scanner = null;
  try { await s.stop(); s.clear(); } catch {}
}
$("#scanBtn").addEventListener("click", async () => {
  showStep("scan");
  $("#manualCode").value = "";
  try {
    await loadScript("https://unpkg.com/html5-qrcode@2.3.8/html5-qrcode.min.js");
    const F = window.Html5QrcodeSupportedFormats;
    scanner = new window.Html5Qrcode("reader", {
      formatsToSupport: [F.EAN_13, F.EAN_8, F.UPC_A, F.UPC_E, F.CODE_128],
      experimentalFeatures: { useBarCodeDetectorIfSupported: true },
      verbose: false,
    });
    await scanner.start(
      { facingMode: "environment" },
      { fps: 12, qrbox: (w) => ({ width: Math.min(300, w * 0.85), height: 140 }) },
      (code) => { stopScanner(); lookupBarcode(code); },
      () => {},
    );
  } catch {
    $("#reader").innerHTML = `<p class="muted">Camera not available here. Type the number under the barcode instead.</p>`;
  }
});
$("#backFromScan").addEventListener("click", () => { stopScanner(); showStep("input"); });
$("#lookupBtn").addEventListener("click", () => {
  const code = $("#manualCode").value.replace(/\D/g, "");
  if (code.length < 6) return toast("Enter the full barcode number");
  stopScanner();
  lookupBarcode(code);
});

async function lookupBarcode(code) {
  setLoading(true, `Looking up ${code}…`);
  try {
    const p = await api(`/api/barcode/${code}`);
    const grams = p.servingGrams || 100;
    pending = [{
      name: p.name,
      portion: p.servingSize ? `1 serving (${p.servingSize})` : "100 g",
      grams,
      confidence: p.estimated.length > 10 ? "medium" : "high",
      nutrients: scaleNutrients(p.per100g, grams / 100),
      source: "barcode",
    }];
    showReview(p.notes);
  } catch (err) {
    showStep("input");
    toast(err.message, 5000);
  }
}

// ---------- progress ----------
function renderProgress() {
  // weight
  const ws = [...state.weights].sort((a, b) => a.date.localeCompare(b.date)).slice(-30);
  $("#weightInput").value = state.weights.find((w) => w.date === todayStr())?.kg ?? "";
  if (ws.length >= 2) {
    $("#weightChart").innerHTML = lineChart(ws.map((w) => w.kg), ws.map((w) => w.date.slice(5)));
    const days = (new Date(ws.at(-1).date) - new Date(ws[0].date)) / 864e5 || 1;
    const perWeek = ((ws.at(-1).kg - ws[0].kg) / days) * 7;
    const tip =
      perWeek < 0.1 ? "Gaining slowly or not at all – add ~150-200 kcal/day."
      : perWeek > 0.6 ? "Gaining fast – some may be fat. Consider trimming ~150 kcal/day."
      : "Nice steady lean-gain pace.";
    $("#weightTrend").textContent = `${perWeek >= 0 ? "+" : ""}${perWeek.toFixed(2)} kg/week over ${Math.round(days)} days. ${tip}`;
  } else {
    $("#weightChart").innerHTML = "";
    $("#weightTrend").textContent = "Log your weight a few mornings a week to see your trend.";
  }

  // 14-day calories/protein vs target
  const targets = computeTargets();
  const days = [...Array(14)].map((_, i) => shiftDate(todayStr(), i - 13));
  const rows = days.map((d) => ({ d, t: totalsFor(entriesOn(d)) }));
  $("#historyChart").innerHTML = barChart(
    rows.map((r) => [r.t.calories / targets.calories.goal, r.t.protein / targets.protein.goal]),
    days.map((d) => d.slice(8)),
  );
  const logged = rows.filter((r) => r.t.calories > 0);
  $("#historyAvg").textContent = logged.length
    ? `Average on ${logged.length} logged days: ${r0(logged.reduce((s, r) => s + r.t.calories, 0) / logged.length)} kcal, ${r0(logged.reduce((s, r) => s + r.t.protein, 0) / logged.length)} g protein.`
    : "No days logged yet.";
}

function lineChart(values, labels) {
  const W = 320, H = 120, P = 20;
  const min = Math.min(...values) - 0.5, max = Math.max(...values) + 0.5;
  const x = (i) => P + (i * (W - 2 * P)) / (values.length - 1);
  const y = (v) => H - P - ((v - min) / (max - min)) * (H - 2 * P);
  const pts = values.map((v, i) => `${x(i)},${y(v)}`).join(" ");
  return `<svg viewBox="0 0 ${W} ${H}">
    <polyline points="${pts}" fill="none" stroke="var(--accent)" stroke-width="2.5" stroke-linejoin="round"/>
    ${values.map((v, i) => `<circle cx="${x(i)}" cy="${y(v)}" r="2.5" fill="var(--accent)"/>`).join("")}
    <text x="${P}" y="${H - 4}">${labels[0]}</text><text x="${W - P}" y="${H - 4}" text-anchor="end">${labels.at(-1)}</text>
    <text x="2" y="${y(max - 0.5) + 3}">${(max - 0.5).toFixed(1)}</text><text x="2" y="${y(min + 0.5) + 3}">${(min + 0.5).toFixed(1)}</text>
  </svg>`;
}

function barChart(pairs, labels) {
  const W = 320, H = 130, P = 16, top = 1.3;
  const slot = (W - P) / pairs.length;
  const bw = slot / 2 - 2;
  const y = (v) => H - P - (Math.min(v, top) / top) * (H - P - 6);
  const goalY = y(1);
  let bars = "";
  pairs.forEach(([c, p], i) => {
    const x0 = P + i * slot;
    bars += `<rect x="${x0}" y="${y(c)}" width="${bw}" height="${H - P - y(c)}" rx="2" fill="var(--accent-2)"/>`;
    bars += `<rect x="${x0 + bw + 1}" y="${y(p)}" width="${bw}" height="${H - P - y(p)}" rx="2" fill="var(--accent)"/>`;
    if (i % 2 === 1 || i === pairs.length - 1) bars += `<text x="${x0 + slot / 2}" y="${H - 3}" text-anchor="middle">${labels[i]}</text>`;
  });
  return `<svg viewBox="0 0 ${W} ${H}">${bars}
    <line x1="${P}" x2="${W}" y1="${goalY}" y2="${goalY}" stroke="var(--muted)" stroke-dasharray="4 3"/>
    <text x="0" y="${goalY + 3}">100%</text></svg>`;
}

$("#saveWeight").addEventListener("click", () => {
  const kg = Number($("#weightInput").value);
  if (!(kg > 20)) return toast("Enter your weight in kg");
  state.weights = state.weights.filter((w) => w.date !== todayStr());
  state.weights.push({ date: todayStr(), kg });
  state.profile.weight = kg; // keep targets in step with body weight
  save();
  renderProgress();
  toast("Weight saved – targets updated");
});

// ---------- settings ----------
function fillProfileForm() {
  const f = $("#profileForm");
  const p = { style: "performance", sex: "male", activity: "1.55", surplus: "400", proteinPerKg: "2.0", ...state.profile };
  for (const el of f.elements) if (el.name && p[el.name] != null) el.value = p[el.name];
  renderTargetsPreview();
  $("#pwInput").value = state.password || "";
}
function readProfileForm() {
  const p = {};
  for (const el of $("#profileForm").elements) if (el.name) p[el.name] = el.value;
  return p;
}
function renderTargetsPreview() {
  const t = computeTargets({ ...state.profile, ...readProfileForm() });
  $("#targetsPreview").innerHTML = `
    <div>Maintenance<b>${t._tdee} kcal</b></div><div>Daily target<b>${t.calories.goal} kcal</b></div>
    <div>Protein<b>${t.protein.goal} g</b></div><div>Carbs<b>${t.carbs.goal} g</b></div>
    <div>Fat<b>${t.fat.goal} g</b></div><div>Fiber<b>${t.fiber.goal} g</b></div>`;
}
$("#profileForm").addEventListener("input", renderTargetsPreview);
$("#profileForm").addEventListener("submit", (e) => {
  e.preventDefault();
  state.profile = { ...state.profile, ...readProfileForm() };
  save();
  toast("Goal saved");
  go("today");
});
$("#savePw").addEventListener("click", () => {
  state.password = $("#pwInput").value;
  save();
  toast("Password saved");
});
$("#exportBtn").addEventListener("click", () => {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `fuel-tracker-${todayStr()}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
});
$("#importInput").addEventListener("change", async (e) => {
  try {
    const data = JSON.parse(await e.target.files[0].text());
    if (!Array.isArray(data.entries)) throw new Error();
    if (!confirm(`Replace current data with backup (${data.entries.length} entries)?`)) return;
    state = { profile: {}, weights: [], password: state.password, ...data };
    save();
    fillProfileForm();
    renderToday();
    toast("Backup restored");
  } catch {
    toast("That file isn't a valid backup");
  }
});

// ---------- navigation ----------
function go(view) {
  $$(".view").forEach((v) => v.classList.toggle("active", v.id === `view-${view}`));
  $$(".tabs button").forEach((b) => b.classList.toggle("active", b.dataset.goto === view));
  $(".top").style.visibility = view === "today" ? "visible" : "hidden";
  $("#addBtn").hidden = view === "settings";
  if (view === "today") renderToday();
  if (view === "progress") renderProgress();
  if (view === "settings") fillProfileForm();
  window.scrollTo(0, 0);
}
document.addEventListener("click", (e) => {
  const b = e.target.closest("[data-goto]");
  if (b) go(b.dataset.goto);
});
$("#prevDay").addEventListener("click", () => { currentDate = shiftDate(currentDate, -1); renderToday(); });
$("#nextDay").addEventListener("click", () => {
  if (currentDate < todayStr()) currentDate = shiftDate(currentDate, 1);
  renderToday();
});

// ---------- boot ----------
(async () => {
  try {
    const cfg = await api("/api/config");
    NUTRIENTS = cfg.nutrients;
  } catch {
    toast("Can't reach the server.");
    return;
  }
  renderToday();
  if (!hasProfile()) go("settings");
})();
