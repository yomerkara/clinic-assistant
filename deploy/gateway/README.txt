Santa LiteLLM gateway — local staged rollout

The image is pinned by digest in docker-compose.yml. Service is opt-in via the
ai-gateway profile and binds only 127.0.0.1:4001. The app reaches gateway:4000.
Provider credentials and a generated gateway master key are supplied via .env;
never put them in config.yaml. No additional database or Redis is required here.

This is deliberately a DB-less proxy. It does NOT enforce virtual-key budgets,
provide tenant isolation, or persist gateway spend. Existing application budget
checks and ModelUsage records remain authoritative. Calls made directly to the
proxy with the local master key bypass application budget checks. Do not expose
this deployment as a public or multi-tenant gateway.

Routes:
- AI_UNDERSTAND_MODEL: claude-sonnet-4-5 or claude-haiku-5-5; demo active/shadow.
- AI_ANSWER_MODEL: qwen-3.6-35b-sovereign for explanatory answers.
- AI_REVIEW_MODEL: qwen-3.6-35b-sovereign for observational review.
- Legacy/simulator use the UI-selected default model.
Empty role overrides use the UI default. /usage displays the effective overrides.

Hooks and ownership:
- Gateway async_pre_call_hook: allowed catalog model, explicit task, prompt/output
  size, no tool/function calls and no streaming.
- Gateway async_post_call_failure_hook: sanitized error, preserves policy refusal.
- Application beforeUnderstand: bypass simple intake/selection messages.
- Application afterUnderstand: strict JSON, field types, current-message evidence,
  no duplicate fields, required clarification. These checks are not a guarantee of
  semantic truth (e.g. negation/guardian identity still require interpretation).
- Existing correctedBatch, bookingFlow, missingBookingProfile, ensureCurrent,
  approval service, verifyDiagnosis and saveOutbound remain the operation and
  delivery boundaries. They were not replaced by the gateway.
- assistant.understanding audit compares interpretation with the code decision.
  In active mode, validated literal fields/questions feed a second code planning
  pass, logged as assistant.understanding_applied. Calendar writes and approvals
  still belong to the existing application services, never to the model.
- assistant.context_review remains observational.

No automatic model fallback to paid models. No direct-provider fallback around
an unavailable gateway. Existing code-only paths remain available; AI answer
failures retain their existing transparent static response. Model retries never
perform business operations. No prompt cache; no extra full-message logging.

Start:
  node scripts/ai-routing.mjs shadow
  docker compose --profile ai-gateway up -d --no-deps --wait gateway
  docker compose build app
  docker compose up -d --no-deps --force-recreate --wait app

Rollback without deleting records:
  node scripts/ai-routing.mjs active claude-sonnet-4-5
  docker compose up -d --no-deps --force-recreate --wait app
Switch to Haiku:
  node scripts/ai-routing.mjs active claude-haiku-5-5
  docker compose up -d --no-deps --force-recreate --wait app
Disable understanding and return to direct transport:
  node scripts/ai-routing.mjs direct
  docker compose up -d --no-deps --force-recreate --wait app
This clears role overrides and disables understanding, restoring the existing UI
model selection and direct transport. Context-review mode remains independently
configurable with scripts/context-review.mjs. The gateway can then be stopped.

Tests:
  node --env-file=.env scripts/evaluation/gateway-smoke.mjs
  node --env-file=.env --import tsx scripts/evaluation/understanding-gateway.ts
The latter defaults to 16 calls each to Sonnet and Qwen with synthetic data.
EVAL_UNDERSTANDING_MODELS accepts a comma-separated list; EVAL_OUTPUT_DIR selects
a separate artifact directory. Calls to paid models incur real usage.
Haiku 5.5 supplier tariff confirmed by operator on 2026-10-08: $0.11 input and
$0.55 output per million tokens. Historical usage retains its original snapshot.
Continue broadening unseen multi-turn evaluation; a passing fixture set does not
guarantee real-world conversation correctness.
