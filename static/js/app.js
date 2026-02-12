// ===== State =====
let appData = {};
let activeWorkout = null; // { program, exercises: [{name, weight, sets, reps, completed: []}], startTime }
let timerState = {
  mode: "countdown", // "countdown" | "stopwatch"
  running: false,
  seconds: 0,
  countdownFrom: 180, // default 3 min
  interval: null,
  alertPlayed: false,
  overtime: false, // countdown expired, now counting up
  overtimeSeconds: 0,
};

// ===== Init =====
document.addEventListener("DOMContentLoaded", async () => {
  await fetchData();
  renderDashboard();
  renderHistory();
  setupNav();
  setupTimer();
});

async function fetchData() {
  const res = await fetch("/api/data");
  appData = await res.json();
}

// ===== Navigation =====
function setupNav() {
  document.querySelectorAll(".nav-tab").forEach((tab) => {
    tab.addEventListener("click", () => {
      const target = tab.dataset.view;
      document.querySelectorAll(".nav-tab").forEach((t) => t.classList.remove("active"));
      tab.classList.add("active");
      document.querySelectorAll(".view").forEach((v) => v.classList.remove("active"));
      document.getElementById(target).classList.add("active");
    });
  });
}

function switchToView(viewId) {
  document.querySelectorAll(".nav-tab").forEach((t) => {
    t.classList.toggle("active", t.dataset.view === viewId);
  });
  document.querySelectorAll(".view").forEach((v) => {
    v.classList.toggle("active", v.id === viewId);
  });
}

// ===== Dashboard =====
function renderDashboard() {
  const container = document.getElementById("dashboard-exercises");
  container.innerHTML = "";

  // Get exercise order from the program
  const prog = Object.values(appData.programs)[0];
  const orderedNames = prog ? prog.exercises : Object.keys(appData.exercises);

  for (const exName of orderedNames) {
    const ex = appData.exercises[exName];
    if (!ex) continue;
    const warmups = appData.warmup.percentages.map(
      (pct) => `${Math.round((ex.current_weight * pct) / 100 / 5) * 5} lbs @ ${pct}%`
    );

    const card = document.createElement("div");
    card.className = "exercise-card";
    card.innerHTML = `
      <div class="exercise-name">${exName}</div>
      <div class="exercise-meta">${ex.default_sets} sets &times; ${ex.default_reps} reps</div>
      <div class="exercise-weight-row">
        <div>
          <span class="weight-display">${ex.current_weight}</span>
          <span class="weight-unit">lbs</span>
        </div>
        <div class="weight-controls">
          <button class="btn btn-icon" onclick="adjustWeight('${exName}', 'decrement')" title="−5 lbs">&minus;</button>
          <button class="btn btn-icon" onclick="adjustWeight('${exName}', 'increment')" title="+5 lbs">&plus;</button>
        </div>
      </div>
      <div class="warmup-info">
        ${warmups.map((w) => `<span><span class="warmup-label">Warmup:</span> ${w}</span>`).join("")}
      </div>
      ${renderBarbellHTML(ex.current_weight)}
    `;
    container.appendChild(card);
  }
}

async function adjustWeight(name, direction) {
  const res = await fetch(`/api/exercise/${encodeURIComponent(name)}/${direction}`, {
    method: "POST",
  });
  const result = await res.json();
  appData.exercises[name].current_weight = result.new_weight;
  renderDashboard();
  if (activeWorkout) renderActiveWorkout();
}

// ===== Start Workout =====
function showProgramSelect() {
  // Single program — start immediately, no selection needed
  const [key, prog] = Object.entries(appData.programs)[0];
  startWorkout(key);
}

function startWorkout(programKey) {
  const prog = appData.programs[programKey];
  activeWorkout = {
    program: programKey,
    programName: prog.name,
    exercises: prog.exercises.map((name) => {
      const ex = appData.exercises[name];
      return {
        name,
        weight: ex.current_weight,
        sets: ex.default_sets,
        reps: ex.default_reps,
        completed: [],
      };
    }),
    startTime: Date.now(),
    currentExercise: 0,
  };
  switchToView("view-workout");
  renderActiveWorkout();
  showTimer();
}

