'use client';

import { useEffect, useMemo, useRef, useState } from 'react';

type AgendaCategory = 'project' | 'travel' | 'personal' | 'todo';

type AgendaItem = {
  id: string;
  date: string;
  title: string;
  time?: string;
  startTime?: string;
  durationHours?: number;
  location?: string;
  description?: string;
  category?: AgendaCategory;
  reminderEmail?: string;
  reminderEnabled?: boolean;
  reminderSentAt?: string;
};

type FormState = {
  title: string;
  startTime: string;
  durationHours: string;
  location: string;
  description: string;
  category: AgendaCategory;
  reminderEmail: string;
  reminderEnabled: boolean;
};

type LocationSuggestion = {
  displayName: string;
  lat: string;
  lon: string;
};

const STORAGE_KEY = 'agenda-2026-items';
const YEAR = 2026;
const WEEK_DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];
const TIME_OPTIONS = Array.from({ length: 48 }, (_, index) => {
  const hour = Math.floor(index / 2);
  const minute = index % 2 === 0 ? '00' : '30';
  const value = `${pad(hour)}:${minute}`;
  const labelDate = new Date(2026, 0, 1, hour, Number(minute));
  const label = new Intl.DateTimeFormat('en-US', {
    hour: 'numeric',
    minute: '2-digit',
  }).format(labelDate);

  return { value, label };
});
const CATEGORY_META: Record<AgendaCategory, { label: string; dot: string; badge: string }> = {
  project: { label: 'Project', dot: 'bg-blue-500', badge: 'bg-blue-50 text-blue-700 border-blue-200' },
  travel: { label: 'Travel', dot: 'bg-amber-500', badge: 'bg-amber-50 text-amber-700 border-amber-200' },
  personal: { label: 'Personal', dot: 'bg-emerald-500', badge: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  todo: { label: 'Todo', dot: 'bg-violet-500', badge: 'bg-violet-50 text-violet-700 border-violet-200' },
};

const emptyForm = (): FormState => ({
  title: '',
  startTime: '',
  durationHours: '1',
  location: '',
  description: '',
  category: 'project',
  reminderEmail: '',
  reminderEnabled: false,
});

function pad(value: number) {
  return value.toString().padStart(2, '0');
}

function toDateKey(year: number, monthIndex: number, day: number) {
  return `${year}-${pad(monthIndex + 1)}-${pad(day)}`;
}

function formatLongDate(dateKey: string) {
  const [year, month, day] = dateKey.split('-').map(Number);
  return new Intl.DateTimeFormat('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  }).format(new Date(year, month - 1, day));
}

function getInitialMonth() {
  const now = new Date();
  return now.getFullYear() === YEAR ? now.getMonth() : 0;
}

function getMonthGrid(year: number, monthIndex: number) {
  const firstDay = new Date(year, monthIndex, 1);
  const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();
  const mondayOffset = (firstDay.getDay() + 6) % 7;
  const totalCells = Math.ceil((mondayOffset + daysInMonth) / 7) * 7;

  return Array.from({ length: totalCells }, (_, index) => {
    const dayNumber = index - mondayOffset + 1;
    if (dayNumber < 1 || dayNumber > daysInMonth) {
      return null;
    }

    return {
      dayNumber,
      dateKey: toDateKey(year, monthIndex, dayNumber),
    };
  });
}

function parseEventDateTime(dateKey: string, startTime?: string) {
  if (!startTime) {
    return null;
  }

  const [year, month, day] = dateKey.split('-').map(Number);
  const [hour, minute] = startTime.split(':').map(Number);
  if ([year, month, day, hour, minute].some((value) => Number.isNaN(value))) {
    return null;
  }

  return new Date(year, month - 1, day, hour, minute, 0, 0);
}

function formatDateHeading(dateKey: string) {
  const [year, month, day] = dateKey.split('-').map(Number);
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
  }).format(new Date(year, month - 1, day));
}

