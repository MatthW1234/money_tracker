# Pocket Ledger

## Version 1.10

The Investments screen now separates five concepts that were previously mixed
inside **Invested**:

- **Gross contributions** — money actually credited to investment accounts.
- **Withdrawals** — money returned from investment accounts.
- **Net contributions** — gross contributions minus withdrawals.
- **Current account value** — the latest valuation plus subsequent activity.
- **Market movement** — current value minus opening balances and net transfers.

Account rows show the same lifetime bridge for each investment or pension
account. Archived accounts remain visible as historical audit records, allowing
an old product to show £0 without contaminating an active account comparison.

Transfer conversion now accepts the amount actually received by the other
account. This handles Trading 212 card-deposit fees correctly: a £100.70 bank
charge can create a £100.00 ISA contribution and retain £0.70 as a transfer
cost. The bank statement still reconciles and only £100 counts as invested.

The supplied data identified two distinct products. `Trading 212 Invest`
received £90.00 in July 2025 and returned £90.34 by November 2025. Its £0.34
gain reconciles to £0.47 realised result less £0.13 FX fees. The active
`Trading 212 S&S ISA` received £5,808.00 across 48 deposits; £5,827.67 left the
bank because £19.67 was charged as deposit fees.

The companion separated backup preserves every original bank record and former
category, creates matching account-side transfer entries, archives the emptied
Invest account, and leaves the ISA ready for its first current valuation.

## Version 1.09

Investment and pension accounts now support dated valuation checkpoints. Use
**Investments → Update value** to enter the complete end-of-day account value
shown by Trading 212, including both holdings and uninvested cash. Valuations
are stored separately from transactions: they update account value and net
worth but never appear as income or spending.

The most recent valuation is authoritative for that date. Transfers and other
account entries dated after it are then applied normally, so a new contribution
or withdrawal updates the tracked value immediately. Between two valuations,
Pocket Ledger estimates market movement as:

`ending value − starting value − net transfers`

For example, £1,000 followed by a £100 contribution and a later value of £1,150
is reported as £50 market movement. The Investments screen shows recent values,
net transfers, estimated movement, staleness and a per-account value chart.

For the supplied ledger, create a Trading 212 investment account using the
actual current value as its opening cutover, then save the same day's valuation
after all activity is complete. Future bank-side Trading 212 movements should
be converted into transfers. The 101 older savings/investment category records
remain untouched and should not be recreated as transfers.

Version 1.09 is deliberately manual and local: it stores no Trading 212 API
credentials. CSV/statement import and a securely mediated read-only API sync
remain possible later milestones.

## Version 1.08

The import wizard now accepts only an active account from the account manager.
Older data assigned to the synthetic `Imported` destination is automatically
moved into `Current Account`, including related import and reconciliation
metadata. In the supplied backup this corrects four transactions, resulting in
all 1,116 transactions being assigned to the real current account.

Settings now includes an account setup guide for moving from the existing
category-based history to proper Current, Savings and Investment accounts. The
recommended safe cutover is to enter today's real balance when adding Savings
or Investment, preserve the older one-sided category records, and convert only
future statement movements into transfers. This avoids recreating historical
money and double-counting it.

Transfers into investment or pension accounts now appear as contributions on
the Investments screen. They remain excluded from spending and income, so a
Current-to-Investment movement changes the account split and contribution
figures without changing net worth. Savings Goals continue to earmark money
already held in an account; funding a goal is not a second bank movement.

The supplied backup contains 101 older movements stored as categories: 12
savings deposits, 40 savings withdrawals, 47 investment deposits and two
investment withdrawals. Version 1.08 deliberately preserves them rather than
guessing at historical counterpart accounts or balances.

## Version 1.07

Installed browser/PWA copies now store the ledger in IndexedDB. On first use,
an existing `pocketledger_data_v1` local-storage record is copied into the
database and read back byte-for-byte before IndexedDB becomes authoritative.
The original record is not deleted or updated, so it remains available under
Settings as a pre-migration recovery copy.

If IndexedDB is temporarily unavailable, current changes are written to a
separate emergency fallback record rather than overwriting that original copy.
When IndexedDB becomes available again, the newer fallback is verified into
the database and then retired. Settings reports the active storage mode and
offers guarded recovery of the original copy. Claude-hosted storage and normal
JSON backup/restore behavior remain unchanged.

The supplied rule fixture was rerun after migration: all 141 rules, five
direction restrictions and categorisation results across 1,116 transactions
remain identical to v1.06.

## Version 1.06

The auto-tagging rule engine is now isolated in `js/rules.js`, the first
maintainability extraction from the former single-file application. Storage is
deliberately unchanged in this release: existing browser data still uses
`pocketledger_data_v1`, and JSON backup/restore remains the transfer mechanism.

Rule restoration now preserves the supported `in` and `out` directions. Older
`income` and `expense` aliases are migrated to those canonical values, while a
missing direction continues to mean `any` without being added to the saved JSON
unnecessarily. The rule screen reports the rule count, direction-specific
rules, missing categories, conflicts and exact duplicates. Duplicate rules are
reported rather than silently removed so saved order and matching behaviour do
not change.

