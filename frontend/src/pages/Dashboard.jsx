import React, { useEffect, useState } from "react";
import client from "../api/client";

const Dashboard = () => {
  const [summary, setSummary] = useState({ tasks: [], events: [], notes: [] });

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [tasksRes, eventsRes, notesRes] = await Promise.all([
          client.get("/tasks/"),
          client.get("/events/"),
          client.get("/notes/"),
        ]);
        setSummary({
          tasks: tasksRes.data.slice(0, 5),
          events: eventsRes.data.slice(0, 5),
          notes: notesRes.data.slice(0, 3),
        });
      } catch (err) {
        console.error("Failed to load dashboard data", err);
      }
    };
    fetchData();
  }, []);

  return (
    <div className="page">
      <h2 className="page-title">Today at a glance</h2>
      <div className="grid-3">
        <section className="card">
          <h3 className="card-title">Top tasks</h3>
          <ul className="list">
            {summary.tasks.map((t) => <li key={t.id}>{t.title}</li>)}
            {!summary.tasks.length && <li className="muted">No tasks yet.</li>}
          </ul>
        </section>
        <section className="card">
          <h3 className="card-title">Upcoming events</h3>
          <ul className="list">
            {summary.events.map((e) => (
              <li key={e.id}>
                <div>{e.title}</div>
                <div className="muted text-xs">{new Date(e.start).toLocaleString()}</div>
              </li>
            ))}
            {!summary.events.length && <li className="muted">Nothing scheduled.</li>}
          </ul>
        </section>
        <section className="card">
          <h3 className="card-title">Recent notes</h3>
          <ul className="list">
            {summary.notes.map((n) => (
              <li key={n.id}>
                <div className="font-medium">{n.title}</div>
                <div className="muted text-xs line-clamp-2">{n.content}</div>
              </li>
            ))}
            {!summary.notes.length && <li className="muted">Start a note to plan your day.</li>}
          </ul>
        </section>
      </div>
    </div>
  );
};
export default Dashboard;
