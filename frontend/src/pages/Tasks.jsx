// frontend/src/pages/Tasks.jsx
import React, { useEffect, useState, useMemo } from "react";
import { FaGripLines } from "react-icons/fa";
import client from "../api/client";

const emptyTask = {
  title: "",
  description: "",
  status: "todo",
  due_date: "",
};

const Tasks = () => {
  const [tasks, setTasks] = useState([]);
  const [form, setForm] = useState(emptyTask);
  const [error, setError] = useState("");
  const [dragIndex, setDragIndex] = useState(null);
  const [groupMode, setGroupMode] = useState("day"); // "day" | "week" | "month"

  const load = async () => {
    setError("");
    try {
      console.debug("[Tasks] Loading tasks from /tasks/");
      const res = await client.get("/tasks/");

      // Sort by due_date ascending by default (prioritize earlier tasks)
      const sorted = [...res.data].sort((a, b) => {
        const ad = a.due_date ? new Date(a.due_date) : null;
        const bd = b.due_date ? new Date(b.due_date) : null;

        if (!ad && !bd) return 0;
        if (!ad) return 1; // tasks without date go last
        if (!bd) return -1;

        const at = ad.getTime();
        const bt = bd.getTime();
        if (Number.isNaN(at) || Number.isNaN(bt)) return 0;
        return at - bt;
      });

      console.debug("[Tasks] Loaded & sorted tasks:", sorted);
      setTasks(sorted);
    } catch (err) {
      console.error("[Tasks] Error loading tasks:", err);
      setError("Could not load tasks. Check console for details.");
    }
  };

  useEffect(() => {
    load();
  }, []);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");

    // Build payload and inject "now" as due_date if user left it empty
    const payload = { ...form };
    if (!payload.due_date) {
      const now = new Date();
      payload.due_date = now.toISOString();
      console.debug(
        "[Tasks] No due_date provided, defaulting to now:",
        payload.due_date
      );
    } else {
      console.debug("[Tasks] Using provided due_date:", payload.due_date);
    }

    try {
      console.debug("[Tasks] Creating task with payload:", payload);
      const res = await client.post("/tasks/", payload);
      console.debug("[Tasks] Task created:", res.data);
      setForm(emptyTask);
      // Reload (will sort again by date/time)
      load();
    } catch (err) {
      console.error("[Tasks] Error creating task:", err);

      if (err.response) {
        const { status, data } = err.response;
        if (status === 401) {
          setError(
            "Unauthorized (401). You might not be logged in or your token expired."
          );
        } else {
          setError(
            `Error ${status} while creating task: ${
              typeof data === "string" ? data : JSON.stringify(data)
            }`
          );
        }
      } else {
        setError(
          "Network error while creating task. Check console for details."
        );
      }
    }
  };

  // Toggle task as done/undone via PATCH
  const handleToggleDone = async (task, index) => {
    const newStatus = task.status === "done" ? "todo" : "done";
    console.debug(
      "[Tasks] Toggling task status:",
      task.id,
      "index:",
      index,
      "->",
      newStatus
    );

    try {
      const res = await client.patch(`/tasks/${task.id}/`, {
        status: newStatus,
      });
      console.debug("[Tasks] Task status updated:", res.data);

      setTasks((prev) =>
        prev.map((t) => (t.id === task.id ? res.data : t))
      );
    } catch (err) {
      console.error("[Tasks] Error toggling task status:", err);
      if (err.response) {
        const { status, data } = err.response;
        setError(
          `Error ${status} while updating task: ${
            typeof data === "string" ? data : JSON.stringify(data)
          }`
        );
      } else {
        setError(
          "Network error while updating task. Check console for details."
        );
      }
    }
  };

  // --- Drag & drop reordering (front-end only) ---

  const handleDragStart = (e, index) => {
    console.debug("[Tasks] Drag start at index:", index);
    setDragIndex(index);
    e.dataTransfer.effectAllowed = "move";
  };

  const handleDragOver = (e, index) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  };

  const handleDrop = (e, dropIndex) => {
    e.preventDefault();
    if (dragIndex === null || dragIndex === dropIndex) {
      console.debug(
        "[Tasks] Drop ignored. dragIndex:",
        dragIndex,
        "dropIndex:",
        dropIndex
      );
      return;
    }

    console.debug(
      "[Tasks] Drop. Moving from index",
      dragIndex,
      "to",
      dropIndex
    );

    setTasks((prev) => {
      const newTasks = [...prev];
      const [moved] = newTasks.splice(dragIndex, 1);
      newTasks.splice(dropIndex, 0, moved);
      console.debug(
        "[Tasks] New tasks order (ids):",
        newTasks.map((t) => t.id)
      );
      return newTasks;
    });

    setDragIndex(null);
  };

  const handleDragEnd = () => {
    console.debug("[Tasks] Drag end");
    setDragIndex(null);
  };

  const handleGroupModeChange = (mode) => {
    console.debug("[Tasks] Changing group mode to:", mode);
    setGroupMode(mode);
  };

  // Helper to format due_date nicely in the list
  const formatDueDate = (value) => {
    if (!value) return "No due date";
    try {
      const d = new Date(value);
      if (Number.isNaN(d.getTime())) {
        console.warn("[Tasks] Could not parse due_date:", value);
        return value;
      }
      return d.toLocaleString(undefined, {
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch (err) {
      console.error("[Tasks] Error formatting due_date:", err, value);
      return value;
    }
  };

  // --- Grouping helpers ---

  const startOfDay = (d) => {
    const date = new Date(d);
    date.setHours(0, 0, 0, 0);
    return date;
  };

  const startOfWeek = (d) => {
    const date = startOfDay(d);
    const day = date.getDay(); // 0=Sun
    date.setDate(date.getDate() - day); // week starts Sunday
    return date;
  };

  const startOfMonth = (d) => {
    const date = startOfDay(d);
    date.setDate(1);
    return date;
  };

  const formatDayLabel = (date) => {
    const today = startOfDay(new Date());
    const target = startOfDay(date);
    const diffMs = target.getTime() - today.getTime();
    const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));

    if (diffDays === 0) return "Today";
    if (diffDays === 1) return "Tomorrow";
    if (diffDays === -1) return "Yesterday";

    return target.toLocaleDateString(undefined, {
      weekday: "short",
      month: "short",
      day: "numeric",
    });
  };

  const formatWeekLabel = (date) => {
    const start = startOfWeek(date);
    const end = new Date(start);
    end.setDate(end.getDate() + 6);

    const startStr = start.toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
    });
    const endStr = end.toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
    });

    return `Week of ${startStr} – ${endStr}`;
  };

  const formatMonthLabel = (date) => {
    return date.toLocaleDateString(undefined, {
      month: "long",
      year: "numeric",
    });
  };

  const grouped = useMemo(() => {
    console.debug("[Tasks] Computing grouped tasks for mode:", groupMode);
    const groupsMap = new Map();
    const noDateKey = "no_date";

    tasks.forEach((task, idx) => {
      const raw = task.due_date;
      const d = raw ? new Date(raw) : null;

      let key;
      let label;

      if (!d || Number.isNaN(d.getTime())) {
        key = noDateKey;
        label = "No due date";
      } else {
        if (groupMode === "day") {
          const dayStart = startOfDay(d);
          key = `day-${dayStart.toISOString()}`;
          label = formatDayLabel(dayStart);
        } else if (groupMode === "week") {
          const weekStart = startOfWeek(d);
          key = `week-${weekStart.toISOString()}`;
          label = formatWeekLabel(weekStart);
        } else {
          const monthStart = startOfMonth(d);
          key = `month-${monthStart.getFullYear()}-${monthStart.getMonth()}`;
          label = formatMonthLabel(monthStart);
        }
      }

      if (!groupsMap.has(key)) {
        groupsMap.set(key, { key, label, items: [] });
      }
      groupsMap.get(key).items.push({ task, index: idx, dateObj: d });
    });

    // Turn map into array and sort groups by earliest date in each group
    const groupsArr = Array.from(groupsMap.values());

    groupsArr.sort((a, b) => {
      if (a.key === noDateKey && b.key !== noDateKey) return 1;
      if (b.key === noDateKey && a.key !== noDateKey) return -1;

      const aFirst = a.items.find((x) => x.dateObj && !Number.isNaN(x.dateObj));
      const bFirst = b.items.find((x) => x.dateObj && !Number.isNaN(x.dateObj));

      if (!aFirst && !bFirst) return 0;
      if (!aFirst) return 1;
      if (!bFirst) return -1;

      return aFirst.dateObj.getTime() - bFirst.dateObj.getTime();
    });

    console.debug(
      "[Tasks] Grouped tasks:",
      groupsArr.map((g) => ({
        label: g.label,
        ids: g.items.map((i) => i.task.id),
      }))
    );

    return groupsArr;
  }, [tasks, groupMode]);

  return (
    <div className="page">
      <h2 className="page-title">Tasks</h2>
      <div className="grid-2">
        {/* New task form */}
        <form onSubmit={handleSubmit} className="card form-card">
          <h3 className="card-title">Add task</h3>
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
            Description
            <textarea
              className="field-input"
              name="description"
              value={form.description}
              onChange={handleChange}
              rows={3}
            />
          </label>
          <label className="field-label">
            Status
            <select
              className="field-input"
              name="status"
              value={form.status}
              onChange={handleChange}
            >
              <option value="todo">To Do</option>
              <option value="in_progress">In Progress</option>
              <option value="done">Done</option>
            </select>
          </label>
          <label className="field-label">
            Due date
            <input
              className="field-input"
              type="datetime-local"
              name="due_date"
              value={form.due_date}
              onChange={handleChange}
            />
          </label>

          {error && <p className="error-text mt-2">{error}</p>}

          <button className="primary-btn mt-2" type="submit">
            Save
          </button>
        </form>

        {/* Task list with grouping + drag handle + done checkbox + due date */}
        <div className="card">
          <div className="flex items-center justify-between">
            <h3 className="card-title">Your tasks</h3>
            <div className="calendar-view-toggle">
              <button
                type="button"
                className={
                  "toggle-btn" + (groupMode === "day" ? " toggle-btn-active" : "")
                }
                onClick={() => handleGroupModeChange("day")}
              >
                Day
              </button>
              <button
                type="button"
                className={
                  "toggle-btn" + (groupMode === "week" ? " toggle-btn-active" : "")
                }
                onClick={() => handleGroupModeChange("week")}
              >
                Week
              </button>
              <button
                type="button"
                className={
                  "toggle-btn" + (groupMode === "month" ? " toggle-btn-active" : "")
                }
                onClick={() => handleGroupModeChange("month")}
              >
                Month
              </button>
            </div>
          </div>

          <ul className="list mt-2">
            {grouped.map((group) => (
              <li key={group.key} style={{ marginBottom: 8 }}>
                <div
                  className="muted text-xs"
                  style={{
                    textTransform: "uppercase",
                    letterSpacing: "0.04em",
                    marginBottom: 4,
                  }}
                >
                  {group.label}
                </div>
                <ul className="list">
                  {group.items.map(({ task: t, index }) => {
                    const isDone = t.status === "done";
                    const dueLabel = formatDueDate(t.due_date);

                    return (
                      <li
                        key={t.id}
                        className="flex items-center justify-between gap-4"
                        draggable
                        onDragStart={(e) => handleDragStart(e, index)}
                        onDragOver={(e) => handleDragOver(e, index)}
                        onDrop={(e) => handleDrop(e, index)}
                        onDragEnd={handleDragEnd}
                        style={{
                          padding: "6px 4px",
                          borderRadius: "12px",
                          border:
                            dragIndex === index
                              ? "1px dashed #f59e0b"
                              : "1px solid transparent",
                          backgroundColor:
                            dragIndex === index ? "#fffbeb" : "transparent",
                        }}
                      >
                        {/* Left: sandwich drag handle */}
                        <div
                          className="task-handle"
                          style={{
                            width: 32,
                            height: 32,
                            borderRadius: 999,
                            border: "1px solid #e2e8f0",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            cursor: "grab",
                            backgroundColor: "white",
                          }}
                        >
                          <FaGripLines className="muted" />
                        </div>

                        {/* Middle: checkbox + text + due date */}
                        <div
                          className="flex items-center gap-4"
                          style={{ flex: 1, marginLeft: 8 }}
                        >
                          <input
                            type="checkbox"
                            checked={isDone}
                            onChange={() => handleToggleDone(t, index)}
                          />
                          <div>
                            <div
                              className="font-medium"
                              style={{
                                textDecoration: isDone
                                  ? "line-through"
                                  : "none",
                                opacity: isDone ? 0.6 : 1,
                              }}
                            >
                              {t.title}
                            </div>
                            <div className="muted text-xs line-clamp-2">
                              {t.description}
                            </div>
                            <div className="muted text-xs mt-1">
                              <strong>Due:</strong> {dueLabel}
                            </div>
                          </div>
                        </div>

                        {/* Status pill */}
                        <span className={`badge badge-${t.status}`}>
                          {t.status.replace("_", " ")}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </li>
            ))}
            {!tasks.length && !error && (
              <li className="muted">No tasks yet.</li>
            )}
          </ul>
        </div>
      </div>
    </div>
  );
};

export default Tasks;