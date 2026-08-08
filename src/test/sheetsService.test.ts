import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { fetchSheetData, extractSpreadsheetId } from "../services/sheetsService";

describe("extractSpreadsheetId", () => {
  it("extracts the ID from a standard Google Sheets URL", () => {
    expect(extractSpreadsheetId("https://docs.google.com/spreadsheets/d/abc123-XYZ/edit#gid=0")).toBe("abc123-XYZ");
  });

  it("extracts IDs containing dashes and underscores", () => {
    expect(extractSpreadsheetId("https://docs.google.com/spreadsheets/d/1Ab_c-dEf456/edit")).toBe("1Ab_c-dEf456");
  });

  it("returns a bare ID unchanged", () => {
    expect(extractSpreadsheetId("1Ab_c-dEf456")).toBe("1Ab_c-dEf456");
  });

  it("returns the input unchanged when no spreadsheet pattern matches", () => {
    expect(extractSpreadsheetId("https://example.com/not-a-sheet")).toBe("https://example.com/not-a-sheet");
  });
});

describe("fetchSheetData", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.stubGlobal("fetch", fetchMock);
    fetchMock.mockReset();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("fetches values from the Sheets API with the bearer token", async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ values: [["Name", "Role"], ["Amy", "Student"]] }), { status: 200 })
    );

    const values = await fetchSheetData("sheet-123", "Sheet1!A1:B2", "token-abc");

    expect(values).toEqual([["Name", "Role"], ["Amy", "Student"]]);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://sheets.googleapis.com/v4/spreadsheets/sheet-123/values/Sheet1!A1:B2");
    expect((init as RequestInit).headers).toMatchObject({ Authorization: "Bearer token-abc" });
  });

  it("returns an empty array when the sheet has no values", async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({}), { status: 200 }));
    const values = await fetchSheetData("sheet-123", "A1", "token");
    expect(values).toEqual([]);
  });

  it("throws the API error message when the request fails", async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ error: { message: "Invalid request" } }), { status: 400 })
    );
    await expect(fetchSheetData("sheet-123", "A1", "token")).rejects.toThrow("Invalid request");
  });

  it("throws a generic error when the API error has no message", async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ error: {} }), { status: 500 }));
    await expect(fetchSheetData("sheet-123", "A1", "token")).rejects.toThrow("Failed to fetch sheet data");
  });
});