function formatTimeLabel(value?: string) {
  if (!value) {
    return '';
  }

  const [hour, minute] = value.split(':').map(Number);
  if (Number.isNaN(hour) || Number.isNaN(minute)) {
    return value;
  }

  return new Intl.DateTimeFormat('en-US', {
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(2026, 0, 1, hour, minute));
}

function formatDurationLabel(durationHours?: number) {
  if (!durationHours) {
    return '';
  }

  const wholeHours = Number.isInteger(durationHours) ? `${durationHours}` : durationHours.toFixed(1);
  return `${wholeHours}h`;
}

function formatSchedule(item: AgendaItem) {
  const start = item.startTime ?? item.time;
  const startLabel = formatTimeLabel(start);
  const durationLabel = formatDurationLabel(item.durationHours);

  if (startLabel && durationLabel) {
    return `${startLabel} · ${durationLabel}`;
  }

  if (startLabel) {
    return startLabel;
  }

  return durationLabel;
}

function sortItems(items: AgendaItem[]) {
  return [...items].sort((a, b) => {
    const left = `${a.date} ${a.startTime ?? a.time ?? ''} ${a.title}`;
    const right = `${b.date} ${b.startTime ?? b.time ?? ''} ${b.title}`;
    return left.localeCompare(right);
  });
}

function normalizeAgendaItem(item: AgendaItem): AgendaItem {
  return {
    ...item,
    startTime: item.startTime ?? item.time,
    durationHours: item.durationHours ?? undefined,
    category: item.category ?? 'project',
    reminderEnabled: Boolean(item.reminderEnabled && item.reminderEmail),
  };
}

export function AgendaCalendar() {
  const today = useMemo(() => new Date(), []);
  const defaultSelectedDay = today.getFullYear() === YEAR ? today.getDate() : 1;
  const [currentMonth, setCurrentMonth] = useState(getInitialMonth());
  const [selectedDate, setSelectedDate] = useState(toDateKey(YEAR, getInitialMonth(), defaultSelectedDay));
  const [agendaItems, setAgendaItems] = useState<AgendaItem[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [form, setForm] = useState<FormState>(emptyForm());
  const [isHydrated, setIsHydrated] = useState(false);
  const [locationSuggestions, setLocationSuggestions] = useState<LocationSuggestion[]>([]);
  const [locationStatus, setLocationStatus] = useState<'idle' | 'loading' | 'error'>('idle');
  const [reminderNotice, setReminderNotice] = useState('');
  const sendingReminderIds = useRef(new Set<string>());

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored) as AgendaItem[];
        setAgendaItems(sortItems(parsed.filter((item) => item.date.startsWith(`${YEAR}-`)).map(normalizeAgendaItem)));
      }
    } catch {
      setAgendaItems([]);
    } finally {
      setIsHydrated(true);
    }
  }, []);

  useEffect(() => {
    if (!isHydrated) {
      return;
    }

    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(agendaItems));
  }, [agendaItems, isHydrated]);

  useEffect(() => {
    setSelectedDate((current) => {
      const [year, , day] = current.split('-');
      const daysInMonth = new Date(YEAR, currentMonth + 1, 0).getDate();
      const safeDay = Math.min(Number(day), daysInMonth);
      return `${year}-${pad(currentMonth + 1)}-${pad(safeDay)}`;
    });
    setEditingId(null);
    setForm(emptyForm());
    setLocationSuggestions([]);
  }, [currentMonth]);

  useEffect(() => {
    const query = form.location.trim();

    if (query.length < 3) {
      setLocationSuggestions([]);
      setLocationStatus('idle');
      return;
    }

    const controller = new AbortController();
    const timeoutId = window.setTimeout(async () => {
      setLocationStatus('loading');

      try {
        const params = new URLSearchParams({
          q: query,
          format: 'jsonv2',
          addressdetails: '1',
          limit: '5',
        });
        const response = await fetch(`https://nominatim.openstreetmap.org/search?${params.toString()}`, {
          signal: controller.signal,
          headers: {
            Accept: 'application/json',
          },
        });

        if (!response.ok) {
          throw new Error('Location search failed.');
        }

        const results = (await response.json()) as Array<{ display_name: string; lat: string; lon: string }>;
        setLocationSuggestions(
          results.map((result) => ({
            displayName: result.display_name,
            lat: result.lat,
            lon: result.lon,
          })),
        );
        setLocationStatus('idle');
      } catch (error) {
        if ((error as Error).name === 'AbortError') {
          return;
        }

        setLocationSuggestions([]);
        setLocationStatus('error');
      }
    }, 350);

    return () => {
      controller.abort();
      window.clearTimeout(timeoutId);
    };
  }, [form.location]);

  useEffect(() => {
    if (!isHydrated) {
      return;
    }

    let isCancelled = false;

    const checkReminders = async () => {
      const now = new Date();

      for (const item of agendaItems) {
        if (!item.reminderEnabled || !item.reminderEmail || item.reminderSentAt || sendingReminderIds.current.has(item.id)) {
          continue;
        }

        const eventDateTime = parseEventDateTime(item.date, item.startTime ?? item.time);
        if (!eventDateTime || now >= eventDateTime) {
          continue;
        }

        const reminderAt = new Date(eventDateTime.getTime() - 30 * 60 * 1000);
        if (now < reminderAt) {
          continue;
        }

        sendingReminderIds.current.add(item.id);

        try {
          const response = await fetch('/api/reminders', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              title: item.title,
              date: item.date,
              startTime: item.startTime ?? item.time,
              durationHours: item.durationHours,
              location: item.location,
              description: item.description,
              reminderEmail: item.reminderEmail,
            }),
          });

          const result = (await response.json().catch(() => null)) as { error?: string } | null;
          if (!response.ok) {
            throw new Error(result?.error ?? 'Unable to send reminder email.');
          }

          if (!isCancelled) {
            setAgendaItems((current) =>
              current.map((entry) =>
                entry.id === item.id
                  ? {
                      ...entry,
                      reminderSentAt: new Date().toISOString(),
                    }
                  : entry,
              ),
            );
            setReminderNotice(`Reminder sent for “${item.title}”.`);
          }
        } catch (error) {
          if (!isCancelled) {
            setReminderNotice((error as Error).message);
          }
        } finally {
          sendingReminderIds.current.delete(item.id);
        }
      }
    };

    void checkReminders();
    const intervalId = window.setInterval(() => {
      void checkReminders();
    }, 60_000);

    return () => {
      isCancelled = true;
      window.clearInterval(intervalId);
    };
  }, [agendaItems, isHydrated]);

  const monthGrid = useMemo(() => getMonthGrid(YEAR, currentMonth), [currentMonth]);

  const itemsByDate = useMemo(() => {
    return agendaItems.reduce<Record<string, AgendaItem[]>>((acc, item) => {
      if (!acc[item.date]) {
        acc[item.date] = [];
      }
      acc[item.date].push(item);
      return acc;
    }, {});
  }, [agendaItems]);

  const selectedItems = useMemo(() => sortItems(itemsByDate[selectedDate] ?? []), [itemsByDate, selectedDate]);

  const monthItems = useMemo(() => {
    const prefix = `${YEAR}-${pad(currentMonth + 1)}`;
    const filtered = agendaItems.filter((item) => item.date.startsWith(prefix));
    const search = searchTerm.trim().toLowerCase();

    if (!search) {
      return sortItems(filtered);
    }

    return sortItems(
      filtered.filter((item) =>
        [
          item.title,
          item.location,
          item.description,
          item.startTime,
          item.reminderEmail,
          CATEGORY_META[item.category ?? 'project'].label,
        ]
          .filter(Boolean)
          .some((value) => value!.toLowerCase().includes(search)),
      ),
    );
  }, [agendaItems, currentMonth, searchTerm]);

  const summaryStats = useMemo(() => {
    const monthCount = monthItems.length;
    const busyDays = new Set(monthItems.map((item) => item.date)).size;
    return { monthCount, busyDays };
  }, [monthItems]);

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const title = form.title.trim();
    if (!title) {
      return;
    }

    const parsedDuration = Number(form.durationHours);
    const durationHours = Number.isFinite(parsedDuration) && parsedDuration > 0 ? parsedDuration : undefined;
    const reminderEmail = form.reminderEnabled ? form.reminderEmail.trim() : '';
    const reminderEnabled = Boolean(form.reminderEnabled && reminderEmail && form.startTime);

    const item: AgendaItem = {
      id: editingId ?? crypto.randomUUID(),
      date: selectedDate,
      title,
      time: form.startTime || undefined,
      startTime: form.startTime || undefined,
      durationHours,
      location: form.location.trim() || undefined,
      description: form.description.trim() || undefined,
      category: form.category,
      reminderEmail: reminderEmail || undefined,
      reminderEnabled,
      reminderSentAt: undefined,
    };

    setAgendaItems((current) => {
      const next = editingId ? current.map((entry) => (entry.id === editingId ? item : entry)) : [...current, item];
      return sortItems(next);
    });

    setReminderNotice(reminderEnabled ? 'Reminder armed. Keep this page open near the event time so the email can be triggered.' : '');
    setEditingId(null);
    setForm(emptyForm());
    setLocationSuggestions([]);
  };

  const startEditing = (item: AgendaItem) => {
    setEditingId(item.id);
    setSelectedDate(item.date);
    setCurrentMonth(Number(item.date.split('-')[1]) - 1);
    setForm({
      title: item.title,
      startTime: item.startTime ?? item.time ?? '',
      durationHours: item.durationHours ? String(item.durationHours) : '1',
      location: item.location ?? '',
      description: item.description ?? '',
      category: item.category ?? 'project',
      reminderEmail: item.reminderEmail ?? '',
      reminderEnabled: Boolean(item.reminderEnabled && item.reminderEmail),
    });
    setReminderNotice('');
  };

  const deleteItem = (id: string) => {
    setAgendaItems((current) => current.filter((item) => item.id !== id));
    if (editingId === id) {
      setEditingId(null);
      setForm(emptyForm());
      setLocationSuggestions([]);
    }
  };

  const monthOverview = MONTHS.map((label, index) => {
    const prefix = `${YEAR}-${pad(index + 1)}`;
    const count = agendaItems.filter((item) => item.date.startsWith(prefix)).length;
    return { label, index, count };
  });

  const selectedDateEventCount = selectedItems.length;
  const todayDateKey = toDateKey(YEAR, getInitialMonth(), today.getFullYear() === YEAR ? today.getDate() : 1);

  return (
    <div className="min-h-screen px-4 py-6 text-slate-800 sm:px-6 lg:px-8">
      <div className="mx-auto flex max-w-7xl flex-col gap-6">
        <section className="rounded-[2rem] border border-white/70 bg-white/80 p-6 shadow-card backdrop-blur xl:p-8">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div className="space-y-3">
              <span className="inline-flex rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">
                2026 Planner
              </span>
              <div>
                <h1 className="text-3xl font-semibold tracking-tight text-slate-900 sm:text-4xl">2026 Agenda Calendar</h1>
                <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600 sm:text-base">
                  A calm monthly planner for project organization, travel schedules, and daily agenda writing.
                </p>
              </div>
            </div>
            <div className="grid gap-3 rounded-3xl border border-slate-200 bg-slate-50/70 p-4 sm:grid-cols-2">
              <div>
                <p className="text-xs font-medium uppercase tracking-[0.2em] text-slate-500">Month focus</p>
                <p className="mt-1 text-2xl font-semibold text-slate-900">{summaryStats.monthCount}</p>
                <p className="text-sm text-slate-500">agenda items this month</p>
              </div>
              <div>
                <p className="text-xs font-medium uppercase tracking-[0.2em] text-slate-500">Busy days</p>
                <p className="mt-1 text-2xl font-semibold text-slate-900">{summaryStats.busyDays}</p>
                <p className="text-sm text-slate-500">days with notes or plans</p>
              </div>
            </div>
          </div>
        </section>

        <div className="grid gap-6 xl:grid-cols-[1.45fr_0.9fr]">
          <section className="space-y-5 rounded-[2rem] border border-white/70 bg-white/80 p-5 shadow-card backdrop-blur sm:p-6">
            <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
              <div>
                <p className="text-sm font-medium uppercase tracking-[0.22em] text-slate-500">Monthly calendar</p>
                <h2 className="mt-1 text-2xl font-semibold text-slate-900">
                  {MONTHS[currentMonth]} {YEAR}
                </h2>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={() => setCurrentMonth((value) => (value === 0 ? 11 : value - 1))}
                  className="rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:border-slate-300 hover:bg-slate-50"
                >
                  ← Previous
                </button>
                <button
                  type="button"
                  onClick={() => setCurrentMonth(getInitialMonth())}
                  className="rounded-full border border-slate-200 bg-slate-50 px-4 py-2 text-sm font-medium text-slate-700 transition hover:border-slate-300"
                >
                  Today month
                </button>
                <button
                  type="button"
                  onClick={() => setCurrentMonth((value) => (value === 11 ? 0 : value + 1))}
                  className="rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:border-slate-300 hover:bg-slate-50"
                >
                  Next →
                </button>
              </div>
            </div>

            <div className="grid gap-2 rounded-[1.75rem] bg-stone-100/80 p-3 sm:p-4">
              <div className="grid grid-cols-7 gap-2">
                {WEEK_DAYS.map((day) => (
                  <div key={day} className="px-2 py-3 text-center text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                    {day}
                  </div>
                ))}
              </div>
              <div className="grid grid-cols-7 gap-2">
                {monthGrid.map((entry, index) => {
                  if (!entry) {
                    return <div key={`empty-${index}`} className="min-h-28 rounded-3xl border border-dashed border-transparent bg-transparent" />;
                  }

                  const dayItems = sortItems(itemsByDate[entry.dateKey] ?? []);
                  const count = dayItems.length;
                  const isSelected = entry.dateKey === selectedDate;
                  const isTodayMonth = entry.dateKey === todayDateKey;

                  return (
                    <button
                      key={entry.dateKey}
                      type="button"
                      onClick={() => {
                        setSelectedDate(entry.dateKey);
                        setEditingId(null);
                        setForm(emptyForm());
                        setLocationSuggestions([]);
                        setReminderNotice('');
                      }}
                      className={`min-h-28 rounded-3xl border p-3 text-left transition ${
                        isSelected
                          ? 'border-slate-900 bg-slate-900 text-white shadow-lg'
                          : 'border-white/70 bg-white text-slate-700 hover:-translate-y-0.5 hover:border-slate-200 hover:shadow-md'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <span
                          className={`inline-flex h-8 w-8 items-center justify-center rounded-full text-sm font-semibold ${
                            isSelected ? 'bg-white/15 text-white' : isTodayMonth ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-700'
                          }`}
                        >
                          {entry.dayNumber}
                        </span>
                        {count > 0 ? (
                          <span className={`rounded-full px-2 py-1 text-xs font-semibold ${isSelected ? 'bg-white/15 text-white' : 'bg-slate-100 text-slate-600'}`}>
                            +{count}
                          </span>
                        ) : null}
                      </div>
                      <div className="mt-6 space-y-2">
                        <div className="flex flex-wrap gap-1.5">
                          {dayItems.slice(0, 3).map((item) => (
                            <span
                              key={item.id}
                              className={`h-2.5 w-2.5 rounded-full ${isSelected ? 'bg-white' : CATEGORY_META[item.category ?? 'project'].dot}`}
                              title={item.title}
                            />
                          ))}
                        </div>
                        <p className={`line-clamp-2 text-xs leading-5 ${isSelected ? 'text-white/80' : 'text-slate-500'}`}>
                          {dayItems.slice(0, 2).map((item) => item.title).join(' · ') || 'No agenda yet'}
                        </p>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="rounded-[1.75rem] border border-slate-200 bg-slate-50/80 p-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h3 className="text-lg font-semibold text-slate-900">2026 Month Overview</h3>
                  <p className="text-sm text-slate-500">Jump between months and see which ones are already planned.</p>
                </div>
                <input
                  value={searchTerm}
                  onChange={(event) => setSearchTerm(event.target.value)}
                  placeholder="Search this month"
                  className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm outline-none ring-0 transition placeholder:text-slate-400 focus:border-slate-400 sm:max-w-56"
                />
              </div>
              <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                {monthOverview.map((month) => (
                  <button
                    key={month.label}
                    type="button"
                    onClick={() => setCurrentMonth(month.index)}
                    className={`flex items-center justify-between rounded-2xl border px-4 py-3 text-left transition ${
                      month.index === currentMonth
                        ? 'border-slate-900 bg-slate-900 text-white'
                        : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300'
                    }`}
                  >
                    <span>
                      <span className="block text-sm font-semibold">{month.label}</span>
                      <span className={`text-xs ${month.index === currentMonth ? 'text-white/70' : 'text-slate-500'}`}>{month.count} items</span>
                    </span>
                    <span className={`h-2.5 w-2.5 rounded-full ${month.count > 0 ? (month.index === currentMonth ? 'bg-white' : 'bg-amber-500') : 'bg-slate-300'}`} />
                  </button>
                ))}
              </div>
            </div>
          </section>

          <aside className="space-y-5 rounded-[2rem] border border-white/70 bg-white/80 p-5 shadow-card backdrop-blur sm:p-6">
            <div className="rounded-[1.75rem] border border-slate-200 bg-slate-50/80 p-4">
              <p className="text-sm font-medium uppercase tracking-[0.22em] text-slate-500">Selected day</p>
              <h2 className="mt-2 text-2xl font-semibold text-slate-900">{formatLongDate(selectedDate)}</h2>
              <p className="mt-2 text-sm text-slate-500">
                {selectedDateEventCount} item(s) planned. Click any day to write agenda details for deadlines, trips, checklists, or personal plans.
              </p>
            </div>

            {reminderNotice ? (
              <div className="rounded-[1.5rem] border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                {reminderNotice}
              </div>
            ) : null}

            <div className="rounded-[1.75rem] border border-slate-200 bg-white p-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-semibold text-slate-900">Agenda for the day</h3>
                  <p className="text-sm text-slate-500">{selectedItems.length} item(s) scheduled.</p>
                </div>
                {editingId ? (
                  <button
                    type="button"
                    onClick={() => {
                      setEditingId(null);
                      setForm(emptyForm());
                      setLocationSuggestions([]);
                      setReminderNotice('');
                    }}
                    className="rounded-full border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600"
                  >
                    Cancel edit
                  </button>
                ) : null}
              </div>

              <div className="mt-4 space-y-3">
                {selectedItems.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-sm text-slate-500">
                    No agenda yet for this day. Add a plan using the form below.
                  </div>
                ) : (
                  selectedItems.map((item) => {
                    const meta = CATEGORY_META[item.category ?? 'project'];
                    const scheduleLabel = formatSchedule(item);
                    return (
                      <article key={item.id} className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
                        <div className="flex items-start justify-between gap-3">
                          <div className="space-y-2">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${meta.badge}`}>
                                {meta.label}
                              </span>
                              {scheduleLabel ? <span className="text-xs font-medium text-slate-500">{scheduleLabel}</span> : null}
                              {item.reminderEnabled && item.reminderEmail ? (
                                <span className="text-xs font-medium text-amber-700">⏰ {item.reminderEmail}</span>
                              ) : null}
                            </div>
                            <h4 className="text-base font-semibold text-slate-900">{item.title}</h4>
                            {item.location ? <p className="text-sm text-slate-600">📍 {item.location}</p> : null}
                            {item.description ? <p className="text-sm leading-6 text-slate-500">{item.description}</p> : null}
                          </div>
                          <div className="flex gap-2">
                            <button type="button" onClick={() => startEditing(item)} className="rounded-full border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 transition hover:border-slate-300">
                              Edit
                            </button>
                            <button type="button" onClick={() => deleteItem(item.id)} className="rounded-full border border-red-200 px-3 py-1.5 text-xs font-semibold text-red-600 transition hover:bg-red-50">
                              Delete
                            </button>
                          </div>
                        </div>
                      </article>
                    );
                  })
                )}
              </div>
            </div>

            <form onSubmit={handleSubmit} className="rounded-[1.75rem] border border-slate-200 bg-slate-50/80 p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h3 className="text-lg font-semibold text-slate-900">{editingId ? 'Edit agenda item' : 'Create agenda item'}</h3>
                  <p className="text-sm text-slate-500">Save it locally so refreshes keep your 2026 plans.</p>
                </div>
                <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-slate-500">localStorage</span>
              </div>

              <div className="mt-4 grid gap-4">
                <label className="grid gap-2 text-sm font-medium text-slate-700">
                  Title
                  <input
                    required
                    value={form.title}
                    onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))}
                    className="rounded-2xl border border-slate-200 bg-white px-4 py-3 outline-none transition placeholder:text-slate-400 focus:border-slate-400"
                    placeholder="Project review, flight, checklist..."
                  />
                </label>

                <div className="grid gap-4 sm:grid-cols-[1.1fr_0.9fr]">
                  <label className="grid gap-2 text-sm font-medium text-slate-700">
                    Start time
                    <select
                      value={form.startTime}
                      onChange={(event) => setForm((current) => ({ ...current, startTime: event.target.value }))}
                      className="rounded-2xl border border-slate-200 bg-white px-4 py-3 outline-none transition focus:border-slate-400"
                    >
                      <option value="">Choose a start time</option>
                      {TIME_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="grid gap-2 text-sm font-medium text-slate-700">
                    Duration (hours)
                    <input
                      type="number"
                      min="0.5"
                      step="0.5"
                      value={form.durationHours}
                      onChange={(event) => setForm((current) => ({ ...current, durationHours: event.target.value }))}
                      className="rounded-2xl border border-slate-200 bg-white px-4 py-3 outline-none transition placeholder:text-slate-400 focus:border-slate-400"
                      placeholder="1.5"
                    />
                  </label>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="grid gap-2 text-sm font-medium text-slate-700">
                    Category
                    <select
                      value={form.category}
                      onChange={(event) => setForm((current) => ({ ...current, category: event.target.value as AgendaCategory }))}
                      className="rounded-2xl border border-slate-200 bg-white px-4 py-3 outline-none transition focus:border-slate-400"
                    >
                      {Object.entries(CATEGORY_META).map(([key, meta]) => (
                        <option key={key} value={key}>
                          {meta.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="grid gap-2 text-sm font-medium text-slate-700">
                    Reminder email
                    <input
                      type="email"
                      value={form.reminderEmail}
                      onChange={(event) => setForm((current) => ({ ...current, reminderEmail: event.target.value }))}
                      className="rounded-2xl border border-slate-200 bg-white px-4 py-3 outline-none transition placeholder:text-slate-400 focus:border-slate-400"
                      placeholder="name@example.com"
                    />
                  </label>
                </div>

                <label className="grid gap-2 text-sm font-medium text-slate-700">
                  Location
                  <input
                    value={form.location}
                    onChange={(event) => setForm((current) => ({ ...current, location: event.target.value }))}
                    className="rounded-2xl border border-slate-200 bg-white px-4 py-3 outline-none transition placeholder:text-slate-400 focus:border-slate-400"
                    placeholder="Meeting room, airport, city..."
                  />
                </label>
                {locationSuggestions.length > 0 ? (
                  <div className="rounded-2xl border border-slate-200 bg-white p-2">
                    <p className="px-2 pb-2 text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Location suggestions</p>
                    <div className="space-y-1">
                      {locationSuggestions.map((suggestion) => (
                        <button
                          key={`${suggestion.lat}-${suggestion.lon}`}
                          type="button"
                          onClick={() => {
                            setForm((current) => ({ ...current, location: suggestion.displayName }));
                            setLocationSuggestions([]);
                            setLocationStatus('idle');
                          }}
                          className="flex w-full items-start justify-between rounded-2xl px-3 py-2 text-left text-sm text-slate-600 transition hover:bg-slate-50"
                        >
                          <span>{suggestion.displayName}</span>
                          <span className="ml-3 shrink-0 text-xs text-slate-400">Use</span>
                        </button>
                      ))}
                    </div>
                  </div>
                ) : null}
                {locationStatus === 'loading' ? <p className="text-xs text-slate-400">Searching matching places…</p> : null}
                {locationStatus === 'error' ? <p className="text-xs text-red-500">Location lookup failed. You can still type a location manually.</p> : null}

                <label className="flex items-start gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-600">
                  <input
                    type="checkbox"
                    checked={form.reminderEnabled}
                    onChange={(event) => setForm((current) => ({ ...current, reminderEnabled: event.target.checked }))}
                    className="mt-1 h-4 w-4 rounded border-slate-300 text-slate-900 focus:ring-slate-400"
                  />
                  <span>
                    <span className="block font-semibold text-slate-700">Email reminder 30 minutes before start</span>
                    <span className="mt-1 block text-xs leading-5 text-slate-500">
                      Requires a start time, a reminder email, and configured SMTP environment variables. The current browser tab must remain open so the reminder can be triggered.
                    </span>
                  </span>
                </label>

                <label className="grid gap-2 text-sm font-medium text-slate-700">
                  Notes
                  <textarea
                    value={form.description}
                    onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))}
                    className="min-h-28 rounded-2xl border border-slate-200 bg-white px-4 py-3 outline-none transition placeholder:text-slate-400 focus:border-slate-400"
                    placeholder="Add deadlines, travel details, to-do context, or reminders."
                  />
                </label>

                <div className="flex flex-wrap items-center gap-3">
                  <button type="submit" className="rounded-full bg-slate-900 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800">
                    {editingId ? 'Update agenda' : 'Save agenda'}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setEditingId(null);
                      setForm(emptyForm());
                      setLocationSuggestions([]);
                      setReminderNotice('');
                    }}
                    className="rounded-full border border-slate-200 bg-white px-5 py-3 text-sm font-semibold text-slate-600 transition hover:border-slate-300"
                  >
                    Clear form
                  </button>
                </div>
              </div>
            </form>

            <div className="rounded-[1.75rem] border border-slate-200 bg-white p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h3 className="text-lg font-semibold text-slate-900">Monthly agenda list</h3>
                  <p className="text-sm text-slate-500">
                    All scheduled entries for {MONTHS[currentMonth]} {YEAR}.
                  </p>
                </div>
                <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-500">{monthItems.length} items</span>
              </div>
              <div className="mt-4 space-y-3">
                {monthItems.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-sm text-slate-500">
                    No results for this month yet{searchTerm ? ' or matching your search' : ''}.
                  </div>
                ) : (
                  monthItems.map((item) => {
                    const meta = CATEGORY_META[item.category ?? 'project'];
                    return (
                      <button
                        type="button"
                        key={item.id}
                        onClick={() => {
                          setSelectedDate(item.date);
                          startEditing(item);
                        }}
                        className="flex w-full items-start justify-between rounded-2xl border border-slate-200 bg-slate-50/70 px-4 py-3 text-left transition hover:border-slate-300"
                      >
                        <div>
                          <p className="text-sm font-semibold text-slate-900">
                            {formatDateHeading(item.date)} · {item.title}
                          </p>
                          <p className="mt-1 text-sm text-slate-500">
                            {[formatSchedule(item), item.location, item.description].filter(Boolean).join(' · ') || 'No extra notes'}
                          </p>
                        </div>
                        <span className={`ml-3 inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${meta.badge}`}>
                          {meta.label}
                        </span>
                      </button>
                    );
                  })
                )}
              </div>
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}
