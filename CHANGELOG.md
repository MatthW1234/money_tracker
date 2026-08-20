# Pocket Ledger changelog

## 1.34 — explainable anomaly alerts

- Added local alerts for unusual merchant spending, missed expected income,
  subscription price increases and materially changed card bills.
- Spending comparisons require at least three earlier payments and display the
  latest amount against a recent median; alert IDs remain stable.
- Alerts appear in the Review inbox, link to the underlying transaction or
  Spending Plan, and never edit ledger data automatically.
- Individual alerts can be dismissed without hiding later occurrences carrying
  a different transaction or expected-date identity.
- Advanced the schema from 20 to 21 with an empty dismissal list for older
  backups.

## 1.33 — desktop shortcuts and retained layout

- Added a keyboard command palette and shortcuts for search, add transaction,
  import and reconciliation; form fields suppress shortcuts while typing.
- Added compact/comfortable table density and optional account/status columns.
- Transaction sort, filters and last-used account now persist locally and in
  complete JSON backups.
- Added current-month, last-statement and UK tax-year date presets, with tax
  years calculated from 6 April through 5 April.
- Advanced the schema from 19 to 20 with conservative default preferences for
  older ledgers.

## 1.32 — recurring occurrence confirmation

- Added ranked matching between confirmed schedules and existing imported
  transactions using account, direction, date, amount and description.
- Schedules advance only after explicit confirmation; no candidate is silently
  linked or used to change a forecast.
- Candidate labels disclose late dates, changed amounts and multiple plausible
  matches before confirmation.
- Match history retains expected/actual date and amount, transaction identity,
  source and confirmation time.
- Advanced the schema from 18 to 19 with an empty recurring-match history for
  older backups.

## 1.31 — period close and edit guardrails

- Added account-specific soft closes through a chosen statement date.
- Close records retain transaction field snapshots and report added, deleted or
  edited records independently of their net balance effect.
- Protected transactions are excluded from bulk edits and guarded from inline
  category, split, transfer, linked-return, edit and deletion actions.
- Reopening requires an explanatory note and retains both the original close
  and a reopen audit record.
- Advanced the schema from 17 to 18; existing ledgers migrate with no closes.

## 1.30 — review inbox and saved views

- Added a unified read-only inbox for uncategorised spending, exact duplicate
  groups, incomplete transfers and unmatched investment funding.
- Added built-in transaction views for this month, missing receipts and card
  purchases of £100 or more.
- Custom combinations of search, category, type, status and dates can now be
  saved locally, reopened and deleted.
- Reused the existing batch account/category/status actions and one-step Undo
  mechanism as the safe resolution workflow.
- Advanced the schema from 16 to 17 with an empty saved-view collection for
  older ledgers; all 1,116 supplied transactions and 141 rules remain intact.

## 1.29 — verified backup and recovery preview

- JSON backups now include a versioned manifest, creation timestamp, data
  summary and deterministic checksum for detecting accidental corruption.
- Restore verifies new backups before normalisation and blocks mismatched or
  unsupported manifests; older backups remain available as legacy/unverified.
- Restore preview shows count deltas, new/removed transaction IDs, date range,
  source age and a warning when the source schema is newer than the app.
- Added a portable transactions CSV export with IDs, account, status, transfer
  and linked-event fields alongside the existing complete JSON backup.
- Data Health warns when no backup is recorded or the latest is over 30 days
  old. The automatic pre-restore recovery snapshot is retained.
- Retained schema version 16 because integrity metadata exists only in exported
  files and older schema-16 backups remain compatible.

## 1.28 — rule workshop

- Added explainable rule matching: the longest applicable keyword remains the
  winner, and visible rule order now explicitly resolves equal-specificity ties.
- Rule rows show how many historical transactions they match and how many they
  actually win after more-specific rules are considered.
- Draft and edited rules are simulated before save, including category changes,
  uncategorised matches, superseded matches and competing-category matches.
- Added priority controls without changing rule content or removing duplicates;
  the supplied 141-rule ordering remains intact until deliberately edited.
- Retained schema version 16 because this checkpoint changes rule tooling, not
  the persisted backup shape.

## 1.27 — linked returns and credit-card dates

- Advanced the ledger schema from 15 to 16 and added durable links between an
  original outgoing transaction and a later refund, reversal or chargeback.
- Linked returns reduce the original spending category rather than appearing
  as household income, and inherit the original category when uncategorised.
