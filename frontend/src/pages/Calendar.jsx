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

// ---------- Date helpers ----------

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
  const pad = (n) => String(n).padStart(2, "0");
  const year = date.getFullYear();
  const month = pad(date.getMonth() + 1);
  const day = pad(date.getDate());
  const hour = pad(date.getHours());
  const minute = pad(date.getMinutes());
  return `${year}-${month}-${day}T${hour}:${minute}`;
}

// Rough marketing channel classification based on title/description
function classifyChannel(event) {
  const text = `${event.title} ${event.description}`.toLowerCase();
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

function getChannelSlug(ev) {
  return classifyChannel(ev).toLowerCase(); // "social" | "email" | "website" | "other"
}

// ---------- Pomodoro hook ----------

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

const Calendar = () => {
  const [events, setEvents] = useState([]);
  const [form, setForm] = useState(EMPTY_EVENT);
  const [view, setView] = useState("month");
  const [currentDate, setCurrentDate] = useState(() => startOfDay(new Date()));
  const [selectedDate, setSelectedDate] = useState(() =>
    startOfDay(new Date())
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const pomodoro = usePomodoro(25);

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

  const handleFieldChange = (e) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleCreateEvent = async (e) => {
    e.preventDefault();
    setError("");

    if (!form.title || !form.start || !form.end) {
      setError("Please provide at least title, start and end time.");
      return;
    }

    try {
      await client.post("/events/", form);
      setForm(EMPTY_EVENT);
      await loadEvents();
    } catch (err) {
      console.error("[Calendar] Failed to create event:", err);
      setError("Could not save event. Please try again.");
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

  const handleToday = () => {
    const today = startOfDay(new Date());
    setCurrentDate(today);
    setSelectedDate(today);

    // Prefill quick event for today (09:00–10:00)
    const start = new Date(today);
    start.setHours(9, 0, 0, 0);
    const end = new Date(today);
    end.setHours(10, 0, 0, 0);
    setForm((prev) => ({
      ...prev,
      start: toLocalInputValue(start),
      end: toLocalInputValue(end),
    }));
  };

  const handleViewChange = (nextView) => setView(nextView);

  // Click on a date (month or week header) → go to that day + prefill form.
  const handleDayClick = (date) => {
    const day = startOfDay(date);
    setSelectedDate(day);
    setCurrentDate(day);
    setView("day");

    const start = new Date(day);
    start.setHours(9, 0, 0, 0);
    const end = new Date(day);
    end.setHours(10, 0, 0, 0);
    setForm((prev) => ({
      ...prev,
      start: toLocalInputValue(start),
      end: toLocalInputValue(end),
    }));
  };

  // Double-click on a date in the month grid → also prefill form 09:00–10:00
  const handleQuickNewForDate = (date) => {
    const day = startOfDay(date);
    const start = new Date(day);
    start.setHours(9, 0, 0, 0);
    const end = new Date(day);
    end.setHours(10, 0, 0, 0);

    setSelectedDate(day);
    setCurrentDate(day);
    setView("day");
    setForm((prev) => ({
      ...prev,
      start: toLocalInputValue(start),
      end: toLocalInputValue(end),
    }));
  };

  // Click on a specific hour slot in week view → prefill exact time
  const handleTimeSlotClick = (date, hour) => {
    const day = startOfDay(date);
    const start = new Date(day);
    start.setHours(hour, 0, 0, 0);
    const end = new Date(start);
    end.setHours(hour + 1);

    setSelectedDate(day);
    setCurrentDate(day);
    setForm((prev) => ({
      ...prev,
      start: toLocalInputValue(start),
      end: toLocalInputValue(end),
    }));
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

  // Events that overlap a specific day (handles multi-day)
  const eventsForDate = (date) => {
    const dayStart = startOfDay(date);
    const dayEnd = endOfDay(date);

    return events.filter((ev) => {
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
    const weekEvents = events.filter((ev) =>
      weekSet.has(startOfDay(ev._startDate).toISOString())
    );
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
                    {dayEvents.slice(0, 3).map((ev) => {
                      const channel = getChannelSlug(ev);
                      return (
                        <div
                          key={ev.id}
                          className={
                            "calendar-event-chip event-chip-" + channel
                          }
                          title={ev.title}
                        >
                          <span
                            className={
                              "calendar-event-dot event-dot-" + channel
                            }
                          />
                          <span className="calendar-event-title">
                            {ev.title}
                          </span>
                        </div>
                      );
                    })}
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

            return (
              <div
                key={date.toISOString()}
                className="calendar-week-day-column"
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
                  {dayEvents.map((ev) => {
                    const channel = getChannelSlug(ev);

                    // clip multi-day events to this day column
                    const dayStart = startOfDay(date);
                    const dayEnd = endOfDay(date);
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

                    return (
                      <div
                        key={ev.id + date.toISOString()}
                        className={
                          "calendar-event-block event-block-" + channel
                        }
                        style={{ top, height }}
                        title={ev.title}
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
    const dayEvents = eventsForDate(selectedDate).sort(
      (a, b) => a._startDate - b._startDate
    );

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
            {dayEvents.map((ev) => {
              const channel = getChannelSlug(ev);
              return (
                <div
                  key={ev.id}
                  className={"calendar-day-card day-card-" + channel}
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
              );
            })}
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
                {dayEvents.map((ev) => {
                  const channel = getChannelSlug(ev);
                  return (
                    <div
                      key={ev.id}
                      className={"calendar-agenda-card agenda-card-" + channel}
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
                  );
                })}
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
            Lightweight board inspired by marketing calendars. Events are grouped
            by channel based on their title and description.
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
                const slug = channel.toLowerCase();
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
                              "calendar-marketing-chip event-chip-" + slug
                            }
                            title={ev.title}
                          >
                            <span
                              className={
                                "calendar-event-dot event-dot-" + slug
                              }
                            />
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

  return (
    <div className="page page-calendar">
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

      {/* Main layout: calendar + right sidebar */}
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

        <aside className="calendar-right-pane">
          <section className="card calendar-card">
            <div className="calendar-card-header">
              <FaRegClock />
              <div>
                <div className="calendar-card-title">Today</div>
                <div className="calendar-card-sub">
                  {todayEventsCount} event
                  {todayEventsCount === 1 ? "" : "s"} scheduled
                </div>
              </div>
            </div>
            <button
              type="button"
              className="secondary-btn calendar-focus-day-btn"
              onClick={() => {
                const today = startOfDay(new Date());
                setSelectedDate(today);
                setCurrentDate(today);
                setView("day");
              }}
            >
              Focus on today
            </button>
          </section>

          <section className="card calendar-card">
            <div className="calendar-card-header">
              <FaCalendarAlt />
              <div>
                <div className="calendar-card-title">Quick event</div>
                <div className="calendar-card-sub">
                  Minimal friction to add something to your calendar.
                </div>
              </div>
            </div>
            <form className="calendar-form" onSubmit={handleCreateEvent}>
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
              <button className="primary-btn" type="submit">
                Save event
              </button>
            </form>
          </section>

          <section className="card calendar-card">
            <div className="calendar-card-header">
              <FaRegClock />
              <div>
                <div className="calendar-card-title">Focus timer</div>
                <div className="calendar-card-sub">
                  Simple Pomodoro-style focus block.
                </div>
              </div>
            </div>
            <div className="pomodoro-timer">
              <div className="pomodoro-display">{pomodoro.label}</div>
              <div className="pomodoro-actions">
                <button
                  type="button"
                  className="icon-btn"
                  onClick={pomodoro.toggle}
                >
                  {pomodoro.running ? <FaPause /> : <FaPlay />}
                </button>
                <button
                  type="button"
                  className="icon-btn"
                  onClick={pomodoro.reset}
                >
                  Reset
                </button>
              </div>
            </div>
          </section>
        </aside>
      </div>
    </div>
  );
};

export default Calendar;