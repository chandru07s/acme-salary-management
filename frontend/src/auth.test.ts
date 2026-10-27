import { describe, expect, it } from "vitest";
import { can } from "./auth";

describe("role permissions (mirror the server rules)", () => {
  it("only HR edits data and prepares payroll", () => {
    expect([can.editData("hr"), can.editData("owner"), can.editData("viewer")]).toEqual([true, false, false]);
    expect([can.preparePayroll("hr"), can.preparePayroll("owner"), can.preparePayroll("viewer")]).toEqual([true, false, false]);
  });
  it("only the owner approves, so no one approves their own work", () => {
    expect([can.approvePayroll("hr"), can.approvePayroll("owner"), can.approvePayroll("viewer")]).toEqual([false, true, false]);
  });
  it("viewers cannot read payroll", () => {
    expect([can.readPayroll("hr"), can.readPayroll("owner"), can.readPayroll("viewer")]).toEqual([true, true, false]);
  });
});
