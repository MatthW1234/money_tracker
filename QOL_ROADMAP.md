# Pocket Ledger quality-of-life roadmap

Status: v1.30 through v1.34 were completed sequentially on 20 August 2026.
Each checkpoint has its own tested rollback ZIP. The remaining items below are
future polish rather than unfinished requirements from these releases.

This list starts with small, low-risk changes that reuse the accuracy and audit
foundations completed through v1.29. Proposed version numbers are checkpoints,
not commitments; each should remain independently testable and reversible.

## v1.30 — Review inbox and saved views

- One inbox for uncategorised, possible-duplicate, unmatched transfer and
  unmatched Trading 212 funding items.
- Saved transaction filters such as “this statement”, “needs receipts” and
  “large card purchases”.
- Batch category/status actions with a confirmation summary and one-step undo.

Benefit: replaces visits to several tabs with a short routine after each bank
or provider import. Risk is low because it orchestrates existing diagnostics
and actions rather than introducing new accounting rules.

## v1.31 — Month close and change guardrails

- Soft-close an account through a chosen statement date.
- Warn before editing/deleting closed-period transactions, transfer pairs or
  linked returns; allow an explicit reopen with an audit note.
- Show a compact “changed since close” list.

Benefit: protects reconciled history from accidental later edits while keeping
the personal ledger flexible and fully local.

## v1.32 — Recurring match confirmation

- Link planned recurring items to their actual imported transactions.
- Show missed, late, changed-price and duplicate-looking occurrences.
- Advance the schedule only after a confirmed or high-confidence match.

Benefit: makes the Spending Plan explainable and prevents schedule drift.

## v1.33 — Faster desktop operation

- Keyboard shortcuts for search, add transaction, import, reconcile and close
  modal; display them in a small command palette.
- Remember table density, visible columns, sort order and last-used account.
- Add quick date presets for month, statement period and UK tax year (6 April
  to 5 April).

Benefit: reduces clicks without changing financial calculations.

## v1.34 — Gentle anomaly alerts

- Flag materially unusual spending against the same merchant/category history.
- Surface missing expected income, subscription price increases and card bills
  that differ sharply from recent months.
- Keep alerts explainable, dismissible and local; never silently edit data.

Benefit: focuses attention on exceptions while avoiding opaque “AI budgeting”.

## Small polish candidates

- Persistent undo for category, status, transfer-link and rule-priority edits.
- Receipt/reference attachment links (local metadata first; no cloud upload).
- Clearer empty states that link directly to the action that resolves them.
- Copy transaction/account IDs and diagnostic details for troubleshooting.
- Optional compact number formatting while retaining exact values on hover.
- Accessibility pass for focus order, keyboard traps, contrast and reduced
  motion.

## Recommended sequence

Start with v1.30 because it immediately shortens the routine already used for
imports and reconciliation. Follow with v1.31 before adding more automated
matching, then v1.32. Desktop shortcuts and anomaly alerts are valuable but do
not need to block those accuracy-oriented workflows.
