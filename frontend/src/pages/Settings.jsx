// frontend/src/pages/Settings.jsx
import React, { useEffect, useState } from "react";
import client from "../api/client";

/**
 * Settings page:
 *  - Placeholder for profile / general settings
 *  - Email Accounts manager (create / edit / delete EmailAccount)
 */

const emptyAccount = {
  label: "",
  provider: "gmail",
  email_address: "",
  username: "",
  password: "",
  imap_server: "",
  imap_port: 993,
  imap_use_ssl: true,
  smtp_server: "",
  smtp_port: 587,
  smtp_use_tls: true,
  is_active: true,
};

const Settings = () => {
  const [accounts, setAccounts] = useState([]);
  const [form, setForm] = useState(emptyAccount);
  const [editingId, setEditingId] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const loadAccounts = async () => {
    setLoading(true);
    setError("");
    try {
      console.debug("[Settings] Loading email accounts from /email-accounts/");
      const res = await client.get("/email-accounts/");
      console.debug("[Settings] Loaded accounts:", res.data);
      setAccounts(res.data || []);
    } catch (err) {
      console.error("[Settings] Error loading accounts:", err);
      setError("Could not load email accounts. Check console for details.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAccounts();
  }, []);

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    console.debug("[Settings] Form change:", name, "->", value);
    setForm((prev) => ({
      ...prev,
      [name]:
        type === "checkbox"
          ? checked
          : name === "imap_port" || name === "smtp_port"
          ? Number(value || 0)
          : value,
    }));
  };

  const handleEdit = (acc) => {
    console.debug("[Settings] Editing account id:", acc.id);
    setEditingId(acc.id);
    setForm({
      label: acc.label || "",
      provider: acc.provider || "imap",
      email_address: acc.email_address || "",
      username: acc.username || "",
      password: "", // blank means "do not change"
      imap_server: acc.imap_server || "",
      imap_port: acc.imap_port || 993,
      imap_use_ssl: acc.imap_use_ssl,
      smtp_server: acc.smtp_server || "",
      smtp_port: acc.smtp_port || 587,
      smtp_use_tls: acc.smtp_use_tls,
      is_active: acc.is_active,
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleDelete = async (acc) => {
    if (!window.confirm(`Delete account "${acc.label || acc.email_address}"?`)) {
      return;
    }
    try {
      console.debug("[Settings] Deleting account id:", acc.id);
      await client.delete(`/email-accounts/${acc.id}/`);
      await loadAccounts();
      if (editingId === acc.id) {
        handleReset();
      }
    } catch (err) {
      console.error("[Settings] Error deleting account:", err);
      setError("Could not delete account. Check console for details.");
    }
  };

  const handleReset = () => {
    console.debug("[Settings] Resetting email account form");
    setEditingId(null);
    setForm(emptyAccount);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError("");

    try {
      if (!form.email_address.trim()) {
        setError("Email address is required.");
        setSaving(false);
        return;
      }
      const payload = { ...form };
      console.debug(
        "[Settings] Submitting account:",
        editingId ? "update" : "create",
        payload
      );

      if (editingId) {
        const res = await client.patch(
          `/email-accounts/${editingId}/`,
          payload
        );
        console.debug("[Settings] Account updated:", res.data);
      } else {
        const res = await client.post("/email-accounts/", payload);
        console.debug("[Settings] Account created:", res.data);
      }

      await loadAccounts();
      handleReset();
    } catch (err) {
      console.error("[Settings] Error saving account:", err);
      if (err.response) {
        const { status, data } = err.response;
        setError(
          `Error ${status} while saving account: ${
            typeof data === "string" ? data : JSON.stringify(data)
          }`
        );
      } else {
        setError("Network error while saving account. Check console.");
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="page">
      <h2 className="page-title">Settings</h2>

      {/* Account form */}
      <form
        onSubmit={handleSubmit}
        className="card form-card"
        style={{ marginBottom: 16, maxWidth: 780 }}
      >
        <div className="flex items-center justify-between">
          <h3 className="card-title">
            {editingId ? "Edit email account" : "Add email account"}
          </h3>
          {editingId && (
            <button
              type="button"
              className="secondary-btn"
              onClick={handleReset}
            >
              New account
            </button>
          )}
        </div>

        <div className="grid-2">
          <label className="field-label">
            Label
            <input
              className="field-input"
              name="label"
              value={form.label}
              onChange={handleChange}
              placeholder="e.g. Personal Gmail, NavonLogic, Marysa"
            />
          </label>

          <label className="field-label">
            Provider
            <select
              className="field-input"
              name="provider"
              value={form.provider}
              onChange={handleChange}
            >
              <option value="gmail">Gmail</option>
              <option value="outlook">Outlook / Microsoft 365</option>
              <option value="yahoo">Yahoo</option>
              <option value="imap">Generic IMAP</option>
            </select>
          </label>
        </div>

        <div className="grid-2">
          <label className="field-label">
            Email address
            <input
              className="field-input"
              name="email_address"
              value={form.email_address}
              onChange={handleChange}
              required
            />
          </label>

          <label className="field-label">
            Username
            <input
              className="field-input"
              name="username"
              value={form.username}
              onChange={handleChange}
              placeholder="Usually same as email, can leave blank"
            />
          </label>
        </div>

        <label className="field-label">
          Password / App password
          <input
            className="field-input"
            type="password"
            name="password"
            value={form.password}
            onChange={handleChange}
            placeholder={
              editingId
                ? "Leave blank to keep existing password"
                : "Use Gmail/Yahoo app password or IMAP password"
            }
          />
        </label>

        <div className="grid-2">
          <label className="field-label">
            IMAP server
            <input
              className="field-input"
              name="imap_server"
              value={form.imap_server}
              onChange={handleChange}
              placeholder="Leave blank to auto-detect for Gmail/Yahoo/Outlook"
            />
          </label>

          <label className="field-label">
            IMAP port
            <input
              className="field-input"
              type="number"
              name="imap_port"
              value={form.imap_port}
              onChange={handleChange}
            />
          </label>
        </div>

        <div className="grid-2">
          <label className="field-label">
            SMTP server
            <input
              className="field-input"
              name="smtp_server"
              value={form.smtp_server}
              onChange={handleChange}
              placeholder="Optional for now"
            />
          </label>

          <label className="field-label">
            SMTP port
            <input
              className="field-input"
              type="number"
              name="smtp_port"
              value={form.smtp_port}
              onChange={handleChange}
            />
          </label>
        </div>

        <div className="flex items-center gap-4 mt-2">
          <label className="text-sm flex items-center gap-2">
            <input
              type="checkbox"
              name="imap_use_ssl"
              checked={form.imap_use_ssl}
              onChange={handleChange}
            />
            Use SSL for IMAP
          </label>
          <label className="text-sm flex items-center gap-2">
            <input
              type="checkbox"
              name="smtp_use_tls"
              checked={form.smtp_use_tls}
              onChange={handleChange}
            />
            Use TLS for SMTP
          </label>
          <label className="text-sm flex items-center gap-2">
            <input
              type="checkbox"
              name="is_active"
              checked={form.is_active}
              onChange={handleChange}
            />
            Active
          </label>
        </div>

        {error && <p className="error-text mt-2">{error}</p>}

        <button className="primary-btn mt-3" type="submit" disabled={saving}>
          {saving
            ? editingId
              ? "Saving changes…"
              : "Creating account…"
            : editingId
            ? "Save changes"
            : "Add account"}
        </button>

        <p className="text-xs muted mt-2">
          For Gmail / Yahoo with 2-step verification, use an{" "}
          <strong>App Password</strong> here, not your normal login password.
        </p>
      </form>

      {/* Accounts list */}
      <div className="card" style={{ maxWidth: 780 }}>
        <div className="flex items-center justify-between">
          <h3 className="card-title">Connected email accounts</h3>
        </div>

        {loading && <p className="muted text-xs mt-2">Loading accounts…</p>}

        <ul className="list mt-2">
          {accounts.map((acc) => (
            <li
              key={acc.id}
              className="flex items-center justify-between gap-4"
              style={{
                padding: "8px 0",
                borderBottom: "1px solid #e2e8f0",
              }}
            >
              <div>
                <div className="font-medium">
                  {acc.label || acc.email_address}
                </div>
                <div className="muted text-xs">
                  {acc.email_address} · {acc.provider.toUpperCase()} ·{" "}
                  {acc.is_active ? "Active" : "Inactive"}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  className="secondary-btn text-xs"
                  onClick={() => handleEdit(acc)}
                >
                  Edit
                </button>
                <button
                  type="button"
                  className="secondary-btn text-xs"
                  onClick={() => handleDelete(acc)}
                >
                  Delete
                </button>
              </div>
            </li>
          ))}
          {!loading && !accounts.length && (
            <li className="muted text-xs">No accounts yet.</li>
          )}
        </ul>
      </div>
    </div>
  );
};

export default Settings;