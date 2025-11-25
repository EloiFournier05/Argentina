// ------------------------------------------------------------
// Supabase setup
// 1) Renseigne SUPABASE_URL et SUPABASE_ANON_KEY avec les valeurs
//    copiées depuis ton projet Supabase (Settings > API).
// 2) Les tables et politiques RLS à créer sur Supabase (copier/coller) :
//
// CREATE TABLE public.sport_sessions (
//   id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
//   user_id uuid REFERENCES auth.users(id) NOT NULL,
//   date date NOT NULL,
//   type text NOT NULL,
//   duree_minutes integer NOT NULL,
//   intensite integer NOT NULL,
//   epaule text NOT NULL,
//   commentaire text,
//   created_at timestamptz DEFAULT now()
// );
//
// CREATE TABLE public.meals (
//   id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
//   user_id uuid REFERENCES auth.users(id) NOT NULL,
//   datetime timestamptz NOT NULL,
//   type_repas text NOT NULL,
//   note_qualite integer NOT NULL,
//   commentaire text,
//   created_at timestamptz DEFAULT now()
// );
//
// -- Activer RLS
// ALTER TABLE public.sport_sessions ENABLE ROW LEVEL SECURITY;
// ALTER TABLE public.meals ENABLE ROW LEVEL SECURITY;
//
// -- Politique : un utilisateur ne voit que ses lignes
// CREATE POLICY "Users can manage their sport sessions" ON public.sport_sessions
//   FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
//
// CREATE POLICY "Users can manage their meals" ON public.meals
//   FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
// ------------------------------------------------------------

const SUPABASE_URL = 'https://YOUR-PROJECT-URL.supabase.co'; // <-- remplace ici
const SUPABASE_ANON_KEY = 'YOUR-ANON-KEY'; // <-- remplace ici

// Initialise le client Supabase (colle ici l'URL et la clé publique de ton projet)
const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const TYPES_SPORT = ['natation', 'kine', 'maison', 'running', 'foot', 'padel', 'autre'];
const TYPES_REPAS = ['petit_dej', 'dejeuner', 'diner', 'snack'];
const DEFAULT_OBJECTIVES = {
  weeklySessionsTarget: 4,
  weeklyMinutesTarget: 200,
  weeklyNutritionTarget: 3.5,
};
const OBJECTIVES_STORAGE_KEY = 'argentine_objectives';

const state = {
  currentUser: null,
  sportSessions: [],
  meals: [],
  objectives: { ...DEFAULT_OBJECTIVES },
};

let sportChart = null;
let nutritionChart = null;
const THEMES = {
  dashboard: 'theme-dashboard',
  sport: 'theme-sport',
  nutrition: 'theme-nutrition'
};

// ---------- Auth helpers ----------
function showAuthMessage(message, isError = false) {
  const msgEl = document.getElementById('auth-message');
  msgEl.textContent = message || '';
  msgEl.classList.toggle('error', !!isError);
}

async function signUp(email, password) {
  return supabase.auth.signUp({ email, password });
}

async function signIn(email, password) {
  return supabase.auth.signInWithPassword({ email, password });
}

async function signOut() {
  await supabase.auth.signOut();
}

function toggleVisibility(isLoggedIn) {
  const appShell = document.getElementById('app-shell');
  const authContainer = document.getElementById('auth-container');
  const footer = document.querySelector('.app-footer');
  const subtitle = document.querySelector('.subtitle');
  const logoutBtn = document.getElementById('logout-btn');

  if (isLoggedIn) {
    appShell.classList.remove('hidden');
    authContainer.classList.add('hidden');
    footer.classList.remove('hidden');
    subtitle?.classList.remove('hidden');
    logoutBtn.style.display = 'inline-flex';
  } else {
    appShell.classList.add('hidden');
    authContainer.classList.remove('hidden');
    footer.classList.add('hidden');
    subtitle?.classList.add('hidden');
    logoutBtn.style.display = 'none';
  }
}

