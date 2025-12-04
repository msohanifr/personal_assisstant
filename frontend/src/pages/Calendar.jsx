// frontend/src/pages/Calendar.jsx
import React, { useEffect, useMemo, useState } from "react";
import {
  FaCalendarAlt,
  FaChevronLeft,
  FaChevronRight,
  FaListUl,
  FaPlay,
  FaPause,
  FaRegClock,
  FaTag,
  FaTrash,
  FaUndo,
} from "react-icons/fa";
import client from "../api/client";

const EMPTY_EVENT = {
  title: "",
  description: "",
  start: "",
  end: "",
  location: "",
};

const VIEWS = ["month", "week", "day", "agenda", "marketing"];

const HOURS_START = 6;
const HOURS_END = 22;
const PIXELS_PER_MINUTE = 0.8;

/* ---------- Date helpers ---------- */

function sameDay(a, b) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function startOfDay(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function endOfDay(date) {
  const d = new Date(date);
  d.setHours(23, 59, 59, 999);
  return d;
}

function startOfWeek(date) {
  const d = startOfDay(date);
  const day = d.getDay(); // 0 = Sun
  d.setDate(d.getDate() - day);
  return d;
}

function addDays(date, amount) {
  const d = new Date(date);
  d.setDate(d.getDate() + amount);
  return d;
}

function getWeekDays(anchorDate) {
  const start = startOfWeek(anchorDate);
  return Array.from({ length: 7 }, (_, i) => addDays(start, i));
}

function getMonthMatrix(currentDate) {
  const firstOfMonth = new Date(
    currentDate.getFullYear(),
    currentDate.getMonth(),
    1
  );
  const start = startOfWeek(firstOfMonth);
  const matrix = [];
  let cursor = start;

  for (let week = 0; week < 6; week++) {
    const row = [];
    for (let day = 0; day < 7; day++) {
      row.push(new Date(cursor));
      cursor = addDays(cursor, 1);
    }
    matrix.push(row);
  }
  return matrix;
}

function groupEventsByDay(events) {
  const map = new Map();
  events.forEach((ev) => {
    const key = startOfDay(ev._startDate).toISOString();
    if (!map.has(key)) {
      map.set(key, []);
    }
    map.get(key).push(ev);
  });
  map.forEach((list) =>
    list.sort((a, b) => a._startDate.getTime() - b._startDate.getTime())
  );
  return map;
}

// format Date → value for <input type="datetime-local">
function toLocalInputValue(date) {
  if (!date) return "";
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n) => String(n).padStart(2, "0");
  const year = d.getFullYear();
  const month = pad(d.getMonth() + 1);
  const day = pad(d.getDate());
  const hour = pad(d.getHours());
  const minute = pad(d.getMinutes());
  return `${year}-${month}-${day}T${hour}:${minute}`;
}

/* ---------- Lightweight channel classification + color ---------- */

// Rough marketing channel classification based on title/description
function classifyChannel(event) {
  const text = `${event.title} ${event.description} ${event.location}`.toLowerCase();
  if (
    text.includes("instagram") ||
    text.includes("ig") ||
    text.includes("tiktok") ||
    text.includes("reel") ||
    text.includes("social")
  ) {
    return "Social";
  }
  if (text.includes("newsletter") || text.includes("email")) {
    return "Email";
  }
  if (text.includes("blog") || text.includes("landing") || text.includes("page")) {
    return "Website";
  }
  return "Other";
}

function getEventColorClass(event) {
  const ch = classifyChannel(event);
  if (ch === "Social") return "calendar-event-color-social";
  if (ch === "Email") return "calendar-event-color-email";
  if (ch === "Website") return "calendar-event-color-website";
  return "calendar-event-color-other";
}

/* ---------- Pomodoro hook ---------- */

