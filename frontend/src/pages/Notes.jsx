// frontend/src/pages/Notes.jsx
import React, { useEffect, useState, useRef } from "react";
import client from "../api/client";

const emptyNote = {
  title: "",
  content: "",
  note_type: "daily",
  date: new Date().toISOString().slice(0, 10),
  job: "",
  task: "",
};

const Notes = () => {
  const [notes, setNotes] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [form, setForm] = useState(emptyNote);
  const [jobFilter, setJobFilter] = useState("all");
  const [error, setError] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  // New: search, type filter, pagination
  const [searchQuery, setSearchQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState("all"); // "all" | "daily" | "general"
  const [page, setPage] = useState(1); // 1-based

  // Are we editing an existing note?
  const [editingNoteId, setEditingNoteId] = useState(null);
  const [existingAttachments, setExistingAttachments] = useState([]);
  const [files, setFiles] = useState([]); // new attachments to upload

  // Rich text editor ref (uncontrolled contentEditable)
  const editorRef = useRef(null);

  // --- Loaders with logging ---

  const loadNotes = async () => {
    setError("");
    try {
      console.debug("[Notes] Loading notes from /notes/");
      const res = await client.get("/notes/");
      console.debug("[Notes] Loaded notes:", res.data);
      const data = res.data || [];
      setNotes(data);
      return data;
    } catch (err) {
      console.error("[Notes] Error loading notes:", err);
      setError("Could not load notes. Check console for details.");
      return [];
    }
  };

  const loadTasks = async () => {
    try {
      console.debug("[Notes] Loading tasks for task-link dropdown from /tasks/");
      const res = await client.get("/tasks/");
      console.debug("[Notes] Loaded tasks:", res.data);
      setTasks(res.data || []);
    } catch (err) {
      console.error("[Notes] Error loading tasks:", err);
      // not fatal
    }
  };

  useEffect(() => {
    loadNotes();
    loadTasks();
  }, []);

  // Whenever we switch which note we are editing (or reset),
  // push the current form.content into the editor DOM ONCE.
  useEffect(() => {
    if (editorRef.current) {
      console.debug(
        "[Notes] Syncing editor DOM from form.content for editingNoteId:",
        editingNoteId
      );
      editorRef.current.innerHTML = form.content || "";
    }
  }, [editingNoteId]);

  // When filters/search change, reset to first page
  useEffect(() => {
    console.debug("[Notes] Filters/search changed, resetting page=1", {
      searchQuery,
      jobFilter,
      typeFilter,
    });
    setPage(1);
  }, [searchQuery, jobFilter, typeFilter]);

  // --- Form + attachments ---

  const handleChange = (e) => {
    const { name, value } = e.target;
    console.debug("[Notes] Form change:", name, "->", value);
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleFileChange = (e) => {
    const selected = Array.from(e.target.files || []);
    if (!selected.length) return;
    console.debug("[Notes] Adding file attachments:", selected.map((f) => f.name));
    setFiles((prev) => [...prev, ...selected]);
    e.target.value = "";
  };

  const uploadAttachments = async (noteId) => {
    if (!files.length) {
      console.debug("[Notes] No new attachments to upload for note", noteId);
      return;
    }

    console.debug(
      "[Notes] Uploading",
      files.length,
      "new attachment(s) for note",
      noteId
    );

    for (const file of files) {
      const formData = new FormData();
      formData.append("note", noteId);
      formData.append("file", file);

      try {
        console.debug("[Notes] POST /note-attachments/ for", file.name);
        await client.post("/note-attachments/", formData, {
          headers: { "Content-Type": "multipart/form-data" },
        });
      } catch (err) {
        console.error("[Notes] Error uploading attachment", file.name, err);
      }
    }

    console.debug("[Notes] Finished uploading new attachments for note", noteId);
  };

  const resetToNewNote = () => {
    console.debug("[Notes] Resetting editor to new note");
    setEditingNoteId(null);
    setForm({
      ...emptyNote,
      date: new Date().toISOString().slice(0, 10),
    });
    setFiles([]);
    setExistingAttachments([]);
    if (editorRef.current) {
      editorRef.current.innerHTML = "";
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setIsSaving(true);

    try {
      let payload = { ...form };
      if (!payload.title.trim()) {
        setError("Title is required.");
        setIsSaving(false);
        return;
      }
      if (!payload.date) {
        payload.date = new Date().toISOString().slice(0, 10);
      }
      if (!payload.task) {
        payload.task = null;
      }

      if (!editingNoteId) {
        // CREATE
        console.debug("[Notes] Creating note with payload:", payload);
        const res = await client.post("/notes/", payload);
        console.debug("[Notes] Note created:", res.data);
        const noteId = res.data.id;
        if (noteId) {
          await uploadAttachments(noteId);
        }
        const data = await loadNotes();
        resetToNewNote();
        console.debug("[Notes] Notes after create (count=%s)", data.length);
      } else {
        // UPDATE
        console.debug(
          "[Notes] Updating note",
          editingNoteId,
          "with payload:",
          payload
        );
        const res = await client.patch(`/notes/${editingNoteId}/`, payload);
        console.debug("[Notes] Note updated:", res.data);
        const noteId = res.data.id;
        if (noteId) {
          await uploadAttachments(noteId);
        }
        // Refresh list and re-sync selected note & attachments
        const data = await loadNotes();
        const refreshed = data.find((n) => n.id === editingNoteId);
        if (refreshed) {
          console.debug("[Notes] Refreshed edited note from server:", refreshed);
          setForm({
            title: refreshed.title || "",
            content: refreshed.content || "",
            note_type: refreshed.note_type || "general",
            date:
              refreshed.date ||
              refreshed.created_at?.slice(0, 10) ||
              new Date().toISOString().slice(0, 10),
            job: refreshed.job || "",
            task: refreshed.task || "",
          });
          setExistingAttachments(refreshed.attachments || []);
          setFiles([]);
          if (editorRef.current) {
            editorRef.current.innerHTML = refreshed.content || "";
          }
        } else {
          console.warn(
            "[Notes] Could not find edited note in refreshed list, resetting to new note"
          );
          resetToNewNote();
        }
      }
    } catch (err) {
      console.error("[Notes] Error saving note:", err);
      if (err.response) {
        const { status, data } = err.response;
        setError(
          `Error ${status} while saving note: ${
            typeof data === "string" ? data : JSON.stringify(data)
          }`
        );
      } else {
        setError("Network error while saving note. Check console for details.");
      }
    } finally {
      setIsSaving(false);
    }
  };

  // 🔥 Delete note
  const handleDeleteNote = async () => {
    if (!editingNoteId) {
      console.debug("[Notes] handleDeleteNote called with no editingNoteId");
      return;
    }

    const confirmDelete = window.confirm(
      "Delete this note? This cannot be undone."
    );
    if (!confirmDelete) {
      console.debug("[Notes] Delete cancelled by user");
      return;
    }

    try {
      console.debug(
        "[Notes] Deleting note id=%s via DELETE /notes/%s/",
        editingNoteId,
        editingNoteId
      );
      await client.delete(`/notes/${editingNoteId}/`);
      console.debug("[Notes] Delete successful for id=%s", editingNoteId);

      setNotes((prev) => prev.filter((n) => n.id !== editingNoteId));
      resetToNewNote();
    } catch (err) {
      console.error("[Notes] Error deleting note:", err);
      if (err.response) {
        const { status, data } = err.response;
        setError(
          `Error ${status} while deleting note: ${
            typeof data === "string" ? data : JSON.stringify(data)
          }`
        );
      } else {
        setError("Network error while deleting note. Check console for details.");
      }
    }
  };

  // --- Rich text toolbar helpers (WYSIWYG, uncontrolled editor) ---

  const execCommand = (cmd, value = null) => {
    console.debug("[Notes] execCommand:", cmd, value);
    if (editorRef.current) {
      editorRef.current.focus();
    }
    try {
      document.execCommand(cmd, false, value);
      if (editorRef.current) {
        const html = editorRef.current.innerHTML;
        setForm((prev) => ({ ...prev, content: html }));
      }
    } catch (err) {
      console.error("[Notes] execCommand error:", cmd, value, err);
    }
  };

  const applyInlineCode = () => {
    if (!editorRef.current) return;
    editorRef.current.focus();
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) {
      execCommand("insertHTML", "<code>code</code>");
      return;
    }
    const range = selection.getRangeAt(0);
    const selectedText = range.toString() || "code";
    const codeNode = document.createElement("code");
    codeNode.textContent = selectedText;
    range.deleteContents();
    range.insertNode(codeNode);
    selection.removeAllRanges();
    const newRange = document.createRange();
    newRange.setStartAfter(codeNode);
    newRange.collapse(true);
    selection.addRange(newRange);
    const html = editorRef.current.innerHTML;
    setForm((prev) => ({ ...prev, content: html }));
  };

  const applyCodeBlock = () => {
    if (!editorRef.current) return;
    editorRef.current.focus();
    const selection = window.getSelection();
    const selectedText =
      selection && selection.rangeCount
        ? selection.getRangeAt(0).toString() || "// code here"
        : "// code here";

    const blockHtml = `<pre><code>${selectedText}</code></pre><p></p>`;
    execCommand("insertHTML", blockHtml);
  };

  const applyColor = (color) => {
    execCommand("foreColor", color);
  };

  const handleContentInput = (e) => {
    const html = e.currentTarget.innerHTML;
    console.debug("[Notes] Content input changed, length:", html.length);
    setForm((prev) => ({ ...prev, content: html }));
  };

  // --- Grouping, search, filters & pagination ---

  const stripHtml = (html) =>
    html ? html.replace(/<[^>]+>/g, " ") : "";

  const allJobs = Array.from(
    new Set(
      notes
        .map((n) => n.job)
        .filter((j) => j && j.toString().trim().length > 0)
    )
  );

  // Apply job filter, type filter, and search (title + content text)
  const filteredNotesAll = notes.filter((n) => {
    // Job filter
    if (jobFilter !== "all") {
      const job = (n.job || "").trim();
      if (job !== jobFilter) {
        return false;
      }
    }

    // Type filter
    if (typeFilter !== "all") {
      const t = n.note_type || "general";
      if (t !== typeFilter) {
        return false;
      }
    }

    // Search
    const q = searchQuery.trim().toLowerCase();
    if (!q) {
      return true;
    }
    const title = (n.title || "").toLowerCase();
    const contentText = stripHtml(n.content || "").toLowerCase();

    return title.includes(q) || contentText.includes(q);
  });

  const pageSize = 10; // "last 10" per page
  const totalNotesCount = filteredNotesAll.length;
  const totalPages = totalNotesCount ? Math.ceil(totalNotesCount / pageSize) : 1;
  const safePage = Math.min(page, totalPages);
  const startIndex = totalNotesCount ? (safePage - 1) * pageSize : 0;
  const endIndex = totalNotesCount
    ? Math.min(startIndex + pageSize, totalNotesCount)
    : 0;

  const pageNotes = totalNotesCount
    ? filteredNotesAll.slice(startIndex, endIndex)
    : [];

  console.debug("[Notes] Notes filtering + pagination", {
    total: notes.length,
    afterFilters: totalNotesCount,
    pageSize,
    safePage,
    startIndex,
    endIndex,
  });

  const handlePageChange = (newPage, maxPage) => {
    console.debug("[Notes] handlePageChange:", { newPage, maxPage });
    if (newPage < 1 || newPage > maxPage) {
      console.debug("[Notes] New page out of range, ignoring");
      return;
    }
    setPage(newPage);
  };

  // Group current page notes by date
  const groupedByDate = pageNotes.reduce((acc, note) => {
    const dateKey = note.date || note.created_at?.slice(0, 10) || "No date";
    if (!acc[dateKey]) acc[dateKey] = [];
    acc[dateKey].push(note);
    return acc;
  }, {});

  const parseDateKey = (value) => {
    if (!value || value === "No date") return null;
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return null;
    return d;
  };

  const sortedDateKeys = Object.keys(groupedByDate).sort((a, b) => {
    const da = parseDateKey(a);
    const db = parseDateKey(b);
    if (!da && !db) return 0;
    if (!da) return 1;
    if (!db) return -1;
    // Newer dates first
    return db.getTime() - da.getTime();
  });

  const formatDate = (value) => {
    if (!value || value === "No date") return "No date";
    try {
      const d = new Date(value);
      if (Number.isNaN(d.getTime())) return value;
      return d.toLocaleDateString(undefined, {
        weekday: "short",
        month: "short",
        day: "numeric",
      });
    } catch (err) {
      console.error("[Notes] Error formatting note date:", err, value);
      return value;
    }
  };

  const getTaskLabel = (taskId) => {
    if (!taskId) return null;
    const t = tasks.find((task) => task.id === taskId);
    if (!t) return `Task #${taskId}`;
    return t.title;
  };

  // --- Selecting a previous note -> load into editor ---

  const handleSelectNote = (note) => {
    console.debug("[Notes] Selecting note for editing:", note.id);
    setEditingNoteId(note.id);
    setForm({
      title: note.title || "",
      content: note.content || "",
      note_type: note.note_type || "general",
      date:
        note.date ||
        note.created_at?.slice(0, 10) ||
        new Date().toISOString().slice(0, 10),
      job: note.job || "",
      task: note.task || "",
    });
    setExistingAttachments(note.attachments || []);
    setFiles([]);
    if (editorRef.current) {
      editorRef.current.innerHTML = note.content || "";
    }
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  return (
    <div className="page">
      <h2 className="page-title">Notes</h2>

      {/* FULL-WIDTH EDITOR */}
      <form
        onSubmit={handleSubmit}
        className="card form-card"
        style={{ marginBottom: 16 }}
      >
        <div className="flex items-center justify-between">
          <h3 className="card-title">
            {editingNoteId ? "Edit note" : "New note"}
          </h3>
          <div className="flex gap-2">
            {editingNoteId && (
              <>
                <button
                  type="button"
                  className="secondary-btn"
                  onClick={resetToNewNote}
                >
                  New note
                </button>
                <button
                  type="button"
                  className="secondary-btn"
                  style={{
                    borderColor: "#fecaca",
                    color: "#b91c1c",
                    background: "#fef2f2",
                  }}
                  onClick={handleDeleteNote}
                >
                  Delete
                </button>
              </>
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

        <div className="grid-2">
          <label className="field-label">
            Type
            <select
              className="field-input"
              name="note_type"
              value={form.note_type}
              onChange={handleChange}
            >
              <option value="daily">Daily</option>
              <option value="general">General</option>
            </select>
          </label>

          <label className="field-label">
            Date
            <input
              type="date"
              className="field-input"
              name="date"
              value={form.date}
              onChange={handleChange}
            />
          </label>
        </div>

        <div className="grid-2">
          <label className="field-label">
            Job / context
            <input
              className="field-input"
              name="job"
              value={form.job}
              onChange={handleChange}
              placeholder="e.g. Marysa, NavonLogic, TANF, Personal"
            />
          </label>

          {/* Attach note to a task */}
          <label className="field-label">
            Attach to task
            <select
              className="field-input"
              name="task"
              value={form.task}
              onChange={handleChange}
            >
              <option value="">No task</option>
              {tasks.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.title}
                </option>
              ))}
            </select>
          </label>
        </div>

        {/* Formatting toolbar */}
        <div
          className="flex items-center gap-2 mt-3"
          style={{
            padding: "6px 10px",
            borderRadius: 12,
            border: "1px solid #e2e8f0",
            background: "#f8fafc",
            flexWrap: "wrap",
          }}
        >
          <span className="text-xs muted" style={{ marginRight: 4 }}>
            Formatting
          </span>

          {/* Basic styles */}
          <div className="flex items-center gap-1">
            <button
              type="button"
              className="secondary-btn"
              style={{ padding: "4px 8px", fontSize: "0.8rem" }}
              onClick={() => execCommand("bold")}
            >
              <strong>B</strong>
            </button>
            <button
              type="button"
              className="secondary-btn"
              style={{
                padding: "4px 8px",
                fontSize: "0.8rem",
                fontStyle: "italic",
              }}
              onClick={() => execCommand("italic")}
            >
              I
            </button>
            <button
              type="button"
              className="secondary-btn"
              style={{
                padding: "4px 8px",
                fontSize: "0.8rem",
                textDecoration: "line-through",
              }}
              onClick={() => execCommand("strikeThrough")}
            >
              S
            </button>
          </div>

          {/* Headings */}
          <div className="flex items-center gap-1">
            <button
              type="button"
              className="secondary-btn"
              style={{ padding: "4px 8px", fontSize: "0.8rem" }}
              onClick={() => execCommand("formatBlock", "H1")}
            >
              H1
            </button>
            <button
              type="button"
              className="secondary-btn"
              style={{ padding: "4px 8px", fontSize: "0.8rem" }}
              onClick={() => execCommand("formatBlock", "H2")}
            >
              H2
            </button>
          </div>

          {/* Lists */}
          <div className="flex items-center gap-1">
            <button
              type="button"
              className="secondary-btn"
              style={{ padding: "4px 8px", fontSize: "0.8rem" }}
              onClick={() => execCommand("insertUnorderedList")}
            >
              • List
            </button>
            <button
              type="button"
              className="secondary-btn"
              style={{ padding: "4px 8px", fontSize: "0.8rem" }}
              onClick={() => execCommand("insertOrderedList")}
            >
              1. List
            </button>
          </div>

          {/* Code tools */}
          <div className="flex items-center gap-1">
            <button
              type="button"
              className="secondary-btn"
              style={{ padding: "4px 8px", fontSize: "0.8rem" }}
              onClick={applyInlineCode}
            >
              &lt;code&gt;
            </button>
            <button
              type="button"
              className="secondary-btn"
              style={{ padding: "4px 8px", fontSize: "0.8rem" }}
              onClick={applyCodeBlock}
            >
              Code block
            </button>
          </div>

          {/* Colors */}
          <div
            className="flex items-center gap-1"
            style={{ marginLeft: "auto" }}
          >
            {[
              "#0f172a", // slate-900
              "#e11d48", // rose-600
              "#16a34a", // green-600
              "#2563eb", // blue-600
              "#f97316", // orange-500
            ].map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => applyColor(c)}
                style={{
                  width: 18,
                  height: 18,
                  borderRadius: 999,
                  border: "1px solid #e2e8f0",
                  backgroundColor: c,
                  cursor: "pointer",
                }}
                title="Apply color"
              />
            ))}
          </div>
        </div>

        {/* WYSIWYG editor (UNCONTROLLED) */}
        <label className="field-label mt-2">
          Content
          <div
            ref={editorRef}
            className="field-input"
            style={{
              minHeight: 180,
              lineHeight: 1.5,
              overflowY: "auto",
            }}
            contentEditable
            onInput={handleContentInput}
          />
        </label>

        <label className="field-label mt-2">
          Attach files
          <input
            type="file"
            multiple
            className="field-input"
            onChange={handleFileChange}
          />
          {!!files.length && (
            <div className="text-xs muted mt-1">
              {files.length} new attachment
              {files.length === 1 ? "" : "s"} ready to upload
            </div>
          )}

          {/* Existing attachments for the note being edited */}
          {!!existingAttachments.length && (
            <div className="text-xs mt-2">
              <div className="font-medium">Existing attachments</div>
              <ul className="list mt-1">
                {existingAttachments.map((att) => (
                  <li key={att.id} className="muted">
                    {att.file}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </label>

        {error && <p className="error-text mt-2">{error}</p>}

        <button
          className="primary-btn mt-3"
          type="submit"
          disabled={isSaving}
        >
          {isSaving
            ? editingNoteId
              ? "Updating…"
              : "Saving…"
            : editingNoteId
            ? "Update note"
            : "Save note"}
        </button>
      </form>

      {/* NOTES LIST (CLICK TO LOAD INTO EDITOR) */}
      <div className="card">
        <div className="flex items-center justify-between">
          <h3 className="card-title">Your notes</h3>
          <div className="calendar-view-toggle">
            <button
              type="button"
              className={
                "toggle-btn" + (jobFilter === "all" ? " toggle-btn-active" : "")
              }
              onClick={() => setJobFilter("all")}
            >
              All
            </button>
            {allJobs.map((job) => (
              <button
                key={job}
                type="button"
                className={
                  "toggle-btn" +
                  (jobFilter === job ? " toggle-btn-active" : "")
                }
                onClick={() => setJobFilter(job)}
              >
                {job}
              </button>
            ))}
          </div>
        </div>

        {/* Search + type filter */}
        <div
          className="flex items-center gap-2 mt-2"
          style={{ flexWrap: "wrap" }}
        >
          <input
            type="text"
            className="field-input"
            style={{
              maxWidth: "260px",
              padding: "6px 10px",
              fontSize: "0.85rem",
            }}
            placeholder="Search notes…"
            value={searchQuery}
            onChange={(e) => {
              console.debug(
                "[Notes] Updating searchQuery:",
                e.target.value
              );
              setSearchQuery(e.target.value);
            }}
          />
          <div className="flex items-center gap-1">
            <span className="text-xs muted">Type</span>
            <select
              className="field-input"
              style={{
                maxWidth: "140px",
                padding: "4px 8px",
                fontSize: "0.8rem",
              }}
              value={typeFilter}
              onChange={(e) => {
                console.debug(
                  "[Notes] Updating typeFilter:",
                  e.target.value
                );
                setTypeFilter(e.target.value);
              }}
            >
              <option value="all">All</option>
              <option value="daily">Daily</option>
              <option value="general">General</option>
            </select>
          </div>
        </div>

        <ul className="list mt-2">
          {sortedDateKeys.map((dateKey) => (
            <li key={dateKey} style={{ marginBottom: 8 }}>
              <div
                className="muted text-xs"
                style={{
                  textTransform: "uppercase",
                  letterSpacing: "0.04em",
                  marginBottom: 4,
                }}
              >
                {formatDate(dateKey)}
              </div>
              <ul className="list">
                {groupedByDate[dateKey].map((n) => {
                  const isEditing = editingNoteId === n.id;
                  return (
                    <li
                      key={n.id}
                      className="card"
                      style={{
                        marginBottom: 6,
                        cursor: "pointer",
                        borderColor: isEditing ? "#f97316" : "#e2e8f0",
                        boxShadow: isEditing
                          ? "0 0 0 1px #f97316"
                          : "0 12px 30px rgba(15,23,42,0.04)",
                      }}
                      onClick={() => handleSelectNote(n)}
                    >
                      <div className="flex justify-between items-center">
                        <div>
                          <div className="font-medium">{n.title}</div>
                          <div className="muted text-xs">
                            {n.job && <span>{n.job} · </span>}
                            {n.note_type === "daily" ? "Daily note" : "General"}
                          </div>
                          {n.task && (
                            <div className="muted text-xs mt-1">
                              Attached to task:{" "}
                              <strong>{getTaskLabel(n.task)}</strong>
                            </div>
                          )}
                        </div>
                        {n.attachments && n.attachments.length > 0 && (
                          <div className="text-xs muted">
                            {n.attachments.length} attachment
                            {n.attachments.length === 1 ? "" : "s"}
                          </div>
                        )}
                      </div>
                      <div
                        className="mt-1 text-sm line-clamp-2"
                        dangerouslySetInnerHTML={{ __html: n.content || "" }}
                      />
                    </li>
                  );
                })}
              </ul>
            </li>
          ))}
          {!sortedDateKeys.length && (
            <li className="muted">No notes yet.</li>
          )}
        </ul>

        {/* Pagination footer */}
        {totalNotesCount > 0 && (
          <div className="flex items-center justify-between mt-3 text-xs muted">
            <div>
              Showing {startIndex + 1}–{endIndex} of {totalNotesCount} notes
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                className="secondary-btn"
                style={{ padding: "4px 10px", fontSize: "0.75rem" }}
                disabled={safePage <= 1}
                onClick={() => handlePageChange(safePage - 1, totalPages)}
              >
                Previous
              </button>
              <span>
                Page {safePage} of {totalPages}
              </span>
              <button
                type="button"
                className="secondary-btn"
                style={{ padding: "4px 10px", fontSize: "0.75rem" }}
                disabled={safePage >= totalPages}
                onClick={() => handlePageChange(safePage + 1, totalPages)}
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default Notes;