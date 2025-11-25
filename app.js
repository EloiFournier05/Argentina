const STORAGE_KEY = 'projet-argentine-state';
const TYPES_SPORT = ['natation', 'kine', 'maison', 'running', 'foot', 'padel', 'autre'];
const TYPES_REPAS = ['petit_dej', 'dejeuner', 'diner', 'snack'];

const state = {
  sportSessions: [],
  meals: [],
};

let sportChart = null;
let nutritionChart = null;
const THEMES = {
  dashboard: 'theme-dashboard',
  sport: 'theme-sport',
  nutrition: 'theme-nutrition'
};

// ---------- Storage helpers ----------
function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      state.sportSessions = parsed.sportSessions || [];
      state.meals = parsed.meals || [];
    }
  } catch (err) {
    console.error('Erreur de chargement localStorage', err);
  }
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

// ---------- Date helpers ----------
function getWeekBounds(date = new Date()) {
  const current = new Date(date);
  const day = current.getDay();
  const diffToMonday = (day === 0 ? -6 : 1) - day; // Monday = 1, Sunday = 0
  const start = new Date(current);
  start.setDate(current.getDate() + diffToMonday);
  start.setHours(0, 0, 0, 0);

  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  end.setHours(23, 59, 59, 999);

  return { start, end };
}

function isDateInRange(date, start, end) {
  return date >= start && date <= end;
}

function formatDate(d) {
  return new Date(d).toLocaleDateString('fr-FR');
}

function formatDateTime(dt) {
  return new Date(dt).toLocaleString('fr-FR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit'
  });
}

// ---------- Computations ----------
function computeSportWeeklyStats() {
  const { start, end } = getWeekBounds();
  const weeklySessions = state.sportSessions.filter(s => {
    const d = new Date(s.date);
    return isDateInRange(d, start, end);
  });

  const totalMinutes = weeklySessions.reduce((acc, s) => acc + Number(s.dureeMinutes || 0), 0);
  const totalLoad = weeklySessions.reduce((acc, s) => acc + Number(s.dureeMinutes || 0) * Number(s.intensite || 0), 0);
  const perType = TYPES_SPORT.reduce((acc, type) => {
    acc[type] = weeklySessions
      .filter(s => s.type === type)
      .reduce((sum, s) => sum + Number(s.dureeMinutes || 0), 0);
    return acc;
  }, {});

  const shoulderIssues = weeklySessions.filter(s => s.epaule === 'gene' || s.epaule === 'douleur');
  const shoulderPct = weeklySessions.length
    ? Math.round((shoulderIssues.length / weeklySessions.length) * 100)
    : 0;

  return {
    weeklySessions,
    totalMinutes,
    totalLoad,
    perType,
    shoulderIssuesCount: shoulderIssues.length,
    shoulderPct,
  };
}

function computeNutritionStats() {
  const { start, end } = getWeekBounds();
  const weeklyMeals = state.meals.filter(m => {
    const d = new Date(m.dateTime);
    return isDateInRange(d, start, end);
  });

  const weeklyAverage = weeklyMeals.length
    ? (weeklyMeals.reduce((acc, m) => acc + Number(m.noteQualite || 0), 0) / weeklyMeals.length)
    : 0;

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayAverageList = state.meals.filter(m => {
    const d = new Date(m.dateTime);
    d.setHours(0, 0, 0, 0);
    return d.getTime() === today.getTime();
  });
  const todayAverage = todayAverageList.length
    ? (todayAverageList.reduce((acc, m) => acc + Number(m.noteQualite || 0), 0) / todayAverageList.length)
    : 0;

  return { weeklyMeals, weeklyAverage, todayAverage };
}

function nutritionDailyAveragesLast7Days() {
  const days = [];
  for (let i = 6; i >= 0; i -= 1) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    d.setHours(0, 0, 0, 0);
    const dayMeals = state.meals.filter(m => {
      const md = new Date(m.dateTime);
      md.setHours(0, 0, 0, 0);
      return md.getTime() === d.getTime();
    });
    const avg = dayMeals.length
      ? dayMeals.reduce((acc, m) => acc + Number(m.noteQualite || 0), 0) / dayMeals.length
      : 0;
    days.push({ date: new Date(d), avg });
  }
  return days;
}

