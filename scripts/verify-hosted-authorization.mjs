const required = [
  "VICTORIA_STAGING_URL",
  "VICTORIA_STAGING_CONFIRM",
  "VICTORIA_STAGING_USER_A_TOKEN",
  "VICTORIA_STAGING_USER_B_TOKEN",
  "SUPABASE_URL",
  "SUPABASE_PUBLISHABLE_KEY",
  "CRON_SECRET"
];

if (process.env.CI || process.env.GITHUB_ACTIONS) {
  throw new Error("Hosted authorization smoke checks must be run manually against the intended staging project.");
}

for (const name of required) {
  if (!process.env[name]?.trim()) throw new Error(`Missing required environment variable: ${name}`);
}
if (process.env.VICTORIA_STAGING_CONFIRM !== "I_CONFIRM_STAGING") {
  throw new Error("Set VICTORIA_STAGING_CONFIRM=I_CONFIRM_STAGING to run against staging.");
}
if (process.env.VICTORIA_STAGING_USER_A_TOKEN === process.env.VICTORIA_STAGING_USER_B_TOKEN) {
  throw new Error("Two distinct staging-user access tokens are required.");
}

const base = new URL(process.env.VICTORIA_STAGING_URL);
if (base.protocol !== "https:") throw new Error("VICTORIA_STAGING_URL must use HTTPS.");
const supabase = new URL(process.env.SUPABASE_URL);
if (supabase.protocol !== "https:") throw new Error("SUPABASE_URL must use HTTPS.");

async function request(url, token, init = {}) {
  return fetch(new URL(url, base), {
    ...init,
    headers: {
      ...(init.body ? { "content-type": "application/json" } : {}),
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...init.headers
    },
    redirect: "error",
    cache: "no-store"
  });
}

async function verifiedSubject(token) {
  const response = await fetch(new URL("/auth/v1/user", supabase), {
    headers: {
      apikey: process.env.SUPABASE_PUBLISHABLE_KEY,
      authorization: `Bearer ${token}`
    },
    redirect: "error",
    cache: "no-store"
  });
  if (!response.ok) throw new Error(`Supabase token verification failed (${response.status}).`);
  const body = await response.json();
  if (typeof body.id !== "string" || !body.id) throw new Error("Supabase returned no verified subject.");
  return body.id;
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
  console.log(`PASS ${message}`);
}

const [userA, userB] = await Promise.all([
  verifiedSubject(process.env.VICTORIA_STAGING_USER_A_TOKEN),
  verifiedSubject(process.env.VICTORIA_STAGING_USER_B_TOKEN)
]);
assert(userA !== userB, "the test tokens belong to two distinct Supabase users");

const conversationId = `authz-smoke-${crypto.randomUUID()}`;
const chatPath = `/api/victoria/${conversationId}`;
const finishPath = `/api/victoria/${conversationId}/finish`;
console.log(`Synthetic conversation ID: ${conversationId}`);

const anonymous = await request(chatPath, null, {
  method: "POST",
  body: JSON.stringify({ message: "I skipped a $2.37 snack." })
});
assert(anonymous.status === 401, "chat rejects an unauthenticated request");
const anonymousMemoryList = await request("/api/memories", null);
assert(anonymousMemoryList.status === 401, "memory controls reject an unauthenticated request");
const anonymousFinish = await request(finishPath, null, { method: "POST" });
assert(anonymousFinish.status === 401, "conversation finish rejects an unauthenticated request");

const forgedIdentity = await request(chatPath, process.env.VICTORIA_STAGING_USER_A_TOKEN, {
  method: "POST",
  body: JSON.stringify({ userId: userB, message: "hello" })
});
assert(forgedIdentity.status === 400, "chat rejects caller-supplied identity fields");

const proposal = await request(chatPath, process.env.VICTORIA_STAGING_USER_A_TOKEN, {
  method: "POST",
  body: JSON.stringify({ message: "I almost bought a $2.37 snack but decided to skip it." })
});
assert(proposal.status === 200, `user A can use their own chat (HTTP ${proposal.status})`);
const proposalBody = await proposal.json();
assert(proposalBody.decision?.action === "suggest_savings", "user A receives a pending savings suggestion");

const memoryConversationId = `memory-smoke-${crypto.randomUUID()}`;
const memoryChatPath = `/api/victoria/${memoryConversationId}`;
const learnedPreference = await request(memoryChatPath, process.env.VICTORIA_STAGING_USER_A_TOKEN, {
  method: "POST",
  body: JSON.stringify({ message: "I prefer saving $20 rather than $50 at a time." })
});
assert(learnedPreference.status === 200, `user A can save a direct preference (HTTP ${learnedPreference.status})`);

const laterConversationId = `memory-recall-smoke-${crypto.randomUUID()}`;
const laterReflection = await request(`/api/victoria/${laterConversationId}`, process.env.VICTORIA_STAGING_USER_A_TOKEN, {
  method: "POST",
  body: JSON.stringify({ message: "I'm trying to make saving feel manageable and consistent." })
});
assert(laterReflection.status === 200, `user A can start a second conversation (HTTP ${laterReflection.status})`);
const laterReflectionBody = await laterReflection.json();
assert(laterReflectionBody.decision?.action === "reflect" &&
  /\$20/.test(laterReflectionBody.message ?? "") && /\$50/.test(laterReflectionBody.message ?? ""),
  "a preference learned in one conversation shapes a later conversation for the same user");

