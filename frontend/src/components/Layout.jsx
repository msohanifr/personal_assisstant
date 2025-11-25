// frontend/src/components/Layout.jsx
import React, { useEffect, useState } from "react";
import { FaBars, FaUserCircle } from "react-icons/fa";
import Sidebar from "./Sidebar";
import client from "../api/client";

const Layout = ({ children }) => {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [currentUser, setCurrentUser] = useState(null);
  const [userError, setUserError] = useState("");

  const toggleSidebar = () => {
    console.debug("[Layout] Toggling sidebar. Previous state:", sidebarOpen);
    setSidebarOpen((prev) => !prev);
  };

  // Fetch current logged-in user
  useEffect(() => {
    const fetchUser = async () => {
      console.debug("[Layout] Fetching current user from /users/me/");
      setUserError("");

      try {
        const res = await client.get("/users/me/");
        console.debug("[Layout] Current user response:", res.data);
        setCurrentUser(res.data);
      } catch (err) {
        console.error("[Layout] Error fetching current user:", err);
        setUserError("Could not load user info");
      }
    };

    fetchUser();
  }, []);

  return (
    <div className="app-shell">
      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <main className="app-main">
        {/* Top bar with hamburger + user info */}
        <div className="topbar">
          <button
            className="icon-btn topbar-menu-btn"
            type="button"
            onClick={toggleSidebar}
            aria-label="Toggle sidebar"
          >
            <FaBars />
          </button>
          <span className="topbar-title">Assistant Hub</span>

          <div style={{ marginLeft: "auto" }} className="flex items-center gap-4">
            {userError && (
              <span className="text-xs muted">{userError}</span>
            )}
            {currentUser && (
              <div className="flex items-center gap-2">
                <FaUserCircle className="muted" />
                <div className="flex flex-col">
                  <span className="text-sm font-medium">
                    {currentUser.username || "User"}
                  </span>
                  {currentUser.email && (
                    <span className="text-xs muted">
                      {currentUser.email}
                    </span>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        {children}
      </main>
    </div>
  );
};

export default Layout;