// ---------- Rendering ----------
function updateDashboard() {
  const sportStats = computeSportWeeklyStats();
  const nutritionStats = computeNutritionStats();

  const summaryText = `${sportStats.weeklySessions.length} séance${sportStats.weeklySessions.length > 1 ? 's' : ''} · ${sportStats.totalMinutes} min · Charge ${sportStats.totalLoad}`;
  document.getElementById('sport-summary-text').textContent = summaryText;

  const shoulderText = `${sportStats.shoulderIssuesCount} séance${sportStats.shoulderIssuesCount > 1 ? 's' : ''} sensible (${sportStats.shoulderPct}%)`;
  document.getElementById('shoulder-text').textContent = shoulderText;
  const comment = sportStats.shoulderPct <= 10
    ? 'Rien d\'alarmant'
    : sportStats.shoulderPct <= 30
      ? 'À surveiller'
      : 'Attention, en parler au kiné';
  document.getElementById('shoulder-comment').textContent = comment;

  const nutritionText = `${nutritionStats.weeklyAverage.toFixed(1)} / 5`;
  document.getElementById('nutrition-text').textContent = nutritionText;
}

function renderSportList() {
  const listEl = document.getElementById('sport-list');
  const sorted = [...state.sportSessions].sort((a, b) => new Date(b.date) - new Date(a.date)).slice(0, 10);

  if (!sorted.length) {
    listEl.innerHTML = '<p class="comment">Pas encore de séance. Ajoute-en une !</p>';
    return;
  }

  listEl.innerHTML = '';
  sorted.forEach(session => {
    const badgeClass = session.epaule === 'OK' ? 'ok' : session.epaule === 'gene' ? 'warn' : 'danger';
    const item = document.createElement('div');
    item.className = 'list-item';
    item.innerHTML = `
      <header>
        <span>${formatDate(session.date)} · ${session.type}</span>
        <span class="badge ${badgeClass}">${session.epaule}</span>
      </header>
      <div class="meta">${session.dureeMinutes} min · Intensité ${session.intensite}</div>
      ${session.commentaire ? `<div>${session.commentaire}</div>` : ''}
    `;
    listEl.appendChild(item);
  });

  const stats = computeSportWeeklyStats();
  document.getElementById('sport-week-summary').textContent = `${stats.weeklySessions.length} séance${stats.weeklySessions.length > 1 ? 's' : ''} cette semaine · ${stats.totalMinutes} minutes`;
}

function renderMealList() {
  const listEl = document.getElementById('meal-list');
  const sorted = [...state.meals].sort((a, b) => new Date(b.dateTime) - new Date(a.dateTime)).slice(0, 20);

  if (!sorted.length) {
    listEl.innerHTML = '<p class="comment">Pas encore de repas enregistré.</p>';
    return;
  }

  listEl.innerHTML = '';
  sorted.forEach(meal => {
    const item = document.createElement('div');
    item.className = 'list-item';
    item.innerHTML = `
      <header>
        <span>${formatDate(meal.dateTime)} · ${meal.typeRepas}</span>
        <span class="badge ${meal.noteQualite >= 4 ? 'ok' : meal.noteQualite >= 2 ? 'warn' : 'danger'}">${meal.noteQualite}/5</span>
      </header>
      ${meal.commentaire ? `<div>${meal.commentaire}</div>` : '<div class="meta">Sans commentaire</div>'}
    `;
    listEl.appendChild(item);
  });

  const stats = computeNutritionStats();
  document.getElementById('nutrition-week-summary').textContent = `Moyenne semaine: ${stats.weeklyAverage.toFixed(1)} / 5 · Aujourd'hui: ${stats.todayAverage.toFixed(1)} / 5`;
}

