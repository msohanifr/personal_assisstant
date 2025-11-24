import React from "react";
import { NavLink } from "react-router-dom";
import { FaCalendarAlt, FaTasks, FaStickyNote, FaUserFriends, FaEnvelopeOpenText, FaCog, FaHome } from "react-icons/fa";

const Sidebar = () => {
  const navLinkClass = ({ isActive }) =>
    "flex items-center gap-3 px-4 py-2 rounded-xl text-sm font-medium transition-all " +
    (isActive ? "bg-amber-100 text-amber-900 shadow-sm" : "text-slate-600 hover:bg-slate-100");
  return (
    <aside className="sidebar">
      <div className="sidebar-header">
        <div className="logo-circle">A</div>
        <div>
          <h1 className="logo-text">Assistant Hub</h1>
          <p className="logo-sub">Your day, in one place</p>
        </div>
      </div>
      <nav className="sidebar-nav">
        <NavLink to="/" className={navLinkClass} end><FaHome /><span>Dashboard</span></NavLink>
        <NavLink to="/tasks" className={navLinkClass}><FaTasks /><span>Tasks</span></NavLink>
        <NavLink to="/notes" className={navLinkClass}><FaStickyNote /><span>Notes</span></NavLink>
        <NavLink to="/calendar" className={navLinkClass}><FaCalendarAlt /><span>Calendar</span></NavLink>
        <NavLink to="/contacts" className={navLinkClass}><FaUserFriends /><span>Contacts</span></NavLink>
        <NavLink to="/emails" className={navLinkClass}><FaEnvelopeOpenText /><span>Emails</span></NavLink>
      </nav>
      <div className="sidebar-footer">
        <NavLink to="/settings" className={navLinkClass}><FaCog /><span>Settings</span></NavLink>
        <p className="sidebar-tip">Tip: Start your day on the Dashboard.</p>
      </div>
    </aside>
  );
};
export default Sidebar;
