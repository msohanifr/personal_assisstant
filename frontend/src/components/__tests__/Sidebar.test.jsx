import React from "react";
import { MemoryRouter } from "react-router-dom";
import { render, screen } from "@testing-library/react";
import Sidebar from "../Sidebar";

const renderSidebar = (props = {}) =>
  render(
    <MemoryRouter>
      <Sidebar isOpen={true} onClose={() => {}} {...props} />
    </MemoryRouter>
  );

describe("Sidebar", () => {
  test("renders main navigation links", () => {
    renderSidebar();

    expect(screen.getByText("Dashboard")).toBeInTheDocument();
    expect(screen.getByText("Tasks")).toBeInTheDocument();
    expect(screen.getByText("Notes")).toBeInTheDocument();
    expect(screen.getByText("Calendar")).toBeInTheDocument();
    expect(screen.getByText("Contacts")).toBeInTheDocument();
    expect(screen.getByText("Emails")).toBeInTheDocument();
    expect(screen.getByText("Settings")).toBeInTheDocument();
  });

  test("caps email badge at 99+", () => {
    renderSidebar({ emailUnreadCount: 142 });
    expect(screen.getByText("99+")).toBeInTheDocument();
  });

  test("applies closed class when not open", () => {
    render(
      <MemoryRouter>
        <Sidebar isOpen={false} onClose={() => {}} emailUnreadCount={0} />
      </MemoryRouter>
    );

    const aside = screen.getByRole("complementary");
    expect(aside).toHaveClass("sidebar-closed");
  });
});
