// frontend/src/pages/Emails.jsx
import React, { useEffect, useState, useMemo } from "react";
import client from "../api/client";

/**
 * Unified email client page.
 *
 * - Lists configured email accounts (EmailAccount model)
 * - Filters messages by account
 * - Search over subject, from, to, body
 * - Master/detail layout
 *
 * Actual sync from Gmail/IMAP is not implemented yet – but the API has a
 * /email-accounts/{id}/sync/ POST hook that you can wire up later.
 */

const Emails = () => {
  const [accounts, setAccounts] = useState([]);
  const [selectedAccountId, setSelectedAccountId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [selectedMessage, setSelectedMessage] = useState(null);
  const [search, setSearch] = useState("");
  const [loadingAccounts, setLoadingAccounts] = useState(false);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [error, setError] = useState("");

  // --- Load accounts ---

  const loadAccounts = async () => {
    setLoadingAccounts(true);
    setError("");
    try {
      console.debug("[Emails] Loading email accounts from /email-accounts/");
      const res = await client.get("/email-accounts/");
      const data = res.data || [];
      console.debug("[Emails] Loaded accounts:", data);
      setAccounts(data);

      if (!selectedAccountId && data.length) {
        setSelectedAccountId(data[0].id);
      }
    } catch (err) {
      console.error("[Emails] Error loading accounts:", err);
      setError("Could not load email accounts. Check console for details.");
    } finally {
      setLoadingAccounts(false);
    }
  };

  useEffect(() => {
    loadAccounts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // --- Load messages when account or search changes ---

  useEffect(() => {
    const fetchMessages = async () => {
      if (!selectedAccountId) {
        setMessages([]);
        setSelectedMessage(null);
        return;
      }

      setLoadingMessages(true);
      setError("");
      try {
        const params = { account: selectedAccountId };
        if (search.trim()) {
          params.q = search.trim();
        }
        console.debug(
          "[Emails] Loading messages from /email-messages/ with params:",
          params
        );
        const res = await client.get("/email-messages/", { params });
        const data = res.data || [];
        console.debug(
          "[Emails] Loaded",
          data.length,
          "messages for account",
          selectedAccountId
        );
        setMessages(data);
        if (data.length && !selectedMessage) {
          setSelectedMessage(data[0]);
        }
      } catch (err) {
        console.error("[Emails] Error loading messages:", err);
        setError("Could not load emails. Check console for details.");
      } finally {
        setLoadingMessages(false);
      }
    };

    fetchMessages();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedAccountId, search]);

  const currentAccount = useMemo(
    () => accounts.find((a) => a.id === selectedAccountId) || null,
    [accounts, selectedAccountId]
  );

  const handleAccountClick = (accountId) => {
    console.debug("[Emails] Selecting account:", accountId);
    setSelectedAccountId(accountId);
    setSelectedMessage(null);
  };

  const handleSearchChange = (e) => {
    setSearch(e.target.value);
  };

  const handleSelectMessage = (msg) => {
    console.debug("[Emails] Selecting message id:", msg.id);
    setSelectedMessage(msg);
  };

  const handleSync = async () => {
    if (!currentAccount) return;
    try {
      console.debug(
        "[Emails] Triggering sync for account id:",
        currentAccount.id
      );
      await client.post(`/email-accounts/${currentAccount.id}/sync/`);
      // After sync, you would typically reload messages
      // For now server just logs the call.
    } catch (err) {
      console.error("[Emails] Error calling sync:", err);
      setError("Sync call failed (see console). IMAP integration not yet wired.");
    }
  };

  return (
    <div className="page">
      <h2 className="page-title">Emails</h2>
      <div className="grid-2">
        {/* LEFT: accounts + message list */}
        <div className="card">
          <div className="flex items-center justify-between">
            <h3 className="card-title">Inbox</h3>
            {currentAccount && (
              <button
                type="button"
                className="secondary-btn text-xs"
                onClick={handleSync}
              >
                Sync account
              </button>
            )}
          </div>

          {/* Account filter bar */}
          <div className="flex items-center gap-2 mt-2">
            <span className="text-xs muted">Accounts</span>
            <div className="calendar-view-toggle">
              {accounts.map((acc) => (
                <button
                  key={acc.id}
                  type="button"
                  className={
                    "toggle-btn" +
                    (selectedAccountId === acc.id ? " toggle-btn-active" : "")
                  }
                  onClick={() => handleAccountClick(acc.id)}
                >
                  {acc.label || acc.email_address}
                </button>
              ))}
              {!accounts.length && (
                <span className="text-xs muted" style={{ padding: "0 8px" }}>
                  No accounts configured yet
                </span>
              )}
            </div>
          </div>

          {/* Search */}
          <div className="mt-2">
            <label className="field-label">
              Search
              <input
                className="field-input"
                placeholder="Search subject, sender, recipient, or body..."
                value={search}
                onChange={handleSearchChange}
              />
            </label>
          </div>

          {loadingAccounts || loadingMessages ? (
            <p className="muted text-xs mt-2">Loading…</p>
          ) : null}
          {error && <p className="error-text mt-2">{error}</p>}

          {/* Messages list */}
          <ul className="list mt-2" style={{ maxHeight: 480, overflowY: "auto" }}>
            {messages.map((m) => {
              const isActive = selectedMessage && selectedMessage.id === m.id;
              return (
                <li
                  key={m.id}
                  className="card"
                  style={{
                    marginBottom: 6,
                    cursor: "pointer",
                    borderColor: isActive ? "#f97316" : "#e2e8f0",
                    boxShadow: isActive
                      ? "0 0 0 1px #f97316"
                      : "0 12px 30px rgba(15,23,42,0.04)",
                  }}
                  onClick={() => handleSelectMessage(m)}
                >
                  <div className="flex justify-between items-center">
                    <div>
                      <div className="font-medium">
                        {m.subject || "(no subject)"}
                      </div>
                      <div className="muted text-xs">
                        {m.from_email || "(unknown sender)"}
                      </div>
                    </div>
                    <div className="text-xs muted">
                      {new Date(m.sent_at).toLocaleString(undefined, {
                        month: "short",
                        day: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </div>
                  </div>
                  <p className="mt-1 text-sm line-clamp-2">
                    {m.body_text || ""}
                  </p>
                </li>
              );
            })}
            {!loadingMessages && !messages.length && (
              <li className="muted text-xs mt-2">
                {currentAccount
                  ? "No emails found for this account (yet)."
                  : "Select or add an account to see emails."}
              </li>
            )}
          </ul>
        </div>

        {/* RIGHT: message content */}
        <div className="card">
          <h3 className="card-title">Details</h3>
          {!selectedMessage ? (
            <p className="muted text-sm mt-2">
              Select an email on the left to read it here.
            </p>
          ) : (
            <div className="mt-2">
              <div className="text-sm muted">
                <div>
                  <strong>From:</strong> {selectedMessage.from_email}
                </div>
                <div>
                  <strong>To:</strong> {selectedMessage.to_emails}
                </div>
                {selectedMessage.cc_emails && (
                  <div>
                    <strong>CC:</strong> {selectedMessage.cc_emails}
                  </div>
                )}
                <div>
                  <strong>Date:</strong>{" "}
                  {new Date(selectedMessage.sent_at).toLocaleString()}
                </div>
                {currentAccount && (
                  <div>
                    <strong>Account:</strong> {currentAccount.label} (
                    {currentAccount.email_address})
                  </div>
                )}
              </div>
              <h4
                style={{
                  fontSize: "1.05rem",
                  fontWeight: 600,
                  marginTop: 10,
                  marginBottom: 8,
                }}
              >
                {selectedMessage.subject || "(no subject)"}
              </h4>
              <div
                className="text-sm"
                style={{
                  whiteSpace: "pre-wrap",
                  lineHeight: 1.5,
                  maxHeight: 420,
                  overflowY: "auto",
                }}
              >
                {selectedMessage.body_text || "(no body)"}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Placeholder hint for future AI / sync */}
      <p className="muted text-xs mt-4">
        Later, you can hook this inbox to Gmail / Outlook / IMAP and add an AI
        agent that reads these messages to create tasks, notes, or calendar
        events automatically.
      </p>
    </div>
  );
};

export default Emails;