async function applySession(user) {
  state.currentUser = user;
  toggleVisibility(!!user);
  if (user) {
    showAuthMessage(`Connecté en tant que ${user.email}`);
    await fetchAllData();
    renderAll();
  } else {
    state.sportSessions = [];
    state.meals = [];
    renderAll();
  }
}

async function checkSessionOnLoad() {
  const { data } = await supabase.auth.getSession();
  await applySession(data?.session?.user || null);

  supabase.auth.onAuthStateChange(async (_event, session) => {
    await applySession(session?.user || null);
  });
}

function setupAuthUI() {
  const emailEl = document.getElementById('auth-email');
  const passwordEl = document.getElementById('auth-password');

  document.getElementById('auth-register').addEventListener('click', async () => {
    const email = emailEl.value.trim();
    const password = passwordEl.value.trim();
    if (!email || !password) {
      showAuthMessage('Email et mot de passe requis.', true);
      return;
    }
    const { error } = await signUp(email, password);
    if (error) {
      showAuthMessage(error.message, true);
      return;
    }
    showAuthMessage('Compte créé. Vérifie ta boîte mail si la confirmation est activée.');
  });

  document.getElementById('auth-login').addEventListener('click', async () => {
    const email = emailEl.value.trim();
    const password = passwordEl.value.trim();
    if (!email || !password) {
      showAuthMessage('Email et mot de passe requis.', true);
      return;
    }
    const { data, error } = await signIn(email, password);
    if (error) {
      showAuthMessage(error.message, true);
      return;
    }
    showAuthMessage('Connexion réussie.');
    if (data?.session?.user) {
      await applySession(data.session.user);
    }
  });

  document.getElementById('logout-btn').addEventListener('click', async () => {
    await signOut();
    showAuthMessage('Déconnecté.');
  });
}

// ---------- Objectives (localStorage) ----------
function loadObjectivesFromStorage() {
  try {
    const raw = localStorage.getItem(OBJECTIVES_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      state.objectives = { ...DEFAULT_OBJECTIVES, ...parsed };
    }
  } catch (e) {
    console.warn('Impossible de charger les objectifs', e);
    state.objectives = { ...DEFAULT_OBJECTIVES };
  }
}

function saveObjectivesToStorage() {
  localStorage.setItem(OBJECTIVES_STORAGE_KEY, JSON.stringify(state.objectives));
}

// ---------- Data fetching ----------
async function fetchAllData() {
  if (!state.currentUser) return;
  await Promise.all([fetchSportSessions(), fetchMeals()]);
}

async function fetchSportSessions() {
  const { data, error } = await supabase
    .from('sport_sessions')
    .select('*')
    .eq('user_id', state.currentUser.id)
    .order('date', { ascending: false });
  if (error) {
    console.error('Erreur de chargement des séances', error);
    showAuthMessage('Impossible de charger les séances.', true);
    return;
  }
  state.sportSessions = (data || []).map((row) => ({
    id: row.id,
    date: row.date,
    type: row.type,
    dureeMinutes: row.duree_minutes,
    intensite: row.intensite,
    epaule: row.epaule,
    commentaire: row.commentaire || '',
  }));
}

async function fetchMeals() {
  const { data, error } = await supabase
    .from('meals')
    .select('*')
    .eq('user_id', state.currentUser.id)
    .order('datetime', { ascending: false });
  if (error) {
    console.error('Erreur de chargement des repas', error);
    showAuthMessage('Impossible de charger les repas.', true);
    return;
  }
  state.meals = (data || []).map((row) => ({
    id: row.id,
    dateTime: row.datetime,
    typeRepas: row.type_repas,
    noteQualite: row.note_qualite,
    commentaire: row.commentaire || '',
  }));
}

