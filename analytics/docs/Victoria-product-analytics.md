# Victoria Product Analytics

## 1. Purpose

Victoria's product analytics system exists to answer one primary question:

> **Do people continue using Victoria after the novelty wears off?**

The analytics implementation should not optimize for vanity metrics such as app opens, raw sessions, page views, or signup volume in isolation.

The system should help Victoria determine:

- Whether users repeatedly experience meaningful value.
- Which early behaviors predict long-term retention.
- Which product features increase or reduce retention.
- Whether Victoria causes real financial behavior change.
- Whether users return proactively or only because Victoria prompts them.
- Whether churn is caused by lack of product value, product friction, technical failure, or poor AI performance.
- Which user behaviors should shape onboarding, product priorities, and experimentation.

The primary philosophy is:

> **Usage is not the same as value, and value is not the same as habit.**

---

## 2. Core Analytics Principle

Victoria should be instrumented around the user's product journey:

```text
Exposure
  ↓
Intent
  ↓
Value
  ↓
Repeat Value
  ↓
Habit
  ↓
Durable Retention
```

Every metric, dashboard, event, and experiment should support understanding one or more stages of this journey.

Analytics should prioritize behavioral evidence over vanity metrics.

The most important long-term product question is:

> **What do retained Victoria users repeatedly do that churned users stop doing?**

---

## 3. Victoria Core Product Loop

Victoria's core loop should be treated as the foundation of product analytics.

Initial working definition:

```text
User recognizes or encounters a spending decision
    ↓
Victoria helps identify, record, or verify the avoided spend
    ↓
Victoria explains the financial impact
    ↓
Victoria recommends or facilitates a savings action
    ↓
User acts on the recommendation
    ↓
User returns and repeats the behavior
```

Example:

```text
User avoids DoorDash
    ↓
Logs or verifies the avoided $27.46 spend
    ↓
Victoria calculates the financial impact
    ↓
Victoria recommends moving the money to savings
    ↓
User accepts or performs the transfer
    ↓
User repeats this behavior later
```

The implementation should make it possible to determine where users succeed, fail, abandon, or repeat this loop.

---

## 4. Required Product Definitions

Before production analytics are considered complete, Victoria must explicitly define the following concepts.

### 4.1 User

A unique Victoria account.

Requirements:

- Users must have a durable internal `user_id`.
- Analytics providers should use Victoria's internal user identifier rather than email as the primary analytics identity.
- Anonymous activity may be tracked prior to account creation, but identities should be merged after signup where supported.

---

### 4.2 Session

A continuous period of Victoria interaction.

Sessions are useful for understanding behavior but should not be treated as Victoria's core success metric.

---

### 4.3 Active User

A user who performs at least one meaningful product action during a defined time period.

A simple `app_opened` event should not qualify a user as meaningfully active.

---

### 4.4 Activated User

A user who has experienced Victoria's core product value for the first time.

The exact activation definition should remain testable and may evolve as product data accumulates.

Potential activation candidates include:

```text
first avoided spend logged
```

or:

```text
avoided spend logged
+
financial insight viewed
```

or:

```text
avoided spend logged
+
savings action accepted
```

or:

```text
two or more avoided spends logged within 7 days
```

Victoria should determine empirically which activation behavior most strongly predicts W4, W8, and W12 retention.

---

### 4.5 Retained User

A user who returns and performs another meaningful Victoria value action during a defined retention window.

Retention should not be defined solely as opening the app.

---

### 4.6 Churned User

A previously activated or active user who does not perform another meaningful value action within the chosen churn window.

The exact churn window may evolve based on Victoria's natural usage frequency.

---

### 4.7 Victoria Value Event

A product action demonstrating that the user received or acted on meaningful financial value.

Examples:

- Avoided spend logged.
- Avoided spend verified.
- Financial insight consumed.
- Savings recommendation generated.
- Savings recommendation accepted.
- Money transferred.
- Goal progress meaningfully updated.
- Weekly financial review completed.

---

## 5. Analytics Event Hierarchy

Victoria events should be grouped conceptually into four categories.

---

### 5.1 Level 1 — Exposure Events

These events indicate that the user encountered Victoria but do not demonstrate product value.

Recommended events:

```text
app_opened
signup_started
signup_completed
onboarding_started
onboarding_completed
```

Use these primarily for acquisition, funnel, and onboarding analysis.

