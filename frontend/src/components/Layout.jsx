// frontend/src/components/Layout.jsx
import React, { useState } from "react";
import { FaBars } from "react-icons/fa";
import Sidebar from "./Sidebar";

const Layout = ({ children }) => {
  const [sidebarOpen, setSidebarOpen] = useState(true);

  const toggleSidebar = () => setSidebarOpen((v) => !v);

  return (
    <div className="app-shell">
      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <main className="app-main">
        <div className="topbar">
          <button
            className="icon-btn topbar-menu-btn"
            type="button"
            onClick={toggleSidebar}
          >
            <FaBars />
          </button>
          <span className="topbar-title">Assistant Hub</span>
        </div>
        {children}
      </main>
    </div>
  );
};

export default Layout;