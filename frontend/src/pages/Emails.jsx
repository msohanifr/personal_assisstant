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
 * - Master/detail layout:
 *     - List-only view (Gmail-style)
 *     - Full-width detail view with "Back to list" button
 * - Pagination (20 messages per page)
 * - Auto-sync current account every minute
 * - AI button to create tasks & notes from an email
 */

const PAGE_SIZE = 20;

const Emails = () => {
  const [accounts, setAccounts] = useState([]);
  const [selectedAccountId, setSelectedAccountId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [selectedMessage, setSelectedMessage] = useState(null);

  const [search, setSearch] = useState("");
  const [dateMode, setDateMode] = useState("all"); // "all" | "day" | "month" | "year"
  const [page, setPage] = useState(1); // pagination page (1-based)
  const [folder, setFolder] = useState("INBOX"); // "INBOX" | "SENT"

  const [loadingAccounts, setLoadingAccounts] = useState(false);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [lastSync, setLastSync] = useState(null);
  const [error, setError] = useState("");

  // AI agent UI state
  const [aiLoading, setAiLoading] = useState(false);
  const [aiResult, setAiResult] = useState(null);
  const [aiError, setAiError] = useState("");
  const [aiBulkLoading, setAiBulkLoading] = useState(false);
  const [aiStatus, setAiStatus] = useState("");
  const [actionableOnly, setActionableOnly] = useState(false);
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [snoozedIds, setSnoozedIds] = useState(new Set());

  // Master/detail view
  const [viewMode, setViewMode] = useState("list"); // "list" | "detail"

  // Compose UI
  const [composeOpen, setComposeOpen] = useState(false);
  const [composeForm, setComposeForm] = useState({
    to: "",
    cc: "",
    bcc: "",
    subject: "",
    body: "",
  });

  // ----------------------------
  // Load accounts
  // ----------------------------
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
    setViewMode("list");
  };

  const handleSearchChange = (e) => {
    setSearch(e.target.value);
  };

  // Whenever filters that affect the list change, reset to page 1
  useEffect(() => {
    setPage(1);
  }, [selectedAccountId, search, dateMode, folder]);

  // ----------------------------
  // Load messages when account or search changes
  // ----------------------------
  const fetchMessages = async (accountId, currentSearch, currentFolder) => {
    if (!accountId) {
      setMessages([]);
      setSelectedMessage(null);
      return;
    }

    setLoadingMessages(true);
    setError("");
    try {
      const params = { account: accountId, folder: currentFolder || folder };
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
    fetchMessages(selectedAccountId, search, folder);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedAccountId, search, folder]);

  // ----------------------------
  // Sync handler (manual + auto)
  // ----------------------------
  const handleSync = async (silent = false) => {
    if (!currentAccount) return;
    setSyncing(true);
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
      await fetchMessages(currentAccount.id, search, folder);
      setLastSync(new Date());
    } catch (err) {
      console.error("[Emails] Error calling sync:", err);
      if (!silent) {
        setError("Sync call failed (see console for details).");
      }
    } finally {
      setSyncing(false);
    }
  };

  // Auto-sync every minute for the current account
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
  }, [currentAccount?.id, search, folder]);

  // ----------------------------
  // Filters + pagination + selection
  // ----------------------------
  const handleDateModeChange = (mode) => {
    console.debug("[Emails] Changing date filter to:", mode);
    setDateMode(mode);
  };

  const handleSelectMessage = (msg) => {
    console.debug("[Emails] Selecting message id:", msg.id);
    setSelectedMessage(msg);
    setAiResult(null);
    setAiError("");
    setViewMode("detail");
  };

  const handleFolderChange = (newFolder) => {
    setFolder(newFolder);
    setSelectedMessage(null);
    setViewMode("list");
  };

  const handleComposeChange = (e) => {
    const { name, value } = e.target;
    setComposeForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleComposeSubmit = (e) => {
    e.preventDefault();
    // No backend send endpoint yet; use mailto as a fallback.
    const params = new URLSearchParams();
    if (composeForm.subject) params.set("subject", composeForm.subject);
    if (composeForm.body) params.set("body", composeForm.body);
    if (composeForm.cc) params.set("cc", composeForm.cc);
    if (composeForm.bcc) params.set("bcc", composeForm.bcc);
    const mailto = `mailto:${encodeURIComponent(composeForm.to || "")}?${params.toString()}`;
    window.open(mailto, "_blank");
    setComposeOpen(false);
  };

  const renderEmailBody = (msg) => {
    if (!msg) return "(no body)";
    const html = msg.body_html || "";
    const text = msg.body_text || "";

    const sanitize = (raw) =>
      raw.replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, "");

    if (html.trim()) {
      return (
        <div
          className="email-body-html"
          dangerouslySetInnerHTML={{ __html: sanitize(html) }}
        />
      );
    }

    // text fallback: preserve line breaks
    return (
      <div className="email-body-text">
        {text.split("\n").map((line, idx) => (
          // eslint-disable-next-line react/no-array-index-key
          <p key={idx} style={{ margin: "0 0 8px" }}>
            {line || "\u00a0"}
          </p>
        ))}
      </div>
    );
  };

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
      if (snoozedIds.has(m.id)) return false;

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
      return true;
    }).filter((m) => {
      if (!actionableOnly) return true;
      const text = `${m.subject || ""} ${m.body_text || ""} ${m.body_html || ""}`.toLowerCase();
      const cues = ["please", "can you", "could you", "action", "asap", "due", "follow up", "schedule", "send", "review", "need"];
      return cues.some((c) => text.includes(c));
    });

    return result;
  }, [messages, dateMode, actionableOnly, snoozedIds]);

  const totalCount = messages.length;
  const filteredCount = filteredMessages.length;

  // Pagination calculations
  const totalPages = filteredCount
    ? Math.ceil(filteredCount / PAGE_SIZE)
    : 1;
  const safePage = Math.min(page, totalPages);
  const startIndex = filteredCount ? (safePage - 1) * PAGE_SIZE : 0;
  const endIndex = filteredCount
    ? Math.min(startIndex + PAGE_SIZE, filteredCount)
    : 0;
  const pagedMessages = filteredCount
    ? filteredMessages.slice(startIndex, endIndex)
    : [];

  const handlePageChange = (newPage) => {
    console.debug("[Emails] handlePageChange:", { newPage, totalPages });
    if (newPage < 1 || newPage > totalPages) return;
    setPage(newPage);
  };

  // If the selected message disappears due to filters, go back to list
  useEffect(() => {
    if (!selectedMessage) return;
    const stillExists = filteredMessages.some(
      (m) => m.id === selectedMessage.id
    );
    if (!stillExists) {
      setSelectedMessage(null);
      setViewMode("list");
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

  // ----------------------------
  // AI: analyze email -> create tasks & notes
  // ----------------------------
  const handleAnalyze = async () => {
    if (!selectedMessage) return;
    const ok = window.confirm(
      "Run AI on this email to create tasks/notes/events?"
    );
    if (!ok) return;

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
        "AI analysis failed. Check backend logs for details."
      );
    } finally {
      setAiLoading(false);
    }
  };

  const handleAnalyzeAll = async () => {
    const targets = filteredMessages.filter((m) => selectedIds.size === 0 || selectedIds.has(m.id));
    if (!targets.length) {
      setAiStatus("No emails to analyze with current filters.");
      return;
    }
    const ok = window.confirm(
      `Run AI on ${targets.length} email(s) to create tasks/notes/events?`
    );
    if (!ok) return;

    setAiBulkLoading(true);
    setAiStatus("Running AI on emails...");
    let taskTotal = 0;
    let noteTotal = 0;
    let eventTotal = 0;

    for (const msg of targets) {
      try {
        const res = await client.post(`/email-messages/${msg.id}/analyze/`);
        taskTotal += res.data?.created_tasks?.length || 0;
        noteTotal += res.data?.created_notes?.length || 0;
        eventTotal += res.data?.created_events?.length || 0;
      } catch (err) {
        console.error("[Emails] Bulk AI error:", err);
        const detail =
          err.response?.data?.detail ||
          err.message ||
          "AI analysis failed during bulk run.";
        setAiStatus(
          `Stopped after ${taskTotal} tasks, ${noteTotal} notes, ${eventTotal} events. Error: ${detail}`
        );
        setAiBulkLoading(false);
        return;
      }
    }

    setAiStatus(
      `AI created ${taskTotal} tasks, ${noteTotal} notes, ${eventTotal} events from ${targets.length} emails.`
    );
    setAiBulkLoading(false);
  };

  // ----------------------------
  // Render
  // ----------------------------
  return (
    <div className="page page-emails">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="page-title" style={{ marginBottom: 4 }}>
            Emails
          </h2>
          <div className="text-xs muted">
            {currentAccount
              ? `Auto-pulling every minute · ${folder === "INBOX" ? "Inbox" : "Sent"}`
              : "Add an account to start"}
            {lastSync && (
              <span style={{ marginLeft: 8 }}>
                · Last sync{" "}
                {lastSync.toLocaleTimeString(undefined, {
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </span>
            )}
          </div>
        </div>
          <div className="flex items-center gap-2">
          {currentAccount && (
            <button
              type="button"
              className="secondary-btn text-xs"
              onClick={() => handleSync(false)}
              disabled={syncing}
            >
            {syncing ? "Syncing…" : "Sync now"}
            </button>
          )}
          {aiStatus && (
            <span className="text-xs muted" style={{ marginRight: 8 }}>
              {aiStatus}
            </span>
          )}
          <label className="text-xs" style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <input
              type="checkbox"
              checked={actionableOnly}
              onChange={(e) => setActionableOnly(e.target.checked)}
            />
            Actionable only
          </label>
          <button
            type="button"
            className="secondary-btn text-xs"
            onClick={handleAnalyzeAll}
            disabled={aiBulkLoading}
          >
            {aiBulkLoading ? "AI running…" : "AI: process list"}
          </button>
          <button
            type="button"
            className="primary-btn text-xs"
            onClick={() => setComposeOpen(true)}
          >
            Compose
          </button>
        </div>
      </div>

      {/* LIST VIEW */}
      {viewMode === "list" && (
      <div className="card email-master-card">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="card-title">
                {folder === "INBOX" ? "Inbox" : "Sent"}
                {currentAccount && (
                  <span className="text-xs muted" style={{ marginLeft: 8 }}>
                    {filteredCount} of {totalCount} emails · {dateModeLabel}
                  </span>
                )}
              </h3>
            </div>
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

          {/* Folder toggle */}
          <div className="flex items-center gap-2 mt-2">
            <span className="text-xs muted">Folder</span>
            <div className="calendar-view-toggle">
              <button
                type="button"
                className={
                  "toggle-btn" + (folder === "INBOX" ? " toggle-btn-active" : "")
                }
                onClick={() => handleFolderChange("INBOX")}
              >
                Inbox
              </button>
              <button
                type="button"
                className={
                  "toggle-btn" + (folder === "SENT" ? " toggle-btn-active" : "")
                }
                onClick={() => handleFolderChange("SENT")}
              >
                Sent
              </button>
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

          {/* Messages list (Gmail-style rows) */}
          <ul
            className="list mt-2 email-list"
            style={{ maxHeight: 520, overflowY: "auto" }}
          >
            {pagedMessages.map((m) => (
              <li
                key={m.id}
                className={
                  "email-list-item" +
                  (selectedMessage?.id === m.id ? " email-list-item-active" : "")
                }
                onClick={() => handleSelectMessage(m)}
              >
                <div className="flex items-center gap-2" style={{ marginBottom: 4 }}>
                  <input
                    type="checkbox"
                    checked={selectedIds.has(m.id)}
                    onChange={(e) => {
                      e.stopPropagation();
                      setSelectedIds((prev) => {
                        const next = new Set(prev);
                        if (e.target.checked) next.add(m.id);
                        else next.delete(m.id);
                        return next;
                      });
                    }}
                    onClick={(e) => e.stopPropagation()}
                  />
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      className="secondary-btn text-xs"
                      onClick={(e) => {
                        e.stopPropagation();
                        setSnoozedIds((prev) => new Set(prev).add(m.id));
                      }}
                    >
                      Snooze (hide)
                    </button>
                  </div>
                </div>
                <div className="flex justify-between items-center">
                  <div>
                    <div className="font-medium">
                      {m.subject || "(no subject)"}
                    </div>
                    <div className="muted text-xs">
                      {folder === "SENT"
                        ? m.to_emails || "(no recipient)"
                        : m.from_email || "(unknown sender)"}
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
            ))}
            {!loadingMessages && !pagedMessages.length && (
              <li className="muted text-xs mt-2">
                {currentAccount
                  ? "No emails matching your filters for this account."
                  : "Select or add an account to see emails."}
              </li>
            )}
          </ul>

          {/* Pagination footer */}
          {filteredCount > 0 && (
            <div className="flex items-center justify-between mt-3 text-xs muted">
              <div>
                Showing {startIndex + 1}–{endIndex} of {filteredCount} emails
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  className="secondary-btn"
                  style={{ padding: "4px 10px", fontSize: "0.75rem" }}
                  disabled={safePage <= 1}
                  onClick={() => handlePageChange(safePage - 1)}
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
                  onClick={() => handlePageChange(safePage + 1)}
                >
                  Next
                </button>
              </div>
            </div>
          )}
      </div>
      )}

      {/* DETAIL VIEW */}
      {viewMode === "detail" && (
        <div className="card email-detail-full">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <button
                type="button"
                className="secondary-btn text-xs"
                onClick={() => setViewMode("list")}
              >
                ← Back to list
              </button>
              <h3 className="card-title" style={{ marginBottom: 0 }}>
                Message
              </h3>
            </div>
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
            <p className="muted text-xs mt-2">
              No email selected. Go back to the list and pick a message.
            </p>
          ) : (
            <div className="email-detail-body" style={{ marginTop: 10 }}>
              <div className="email-detail-header">
                <div className="muted text-xs">
                  <strong>{folder === "SENT" ? "To" : "From"}:</strong>{" "}
                  {folder === "SENT"
                    ? selectedMessage.to_emails || "(no recipient)"
                    : selectedMessage.from_email || "(unknown sender)"}
                </div>
                <div className="muted text-xs">
                  <strong>Date:</strong>{" "}
                  {selectedMessage.sent_at &&
                    new Date(selectedMessage.sent_at).toLocaleString()}
                </div>
                <div className="muted text-xs">
                  <strong>Account:</strong>{" "}
                  {currentAccount
                    ? `${currentAccount.label} (${currentAccount.email_address})`
                    : "Unknown"}
                </div>
                {selectedMessage.cc_emails && (
                  <div className="muted text-xs">
                    <strong>CC:</strong> {selectedMessage.cc_emails}
                  </div>
                )}
              </div>

              <h4 className="email-detail-subject">
                {selectedMessage.subject || "(no subject)"}
              </h4>

              <div className="email-detail-content">
                {renderEmailBody(selectedMessage)}
              </div>

              {aiError && <p className="error-text mt-2">{aiError}</p>}
              {aiResult && (
                <div className="mt-3">
                  <div className="text-xs muted">
                    AI created{" "}
                    <strong>{aiResult.created_tasks?.length || 0}</strong> tasks,{" "}
                    <strong>{aiResult.created_notes?.length || 0}</strong> notes, and{" "}
                    <strong>{aiResult.created_events?.length || 0}</strong> events from this email.
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
                  {!!(aiResult.created_events || []).length && (
                    <div className="mt-2">
                      <div className="text-xs font-medium">New events</div>
                      <ul className="list mt-1">
                        {aiResult.created_events.map((ev) => (
                          <li key={ev.id} className="text-xs">
                            • {ev.title}{" "}
                            {ev.start && (
                              <span className="muted">
                                (
                                {new Date(ev.start).toLocaleString(undefined, {
                                  month: "short",
                                  day: "numeric",
                                  hour: "2-digit",
                                  minute: "2-digit",
                                })}
                                )
                              </span>
                            )}
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
      )}

      <p className="muted text-xs mt-4">
        Auto-sync runs every minute for the selected account. The AI button
        can turn an email into actionable tasks and notes in your workspace.
      </p>

      {/* Compose modal */}
      {composeOpen && (
        <div className="modal-backdrop">
          <div className="modal">
            <div className="flex items-center justify-between">
              <h3 className="card-title" style={{ marginBottom: 0 }}>
                Compose
              </h3>
              <button
                type="button"
                className="icon-btn"
                onClick={() => setComposeOpen(false)}
              >
                ✕
              </button>
            </div>
            <form onSubmit={handleComposeSubmit}>
              <label className="field-label">
                To
                <input
                  className="field-input"
                  name="to"
                  value={composeForm.to}
                  onChange={handleComposeChange}
                  required
                  placeholder="recipient@example.com"
                />
              </label>
              <label className="field-label">
                CC
                <input
                  className="field-input"
                  name="cc"
                  value={composeForm.cc}
                  onChange={handleComposeChange}
                  placeholder="Optional"
                />
              </label>
              <label className="field-label">
                BCC
                <input
                  className="field-input"
                  name="bcc"
                  value={composeForm.bcc}
                  onChange={handleComposeChange}
                  placeholder="Optional"
                />
              </label>
              <label className="field-label">
                Subject
                <input
                  className="field-input"
                  name="subject"
                  value={composeForm.subject}
                  onChange={handleComposeChange}
                  placeholder="What's this about?"
                />
              </label>
              <label className="field-label">
                Body
                <textarea
                  className="field-input"
                  name="body"
                  rows={6}
                  value={composeForm.body}
                  onChange={handleComposeChange}
                  placeholder="Write your message…"
                />
              </label>
              <p className="muted text-xs mt-1">
                Sending uses your default email client (mailto). Hook up a send
                API to send directly from here.
              </p>
              <div className="flex items-center gap-2 mt-3">
                <button type="submit" className="primary-btn">
                  Send
                </button>
                <button
                  type="button"
                  className="secondary-btn"
                  onClick={() => setComposeOpen(false)}
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default Emails;
