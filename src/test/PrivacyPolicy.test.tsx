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
    expect(screen.getByText("1. Overview")).toBeInTheDocument();
    expect(screen.getByText("4. Account Provisioning & Deletion")).toBeInTheDocument();
    expect(screen.getByText("5. Security & Data Retention")).toBeInTheDocument();
    expect(screen.queryByText(/directly within workspace settings/i)).toBeNull();
    expect(screen.queryByText(/encrypted/i)).toBeNull();
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
