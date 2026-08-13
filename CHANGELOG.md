# Pocket Ledger changelog

## 1.09 — investment valuation checkpoints

### Added

- Dated, per-account valuation records for investment and pension accounts.
- An **Update value** workflow on Investments for entering the complete
  end-of-day value shown by Trading 212, including holdings and uninvested cash.
- Recent valuation history with edit and delete controls, stale-value warnings,
  and a per-account valuation chart.
- Market-movement estimates between valuations, calculated as ending value
  minus starting value minus net account transfers.

### Accounting behaviour

- A valuation is an authoritative account checkpoint, not a transaction. It
  changes the account's current value and net worth without creating income or
  spending.
- Transactions after the latest valuation continue to update the account, so a
  later contribution or withdrawal appears immediately without waiting for the
  next valuation.
- Investment transfers continue to count as contributions and remain excluded
  from spending. Dividends, fees and market movement can therefore be reflected
  in the next total valuation without inventing adjustment transactions.

### Compatibility and verification

- Version 1.08 backups migrate with an empty valuation history and no changes to
  transactions, rules, accounts or historical net-worth snapshots.
- The supplied backup still retains 1,116 transactions, 141 rules and all 101
  legacy savings/investment category movements.
- Automated checks cover valuation backup round-trips, net flows between two
  valuations, post-valuation transfers, net-worth balance precedence, and all
  application sections.

## 1.08 — real account imports and clearer transfers

### Corrected

- Restoring older data automatically moves transactions assigned to the
  synthetic `Imported` account into the existing `Current Account` and removes
  the phantom account.
- The import wizard now requires an active real destination account and uses an
  account selector. It can no longer create or reuse `Imported` implicitly.
- The supplied backup migrates its four `Imported` transactions safely, leaving
  all 1,116 transactions in `Current Account` and preserving all rules.

### Added

- An account setup guide in Settings explains a safe cutover for current,
  savings and investment accounts without duplicating historical movements.
- Investment and pension account transfers now count as contributions on the
  Investments screen while remaining excluded from income and spending.
- The Investments setup state can create an investment account directly.

### Data protection

- The backup's 101 older savings and investment movements remain as their
  existing categories. They are reported in the setup guide rather than being
  silently rewritten into two-sided transfers.
- Imported account references in recurring items, goals, the last-import record
  and reconciliation history follow the same migration.

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