// ---------- Inserts ----------
async function insertSportSession(session) {
  const { data, error } = await supabase
    .from('sport_sessions')
    .insert({
      user_id: state.currentUser.id,
      date: session.date,
      type: session.type,
      duree_minutes: session.dureeMinutes,
      intensite: session.intensite,
      epaule: session.epaule,
      commentaire: session.commentaire?.trim() || null,
    })
    .select()
    .single();

  if (error) throw error;

  return {
    id: data.id,
    date: data.date,
    type: data.type,
    dureeMinutes: data.duree_minutes,
    intensite: data.intensite,
    epaule: data.epaule,
    commentaire: data.commentaire || '',
  };
}

async function insertMeal(meal) {
  const { data, error } = await supabase
    .from('meals')
    .insert({
      user_id: state.currentUser.id,
      datetime: meal.dateTime,
      type_repas: meal.typeRepas,
      note_qualite: meal.noteQualite,
      commentaire: meal.commentaire?.trim() || null,
    })
    .select()
    .single();

  if (error) throw error;

  return {
    id: data.id,
    dateTime: data.datetime,
    typeRepas: data.type_repas,
    noteQualite: data.note_qualite,
    commentaire: data.commentaire || '',
  };
}

async function updateSportSession(id, updates) {
  const { data, error } = await supabase
    .from('sport_sessions')
    .update({
      date: updates.date,
      type: updates.type,
      duree_minutes: updates.dureeMinutes,
      intensite: updates.intensite,
      epaule: updates.epaule,
      commentaire: updates.commentaire?.trim() || null,
    })
    .eq('id', id)
    .eq('user_id', state.currentUser.id)
    .select()
    .single();

  if (error) throw error;
  return {
    id: data.id,
    date: data.date,
    type: data.type,
    dureeMinutes: data.duree_minutes,
    intensite: data.intensite,
    epaule: data.epaule,
    commentaire: data.commentaire || '',
  };
}

async function deleteSportSession(id) {
  const { error } = await supabase
    .from('sport_sessions')
    .delete()
    .eq('id', id)
    .eq('user_id', state.currentUser.id);
  if (error) throw error;
}

async function updateMeal(id, updates) {
  const { data, error } = await supabase
    .from('meals')
    .update({
      datetime: updates.dateTime,
      type_repas: updates.typeRepas,
      note_qualite: updates.noteQualite,
      commentaire: updates.commentaire?.trim() || null,
    })
    .eq('id', id)
    .eq('user_id', state.currentUser.id)
    .select()
    .single();

  if (error) throw error;
  return {
    id: data.id,
    dateTime: data.datetime,
    typeRepas: data.type_repas,
    noteQualite: data.note_qualite,
    commentaire: data.commentaire || '',
  };
}

