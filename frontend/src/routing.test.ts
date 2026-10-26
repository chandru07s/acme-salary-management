import { describe, expect, it } from "vitest";
import { parseHash } from "./App";

describe("parseHash", () => {
  it("maps known hashes to views", () => {
    expect(parseHash("#/").view).toBe("dashboard");
    expect(parseHash("#/employees").view).toBe("directory");
    expect(parseHash("#/equity").view).toBe("equity");
    expect(parseHash("#/settings").view).toBe("settings");
  });
  it("reads the employee id from profile links", () => {
    expect(parseHash("#/employee/42")).toEqual({ view: "employee", id: 42 });
  });
  it("falls back to the dashboard for anything unknown", () => {
    expect(parseHash("#/employee/abc").view).toBe("dashboard");
    expect(parseHash("").view).toBe("dashboard");
  });
});