function renderActiveWorkout() {
  const container = document.getElementById("workout-content");
  const elapsed = activeWorkout ? Math.floor((Date.now() - activeWorkout.startTime) / 1000) : 0;
  const elapsedStr = formatTime(elapsed);

  let html = `
    <div class="section-header">
      <h2>${activeWorkout.programName}</h2>
      <span style="color: var(--text-muted); font-size: 0.85rem;">${elapsedStr}</span>
    </div>
  `;

  activeWorkout.exercises.forEach((ex, ei) => {
    const isCurrent = ei === activeWorkout.currentExercise;
    const isDone = ex.completed.length >= ex.sets;
    const warmups = appData.warmup.percentages.map(
      (pct) => Math.round((ex.weight * pct) / 100 / 5) * 5
    );

    html += `
      <div class="workout-exercise ${isCurrent ? "current" : ""} ${isDone ? "done" : ""}">
        <div style="display:flex; justify-content:space-between; align-items:center;">
          <div>
            <div class="exercise-name">${ex.name}</div>
            <div class="exercise-meta">
              <span class="weight-display" style="font-size:1.3rem;">${ex.weight}</span>
              <span class="weight-unit">lbs</span>
              &nbsp;&middot;&nbsp; ${ex.sets} &times; ${ex.reps}
            </div>
          </div>
          <div class="weight-controls">
            <button class="btn btn-icon btn-sm" onclick="adjustWorkoutWeight(${ei}, -5)" style="width:32px;height:32px;font-size:1rem;">&minus;</button>
            <button class="btn btn-icon btn-sm" onclick="adjustWorkoutWeight(${ei}, 5)" style="width:32px;height:32px;font-size:1rem;">&plus;</button>
          </div>
        </div>
        <div style="font-size:0.75rem; color:var(--text-muted); margin-top:4px;">
          Warmups: ${warmups.map((w, i) => `${w} lbs @ ${appData.warmup.percentages[i]}%`).join(" &rarr; ")} &rarr; <strong style="color:var(--primary)">${ex.weight} lbs</strong>
        </div>
        ${renderBarbellHTML(ex.weight)}
        <div class="sets-tracker">
          ${Array.from({ length: ex.sets }, (_, si) => {
            const completed = si < ex.completed.length;
            const isNext = si === ex.completed.length && isCurrent;
            return `<button class="set-btn ${completed ? "completed" : ""} ${isNext ? "active" : ""}"
              onclick="toggleSet(${ei}, ${si})">${si + 1}</button>`;
          }).join("")}
        </div>
      </div>
    `;
  });

  html += `
    <div style="margin-top: 20px; display: flex; gap: 8px;">
      <button class="btn btn-danger btn-block" onclick="cancelWorkout()">Cancel</button>
      <button class="btn btn-success btn-block" onclick="finishWorkout()">Finish Workout</button>
    </div>
  `;

  container.innerHTML = html;
}

function adjustWorkoutWeight(exerciseIdx, delta) {
  const ex = activeWorkout.exercises[exerciseIdx];
  ex.weight = Math.max(0, ex.weight + delta);
  renderActiveWorkout();
}

function toggleSet(exerciseIdx, setIdx) {
  const ex = activeWorkout.exercises[exerciseIdx];
  if (setIdx < ex.completed.length) {
    // Un-complete this set
    ex.completed = ex.completed.slice(0, setIdx);
  } else if (setIdx === ex.completed.length) {
    // Complete this set
    ex.completed.push({ reps: ex.reps, timestamp: Date.now() });

    // Auto-advance current exercise if all sets done
    if (ex.completed.length >= ex.sets) {
      const nextIdx = activeWorkout.exercises.findIndex(
        (e, i) => i > exerciseIdx && e.completed.length < e.sets
      );
      if (nextIdx >= 0) activeWorkout.currentExercise = nextIdx;
    }

    // Auto-start timer
    resetTimer();
    startTimer();
  }
  renderActiveWorkout();
}

async function finishWorkout() {
  if (!activeWorkout) return;
  const duration = Math.floor((Date.now() - activeWorkout.startTime) / 1000);
  const entry = {
    date: new Date().toISOString().split("T")[0],
    program: activeWorkout.programName,
    duration_seconds: duration,
    exercises: activeWorkout.exercises.map((ex) => ({
      name: ex.name,
      weight: ex.weight,
      sets: ex.completed.length,
      reps: ex.reps,
    })),
    notes: "",
  };

  await fetch("/api/workout", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(entry),
  });

  // Update current weights to match workout weights
  for (const ex of activeWorkout.exercises) {
    if (ex.weight !== appData.exercises[ex.name]?.current_weight) {
      await fetch(`/api/exercise/${encodeURIComponent(ex.name)}/weight`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ weight: ex.weight }),
      });
    }
  }

  showSummary(entry, duration);
  activeWorkout = null;
  hideTimer();
  await fetchData();
  renderDashboard();
  renderHistory();
}

