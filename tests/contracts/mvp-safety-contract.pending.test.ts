import { describe, it } from "vitest";

describe("Victoria MVP safety contract scenarios not yet fully executable", () => {
  it.todo("[FIN-004] rejects monetary values that are not integer USD cents");

  it.todo(
    "[ARC-001] rejects a classified candidate that violates the deterministic typed boundary"
  );
  it.todo(
    "[ARC-002] keeps amount validation, state transitions, and idempotency out of model discretion"
  );

  it.todo("[INT-001] returns one allowed typed intent and action for every agent decision");
  it.todo(
    "[INT-002] persists a proposal with event, user, suggestion, mode, time, and state identity"
  );
  it.todo("[INT-004] makes a real-transfer MVP proposal impossible at the runtime boundary");

  it.todo("[STA-001] rejects every proposal state transition absent from the transition table");
  it.todo("[STA-003] preserves terminal proposals instead of reopening them");

  it.todo("[IDM-002] returns the committed result when a client retries after a lost response");
  it.todo("[IDM-003] never reports a failed ledger write as recorded");
  it.todo("[IDM-004] enforces approved-action uniqueness in the durable adapter");

  it.todo("[COR-001] prevents updates and deletes of immutable financial history");
  it.todo("[COR-002] applies newly learned evidence only to future suggestions");
  it.todo("[COR-003] appends a linked record when correcting a recorded amount");
  it.todo("[COR-004] retains original and corrective records in the audit view");
  it.todo("[COR-005] calculates effective totals without erasing corrected history");

  it.todo("[ERR-003] reports that recording did not complete when its tool fails");
  it.todo("[ERR-004] gives one blame-free, retry-safe next step after failure");

  it.todo("[AUD-004] attributes each mutation to its user, proposal, action, and timestamp");
  it.todo("[AUD-005] explains concise evidence without exposing hidden reasoning");
});
