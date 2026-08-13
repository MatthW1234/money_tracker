# Pocket Ledger changelog

## 1.07 — verified IndexedDB migration

### Added

- `js/storage.js`, an isolated persistence adapter for installed browser/PWA
  copies.
- Automatic localStorage-to-IndexedDB migration with byte-for-byte read-back
  verification before the new database becomes authoritative.
- Storage mode and recovery-copy status in Settings.
- Guarded recovery of the original pre-IndexedDB ledger through the normal
  schema migration and pre-restore snapshot path.
- A separate emergency fallback record when IndexedDB is unavailable.

### Data protection

- The original `pocketledger_data_v1` value is never deleted or overwritten by
  the migration or later IndexedDB saves.
- A newer emergency fallback is migrated back into IndexedDB and verified when
  database access returns.
- Claude-hosted storage and JSON backup/restore remain unchanged.
- IndexedDB failure falls back automatically rather than preventing saves.

### Regression verification

- Database migration, exact read-back, database reopen, original-copy
  preservation and fallback behavior pass automated checks.
- The 141-rule export fixture still produces identical categorisation across
  all 1,116 transactions, including all five direction-specific rules.
- All application sections render after the storage migration.

## 1.06 — rule integrity and first module extraction

### Corrected

- JSON restore now preserves `in` and `out` direction-specific rules instead
  of silently broadening them to match any amount.
- Legacy `income` and `expense` direction aliases migrate to `in` and `out`.
- Rules with no direction retain their original compact shape while continuing
  to behave as `any`.

### Added

- `js/rules.js`, containing rule normalisation, matching, preview application
  and integrity auditing independently from the interface.
- Rule-screen integrity summaries for counts, directional rules, missing
  categories, invalid records, conflicting duplicates and exact duplicates.
- Restore confirmation now states how many rules and directional rules are in
  the backup.
- Regression fixtures comparing the extracted and legacy engines against the
  supplied export.

### Verified against the supplied export

- 141 rules preserved in their original order.
- Five direction-specific rules preserved: three `in` and two `out`.
- Identical categorisation results across all 1,116 exported transactions.
- Ten exact duplicate groups reported and intentionally retained.
- No invalid rules, missing categories or conflicting duplicate rules.

### Compatibility

- Local-storage keys and the JSON backup format remain unchanged.
- IndexedDB migration is intentionally deferred to the next milestone, after
  this rule-parity release.

## 1.05 — savings goals and sinking funds

### Added

- Dedicated savings-goal and sinking-fund records, separate from the wishlist.
- Target amounts, optional target dates, priorities, linked accounts and notes.
- Dated allocation and withdrawal activity with a per-goal history.
- Progress bars, remaining amounts and monthly contribution requirements.
- Funded, on-track, behind, overdue and paused states.
- Pause/resume controls and guarded deletion that explains how much earmarked
  money will return to Available to spend.

### Planning behavior

- Goal balances represent earmarks within existing cash rather than new assets
  or bank transactions.
- Earmarked balances reduce Available to spend without changing net worth.
- Paused goals retain their earmarked balance but contribute no monthly funding
  pressure.
- Wishlist affordability now applies each item once against cash remaining
  after bills and goal allocations.

### Migration and compatibility

- Version 4 ledgers and backups migrate to schema version 5 with an empty goal
  list; existing recurring schedules and all earlier data remain intact.
- Renaming an account now updates linked recurring schedules and savings goals.
- Seed data includes an emergency savings goal and an annual-insurance sinking
  fund.

## 1.04 — recurring schedules

### Added

- Formal recurring income and expense records in Spending Plan.
- Weekly, fortnightly, four-weekly, monthly, quarterly, six-monthly, annual and
  custom-day frequencies.
- Variable-amount schedules with expected minimum and maximum values.
- Explicit next and optional end dates, including month-end-safe advancement.
- Active, paused and ended schedule states with resume, skip-once and end
  controls.
- Overdue indicators for active schedules whose expected date has passed.
- Recording an occurrence at its actual date and amount, optionally adding a
  linked cleared transaction before advancing the schedule.
- Duplicate protection for linked schedule occurrences.
- One-click confirmation of automatically detected patterns into schedules.

### Planning behavior

- Confirmed schedules now drive Upcoming, Bills still due and Available to
  spend.
- Automatic detection and category-history estimates remain suggestions and do
  not silently commit money.
- A confirmed name/type match suppresses its automatic suggestion to prevent
  double counting.
- Paused and ended schedules remain visible for reference but are excluded from
  projections.

### Migration and compatibility

- Version 3 ledgers and backups migrate to schema version 4 with an empty
  recurring schedule list; existing detection preferences remain intact.
- Seed data includes representative confirmed salary, rent and subscription
  schedules.

## 1.03 — structured accounts and net-worth foundation

### Added

- Structured account records with stable IDs, type, institution, currency,
  opening balance/date, credit limit, archive state and net-worth inclusion.
- Asset types for current, savings, cash, investment, pension, property and
  other assets.
- Liability types for credit cards, loans, mortgages and other liabilities.
- Safe account archiving and restoration without deleting transaction history.
- Account renaming that also updates transactions and reconciliation history.
- Credit-card utilisation calculations.
- A Net Worth section with assets, liabilities and signed net worth.
- Explicit daily net-worth snapshots and a snapshot history chart.
- Type-aware reconciliation wording for liability accounts.

### Migration and compatibility

- Version 1 and 2 account names/opening balances migrate automatically into
  version 3 account records.
- Common account names are used to infer sensible initial account types.
- Legacy account fields remain synchronised in backups for compatibility.
- Transactions entered against a new account name automatically create a
  structured account record.

### Corrected

- Property, pension, investment, loan and mortgage values no longer distort the
  Dashboard's Available Cash figure.
- Liability opening amounts are stored with the correct negative sign.
- Archived accounts are excluded from new-entry pickers while remaining in
  historical calculations.

## 1.02 — reconciliation foundation

### Added

- Pending, Cleared and Reconciled transaction states.
- Account reconciliation against a statement date and balance.
- Reconciliation history and a controlled reopen workflow.
- Protection against editing, splitting, converting or deleting reconciled
  transactions.
- Excluded balance-adjustment entries for genuine opening-balance corrections.
- Transaction status filtering and bulk Pending/Cleared changes.
- Destination-account selection during CSV import.
- Versioned ledger schema metadata and migration of version 1 data.
- Strict transaction/category validation before restoring a backup.
- A pre-restore recovery snapshot and last-backup indicator.

### Corrected

- Pending transactions no longer affect posted balances, budgets or reports.
- Per-account opening balances are included consistently in the total balance.
- Calendar-date calculations no longer pass through UTC and shift near timezone
  boundaries.
- Settings, theme and backup controls remain available at narrow window sizes.
- The PWA manifest no longer forces portrait orientation on desktop devices.

### Compatibility

- Existing version 1 data and JSON backups are migrated automatically.
- Storage keys remain unchanged, so installed users retain their current data.
- The project remains a static, local-first PWA with no server dependency.

### Later milestones

- Incremental extraction of the remaining data model, import, reporting and UI
  modules.