The supplied 13 August 2026 export was used as the compatibility fixture. All
141 rules retained their order and keyword/category content, all five
direction-specific rules survived restoration, and the extracted engine
returned the same category as the legacy engine for each of 1,116 exported
transactions. Ten exact duplicate groups were identified and intentionally
preserved; there were no invalid rules, missing categories or conflicting
duplicates.

## Version 1.05

Savings goals and sinking funds now have their own records in the Spending
Plan, separate from the wishlist. A savings goal represents a broader target;
a sinking fund earmarks money for a known future cost. Each stores a target
amount, optional target date, priority, linked account and notes.

Adding or releasing money creates a dated activity entry rather than a bank
transaction. This is deliberate: the money already exists in an account, so
earmarking it must reduce **Available to spend** without increasing assets or
net worth. The plan shows percentage funded, remaining amount, required monthly
contribution, and funded, on-track, behind, overdue or paused states.

Goals can be edited, paused and resumed, funded gradually, drawn down when the
money is used, inspected through their activity history, or deleted to release
the earmark. Account renames now follow through to recurring schedules and
goals as well as transactions and reconciliation history.

## Version 1.04

The Spending Plan now has formal recurring-payment records. Confirmed income
and bills store their expected amount, category, account, next date and one of
eight frequencies: weekly, fortnightly, every four weeks, monthly, quarterly,
every six months, yearly or a custom number of days. Monthly schedules retain
their intended calendar day across shorter months.

Schedules can be marked as variable with an expected range, paused and resumed,
ended without deleting their history, or skipped for one occurrence. Overdue
items are called out explicitly. Recording an occurrence can add the actual
amount and date to Transactions and then advances the next expected date;
duplicate entries for the same schedule and date are blocked.

Automatic recurring detection remains available as a suggestion layer. A
suggestion can be confirmed into an editable schedule or dismissed, and a
matching confirmed schedule suppresses the detected version so it is never
counted twice. Only confirmed schedules drive upcoming dates, bills still due
and available-to-spend.

## Version 1.03

Accounts are now structured records with explicit types for current, savings,
cash, investment, pension, property, credit-card, loan, mortgage and other
asset/liability accounts. Existing account names and opening balances migrate
automatically from versions 1.01 and 1.02. Account records also store an
optional institution, balance date, credit limit, archive state and whether the
account is included in net worth.

Liability opening balances are entered as a positive amount owed and stored as
signed negative balances. Credit-card reconciliation follows the same natural
input convention. Archived accounts retain transactions and reconciliation
history but disappear from new-entry lists.

The new **Net Worth** section reports included assets, liabilities and net
worth, shows credit utilisation where a card limit is available, and stores
explicit user-created snapshots. Snapshots are deliberately not reconstructed
from incomplete history or silently rewritten when an opening balance changes.

## Version 1.02

This release adds a transaction clearing workflow and formal account
reconciliation. Transactions can be Pending, Cleared or Reconciled; pending
items do not affect posted balances or spending reports, and reconciled items
are locked until the corresponding reconciliation is reopened. The new
Reconcile screen checks an account against a statement balance, records a
history of completed reconciliations and supports excluded balance-adjustment
entries when an opening balance genuinely needs correction.

CSV imports now require a destination account rather than placing everything
in a generic Imported account. Backups include application/schema metadata,
are validated before restore, and a device-local pre-restore recovery snapshot
is retained. Date calculations now preserve local calendar dates rather than
converting them through UTC. Settings and backup controls also remain available
at narrow window sizes.

A personal income & spending tracker that runs entirely in your browser —
your data is stored privately and nothing is sent to a server.

**Dashboard:** weekly/monthly/yearly analytics, a balance-over-time chart
with an optional trend-based forecast, a cash flow waterfall showing where
income actually went each period, per-account balances (with a proper
account list you can add to ahead of time), top merchants (with manual
merging for near-duplicate names), budgets with progress bars,
"savings opportunities" that flag discretionary categories running above
your usual spending, and month-vs-month comparisons.

**Transactions:** a log with bulk editing (search or filter, select several,
then set their account or category in one go), proper transfers between
your own accounts — recorded directly or converted from an existing
transaction, with a one-click revert if it's tagged as a transfer by
mistake — so moving money from savings to current doesn't get counted as
income or spending, and an "exclude from totals" option for real money that
hits your account but isn't really yours to spend (e.g. an earmarked
payment from a parent).

**Import & categorisation:** bank statement (CSV) import with category
assignment, editable category/auto-tagging rules with a one-click "re-check
all" that fixes mislabelled transactions to match your current rules (not
just blank ones, and scoped to your current filters if you have any set).

**Spending Plan:** manages confirmed recurring bills and income, savings goals,
sinking funds and a separate wishlist. It flags overdue commitments, shows
what's coming up, keeps automatic history-based suggestions separate, and
calculates what remains available after bills and earmarked money.