function cancelWorkout() {
  if (confirm("Cancel this workout? Progress will be lost.")) {
    activeWorkout = null;
    hideTimer();
    stopTimer();
    switchToView("view-dashboard");
  }
}

function showSummary(entry, duration) {
  const modal = document.getElementById("summary-modal");
  const content = document.getElementById("summary-content");
  content.innerHTML = `
    <p style="color: var(--text-muted); margin-bottom: 12px;">
      Duration: ${formatTime(duration)}
    </p>
    <table style="width:100%; border-collapse:collapse;">
      ${entry.exercises
        .map(
          (ex) => `
        <tr>
          <td style="padding:4px 0; font-weight:500;">${ex.name}</td>
          <td style="padding:4px 0; text-align:right; color:var(--primary); font-weight:600;">
            ${ex.weight} lbs &times; ${ex.sets}/${appData.exercises[ex.name]?.default_sets || "?"} sets
          </td>
        </tr>
      `
        )
        .join("")}
    </table>
  `;
  modal.classList.add("visible");
}

function closeSummary() {
  document.getElementById("summary-modal").classList.remove("visible");
  switchToView("view-dashboard");
}

// ===== Timer =====
function setupTimer() {
  document.querySelectorAll(".timer-mode-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      timerState.mode = btn.dataset.mode;
      document.querySelectorAll(".timer-mode-btn").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      stopTimer();
      resetTimer();
      updatePresetVisibility();
    });
  });

  document.querySelectorAll(".preset-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      timerState.countdownFrom = parseInt(btn.dataset.seconds);
      document.querySelectorAll(".preset-btn").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      stopTimer();
      resetTimer();
    });
  });

  updateTimerDisplay();
  updatePresetVisibility();
}

function updatePresetVisibility() {
  const presets = document.querySelector(".timer-presets");
  if (presets) {
    presets.style.display = timerState.mode === "countdown" ? "flex" : "none";
  }
}

function showTimer() {
  document.querySelector(".timer-container").classList.add("visible");
}

function hideTimer() {
  document.querySelector(".timer-container").classList.remove("visible");
  stopTimer();
}

function startTimer() {
  if (timerState.running) return;
  timerState.running = true;
  timerState.alertPlayed = false;
  timerState.overtime = false;
  timerState.overtimeSeconds = 0;
  if (timerState.mode === "countdown") {
    timerState.seconds = timerState.countdownFrom;
  }
  timerState.interval = setInterval(tick, 1000);
  updateTimerDisplay();
}

function stopTimer() {
  timerState.running = false;
  if (timerState.interval) {
    clearInterval(timerState.interval);
    timerState.interval = null;
  }
  updateTimerDisplay();
}

function resetTimer() {
  stopTimer();
  timerState.seconds = timerState.mode === "countdown" ? timerState.countdownFrom : 0;
  timerState.alertPlayed = false;
  timerState.overtime = false;
  timerState.overtimeSeconds = 0;
  updateTimerDisplay();
}

function toggleTimer() {
  if (timerState.running) {
    stopTimer();
  } else {
    startTimer();
  }
}

function tick() {
  if (timerState.mode === "countdown") {
    if (timerState.overtime) {
      // Already expired — count up in overtime
      timerState.overtimeSeconds++;
    } else {
      timerState.seconds--;
      if (timerState.seconds <= 0) {
        timerState.seconds = 0;
        timerState.overtime = true;
        timerState.overtimeSeconds = 0;
        if (!timerState.alertPlayed) {
          timerState.alertPlayed = true;
          playAlert();
        }
      }
    }
  } else {
    timerState.seconds++;
  }
  updateTimerDisplay();
}

function updateTimerDisplay() {
  const display = document.getElementById("timer-display");
  if (!display) return;

  if (timerState.overtime) {
    // Show overtime as "+MM:SS" with warning style
    display.textContent = "+" + formatTime(timerState.overtimeSeconds);
    display.classList.remove("alert");
    display.classList.add("overtime");
  } else {
    display.textContent = formatTime(timerState.seconds);
    display.classList.remove("overtime");
    display.classList.remove("alert");
  }

  const startStopBtn = document.getElementById("timer-start-stop");
  if (startStopBtn) {
    startStopBtn.textContent = timerState.running ? "Stop" : "Start";
    startStopBtn.className = `btn ${timerState.running ? "btn-danger" : "btn-primary"}`;
  }
}