const crossOwnerApproval = await request(chatPath, process.env.VICTORIA_STAGING_USER_B_TOKEN, {
  method: "POST",
  body: JSON.stringify({ message: "yes" })
});
assert(crossOwnerApproval.status === 200, `user B's isolated chat request completes (HTTP ${crossOwnerApproval.status})`);
const crossOwnerBody = await crossOwnerApproval.json();
assert(crossOwnerBody.decision?.action !== "record_savings", "user B cannot approve user A's pending savings action");
assert(!/recorded|saved to your victoria savings ledger/i.test(crossOwnerBody.message ?? ""),
  "user B receives no success response for user A's action");

const finishOtherUsersConversation = await request(finishPath, process.env.VICTORIA_STAGING_USER_B_TOKEN, { method: "POST" });
assert(finishOtherUsersConversation.status === 200, `user B can finish only their own view (HTTP ${finishOtherUsersConversation.status})`);
assert((await finishOtherUsersConversation.json()).saved === false,
  "user B cannot summarize user A's conversation context");

const [memoriesA, memoriesB] = await Promise.all([
  request("/api/memories?limit=100", process.env.VICTORIA_STAGING_USER_A_TOKEN),
  request("/api/memories?limit=100", process.env.VICTORIA_STAGING_USER_B_TOKEN)
]);
assert(memoriesA.status === 200, `user A can list their memories (HTTP ${memoriesA.status})`);
assert(memoriesB.status === 200, `user B can list their memories (HTTP ${memoriesB.status})`);
const [bodyA, bodyB] = await Promise.all([memoriesA.json(), memoriesB.json()]);
const idsA = new Set((bodyA.memories ?? []).map((memory) => memory.id));
const idsB = new Set((bodyB.memories ?? []).map((memory) => memory.id));
assert([...idsA].every((id) => !idsB.has(id)), "memory listing does not cross user boundaries");

const learnedMemory = (bodyA.memories ?? []).find((memory) =>
  memory.key === "savings_contribution_amount" && /\$20 rather than \$50/.test(memory.value ?? ""));
assert(Boolean(learnedMemory), "user A can list the preference learned through chat");

const foreignMemoryId = learnedMemory.id;
const foreignCorrection = await request("/api/memories", process.env.VICTORIA_STAGING_USER_B_TOKEN, {
  method: "PATCH",
  body: JSON.stringify({ memoryId: foreignMemoryId, value: "Unauthorized smoke-test correction." })
});
assert(foreignCorrection.status === 404, "user B cannot correct user A's memory");
const foreignForget = await request(`/api/memories/${encodeURIComponent(foreignMemoryId)}/forget`,
  process.env.VICTORIA_STAGING_USER_B_TOKEN, { method: "POST" });
assert(foreignForget.status === 404, "user B cannot forget user A's memory");

const correctedMemoryResponse = await request("/api/memories", process.env.VICTORIA_STAGING_USER_A_TOKEN, {
  method: "PATCH",
  body: JSON.stringify({
    memoryId: learnedMemory.id,
    value: "Prefers setting aside $15 rather than $40 at a time."
  })
});
assert(correctedMemoryResponse.status === 200, `user A can correct their memory (HTTP ${correctedMemoryResponse.status})`);
const correctedMemoryBody = await correctedMemoryResponse.json();
const correctedMemory = correctedMemoryBody.memory;
assert(correctedMemory?.id && correctedMemory.id !== learnedMemory.id &&
  /\$15 rather than \$40/.test(correctedMemory.value ?? ""),
  "correction appends a linked memory with the new value");

const forgetResponse = await request(`/api/memories/${encodeURIComponent(correctedMemory.id)}/forget`,
  process.env.VICTORIA_STAGING_USER_A_TOKEN, { method: "POST" });
assert(forgetResponse.status === 200, `user A can forget their corrected memory (HTTP ${forgetResponse.status})`);
const listedAfterForget = await request("/api/memories?limit=100", process.env.VICTORIA_STAGING_USER_A_TOKEN);
assert(listedAfterForget.status === 200, `user A can relist memories after forgetting (HTTP ${listedAfterForget.status})`);
const afterForgetBody = await listedAfterForget.json();
assert(!(afterForgetBody.memories ?? []).some((memory) => memory.key === "savings_contribution_amount" &&
  /\$15 rather than \$40/.test(memory.value ?? "")),
  "forgotten memory is suppressed from listing immediately");

const declined = await request(chatPath, process.env.VICTORIA_STAGING_USER_A_TOKEN, {
  method: "POST",
  body: JSON.stringify({ message: "no" })
});
assert(declined.status === 200, `user A can close their own pending suggestion (HTTP ${declined.status})`);
assert(!/recorded|saved to your victoria savings ledger/i.test((await declined.json()).message ?? ""),
  "declining the staging smoke proposal does not create a savings entry");

const retentionPath = "/api/cron/memory-retention";
const unauthorizedRetention = await request(retentionPath, null);
assert(unauthorizedRetention.status === 401, "retention rejects requests without the cron secret");
const retention = await fetch(new URL(retentionPath, base), {
  headers: { authorization: `Bearer ${process.env.CRON_SECRET}` },
  redirect: "error",
  cache: "no-store"
});
assert(retention.status === 200, `authorized retention run succeeds (HTTP ${retention.status})`);
const retentionBody = await retention.json();
assert(retentionBody.status === "succeeded" && Number.isInteger(retentionBody.runId),
  "retention reports an audited successful run");

console.log("Hosted authorization, memory, and retention smoke checks completed. The synthetic user A proposal was declined.");