**Investments:** tag any category (e.g. "Savings/Investment", or a
dedicated ISA/pension category) as an Investment category in Categories,
and this tab tracks what you're contributing — monthly totals, contribution
rate as a % of income, a headroom breakdown showing how much room you
likely have to invest more (income minus essentials minus what you already
invest, split out from money already going to discretionary spending), and
detected recurring contributions with a flag if one looks overdue.

## Files

- `index.html` — the application shell and remaining interface/report logic
- `js/rules.js` — isolated auto-tagging rule normalisation, matching and audit
- `js/storage.js` — IndexedDB migration, verified persistence and fallback
- `manifest.json` — PWA manifest (name, icon, theme colour)
- `sw.js` — service worker (offline caching of the app shell)
- `icon.svg` — app icon
- `vendor/chart.umd.min.js`, `vendor/papaparse.min.js` — Chart.js and
  PapaParse, vendored locally rather than loaded from a CDN, so the app
  isn't trusting a third party to serve unmodified JS into a page that
  holds your bank data. Upload the whole `vendor` folder along with the
  files above.

## Theme

Toggle light/dark from the sun/moon icon in the sidebar, or pick Light,
Dark, or Auto (follows your device's system setting, live) under Settings.
Your choice is remembered per-device, separately from your ledger data.

## Security notes

- The app sets a strict Content-Security-Policy and loads no third-party
  scripts at runtime — everything it needs ships in these files.
- Optional **app lock**: in Settings → App lock, you can set a PIN that's
  required before the app opens on a given device. This is a screen lock,
  not encryption — your data is still plain JSON in browser storage, which is
  what lets "Forgot PIN?" recover access
  without losing anything. It stops someone picking up your unlocked
  phone and opening the app; it doesn't stop someone opening dev tools on
  the device itself.
- Your data never leaves the device — there's no server, no analytics,
  no network calls other than loading the app files themselves.
- Backups (**Export backup**) are unencrypted JSON. Treat that file like
  a bank statement: don't commit it into a repo, and be mindful of where
  it lands if it syncs to cloud storage.

## Using it inside Claude

Just use the app as shown in the chat — your data saves automatically
between sessions (via Claude's storage), no setup needed. This works
great on desktop or mobile browsers, but a Claude-hosted preview can't be
"installed" to a home screen the way a real PWA can (browsers only allow
installing apps served from a real website).

## Installing it as a real app on your phone

To get the full PWA experience — an icon on your home screen, opening in
its own window, working offline — host all the files above (including the
`vendor` folder) together on any static web host, for example:

1. **GitHub Pages** (free): create a repo, upload the files keeping the
   `vendor` folder structure intact, enable Pages in the repo settings,
   then visit the URL it gives you.
2. **Netlify / Vercel** (free): drag the folder containing all the files
   onto their dashboard.

Once it's live on a real `https://` URL:

- **iPhone (Safari):** open the URL → Share → "Add to Home Screen".
- **Android (Chrome):** open the URL → menu (⋮) → "Add to Home screen" /
  "Install app".

**Important — if you installed this before 19 July 2026:** earlier
versions of `index.html` only knew how to save through Claude's own
storage. Outside Claude (i.e. once hosted and installed on your phone),
that storage doesn't exist, so nothing was actually being saved between
visits — every reopen quietly reset to the sample data. This is now
fixed: outside Claude, the app saves to persistent browser storage
instead, which is what persists properly on an installed PWA. **Re-download
`index.html` and push it to your repo** to pick up the fix — you'll need
to re-enter any data you'd added on the installed copy, since the old
version was never actually saving it.

Note: because Claude's storage and your installed copy's browser storage are
separate, data you enter inside Claude and data you enter on the
installed copy won't sync automatically — use **Export backup**
(sidebar) to download a `.json` copy, and **Settings → Restore from
backup…** on the other copy to load it in. Restoring replaces whatever's
currently on that device, so export first if you want to keep both.

## Importing a bank statement

1. Export a CSV of your transactions from your bank's online banking
   (Santander and most UK banks offer this from the transaction list).
2. Go to **Import** in the app, upload the file.
3. Check the column mapping (date, description, amount) — the app
   guesses it from your file's headers, adjust if needed.
4. Review the parsed rows: categories are auto-suggested from your rules
   where possible, duplicates already in your ledger are flagged and
   unticked automatically. Assign categories individually or in bulk,
   then confirm.

## Splitting a transaction across categories

If a single transaction covers more than one category — a supermarket
trip that's part groceries, part household goods — click the split icon
on that row in **Transactions**. Assign an amount and category to each
piece; they must add up to the transaction's total before you can save.
Split transactions show a "Split (n)" badge instead of a single category,
are counted correctly (per category) everywhere the app totals things up
— budgets, the dashboard, Spending Plan, Investments — and are excluded
from auto-categorisation and recurring-transaction detection, since those
need one category per transaction to work from. Use **Remove split** to
undo it and go back to a single category.

## Finding duplicate transactions

**Find duplicates** on the Transactions tab checks your whole ledger (not
just what you're about to import) for likely duplicate entries — exact
matches on date/amount/description, and near-matches with the same
amount and merchant a few days apart. Nothing is deleted until you tick
which copies to remove and confirm.
