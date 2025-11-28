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
  const [viewMode, setViewMode] = useState("calendar"); // "calendar" | "kanban"

  const [relatedNotes, setRelatedNotes] = useState([]);
  const [relatedNotesError, setRelatedNotesError] = useState("");

  // --- Tags state ---
  const [allTags, setAllTags] = useState([]);
  const [tagError, setTagError] = useState("");
  const [tagFormName, setTagFormName] = useState("");
  const [tagFormColor, setTagFormColor] = useState("#f97316");

  // --- Search state ---
  const [searchQuery, setSearchQuery] = useState("");

  // --- Delete state ---
  const [isDeleting, setIsDeleting] = useState(false);

  // --- Form visibility ---
  const [isFormOpen, setIsFormOpen] = useState(false);

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

  const closeForm = () => {
    console.debug("[Tasks] Closing form (back to view-only)");
    setEditingTaskId(null);
    setForm(emptyTask);
    setError("");
    setRelatedNotes([]);
    setRelatedNotesError("");
    setIsFormOpen(false);
  };

  // ----------------------------
  // Create / Update task (form)
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

        // Reload to re-apply global sorting
        await loadTasks();

        // Go back to view-only mode
        closeForm();
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

        // After saving edits, go back to view-only mode
        closeForm();
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
  // Update task from Kanban (inline or drag)
  // ----------------------------
  const handleKanbanUpdateTask = async (taskId, updates) => {
    setError("");
    try {
      console.debug("[Tasks] Kanban updating task", taskId, "with", updates);
      const res = await client.patch(`/tasks/${taskId}/`, updates);
      console.debug("[Tasks] Task updated via Kanban:", res.data);

      setTasks((prev) => prev.map((t) => (t.id === taskId ? res.data : t)));

      if (editingTaskId === taskId) {
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
      console.error("[Tasks] Error updating task from Kanban:", err);
      if (err.response) {
        const { status, data } = err.response;
        setError(
          `Error ${status} while updating task: ${
            typeof data === "string" ? data : JSON.stringify(data)
          }`
        );
      } else {
        setError("Network error while updating task. Check console for details.");
      }
    }
  };

  // ----------------------------
  // Delete task
  // ----------------------------
  const handleDeleteTask = async (taskIdParam) => {
    const id = taskIdParam || editingTaskId;
    if (!id) {
      console.debug("[Tasks] handleDeleteTask called with no id");
      return;
    }

    const confirmed = window.confirm("Delete this task? This cannot be undone.");
    if (!confirmed) {
      console.debug("[Tasks] Delete cancelled by user");
      return;
    }

    try {
      setIsDeleting(true);
      console.debug("[Tasks] Deleting task id=%s via DELETE /tasks/%s/", id, id);
      await client.delete(`/tasks/${id}/`);

      setTasks((prev) => prev.filter((t) => t.id !== id));

      // If we just deleted the currently edited task, close the form
      if (editingTaskId === id) {
        closeForm();
      }
    } catch (err) {
      console.error("[Tasks] Error deleting task:", err);
      if (err.response) {
        const { status, data } = err.response;
        setError(
          `Error ${status} while deleting task: ${
            typeof data === "string" ? data : JSON.stringify(data)
          }`
        );
      } else {
        setError("Network error while deleting task. Check console for details.");
      }
    } finally {
      setIsDeleting(false);
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
  // Drag & drop (calendar list view only)
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

  const handleDragEndList = () => {
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
  // Filtered tasks (search + tags)
  // ----------------------------
  const filteredTasks = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return tasks;

    return tasks.filter((task) => {
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
  }, [tasks, searchQuery, allTags]);

  // ----------------------------
  // Grouped tasks for "calendar" view
  // ----------------------------
  const grouped = useMemo(() => {
    console.debug("[Tasks] Computing grouped tasks for mode:", groupMode);

    const groupsMap = new Map();
    const noDateKey = "no_date";

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
  }, [filteredTasks, groupMode]);

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
    setIsFormOpen(true);
  };

  // ----------------------------
  // Render
  // ----------------------------
  return (
    <div className="page page-tasks">
      <h2 className="page-title">Tasks</h2>

      {/* Full-width form card (hidden until adding/editing) */}
      {isFormOpen && (
        <div className="card form-card">
          <form onSubmit={handleSubmit}>
            <div className="flex items-center justify-between">
              <h3 className="card-title">
                {editingTaskId ? "Edit task" : "Add task"}
              </h3>
              <div className="flex gap-2">
                <button
                  type="button"
                  className="secondary-btn"
                  onClick={closeForm}
                >
                  Cancel
                </button>
                {editingTaskId && (
                  <button
                    type="button"
                    className="secondary-btn"
                    style={{
                      borderColor: "#fecaca",
                      color: "#b91c1c",
                      background: "#fef2f2",
                    }}
                    disabled={isDeleting}
                    onClick={() => handleDeleteTask(editingTaskId)}
                  >
                    {isDeleting ? "Deleting…" : "Delete"}
                  </button>
                )}
              </div>
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
                  No tags yet. Create your first tag below (e.g. "Important", "Work",
                  "Personal").
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
      )}

      {/* View toggle + search + mode-specific UI */}
      <div className="card tasks-list-card" style={{ marginTop: "1.5rem" }}>
        <div className="flex items-center justify-between gap-3">
          <div>
            <h3 className="card-title">Your tasks</h3>
            <p className="muted text-xs">
              Click a task to edit. Use search and tags to narrow down.
            </p>
          </div>

          <div className="flex flex-col items-end gap-2">
            <div className="flex gap-2">
              {/* Add task button */}
              <button
                type="button"
                className="primary-btn"
                onClick={() => {
                  resetToNewTask();
                  setIsFormOpen(true);
                }}
              >
                + Add task
              </button>

              {/* Search */}
              <input
                type="text"
                className="field-input"
                placeholder="Search by title, description, or tag…"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                style={{ maxWidth: 260 }}
              />
            </div>

            {/* View mode toggle: Calendar vs Kanban */}
            <div className="calendar-view-toggle">
              <button
                type="button"
                className={
                  "toggle-btn" +
                  (viewMode === "calendar" ? " toggle-btn-active" : "")
                }
                onClick={() => setViewMode("calendar")}
              >
                Calendar view
              </button>
              <button
                type="button"
                className={
                  "toggle-btn" +
                  (viewMode === "kanban" ? " toggle-btn-active" : "")
                }
                onClick={() => setViewMode("kanban")}
              >
                Kanban view
              </button>
            </div>

            {/* Group mode toggle (only when in calendar view) */}
            {viewMode === "calendar" && (
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
            )}
          </div>
        </div>

        {/* CALENDAR / GROUPED LIST VIEW */}
        {viewMode === "calendar" && (
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
                        onDragEnd={handleDragEndList}
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

                        {/* Right: status + inline delete */}
                        <div className="flex items-center gap-2">
                          <span className={`badge badge-${t.status}`}>
                            {t.status.replace("_", " ")}
                          </span>
                          <button
                            type="button"
                            className="text-xs"
                            style={{
                              border: "none",
                              background: "transparent",
                              color: "#b91c1c",
                              cursor: "pointer",
                            }}
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDeleteTask(t.id);
                            }}
                          >
                            delete
                          </button>
                        </div>
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
        )}

        {/* KANBAN VIEW */}
        {viewMode === "kanban" && (
          <div className="mt-3">
            <KanbanBoard
              tasks={filteredTasks}
              resolveTaskTags={resolveTaskTags}
              formatDueDate={formatDueDate}
              onUpdateTask={handleKanbanUpdateTask}
              onDeleteTask={handleDeleteTask}
            />
            {!tasks.length && !error && (
              <p className="muted mt-2">No tasks yet.</p>
            )}
            {tasks.length > 0 && filteredTasks.length === 0 && (
              <p className="muted mt-2">No tasks match your search.</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

/* -----------------------------
 * KANBAN COMPONENTS & COLORS
 * ----------------------------- */

const STATUS_COLORS = {
  todo: {
    bg: "#eff6ff",
    border: "#bfdbfe",
    text: "#1d4ed8",
  },
  in_progress: {
    bg: "#fef3c7",
    border: "#facc15",
    text: "#92400e",
  },
  done: {
    bg: "#dcfce7",
    border: "#4ade80",
    text: "#166534",
  },
};

// Turn a hex color into a soft, very light background
function hexToSoftBackground(hex) {
  if (!hex || typeof hex !== "string" || !hex.startsWith("#")) {
    return "#f9fafb";
  }

  let r = 240,
    g = 244,
    b = 250; // default slate-50

  try {
    const clean = hex.slice(1);
    const expanded =
      clean.length === 3
        ? clean
            .split("")
            .map((c) => c + c)
            .join("")
        : clean;
    const bigint = parseInt(expanded, 16);

    r = (bigint >> 16) & 255;
    g = (bigint >> 8) & 255;
    b = bigint & 255;
  } catch (e) {
    return "#f9fafb";
  }

  // Mix with white to make it very soft (2/3 white, 1/3 color)
  const mix = (c) => Math.round((c + 255 * 2) / 3);

  const rr = mix(r);
  const gg = mix(g);
  const bb = mix(b);

  return `rgb(${rr}, ${gg}, ${bb})`;
}

const KANBAN_COLUMNS = [
  { key: "todo", label: "To Do" },
  { key: "in_progress", label: "In Progress" },
  { key: "done", label: "Done" },
];

const KanbanBoard = ({
  tasks,
  resolveTaskTags,
  formatDueDate,
  onUpdateTask,
  onDeleteTask,
}) => {
  const [dragTaskId, setDragTaskId] = useState(null);

  const columns = useMemo(() => {
    const grouped = {
      todo: [],
      in_progress: [],
      done: [],
    };

    tasks.forEach((task) => {
      const status = task.status || "todo";
      if (!grouped[status]) {
        grouped.todo.push(task);
      } else {
        grouped[status].push(task);
      }
    });

    return grouped;
  }, [tasks]);

  const handleCardDragStart = (taskId) => {
    setDragTaskId(taskId);
  };

  const handleColumnDrop = (status) => {
    if (!dragTaskId) return;
    const task = tasks.find((t) => t.id === dragTaskId);
    if (!task) {
      setDragTaskId(null);
      return;
    }

    const currentStatus = task.status || "todo";
    if (currentStatus === status) {
      setDragTaskId(null);
      return;
    }

    onUpdateTask(task.id, { status });
    setDragTaskId(null);
  };

  const handleDragEnd = () => {
    setDragTaskId(null);
  };

  return (
    <div className="kanban-board">
      {KANBAN_COLUMNS.map((col) => (
        <KanbanColumn
          key={col.key}
          title={col.label}
          status={col.key}
          tasks={columns[col.key] || []}
          resolveTaskTags={resolveTaskTags}
          formatDueDate={formatDueDate}
          onUpdateTask={onUpdateTask}
          onDeleteTask={onDeleteTask}
          onCardDragStart={handleCardDragStart}
          onColumnDrop={handleColumnDrop}
          onCardDragEnd={handleDragEnd}
          isActiveDropTarget={dragTaskId != null}
        />
      ))}
    </div>
  );
};

const KanbanColumn = ({
  title,
  status,
  tasks,
  resolveTaskTags,
  formatDueDate,
  onUpdateTask,
  onDeleteTask,
  onCardDragStart,
  onColumnDrop,
  onCardDragEnd,
  isActiveDropTarget,
}) => {
  const theme = STATUS_COLORS[status] || STATUS_COLORS.todo;

  const handleDragOver = (e) => {
    e.preventDefault();
  };

  const handleDrop = (e) => {
    e.preventDefault();
    onColumnDrop(status);
  };

  return (
    <div
      className="kanban-column"
      style={{
        backgroundColor: "#f9fafb",
        borderColor: theme.border,
      }}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      <div className="kanban-column__header">
        <h2>{title}</h2>
        <span
          className="kanban-column__count"
          style={{
            backgroundColor: theme.bg,
            color: theme.text,
          }}
        >
          {tasks.length}
        </span>
      </div>
      <div
        className="kanban-column__body"
        style={{
          outline: isActiveDropTarget ? "1px dashed rgba(148,163,184,0.6)" : "none",
          outlineOffset: 4,
          transition: "outline 0.15s ease-out",
        }}
      >
        {tasks.map((task) => (
          <KanbanCard
            key={task.id}
            task={task}
            columnStatus={status}
            resolveTaskTags={resolveTaskTags}
            formatDueDate={formatDueDate}
            onUpdateTask={onUpdateTask}
            onDeleteTask={onDeleteTask}
            onCardDragStart={onCardDragStart}
            onCardDragEnd={onCardDragEnd}
          />
        ))}
        {tasks.length === 0 && (
          <p className="muted text-xs mt-1">No tasks in this column.</p>
        )}
      </div>
    </div>
  );
};

const KanbanCard = ({
  task,
  columnStatus,
  resolveTaskTags,
  formatDueDate,
  onUpdateTask,
  onDeleteTask,
  onCardDragStart,
  onCardDragEnd,
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [draftTitle, setDraftTitle] = useState(task.title || "");
  const [draftDescription, setDraftDescription] = useState(
    task.description || ""
  );
  const [draftStatus, setDraftStatus] = useState(
    task.status || columnStatus || "todo"
  );

  const taskTags = resolveTaskTags(task);
  const dueLabel = formatDueDate(task.due_date);

  // Color logic: prefer first tag color, fallback to status theme
  const statusKey = task.status || columnStatus || "todo";
  const statusTheme = STATUS_COLORS[statusKey] || STATUS_COLORS.todo;

  const primaryTagColor =
    taskTags.length && taskTags[0].color ? taskTags[0].color : null;

  const accentBorderColor = primaryTagColor || statusTheme.border;
  const accentBgSoft = primaryTagColor
    ? hexToSoftBackground(primaryTagColor)
    : statusTheme.bg;

  const handleSave = () => {
    onUpdateTask(task.id, {
      title: draftTitle,
      description: draftDescription,
      status: draftStatus,
    });
    setIsEditing(false);
  };

  const handleCancel = () => {
    setDraftTitle(task.title || "");
    setDraftDescription(task.description || "");
    setDraftStatus(task.status || columnStatus || "todo");
    setIsEditing(false);
  };

  const handleDelete = (e) => {
    e.stopPropagation();
    onDeleteTask(task.id);
  };

  const handleDragStart = (e) => {
    onCardDragStart(task.id);
    e.dataTransfer.effectAllowed = "move";
  };

  const handleDragEnd = () => {
    onCardDragEnd();
  };

  if (isEditing) {
    return (
      <div
        className="kanban-card kanban-card--editing"
        style={{
          borderColor: accentBorderColor,
          backgroundColor: accentBgSoft,
        }}
      >
        <div
          style={{
            height: 3,
            borderRadius: "999px",
            backgroundColor: accentBorderColor,
            marginBottom: 6,
          }}
        />

        <input
          className="kanban-card__title-input"
          value={draftTitle}
          onChange={(e) => setDraftTitle(e.target.value)}
          placeholder="Task title"
        />
        <textarea
          className="kanban-card__description-input"
          value={draftDescription}
          onChange={(e) => setDraftDescription(e.target.value)}
          placeholder="Description"
          rows={3}
        />
        <div className="kanban-card__meta">
          <div className="kanban-card__field">
            <label>Status</label>
            <select
              value={draftStatus}
              onChange={(e) => setDraftStatus(e.target.value)}
            >
              <option value="todo">To Do</option>
              <option value="in_progress">In Progress</option>
              <option value="done">Done</option>
            </select>
          </div>
        </div>
        <div className="kanban-card__actions">
          <button type="button" onClick={handleCancel}>
            Cancel
          </button>
          <button type="button" onClick={handleSave}>
            Save
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      className="kanban-card"
      draggable
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onClick={() => setIsEditing(true)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          setIsEditing(true);
        }
      }}
      style={{
        borderColor: accentBorderColor,
        backgroundColor: accentBgSoft,
        boxShadow: "0 1px 3px rgba(15,23,42,0.12)",
      }}
    >
      {/* Accent bar */}
      <div
        style={{
          height: 3,
          borderRadius: "999px",
          backgroundColor: accentBorderColor,
          marginBottom: 6,
        }}
      />

      <div className="kanban-card__title">{task.title}</div>

      {task.description && (
        <div className="kanban-card__description">
          {task.description.length > 120
            ? task.description.slice(0, 120) + "…"
            : task.description}
        </div>
      )}

      <div className="kanban-card__tags">
        {taskTags.map((tag) => (
          <span
            key={tag.id}
            className="badge"
            style={{
              borderRadius: 999,
              padding: "1px 8px",
              fontSize: "0.7rem",
              backgroundColor: tag.color || "#f3f4f6",
              border: "1px solid rgba(15,23,42,0.08)",
            }}
          >
            {tag.name}
          </span>
        ))}
      </div>

      <div className="kanban-card__footer">
        <span className="kanban-card__badge">{dueLabel}</span>
        <span
          className={`kanban-card__status kanban-card__status--${task.status}`}
          style={{
            backgroundColor: accentBorderColor,
            color: "#0f172a",
          }}
        >
          {task.status === "todo"
            ? "To Do"
            : task.status === "in_progress"
            ? "In Progress"
            : "Done"}
        </span>
        <button
          type="button"
          className="kanban-card__delete"
          onClick={handleDelete}
          style={{ color: "#b91c1c" }}
        >
          ✕
        </button>
      </div>
    </div>
  );
};

export default Tasks;