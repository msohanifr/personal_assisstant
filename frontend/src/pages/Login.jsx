import React, { useState } from "react";
import client from "../api/client";

const Login = ({ onLogin }) => {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    try {
      const res = await client.post("/token/", { username, password });
      localStorage.setItem("access", res.data.access);
      localStorage.setItem("refresh", res.data.refresh);
      onLogin();
    } catch {
      setError("Invalid username or password.");
    }
  };

  return (
    <div className="login-page">
      <div className="login-card">
        <h1 className="login-title">Welcome back</h1>
        <p className="login-subtitle">Sign in to your assistant hub</p>
        <form onSubmit={handleSubmit} className="login-form">
          <label className="field-label">
            Username
            <input className="field-input" value={username} onChange={(e) => setUsername(e.target.value)} required />
          </label>
          <label className="field-label">
            Password
            <input type="password" className="field-input" value={password} onChange={(e) => setPassword(e.target.value)} required />
          </label>
          {error && <p className="error-text">{error}</p>}
          <button type="submit" className="primary-btn">Sign in</button>
        </form>
        <div className="login-divider"><span>or</span></div>
        <button className="google-btn" type="button" disabled>
          Continue with Google (coming soon)
        </button>
      </div>
    </div>
  );
};
export default Login;
