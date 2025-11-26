// frontend/src/App.jsx
import React, { useEffect, useState } from "react";
import { Routes, Route, useNavigate } from "react-router-dom";
import Layout from "./components/Layout";
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import Tasks from "./pages/Tasks";
import Notes from "./pages/Notes";
import Calendar from "./pages/Calendar";
import Contacts from "./pages/Contacts";
import Emails from "./pages/Emails";
import Settings from "./pages/Settings";

const App = () => {
  const [isAuth, setIsAuth] = useState(!!localStorage.getItem("access"));
  const navigate = useNavigate();

  useEffect(() => {
    if (!isAuth) {
      navigate("/login");
    }
  }, [isAuth, navigate]);

  const handleLoginSuccess = () => {
    setIsAuth(true);
    navigate("/");
  };

  // 🔥 When NOT logged in → Show ONLY Login (no sidebar, no layout, no pages)
  if (!isAuth) {
    return (
      <Routes>
        <Route
          path="*"
          element={<Login onLogin={handleLoginSuccess} />}
        />
      </Routes>
    );
  }

  // Logged in → show full app
  return (
    <Layout>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/tasks" element={<Tasks />} />
        <Route path="/notes" element={<Notes />} />
        <Route path="/calendar" element={<Calendar />} />
        <Route path="/contacts" element={<Contacts />} />
        <Route path="/emails" element={<Emails />} />
        <Route path="/settings" element={<Settings />} />
        <Route path="/login" element={<Login onLogin={handleLoginSuccess} />} />
      </Routes>
    </Layout>
  );
};

export default App;