Do not use exposure events as Victoria's primary retention definition.

---

### 5.2 Level 2 — Intent Events

These indicate that a user is attempting to receive value.

Recommended examples:

```text
chat_started
spending_event_started
transaction_lookup_started
savings_goal_created
account_connection_started
```

Intent metrics help answer:

> Is the user trying to use the product?

---

### 5.3 Level 3 — Value Events

These indicate that Victoria delivered or facilitated meaningful value.

Recommended examples:

```text
avoided_spend_logged
avoided_spend_verified
saving_recommendation_generated
saving_action_accepted
money_transferred
financial_insight_viewed
goal_progress_updated
weekly_review_completed
```

Value events should form the basis of activation and meaningful product activity.

---

### 5.4 Level 4 — Habit and Repeat-Value Signals

Habit events may either be emitted explicitly or calculated as derived analytics cohorts and metrics.

Examples:

```text
second_avoided_spend_logged
third_avoided_spend_logged
second_week_active
weekly_review_returned
repeat_transfer_completed
proactive_victoria_session
insight_action_taken
```

Whenever practical, prefer deriving aggregate milestone behavior from atomic events rather than emitting unnecessary duplicate events.

For example:

```text
avoided_spend_logged count >= 3
```

may be preferable to emitting:

```text
third_avoided_spend_logged
```

unless the milestone itself triggers application behavior.

---

## 6. Event Naming Standards

All analytics events must follow consistent naming.

### Required format

Use:

```text
snake_case
```

Prefer:

```text
noun_or_object + action
```

Examples:

```text
avoided_spend_logged
account_connection_started
account_connection_completed
saving_action_accepted
money_transferred
financial_insight_viewed
```

Avoid vague events such as:

```text
button_clicked
action_done
page_used
thing_completed
```

Event names should communicate business meaning without requiring UI context.

---

## 7. Canonical Event Schema

Victoria should expose a single internal analytics abstraction.

Application code should not call PostHog, Amplitude, Mixpanel, or another vendor directly throughout the codebase.

Recommended interface:

```ts
analytics.track(...)
analytics.identify(...)
analytics.setUserProperties(...)
analytics.reset(...)
```

Example:

```ts
analytics.track("avoided_spend_logged", {
  event_id,
  amount: 27.46,
  category: "food_delivery",
  merchant: "doordash",
  input_method: "chat",
  verification_method: "email_receipt",
  suggested_action: "transfer_to_savings"
})
```

The analytics abstraction should automatically append global context such as:

```text
user_id
session_id
platform
environment
app_version
device
experiment_ids
timestamp
```

Architecture:

```text
Victoria Web
    ↓
Analytics abstraction
    ↓
Analytics provider

Victoria iOS
    ↓
Analytics abstraction
    ↓
Analytics provider
```

The semantic meaning of events must remain consistent across platforms.

---

## 8. Required Global Event Properties

The following properties should be automatically attached when relevant.

### 8.1 Identity

```text
user_id
anonymous_id
session_id
```

---

### 8.2 Application Context

```text
platform
app_version
environment
device_type
operating_system
```

Recommended `platform` values:

```text
web
ios
```

Recommended `environment` values:

```text
development
test
staging
production
```

Production dashboards must filter to:

```text
environment = production
```

Development activity must never pollute production product metrics.

---

### 8.3 Acquisition Context

When available:

```text
acquisition_source
acquisition_campaign
referrer
landing_page
```

---

### 8.4 Experiment Context

When applicable:

```text
experiment_id
experiment_variant
feature_flag
```

---

## 9. User Properties

Recommended user-level properties include:

```text
signup_date
activation_date
acquisition_source
onboarding_variant
subscription_plan
has_connected_bank
has_connected_email
has_savings_goal
has_completed_transfer
total_avoided_spend
lifetime_transfer_amount
last_meaningful_activity_at
```

User properties should describe relatively stable user state.

Do not misuse user properties for individual event details.

---

## 10. Activation Methodology

Victoria should treat activation as a hypothesis, not a permanent assumption.

Initially, instrument enough events to compare multiple activation candidates.

Possible candidates:

### Candidate A

```text
first avoided_spend_logged
```

### Candidate B

```text
avoided_spend_logged
+
financial_insight_viewed
```

### Candidate C

```text
avoided_spend_logged
+
saving_action_accepted
```

### Candidate D

