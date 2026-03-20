const STORAGE_KEY = 'agenda-2026-items';
const YEAR = 2026;
const WEEK_DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const CATEGORY_META = {
  project: { label: 'Project', dot: '#3b82f6', badgeClass: 'project' },
  travel: { label: 'Travel', dot: '#f59e0b', badgeClass: 'travel' },
  personal: { label: 'Personal', dot: '#10b981', badgeClass: 'personal' },
  todo: { label: 'Todo', dot: '#8b5cf6', badgeClass: 'todo' },
};
const TIME_OPTIONS = Array.from({ length: 48 }, (_, index) => {
  const hour = Math.floor(index / 2);
  const minute = index % 2 === 0 ? '00' : '30';
  const value = `${String(hour).padStart(2, '0')}:${minute}`;
  const label = new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit' }).format(new Date(2026, 0, 1, hour, Number(minute)));
  return { value, label };
});

const app = document.getElementById('app');
const today = new Date();
const initialMonth = today.getFullYear() === YEAR ? today.getMonth() : 0;
const initialDay = today.getFullYear() === YEAR ? today.getDate() : 1;

const state = {
  currentMonth: initialMonth,
  selectedDate: toDateKey(YEAR, initialMonth, initialDay),
  agendaItems: loadAgendaItems(),
  searchTerm: '',
  editingId: null,
  form: emptyForm(),
  reminderNotice: '',
  reminderNoticeType: 'warn',
  locationSuggestions: [],
  locationStatus: 'idle',
};

let locationSearchTimeout = null;
let reminderInterval = null;
let pendingReminderIds = new Set();

render();
setupReminderPolling();

function emptyForm() {
  return {
    title: '',
    startTime: '',
    durationHours: '1',
    location: '',
    description: '',
    category: 'project',
    reminderEmail: '',
    reminderEnabled: false,
  };
}

function saveAgendaItems() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state.agendaItems));
}

function loadAgendaItems() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return sortItems(parsed.filter((item) => item && typeof item.date === 'string' && item.date.startsWith(`${YEAR}-`)).map(normalizeItem));
  } catch {
    return [];
  }
}

function normalizeItem(item) {
  return {
    id: item.id || crypto.randomUUID(),
    date: item.date,
    title: item.title || '',
    startTime: item.startTime || item.time || '',
    time: item.time || item.startTime || '',
    durationHours: typeof item.durationHours === 'number' ? item.durationHours : item.durationHours ? Number(item.durationHours) : undefined,
    location: item.location || '',
    description: item.description || '',
    category: CATEGORY_META[item.category] ? item.category : 'project',
    reminderEmail: item.reminderEmail || '',
    reminderEnabled: Boolean(item.reminderEnabled && item.reminderEmail),
    reminderSentAt: item.reminderSentAt || '',
    reminderError: item.reminderError || '',
  };
}

function sortItems(items) {
  return [...items].sort((a, b) => `${a.date} ${a.startTime || ''} ${a.title}`.localeCompare(`${b.date} ${b.startTime || ''} ${b.title}`));
}

function pad(value) {
  return String(value).padStart(2, '0');
}

function toDateKey(year, monthIndex, day) {
  return `${year}-${pad(monthIndex + 1)}-${pad(day)}`;
}

