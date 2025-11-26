// frontend/src/pages/Dashboard.jsx
import React, { useEffect, useState } from "react";
import client from "../api/client";

const Dashboard = () => {
  const [summary, setSummary] = useState({
    topTasks: [],
    upcomingEvents: [],
    recentNotes: [],
  });
  const [kpis, setKpis] = useState({
    totalTasks: 0,
    tasksToday: 0,
    overdueTasks: 0,
    completedTasks: 0,
    eventsToday: 0,
    nextEvent: null,
    notesCount: 0,
  });
  const [error, setError] = useState("");

  const sameDay = (a, b) => {
    return (
      a.getFullYear() === b.getFullYear() &&
      a.getMonth() === b.getMonth() &&
      a.getDate() === b.getDate()
    );
  };

  useEffect(() => {
    const fetchData = async () => {
      console.debug("[Dashboard] Fetching dashboard data…");
      setError("");

      try {
        const [tasksRes, eventsRes, notesRes] = await Promise.all([
          client.get("/tasks/"),
          client.get("/events/"),
          client.get("/notes/"),
        ]);

        const tasks = tasksRes.data || [];
        const events = eventsRes.data || [];
        const notes = notesRes.data || [];

        console.debug("[Dashboard] Raw tasks:", tasks);
        console.debug("[Dashboard] Raw events:", events);
        console.debug("[Dashboard] Raw notes:", notes);

        // --- KPI calculations ---
        const now = new Date();

        // Tasks KPIs
        let totalTasks = tasks.length;
        let tasksToday = 0;
        let overdueTasks = 0;
        let completedTasks = 0;

        tasks.forEach((t) => {
          const status = t.status;
          if (status === "done") completedTasks += 1;

          if (t.due_date) {
            const d = new Date(t.due_date);
            if (!Number.isNaN(d.getTime())) {
              if (sameDay(d, now)) tasksToday += 1;
              if (d < now && status !== "done") overdueTasks += 1;
            }
          }
        });

        // Events KPIs
        let eventsToday = 0;
        let nextEvent = null;
        const upcomingEvents = events
          .map((e) => ({
            ...e,
            _startDate: e.start ? new Date(e.start) : null,
          }))
          .sort((a, b) => {
            const at = a._startDate ? a._startDate.getTime() : Infinity;
            const bt = b._startDate ? b._startDate.getTime() : Infinity;
            return at - bt;
          });

        upcomingEvents.forEach((e) => {
          if (!e._startDate || Number.isNaN(e._startDate.getTime())) return;
          if (sameDay(e._startDate, now)) eventsToday += 1;
        });

        // Find next event from now
        nextEvent =
          upcomingEvents.find(
            (e) =>
              e._startDate &&
              !Number.isNaN(e._startDate.getTime()) &&
              e._startDate >= now
          ) || null;

        // Notes KPI
        const notesCount = notes.length;

        console.debug("[Dashboard] Computed KPIs:", {
          totalTasks,
          tasksToday,
          overdueTasks,
          completedTasks,
          eventsToday,
          nextEvent,
          notesCount,
        });

        // --- Summary previews (top lists) ---

        // Sort tasks by due_date ascending for "Top tasks"
        const topTasks = [...tasks]
          .map((t) => ({
            ...t,
            _dueDate: t.due_date ? new Date(t.due_date) : null,
          }))
          .sort((a, b) => {
            const ad = a._dueDate ? a._dueDate.getTime() : Infinity;
            const bd = b._dueDate ? b._dueDate.getTime() : Infinity;
            return ad - bd;
          })
          .slice(0, 5);

        // Upcoming events already sorted above; reuse and slice
        const upcomingEventsPreview = upcomingEvents.slice(0, 5);

        // Recent notes – just take first 3 for now
        const recentNotes = notes.slice(0, 3);

        console.debug("[Dashboard] Summary previews:", {
          topTasks,
          upcomingEventsPreview,
          recentNotes,
        });

        setKpis({
          totalTasks,
          tasksToday,
          overdueTasks,
          completedTasks,
          eventsToday,
          nextEvent,
          notesCount,
        });

        setSummary({
          topTasks,
          upcomingEvents: upcomingEventsPreview,
          recentNotes,
        });
      } catch (err) {
        console.error("[Dashboard] Failed to load dashboard data", err);
        setError("Could not load dashboard data. Check console for details.");
      }
    };

    fetchData();
  }, []);

  const formatEventTime = (value) => {
    if (!value) return "No date";
    try {
      const d = new Date(value);
      if (Number.isNaN(d.getTime())) return value;
      return d.toLocaleString(undefined, {
        weekday: "short",
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch (err) {
      console.error("[Dashboard] Error formatting event time:", err, value);
      return value;
    }
  };

  const formatDueDate = (value) => {
    if (!value) return "No due date";
    try {
      const d = new Date(value);
      if (Number.isNaN(d.getTime())) return value;
      return d.toLocaleString(undefined, {
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch (err) {
      console.error("[Dashboard] Error formatting due date:", err, value);
      return value;
    }
  };

  return (
    <div className="page page-dashboard">
      <h2 className="page-title">Today at a glance</h2>

      {error && <p className="error-text mt-2">{error}</p>}

      {/* KPI row */}
      <div className="grid-3 mt-2">
        {/* Tasks KPI */}
        <section className="card">
          <h3 className="card-title">Tasks</h3>
          <div className="flex justify-between items-center mt-2">
            <div>
              <div className="text-sm muted">Total</div>
              <div style={{ fontSize: "1.6rem", fontWeight: 700 }}>
                {kpis.totalTasks}
              </div>
            </div>
            <div>
              <div className="text-xs muted">
                Today: <strong>{kpis.tasksToday}</strong>
              </div>
              <div className="text-xs muted mt-1">
                Done: <strong>{kpis.completedTasks}</strong>
              </div>
              <div className="text-xs" style={{ color: "#b91c1c" }}>
                Overdue: <strong>{kpis.overdueTasks}</strong>
              </div>
            </div>
          </div>
        </section>

        {/* Today KPI */}
        <section className="card">
          <h3 className="card-title">Today</h3>
          <div className="mt-2">
            <div className="text-sm">
              <strong>{kpis.tasksToday}</strong> task
              {kpis.tasksToday === 1 ? "" : "s"} due today
            </div>
            <div className="text-sm mt-1">
              <strong>{kpis.eventsToday}</strong> event
              {kpis.eventsToday === 1 ? "" : "s"} today
            </div>
            <div className="muted text-xs mt-2">
              Make sure you complete your overdue tasks first.
            </div>
          </div>
        </section>

        {/* Next event + notes KPI */}
        <section className="card">
          <h3 className="card-title">Next up</h3>
          {kpis.nextEvent ? (
            <div className="mt-2">
              <div className="font-medium">{kpis.nextEvent.title}</div>
              <div className="muted text-xs mt-1">
                {formatEventTime(kpis.nextEvent.start)}
              </div>
            </div>
          ) : (
            <div className="mt-2 muted text-sm">
              No upcoming events scheduled.
            </div>
          )}
          <div className="muted text-xs mt-3">
            Notes in your workspace:{" "}
            <strong>{kpis.notesCount}</strong>
          </div>
        </section>
      </div>

      {/* Detailed preview lists */}
      <div className="grid-3 mt-4">
        <section className="card">
          <h3 className="card-title">Top tasks</h3>
          <ul className="list">
            {summary.topTasks.map((t) => (
              <li
                key={t.id}
                className="flex items-center justify-between gap-2"
              >
                <div>
                  <div className="font-medium">{t.title}</div>
                  <div className="muted text-xs">
                    Due: {formatDueDate(t.due_date)}
                  </div>
                </div>
                <span className={`badge badge-${t.status}`}>
                  {t.status.replace("_", " ")}
                </span>
              </li>
            ))}
            {!summary.topTasks.length && (
              <li className="muted">No tasks yet.</li>
            )}
          </ul>
        </section>

        <section className="card">
          <h3 className="card-title">Upcoming events</h3>
          <ul className="list">
            {summary.upcomingEvents.map((e) => (
              <li key={e.id}>
                <div className="font-medium">{e.title}</div>
                <div className="muted text-xs">
                  {formatEventTime(e.start)}
                </div>
              </li>
            ))}
            {!summary.upcomingEvents.length && (
              <li className="muted">Nothing scheduled.</li>
            )}
          </ul>
        </section>

        <section className="card">
          <h3 className="card-title">Recent notes</h3>
          <ul className="list">
            {summary.recentNotes.map((n) => (
              <li key={n.id}>
                <div className="font-medium">{n.title}</div>
                <div className="muted text-xs line-clamp-2">
                  {n.content}
                </div>
              </li>
            ))}
            {!summary.recentNotes.length && (
              <li className="muted">Start a note to plan your day.</li>
            )}
          </ul>
        </section>
      </div>
    </div>
  );
};

export default Dashboard;