```text
avoided_spend_logged
+
money_transferred
```

### Candidate E

```text
2+ avoided_spend_logged events within 7 days
```

The final activation definition should be selected based on its relationship to longer-term retention.

Primary evaluation metric:

```text
activation behavior
    ↓
W4 retention
W8 retention
W12 retention
```

The preferred activation event is the earliest behavior that reliably predicts durable usage.

---

## 11. Retention Methodology

Victoria must not use raw app opens as its primary retention metric.

Retention should answer:

> Did the user return and receive or create meaningful value again?

---

### 11.1 Product Retention

A user performs any meaningful Victoria action again.

Example definition:

```text
avoided_spend_logged
OR
financial_insight_viewed
OR
saving_action_accepted
OR
weekly_review_completed
```

---

### 11.2 Core-Loop Retention

A user repeats Victoria's primary behavior.

Initial candidate:

```text
avoided_spend_logged
```

---

### 11.3 Financial-Action Retention

A user repeatedly performs a real financial action attributable to Victoria.

Example:

```text
money_transferred
```

---

### 11.4 Retention Windows

Victoria should support:

```text
D1
D3
D7
D14
D30
W1
W2
W4
W8
W12
```

Weekly retention should likely receive more product weight than daily retention because Victoria may not naturally require daily use.

The natural usage frequency should be determined empirically.

---

## 12. Proactive Return / Organic Retention

Victoria should distinguish between users who return because Victoria prompted them and users who return on their own.

Every meaningful session or entry event should include:

```text
entry_source
```

Recommended values:

```text
direct
push_notification
email
deep_link
widget
shared_link
unknown
```

Key metric:

> **What percentage of retained users return without being prompted by Victoria?**

This should be tracked at:

```text
W1
W4
W8
W12
```

A proactive return is potentially one of Victoria's strongest signals of product habit.

Interpretation:

```text
Prompted return
=
Victoria reminded user → user returned

Proactive return
=
User independently thought of Victoria → user returned
```

The second behavior indicates stronger mental adoption.

---

## 13. Core Behavioral Cohorts

Victoria should create behavioral cohorts early.

Recommended initial cohorts:

### Activated Immediately

```text
avoided_spend_logged within 24 hours of signup
```

### High Intent

```text
>= 3 avoided_spend_logged events during week 1
```

### Financial Action Users

```text
money_transferred during week 1
```

### Insight-Only Users

```text
financial_insight_viewed
AND
no money_transferred
```

### Connected Account Users

```text
bank or email account connected
```

### Manual Users

```text
avoided spend entered manually
```

### Agent-Powered Users

```text
Victoria automatically discovered, enriched, or verified user financial activity
```

For each cohort, compare:

```text
activation rate
W1 retention
W4 retention
W8 retention
W12 retention
meaningful actions per user
financial actions per user
```

The goal is to identify which behaviors create durable retention.

---

## 14. Required Funnels

Victoria should instrument the following funnels.

---

### 14.1 Acquisition Funnel

```text
landing_page_viewed
    ↓
signup_started
    ↓
signup_completed
    ↓
onboarding_completed
    ↓
activation
```

---

### 14.2 Avoided-Spend Core Loop

```text
spending_event_started
    ↓
avoided_spend_logged
    ↓
avoided_spend_verified
    ↓
saving_recommendation_generated
    ↓
saving_action_accepted
    ↓
money_transferred
```

The exact steps may evolve, but every major step should remain observable.

---

### 14.3 Account Connection Funnel

```text
account_connection_started
    ↓
account_authorization_started
    ↓
account_connection_completed
    ↓
first_useful_data_received
```

Failures should be separately instrumented.

---

### 14.4 Agent Funnel

```text
chat_started
    ↓
intent_understood
    ↓
tool_invocation_started
    ↓
tool_invocation_succeeded
    ↓
recommendation_generated
    ↓
user_action_accepted
```

---

## 15. Friction and Failure Analytics

Victoria must track failures as first-class analytics events.

Recommended events:

```text
agent_response_failed
agent_tool_failed
transaction_detection_failed
verification_failed
account_connection_failed
transfer_failed
user_corrected_victoria
recommendation_rejected
action_cancelled
```

Recommended failure properties:

```text
failure_reason
error_code
provider
latency_ms
retry_count
tool_name
model
model_version
```

Victoria analytics must help distinguish:

