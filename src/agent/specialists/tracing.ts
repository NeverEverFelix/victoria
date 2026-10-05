export type SpecialistRole = "financial_moment" | "savings_reasoning" | "companion_voice";

export type SpecialistHandoffStatus =
  | "succeeded"
  | "failed"
  | "timed_out"
  | "invalid_output"
  | "disagreement";

export interface SpecialistHandoffTrace {
  readonly schemaVersion: 1;
  readonly correlationId: string;
  readonly role: SpecialistRole;
  readonly status: SpecialistHandoffStatus;
  readonly startedAt: string;
  readonly completedAt: string;
  readonly durationMs: number;
}

export interface SpecialistTraceSink {
  /** Must remain a bounded, synchronous metadata write and must not affect the user response. */
  record(trace: SpecialistHandoffTrace): void;
}

export class InMemorySpecialistTraceSink implements SpecialistTraceSink {
  private readonly traces: SpecialistHandoffTrace[] = [];

  constructor(private readonly capacity = 1000) {
    if (!Number.isSafeInteger(capacity) || capacity < 1) {
      throw new Error("Specialist trace capacity must be a positive safe integer.");
    }
  }

  record(trace: SpecialistHandoffTrace): void {
    this.traces.push({ ...trace });
    if (this.traces.length > this.capacity) {
      this.traces.splice(0, this.traces.length - this.capacity);
    }
  }

  list(): SpecialistHandoffTrace[] {
    return this.traces.map((trace) => ({ ...trace }));
  }
}

export function recordTraceSafely(
  sink: SpecialistTraceSink | undefined,
  trace: SpecialistHandoffTrace
): void {
  if (!sink) return;
  try {
    sink.record(trace);
  } catch {
    // Diagnostics must never alter specialist or user-visible behavior.
  }
}

export function createSpecialistTrace(
  fields: Omit<SpecialistHandoffTrace, "schemaVersion">
): SpecialistHandoffTrace {
  return { schemaVersion: 1, ...fields };
}
