import { describe, expect, it } from "vitest";
import { describeError, toSearchParams } from "./api";
import { formatCell, formatMoney, formatUsdCompact, niceAxisMax, pct } from "./format";

describe("formatUsdCompact", () => {
  it("abbreviates thousands and millions", () => {
    expect(formatUsdCompact(9240)).toBe("$9.2k");
    expect(formatUsdCompact(65000)).toBe("$65k");
    expect(formatUsdCompact(718_561_070)).toBe("$718.6M");
  });
  it("leaves small values whole", () => {
    expect(formatUsdCompact(950)).toBe("$950");
  });
});

describe("formatMoney", () => {
  it("formats in the given currency without decimals", () => {
    expect(formatMoney(100000, "USD")).toBe("$100,000");
    expect(formatMoney(100000, "GBP")).toContain("100,000");
  });
});

describe("niceAxisMax", () => {
  it("rounds up to a readable axis end", () => {
    expect(niceAxisMax(224_000)).toBe(250_000);
    expect(niceAxisMax(127_000)).toBe(200_000);
    expect(niceAxisMax(100_000)).toBe(100_000);
  });
  it("handles non-positive input", () => {
    expect(niceAxisMax(0)).toBe(1);
  });
});

describe("pct", () => {
  it("scales and clamps to 0-100", () => {
    expect(pct(50, 200)).toBe(25);
    expect(pct(500, 200)).toBe(100);
    expect(pct(-5, 200)).toBe(0);
    expect(pct(5, 0)).toBe(0);
  });
});

describe("api helpers", () => {
  it("omits empty query params", () => {
    const p = toSearchParams({ q: "", country: "IN", page: 2 });
    expect(p.toString()).toBe("country=IN&page=2");
  });
  it("turns FastAPI validation errors into readable text", () => {
    const detail = [{ loc: ["body", "salary"], msg: "Input should be greater than 0" }];
    expect(describeError(detail)).toBe("salary: Input should be greater than 0");
  });
  it("passes through string details", () => {
    expect(describeError("Email already in use: a@b.com")).toBe("Email already in use: a@b.com");
  });
});

describe("formatCell", () => {
  it("shows a dash for missing values", () => {
    expect(formatCell(null)).toBe("—");
    expect(formatCell(undefined)).toBe("—");
  });
  it("formats numbers with separators and at most 2 decimals", () => {
    expect(formatCell(127000)).toBe("127,000");
    expect(formatCell(1234.5678)).toBe("1,234.57");
  });
  it("passes text through", () => {
    expect(formatCell("Engineering")).toBe("Engineering");
  });
});
