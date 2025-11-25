// frontend/src/pages/Login.jsx
import React, { useState } from "react";
import client from "../api/client";

const Login = ({ onLogin }) => {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");

    console.debug("[Login] Submitting login for username:", username);

    try {
      const payload = { username, password };
      console.debug("[Login] POST /token/ payload:", payload);

      // NOTE: baseURL is /api, so this hits /api/token/
      const res = await client.post("/token/", payload);

      console.debug("[Login] /token/ response data:", res.data);

      if (res.data && res.data.access && res.data.refresh) {
        localStorage.setItem("access", res.data.access);
        localStorage.setItem("refresh", res.data.refresh);
        console.debug("[Login] Tokens stored in localStorage");
        onLogin();
      } else {
        console.error(
          "[Login] /token/ response missing access/refresh:",
          res.data
        );
        setError(
          "Login succeeded but tokens were not returned as expected."
        );
      }
    } catch (err) {
      console.error("[Login] Error during login:", err);

      if (err.response) {
        const { status, data } = err.response;
        console.error("[Login] /token/ error status/data:", status, data);

        if (status === 401 || status === 400) {
          setError("Invalid username or password.");
        } else {
          setError(
            `Login failed with status ${status}: ${
              typeof data === "string" ? data : JSON.stringify(data)
            }`
          );
        }
      } else {
        setError(
          "Network error while trying to log in. Check the browser console for details."
        );
      }
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
            <input
              className="field-input"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
            />
          </label>
          <label className="field-label">
            Password
            <input
              type="password"
              className="field-input"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </label>
          {error && <p className="error-text">{error}</p>}
          <button type="submit" className="primary-btn">
            Sign in
          </button>
        </form>
        <div className="login-divider">
          <span>or</span>
        </div>
        <button className="google-btn" type="button" disabled>
          Continue with Google (coming soon)
        </button>
      </div>
    </div>
  );
};

export default Login;