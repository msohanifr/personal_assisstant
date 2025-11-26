// frontend/src/pages/Tasks.jsx
import React, { useEffect, useState, useMemo } from "react";
import { FaGripLines } from "react-icons/fa";
import client from "../api/client";

const emptyTask = {
  title: "",
  description: "",
  status: "todo",
  due_date: "",
  tag_ids: [],
};

const Tasks = () => {
  const [tasks, setTasks] = useState([]);
  const [form, setForm] = useState(emptyTask);
  const [error, setError] = useState("");
  const [dragIndex, setDragIndex] = useState(null);
  const [groupMode, setGroupMode] = useState("day"); // "day" | "week" | "month"
  const [editingTaskId, setEditingTaskId] = useState(null);

  const [relatedNotes, setRelatedNotes] = useState([]);
  const [relatedNotesError, setRelatedNotesError] = useState("");

  // --- Tags state ---
  const [allTags, setAllTags] = useState([]);
  const [tagError, setTagError] = useState("");
  const [tagFormName, setTagFormName] = useState("");
  const [tagFormColor, setTagFormColor] = useState("#f97316");

  // --- Search state ---
  const [searchQuery, setSearchQuery] = useState("");

  // ----------------------------
  // Load tasks
  // ----------------------------
  const loadTasks = async () => {
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

  // ----------------------------
  // Load tags
  // ----------------------------
  const loadTags = async () => {
    setTagError("");
    try {
      console.debug("[Tasks] Loading tags from /task-tags/");
      const res = await client.get("/task-tags/");
      console.debug("[Tasks] Loaded tags:", res.data);
      setAllTags(res.data || []);
    } catch (err) {
      console.error("[Tasks] Error loading tags:", err);
      if (err.response) {
        const { status, data } = err.response;
        setTagError(
          `Error ${status} while loading tags: ${
            typeof data === "string" ? data : JSON.stringify(data)
          }`
        );
      } else {
        setTagError("Network error while loading tags. Check console for details.");
      }
    }
  };

  useEffect(() => {
    loadTasks();
    loadTags();
  }, []);

  // ----------------------------
  // General helpers
  // ----------------------------
  const handleChange = (e) => {
    const { name, value } = e.target;
    console.debug("[Tasks] Form change:", name, "->", value);
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const toInputDateTime = (value) => {
    if (!value) return "";
    try {
      const d = new Date(value);
      if (Number.isNaN(d.getTime())) {
        console.warn("[Tasks] Could not parse due_date for input:", value);
        return "";
      }
      const pad = (n) => n.toString().padStart(2, "0");
      const year = d.getFullYear();
      const month = pad(d.getMonth() + 1);
      const day = pad(d.getDate());
      const hours = pad(d.getHours());
      const minutes = pad(d.getMinutes());
      // datetime-local expects "YYYY-MM-DDTHH:MM"
      return `${year}-${month}-${day}T${hours}:${minutes}`;
    } catch (err) {
      console.error("[Tasks] Error converting due_date to input format:", err, value);
      return "";
    }
  };

  const resetToNewTask = () => {
    console.debug("[Tasks] Resetting form to new task");
    setEditingTaskId(null);
    setForm(emptyTask);
    setError("");
    setRelatedNotes([]);
    setRelatedNotesError("");
  };

  // ----------------------------
  // Create / Update task
  // ----------------------------
  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");

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

    // Ensure tag_ids is always an array
    if (!Array.isArray(payload.tag_ids)) {
      payload.tag_ids = [];
    }

    try {
      if (!editingTaskId) {
        // CREATE
        console.debug("[Tasks] Creating task with payload:", payload);
        const res = await client.post("/tasks/", payload);
        console.debug("[Tasks] Task created:", res.data);
        setForm(emptyTask);
        setEditingTaskId(null);
        setRelatedNotes([]);
        setRelatedNotesError("");
        // Reload to re-apply global sorting
        loadTasks();
      } else {
        // UPDATE
        console.debug(
          "[Tasks] Updating task",
          editingTaskId,
          "with payload:",
          payload
        );
        const res = await client.patch(`/tasks/${editingTaskId}/`, payload);
        console.debug("[Tasks] Task updated:", res.data);

        setTasks((prev) =>
          prev.map((t) => (t.id === editingTaskId ? res.data : t))
        );

        const taskTagIds = resolveTaskTagIds(res.data);
        setForm({
          title: res.data.title || "",
          description: res.data.description || "",
          status: res.data.status || "todo",
          due_date: res.data.due_date ? toInputDateTime(res.data.due_date) : "",
          tag_ids: taskTagIds,
        });
      }
    } catch (err) {
      console.error("[Tasks] Error saving task:", err);

      if (err.response) {
        const { status, data } = err.response;
        if (status === 401) {
          setError(
            "Unauthorized (401). You might not be logged in or your token expired."
          );
        } else {
          setError(
            `Error ${status} while saving task: ${
              typeof data === "string" ? data : JSON.stringify(data)
            }`
          );
        }
      } else {
        setError("Network error while saving task. Check console for details.");
      }
    }
  };

  // ----------------------------
  // Related notes
  // ----------------------------
  const loadRelatedNotes = async (taskId) => {
    setRelatedNotes([]);
    setRelatedNotesError("");
    if (!taskId) {
      console.debug("[Tasks] loadRelatedNotes called with no taskId, skipping");
      return;
    }

    try {
      console.debug(
        "[Tasks] Loading related notes for task %s via /notes/?task=%s",
        taskId,
        taskId
      );
      const res = await client.get(`/notes/?task=${taskId}`);
      console.debug(
        "[Tasks] Related notes loaded for task %s:",
        taskId,
        res.data
      );
      setRelatedNotes(res.data || []);
    } catch (err) {
      console.error("[Tasks] Error loading related notes:", err);
      if (err.response) {
        const { status, data } = err.response;
        setRelatedNotesError(
          `Error ${status} while loading notes: ${
            typeof data === "string" ? data : JSON.stringify(data)
          }`
        );
      } else {
        setRelatedNotesError(
          "Network error while loading notes. Check console for details."
        );
      }
    }
  };

  // ----------------------------
  // Toggle done
  // ----------------------------
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

      if (editingTaskId === task.id) {
        setForm((prev) => ({
          ...prev,
          status: res.data.status || prev.status,
        }));
      }
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

  // ----------------------------
  // Drag & drop (front-end only)
  // ----------------------------
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

  // ----------------------------
  // Grouping & formatting helpers
  // ----------------------------
  const handleGroupModeChange = (mode) => {
    console.debug("[Tasks] Changing group mode to:", mode);
    setGroupMode(mode);
  };

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

  // ----------------------------
  // Tag helpers
  // ----------------------------
  const resolveTaskTagIds = (task) => {
    if (!task) return [];
    // If backend sends tag_ids directly
    if (Array.isArray(task.tag_ids)) {
      return task.tag_ids;
    }
    // If backend sends tags as objects
    if (Array.isArray(task.tags) && task.tags.length > 0) {
      if (typeof task.tags[0] === "object") {
        return task.tags.map((t) => t.id);
      }
      // If it's an array of IDs
      return task.tags;
    }
    return [];
  };

  const resolveTaskTags = (task) => {
    const ids = resolveTaskTagIds(task);
    if (!ids.length || !allTags.length) return [];
    return allTags.filter((tag) => ids.includes(tag.id));
  };

  const toggleTagOnForm = (tagId) => {
    setForm((prev) => {
      const current = Array.isArray(prev.tag_ids) ? prev.tag_ids : [];
      if (current.includes(tagId)) {
        return { ...prev, tag_ids: current.filter((id) => id !== tagId) };
      }
      return { ...prev, tag_ids: [...current, tagId] };
    });
  };

  const handleCreateTag = async (e) => {
    e.preventDefault();
    setTagError("");

    const name = tagFormName.trim();
    if (!name) {
      setTagError("Tag name cannot be empty.");
      return;
    }

    try {
      console.debug("[Tasks] Creating tag:", { name, color: tagFormColor });
      const res = await client.post("/task-tags/", {
        name,
        color: tagFormColor,
      });
      console.debug("[Tasks] Tag created:", res.data);

      setAllTags((prev) => [...prev, res.data]);
      setTagFormName("");
      setTagFormColor("#f97316");
    } catch (err) {
      console.error("[Tasks] Error creating tag:", err);
      if (err.response) {
        const { status, data } = err.response;
        setTagError(
          `Error ${status} while creating tag: ${
            typeof data === "string" ? data : JSON.stringify(data)
          }`
        );
      } else {
        setTagError("Network error while creating tag. Check console for details.");
      }
    }
  };

  // ----------------------------
  // Grouped & filtered tasks
  // ----------------------------
  const grouped = useMemo(() => {
    console.debug("[Tasks] Computing grouped tasks for mode:", groupMode);

    const q = searchQuery.trim().toLowerCase();
    const groupsMap = new Map();
    const noDateKey = "no_date";

    const filteredTasks = tasks.filter((task) => {
      if (!q) return true;

      const title = (task.title || "").toLowerCase();
      const description = (task.description || "").toLowerCase();
      const taskTags = resolveTaskTags(task);
      const tagText = taskTags.map((t) => t.name.toLowerCase()).join(" ");

      return (
        title.includes(q) ||
        description.includes(q) ||
        (tagText && tagText.includes(q))
      );
    });

    filteredTasks.forEach((task, idx) => {
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
      "[Tasks] Grouped tasks (after search):",
      groupsArr.map((g) => ({
        label: g.label,
        ids: g.items.map((i) => i.task.id),
      }))
    );

    return groupsArr;
  }, [tasks, groupMode, searchQuery, allTags]);

  // ----------------------------
  // Select task for editing
  // ----------------------------
  const handleSelectTask = (task) => {
    console.debug("[Tasks] Selecting task for editing:", task.id);
    const tag_ids = resolveTaskTagIds(task);

    setEditingTaskId(task.id);
    setForm({
      title: task.title || "",
      description: task.description || "",
      status: task.status || "todo",
      due_date: task.due_date ? toInputDateTime(task.due_date) : "",
      tag_ids,
    });
    setError("");
    loadRelatedNotes(task.id);
  };

  // ----------------------------
  // Render
  // ----------------------------
  return (
    <div className="page page-tasks">
    <h2 className="page-title">Tasks</h2>

      {/* Full-width form card */}
      <div className="card form-card">
        <form onSubmit={handleSubmit}>
          <div className="flex items-center justify-between">
            <h3 className="card-title">
              {editingTaskId ? "Edit task" : "Add task"}
            </h3>
            {editingTaskId && (
              <button
                type="button"
                className="secondary-btn"
                onClick={resetToNewTask}
              >
                New task
              </button>
            )}
          </div>

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

          {/* Tags selector */}
          <div className="field-label" style={{ marginTop: "0.75rem" }}>
            <div className="flex items-center justify-between">
              <span>Tags</span>
            </div>
            {tagError && <p className="error-text mt-1">{tagError}</p>}
            {!allTags.length && !tagError && (
              <p className="muted text-xs mt-1">
                No tags yet. Create your first tag below (e.g. "Important", "Work", "Personal").
              </p>
            )}
            {allTags.length > 0 && (
              <div className="flex flex-wrap gap-2 mt-1">
                {allTags.map((tag) => {
                  const isSelected = form.tag_ids?.includes(tag.id);
                  return (
                    <button
                      key={tag.id}
                      type="button"
                      onClick={() => toggleTagOnForm(tag.id)}
                      className="badge"
                      style={{
                        borderRadius: "999px",
                        border: isSelected
                          ? "1px solid #f97316"
                          : "1px solid #e2e8f0",
                        backgroundColor: isSelected
                          ? tag.color || "#fff7ed"
                          : "#f8fafc",
                        padding: "2px 10px",
                        fontSize: "0.75rem",
                        cursor: "pointer",
                        display: "flex",
                        alignItems: "center",
                        gap: 6,
                      }}
                    >
                      <span
                        style={{
                          width: 8,
                          height: 8,
                          borderRadius: "999px",
                          backgroundColor: tag.color || "#f97316",
                        }}
                      />
                      <span>{tag.name}</span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {error && <p className="error-text mt-2">{error}</p>}

          <button className="primary-btn mt-3" type="submit">
            {editingTaskId ? "Update" : "Save"}
          </button>
        </form>

        {/* Related notes for selected task */}
        {editingTaskId && (
          <div className="mt-4">
            <div className="flex items-center justify-between">
              <h4
                className="text-sm font-medium"
                style={{ margin: 0, padding: 0 }}
              >
                Related notes
              </h4>
            </div>
            {relatedNotesError && (
              <p className="error-text mt-1">{relatedNotesError}</p>
            )}
            {!relatedNotesError && relatedNotes.length === 0 && (
              <p className="muted text-xs mt-1">
                No notes attached to this task yet.
              </p>
            )}
            {relatedNotes.length > 0 && (
              <ul className="list mt-2">
                {relatedNotes.map((n) => (
                  <li key={n.id} className="card" style={{ marginBottom: 6 }}>
                    <div className="font-medium">{n.title}</div>
                    <div className="muted text-xs">
                      {n.job && <span>{n.job} · </span>}
                      {n.note_type === "daily" ? "Daily note" : "General"}
                    </div>
                    <p className="mt-1 text-sm line-clamp-2">{n.content}</p>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {/* Create new tag */}
        <div
          className="mt-4"
          style={{
            marginTop: "1.5rem",
            paddingTop: "1rem",
            borderTop: "1px solid #e5e7eb",
          }}
        >
          <h4
            className="text-sm font-medium"
            style={{ margin: 0, marginBottom: "0.5rem" }}
          >
            Create new tag
          </h4>
          <form
            onSubmit={handleCreateTag}
            className="flex items-center gap-2"
          >
            <input
              className="field-input"
              placeholder='e.g. "Important" or "Work"'
              value={tagFormName}
              onChange={(e) => setTagFormName(e.target.value)}
            />
            <input
              type="color"
              value={tagFormColor}
              onChange={(e) => setTagFormColor(e.target.value)}
              style={{
                width: 40,
                height: 32,
                padding: 0,
                borderRadius: 8,
                border: "1px solid #e2e8f0",
              }}
              title="Tag color"
            />
            <button type="submit" className="secondary-btn">
              Add
            </button>
          </form>
        </div>
      </div>

      {/* Full-width tasks list card */}
      <div className="card tasks-list-card" style={{ marginTop: "1.5rem" }}>
        <div className="flex items-center justify-between gap-3">
          <div>
            <h3 className="card-title">Your tasks</h3>
            <p className="muted text-xs">
              Click a task to edit. Use search and tags to narrow down.
            </p>
          </div>

          <div className="flex flex-col items-end gap-2">
            {/* Search */}
            <input
              type="text"
              className="field-input"
              placeholder="Search by title, description, or tag…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{ maxWidth: 260 }}
            />

            {/* Group mode toggle */}
            <div className="calendar-view-toggle">
              <button
                type="button"
                className={
                  "toggle-btn" +
                  (groupMode === "day" ? " toggle-btn-active" : "")
                }
                onClick={() => handleGroupModeChange("day")}
              >
                Day
              </button>
              <button
                type="button"
                className={
                  "toggle-btn" +
                  (groupMode === "week" ? " toggle-btn-active" : "")
                }
                onClick={() => handleGroupModeChange("week")}
              >
                Week
              </button>
              <button
                type="button"
                className={
                  "toggle-btn" +
                  (groupMode === "month" ? " toggle-btn-active" : "")
                }
                onClick={() => handleGroupModeChange("month")}
              >
                Month
              </button>
            </div>
          </div>
        </div>

        <ul className="list mt-3">
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
                  const isSelected = editingTaskId === t.id;
                  const taskTags = resolveTaskTags(t);

                  return (
                    <li
                      key={t.id}
                      className="flex items-center justify-between gap-4"
                      draggable
                      onDragStart={(e) => handleDragStart(e, index)}
                      onDragOver={(e) => handleDragOver(e, index)}
                      onDrop={(e) => handleDrop(e, index)}
                      onDragEnd={handleDragEnd}
                      onClick={() => handleSelectTask(t)}
                      style={{
                        padding: "6px 4px",
                        borderRadius: "12px",
                        border:
                          dragIndex === index
                            ? "1px dashed #f59e0b"
                            : isSelected
                            ? "1px solid #f97316"
                            : "1px solid transparent",
                        backgroundColor:
                          dragIndex === index
                            ? "#fffbeb"
                            : isSelected
                            ? "#fff7ed"
                            : "transparent",
                      }}
                    >
                      {/* Left: drag handle */}
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
                        onClick={(e) => e.stopPropagation()}
                      >
                        <FaGripLines className="muted" />
                      </div>

                      {/* Middle: checkbox + content */}
                      <div
                        className="flex items-start gap-4"
                        style={{ flex: 1, marginLeft: 8 }}
                      >
                        <input
                          type="checkbox"
                          checked={isDone}
                          onChange={() => handleToggleDone(t, index)}
                          onClick={(e) => e.stopPropagation()}
                          style={{ marginTop: 4 }}
                        />
                        <div>
                          <div
                            className="font-medium"
                            style={{
                              textDecoration: isDone ? "line-through" : "none",
                              opacity: isDone ? 0.6 : 1,
                            }}
                          >
                            {t.title}
                          </div>
                          {t.description && (
                            <div className="muted text-xs line-clamp-2">
                              {t.description}
                            </div>
                          )}
                          <div className="muted text-xs mt-1">
                            <strong>Due:</strong> {dueLabel}
                          </div>

                          {/* Task tags display */}
                          {taskTags.length > 0 && (
                            <div className="flex flex-wrap gap-1 mt-1">
                              {taskTags.map((tag) => (
                                <span
                                  key={tag.id}
                                  className="badge"
                                  style={{
                                    borderRadius: 999,
                                    padding: "1px 8px",
                                    fontSize: "0.7rem",
                                    backgroundColor:
                                      tag.color || "#f3f4f6",
                                    border: "1px solid #e5e7eb",
                                  }}
                                >
                                  {tag.name}
                                </span>
                              ))}
                            </div>
                          )}
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
          {tasks.length > 0 && grouped.length === 0 && (
            <li className="muted">No tasks match your search.</li>
          )}
        </ul>
      </div>
    </div>
  );
};

export default Tasks;