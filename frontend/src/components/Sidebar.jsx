// frontend/src/components/Sidebar.jsx
import React from "react";
import { NavLink } from "react-router-dom";
import {
  FaCalendarAlt,
  FaTasks,
  FaStickyNote,
  FaUserFriends,
  FaEnvelopeOpenText,
  FaCog,
  FaHome,
  FaTimes,
} from "react-icons/fa";

const Sidebar = ({ isOpen, onClose, emailUnreadCount = 0 }) => {
  const navLinkClass = ({ isActive }) =>
    "sidebar-link " +
    (isActive ? "sidebar-link-active" : "sidebar-link-idle");

  // cap like iPhone badges
  const emailBadgeDisplay =
    emailUnreadCount > 99 ? "99+" : emailUnreadCount.toString();

  return (
    <aside
      className={isOpen ? "sidebar sidebar-open" : "sidebar sidebar-closed"}
    >
      <div className="sidebar-header">
        <div className="logo-circle">A</div>
        <div className="sidebar-header-text">
          <h1 className="logo-text">Assistant Hub</h1>
          <p className="logo-sub">Your day, in one place</p>
        </div>
        <button
          type="button"
          className="icon-btn sidebar-close-btn"
          onClick={onClose}
          aria-label="Close sidebar"
        >
          <FaTimes />
        </button>
      </div>

      <nav className="sidebar-nav">
        <NavLink to="/" className={navLinkClass} end>
          <FaHome /> <span>Dashboard</span>
        </NavLink>

        <NavLink to="/tasks" className={navLinkClass}>
          <FaTasks /> <span>Tasks</span>
        </NavLink>

        <NavLink to="/notes" className={navLinkClass}>
          <FaStickyNote /> <span>Notes</span>
        </NavLink>

        <NavLink to="/calendar" className={navLinkClass}>
          <FaCalendarAlt /> <span>Calendar</span>
        </NavLink>

        <NavLink to="/contacts" className={navLinkClass}>
          <FaUserFriends /> <span>Contacts</span>
        </NavLink>

        {/* Emails + unread badge */}
        <NavLink to="/emails" className={navLinkClass}>
          <FaEnvelopeOpenText />
          <span className="sidebar-link-label-with-badge">
            <span>Emails</span>
            {emailUnreadCount > 0 && (
              <span className="sidebar-badge-email">
                {emailBadgeDisplay}
              </span>
            )}
          </span>
        </NavLink>
      </nav>

      <div className="sidebar-footer">
        <NavLink to="/settings" className={navLinkClass}>
          <FaCog /> <span>Settings</span>
        </NavLink>
        <p className="sidebar-tip">Tip: Start your day on the Dashboard.</p>
      </div>
    </aside>
  );
};

export default Sidebar;