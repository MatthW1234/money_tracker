# Pocket Ledger

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

**Spending Plan:** auto-detects your recurring bills/income (or estimates
them from category history when the transactions vary too much to match
automatically), shows what's coming up, and weighs planned purchases
against what you can actually afford.

**Investments:** tag any category (e.g. "Savings/Investment", or a
dedicated ISA/pension category) as an Investment category in Categories,
and this tab tracks what you're contributing — monthly totals, contribution
rate as a % of income, a headroom breakdown showing how much room you
likely have to invest more (income minus essentials minus what you already
invest, split out from money already going to discretionary spending), and
detected recurring contributions with a flag if one looks overdue.

## Files

- `index.html` — the whole app (HTML/CSS/JS, one file)
- `manifest.json` — PWA manifest (name, icon, theme colour)
- `sw.js` — service worker (offline caching of the app shell)
- `icon.svg` — app icon
- `vendor/chart.umd.min.js`, `vendor/papaparse.min.js` — Chart.js and
  PapaParse, vendored locally rather than loaded from a CDN, so the app
  isn't trusting a third party to serve unmodified JS into a page that
  holds your bank data. Upload the whole `vendor` folder along with the
  files above.

## Security notes

- The app sets a strict Content-Security-Policy and loads no third-party
  scripts at runtime — everything it needs ships in these files.
- Optional **app lock**: in Settings → App lock, you can set a PIN that's
  required before the app opens on a given device. This is a screen lock,
  not encryption — your data is still plain JSON in the browser's local
  storage either way, which is what lets "Forgot PIN?" recover access
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
fixed: outside Claude, the app saves to your browser's local storage
instead, which is what persists properly on an installed PWA. **Re-download
`index.html` and push it to your repo** to pick up the fix — you'll need
to re-enter any data you'd added on the installed copy, since the old
version was never actually saving it.

Note: because Claude's storage and your phone's local storage are
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