function renderCharts() {
  const sportCtx = document.getElementById('sportChart').getContext('2d');
  const nutritionCtx = document.getElementById('nutritionChart').getContext('2d');
  const sportStats = computeSportWeeklyStats();
  const nutritionDays = nutritionDailyAveragesLast7Days();

  if (sportChart) sportChart.destroy();
  if (nutritionChart) nutritionChart.destroy();

  sportChart = new Chart(sportCtx, {
    type: 'bar',
    data: {
      labels: TYPES_SPORT,
      datasets: [{
        label: 'Minutes',
        data: TYPES_SPORT.map(t => sportStats.perType[t] || 0),
        backgroundColor: 'rgba(34, 211, 238, 0.5)',
        borderColor: 'rgba(34, 211, 238, 0.9)',
        borderWidth: 2,
      }]
    },
    options: {
      plugins: { legend: { display: false } },
      scales: { y: { beginAtZero: true } }
    }
  });

  nutritionChart = new Chart(nutritionCtx, {
    type: 'line',
    data: {
      labels: nutritionDays.map(d => d.date.toLocaleDateString('fr-FR', { weekday: 'short' })),
      datasets: [{
        label: 'Qualité moyenne',
        data: nutritionDays.map(d => Number(d.avg.toFixed(2))),
        borderColor: 'rgba(167, 139, 250, 0.9)',
        backgroundColor: 'rgba(167, 139, 250, 0.25)',
        tension: 0.2,
        fill: true,
      }]
    },
    options: {
      plugins: { legend: { display: false } },
      scales: { y: { suggestedMin: 0, suggestedMax: 5 } }
    }
  });
}

function renderAll() {
  updateDashboard();
  renderSportList();
  renderMealList();
  renderCharts();
}

// ---------- Tabs ----------
function setupTabs() {
  const buttons = document.querySelectorAll('.tab-button');
  buttons.forEach(btn => {
    btn.addEventListener('click', () => {
      const tab = btn.dataset.tab;
      document.querySelectorAll('.tab-button').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.tab-content').forEach(section => section.classList.remove('active'));

      btn.classList.add('active');
      document.getElementById(tab).classList.add('active');
      applyTheme(tab);
    });
  });
}

function applyTheme(tab) {
  document.body.classList.remove(...Object.values(THEMES));
  const themeClass = THEMES[tab];
  if (themeClass) document.body.classList.add(themeClass);
}

// ---------- Forms ----------
function setupForms() {
  const sportForm = document.getElementById('sport-form');
  sportForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const formData = new FormData(sportForm);
    const date = formData.get('date');
    const type = formData.get('type');
    const dureeMinutes = parseInt(formData.get('dureeMinutes'), 10);
    const intensite = parseInt(formData.get('intensite'), 10);
    const epaule = formData.get('epaule');

    if (!date || !type || !dureeMinutes || !intensite || !epaule) {
      alert('Merci de compléter les champs obligatoires.');
      return;
    }

    state.sportSessions.push({
      id: crypto.randomUUID(),
      date,
      type,
      dureeMinutes,
      intensite,
      epaule,
      commentaire: formData.get('commentaire').trim(),
    });

    saveState();
    renderAll();
    sportForm.reset();
  });

  const mealForm = document.getElementById('meal-form');
  mealForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const formData = new FormData(mealForm);
    const dateTime = formData.get('dateTime');
    const typeRepas = formData.get('typeRepas');
    const noteQualite = parseInt(formData.get('noteQualite'), 10);

    if (!dateTime || !typeRepas || !noteQualite) {
      alert('Merci de compléter les champs obligatoires.');
      return;
    }

    state.meals.push({
      id: crypto.randomUUID(),
      dateTime,
      typeRepas,
      noteQualite,
      commentaire: formData.get('commentaire').trim(),
    });

    saveState();
    renderAll();
    mealForm.reset();
  });
}

// ---------- Init ----------
function init() {
  loadState();
  setupTabs();
  setupForms();
  applyTheme('dashboard');
  renderAll();
}

document.addEventListener('DOMContentLoaded', init);
