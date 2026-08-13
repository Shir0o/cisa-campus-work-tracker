import React from "react";
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
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
  });
});
