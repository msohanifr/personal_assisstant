import React, { useEffect, useState } from "react";
import client from "../api/client";

const emptyTask = { title: "", description: "", status: "todo", due_date: "" };

const Tasks = () => {
  const [tasks, setTasks] = useState([]);
  const [form, setForm] = useState(emptyTask);

  const load = async () => {
    const res = await client.get("/tasks/");
    setTasks(res.data);
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
    await client.post("/tasks/", form);
    setForm(emptyTask);
    load();
  };

  return (
    <div className="page">
      <h2 className="page-title">Tasks</h2>
      <div className="grid-2">
        <form onSubmit={handleSubmit} className="card form-card">
          <h3 className="card-title">Add task</h3>
          <label className="field-label">
            Title
            <input className="field-input" name="title" value={form.title} onChange={handleChange} required />
          </label>
          <label className="field-label">
            Description
            <textarea className="field-input" name="description" value={form.description} onChange={handleChange} rows={3} />
          </label>
          <label className="field-label">
            Status
            <select className="field-input" name="status" value={form.status} onChange={handleChange}>
              <option value="todo">To Do</option>
              <option value="in_progress">In Progress</option>
              <option value="done">Done</option>
            </select>
          </label>
          <label className="field-label">
            Due date
            <input className="field-input" type="datetime-local" name="due_date" value={form.due_date} onChange={handleChange} />
          </label>
          <button className="primary-btn" type="submit">Save</button>
        </form>
        <div className="card">
          <h3 className="card-title">Your tasks</h3>
          <ul className="list">
            {tasks.map((t) => (
              <li key={t.id} className="flex justify-between gap-4">
                <div>
                  <div className="font-medium">{t.title}</div>
                  <div className="muted text-xs">{t.description}</div>
                </div>
                <span className={`badge badge-${t.status}`}>{t.status.replace("_", " ")}</span>
              </li>
            ))}
            {!tasks.length && <li className="muted">No tasks yet.</li>}
          </ul>
        </div>
      </div>
    </div>
  );
};
export default Tasks;
