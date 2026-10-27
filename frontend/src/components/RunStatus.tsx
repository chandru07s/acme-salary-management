import type { RunStatus } from "../types";

const LABEL: Record<RunStatus, string> = { draft: "Draft", pending_approval: "Awaiting approval", approved: "Approved" };

export function RunStatusPill({ status }: { status: RunStatus }) {
  return <span className={`run-status ${status}`}>{LABEL[status]}</span>;
}
