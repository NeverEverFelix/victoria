export type MemoryControlIntent =
  | { readonly type: "review" }
  | { readonly type: "forget_all" }
  | { readonly type: "forget_one"; readonly target: string }
  | { readonly type: "pause" }
  | { readonly type: "resume" };

/** Recognizes explicit memory-management requests; ordinary corrections stay on the existing learning path. */
export function parseMemoryControlIntent(message: string): MemoryControlIntent | null {
  const text = message.trim().toLocaleLowerCase("en-US");
  if (/\b(?:pause|stop)\s+(?:remembering|memory|saving memories|memory saving)\b|\bdon't remember anything(?: about me)?\b/.test(text)) return { type: "pause" };
  if (/\b(?:resume|start)\s+(?:remembering|memory|saving memories|memory saving)\b|\byou can remember again\b/.test(text)) return { type: "resume" };
  if (/\bforget\s+(?:everything|all)(?:\s+(?:you|that)\s+remember(?:\s+about\s+me)?)?\b|\bforget all my memories\b/.test(text)) return { type: "forget_all" };
  if (/\b(?:what|which)\s+(?:do you|have you)\s+remember(?:ed|\s+about me)?\b|\bshow me (?:what|my) memories\b|\breview (?:my )?memories\b/.test(text)) return { type: "review" };
  const forget = /\bforget\s+(?:that\s+)?(?:you\s+remember(?:ed)?\s+)?(?:about\s+me\s+)?(.+?)[.!?]*$/i.exec(message.trim());
  if (forget?.[1] && !/^(?:everything|all|all my memories)$/i.test(forget[1].trim())) {
    const target = forget[1].trim().replace(/^(?:i said|i told you)\s+/i, "");
    if (target.length >= 2) return { type: "forget_one", target };
  }
  return null;
}
