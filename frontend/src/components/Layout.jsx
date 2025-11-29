// frontend/src/components/Layout.jsx
import React, { useEffect, useState } from "react";
import { FaBars, FaUserCircle, FaSignOutAlt } from "react-icons/fa";
import { useNavigate } from "react-router-dom";
import Sidebar from "./Sidebar";
import client from "../api/client";

const Layout = ({ children }) => {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [currentUser, setCurrentUser] = useState(null);
  const [userError, setUserError] = useState("");

  // 🔔 unread email count for sidebar badge
  const [emailUnreadCount, setEmailUnreadCount] = useState(0);

  // ⏰ Live clock
  const [now, setNow] = useState(() => new Date());

  const navigate = useNavigate();

  const toggleSidebar = () => {
    console.debug("[Layout] Toggling sidebar. Previous state:", sidebarOpen);
    setSidebarOpen((prev) => !prev);
  };

  const handleLogout = async () => {
    console.debug("[Layout] Logging out user…");
    try {
      // Optional: hit a backend logout endpoint if/when you add it
      try {
        await client.post("/logout/", {});
      } catch (err) {
        console.warn("[Layout] /logout/ request failed (ignored):", err);
      }
    } finally {
      localStorage.removeItem("access");
      localStorage.removeItem("refresh");
      navigate("/login");
    }
  };

  const handleGoToProfile = () => {
    navigate("/settings");
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

  // 🔔 Fetch unread email count (for all accounts)
  useEffect(() => {
    let isMounted = true;

    const fetchUnreadCount = async () => {
      try {
        console.debug("[Layout] Fetching unread email count…");

        // Adjust this endpoint/shape to your backend as needed
        const res = await client.get("/email-messages/unread-count/");
        const unread = res.data?.unread ?? 0;

        if (isMounted) {
          setEmailUnreadCount(unread);
        }
      } catch (err) {
        console.error("[Layout] Error fetching unread count:", err);
        // Silent fail; we don't want to show an error just for the badge.
      }
    };

    // initial fetch + poll every 60s
    fetchUnreadCount();
    const intervalId = setInterval(fetchUnreadCount, 60_000);

    return () => {
      isMounted = false;
      clearInterval(intervalId);
    };
  }, []);

  // ⏰ Keep time/date up to date (once per minute)
  useEffect(() => {
    const id = setInterval(() => {
      setNow(new Date());
    }, 60_000);

    return () => clearInterval(id);
  }, []);

  const formattedNow = now.toLocaleString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });

  return (
    <div className="app-shell">
      <Sidebar
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        emailUnreadCount={emailUnreadCount}
      />
      <main className="app-main">
        {/* Top bar with hamburger + date/time + user info + logout */}
        <div className="topbar">
          {/* Left: sandwich + title */}
          <button
            className="icon-btn topbar-menu-btn"
            type="button"
            onClick={toggleSidebar}
            aria-label="Toggle sidebar"
          >
            <FaBars />
          </button>
          <span className="topbar-title">Assistant Hub</span>

          {/* Center: date & time */}
          <span className="topbar-datetime" aria-label="Current date and time">
            {formattedNow}
          </span>

          {/* Right: user + logout */}
          <div className="topbar-right">
            {userError && <span className="topbar-error">{userError}</span>}

            {currentUser && (
              <button
                type="button"
                className="topbar-profile"
                onClick={handleGoToProfile}
                title="Open profile / settings"
              >
                <FaUserCircle className="topbar-profile-icon" />
                <div className="topbar-profile-text">
                  <span className="topbar-profile-name">
                    {currentUser.username || "User"}
                  </span>
                  {currentUser.email && (
                    <span className="topbar-profile-email">
                      {currentUser.email}
                    </span>
                  )}
                </div>
              </button>
            )}

            <button
              type="button"
              className="icon-btn topbar-logout-btn"
              onClick={handleLogout}
              aria-label="Log out"
              title="Log out"
            >
              <FaSignOutAlt />
            </button>
          </div>
        </div>

        {children}
      </main>
    </div>
  );
};

export default Layout;