function usePomodoro(initialMinutes = 25) {
  const [minutes, setMinutes] = useState(initialMinutes);
  const [seconds, setSeconds] = useState(0);
  const [running, setRunning] = useState(false);

  useEffect(() => {
    if (!running) return;

    const id = setInterval(() => {
      setSeconds((prev) => {
        if (prev === 0) {
          if (minutes === 0) {
            setRunning(false);
            return 0;
          }
          setMinutes((m) => m - 1);
          return 59;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(id);
  }, [running, minutes]);

  const reset = () => {
    setRunning(false);
    setMinutes(initialMinutes);
    setSeconds(0);
  };

  const toggle = () => setRunning((r) => !r);

  const label = `${String(minutes).padStart(2, "0")}:${String(
    seconds
  ).padStart(2, "0")}`;

  return { label, running, reset, toggle };
}

/* ---------- Calendar page ---------- */

const Calendar = () => {
  const [events, setEvents] = useState([]);
  const [form, setForm] = useState(EMPTY_EVENT);
  const [editingEventId, setEditingEventId] = useState(null);
  const [syncingGoogle, setSyncingGoogle] = useState(false);
  const [syncStatus, setSyncStatus] = useState("");
  const [connectingGoogle, setConnectingGoogle] = useState(false);
  const [dropHoverDate, setDropHoverDate] = useState(null);
  const [dropDurationMinutes, setDropDurationMinutes] = useState(60);
  const [quickAddText, setQuickAddText] = useState("");
  const [quickAddRecurring, setQuickAddRecurring] = useState(false);
  const [remindersMap, setRemindersMap] = useState(() => {
    try {
      const raw = localStorage.getItem("assistant_event_reminders_v1");
      return raw ? JSON.parse(raw) : {};
    } catch {
      return {};
    }
  });
  const [notificationsEnabled, setNotificationsEnabled] = useState(
    Notification?.permission === "granted"
  );
  const [sourceFilters, setSourceFilters] = useState({
    manual: true,
    google: true,
    email_ai: true,
    task_block: true,
    quick_add: true,
  });

  const [view, setView] = useState("week"); // Fantastical-like default
  const [currentDate, setCurrentDate] = useState(() => startOfDay(new Date()));
  const [selectedDate, setSelectedDate] = useState(() =>
    startOfDay(new Date())
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [showEventForm, setShowEventForm] = useState(false); // 👈 NEW

    const [resizingEventId, setResizingEventId] = useState(null);
  const [resizingData, setResizingData] = useState(null);

  const pomodoro = usePomodoro(25);

    const saveResizedEvent = async (ev) => {
    try {
      await client.put(`/events/${ev.id}/`, {
        title: ev.title,
        description: ev.description,
        location: ev.location,
        start: ev._startDate.toISOString(),
        end: ev._endDate.toISOString(),
      });
    } catch (err) {
      console.error("[Calendar] Failed to save resized event:", err);
      setError("Could not update event time. Please try again.");
    }
  };

    const handleResizeStart = (date, ev, mouseEvent) => {
    // Only allow resizing real events, not the draft placeholder
    if (ev.id === "__draft__") return;

    const day = startOfDay(date);

    setResizingEventId(ev.id);
    setResizingData({
      day,
      eventId: ev.id,
      originalStart: ev._startDate,
      originalEnd: ev._endDate,
      startClientY: mouseEvent.clientY,
    });

    // Prevent text selection while dragging
    mouseEvent.preventDefault();
    mouseEvent.stopPropagation();
  };

  const loadEvents = async () => {
    try {
      setLoading(true);
      setError("");
      const res = await client.get("/events/");
      const mapped = res.data.map((e) => ({
        ...e,
        _startDate: new Date(e.start),
        _endDate: new Date(e.end),
      }));
      setEvents(mapped);
    } catch (err) {
      console.error("[Calendar] Failed to load events:", err);
      setError("Could not load events. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadEvents();
  }, []);

  const handleTaskDropOnDate = async (date, dataTransfer) => {
    const taskIdStr = dataTransfer.getData("text/task-id");
    const taskId = Number(taskIdStr);
    if (!Number.isFinite(taskId)) return;
    const start = new Date(date);
    start.setHours(9, 0, 0, 0);
    const end = new Date(start.getTime() + dropDurationMinutes * 60 * 1000);
    try {
      const taskRes = await client.get(`/tasks/${taskId}/`);
      const task = taskRes.data;
      await client.post("/events/", {
        title: task.title,
        description: task.description || "",
        start: start.toISOString(),
        end: end.toISOString(),
        location: "",
        source: "task_block",
      });
      setSyncStatus("Time blocked from task.");
      loadEvents();
    } catch (err) {
      console.error("[Calendar] Failed to create event from task drop:", err);
      setError("Failed to create event from task drop.");
    } finally {
      setDropHoverDate(null);
    }
  };

  // Reminder checker (local notifications)
  useEffect(() => {
    if (!notificationsEnabled || typeof Notification === "undefined") return undefined;
    const id = setInterval(() => {
      const now = Date.now();
      events.forEach((ev) => {
        const reminderMin = remindersMap[ev.id];
        if (!reminderMin) return;
        const start = new Date(ev.start).getTime();
        const trigger = start - reminderMin * 60 * 1000;
        if (trigger <= now && start > now) {
          try {
            new Notification("Upcoming event", {
              body: `${ev.title} at ${new Date(ev.start).toLocaleTimeString([], {
                hour: "2-digit",
                minute: "2-digit",
              })}`,
            });
          } catch (err) {
            console.warn("Notification failed:", err);
          }
          const nextMap = { ...remindersMap };
          delete nextMap[ev.id];
          setRemindersMap(nextMap);
          localStorage.setItem("assistant_event_reminders_v1", JSON.stringify(nextMap));
        }
      });
    }, 30_000);
    return () => clearInterval(id);
  }, [events, remindersMap, notificationsEnabled]);

  const handleSyncGoogle = async () => {
    setSyncStatus("");
    setSyncingGoogle(true);
    try {
      const res = await client.post("/events/sync-google/");
      const { created = 0, updated = 0 } = res.data || {};
      setSyncStatus(`Synced: +${created} new, ${updated} updated from Google`);
      await loadEvents();
    } catch (err) {
      console.error("[Calendar] Google sync failed:", err);
      setError("Google Calendar sync failed. Check backend env and logs.");
    } finally {
      setSyncingGoogle(false);
    }
  };

  const handleConnectGoogle = async () => {
    setConnectingGoogle(true);
    setError("");
    try {
      const res = await client.get("/google/oauth/start/");
      const url = res.data?.auth_url;
      if (!url) {
        setError("Failed to start Google OAuth (no url).");
        return;
      }
      window.open(url, "_blank", "width=500,height=700");
    } catch (err) {
      console.error("[Calendar] Google connect failed:", err);
      setError("Failed to start Google OAuth. Check backend config.");
    } finally {
      setConnectingGoogle(false);
    }
  };

  const handleRequestNotifications = async () => {
    if (typeof Notification === "undefined") {
      alert("Notifications are not supported in this browser.");
      return;
    }
    if (Notification.permission === "granted") {
      setNotificationsEnabled(true);
      return;
    }
    const perm = await Notification.requestPermission();
    setNotificationsEnabled(perm === "granted");
  };

  const saveReminderForEvent = (eventId, minutes) => {
    const next = { ...remindersMap, [eventId]: minutes };
    setRemindersMap(next);
    localStorage.setItem("assistant_event_reminders_v1", JSON.stringify(next));
  };

    useEffect(() => {
    if (!resizingEventId || !resizingData) return;

    const handleMouseMove = (e) => {
      const deltaY = e.clientY - resizingData.startClientY;
      // Convert pixels → minutes, snap to 15 min
      const rawDeltaMinutes = deltaY / PIXELS_PER_MINUTE;
      const snappedDelta =
        Math.round(rawDeltaMinutes / 15) * 15;

      const originalEnd = resizingData.originalEnd;
      const newEnd = new Date(originalEnd);
      newEnd.setMinutes(originalEnd.getMinutes() + snappedDelta);

      // Clamp into the visible day range
      const dayStart = new Date(resizingData.day);
      dayStart.setHours(HOURS_START, 0, 0, 0);
      const dayEnd = new Date(resizingData.day);
      dayEnd.setHours(HOURS_END, 59, 59, 999);

      if (newEnd < dayStart) newEnd.setTime(dayStart.getTime());
      if (newEnd > dayEnd) newEnd.setTime(dayEnd.getTime());

      setEvents((prev) =>
        prev.map((ev) =>
          ev.id === resizingEventId ? { ...ev, _endDate: newEnd } : ev
        )
      );
    };

    const handleMouseUp = async () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);

      const updated = events.find((ev) => ev.id === resizingEventId);
      if (updated) {
        await saveResizedEvent(updated);
      }

      setResizingEventId(null);
      setResizingData(null);
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);

    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [resizingEventId, resizingData, events]);

  const resetForm = () => {
    setForm(EMPTY_EVENT);
    setEditingEventId(null);
    setShowEventForm(false); // 👈 hide form
  };

  const handleFieldChange = (e) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  };

const handleSubmitEvent = async (e) => {
  e.preventDefault();
  setError("");

  if (!form.title || !form.start || !form.end) {
    setError("Please provide at least title, start and end time.");
    return;
  }

  // 🔧 Normalize local datetime-local strings → ISO UTC for backend
  const startDate = new Date(form.start);
  const endDate = new Date(form.end);

  if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
    setError("Invalid date/time selected.");
    return;
  }

  const payload = {
    ...form,
    start: startDate.toISOString(),
    end: endDate.toISOString(),
  };

  try {
    if (editingEventId) {
      await client.put(`/events/${editingEventId}/`, payload);
      if (remindersMap[editingEventId]) {
        saveReminderForEvent(editingEventId, remindersMap[editingEventId]);
      }
    } else {
      const res = await client.post("/events/", payload);
      const newId = res.data?.id;
      if (newId && remindersMap[newId]) {
        saveReminderForEvent(newId, remindersMap[newId]);
      }
    }
    resetForm();
    await loadEvents();
  } catch (err) {
    console.error("[Calendar] Failed to save event:", err);
    setError("Could not save event. Please try again.");
  }
};

  const handleDeleteEvent = async () => {
    if (!editingEventId) return;
    const ok = window.confirm("Delete this event?");
    if (!ok) return;

    try {
      await client.delete(`/events/${editingEventId}/`);
      resetForm();
      await loadEvents();
    } catch (err) {
      console.error("[Calendar] Failed to delete event:", err);
      setError("Could not delete event. Please try again.");
    }
  };

  const handlePrev = () => {
    if (view === "month") {
      const d = new Date(currentDate);
      d.setMonth(d.getMonth() - 1);
      setCurrentDate(d);
    } else if (view === "week" || view === "agenda" || view === "marketing") {
      setCurrentDate((d) => addDays(d, -7));
    } else if (view === "day") {
      setCurrentDate((d) => addDays(d, -1));
    }
  };

  const handleNext = () => {
    if (view === "month") {
      const d = new Date(currentDate);
      d.setMonth(d.getMonth() + 1);
      setCurrentDate(d);
    } else if (view === "week" || view === "agenda" || view === "marketing") {
      setCurrentDate((d) => addDays(d, 7));
    } else if (view === "day") {
      setCurrentDate((d) => addDays(d, 1));
    }
  };

  const beginQuickSlot = (start, end) => {
    setSelectedDate(startOfDay(start));
    setCurrentDate(startOfDay(start));
    setEditingEventId(null);
    setForm((prev) => ({
      ...EMPTY_EVENT,
      ...prev, // keep description/location if user already typed
      start: toLocalInputValue(start),
      end: toLocalInputValue(end),
    }));
    setShowEventForm(true);
  };

  const handleToday = () => {
    const today = startOfDay(new Date());
    setCurrentDate(today);
    setSelectedDate(today);

    const start = new Date(today);
    start.setHours(9, 0, 0, 0);
    const end = new Date(today);
    end.setHours(10, 0, 0, 0);
    beginQuickSlot(start, end);
  };

  const handleViewChange = (nextView) => setView(nextView);

  // Click on a date in grid → go to that day + prefill
  const handleDayClick = (date) => {
    const day = startOfDay(date);
    setSelectedDate(day);
    setCurrentDate(day);
    setView("day");

    const start = new Date(day);
    start.setHours(9, 0, 0, 0);
    const end = new Date(day);
    end.setHours(10, 0, 0, 0);
    beginQuickSlot(start, end);
  };

  // Double-click in month → quick new event
  const handleQuickNewForDate = (date) => {
    const day = startOfDay(date);
    const start = new Date(day);
    start.setHours(9, 0, 0, 0);
    const end = new Date(day);
    end.setHours(10, 0, 0, 0);
    setView("day");
    beginQuickSlot(start, end);
  };

  // Click on specific hour slot in week view → quick new event
  const handleTimeSlotClick = (date, hour) => {
    const day = startOfDay(date);
    const start = new Date(day);
    start.setHours(hour, 0, 0, 0);
    const end = new Date(start);
    end.setHours(hour + 1);
    beginQuickSlot(start, end);
  };

  const handleEditEvent = (ev) => {
    setEditingEventId(ev.id);
    const day = startOfDay(ev._startDate);
    setSelectedDate(day);
    setCurrentDate(day);

    setForm({
      title: ev.title || "",
      description: ev.description || "",
      location: ev.location || "",
      start: toLocalInputValue(ev._startDate),
      end: toLocalInputValue(ev._endDate),
    });

    setShowEventForm(true);
  };

  const monthLabel = useMemo(() => {
    const formatter = new Intl.DateTimeFormat("en-US", {
      month: "long",
      year: "numeric",
    });
    return formatter.format(currentDate);
  }, [currentDate]);

  const dayLabel = useMemo(() => {
    const formatter = new Intl.DateTimeFormat("en-US", {
      weekday: "long",
      month: "short",
      day: "numeric",
    });
    return formatter.format(selectedDate);
  }, [selectedDate]);

  const weekDays = useMemo(() => getWeekDays(currentDate), [currentDate]);

  // multi-day event overlap
  const eventsForDate = (date) => {
    const dayStart = startOfDay(date);
    const dayEnd = endOfDay(date);

    return events.filter((ev) => {
      if (!sourceFilters[ev.source || "manual"]) return false;
      const evStart = ev._startDate;
      const evEnd = ev._endDate;
      if (!evStart || !evEnd) return false;
      return evStart <= dayEnd && evEnd >= dayStart;
    });
  };

  const agendaEvents = useMemo(() => {
    const weekSet = new Set(
      getWeekDays(currentDate).map((d) => startOfDay(d).toISOString())
    );
    const weekEvents = events
      .filter((ev) => sourceFilters[ev.source || "manual"])
      .filter((ev) => weekSet.has(startOfDay(ev._startDate).toISOString()));
    const grouped = groupEventsByDay(weekEvents);
    return Array.from(grouped.entries())
      .map(([iso, list]) => ({
        date: new Date(iso),
        events: list,
      }))
      .sort((a, b) => a.date.getTime() - b.date.getTime());
  }, [events, currentDate]);

  const marketingGrid = useMemo(() => {
    const channels = ["Social", "Email", "Website", "Other"];
    const days = getWeekDays(currentDate);
    const grid = {};

    channels.forEach((channel) => {
      grid[channel] = {};
      days.forEach((day) => {
        grid[channel][startOfDay(day).toISOString()] = [];
      });
    });

    events.forEach((event) => {
      const dayKey = startOfDay(event._startDate).toISOString();
      const channel = classifyChannel(event);
      if (!grid[channel] || !grid[channel][dayKey]) return;
      grid[channel][dayKey].push(event);
    });

    return { channels, days, grid };
  }, [events, currentDate]);

  // ---------- Draft event preview (for new events) ----------
  const draftEvent = useMemo(() => {
    // Only show preview while creating a *new* event,
    // not while editing an existing one.
    if (!showEventForm || editingEventId || !form.start || !form.end) {
      return null;
    }

    const start = new Date(form.start);
    const end = new Date(form.end);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
      return null;
    }

    return {
      id: "__draft__",
      title: form.title || "New event",
      _startDate: start,
      _endDate: end,
    };
  }, [showEventForm, editingEventId, form.start, form.end, form.title]);

  /* ---------- Views ---------- */

  const renderMonthView = () => {
    const matrix = getMonthMatrix(currentDate);
    const weekDayLabels = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    const currentMonth = currentDate.getMonth();

    return (
      <div className="calendar-month-view">
        <div className="calendar-weekdays-row">
          {weekDayLabels.map((label) => (
            <div key={label} className="calendar-weekday-label">
              {label}
            </div>
          ))}
        </div>
        <div className="calendar-month-grid">
          {matrix.map((week, wi) =>
            week.map((date, di) => {
              const isToday = sameDay(date, new Date());
              const isCurrentMonth = date.getMonth() === currentMonth;
              const dayEvents = eventsForDate(date);
              return (
                <button
                  key={`${wi}-${di}`}
                  type="button"
                  className={[
                    "calendar-day-cell",
                    !isCurrentMonth && "calendar-day-outside",
                    isToday && "calendar-day-today",
                    sameDay(date, selectedDate) && "calendar-day-selected",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                  onClick={() => handleDayClick(date)}
                  onDoubleClick={() => handleQuickNewForDate(date)}
                >
                  <div className="calendar-day-number">{date.getDate()}</div>
                  <div className="calendar-day-events">
                    {dayEvents.slice(0, 3).map((ev) => (
                      <div
                        key={ev.id}
                        className={
                          "calendar-event-chip " + getEventColorClass(ev)
                        }
                        title={ev.title}
                        onClick={(e) => {
                          e.stopPropagation();
                          handleEditEvent(ev);
                        }}
                      >
                        <span className="calendar-event-dot" />
                        <span className="calendar-event-title">
                          {ev.title}
                        </span>
                      </div>
                    ))}
                    {dayEvents.length > 3 && (
                      <div className="calendar-more-events">
                        +{dayEvents.length - 3} more
                      </div>
                    )}
                  </div>
                </button>
              );
            })
          )}
        </div>
      </div>
    );
  };

  const renderWeekView = () => {
    const days = weekDays;
    const hours = Array.from(
      { length: HOURS_END - HOURS_START + 1 },
      (_, i) => HOURS_START + i
    );

    return (
      <div className="calendar-week-view">
        <div className="calendar-week-grid">
          <div className="calendar-week-hours-column">
            <div className="calendar-week-header-spacer" />
            <div className="calendar-week-hours">
              {hours.map((hour) => (
                <div key={hour} className="calendar-hour-cell">
                  {hour.toString().padStart(2, "0")}:00
                </div>
              ))}
            </div>
          </div>
          {days.map((date) => {
            const isToday = sameDay(date, new Date());
            const isSelected = sameDay(date, selectedDate);
            const dayEvents = eventsForDate(date);

            // Determine whether the draft event overlaps this day
            const dayStart = startOfDay(date);
            const dayEnd = endOfDay(date);
            const draftForDay =
              draftEvent &&
                draftEvent._startDate <= dayEnd &&
                draftEvent._endDate >= dayStart
                ? draftEvent
                : null;

            // Combine real events + draft preview (if present)
            const allEvents = draftForDay
              ? [...dayEvents, draftForDay]
              : dayEvents;

            return (
              <div
                key={date.toISOString()}
                className={
                  "calendar-week-day-column " +
                  (dropHoverDate &&
                  dropHoverDate.toDateString() === date.toDateString()
                    ? "calendar-drop-hover"
                    : "")
                }
                onDragOver={(e) => {
                  if (e.dataTransfer.types.includes("text/task-id")) {
                    e.preventDefault();
                    setDropHoverDate(date);
                  }
                }}
                onDragLeave={() => setDropHoverDate(null)}
                onDrop={(e) => {
                  if (e.dataTransfer.types.includes("text/task-id")) {
                    e.preventDefault();
                    handleTaskDropOnDate(date, e.dataTransfer);
                  }
                }}
              >
                <button
                  type="button"
                  className={[
                    "calendar-week-day-header",
                    isToday && "calendar-week-day-header-today",
                    isSelected && "calendar-week-day-header-selected",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                  onClick={() => handleDayClick(date)}
                >
                  <div className="calendar-week-day-name">
                    {date.toLocaleDateString("en-US", { weekday: "short" })}
                  </div>
                  <div className="calendar-week-day-number">
                    {date.getDate()}
                  </div>
                </button>
                <div className="calendar-week-day-body">
                  {hours.map((hour) => (
                    <div
                      key={`${date.toISOString()}-${hour}`}
                      className="calendar-hour-slot"
                      onClick={() => handleTimeSlotClick(date, hour)}
                    />
                  ))}

                  {allEvents.map((ev) => {
                    // clip multi-day events to this day
                    const segmentStart =
                      ev._startDate < dayStart ? dayStart : ev._startDate;
                    const segmentEnd =
                      ev._endDate > dayEnd ? dayEnd : ev._endDate;

                    const startMinutes =
                      (segmentStart.getHours() - HOURS_START) * 60 +
                      segmentStart.getMinutes();
                    const endMinutes =
                      (segmentEnd.getHours() - HOURS_START) * 60 +
                      segmentEnd.getMinutes();

                    const top = Math.max(startMinutes * PIXELS_PER_MINUTE, 0);
                    const height = Math.max(
                      (endMinutes - startMinutes) * PIXELS_PER_MINUTE,
                      32
                    );

                    const isDraft = ev.id === "__draft__";

                    return (
                      <div
                        key={ev.id + date.toISOString()}
                        className={
                          "calendar-event-block " +
                          (isDraft
                            ? "calendar-event-block-draft"
                            : getEventColorClass(ev))
                        }
                        style={{ top, height }}
                        title={ev.title}
                        onClick={(e) => {
                          // For real events, allow editing
                          if (!isDraft) {
                            e.stopPropagation();
                            handleEditEvent(ev);
                          }
                        }}
                      >
                        <div className="calendar-event-block-title">
                          {ev.title}
                        </div>
                        <div className="calendar-event-block-time">
                          {segmentStart.toLocaleTimeString([], {
                            hour: "2-digit",
                            minute: "2-digit",
                          })}{" "}
                          -{" "}
                          {segmentEnd.toLocaleTimeString([], {
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </div>
                        {/* 🔧 Resize handle for real events */}
    {!isDraft && (
      <div
        className="calendar-event-resize-handle"
        onMouseDown={(e) => handleResizeStart(date, ev, e)}
      />
    )}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  const renderDayView = () => {
    const dayEvents = eventsForDate(selectedDate)
      .filter((ev) => sourceFilters[ev.source || "manual"])
      .sort((a, b) => a._startDate - b._startDate);

    return (
      <div className="calendar-day-view">
        <div className="calendar-day-header-row">
          <div className="calendar-day-header-title">{dayLabel}</div>
          <div className="calendar-day-header-sub">
            {dayEvents.length} event{dayEvents.length === 1 ? "" : "s"}
          </div>
        </div>
        {dayEvents.length === 0 ? (
          <div className="calendar-empty-state">
            <FaCalendarAlt />
            <p>
              No events for this day. Click on a time slot or use the form on
              the right to add one.
            </p>
          </div>
        ) : (
          <div className="calendar-day-events-list">
            {dayEvents.map((ev) => (
              <div
                key={ev.id}
                className={
                  "calendar-day-card " + getEventColorClass(ev)
                }
                onClick={() => handleEditEvent(ev)}
              >
                <div className="calendar-day-card-time">
                  {ev._startDate.toLocaleTimeString([], {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}{" "}
                  –{" "}
                  {ev._endDate.toLocaleTimeString([], {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </div>
                <div className="calendar-day-card-title">{ev.title}</div>
                {ev.location && (
                  <div className="calendar-day-card-location">
                    <FaTag /> {ev.location}
                  </div>
                )}
                {ev.description && (
                  <div className="calendar-day-card-description">
                    {ev.description}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    );
  };

  const renderAgendaView = () => {
    return (
      <div className="calendar-agenda-view">
        {agendaEvents.length === 0 ? (
          <div className="calendar-empty-state">
            <FaListUl />
            <p>No events scheduled for this week.</p>
          </div>
        ) : (
          agendaEvents.map(({ date, events: dayEvents }) => (
            <div key={date.toISOString()} className="calendar-agenda-day">
              <div className="calendar-agenda-day-header">
                {date.toLocaleDateString("en-US", {
                  weekday: "short",
                  month: "short",
                  day: "numeric",
                })}
              </div>
              <div className="calendar-agenda-events">
                {dayEvents.map((ev) => (
                  <div
                    key={ev.id}
                    className={
                      "calendar-agenda-card " + getEventColorClass(ev)
                    }
                    onClick={() => handleEditEvent(ev)}
                  >
                    <div className="calendar-agenda-time">
                      {ev._startDate.toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}{" "}
                      –{" "}
                      {ev._endDate.toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </div>
                    <div className="calendar-agenda-title">{ev.title}</div>
                    {ev.location && (
                      <div className="calendar-agenda-location">
                        <FaTag /> {ev.location}
                      </div>
                    )}
                    {ev.description && (
                      <div className="calendar-agenda-description">
                        {ev.description}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))
        )}
      </div>
    );
  };

  const renderMarketingView = () => {
    const { channels, days, grid } = marketingGrid;

    return (
      <div className="calendar-marketing-view">
        <div className="calendar-marketing-header">
          <h3>Marketing schedule</h3>
          <p className="calendar-marketing-sub">
            Lightweight board inspired by marketing calendars. Events are
            grouped by channel based on their title, description &amp; location.
          </p>
        </div>
        <div className="calendar-marketing-grid">
          <div className="calendar-marketing-grid-header">
            <div className="calendar-marketing-channel-cell" />
            {days.map((date) => (
              <div
                key={date.toISOString()}
                className="calendar-marketing-day-header"
              >
                <div className="calendar-marketing-day-name">
                  {date.toLocaleDateString("en-US", { weekday: "short" })}
                </div>
                <div className="calendar-marketing-day-number">
                  {date.getDate()}
                </div>
              </div>
            ))}
          </div>
          {channels.map((channel) => (
            <div key={channel} className="calendar-marketing-row">
              <div className="calendar-marketing-channel-cell">{channel}</div>
              {days.map((date) => {
                const key = startOfDay(date).toISOString();
                const cellEvents = grid[channel][key] || [];
                return (
                  <div
                    key={`${channel}-${key}`}
                    className="calendar-marketing-cell"
                  >
                    {cellEvents.length === 0
                      ? null
                      : cellEvents.map((ev) => (
                        <div
                          key={ev.id}
                          className={
                            "calendar-marketing-chip " +
                            getEventColorClass(ev)
                          }
                          title={ev.title}
                          onClick={() => handleEditEvent(ev)}
                        >
                          <span className="calendar-event-dot" />
                          <span className="calendar-event-title">
                            {ev.title}
                          </span>
                        </div>
                      ))}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    );
  };

  const renderCurrentView = () => {
    if (view === "month") return renderMonthView();
    if (view === "week") return renderWeekView();
    if (view === "day") return renderDayView();
    if (view === "agenda") return renderAgendaView();
    if (view === "marketing") return renderMarketingView();
    return null;
  };

  const todayEventsCount = eventsForDate(startOfDay(new Date())).length;

  const isEditing = !!editingEventId;

  return (
    <div className="page page-calendar">
      <div className="card" style={{ marginBottom: 10 }}>
        <div className="flex items-center gap-2" style={{ flexWrap: "wrap" }}>
          <input
            className="field-input"
            style={{ flex: 1, minWidth: 240 }}
            placeholder='Quick add (e.g., "Tomorrow 3pm Team sync @ Zoom")'
            value={quickAddText}
            onChange={(e) => setQuickAddText(e.target.value)}
          />
          <label className="text-xs muted" style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <input
              type="checkbox"
              checked={quickAddRecurring}
              onChange={(e) => setQuickAddRecurring(e.target.checked)}
            />
            Make recurring (note only)
          </label>
          <button
            type="button"
            className="primary-btn text-xs"
            onClick={async () => {
              if (!quickAddText.trim()) return;
              try {
                const now = new Date();
                let start = new Date(now.getTime() + 60 * 60 * 1000);
                const lower = quickAddText.toLowerCase();
                if (lower.includes("tomorrow")) {
                  start.setDate(start.getDate() + 1);
                  start.setHours(9, 0, 0, 0);
                }
                const timeMatch = lower.match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)/);
                if (timeMatch) {
                  let h = parseInt(timeMatch[1], 10);
                  const m = timeMatch[2] ? parseInt(timeMatch[2], 10) : 0;
                  if (timeMatch[3] === "pm" && h !== 12) h += 12;
                  if (timeMatch[3] === "am" && h === 12) h = 0;
                  start.setHours(h, m, 0, 0);
                }
                const end = new Date(start.getTime() + 60 * 60 * 1000);
                const title = quickAddText.replace(/tomorrow|today|\d{1,2}(:\d{2})?\s*(am|pm)/gi, "").trim() || "New event";
                await client.post("/events/", {
                  title: quickAddRecurring ? `[Recurring] ${title}` : title,
                  description: quickAddRecurring ? "Recurring (mark manually)" : "",
                  start: start.toISOString(),
                  end: end.toISOString(),
                  location: "",
                  source: "quick_add",
                });
                setQuickAddText("");
                setQuickAddRecurring(false);
                loadEvents();
              } catch (err) {
                console.error("[Calendar] Quick add failed:", err);
                setError("Quick add failed.");
              }
            }}
          >
            Quick add
          </button>
        </div>
      </div>

      {/* Top toolbar */}
      <div className="calendar-toolbar">
        <div className="calendar-nav">
          <button
            type="button"
            className="icon-btn"
            onClick={handlePrev}
            aria-label="Previous period"
          >
            <FaChevronLeft />
          </button>
          <button type="button" className="icon-btn" onClick={handleToday}>
            Today
          </button>
          <button
            type="button"
            className="icon-btn"
            onClick={handleNext}
            aria-label="Next period"
          >
            <FaChevronRight />
          </button>
          <div className="calendar-title">
            <FaCalendarAlt style={{ marginRight: 4 }} />
            <span>{monthLabel}</span>
          </div>
        </div>

        <div className="calendar-toolbar-right">
          {syncStatus && (
            <span className="text-xs muted" style={{ marginRight: 8 }}>
              {syncStatus}
            </span>
          )}
          <button
            type="button"
            className="secondary-btn text-xs"
            onClick={handleConnectGoogle}
            disabled={connectingGoogle}
          >
            {connectingGoogle ? "Opening…" : "Connect Google"}
          </button>
          <button
            type="button"
            className="secondary-btn text-xs"
            onClick={handleSyncGoogle}
            disabled={syncingGoogle}
          >
            {syncingGoogle ? "Syncing…" : "Sync Google"}
          </button>
          <label className="text-xs muted" style={{ display: "flex", alignItems: "center", gap: 4 }}>
            Drop duration
            <select
              className="field-input"
              style={{ width: 90, padding: "4px 6px" }}
              value={dropDurationMinutes}
              onChange={(e) => setDropDurationMinutes(Number(e.target.value))}
            >
              <option value={30}>30m</option>
              <option value={60}>60m</option>
              <option value={90}>90m</option>
            </select>
          </label>
          <button
            type="button"
            className="secondary-btn text-xs"
            onClick={handleRequestNotifications}
          >
            {notificationsEnabled ? "Reminders on" : "Enable reminders"}
          </button>
          <div className="calendar-view-toggle" style={{ marginLeft: 8 }}>
            {[
              ["manual", "Manual"],
              ["google", "Google"],
              ["email_ai", "AI"],
              ["task_block", "Task block"],
              ["quick_add", "Quick add"],
            ].map(([key, label]) => (
              <button
                key={key}
                type="button"
                className={
                  "toggle-btn" +
                  (sourceFilters[key] ? " toggle-btn-active" : "")
                }
                onClick={() =>
                  setSourceFilters((prev) => ({
                    ...prev,
                    [key]: !prev[key],
                  }))
                }
              >
                {label}
              </button>
            ))}
          </div>
          <div className="calendar-view-toggle">
            {VIEWS.map((v) => (
              <button
                key={v}
                type="button"
                className={
                  "toggle-btn" + (view === v ? " toggle-btn-active" : "")
                }
                onClick={() => handleViewChange(v)}
              >
                {v.charAt(0).toUpperCase() + v.slice(1)}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Main layout: big calendar + right sidebar */}
      <div className="calendar-layout grid-2">
        <div className="card calendar-main">
          {loading && (
            <div className="calendar-loading-bar">
              <span className="calendar-loading-pulse" />
              Syncing your schedule…
            </div>
          )}
          {error && <div className="error-banner">{error}</div>}
          {renderCurrentView()}
        </div>
      </div>

            {/* Event form modal */}
      {showEventForm && (
        <div
          className="calendar-modal-backdrop"
          onClick={resetForm} // click outside to close
        >
          <div
            className="calendar-modal"
            onClick={(e) => e.stopPropagation()} // keep clicks inside from closing
          >
            <div className="calendar-modal-header">
              <div className="calendar-modal-title-wrap">
                <FaCalendarAlt />
                <div>
                  <div className="calendar-modal-title">
                    {isEditing ? "Edit event" : "New event"}
                  </div>
                  <div className="calendar-modal-subtitle">
                    {isEditing
                      ? "Update or delete the selected event."
                      : "Pick a time on the calendar, then fill in the details."}
                  </div>
                </div>
              </div>
              <button
                type="button"
                className="icon-btn calendar-modal-close-btn"
                onClick={resetForm}
                aria-label="Close"
              >
                ✕
              </button>
            </div>

            <form className="calendar-form" onSubmit={handleSubmitEvent}>
              <label className="field-label">
                Title
                <input
                  className="field-input"
                  type="text"
                  name="title"
                  value={form.title}
                  onChange={handleFieldChange}
                  placeholder="e.g., Deep work, client call…"
                  required
                />
              </label>

              <div className="calendar-form-row">
                <label className="field-label">
                  Start
                  <input
                    className="field-input"
                    type="datetime-local"
                    name="start"
                    value={form.start}
                    onChange={handleFieldChange}
                    required
                  />
                </label>
                <label className="field-label">
                  End
                  <input
                    className="field-input"
                    type="datetime-local"
                    name="end"
                    value={form.end}
                    onChange={handleFieldChange}
                    required
                  />
                </label>
              </div>
              <label className="field-label">
                Reminder
                <select
                  className="field-input"
                  value={remindersMap[editingEventId || form.id] || 0}
                  onChange={(e) => {
                    const mins = Number(e.target.value);
                    if (editingEventId) {
                      saveReminderForEvent(editingEventId, mins);
                    }
                  }}
                  disabled={!editingEventId}
                >
                  <option value={0}>None</option>
                  <option value={10}>10 minutes before</option>
                  <option value={60}>1 hour before</option>
                  <option value={1440}>1 day before</option>
                </select>
                {!notificationsEnabled && (
                  <div className="muted text-xs">
                    Enable reminders above to allow notifications.
                  </div>
                )}
              </label>

              <label className="field-label">
                Location / channel
                <input
                  className="field-input"
                  type="text"
                  name="location"
                  value={form.location}
                  onChange={handleFieldChange}
                  placeholder="Zoom, office, Instagram, newsletter…"
                />
              </label>

              <label className="field-label">
                Notes
                <textarea
                  className="field-input"
                  name="description"
                  value={form.description}
                  onChange={handleFieldChange}
                  rows={3}
                  placeholder="Optional details, links, agenda…"
                />
              </label>

              <div
                style={{
                  display: "flex",
                  gap: 8,
                  alignItems: "center",
                  marginTop: 4,
                }}
              >
                <button className="primary-btn" type="submit">
                  {isEditing ? "Update event" : "Save event"}
                </button>

                <button
                  type="button"
                  className="secondary-btn"
                  onClick={resetForm}
                >
                  <FaUndo style={{ marginRight: 4 }} />
                  Cancel
                </button>

                {isEditing && (
                  <button
                    type="button"
                    className="icon-btn"
                    onClick={handleDeleteEvent}
                    title="Delete event"
                  >
                    <FaTrash />
                  </button>
                )}
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default Calendar;
