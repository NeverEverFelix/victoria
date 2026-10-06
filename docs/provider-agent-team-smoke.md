# Provider Agent Team Smoke Run

Use this guide to run one local turn through Victoria's provider-backed agent team. The turn uses mock memory and ledger tools, sends no approval, and must not create a ledger entry. Provider calls may incur charges.

## One-time local setup

From the repository root:

```bash
cp .env.example .env.local
$EDITOR .env.local
```

In `.env.local`, set these values:

```dotenv
APP_ENV=local
NODE_ENV=development
OPENAI_API_KEY=<your provider key>
OPENAI_MODEL=<a model available to your account>
OPENAI_AGENT_TEAM_ENABLED=true
MONEY_MOVEMENT_MODE=mock_ledger
```

Keep `.env.local` on your machine. Do not commit it or paste the key into chat. `OPENAI_FINANCIAL_MOMENT_ENABLED` can remain `false`; enabling the full agent team takes precedence.

## Run the live smoke

```bash
npm run agent:smoke:provider-team
```

The command loads `.env.local`, then makes up to three provider requests for a synthetic avoided-spend message. Its summary includes the selected model, called roles, core classification and action, response, and mock-ledger count. Confirm the ledger count is zero and that the response says recording requires user approval.

Common prerequisite error:

```text
Set a real OPENAI_API_KEY in ignored .env.local or the process environment.
```

Resolve it by adding a valid key to `.env.local`. The test also requires `APP_ENV=local`, `OPENAI_AGENT_TEAM_ENABLED=true`, a non-mock `OPENAI_MODEL`, and `MONEY_MOVEMENT_MODE=mock_ledger`.

## Related mock and safety checks

```bash
npm test
npm run check
```

These do not call the live provider. The smoke command is opt-in and is skipped by the ordinary test/check runs. Victoria's MVP only records mocked savings after confirmation; it does not move real money.

## Related docs

- [Environment setup and safety rules](environments.md)
- [Provider and multi-agent evaluation notes](../tests/evaluation/README.md)
- [Agent-team implementation](architecture/multi-agent-readiness.md)
