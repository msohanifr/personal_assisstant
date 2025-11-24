import React from "react";
import Sidebar from "./Sidebar";
const Layout = ({ children }) => (
  <div className="app-shell">
    <Sidebar />
    <main className="app-main">{children}</main>
  </div>
);
export default Layout;