- Transaction rows expose the relationship and allow it to be removed without
  deleting either underlying bank entry.
- Reconciliation snapshots retain linked-event identity, so later relationship
  edits are visible to audit diagnostics.
- Credit-card accounts can retain statement day, due day, minimum payment and
  full-balance Direct Debit preference; upcoming dates appear on the dashboard.
- Data Health checks orphaned links, wrong directions/accounts and cumulative
  returned amounts above the original debit.

## 1.26 — Trading 212 activity import

- Advanced the ledger schema from 14 to 15 and added a dedicated local Trading
  212 History CSV parser for Invest, Stocks & Shares ISA and pension-style
  investment accounts.
- The importer separates deposits, withdrawals, buys, sells, dividends, cash
  interest, currency conversion and fees without turning portfolio trades into
  household income or spending.
- Users choose the exact investment product before import. Provider activity is
  never moved between Invest and S&S ISA automatically.
- Deposits and withdrawals are matched by account, direction, amount and date
  to existing transfer legs. Unmatched funding is retained for review rather
  than silently creating or duplicating ledger transactions.
- Provider IDs or stable row keys prevent overlapping history exports from
  duplicating activity. Raw source rows and import-session fingerprints remain
  available in backups.
- Investments now summarises retained provider deposits, withdrawals,
  dividends, interest, trades, fees and unmatched funding; Data Health checks
  duplicate activities and broken transfer links.

## 1.25 — statement-assisted reconciliation

- Advanced the ledger schema from 13 to 14 and connected retained import
  sessions to the five-stage reconciliation workflow.
- Reconciliation can now select an imported statement, fill its date range and
  use a mapped running-balance column to prefill the closing balance.
- The Match entries stage separates linked statement rows, ledger-only entries
  and statement-only rows before making any status changes.
- An explicit, confirmed Apply matches action marks linked rows Cleared and
  unmatched ledger entries Pending; previously reconciled records remain locked
  and every checkbox can still be reviewed manually.
- Completed audit records retain the statement file identity and matching
  counts. Reopening restores the same statement source.
- Data Health detects missing statement sources and reconciliations completed
  with unmatched statement rows.

## 1.24 — import provenance and history

- Advanced the ledger schema from 12 to 13 and introduced persistent import
  sessions and account-specific CSV mapping profiles.
- Every newly imported transaction retains its import-session ID, source file
  fingerprint, original row number and raw mapped values for later audit.
- Duplicate detection now respects the destination account and can recognise a
  previously imported source row even if its ledger description was edited.
- The Import screen shows recent sessions with row-level outcomes for imported,
  duplicate, excluded and invalid rows.
- Reusing the same statement format and account automatically restores the last
  successful column mapping, date format and amount-direction setting.
- Data Health reports repeated source rows, missing import sessions and deleted
  transactions referenced by import history. Older imports remain valid and are
  explicitly identified as having no source-row provenance.

## 1.23 — accuracy foundations

- Advanced the ledger schema from 11 to 12 and added a shared penny-precision
  money engine for stored amounts, balance calculations, investment totals,
  transfers and reconciliation differences.
- Made stable account IDs authoritative during restore and save. Account names
  are refreshed from their account record, so renaming an account cannot leave
  transactions attached to an obsolete display name.
- Data Health now detects duplicate account names or IDs, orphaned and
  mismatched account references, duplicate transaction IDs and split totals
  that do not equal their parent transaction.
- Existing schema-11 backups migrate without changing transaction counts,
  categorisation rules, reconciliation snapshots or investment history.

## 1.22 — audit-quality reconciliation history

- Advanced the ledger schema from 10 to 11 with automatic normalisation of
  existing reconciliation history.
- New reconciliations retain statement start/end dates, opening and closing
  anchors, calculated balance, period inflows/outflows, completion difference,
  included transaction IDs and immutable field snapshots, balance-adjustment
  IDs and acknowledged diagnostic warning codes.
- Added audit-history inspection with explicit legacy/audited labels.
- Data Health now detects missing, edited or newly backdated records relative
  to the latest reconciliation snapshot, including offsetting changes that do
  not alter the closing balance.
- Reopening reports snapshot damage before unlocking currently linked entries
  and restores the original statement inputs for correction.
- Schema-10 backups retain their existing anchors and migrate as legacy audit
  records; transaction, rule and account data remain compatible.

## 1.21 — guided reconciliation

- Replaced the single statement panel with Statement, Opening anchor, Match
  entries, Explain difference and Complete stages.