```text
User does not want the feature
```

from:

```text
User wants the feature, but Victoria failed to deliver it
```

These should never be treated as the same product outcome.

---

## 16. AI and Agent Analytics

Because Victoria is agentic, standard SaaS analytics are insufficient.

Victoria should instrument AI-specific quality, reliability, cost, and user behavior.

Recommended metrics:

```text
agent_sessions_per_user
agent_turns_per_session
intent_category
intent_understanding_rate
tool_invocation_rate
tool_success_rate
tool_failure_rate
user_correction_rate
recommendation_acceptance_rate
recommendation_rejection_rate
agent_latency
agent_cost_per_session
agent_cost_per_active_user
agent_cost_per_retained_user
agent_cost_per_successful_financial_action
model_usage_distribution
```

Relevant event properties:

```text
model
model_version
agent_version
prompt_version
intent_category
tool_name
tool_result
latency_ms
estimated_cost
```

AI changes should ultimately be evaluated against product outcomes.

For example:

```text
new model
    ↓
better tool success
    ↓
higher savings-action acceptance
    ↓
higher W4 retention
```

Benchmark improvements alone should not define product success.

---

## 17. Required Dashboards

Victoria should initially maintain four primary dashboards.

Do not create excessive dashboards before the underlying questions are useful.

---

### 17.1 Product Health Dashboard

Answers:

> Is Victoria being used meaningfully?

Recommended metrics:

```text
new users
activated users
weekly active users
meaningful active users
meaningful actions per active user
avoided spends logged
financial actions completed
weekly reviews completed
```

---

### 17.2 Activation Dashboard

Answers:

> Are users reaching value quickly?

Recommended metrics:

```text
signup → activation conversion
time to first avoided spend
time to first value event
time to first financial action
activation rate by acquisition source
activation rate by onboarding variant
activation rate by account connection status
```

---

### 17.3 Durable Retention Dashboard

This should be Victoria's primary founder dashboard.

Answers:

> Do people continue using Victoria after the novelty wears off?

Required metrics:

```text
weekly new users
weekly activated users
activation rate

W1 retention
W2 retention
W4 retention
W8 retention
W12 retention

retention curve
weekly active users
meaningful actions per user per week
avoided spends per user per week
percentage of users making real financial actions
median dollars acted upon per user
percentage of users returning proactively
percentage of users returning due to prompts
```

This dashboard should support cohort segmentation.

---

### 17.4 Core Loop Dashboard

Answers:

> Which behaviors predict durable retention?

Recommended breakdowns:

```text
retention by avoided-spend count
retention by first-week activity
retention by account connection
retention by money transfer
retention by weekly review completion
retention by agent usage
retention by proactive return
retention by acquisition source
```

Example desired insight:

```text
Users who log >= 2 avoided spends
and complete >= 1 real savings action
during week 1

→ significantly higher W8 retention
```

This type of relationship should directly influence onboarding and product prioritization.

---

## 18. Qualitative Analytics

Quantitative analytics explain what happened.

Victoria must also collect enough qualitative data to understand why.

Recommended capabilities:

```text
session replay
user feedback
lightweight surveys
churn feedback
"Was this useful?" feedback
free-text feedback
beta user interviews
```

Useful qualitative questions include:

> What would you miss most if Victoria disappeared tomorrow?

> What brought you back to Victoria?

> What did you expect Victoria to do that it did not do?

> What feels tedious about using Victoria?

> When do you naturally think about opening Victoria?

Qualitative feedback should be connected to behavioral cohorts whenever practical.

---

## 19. Experimentation Standards

Victoria's analytics infrastructure should support experimentation from the beginning, even if experiments are not immediately active.

Every relevant event should be able to include:

```text
experiment_id
experiment_variant
```

Potential experiments:

```text
onboarding flows
notification strategies
Victoria personality
savings prompts
weekly review formats
auto-detection behavior
financial insights
transfer prompts
agent behavior
agent model selection
```

Experiments should define:

### Primary metric

The direct outcome the experiment is intended to improve.

### Guardrail metrics

Metrics that must not materially degrade.

Examples:

```text
failure rate
user correction rate
latency
unsubscribe rate
financial-action cancellation rate
```

### Long-term validation

Important experiments should eventually be validated against:

```text
W4 retention
W8 retention
W12 retention
```

Victoria should avoid optimizing exclusively for clicks when the actual objective is durable financial behavior.

