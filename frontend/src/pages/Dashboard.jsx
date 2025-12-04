import React, { useEffect, useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import client from "../api/client";

import {
  ResponsiveContainer,
  RadialBarChart,
  RadialBar,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  PieChart,
  Pie,
  Cell,
} from "recharts";

const STATUS_COLORS = {
  todo: "#f97316",         // orange
  in_progress: "#3b82f6",  // blue
  done: "#22c55e",         // green
};

const INFO_COLORS = ["#4f46e5", "#22c55e", "#ec4899", "#0ea5e9"];

const Dashboard = () => {
  const navigate = useNavigate();

  const [summary, setSummary] = useState({
    topTasks: [],
    upcomingEvents: [],
    recentNotes: [],
    overdueTasks: [],
    todayEvents: [],
    notesToday: [],
    topJobs: [],
  });

  const [allTags, setAllTags] = useState([]);
  const [allTasks, setAllTasks] = useState([]);

  const [kpis, setKpis] = useState({
    // Tasks
    totalTasks: 0,
    tasksToday: 0,
    overdueTasks: 0,
    completedTasks: 0,
    todoTasks: 0,
    inProgressTasks: 0,
    completionRate: 0,

    // Events
    eventsToday: 0,
    eventsThisWeek: 0,
    nextEvent: null,

    // Notes
    notesCount: 0,
    notesTodayCount: 0,
    dailyNotesCount: 0,
    generalNotesCount: 0,

    // Contacts
    contactsCount: 0,

    // Emails
    totalEmails: 0,
    emailsToday: 0,
  });

  const [error, setError] = useState("");

  // Live clock
  const [clock, setClock] = useState(() => ({
    now: new Date(),
    timezoneLabel: Intl.DateTimeFormat().resolvedOptions().timeZone,
  }));

  // Weather (from /weather/ backend endpoint)
  const [weather, setWeather] = useState({
    loading: true,
    error: "",
    data: null,
  });

  const todayBriefTopTasks = useMemo(() => {
    return (summary.topTasks || []).slice(0, 3);
  }, [summary.topTasks]);

  const todayBriefEvents = useMemo(() => {
    return (summary.todayEvents || []).slice(0, 3);
  }, [summary.todayEvents]);

  /* ---------- Helpers ---------- */

  const resolveTaskTagIds = (task) => {
    if (!task) return [];
    if (Array.isArray(task.tag_ids)) {
      return task.tag_ids;
    }
    if (Array.isArray(task.tags) && task.tags.length > 0) {
      if (typeof task.tags[0] === "object") {
        return task.tags.map((t) => t.id);
      }
      return task.tags;
    }
    return [];
  };

  const resolveTaskTags = (task) => {
    const ids = resolveTaskTagIds(task);
    if (!ids.length || !allTags.length) return [];
    return allTags.filter((tag) => ids.includes(tag.id));
  };

  const sameDay = (a, b) => {
    return (
      a.getFullYear() === b.getFullYear() &&
      a.getMonth() === b.getMonth() &&
      a.getDate() === b.getDate()
    );
  };

  const addDays = (date, days) => {
    const d = new Date(date);
    d.setDate(d.getDate() + days);
    return d;
  };

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

  // Tick clock every minute
  useEffect(() => {
    const id = setInterval(() => {
      setClock((prev) => ({
        ...prev,
        now: new Date(),
      }));
    }, 60_000);
    return () => clearInterval(id);
  }, []);

  /* ---------- Fetch data ---------- */

  useEffect(() => {
    const fetchData = async () => {
      console.debug("[Dashboard] Fetching dashboard data…");
      setError("");

      try {
        const [
          tasksRes,
          eventsRes,
          notesRes,
          contactsRes,
          emailsRes,
          weatherRes,
          tagsRes,
        ] = await Promise.all([
          client.get("/tasks/"),
          client.get("/events/"),
          client.get("/notes/"),
          client.get("/contacts/").catch((err) => {
            console.warn("[Dashboard] /contacts/ failed, continuing", err);
            return { data: [] };
          }),
          client.get("/email-messages/").catch((err) => {
            console.warn("[Dashboard] /email-messages/ failed, continuing", err);
            return { data: [] };
          }),
          client.get("/weather/").catch((err) => {
            console.warn("[Dashboard] /weather/ failed, continuing", err);
            return { data: null };
          }),
          client.get("/task-tags/").catch((err) => {
            console.warn("[Dashboard] /task-tags/ failed, continuing", err);
            return { data: [] };
          }),
        ]);

        const tasks = tasksRes.data || [];
        const events = eventsRes.data || [];
        const notes = notesRes.data || [];
        const contacts = contactsRes.data || [];
        const emails = emailsRes.data || [];
        const weatherData = weatherRes.data || null;
        const tags = tagsRes.data || [];

        setAllTags(tags);
        setAllTasks(tasks);

        console.debug("[Dashboard] Raw tags:", tags);
        console.debug("[Dashboard] Raw tasks:", tasks);
        console.debug("[Dashboard] Raw events:", events);
        console.debug("[Dashboard] Raw notes:", notes);
        console.debug("[Dashboard] Raw contacts:", contacts);
        console.debug("[Dashboard] Raw emails:", emails);
        console.debug("[Dashboard] Weather:", weatherData);

        // Update weather state (non-fatal if null)
        setWeather({
          loading: false,
          error: "",
          data: weatherData,
        });

        const now = new Date();
        now.setSeconds(0, 0);

        /* ---------- TASKS STATS ---------- */

        let totalTasks = tasks.length;
        let tasksToday = 0;
        let overdueTasksCount = 0;
        let completedTasks = 0;
        let todoTasks = 0;
        let inProgressTasks = 0;

        const overdueTasksList = [];

        tasks.forEach((t) => {
          const status = t.status;
          if (status === "done") completedTasks += 1;
          if (status === "todo") todoTasks += 1;
          if (status === "in_progress") inProgressTasks += 1;

          if (t.due_date) {
            const d = new Date(t.due_date);
            if (!Number.isNaN(d.getTime())) {
              // Only count tasks due today that are NOT done
              if (sameDay(d, now) && status !== "done") {
                tasksToday += 1;
              }
              // Overdue = past due and NOT done
              if (d < now && status !== "done") {
                overdueTasksCount += 1;
                overdueTasksList.push({
                  ...t,
                  _dueDate: d,
                });
              }
            }
          }
        });

        const completionRate =
          totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;

        // Sort overdue tasks by due date ascending and keep top 5
        overdueTasksList.sort((a, b) => {
          const ad = a._dueDate ? a._dueDate.getTime() : Infinity;
          const bd = b._dueDate ? b._dueDate.getTime() : Infinity;
          return ad - bd;
        });
        const overdueTasksPreview = overdueTasksList.slice(0, 5);

        /* ---------- EVENTS STATS ---------- */

        let eventsToday = 0;
        let nextEvent = null;
        let eventsThisWeek = 0;

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

        const oneWeekFromNow = addDays(now, 7);
        const todayEventsList = [];

        upcomingEvents.forEach((e) => {
          if (!e._startDate || Number.isNaN(e._startDate.getTime())) return;

          if (sameDay(e._startDate, now)) {
            eventsToday += 1;
            todayEventsList.push(e);
          }

          if (e._startDate >= now && e._startDate <= oneWeekFromNow) {
            eventsThisWeek += 1;
          }
        });

        // Find next event from now
        nextEvent =
          upcomingEvents.find(
            (e) =>
              e._startDate &&
              !Number.isNaN(e._startDate.getTime()) &&
              e._startDate >= now
          ) || null;

        const upcomingEventsPreview = upcomingEvents.slice(0, 5);

        /* ---------- NOTES STATS ---------- */

        const notesCount = notes.length;

        let notesTodayCount = 0;
        let dailyNotesCount = 0;
        let generalNotesCount = 0;
        const notesTodayList = [];
        const jobCounts = {};

        notes.forEach((n) => {
          const noteType = n.note_type || "general";
          if (noteType === "daily") dailyNotesCount += 1;
          if (noteType === "general") generalNotesCount += 1;

          const dateValue =
            n.date || (n.created_at ? n.created_at.slice(0, 10) : null);

          if (dateValue) {
            const nd = new Date(dateValue);
            if (!Number.isNaN(nd.getTime()) && sameDay(nd, now)) {
              notesTodayCount += 1;
              notesTodayList.push(n);
            }
          }

          const jobKey = (n.job || "").trim();
          if (jobKey.length > 0) {
            jobCounts[jobKey] = (jobCounts[jobKey] || 0) + 1;
          }
        });

        const notesTodayPreview = notesTodayList.slice(0, 3);

        const topJobs = Object.entries(jobCounts)
          .map(([job, count]) => ({ job, count }))
          .sort((a, b) => b.count - a.count)
          .slice(0, 4);

        /* ---------- CONTACTS & EMAILS STATS ---------- */

        const contactsCount = contacts.length;

        let totalEmails = emails.length;
        let emailsToday = 0;

        emails.forEach((m) => {
          if (!m.sent_at) return;
          const d = new Date(m.sent_at);
          if (!Number.isNaN(d.getTime()) && sameDay(d, now)) {
            emailsToday += 1;
          }
        });

        console.debug("[Dashboard] Computed KPIs:", {
          totalTasks,
          tasksToday,
          overdueTasksCount,
          completedTasks,
          todoTasks,
          inProgressTasks,
          completionRate,
          eventsToday,
          eventsThisWeek,
          nextEvent,
          notesCount,
          notesTodayCount,
          dailyNotesCount,
          generalNotesCount,
          contactsCount,
          totalEmails,
          emailsToday,
        });

        /* ---------- TOP LISTS ---------- */

        const topTasks = tasks
          .filter((t) => t.status !== "done") // only open tasks
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

        const recentNotes = notes.slice(0, 3);

        /* ---------- Set state ---------- */

        setKpis({
          totalTasks,
          tasksToday,
          overdueTasks: overdueTasksCount,
          completedTasks,
          todoTasks,
          inProgressTasks,
          completionRate,

          eventsToday,
          eventsThisWeek,
          nextEvent,

          notesCount,
          notesTodayCount,
          dailyNotesCount,
          generalNotesCount,

          contactsCount,

          totalEmails,
          emailsToday,
        });

        setSummary({
          topTasks,
          upcomingEvents: upcomingEventsPreview,
          recentNotes,
          overdueTasks: overdueTasksPreview,
          todayEvents: todayEventsList,
          notesToday: notesTodayPreview,
          topJobs,
        });
      } catch (err) {
        console.error("[Dashboard] Failed to load dashboard data", err);
        setError("Could not load dashboard data. Check console for details.");
      }
    };

    fetchData();
  }, []);

  /* ---------- Derived chart data ---------- */

  const completionChartData = useMemo(
    () => [
      {
        name: "Completion",
        value: Math.max(0, Math.min(100, kpis.completionRate || 0)),
        fill: "#22c55e",
      },
    ],
    [kpis.completionRate]
  );

  const statusChartData = useMemo(
    () => [
      {
        name: "Tasks",
        todo: kpis.todoTasks,
        in_progress: kpis.inProgressTasks,
        done: kpis.completedTasks,
      },
    ],
    [kpis.todoTasks, kpis.inProgressTasks, kpis.completedTasks]
  );

  const todayChartData = useMemo(
    () => [
      { name: "Tasks due", value: kpis.tasksToday },
      { name: "Events", value: kpis.eventsToday },
      { name: "Overdue", value: kpis.overdueTasks },
    ],
    [kpis.tasksToday, kpis.eventsToday, kpis.overdueTasks]
  );

  const infoChartData = useMemo(
    () => [
      { name: "Notes today", value: kpis.notesTodayCount },
      { name: "Emails today", value: kpis.emailsToday },
    ],
    [kpis.notesTodayCount, kpis.emailsToday]
  );

  const tagUsageData = useMemo(() => {
    if (!allTasks.length || !allTags.length) return [];

    const counts = {};
    allTasks.forEach((task) => {
      const ids = resolveTaskTagIds(task);
      ids.forEach((id) => {
        counts[id] = (counts[id] || 0) + 1;
      });
    });

    const rows = allTags
      .map((tag) => ({
        id: tag.id,
        name: tag.name,
        color: tag.color || "#9ca3af",
        value: counts[tag.id] || 0,
      }))
      .filter((row) => row.value > 0)
      .sort((a, b) => b.value - a.value)
      .slice(0, 6); // top 6 tags

    return rows;
  }, [allTasks, allTags]);

  /* ---------- Greeting / weather ---------- */

  const now = clock.now;
  const hour = now.getHours();
  const greeting =
    hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";

  const focusLine =
    kpis.overdueTasks > 0
      ? `You have ${kpis.overdueTasks} overdue task${
          kpis.overdueTasks === 1 ? "" : "s"
        } to clear.`
      : kpis.tasksToday > 0
      ? `You have ${kpis.tasksToday} task${
          kpis.tasksToday === 1 ? "" : "s"
        } due today.`
      : "No deadlines today — great moment for deep work or planning.";

  const renderWeatherLine = () => {
    if (weather.loading) {
      return "Loading weather…";
    }
    if (weather.error) {
      return "Weather unavailable.";
    }
    if (!weather.data) {
      return "Weather not configured yet.";
    }

    const city = weather.data.city || weather.data.location || "";
    const country = weather.data.country || "";
    const condition =
      weather.data.condition ||
      weather.data.description ||
      weather.data.summary ||
      "";
    const tempC =
      weather.data.temperature_c ??
      weather.data.temp_c ??
      weather.data.tempC;
    const tempF =
      weather.data.temperature_f ??
      weather.data.temp_f ??
      weather.data.tempF;

    const tempPart =
      tempC != null
        ? `${Math.round(tempC)}°C`
        : tempF != null
        ? `${Math.round(tempF)}°F`
        : "";

    const placePart =
      city || country ? `${city}${city && country ? ", " : ""}${country}` : "";

    const pieces = [tempPart, condition, placePart].filter(Boolean);
    if (!pieces.length) {
      return "Weather data missing fields.";
    }
    return pieces.join(" · ");
  };

  /* ---------- Render ---------- */

  return (
    <div className="page page-dashboard">
      <h2 className="page-title">Today at a glance</h2>
      <p className="muted text-sm">
        {greeting}. {focusLine}
      </p>

      <div className="card" style={{ marginTop: 8, marginBottom: 12 }}>
        <div className="flex items-center justify-between">
          <div>
            <div className="text-xs muted">
              {clock.now.toLocaleDateString(undefined, {
                weekday: "long",
                month: "short",
                day: "numeric",
              })}{" "}
              · {clock.timezoneLabel}
            </div>
            {weather.data && (
              <div className="text-xs">
                {weather.data.city}: {weather.data.temperature_c}°C,{" "}
                {weather.data.condition}
              </div>
            )}
          </div>
          <button
            type="button"
            className="primary-btn text-xs"
            onClick={() => navigate("/tasks")}
          >
            Plan my day
          </button>
        </div>
        <div className="flex gap-3" style={{ flexWrap: "wrap", marginTop: 10 }}>
          <div style={{ minWidth: 220 }}>
            <div className="text-xs font-medium">Top tasks</div>
            <ul className="list text-xs">
              {todayBriefTopTasks.length === 0 && <li className="muted">No tasks.</li>}
              {todayBriefTopTasks.map((t) => (
                <li key={t.id}>
                  {t.title} {t.due_date ? `(${formatDueDate(t.due_date)})` : ""}
                </li>
              ))}
            </ul>
          </div>
          <div style={{ minWidth: 220 }}>
            <div className="text-xs font-medium">Today’s schedule</div>
            <ul className="list text-xs">
              {(summary.todayEvents || []).length === 0 && <li className="muted">No events.</li>}
              {summary.todayEvents?.slice(0, 3).map((ev) => (
                <li key={ev.id}>
                  {ev.title} · {formatEventTime(ev.start)}
                </li>
              ))}
            </ul>
          </div>
          <div style={{ minWidth: 160 }}>
            <div className="text-xs font-medium">Unread/email load</div>
            <div className="text-lg font-semibold">
              {kpis.totalEmails || 0}
            </div>
            <div className="muted text-xs">Inbox items loaded</div>
          </div>
        </div>
      </div>

      {error && <p className="error-text mt-2">{error}</p>}

      {/* KPI + Charts row */}
      <div className="grid-3 mt-3">
        {/* Tasks + completion ring + stacked status */}
        <section className="card">
          <div className="flex justify-between items-start gap-3">
            <div>
              <h3 className="card-title">Tasks</h3>
              <div className="flex items-baseline gap-2 mt-1">
                <span className="text-sm muted">Total</span>
                <span style={{ fontSize: "1.6rem", fontWeight: 700 }}>
                  {kpis.totalTasks}
                </span>
              </div>
              <div className="text-xs muted mt-1">
                Completion: <strong>{kpis.completionRate}%</strong>
              </div>
              <div className="text-xs muted mt-1">
                To-do: <strong>{kpis.todoTasks}</strong> · In progress:{" "}
                <strong>{kpis.inProgressTasks}</strong> · Done:{" "}
                <strong>{kpis.completedTasks}</strong>
              </div>
              <div className="text-xs" style={{ color: "#b91c1c", marginTop: 4 }}>
                Overdue: <strong>{kpis.overdueTasks}</strong>
              </div>
            </div>

            <div style={{ width: 110, height: 110 }}>
              <ResponsiveContainer>
                <RadialBarChart
                  cx="50%"
                  cy="50%"
                  innerRadius="70%"
                  outerRadius="100%"
                  barSize={10}
                  data={completionChartData}
                  startAngle={90}
                  endAngle={-270}
                >
                  <RadialBar
                    dataKey="value"
                    cornerRadius={999}
                    background
                    clockWise
                  />
                  <text
                    x="50%"
                    y="50%"
                    textAnchor="middle"
                    dominantBaseline="middle"
                    style={{
                      fontSize: "0.85rem",
                      fontWeight: 600,
                      fill: "#111827",
                    }}
                  >
                    {kpis.completionRate || 0}%
                  </text>
                </RadialBarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="mt-3" style={{ height: 150 }}>
            <ResponsiveContainer>
              <BarChart data={statusChartData} stackOffset="none" margin={{ top: 4, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="name" hide />
                <YAxis hide />
                <Tooltip />
                <Bar dataKey="todo" stackId="status" fill={STATUS_COLORS.todo} />
                <Bar
                  dataKey="in_progress"
                  stackId="status"
                  fill={STATUS_COLORS.in_progress}
                />
                <Bar dataKey="done" stackId="status" fill={STATUS_COLORS.done} />
              </BarChart>
            </ResponsiveContainer>
            <div
              className="text-[10px] mt-1"
              style={{ fontSize: "0.65rem", color: "#6b7280" }}
            >
              <span style={{ color: STATUS_COLORS.todo }}>■</span> To-do{"  "}
              <span style={{ color: STATUS_COLORS.in_progress }}>■</span> In
              progress{"  "}
              <span style={{ color: STATUS_COLORS.done }}>■</span> Done
            </div>
          </div>
        </section>

        {/* Today card with pie / bar */}
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
            <div className="text-sm mt-1">
              <strong>{kpis.eventsThisWeek}</strong> event
              {kpis.eventsThisWeek === 1 ? "" : "s"} in the next 7 days
            </div>
            <div className="muted text-xs mt-2">
              Make sure you complete your overdue tasks first.
            </div>
          </div>

          <div className="mt-3" style={{ height: 180 }}>
            <ResponsiveContainer>
              <PieChart>
                <Pie
                  data={todayChartData}
                  dataKey="value"
                  nameKey="name"
                  outerRadius={55}
                  innerRadius={30}
                  paddingAngle={1}
                >
                  {todayChartData.map((entry, index) => (
                    <Cell
                      key={`cell-${index}`}
                      fill={INFO_COLORS[index % INFO_COLORS.length]}
                    />
                  ))}
                </Pie>
                <Tooltip />
                <Legend
                  verticalAlign="bottom"
                  height={36}
                  iconSize={8}
                  wrapperStyle={{ fontSize: "0.65rem" }}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </section>

        {/* Workspace card with bars + clock + weather */}
        <section className="card">
          <h3 className="card-title">Workspace</h3>
          <div className="mt-2">
            <div className="text-sm">
              Notes: <strong>{kpis.notesCount}</strong>{" "}
              <span className="muted text-xs">
                ({kpis.dailyNotesCount} daily · {kpis.generalNotesCount} general)
              </span>
            </div>
            <div className="text-sm mt-1">
              Today&apos;s notes: <strong>{kpis.notesTodayCount}</strong>
            </div>
            <div className="text-sm mt-1">
              Contacts: <strong>{kpis.contactsCount}</strong>
            </div>
            <div className="text-sm mt-1">
              Emails today: <strong>{kpis.emailsToday}</strong>{" "}
              <span className="muted text-xs">
                (total {kpis.totalEmails})
              </span>
            </div>
          </div>

          <div className="mt-3" style={{ height: 150 }}>
            <ResponsiveContainer>
              <BarChart
                data={infoChartData}
                margin={{ top: 20, left: -20, right: 4, bottom: 4 }}
              >
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                <YAxis allowDecimals={false} tick={{ fontSize: 10 }} />
                <Tooltip />
                <Bar dataKey="value" radius={[6, 6, 0, 0]} fill="#4f46e5" />
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div className="mt-2">
            <div className="text-xs muted">Right now</div>
            <div className="text-sm">
              {now.toLocaleTimeString([], {
                hour: "2-digit",
                minute: "2-digit",
              })}{" "}
              ·{" "}
              {now.toLocaleDateString(undefined, {
                weekday: "short",
                month: "short",
                day: "numeric",
              })}
            </div>
            <div className="text-xs muted mt-1">
              Time zone: {clock.timezoneLabel}
            </div>
          </div>

          <div className="mt-3">
            <div className="text-xs muted">Weather</div>
            <div className="text-sm">{renderWeatherLine()}</div>
          </div>
        </section>
      </div>

      {/* Tag usage chart */}
      {tagUsageData.length > 0 && (
        <div className="mt-4">
          <section className="card">
            <h3 className="card-title">Top tags by tasks</h3>
            <div className="text-xs muted mt-1">
              How often each tag appears on your tasks (top 6).
            </div>
            <div style={{ height: 180, marginTop: 8 }}>
              <ResponsiveContainer>
                <BarChart
                  data={tagUsageData}
                  layout="vertical"
                  margin={{ top: 10, left: 40, right: 10, bottom: 10 }}
                >
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis type="number" allowDecimals={false} />
                  <YAxis
                    type="category"
                    dataKey="name"
                    tick={{ fontSize: 11 }}
                  />
                  <Tooltip />
                  <Bar dataKey="value" radius={[0, 6, 6, 0]}>
                    {tagUsageData.map((t, idx) => (
                      <Cell key={t.id} fill={t.color || INFO_COLORS[idx % INFO_COLORS.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </section>
        </div>
      )}

      {/* Detailed preview lists */}
      <div className="grid-3 mt-4">
        <section className="card">
          <h3 className="card-title">Top tasks</h3>
          <ul className="list">
            {summary.topTasks.map((t) => {
              const tagsForTask = resolveTaskTags(t);
              const primaryTag = tagsForTask[0] || null;

              return (
                <li
                  key={t.id}
                  className="flex items-center justify-between gap-2 cursor-pointer"
                  onClick={() => navigate(`/tasks?taskId=${t.id}`)}
                >
                  <div className="flex items-center gap-2">
                    {primaryTag && (
                      <span
                        style={{
                          width: 8,
                          height: 8,
                          borderRadius: "999px",
                          backgroundColor: primaryTag.color || "#d4d4d8",
                          flexShrink: 0,
                          marginRight: 4,
                        }}
                      />
                    )}
                    <div>
                      <div className="font-medium">{t.title}</div>
                      <div className="muted text-xs">
                        Due: {formatDueDate(t.due_date)}
                      </div>
                    </div>
                  </div>
                  <span className={`badge badge-${t.status}`}>
                    {t.status.replace("_", " ")}
                  </span>
                </li>
              );
            })}
            {!summary.topTasks.length && (
              <li className="muted">No tasks yet. Add one on the Tasks tab.</li>
            )}
          </ul>
        </section>

        <section className="card">
          <h3 className="card-title">Upcoming events</h3>
          <ul className="list">
            {summary.upcomingEvents.map((e) => (
              <li key={e.id}>
                <div className="font-medium">{e.title}</div>
                <div className="muted text-xs">{formatEventTime(e.start)}</div>
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

      {/* Focus + Context row */}
      <div className="grid-2 mt-4">
        {/* Focus for today */}
        <section className="card">
          <h3 className="card-title">Focus for today</h3>
          <div className="text-xs muted mt-1">
            Start with overdue tasks, then today&apos;s events.
          </div>

          <div className="mt-2">
            <div className="font-medium text-sm">Overdue tasks</div>
            <ul className="list mt-1">
              {summary.overdueTasks.map((t) => {
                const tagsForTask = resolveTaskTags(t);
                const primaryTag = tagsForTask[0] || null;

                return (
                  <li
                    key={t.id}
                    className="flex items-center justify-between gap-2"
                  >
                    <div className="flex items-center gap-2">
                      {primaryTag && (
                        <span
                          style={{
                            width: 8,
                            height: 8,
                            borderRadius: "999px",
                            backgroundColor: primaryTag.color || "#d4d4d8",
                            flexShrink: 0,
                            marginRight: 4,
                          }}
                        />
                      )}
                      <div>
                        <div className="text-sm">{t.title}</div>
                        <div className="muted text-xs">
                          Due: {formatDueDate(t.due_date)}
                        </div>
                      </div>
                    </div>
                    <span className="badge badge-todo">Overdue</span>
                  </li>
                );
              })}
              {!summary.overdueTasks.length && (
                <li className="muted text-xs">
                  No overdue tasks — nice job.
                </li>
              )}
            </ul>
          </div>

          <div className="mt-3">
            <div className="font-medium text-sm">Today&apos;s events</div>
            <ul className="list mt-1">
              {summary.todayEvents.map((e) => (
                <li key={e.id}>
                  <div className="text-sm">{e.title}</div>
                  <div className="muted text-xs">{formatEventTime(e.start)}</div>
                </li>
              ))}
              {!summary.todayEvents.length && (
                <li className="muted text-xs">
                  No events on the calendar for today.
                </li>
              )}
            </ul>
          </div>
        </section>

        {/* Context / jobs overview */}
        <section className="card">
          <h3 className="card-title">By context</h3>
          <div className="text-xs muted mt-1">
            Based on your notes &amp; jobs (e.g. Marysa, NavonLogic, TANF…)
          </div>

          <div className="mt-2">
            <div className="font-medium text-sm">Top contexts</div>
            <ul className="list mt-1">
              {summary.topJobs.map((job) => (
                <li
                  key={job.job}
                  className="flex items-center justify-between gap-2"
                >
                  <div className="text-sm">{job.job}</div>
                  <div className="muted text-xs">
                    {job.count} note{job.count === 1 ? "" : "s"}
                  </div>
                </li>
              ))}
              {!summary.topJobs.length && (
                <li className="muted text-xs">
                  Start tagging notes with a job/context to see this view.
                </li>
              )}
            </ul>
          </div>

          <div className="mt-3">
            <div className="font-medium text-sm">Today&apos;s notes</div>
            <ul className="list mt-1">
              {summary.notesToday.map((n) => (
                <li key={n.id}>
                  <div className="text-sm">{n.title}</div>
                  <div className="muted text-xs line-clamp-2">
                    {n.content}
                  </div>
                </li>
              ))}
              {!summary.notesToday.length && (
                <li className="muted text-xs">
                  No notes for today yet. Capture a quick daily note in the
                  Notes tab.
                </li>
              )}
            </ul>
          </div>
        </section>
      </div>
    </div>
  );
};

export default Dashboard;
