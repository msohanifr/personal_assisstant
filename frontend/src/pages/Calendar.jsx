// frontend/src/pages/Calendar.jsx
import React, { useEffect, useState, useMemo } from "react";
import client from "../api/client";
import { FaChevronLeft, FaChevronRight, FaCalendarAlt } from "react-icons/fa";

const emptyEvent = {
  title: "",
  description: "",
  start: "",
  end: "",
  location: "",
};

const views = ["month", "week", "day"];

function sameDay(a, b) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function startOfWeek(date) {
  const d = new Date(date);
  const day = d.getDay(); // 0 = Sun
  d.setDate(d.getDate() - day);
  d.setHours(0, 0, 0, 0);
  return d;
}

function addDays(date, days) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

const Calendar = () => {
  const [events, setEvents] = useState([]);
  const [form, setForm] = useState(emptyEvent);
  const [view, setView] = useState("month");
  const [currentDate, setCurrentDate] = useState(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  });
  const [selectedDate, setSelectedDate] = useState(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  });

  const load = async () => {
    const res = await client.get("/events/");
    const mapped = res.data.map((e) => ({
      ...e,
      _startDate: new Date(e.start),
      _endDate: new Date(e.end),
    }));
    setEvents(mapped);
  };

  useEffect(() => {
    load();
  }, []);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm((f) => ({ ...f, [name]: value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    await client.post("/events/", form);
    setForm(emptyEvent);
    load();
  };

  const handleViewChange = (nextView) => {
    setView(nextView);
    // keep selectedDate anchored
    setSelectedDate((prev) => {
      const d = new Date(prev);
      d.setHours(0, 0, 0, 0);
      return d;
    });
  };

  const handlePrev = () => {
    const d = new Date(currentDate);
    if (view === "month") {
      d.setMonth(d.getMonth() - 1);
    } else if (view === "week") {
      d.setDate(d.getDate() - 7);
    } else {
      d.setDate(d.getDate() - 1);
    }
    setCurrentDate(d);
  };

  const handleNext = () => {
    const d = new Date(currentDate);
    if (view === "month") {
      d.setMonth(d.getMonth() + 1);
    } else if (view === "week") {
      d.setDate(d.getDate() + 7);
    } else {
      d.setDate(d.getDate() + 1);
    }
    setCurrentDate(d);
  };

  const handleToday = () => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    setCurrentDate(d);
    setSelectedDate(d);
    setView("day");
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

  const eventsForDate = (date) =>
    events.filter((ev) => sameDay(ev._startDate, date));

  // Month view grid
  const monthGridDays = useMemo(() => {
    if (view !== "month") return [];
    const firstOfMonth = new Date(
      currentDate.getFullYear(),
      currentDate.getMonth(),
      1
    );
    const gridStart = startOfWeek(firstOfMonth);
    return Array.from({ length: 42 }).map((_, idx) =>
      addDays(gridStart, idx)
    );
  }, [currentDate, view]);

  // Week view days
  const weekDays = useMemo(() => {
    if (view !== "week") return [];
    const start = startOfWeek(currentDate);
    return Array.from({ length: 7 }).map((_, idx) => addDays(start, idx));
  }, [currentDate, view]);

  // Day view events
  const dayEvents = useMemo(
    () => (view === "day" ? eventsForDate(selectedDate) : eventsForDate(selectedDate)),
    // we keep eventsForDate(selectedDate) so even in other views you "know" what's on the selected day
    [events, selectedDate, view]
  );

  const weekDayHeader = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

  const focusSelectedDay = () => {
    // This is the "show all events for one day" action
    setView("day");
  };

  return (
    <div className="page page-calendar">
    <h2 className="page-title flex items-center gap-4">
      <FaCalendarAlt /> <span>Calendar</span>
    </h2>

      {/* Toolbar */}
      <div className="calendar-toolbar">
        <div className="calendar-nav">
          <button className="secondary-btn" onClick={handleToday}>
            Today
          </button>
          <button className="icon-btn" onClick={handlePrev}>
            <FaChevronLeft />
          </button>
          <button className="icon-btn" onClick={handleNext}>
            <FaChevronRight />
          </button>
          <span className="calendar-title">
            {view === "day" ? dayLabel : monthLabel}
          </span>
        </div>

        <div className="calendar-toolbar-right">
          {/* NEW: explicit "only this day" button */}
          <button
            type="button"
            className="secondary-btn calendar-focus-day-btn"
            onClick={focusSelectedDay}
          >
            Only this day: {dayLabel}
          </button>

          <div className="calendar-view-toggle">
            {views.map((v) => (
              <button
                key={v}
                className={
                  "toggle-btn" + (view === v ? " toggle-btn-active" : "")
                }
                onClick={() => handleViewChange(v)}
              >
                {v === "month"
                  ? "Month"
                  : v === "week"
                  ? "Week"
                  : "Day"}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="grid-2 calendar-layout">
        {/* Left: calendar */}
        <div className="card calendar-card">
          {/* Headers for week days */}
          {view !== "day" && (
            <div className="calendar-week-header">
              {weekDayHeader.map((wd) => (
                <div key={wd} className="calendar-week-day">
                  {wd}
                </div>
              ))}
            </div>
          )}

          {/* Month view */}
          {view === "month" && (
            <div className="calendar-grid">
              {monthGridDays.map((date, idx) => {
                const isCurrentMonth =
                  date.getMonth() === currentDate.getMonth();
                const isToday = sameDay(date, new Date());
                const isSelected = sameDay(date, selectedDate);
                const evs = eventsForDate(date);

                return (
                  <button
                    key={idx}
                    type="button"
                    className={
                      "calendar-cell " +
                      (!isCurrentMonth ? "calendar-cell-muted " : "") +
                      (isSelected ? "calendar-cell-selected " : "") +
                      (isToday ? "calendar-cell-today " : "")
                    }
                    onClick={() => setSelectedDate(date)}
                  >
                    <div className="calendar-cell-date">
                      {date.getDate()}
                    </div>
                    <div className="calendar-cell-events">
                      {evs.slice(0, 3).map((ev) => (
                        <div
                          key={ev.id}
                          className="calendar-event-pill"
                          title={ev.title}
                        >
                          {ev.title}
                        </div>
                      ))}
                      {evs.length > 3 && (
                        <div className="calendar-more">
                          +{evs.length - 3} more
                        </div>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          )}

          {/* Week view */}
          {view === "week" && (
            <div className="calendar-week-grid">
              {weekDays.map((date) => {
                const isToday = sameDay(date, new Date());
                const isSelected = sameDay(date, selectedDate);
                const evs = eventsForDate(date);
                const label = `${date.getDate()}`;
                return (
                  <div
                    key={date.toISOString()}
                    className={
                      "calendar-week-column " +
                      (isSelected ? "calendar-week-selected " : "") +
                      (isToday ? "calendar-week-today " : "")
                    }
                    onClick={() => setSelectedDate(date)}
                  >
                    <div className="calendar-week-column-header">
                      <div className="muted text-xs">
                        {weekDayHeader[date.getDay()]}
                      </div>
                      <div className="font-medium">{label}</div>
                    </div>
                    <div className="calendar-week-column-body">
                      {evs.length === 0 && (
                        <div className="calendar-empty">No events</div>
                      )}
                      {evs.map((ev) => (
                        <div
                          key={ev.id}
                          className="calendar-event-card"
                        >
                          <div className="calendar-event-title">
                            {ev.title}
                          </div>
                          <div className="calendar-event-time muted text-xs">
                            {new Date(ev.start).toLocaleTimeString([], {
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                            {" – "}
                            {new Date(ev.end).toLocaleTimeString([], {
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </div>
                          {ev.location && (
                            <div className="calendar-event-location muted text-xs">
                              {ev.location}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Day view – shows ALL events for selectedDate */}
          {view === "day" && (
            <div className="calendar-day-view">
              <div className="calendar-day-header">
                <div className="day-label-main">{dayLabel}</div>
                <div className="muted text-xs">
                  {dayEvents.length}{" "}
                  {dayEvents.length === 1 ? "event" : "events"}
                </div>
              </div>
              <div className="calendar-day-list">
                {dayEvents.length === 0 && (
                  <div className="calendar-empty">
                    No events scheduled for this day.
                  </div>
                )}
                {dayEvents.map((ev) => (
                  <div
                    key={ev.id}
                    className="calendar-event-card calendar-event-card-full"
                  >
                    <div className="calendar-event-title">{ev.title}</div>
                    <div className="calendar-event-time muted text-xs">
                      {new Date(ev.start).toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                      {" – "}
                      {new Date(ev.end).toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </div>
                    {ev.location && (
                      <div className="calendar-event-location muted text-xs">
                        {ev.location}
                      </div>
                    )}
                    {ev.description && (
                      <p className="mt-1 text-sm">{ev.description}</p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Right: quick add form */}
        <form onSubmit={handleSubmit} className="card form-card">
          <h3 className="card-title">Add event</h3>
          <label className="field-label">
            Title
            <input
              className="field-input"
              name="title"
              value={form.title}
              onChange={handleChange}
              required
            />
          </label>
          <label className="field-label">
            Start
            <input
              type="datetime-local"
              className="field-input"
              name="start"
              value={form.start}
              onChange={handleChange}
              required
            />
          </label>
          <label className="field-label">
            End
            <input
              type="datetime-local"
              className="field-input"
              name="end"
              value={form.end}
              onChange={handleChange}
              required
            />
          </label>
          <label className="field-label">
            Location
            <input
              className="field-input"
              name="location"
              value={form.location}
              onChange={handleChange}
            />
          </label>
          <label className="field-label">
            Description
            <textarea
              className="field-input"
              name="description"
              value={form.description}
              onChange={handleChange}
              rows={3}
            />
          </label>
          <button className="primary-btn" type="submit">
            Save event
          </button>
        </form>
      </div>
    </div>
  );
};

export default Calendar;