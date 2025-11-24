import React from "react";
const Emails = () => (
  <div className="page">
    <h2 className="page-title">Emails (placeholder)</h2>
    <div className="card">
      <p>
        This is a placeholder for your unified inbox. Here you can later plug in
        integrations with Gmail, Yahoo, Outlook, and other IMAP/SMTP providers.
      </p>
      <ul className="list mt-4">
        <li>Connect Gmail via OAuth and the Gmail API.</li>
        <li>Connect Microsoft accounts via Microsoft Graph.</li>
        <li>Connect generic IMAP/SMTP mailboxes.</li>
      </ul>
    </div>
  </div>
);
export default Emails;
