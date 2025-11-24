import React, { useEffect, useState } from "react";
import client from "../api/client";

const emptyContact = { name: "", email: "", phone: "", organization: "", notes: "" };

const Contacts = () => {
  const [contacts, setContacts] = useState([]);
  const [form, setForm] = useState(emptyContact);

  const load = async () => {
    const res = await client.get("/contacts/");
    setContacts(res.data);
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
    await client.post("/contacts/", form);
    setForm(emptyContact);
    load();
  };

  return (
    <div className="page">
      <h2 className="page-title">Contacts</h2>
      <div className="grid-2">
        <form onSubmit={handleSubmit} className="card form-card">
          <h3 className="card-title">Add contact</h3>
          <label className="field-label">
            Name
            <input className="field-input" name="name" value={form.name} onChange={handleChange} required />
          </label>
          <label className="field-label">
            Email
            <input className="field-input" name="email" type="email" value={form.email} onChange={handleChange} />
          </label>
          <label className="field-label">
            Phone
            <input className="field-input" name="phone" value={form.phone} onChange={handleChange} />
          </label>
          <label className="field-label">
            Organization
            <input className="field-input" name="organization" value={form.organization} onChange={handleChange} />
          </label>
          <label className="field-label">
            Notes
            <textarea className="field-input" name="notes" value={form.notes} onChange={handleChange} rows={3} />
          </label>
          <button className="primary-btn" type="submit">Save contact</button>
        </form>
        <div className="card">
          <h3 className="card-title">Your contacts</h3>
          <ul className="list">
            {contacts.map((c) => (
              <li key={c.id}>
                <div className="font-medium">{c.name}</div>
                <div className="muted text-xs">
                  {c.email || "No email"} • {c.phone || "No phone"}
                </div>
                {c.organization && <div className="muted text-xs mt-1">{c.organization}</div>}
                {c.notes && <p className="mt-1 text-sm">{c.notes}</p>}
              </li>
            ))}
            {!contacts.length && <li className="muted">No contacts yet.</li>}
          </ul>
        </div>
      </div>
    </div>
  );
};
export default Contacts;
