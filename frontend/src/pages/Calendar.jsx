import React, { useEffect, useState } from "react";
import client from "../api/client";

const emptyEvent = { title: "", description: "", start: "", end: "", location: "" };

const Calendar = () => {
  const [events, setEvents] = useState([]);
  const [form, setForm] = useState(emptyEvent);

  const load = async () => {
    const res = await client.get("/events/");
    setEvents(res.data);
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

  return (
    <div className="page">
      <h2 className="page-title">Calendar</h2>
      <div className="grid-2">
        <form onSubmit={handleSubmit} className="card form-card">
          <h3 className="card-title">Add event</h3>
          <label className="field-label">
            Title
            <input className="field-input" name="title" value={form.title} onChange={handleChange} required />
          </label>
          <label className="field-label">
            Start
            <input type="datetime-local" className="field-input" name="start" value={form.start} onChange={handleChange} required />
          </label>
          <label className="field-label">
            End
            <input type="datetime-local" className="field-input" name="end" value={form.end} onChange={handleChange} required />
          </label>
          <label className="field-label">
            Location
            <input className="field-input" name="location" value={form.location} onChange={handleChange} />
          </label>
          <label className="field-label">
            Description
            <textarea className="field-input" name="description" value={form.description} onChange={handleChange} rows={3} />
          </label>
          <button className="primary-btn" type="submit">Save event</button>
        </form>
        <div className="card">
          <h3 className="card-title">Upcoming events</h3>
          <ul className="list">
            {events.map((e) => (
              <li key={e.id}>
                <div className="font-medium">{e.title}</div>
                <div className="muted text-xs">
                  {new Date(e.start).toLocaleString()} → {new Date(e.end).toLocaleString()}
                </div>
                {e.location && <div className="muted text-xs mt-1">{e.location}</div>}
              </li>
            ))}
            {!events.length && <li className="muted">No events yet.</li>}
          </ul>
        </div>
      </div>
    </div>
  );
};
export default Calendar;