---

## 20. Analytics Documentation in the Repository

Recommended structure:

```text
/docs/analytics/
    README.md
    events.md
    metrics.md
    dashboards.md
    experiments.md
```

This file may initially serve as the source-of-truth analytics standard.

Eventually:

### `events.md`

Documents all canonical events.

Example:

```md
## avoided_spend_logged

Meaning:
User successfully records money they intentionally did not spend.

Triggered:
Only after the avoided-spend record has successfully persisted.

Required properties:
- amount
- category
- input_method

Optional properties:
- merchant
- verification_method
- suggested_action

Retention relevance:
HIGH

Owner:
Core Product
```

---

### `metrics.md`

Documents canonical metric definitions.

Example:

```md
## W4 Core-Loop Retention

Definition:
Percentage of activated users who perform at least one avoided_spend_logged event during week 4 after activation.

Population:
Production users only.

Exclusions:
Internal users, test accounts, deleted users.
```

---

### `dashboards.md`

Documents:

- Dashboard purpose.
- Metrics displayed.
- Filters.
- Cohorts.
- Owners.
- Interpretation guidance.

---

### `experiments.md`

Documents:

- Experiment hypothesis.
- Variants.
- Primary metric.
- Guardrails.
- Target cohort.
- Start and end dates.
- Results.
- Decision.

---

## 21. Analytics Implementation Standards

### 21.1 Analytics Must Be Centralized

Do not directly import analytics vendors throughout application business logic.

Use a Victoria-owned analytics module.

---

### 21.2 Business Events Over UI Events

Prefer:

```text
avoided_spend_logged
```

over:

```text
save_button_clicked
```

UI events may be added for debugging specific funnels but should not replace business events.

---

### 21.3 Track Successful State Changes

For important actions, emit success events only after the underlying action succeeds.

Example:

```text
avoided_spend_logged
```

should be emitted after successful persistence, not simply after the user clicks submit.

Failures should emit separate failure events.

---

### 21.4 Avoid Duplicate Semantics

One product action should have one canonical event name.

Do not create:

```text
spend_saved
avoided_spend_saved
saving_logged
spend_logged
```

for the same behavior.

---

### 21.5 Analytics Should Be Typed

Where possible, analytics events and properties should use TypeScript types.

Example:

```ts
type AnalyticsEvents = {
  avoided_spend_logged: {
    amount: number
    category: string
    merchant?: string
    input_method: "chat" | "manual" | "automatic"
    verification_method?: string
  }
}
```

This reduces event drift and developer errors.

---

### 21.6 Analytics Changes Require Documentation

Adding or modifying a canonical event requires updating the analytics documentation.

Agentic coding workflows should treat analytics specifications as part of the feature definition.

---

### 21.7 Analytics Must Be Testable

Critical event instrumentation should be covered by automated tests where practical.

Tests should confirm:

- Event emitted after correct business condition.
- Required properties are included.
- Failure event emitted when operation fails.
- Events are not double-fired.
- Development/test activity does not pollute production analytics.

---

## 22. Internal and Test User Exclusion

Victoria must support filtering internal users and test accounts.

Recommended user property:

```text
is_internal_user
```

Production dashboards should exclude:

```text
is_internal_user = true
```

Automated test accounts should also be identifiable.

Recommended:

```text
account_type = test
```

This is required to prevent founder, developer, and automated activity from distorting early-stage metrics.

---

## 23. Privacy and Financial Data Standards

Victoria deals with sensitive financial behavior.

Analytics should follow data-minimization principles.

Do not send unnecessary sensitive financial information to analytics providers.

Avoid storing:

- Bank account numbers.
- Routing numbers.
- Authentication tokens.
- Full financial transaction descriptions where unnecessary.
- Private email content.
- Credentials.
- Raw model context containing sensitive user data.

Prefer analytics-friendly abstractions:

```text
category = "food_delivery"
amount_bucket = "20_50"
verification_method = "email_receipt"
```

when exact detail is not required.

Exact dollar values may be appropriate for certain aggregate product metrics, but their use should be intentional and reviewed.

---

## 24. Recommended Analytics Architecture

Initial recommendation:

```text
Victoria Next.js
    ↓
Victoria analytics abstraction
    ↓
PostHog

Future Victoria iOS
    ↓
Victoria analytics abstraction
    ↓
PostHog
```

