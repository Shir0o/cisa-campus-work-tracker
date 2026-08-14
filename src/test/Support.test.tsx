import React from "react";
import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import Support from "../views/Support";

describe("Support Component", () => {
  it("renders Support title, contact details, FAQs, and system compatibility", () => {
    render(
      <MemoryRouter>
        <Support />
      </MemoryRouter>
    );

    expect(screen.getByText("App Support & Help Center")).toBeInTheDocument();
    expect(screen.getByText("CISA Campus Work Tracker Support & Documentation")).toBeInTheDocument();
    expect(screen.getByText("Contact Support")).toBeInTheDocument();
    expect(screen.getAllByText("yilongwang05@gmail.com").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("Frequently Asked Questions")).toBeInTheDocument();
    expect(screen.getByText("How do I access my account?")).toBeInTheDocument();
    expect(screen.getByText("What are the user roles?")).toBeInTheDocument();
    expect(screen.getByText("System Compatibility")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /privacy policy/i })).toHaveAttribute("href", "/privacy");
  });

  it("navigates back to home when Back to Application button is clicked", () => {
    render(
      <MemoryRouter initialEntries={["/support"]}>
        <Routes>
          <Route path="/support" element={<Support />} />
          <Route path="/" element={<div>Home View</div>} />
        </Routes>
      </MemoryRouter>
    );

    const backButton = screen.getByRole("button", { name: /back to application/i });
    expect(backButton).toBeInTheDocument();

    fireEvent.click(backButton);
    expect(screen.getByText("Home View")).toBeInTheDocument();
  });
});