- Added `js/reconciliation.js` for statement-session calculations, previous
  reconciliation lookup and suggested period starts.
- Shows the previous agreed balance or account opening balance before entry
  matching, alongside period inflows, outflows and pending counts.
- Keeps discrepancy suggestions and Data Health accessible in the dedicated
  explanation stage, with balance adjustment presented as a last resort.
- Retained schema 10 and the existing reconciliation record shape for a clean
  rollback checkpoint before v1.22.

## 1.20 — simplified money movement

- Replaced accounting-oriented transaction choices with Spent, Received and
  Moved between accounts.
- Restricted transaction, bulk assignment and transfer destinations to
  accounts configured in Account Management.
- Added separate sent and received transfer amounts with an immediate transfer
  cost preview and consistent paired-entry creation in `js/transfers.js`.
- Added matching suggestions when converting imported rows, allowing an
  existing opposite entry on another account within three days to be linked.
- Preserved income/spending exclusion for transfers and Trading 212
  contribution/fee calculations.
- Retained schema 10 and backup compatibility.

## 1.19 — read-only data health and reconciliation diagnostics

- Added `js/diagnostics.js`, a mutation-free audit engine for account,
  transaction, transfer, reconciliation, rule and investment-value integrity.
- Added a Data Health navigation screen with severity summaries and direct
  routes to relevant transactions and workflows.
- Detects incomplete or over-linked transfers, same-account legs, invalid
  directions, fee mismatches and partially reconciled transfer pairs.
- Detects missing/unknown account assignments, possible exact duplicate
  groups, uncategorised spending, balance adjustments, orphaned reconciliation
  locks, historical reconciliation drift, missing rule categories, conflicting
  rules and stale or missing investment valuations.
- Added exact difference suggestions to statement reconciliation using up to
  three pending, recently cleared or near-boundary transactions.
- Retained schema 10, backup compatibility and all existing transaction/rule
  behaviour; diagnostics never mutate the ledger.

## 1.18 — modular UI completion

- Reduced `index.html` from the application monolith to a compact document
  shell containing markup and ordered asset loading.
- Moved all styling into `css/app.css` and shared controller/orchestration code
  into `js/app.js`, with startup isolated in `js/start.js`.
- Isolated device-specific theme/PIN behaviour in `js/device.js` and recurring
  transaction detection in `js/recurring.js`.
- Extracted complete Dashboard, Reconciliation, Transactions, Planning,
  Investments, Insights, Categories, Import and Settings view modules.
- Retained the existing Net Worth and account-management modules and all
  previously extracted business-logic modules.
- Added every modular asset to the offline PWA cache and advanced its cache
  namespace.
- Retained schema 10, backup compatibility, transaction/rule data, financial
  calculations and existing interactions without migration.
- Added an assembled-shell regression that starts the app and renders every
  primary navigation screen against the same runtime.

## 1.17 — account-management extraction

- Moved the Settings account list, account-type option rendering and
  archive/restore interaction into `js/views/accounts.js`.
- Kept account balances, transaction ownership, migrations and legacy account
  compatibility in the core ledger model.
- Added the account view module to the offline PWA cache.
- Retained schema 10, JSON backup compatibility and all financial/rule
  behaviour.

## 1.16 — Net Worth screen extraction

- Moved the complete Net Worth view, account-row presentation, snapshot action
  and chart wiring into `js/views/net-worth.js`.
- Kept account balances in the investment/core models and totals in the report
  model; the view receives them as explicit dependencies.
- Retained schema 10, existing snapshots, PWA behaviour and backup compatibility.

## 1.15 — shared UI foundation

- Extracted currency and UK-date formatting, relative timestamps, month labels,
  HTML/attribute escaping and status-pill presentation into `js/ui.js`.
- Kept screen rendering, CSS and interaction wiring unchanged while establishing
  the common UI dependency required for later per-screen modules.
- Retained schema 10, backup compatibility, desktop PWA metadata and all
  financial/rule behaviour.
- Added escaping, formatting, status and full-shell integration fixtures.

## 1.14 — reporting model extraction

- Moved budget pace, pending-card totals, savings opportunities, goal funding,
  spending momentum, weekday spending, savings-rate trends, largest
  transactions and net-worth summaries into `js/reports.js`.
- Kept report rendering and charts in `index.html`, preserving the current UI.
- Retained schema 10, backup compatibility and the unchanged rules engine.
- Added reporting fixtures for pending exclusion, transfers, split spending,
  goal funding, rolling windows and asset/liability totals.

