import React from "react";
const Settings = () => {
  const handleLogout = () => {
    localStorage.removeItem("access");
    localStorage.removeItem("refresh");
    window.location.href = "/";
  };
  return (
    <div className="page">
      <h2 className="page-title">Settings</h2>
      <div className="card">
        <h3 className="card-title">Account</h3>
        <button className="secondary-btn mt-2" onClick={handleLogout}>Log out</button>
        <p className="muted text-xs mt-4">
          More profile settings, connected calendars & email accounts can be added here.
        </p>
      </div>
    </div>
  );
};
export default Settings;