function formatLongDate(dateKey) {
  const [year, month, day] = dateKey.split('-').map(Number);
  return new Intl.DateTimeFormat('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }).format(new Date(year, month - 1, day));
}

function formatDateHeading(dateKey) {
  const [year, month, day] = dateKey.split('-').map(Number);
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(new Date(year, month - 1, day));
}

function formatTimeLabel(value) {
  if (!value) return '';
  const [hour, minute] = value.split(':').map(Number);
  if (Number.isNaN(hour) || Number.isNaN(minute)) return value;
  return new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit' }).format(new Date(2026, 0, 1, hour, minute));
}

function formatDurationLabel(durationHours) {
  if (!durationHours) return '';
  return `${Number.isInteger(durationHours) ? durationHours : durationHours.toFixed(1)}h`;
}

function formatSchedule(item) {
  const start = item.startTime || item.time;
  const startLabel = formatTimeLabel(start);
  const durationLabel = formatDurationLabel(item.durationHours);
  if (startLabel && durationLabel) return `${startLabel} · ${durationLabel}`;
  return startLabel || durationLabel || '';
}

function formatReminderStatus(item) {
  if (item.reminderSentAt) return 'Sent';
  if (item.reminderEnabled && item.reminderEmail) return 'Armed';
  return 'Off';
}

function getMonthGrid(year, monthIndex) {
  const firstDay = new Date(year, monthIndex, 1);
  const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();
  const mondayOffset = (firstDay.getDay() + 6) % 7;
  const totalCells = Math.ceil((mondayOffset + daysInMonth) / 7) * 7;

  return Array.from({ length: totalCells }, (_, index) => {
    const dayNumber = index - mondayOffset + 1;
    if (dayNumber < 1 || dayNumber > daysInMonth) return null;
    return { dayNumber, dateKey: toDateKey(year, monthIndex, dayNumber) };
  });
}

function getItemsByDate() {
  return state.agendaItems.reduce((acc, item) => {
    acc[item.date] = acc[item.date] || [];
    acc[item.date].push(item);
    return acc;
  }, {});
}

function getSelectedItems(itemsByDate) {
  return sortItems(itemsByDate[state.selectedDate] || []);
}

function getMonthItems() {
  const prefix = `${YEAR}-${pad(state.currentMonth + 1)}`;
  const search = state.searchTerm.trim().toLowerCase();
  const filtered = state.agendaItems.filter((item) => item.date.startsWith(prefix));
  if (!search) return sortItems(filtered);
  return sortItems(filtered.filter((item) => [
    item.title,
    item.location,
    item.description,
    item.startTime,
    item.reminderEmail,
    CATEGORY_META[item.category].label,
  ].filter(Boolean).some((value) => String(value).toLowerCase().includes(search))));
}

function getMonthOverview() {
  return MONTHS.map((label, index) => {
    const prefix = `${YEAR}-${pad(index + 1)}`;
    return {
      label,
      index,
      count: state.agendaItems.filter((item) => item.date.startsWith(prefix)).length,
    };
  });
}

function parseEventDateTime(dateKey, startTime) {
  if (!startTime) return null;
  const [year, month, day] = dateKey.split('-').map(Number);
  const [hour, minute] = startTime.split(':').map(Number);
  if ([year, month, day, hour, minute].some((value) => Number.isNaN(value))) return null;
  return new Date(year, month - 1, day, hour, minute, 0, 0);
}

function setNotice(message, type = 'warn') {
  state.reminderNotice = message;
  state.reminderNoticeType = type;
}

function resetForm() {
  state.form = emptyForm();
  state.editingId = null;
  state.locationSuggestions = [];
  state.locationStatus = 'idle';
}

function setMonth(nextMonth) {
  state.currentMonth = nextMonth;
  const [, , day] = state.selectedDate.split('-');
  const daysInMonth = new Date(YEAR, nextMonth + 1, 0).getDate();
  const safeDay = Math.min(Number(day), daysInMonth);
  state.selectedDate = toDateKey(YEAR, nextMonth, safeDay);
  resetForm();
  setNotice('');
  render();
}

function render() {
  const itemsByDate = getItemsByDate();
  const selectedItems = getSelectedItems(itemsByDate);
  const monthItems = getMonthItems();
  const monthOverview = getMonthOverview();
  const monthCount = monthItems.length;
  const busyDays = new Set(monthItems.map((item) => item.date)).size;
  const monthGrid = getMonthGrid(YEAR, state.currentMonth);
  const todayDateKey = today.getFullYear() === YEAR ? toDateKey(YEAR, today.getMonth(), today.getDate()) : '';

  app.innerHTML = `
    <div class="page">
      <div class="container">
        <section class="hero">
          <div class="hero-top">
            <div>
              <span class="eyebrow">2026 Planner</span>
              <h1>2026 Agenda Calendar</h1>
              <p>A calm monthly planner for project organization, travel schedules, and day-by-day agenda writing.</p>
            </div>
            <div class="stats">
              <div>
                <div class="stat-label">Month focus</div>
                <div class="stat-value">${monthCount}</div>
                <div class="small">agenda items this month</div>
              </div>
              <div>
                <div class="stat-label">Busy days</div>
                <div class="stat-value">${busyDays}</div>
                <div class="small">days with notes or plans</div>
              </div>
            </div>
          </div>
        </section>

        <div class="layout">
          <section class="panel">
            <div class="calendar-header">
              <div>
                <div class="stat-label">Monthly calendar</div>
                <h2>${MONTHS[state.currentMonth]} ${YEAR}</h2>
              </div>
              <div class="button-row">
                <button class="btn" data-action="prev-month">← Previous</button>
                <button class="btn ghost" data-action="today-month">Today month</button>
                <button class="btn" data-action="next-month">Next →</button>
              </div>
            </div>

            <div class="calendar-box">
              <div class="weekdays">${WEEK_DAYS.map((day) => `<div>${day}</div>`).join('')}</div>
              <div class="calendar-grid">
                ${monthGrid.map((entry, index) => {
                  if (!entry) return `<div class="day-cell empty" data-empty="${index}"></div>`;
                  const dayItems = sortItems(itemsByDate[entry.dateKey] || []);
                  const isSelected = entry.dateKey === state.selectedDate;
                  const isToday = entry.dateKey === todayDateKey;
                  const dayCopy = dayItems.slice(0, 2).map((item) => item.title).join(' · ') || 'No agenda yet';
                  return `
                    <button class="day-cell ${isSelected ? 'selected' : ''}" data-date="${entry.dateKey}">
                      <div class="day-top">
                        <span class="day-number ${isToday && !isSelected ? 'today' : ''}">${entry.dayNumber}</span>
                        ${dayItems.length ? `<span class="count-pill">+${dayItems.length}</span>` : ''}
                      </div>
                      <div>
                        <div class="day-dots">${dayItems.slice(0, 3).map((item) => `<span style="background:${CATEGORY_META[item.category].dot}"></span>`).join('')}</div>
                        <div class="day-copy">${escapeHtml(dayCopy)}</div>
                      </div>
                    </button>`;
                }).join('')}
              </div>
            </div>

            <div class="overview">
              <div class="search-row">
                <div>
                  <h3 style="margin:0">2026 Month Overview</h3>
                  <p class="small" style="margin:6px 0 0">Jump between months and see which ones are already planned.</p>
                </div>
                <input id="month-search" placeholder="Search this month" value="${escapeHtml(state.searchTerm)}" />
              </div>
              <div class="month-overview">
                ${monthOverview.map((month) => `
                  <button class="month-button ${month.index === state.currentMonth ? 'active' : ''} ${month.count > 0 ? 'has-items' : ''}" data-month="${month.index}">
                    <span>
                      <strong>${month.label}</strong><br />
                      <span class="small">${month.count} items</span>
                    </span>
                    <span class="month-dot"></span>
                  </button>`).join('')}
              </div>
            </div>
          </section>

          <aside class="panel">
            <div class="card-stack">
              <div class="info-card">
                <div class="stat-label">Selected day</div>
                <h2 style="margin:10px 0 8px">${formatLongDate(state.selectedDate)}</h2>
                <p class="small" style="margin:0">${selectedItems.length} item(s) planned. Click any day to write deadlines, travel plans, or project agenda notes.</p>
              </div>

              ${state.reminderNotice ? `<div class="notice ${state.reminderNoticeType === 'error' ? 'error' : ''}">${escapeHtml(state.reminderNotice)}</div>` : ''}

              <div class="list-card">
                <div class="panel-header">
                  <div>
                    <h3 style="margin:0">Agenda for the day</h3>
                    <p class="small" style="margin:6px 0 0">${selectedItems.length} item(s) scheduled.</p>
                  </div>
                  ${state.editingId ? '<button class="btn" data-action="cancel-edit">Cancel edit</button>' : ''}
                </div>
                <div class="agenda-list">
                  ${selectedItems.length ? selectedItems.map(renderAgendaItem).join('') : '<div class="empty-state">No agenda yet for this day. Add a plan using the form below.</div>'}
                </div>
              </div>

              <form id="agenda-form" class="form-card">
                <div class="panel-header">
                  <div>
                    <h3 style="margin:0">${state.editingId ? 'Edit agenda item' : 'Create agenda item'}</h3>
                    <p class="small" style="margin:6px 0 0">Saved in localStorage so your 2026 plans stay after refresh.</p>
                  </div>
                  <span class="pill" style="background:#f8fafc;color:#64748b;padding:8px 12px">localStorage</span>
                </div>

                <div class="form-grid">
                  <div class="field">
                    <label for="title">Title</label>
                    <input id="title" name="title" required placeholder="Project review, flight, checklist..." value="${escapeHtml(state.form.title)}" />
                  </div>

                  <div class="two-col">
                    <div class="field">
                      <label for="startTime">Start time</label>
                      <select id="startTime" name="startTime">
                        <option value="">Choose a start time</option>
                        ${TIME_OPTIONS.map((option) => `<option value="${option.value}" ${option.value === state.form.startTime ? 'selected' : ''}>${option.label}</option>`).join('')}
                      </select>
                    </div>
                    <div class="field">
                      <label for="durationHours">Duration (hours)</label>
                      <input id="durationHours" name="durationHours" type="number" min="0.5" step="0.5" value="${escapeHtml(state.form.durationHours)}" placeholder="1.5" />
                    </div>
                  </div>

                  <div class="preview-box">
                    <strong>Schedule preview</strong>
                    <div class="helper">${state.form.startTime ? formatTimeLabel(state.form.startTime) : 'No start time selected'}${state.form.durationHours ? ` · ${formatDurationLabel(Number(state.form.durationHours)) || state.form.durationHours}` : ''}</div>
                  </div>

                  <div class="two-col">
                    <div class="field">
                      <label for="category">Category</label>
                      <select id="category" name="category">
                        ${Object.entries(CATEGORY_META).map(([key, meta]) => `<option value="${key}" ${key === state.form.category ? 'selected' : ''}>${meta.label}</option>`).join('')}
                      </select>
                    </div>
                    <div class="field">
                      <label for="reminderEmail">Reminder email</label>
                      <input id="reminderEmail" name="reminderEmail" type="email" placeholder="name@example.com" value="${escapeHtml(state.form.reminderEmail)}" />
                    </div>
                  </div>

                  <div class="field">
                    <label for="location">Location</label>
                    <input id="location" name="location" placeholder="Meeting room, airport, city..." value="${escapeHtml(state.form.location)}" />
                    <div class="helper">Type 3+ characters to search for a more precise place.</div>
                  </div>

                  ${renderSuggestions()}

                  <label class="checkbox">
                    <input id="reminderEnabled" name="reminderEnabled" type="checkbox" ${state.form.reminderEnabled ? 'checked' : ''} />
                    <span class="checkbox-copy">
                      <strong>Email reminder 30 minutes before start</strong>
                      <span class="small">Requires a start time, reminder email, and SMTP env vars. The current browser tab must stay open so the reminder can trigger.</span>
                    </span>
                  </label>

                  <div class="field">
                    <label for="description">Notes</label>
                    <textarea id="description" name="description" placeholder="Add deadlines, travel details, to-do context, or reminders.">${escapeHtml(state.form.description)}</textarea>
                  </div>

                  <div class="button-row">
                    <button class="btn primary" type="submit">${state.editingId ? 'Update agenda' : 'Save agenda'}</button>
                    <button class="btn" type="button" data-action="clear-form">Clear form</button>
                  </div>
                </div>
              </form>

              <div class="month-list-card">
                <div class="panel-header">
                  <div>
                    <h3 style="margin:0">Monthly agenda list</h3>
                    <p class="small" style="margin:6px 0 0">All scheduled entries for ${MONTHS[state.currentMonth]} ${YEAR}.</p>
                  </div>
                  <span class="pill" style="background:#f1f5f9;color:#64748b;padding:8px 12px">${monthItems.length} items</span>
                </div>
                <div class="month-list">
                  ${monthItems.length ? monthItems.map(renderMonthItem).join('') : `<div class="empty-state">No results for this month yet${state.searchTerm ? ' or matching your search' : ''}.</div>`}
                </div>
              </div>
            </div>
          </aside>
        </div>
      </div>
    </div>`;

  bindEvents();
}

function renderAgendaItem(item) {
  return `
    <article class="agenda-item">
      <div class="item-top">
        <div>
          <div class="item-meta">
            <span class="badge ${CATEGORY_META[item.category].badgeClass}">${CATEGORY_META[item.category].label}</span>
            ${formatSchedule(item) ? `<span class="meta-text">${escapeHtml(formatSchedule(item))}</span>` : ''}
            ${item.reminderEmail ? `<span class="meta-text">⏰ ${escapeHtml(item.reminderEmail)}</span>` : ''}
            <span class="meta-text">Reminder: ${escapeHtml(formatReminderStatus(item))}</span>
          </div>
          <h4 class="item-title">${escapeHtml(item.title)}</h4>
          ${item.location ? `<p class="item-copy">📍 ${escapeHtml(item.location)}</p>` : ''}
          ${item.description ? `<p class="item-copy">${escapeHtml(item.description)}</p>` : ''}
          ${item.reminderError ? `<p class="item-copy" style="color:#b91c1c">Reminder issue: ${escapeHtml(item.reminderError)}</p>` : ''}
        </div>
        <div class="actions">
          <button class="btn" type="button" data-action="edit-item" data-id="${item.id}">Edit</button>
          <button class="btn danger" type="button" data-action="delete-item" data-id="${item.id}">Delete</button>
        </div>
      </div>
    </article>`;
}

function renderMonthItem(item) {
  return `
    <button class="month-item" type="button" data-action="edit-item" data-id="${item.id}">
      <div class="month-meta">
        <span class="badge ${CATEGORY_META[item.category].badgeClass}">${CATEGORY_META[item.category].label}</span>
        ${item.reminderEnabled && item.reminderEmail ? `<span class="meta-text">Reminder email: ${escapeHtml(item.reminderEmail)}</span>` : ''}
      </div>
      <strong>${escapeHtml(formatDateHeading(item.date))} · ${escapeHtml(item.title)}</strong>
      <div class="helper">${escapeHtml([formatSchedule(item), item.location, item.description].filter(Boolean).join(' · ') || 'No extra notes')}</div>
    </button>`;
}

function renderSuggestions() {
  if (state.locationSuggestions.length > 0) {
    return `
      <div class="suggestions">
        <div class="small" style="padding:0 2px">Location suggestions</div>
        ${state.locationSuggestions.map((suggestion, index) => `
          <button class="suggestion-btn" type="button" data-action="pick-location" data-index="${index}">
            <strong>${escapeHtml(suggestion.displayName)}</strong>
            ${suggestion.subtitle ? `<div class="helper">${escapeHtml(suggestion.subtitle)}</div>` : ''}
          </button>`).join('')}
      </div>`;
  }
  if (state.locationStatus === 'loading') {
    return '<div class="helper">Searching matching places…</div>';
  }
  if (state.locationStatus === 'error') {
    return '<div class="helper" style="color:#b91c1c">Location lookup failed. You can still type a location manually.</div>';
  }
  return '';
}

function bindEvents() {
  document.querySelector('[data-action="prev-month"]')?.addEventListener('click', () => setMonth(state.currentMonth === 0 ? 11 : state.currentMonth - 1));
  document.querySelector('[data-action="next-month"]')?.addEventListener('click', () => setMonth(state.currentMonth === 11 ? 0 : state.currentMonth + 1));
  document.querySelector('[data-action="today-month"]')?.addEventListener('click', () => setMonth(initialMonth));

  document.querySelectorAll('[data-month]').forEach((button) => {
    button.addEventListener('click', () => setMonth(Number(button.dataset.month)));
  });

  document.querySelectorAll('[data-date]').forEach((button) => {
    button.addEventListener('click', () => {
      state.selectedDate = button.dataset.date;
      resetForm();
      setNotice('');
      render();
    });
  });

  document.getElementById('month-search')?.addEventListener('input', (event) => {
    state.searchTerm = event.target.value;
    render();
  });

  document.querySelector('[data-action="cancel-edit"]')?.addEventListener('click', () => {
    resetForm();
    setNotice('');
    render();
  });

  document.querySelector('[data-action="clear-form"]')?.addEventListener('click', () => {
    resetForm();
    setNotice('');
    render();
  });

  document.querySelectorAll('[data-action="edit-item"]').forEach((button) => {
    button.addEventListener('click', () => startEditing(button.dataset.id));
  });

  document.querySelectorAll('[data-action="delete-item"]').forEach((button) => {
    button.addEventListener('click', () => deleteItem(button.dataset.id));
  });

  document.querySelectorAll('[data-action="pick-location"]').forEach((button) => {
    button.addEventListener('click', () => {
      const suggestion = state.locationSuggestions[Number(button.dataset.index)];
      if (!suggestion) return;
      state.form.location = suggestion.displayName;
      state.locationSuggestions = [];
      state.locationStatus = 'idle';
      render();
    });
  });

  const form = document.getElementById('agenda-form');
  form?.addEventListener('submit', handleSubmit);

  ['title', 'startTime', 'durationHours', 'category', 'reminderEmail', 'description'].forEach((fieldName) => {
    document.getElementById(fieldName)?.addEventListener('input', updateFormFromEvent);
    document.getElementById(fieldName)?.addEventListener('change', updateFormFromEvent);
  });

  const reminderEnabled = document.getElementById('reminderEnabled');
  reminderEnabled?.addEventListener('change', (event) => {
    state.form.reminderEnabled = event.target.checked;
  });

  const locationInput = document.getElementById('location');
  locationInput?.addEventListener('input', (event) => {
    state.form.location = event.target.value;
    runLocationSearch();
  });
}

function updateFormFromEvent(event) {
  state.form[event.target.name] = event.target.value;
  if (event.target.name === 'startTime' || event.target.name === 'durationHours') {
    render();
  }
}

function handleSubmit(event) {
  event.preventDefault();
  const title = state.form.title.trim();
  if (!title) return;

  const durationNumber = Number(state.form.durationHours);
  const durationHours = Number.isFinite(durationNumber) && durationNumber > 0 ? durationNumber : undefined;
  const reminderEmail = state.form.reminderEnabled ? state.form.reminderEmail.trim() : '';
  const reminderEnabled = Boolean(state.form.reminderEnabled && reminderEmail && state.form.startTime);

  const item = normalizeItem({
    id: state.editingId || crypto.randomUUID(),
    date: state.selectedDate,
    title,
    startTime: state.form.startTime,
    time: state.form.startTime,
    durationHours,
    location: state.form.location.trim(),
    description: state.form.description.trim(),
    category: state.form.category,
    reminderEmail,
    reminderEnabled,
    reminderSentAt: '',
    reminderError: '',
  });

  if (state.editingId) {
    state.agendaItems = sortItems(state.agendaItems.map((entry) => entry.id === state.editingId ? item : entry));
  } else {
    state.agendaItems = sortItems([...state.agendaItems, item]);
  }

  saveAgendaItems();
  setNotice(reminderEnabled ? 'Reminder armed. Keep this page open near the event time so the email can be triggered.' : 'Agenda saved.', 'warn');
  resetForm();
  render();
}

function startEditing(id) {
  const item = state.agendaItems.find((entry) => entry.id === id);
  if (!item) return;
  state.editingId = id;
  state.selectedDate = item.date;
  state.currentMonth = Number(item.date.split('-')[1]) - 1;
  state.form = {
    title: item.title,
    startTime: item.startTime || '',
    durationHours: item.durationHours ? String(item.durationHours) : '1',
    location: item.location || '',
    description: item.description || '',
    category: item.category,
    reminderEmail: item.reminderEmail || '',
    reminderEnabled: Boolean(item.reminderEnabled && item.reminderEmail),
  };
  state.locationSuggestions = [];
  state.locationStatus = 'idle';
  setNotice('Editing an existing agenda item.', 'warn');
  render();
}

function deleteItem(id) {
  state.agendaItems = state.agendaItems.filter((item) => item.id !== id);
  saveAgendaItems();
  if (state.editingId === id) resetForm();
  setNotice('Agenda item deleted.', 'warn');
  render();
}

function runLocationSearch() {
  clearTimeout(locationSearchTimeout);
  const query = state.form.location.trim();
  if (query.length < 3) {
    state.locationSuggestions = [];
    state.locationStatus = 'idle';
    render();
    return;
  }

  state.locationStatus = 'loading';
  render();
  locationSearchTimeout = setTimeout(async () => {
    try {
      const response = await fetch(`/api/location-search?q=${encodeURIComponent(query)}`);
      if (!response.ok) throw new Error('Location search failed.');
      const result = await response.json();
      state.locationSuggestions = result.suggestions || [];
      state.locationStatus = 'idle';
    } catch {
      state.locationSuggestions = [];
      state.locationStatus = 'error';
    }
    render();
  }, 350);
}

function setupReminderPolling() {
  const tick = async () => {
    const now = new Date();
    for (const item of state.agendaItems) {
      if (!item.reminderEnabled || !item.reminderEmail || item.reminderSentAt || pendingReminderIds.has(item.id)) continue;
      const eventDateTime = parseEventDateTime(item.date, item.startTime || item.time);
      if (!eventDateTime || now >= eventDateTime) continue;
      const reminderAt = new Date(eventDateTime.getTime() - 30 * 60 * 1000);
      if (now < reminderAt) continue;

      pendingReminderIds.add(item.id);
      try {
        const response = await fetch('/api/reminders', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title: item.title,
            date: item.date,
            startTime: item.startTime || item.time,
            durationHours: item.durationHours,
            location: item.location,
            description: item.description,
            reminderEmail: item.reminderEmail,
          }),
        });
        const result = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(result.error || 'Unable to send reminder email.');
        item.reminderSentAt = new Date().toISOString();
        item.reminderError = '';
        setNotice(`Reminder sent for “${item.title}”.`, 'warn');
      } catch (error) {
        item.reminderError = error.message || 'Unable to send reminder email.';
        setNotice(item.reminderError, 'error');
      } finally {
        pendingReminderIds.delete(item.id);
        saveAgendaItems();
        render();
      }
    }
  };

  tick();
  reminderInterval = setInterval(tick, 60000);
}

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