function playAlert() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    // Play 3 short beeps
    [0, 0.2, 0.4].forEach((delay) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.value = 880;
      osc.type = "sine";
      gain.gain.value = 0.3;
      osc.start(ctx.currentTime + delay);
      osc.stop(ctx.currentTime + delay + 0.15);
    });
  } catch (e) {
    // Fallback: vibrate if available
    if (navigator.vibrate) navigator.vibrate([200, 100, 200, 100, 200]);
  }
}

// ===== History =====
function renderHistory() {
  const container = document.getElementById("history-list");
  const history = appData.history || [];

  if (history.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="icon">&#128221;</div>
        <p>No workouts logged yet.<br>Start a workout to see your history here.</p>
      </div>`;
    return;
  }

  container.innerHTML = history
    .slice(0, 50)
    .map(
      (entry) => `
    <div class="history-entry">
      <div class="history-date">${formatDate(entry.date)} ${entry.program ? `&mdash; ${entry.program}` : ""}</div>
      <div class="history-exercises">
        <table>
          ${(entry.exercises || [])
            .map(
              (ex) => `<tr>
              <td>${ex.name}</td>
              <td>${ex.weight} lbs &times; ${ex.sets} sets</td>
            </tr>`
            )
            .join("")}
        </table>
      </div>
      ${entry.notes ? `<div class="history-notes">${entry.notes}</div>` : ""}
      ${entry.duration_seconds ? `<div class="history-duration">${formatTime(entry.duration_seconds)}</div>` : ""}
    </div>
  `
    )
    .join("");
}

// ===== Plate Calculator =====
const BAR_WEIGHT = 45;
// Total plates owned (both sides combined). Per-side = half these counts.
const PLATE_INVENTORY = { 45: 2, 35: 2, 25: 4, 10: 4, 5: 2, 2.5: 2 };
const PLATE_ORDER = [45, 35, 25, 10, 5, 2.5];
const PLATE_STYLES = {
  45:   { color: "#3b82f6", height: 38, label: "45" },
  35:   { color: "#eab308", height: 34, label: "35" },
  25:   { color: "#22c55e", height: 30, label: "25" },
  10:   { color: "#e2e8f0", height: 24, label: "10" },
  5:    { color: "#ef4444", height: 18, label: "5" },
  2.5:  { color: "#94a3b8", height: 14, label: "2.5" },
};

function calcPlatesPerSide(totalWeight) {
  let remaining = (totalWeight - BAR_WEIGHT) / 2;
  if (remaining <= 0) return [];
  const plates = [];
  // Max per side is half the total inventory
  const maxPerSide = {};
  for (const p of PLATE_ORDER) {
    maxPerSide[p] = Math.floor((PLATE_INVENTORY[p] || 0) / 2);
  }
  for (const plate of PLATE_ORDER) {
    let used = 0;
    while (remaining >= plate - 0.01 && used < maxPerSide[plate]) {
      plates.push(plate);
      remaining -= plate;
      used++;
    }
  }
  return plates;
}

function renderBarbellHTML(totalWeight) {
  if (totalWeight <= BAR_WEIGHT) {
    return `<div class="barbell-diagram"><div class="barbell-empty">Bar only (${BAR_WEIGHT} lbs)</div></div>`;
  }
  const plates = calcPlatesPerSide(totalWeight);
  if (plates.length === 0) {
    return `<div class="barbell-diagram"><div class="barbell-empty">Bar only (${BAR_WEIGHT} lbs)</div></div>`;
  }

  // Build left side (reversed so largest is nearest center) and right side
  const leftPlates = [...plates].reverse();
  const rightPlates = plates;

  function plateHTML(p) {
    const s = PLATE_STYLES[p];
    return `<div class="plate" style="height:${s.height}px; background:${s.color};" title="${p} lbs"><span class="plate-label">${s.label}</span></div>`;
  }

  const leftHTML = leftPlates.map(plateHTML).join("");
  const rightHTML = rightPlates.map(plateHTML).join("");

  return `
    <div class="barbell-diagram">
      <div class="barbell-plates barbell-left">${leftHTML}</div>
      <div class="barbell-collar-left"></div>
      <div class="barbell-bar"><span class="bar-label">${BAR_WEIGHT}</span></div>
      <div class="barbell-collar-right"></div>
      <div class="barbell-plates barbell-right">${rightHTML}</div>
    </div>
    <div class="plate-summary">Each side: ${plates.map(p => p + " lb").join(" + ")}</div>
  `;
}

// ===== Utilities =====
function formatTime(totalSeconds) {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
}

function formatDate(dateStr) {
  if (!dateStr) return "";
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}