The architecture should allow the provider to change without rewriting application business logic.

Potential provider responsibilities:

```text
product analytics
funnels
retention
cohorts
session replay
feature flags
experiments
surveys
```

Victoria-owned code remains responsible for defining the product meaning of events.

---

## 25. Recommended Initial Analytics Delivery Scope

The first analytics implementation does not need every event described in this document.

The minimum useful analytics foundation should include:

### Infrastructure

- [ ] Central analytics abstraction.
- [ ] PostHog or equivalent provider configured.
- [ ] Separate development, staging, and production handling.
- [ ] User identification.
- [ ] Internal/test user filtering.
- [ ] Shared global properties.
- [ ] Typed events.

### Initial events

- [ ] `signup_completed`
- [ ] `onboarding_completed`
- [ ] `chat_started`
- [ ] `avoided_spend_logged`
- [ ] `avoided_spend_verified`
- [ ] `saving_recommendation_generated`
- [ ] `saving_action_accepted`
- [ ] `money_transferred`
- [ ] `financial_insight_viewed`
- [ ] `weekly_review_completed`
- [ ] Major failure events

### Initial properties

- [ ] `user_id`
- [ ] `session_id`
- [ ] `platform`
- [ ] `environment`
- [ ] `app_version`
- [ ] `entry_source`
- [ ] `input_method`
- [ ] `verification_method`
- [ ] Relevant experiment metadata

### Initial analytics views

- [ ] Activation funnel.
- [ ] Core-loop funnel.
- [ ] W1/W4/W8 retention.
- [ ] Retention by first-week behavior.
- [ ] Proactive vs prompted return.
- [ ] Meaningful actions per active user.

This should be enough to learn meaningfully without over-instrumenting the product.

---

## 26. Victoria Metric Tree

Victoria's analytics system should conceptually map to:

```text
                         DURABLE RETENTION
                                │
                  ┌─────────────┴─────────────┐
                  │                           │
              ACTIVATION                 REPEAT VALUE
                  │                           │
          ┌───────┴────────┐          ┌───────┴────────┐
          │                │          │                │
    Avoided spend      Insight    Repeat avoided    Financial
     recognized       delivered      spending         action
          │                │             │                │
          └────────────────┴─────────────┴────────────────┘
                                   │
                            REAL USER VALUE
```

The purpose of product analytics is not merely to populate this tree.

It is to discover which branches actually cause durable retention.

---

## 27. Victoria's North-Star Analytics Questions

Every analytics initiative should ultimately help answer one or more of the following:

1. Do users come back after the novelty wears off?
2. How quickly do users experience Victoria's core value?
3. Which first-week behaviors predict W4, W8, and W12 retention?
4. What do retained users repeatedly do?
5. What do churned users fail to do?
6. Does Victoria cause actual financial behavior change?
7. Do users return proactively or only after prompting?
8. Which integrations materially improve retention?
9. Which AI capabilities improve product outcomes?
10. Which failures cause users to abandon Victoria?
11. Which onboarding behavior creates the strongest long-term users?
12. What should Victoria encourage every new user to accomplish?
13. How much financial value is Victoria generating per retained user?
14. Does increasing Victoria's intelligence increase retention?
15. Is Victoria becoming part of the user's natural financial workflow?

---

## 28. Decision Standard

Victoria analytics should support product decisions, not merely observation.

A useful analytics insight should produce a decision such as:

```text
Users who complete X during week 1 retain significantly better.
→ Make X a primary onboarding objective.
```

or:

```text
Users frequently begin Y but abandon after step Z.
→ Reduce friction at Z.
```

or:

```text
Feature A increases engagement but does not improve retention.
→ Do not prioritize Feature A solely because of usage volume.
```

or:

```text
Users who return proactively retain substantially longer.
→ Invest in making Victoria useful during real-world financial moments,
   not merely increasing notification volume.
```

The final standard is:

> **Analytics are successful when they make Victoria easier to improve.**

---

## 29. Guiding Product Standard

Victoria should resist the temptation to optimize for metrics that look impressive but do not demonstrate durable value.

The product should optimize toward:

```text
meaningful activation
    ↓
repeat value
    ↓
behavior change
    ↓
habit
    ↓
durable retention
```

The ultimate test remains:

> **Do people come back even after the novelty wears off?**

Everything in Victoria's analytics system should make that question easier to answer accurately.
