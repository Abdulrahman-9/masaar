# Product

## Register

product

## Users

Procurement operators (مشغّلون) at oil-field operating companies and central governance staff (ROC admins, evaluators, auditors) in an Arabic-first, formal governmental context. They are administrative professionals — often senior — working through legally intricate SCPP tender procedures under deadline pressure. Primary language Arabic (RTL); English is secondary. Keyboard access and larger-type readability matter.

## Product Purpose

Masaar (مسار) manages the full SCPP procurement lifecycle: tender requests → advertisement → evaluation → ratification → contracts → vendor governance, with working-day deadline math, ±20% verdicts, fairness masking (12.4.2), and append-only audit. Success = an operator always knows what is late, what to do next, and every governance act is confirmed, attributed, and auditable.

## Brand Personality

Institutional, calm, trustworthy. "State-grade document" not "startup dashboard": deep petroleum navy + sparing amber accent on warm paper neutrals. Authority comes from precision (clause citations, working-day math) rather than decoration.

## Anti-references

- Emoji in navigation or labels; playful/consumer tone.
- Raw palette classes or hex values in components (everything flows from `@masaar/tokens`).
- Fabricated UI: no button without a real action, no metric without a real field, no capability no endpoint enforces (governing law of the redesign).
- SaaS hero-metric clichés, gradient text, decorative motion.

## Design Principles

1. **One skeleton per surface class** — every registry, dialog, and wizard follows one learned anatomy; learning one screen teaches all.
2. **Confirmation asks about reality** — governance commits are phrased as the physical event with the after-state previewed, and confirmed through toast + audit entry.
3. **Complexity explained, not hidden** — plain-language model sentences, clause-grounded explainers, empty states that name the next button.
4. **Honest surfaces** — placebo actions are removed or labeled; client-only actions are flagged in API mode; exports show exactly what the screen shows.
5. **RTL-native precision** — logical CSS properties only, Latin digits via `fmtCount`, mono for codes/dates/money, direction islands for machine-format data.

## Accessibility & Inclusion

Arabic RTL first-class with full English mirror. Target WCAG AA contrast (tokens already tuned). Every row-level navigation is a real link (keyboard reachable); dialogs trap focus and close on Escape (batch 3 of ops/UI-METHODOLOGY-PLAN.md); planned root-level text-size scaling ("وضع كبار السن") and high-contrast toggle (batch 6b). Reduced motion respected; motion is 150–250ms state feedback only.
