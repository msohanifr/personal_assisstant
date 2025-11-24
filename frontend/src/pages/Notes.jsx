import React, { useEffect, useState } from "react";
import client from "../api/client";

const emptyNote = {
  title: "",
  content: "",
  note_type: "daily",
  date: new Date().toISOString().slice(0, 10),
};

const Notes = () => {
  const [notes, setNotes] = useState([]);
  const [form, setForm] = useState(emptyNote);

  const load = async () => {
    const res = await client.get("/notes/");
    setNotes(res.data);
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
    await client.post("/notes/", form);
    setForm(emptyNote);
    load();
  };

  return (
    <div className="page">
      <h2 className="page-title">Notes</h2>
      <div className="grid-2">
        <form onSubmit={handleSubmit} className="card form-card">
          <h3 className="card-title">New note</h3>
          <label className="field-label">
            Type
            <select className="field-input" name="note_type" value={form.note_type} onChange={handleChange}>
              <option value="daily">Daily</option>
              <option value="general">General</option>
            </select>
          </label>
          <label className="field-label">
            Date (for daily notes)
            <input type="date" className="field-input" name="date" value={form.date} onChange={handleChange} />
          </label>
          <label className="field-label">
            Title
            <input className="field-input" name="title" value={form.title} onChange={handleChange} required />
          </label>
          <label className="field-label">
            Content
            <textarea className="field-input" name="content" value={form.content} onChange={handleChange} rows={4} />
          </label>
          <button className="primary-btn" type="submit">Save note</button>
        </form>
        <div className="card">
          <h3 className="card-title">All notes</h3>
          <ul className="list">
            {notes.map((n) => (
              <li key={n.id}>
                <div className="flex justify-between items-center gap-4">
                  <div>
                    <div className="font-medium">{n.title}</div>
                    <div className="muted text-xs">
                      {n.note_type === "daily" && n.date ? `Daily • ${n.date}` : "General"}
                    </div>
                  </div>
                </div>
                <p className="mt-1 text-sm">{n.content}</p>
              </li>
            ))}
            {!notes.length && <li className="muted">No notes yet.</li>}
          </ul>
        </div>
      </div>
    </div>
  );
};
export default Notes;