async function deleteMeal(id) {
  const { error } = await supabase
    .from('meals')
    .delete()
    .eq('id', id)
    .eq('user_id', state.currentUser.id);
  if (error) throw error;
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

function setStatusBadge(id, status) {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = status.text;
  el.className = `badge ${status.className}`;
}

function getObjectiveStatus(actual, target, labels = {}) {
  const { reached = 'Objectif atteint', onTrack = 'On track', late = 'En retard' } = labels;
  if (!target || target <= 0) return { text: 'Pas d\'objectif', className: 'neutral' };
  const ratio = actual / target;
  if (ratio >= 1) return { text: reached, className: 'ok' };
  if (ratio >= 0.7) return { text: onTrack, className: 'warn' };
  return { text: late, className: 'danger' };
}

function generateFeedbackMessages(sportStats, nutritionStats, objectives) {
  const messages = [];
  if (sportStats.weeklySessions.length >= objectives.weeklySessionsTarget) {
    messages.push('Super ! Tu as atteint ton objectif de séances cette semaine.');
  } else {
    messages.push('Continue à planifier tes séances pour atteindre ton objectif.');
  }

  if (sportStats.shoulderPct > 30) {
    messages.push('Ton épaule a été sensible plusieurs fois cette semaine, pense à adapter l’intensité.');
  } else if (sportStats.shoulderPct > 10) {
    messages.push('Épaule : reste attentif aux sensations, échauffement soigné.');
  }

  if (nutritionStats.weeklyAverage >= objectives.weeklyNutritionTarget) {
    messages.push('Nutrition cohérente cette semaine, continue comme ça.');
  } else {
    messages.push('Essaie d’améliorer la qualité moyenne de tes repas pour atteindre ton objectif.');
  }

  return messages.slice(0, 3);
}

// ---------- Rendering ----------
function updateDashboard() {
  const sportStats = computeSportWeeklyStats();
  const nutritionStats = computeNutritionStats();
  const objectives = state.objectives;

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

  setStatusBadge('sport-session-status', getObjectiveStatus(
    sportStats.weeklySessions.length,
    objectives.weeklySessionsTarget,
    { reached: 'Objectif atteint', onTrack: 'On track', late: 'En retard' }
  ));
  setStatusBadge('sport-minutes-status', getObjectiveStatus(
    sportStats.totalMinutes,
    objectives.weeklyMinutesTarget,
    { reached: 'En avance', onTrack: 'On track', late: 'En retard' }
  ));
  setStatusBadge('nutrition-status', getObjectiveStatus(
    nutritionStats.weeklyAverage,
    objectives.weeklyNutritionTarget,
    { reached: 'Objectif atteint', onTrack: 'On track', late: 'En retard' }
  ));
}

async function handleEditSport(id) {
  const session = state.sportSessions.find((s) => s.id === id);
  if (!session) return;
  const date = prompt('Date (YYYY-MM-DD)', session.date) || session.date;
  const type = prompt('Type', session.type) || session.type;
  const dureeMinutes = parseInt(prompt('Durée (minutes)', session.dureeMinutes) || session.dureeMinutes, 10);
  const intensite = parseInt(prompt('Intensité (1-5)', session.intensite) || session.intensite, 10);
  const epaule = prompt('Épaule (OK/gene/douleur)', session.epaule) || session.epaule;
  const commentaire = prompt('Commentaire', session.commentaire) || '';

  try {
    const updated = await updateSportSession(id, { date, type, dureeMinutes, intensite, epaule, commentaire });
    state.sportSessions = state.sportSessions.map((s) => (s.id === id ? updated : s));
    renderAll();
  } catch (e) {
    alert('Modification impossible.');
    console.error(e);
  }
}

async function handleDeleteSport(id) {
  if (!confirm('Supprimer cette séance ?')) return;
  try {
    await deleteSportSession(id);
    state.sportSessions = state.sportSessions.filter((s) => s.id !== id);
    renderAll();
  } catch (e) {
    alert('Suppression impossible.');
    console.error(e);
  }
}

async function handleEditMeal(id) {
  const meal = state.meals.find((m) => m.id === id);
  if (!meal) return;
  const localDate = new Date(meal.dateTime);
  const defaultDt = new Date(localDate.getTime() - localDate.getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 16);
  const dateTimeInput = prompt('Date & heure (YYYY-MM-DDTHH:mm)', defaultDt) || defaultDt;
  const typeRepas = prompt('Type de repas', meal.typeRepas) || meal.typeRepas;
  const noteQualite = parseInt(prompt('Note (1-5)', meal.noteQualite) || meal.noteQualite, 10);
  const commentaire = prompt('Commentaire', meal.commentaire) || '';

  try {
    const updated = await updateMeal(id, {
      dateTime: new Date(dateTimeInput).toISOString(),
      typeRepas,
      noteQualite,
      commentaire,
    });
    state.meals = state.meals.map((m) => (m.id === id ? updated : m));
    renderAll();
  } catch (e) {
    alert('Modification impossible.');
    console.error(e);
  }
}

async function handleDeleteMeal(id) {
  if (!confirm('Supprimer ce repas ?')) return;
  try {
    await deleteMeal(id);
    state.meals = state.meals.filter((m) => m.id !== id);
    renderAll();
  } catch (e) {
    alert('Suppression impossible.');
    console.error(e);
  }
}

function renderObjectivesCard() {
  const { weeklySessionsTarget, weeklyMinutesTarget, weeklyNutritionTarget } = state.objectives;
  document.getElementById('obj-sessions').value = weeklySessionsTarget;
  document.getElementById('obj-minutes').value = weeklyMinutesTarget;
  document.getElementById('obj-nutrition').value = weeklyNutritionTarget;
}

function renderFeedbackMessages() {
  const feedbackList = document.getElementById('feedback-list');
  const sportStats = computeSportWeeklyStats();
  const nutritionStats = computeNutritionStats();
  const messages = generateFeedbackMessages(sportStats, nutritionStats, state.objectives);

  feedbackList.innerHTML = '';
  if (!messages.length) {
    feedbackList.innerHTML = '<li class="comment">Pas encore de messages.</li>';
    return;
  }
  messages.forEach(msg => {
    const li = document.createElement('li');
    li.textContent = msg;
    feedbackList.appendChild(li);
  });
}

function renderJournal() {
  const journalEl = document.getElementById('journal-list');
  const entriesByDate = {};

  state.sportSessions.forEach((s) => {
    const key = s.date;
    if (!entriesByDate[key]) entriesByDate[key] = [];
    entriesByDate[key].push({
      type: 'sport',
      text: `${s.type} ${s.dureeMinutes} min (intensité ${s.intensite}, épaule ${s.epaule})${s.commentaire ? ` - ${s.commentaire}` : ''}`,
    });
  });

  state.meals.forEach((m) => {
    const key = m.dateTime.split('T')[0];
    if (!entriesByDate[key]) entriesByDate[key] = [];
    entriesByDate[key].push({
      type: 'meal',
      text: `${m.typeRepas} ${m.noteQualite}/5${m.commentaire ? ` - ${m.commentaire}` : ''}`,
    });
  });

  const days = Object.keys(entriesByDate)
    .sort((a, b) => new Date(b) - new Date(a))
    .slice(0, 14);

  journalEl.innerHTML = '';
  if (!days.length) {
    journalEl.innerHTML = '<p class="comment">Aucune donnée récente.</p>';
    return;
  }

  days.forEach((day) => {
    const block = document.createElement('div');
    block.className = 'journal-day';
    const title = document.createElement('h4');
    title.textContent = formatDate(day);
    block.appendChild(title);

    const ul = document.createElement('ul');
    ul.className = 'journal-entries';
    entriesByDate[day].forEach((entry) => {
      const li = document.createElement('li');
      li.className = entry.type === 'sport' ? 'entry-sport' : 'entry-meal';
      li.textContent = `${entry.type === 'sport' ? 'Sport: ' : 'Repas: '}${entry.text}`;
      ul.appendChild(li);
    });

    block.appendChild(ul);
    journalEl.appendChild(block);
  });
}

function renderSportList() {
  const listEl = document.getElementById('sport-list');
  const sorted = [...state.sportSessions].sort((a, b) => new Date(b.date) - new Date(a.date)).slice(0, 10);

  if (!sorted.length) {
    listEl.innerHTML = '<p class="comment">Pas encore de séance. Ajoute-en une !</p>';
    document.getElementById('sport-week-summary').textContent = '0 séance cette semaine · 0 minutes';
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
    const actions = document.createElement('div');
    actions.className = 'item-actions';
    const editBtn = document.createElement('button');
    editBtn.textContent = 'Modifier';
    editBtn.addEventListener('click', () => handleEditSport(session.id));
    const deleteBtn = document.createElement('button');
    deleteBtn.textContent = 'Supprimer';
    deleteBtn.classList.add('delete');
    deleteBtn.addEventListener('click', () => handleDeleteSport(session.id));
    actions.appendChild(editBtn);
    actions.appendChild(deleteBtn);
    item.appendChild(actions);
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
    document.getElementById('nutrition-week-summary').textContent = 'Moyenne semaine: 0 / 5';
    return;
  }

  listEl.innerHTML = '';
  sorted.forEach(meal => {
    const item = document.createElement('div');
    item.className = 'list-item';
    item.innerHTML = `
      <header>
        <span>${formatDateTime(meal.dateTime)} · ${meal.typeRepas}</span>
        <span class="badge ${meal.noteQualite >= 4 ? 'ok' : meal.noteQualite >= 2 ? 'warn' : 'danger'}">${meal.noteQualite}/5</span>
      </header>
      ${meal.commentaire ? `<div>${meal.commentaire}</div>` : '<div class="meta">Sans commentaire</div>'}
    `;
    const actions = document.createElement('div');
    actions.className = 'item-actions';
    const editBtn = document.createElement('button');
    editBtn.textContent = 'Modifier';
    editBtn.addEventListener('click', () => handleEditMeal(meal.id));
    const deleteBtn = document.createElement('button');
    deleteBtn.textContent = 'Supprimer';
    deleteBtn.classList.add('delete');
    deleteBtn.addEventListener('click', () => handleDeleteMeal(meal.id));
    actions.appendChild(editBtn);
    actions.appendChild(deleteBtn);
    item.appendChild(actions);
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
        backgroundColor: '#2D9CDB33',
        borderColor: '#2D9CDB',
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
        borderColor: '#27AE60',
        backgroundColor: '#27AE6020',
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
  if (!state.currentUser) return;
  updateDashboard();
  renderObjectivesCard();
  renderFeedbackMessages();
  renderJournal();
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
  sportForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!state.currentUser) {
      alert('Connecte-toi avant d\'ajouter des données.');
      return;
    }
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

    try {
      const saved = await insertSportSession({
        date,
        type,
        dureeMinutes,
        intensite,
        epaule,
        commentaire: formData.get('commentaire'),
      });
      state.sportSessions.unshift(saved);
    } catch (error) {
      alert('Impossible d\'enregistrer la séance.');
      console.error(error);
      return;
    }

    renderAll();
    sportForm.reset();
  });

  const mealForm = document.getElementById('meal-form');
  mealForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!state.currentUser) {
      alert('Connecte-toi avant d\'ajouter des données.');
      return;
    }
    const formData = new FormData(mealForm);
    const dateTime = formData.get('dateTime');
    const typeRepas = formData.get('typeRepas');
    const noteQualite = parseInt(formData.get('noteQualite'), 10);

    if (!dateTime || !typeRepas || !noteQualite) {
      alert('Merci de compléter les champs obligatoires.');
      return;
    }

    const isoDate = new Date(dateTime).toISOString();

    try {
      const saved = await insertMeal({
        dateTime: isoDate,
        typeRepas,
        noteQualite,
        commentaire: formData.get('commentaire'),
      });
      state.meals.unshift(saved);
    } catch (error) {
      alert('Impossible d\'enregistrer le repas.');
      console.error(error);
      return;
    }

    renderAll();
    mealForm.reset();
  });
}

function setupObjectivesForm() {
  const saveBtn = document.getElementById('save-objectives');
  saveBtn.addEventListener('click', () => {
    const sessions = parseInt(document.getElementById('obj-sessions').value, 10) || 0;
    const minutes = parseInt(document.getElementById('obj-minutes').value, 10) || 0;
    const nutrition = parseFloat(document.getElementById('obj-nutrition').value) || 0;

    state.objectives = {
      weeklySessionsTarget: sessions,
      weeklyMinutesTarget: minutes,
      weeklyNutritionTarget: nutrition,
    };
    saveObjectivesToStorage();
    renderAll();
  });
}

// ---------- Init ----------
async function init() {
  applyTheme('dashboard');
  loadObjectivesFromStorage();
  setupTabs();
  setupForms();
  setupObjectivesForm();
  setupAuthUI();
  await checkSessionOnLoad();
}

document.addEventListener('DOMContentLoaded', init);
