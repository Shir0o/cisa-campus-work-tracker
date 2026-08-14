import React from "react";
import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import PrivacyPolicy from "../views/PrivacyPolicy";

describe("PrivacyPolicy", () => {
  it("renders Privacy Policy title and section headings", () => {
    render(
      <MemoryRouter>
        <PrivacyPolicy />
      </MemoryRouter>
    );

    expect(screen.getByText("Privacy Policy")).toBeInTheDocument();
    expect(screen.getByText("Enterprise Access & Data Protection Notice")).toBeInTheDocument();
    expect(screen.getByText("1. Overview & Purpose")).toBeInTheDocument();
    expect(screen.getByText("2. Data We Collect")).toBeInTheDocument();
    expect(screen.getByText("3. How Data Is Used")).toBeInTheDocument();
    expect(screen.getByText("4. Role-Based Access Control")).toBeInTheDocument();
    expect(screen.getByText("5. Account Provisioning & Deletion")).toBeInTheDocument();
    expect(screen.getByText("6. Security & Data Retention")).toBeInTheDocument();
    expect(screen.getByText("7. Contact Information")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /help & support/i })).toHaveAttribute("href", "/support");
  });

  it("navigates back to home when Back to Application button is clicked", () => {
    render(
      <MemoryRouter initialEntries={["/privacy"]}>
        <Routes>
          <Route path="/privacy" element={<PrivacyPolicy />} />
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
