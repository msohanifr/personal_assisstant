// frontend/src/pages/Emails.jsx
import React, { useEffect, useState, useMemo } from "react";
import client from "../api/client";

/**
 * Unified email client page.
 *
 * - Lists configured email accounts (EmailAccount model)
 * - Filters messages by account
 * - Search over subject, from, to, body
 * - Filter by date: all / day / month / year
 * - Master/detail layout
 * - Auto-sync current account every minute
 * - AI button to create tasks & notes from an email
 */

const Emails = () => {
  const [accounts, setAccounts] = useState([]);
  const [selectedAccountId, setSelectedAccountId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [selectedMessage, setSelectedMessage] = useState(null);
  const [search, setSearch] = useState("");
  const [dateMode, setDateMode] = useState("all"); // "all" | "day" | "month" | "year"
  const [loadingAccounts, setLoadingAccounts] = useState(false);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [error, setError] = useState("");

  // AI agent UI state
  const [aiLoading, setAiLoading] = useState(false);
  const [aiResult, setAiResult] = useState(null);
  const [aiError, setAiError] = useState("");

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

  const currentAccount = useMemo(
    () => accounts.find((a) => a.id === selectedAccountId) || null,
    [accounts, selectedAccountId]
  );

  const handleAccountClick = (accountId) => {
    console.debug("[Emails] Selecting account:", accountId);
    setSelectedAccountId(accountId);
    setSelectedMessage(null);
    setAiResult(null);
    setAiError("");
  };

  const handleSearchChange = (e) => {
    setSearch(e.target.value);
  };

  // --- Load messages when account or search changes ---

  const fetchMessages = async (accountId, currentSearch) => {
    if (!accountId) {
      setMessages([]);
      setSelectedMessage(null);
      return;
    }

    setLoadingMessages(true);
    setError("");
    try {
      const params = { account: accountId };
      if (currentSearch.trim()) {
        params.q = currentSearch.trim();
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
        accountId
      );
      setMessages(data);
    } catch (err) {
      console.error("[Emails] Error loading messages:", err);
      setError("Could not load emails. Check console for details.");
    } finally {
      setLoadingMessages(false);
    }
  };

  useEffect(() => {
    fetchMessages(selectedAccountId, search);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedAccountId, search]);

  // --- Sync handler (manual + auto) ---

  const handleSync = async (silent = false) => {
    if (!currentAccount) return;
    if (!silent) {
      console.debug(
        "[Emails] Manual sync triggered for account id:",
        currentAccount.id
      );
    } else {
      console.debug(
        "[Emails] Auto-sync triggered for account id:",
        currentAccount.id
      );
    }

    try {
      await client.post(`/email-accounts/${currentAccount.id}/sync/`);
      // After sync, reload messages for this account with current search
      await fetchMessages(currentAccount.id, search);
    } catch (err) {
      console.error("[Emails] Error calling sync:", err);
      if (!silent) {
        setError("Sync call failed (see console for details).");
      }
    }
  };

  // --- Auto-sync every minute for the current account ---

  useEffect(() => {
    if (!currentAccount) return;

    console.debug(
      "[Emails] Setting up auto-sync interval for account id:",
      currentAccount.id
    );
    const intervalId = setInterval(() => {
      handleSync(true);
    }, 60_000); // 60 seconds

    return () => {
      console.debug(
        "[Emails] Clearing auto-sync interval for account id:",
        currentAccount.id
      );
      clearInterval(intervalId);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentAccount?.id, search]);

  const handleDateModeChange = (mode) => {
    console.debug("[Emails] Changing date filter to:", mode);
    setDateMode(mode);
  };

  const handleSelectMessage = (msg) => {
    console.debug("[Emails] Selecting message id:", msg.id);
    setSelectedMessage(msg);
    setAiResult(null);
    setAiError("");
  };

  // --- Date filtering helpers ---

  const filteredMessages = useMemo(() => {
    if (!messages.length) return [];

    const now = new Date();
    const nowYear = now.getFullYear();
    const nowMonth = now.getMonth();
    const nowDate = now.getDate();

    const isSameDay = (d) =>
      d.getFullYear() === nowYear &&
      d.getMonth() === nowMonth &&
      d.getDate() === nowDate;

    const isSameMonth = (d) =>
      d.getFullYear() === nowYear && d.getMonth() === nowMonth;

    const isSameYear = (d) => d.getFullYear() === nowYear;

    const result = messages.filter((m) => {
      if (dateMode === "all") return true;

      if (!m.sent_at) return false;
      const d = new Date(m.sent_at);
      if (Number.isNaN(d.getTime())) return false;

      if (dateMode === "day") {
        return isSameDay(d);
      }
      if (dateMode === "month") {
        return isSameMonth(d);
      }
      if (dateMode === "year") {
        return isSameYear(d);
      }
      return true;
    });

    console.debug(
      "[Emails] Date filter mode=%s -> %s of %s messages",
      dateMode,
      result.length,
      messages.length
    );
    return result;
  }, [messages, dateMode]);

  const totalCount = messages.length;
  const filteredCount = filteredMessages.length;

  // Keep selectedMessage in sync with filteredMessages
  useEffect(() => {
    if (!filteredMessages.length) {
      setSelectedMessage(null);
      return;
    }
    if (!selectedMessage) {
      setSelectedMessage(filteredMessages[0]);
      return;
    }
    const stillExists = filteredMessages.some(
      (m) => m.id === selectedMessage.id
    );
    if (!stillExists) {
      setSelectedMessage(filteredMessages[0]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filteredMessages]);

  const dateModeLabel = (() => {
    if (dateMode === "all") return "All time";
    if (dateMode === "day") return "Today";
    if (dateMode === "month") return "This month";
    if (dateMode === "year") return "This year";
    return "";
  })();

  // --- AI: analyze email -> create tasks & notes ---

  const handleAnalyze = async () => {
    if (!selectedMessage) return;
    setAiLoading(true);
    setAiError("");
    setAiResult(null);

    try {
      console.debug(
        "[Emails] Calling AI analyze for email id:",
        selectedMessage.id
      );
      const res = await client.post(
        `/email-messages/${selectedMessage.id}/analyze/`
      );
      console.debug("[Emails] AI analyze result:", res.data);
      setAiResult(res.data || null);
    } catch (err) {
      console.error("[Emails] AI analyze error:", err);
      setAiError(
        "AI analysis failed. Make sure the backend has OpenAI configured (see logs)."
      );
    } finally {
      setAiLoading(false);
    }
  };

  return (
    <div className="page">
      <h2 className="page-title">Emails</h2>
      <div className="grid-2">
        {/* LEFT: accounts + message list */}
        <div className="card">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="card-title">
                Inbox
                {currentAccount && (
                  <span className="text-xs muted" style={{ marginLeft: 8 }}>
                    {filteredCount} of {totalCount} emails · {dateModeLabel}
                  </span>
                )}
              </h3>
            </div>
            {currentAccount && (
              <button
                type="button"
                className="secondary-btn text-xs"
                onClick={() => handleSync(false)}
              >
                Sync now
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

          {/* Date filter bar */}
          <div className="flex items-center gap-2 mt-2">
            <span className="text-xs muted">Date</span>
            <div className="calendar-view-toggle">
              <button
                type="button"
                className={
                  "toggle-btn" +
                  (dateMode === "all" ? " toggle-btn-active" : "")
                }
                onClick={() => handleDateModeChange("all")}
              >
                All
              </button>
              <button
                type="button"
                className={
                  "toggle-btn" +
                  (dateMode === "day" ? " toggle-btn-active" : "")
                }
                onClick={() => handleDateModeChange("day")}
              >
                Day
              </button>
              <button
                type="button"
                className={
                  "toggle-btn" +
                  (dateMode === "month" ? " toggle-btn-active" : "")
                }
                onClick={() => handleDateModeChange("month")}
              >
                Month
              </button>
              <button
                type="button"
                className={
                  "toggle-btn" +
                  (dateMode === "year" ? " toggle-btn-active" : "")
                }
                onClick={() => handleDateModeChange("year")}
              >
                Year
              </button>
            </div>
          </div>

          {loadingAccounts || loadingMessages ? (
            <p className="muted text-xs mt-2">Loading…</p>
          ) : null}
          {error && <p className="error-text mt-2">{error}</p>}

          {/* Messages list */}
          <ul
            className="list mt-2"
            style={{ maxHeight: 480, overflowY: "auto" }}
          >
            {filteredMessages.map((m) => {
              const isActive =
                selectedMessage && selectedMessage.id === m.id;
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
                      {m.sent_at &&
                        new Date(m.sent_at).toLocaleString(undefined, {
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
            {!loadingMessages && !filteredMessages.length && (
              <li className="muted text-xs mt-2">
                {currentAccount
                  ? "No emails matching your filters for this account."
                  : "Select or add an account to see emails."}
              </li>
            )}
          </ul>
        </div>

        {/* RIGHT: message content + AI actions */}
        <div className="card">
          <div className="flex items-center justify-between">
            <h3 className="card-title">Details</h3>
            {selectedMessage && (
              <button
                type="button"
                className="secondary-btn text-xs"
                onClick={handleAnalyze}
                disabled={aiLoading}
              >
                {aiLoading ? "Analyzing…" : "AI: tasks & notes"}
              </button>
            )}
          </div>

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
                  {selectedMessage.sent_at &&
                    new Date(selectedMessage.sent_at).toLocaleString()}
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
                  maxHeight: 320,
                  overflowY: "auto",
                }}
              >
                {selectedMessage.body_text || "(no body)"}
              </div>

              {/* AI result area */}
              {aiError && <p className="error-text mt-2">{aiError}</p>}
              {aiResult && (
                <div className="mt-3">
                  <div className="text-xs muted">
                    AI created{" "}
                    <strong>{aiResult.created_tasks?.length || 0}</strong>{" "}
                    tasks and{" "}
                    <strong>{aiResult.created_notes?.length || 0}</strong>{" "}
                    notes from this email.
                  </div>
                  {!!(aiResult.created_tasks || []).length && (
                    <div className="mt-2">
                      <div className="text-xs font-medium">New tasks</div>
                      <ul className="list mt-1">
                        {aiResult.created_tasks.map((t) => (
                          <li key={t.id} className="text-xs">
                            • {t.title}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {!!(aiResult.created_notes || []).length && (
                    <div className="mt-2">
                      <div className="text-xs font-medium">New notes</div>
                      <ul className="list mt-1">
                        {aiResult.created_notes.map((n) => (
                          <li key={n.id} className="text-xs">
                            • {n.title}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      <p className="muted text-xs mt-4">
        Auto-sync runs every minute for the selected account. The AI button
        above can turn an email into actionable tasks and notes in your
        workspace.
      </p>
    </div>
  );
};

export default Emails;