## 1.13 — CSV import engine extraction

### Changed

- Moved CSV text decoding, column inference, row parsing, date and money
  conversion, and duplicate-key generation into `js/import.js`.
- Kept the import wizard and category selection UI in `index.html`, with parsed
  rows supplied by the extracted engine.
- Added the import engine to the offline PWA cache.

### Compatibility and verification

- The ledger schema remains at version 10 and imported transaction records keep
  their existing shape.
- Existing auto-tagging rules are still queried through `js/rules.js`; the
  import module does not own or rewrite rules.
- Fixtures cover UK, ISO and US date layouts, single signed amounts, separate
  credit/debit columns, currency symbols, parentheses, headerless data and
  duplicate exclusion.

## 1.12 — core ledger and account model extraction

### Changed

- Moved backup normalisation, schema migration and validation into
  `js/model.js`.
- Moved account types, account-record compatibility, posted/current balances,
  transaction status, split expansion and reconciliation calculations into the
  same model.
- The model accesses the live ledger through dependency injection, so a restore
  or clear operation cannot leave stale database references behind.
- Added the core model to the offline PWA cache.

### Compatibility and verification

- The schema remains at version 10 and the JSON backup shape is unchanged.
- Auto-tagging remains owned by the byte-unchanged `js/rules.js` module.
- Legacy backups without account records still migrate into real account
  records, and the synthetic `Imported` destination still migrates to the
  preferred current account.
- Regression checks cover full-backup restoration, rule and transaction
  preservation, splits, pending transactions, transfers, opening balances and
  reconciliation history.

## 1.11 — investment model extraction

### Changed

- Moved investment valuations, account balances, transfer flows,
  contribution/withdrawal classification and portfolio lifetime totals from
  `index.html` into the dedicated `js/investments.js` model.
- Kept rendering and user workflows in `index.html`, creating a stable boundary
  for later UI modularisation without changing accounting behaviour.
- Added the extracted model to the offline PWA cache.

### Compatibility and verification

- The backup schema remains at version 10; no transaction, account, valuation,
  snapshot or rule migration is performed.
- The rules and storage modules are unchanged.
- Regression checks use the separated Trading 212 backup and retain its 145
  rules, £5,898.00 gross contributions, £90.34 withdrawals, £5,807.66 net
  contributions, £5,808.00 current value, £19.67 transfer costs and £0.34
  historical market movement.

## 1.10 — investment account reconciliation

### Corrected

- Replaced the ambiguous **Invested** total with separate **Gross
  contributions**, **Withdrawals**, **Net contributions**, **Current account
  value**, and **Market movement** figures.
- Withdrawals from investment accounts now reduce net contributions rather than
  leaving historical funding permanently in the headline total.
- Account-level summaries distinguish archived investment products from active
  accounts, so a closed Trading 212 Invest account no longer inflates the active
  Stocks & Shares ISA comparison.

### Added

- Transfers may now have unequal bank and investment sides when a provider
  deducts a deposit or FX fee. The bank statement amount remains unchanged, the
  amount actually credited becomes the contribution, and the difference is
  retained as a transfer cost.
- Lifetime gross funding, withdrawals, net funding, recorded transfer costs,
  current value and inferred market movement are shown for each investment
  account.
- Archived investment accounts and their valuation history remain visible for
  audit purposes but cannot receive new valuations accidentally.

### Trading 212 reconciliation

- The supplied Invest export confirms £90.00 deposited, £90.34 withdrawn,
  £0.47 realised trading result and £0.13 FX fees, leaving a £0.34 gain.
- The active Stocks & Shares ISA exports confirm 48 deposits: £5,827.67 left
  the bank, £19.67 was charged as deposit fees, and £5,808.00 reached the ISA.
- A companion corrected backup separates `Trading 212 Invest` (archived and
  closed at £0) from the active `Trading 212 S&S ISA`. All 52 original bank
  records remain present with their former categories retained in
  `preTransferCategory`, and matching account-side entries provide a reversible
  audit trail.

### Verification

- The corrected backup retains all 1,130 original transactions and 145 rules,
  adding only 52 matching transfer sides.
- Automated checks reconcile gross contributions of £5,898.00, withdrawals of
  £90.34, net contributions of £5,807.66, current pre-valuation account value
  of £5,808.00, £19.67 transfer costs and £0.34 historical market movement.

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
