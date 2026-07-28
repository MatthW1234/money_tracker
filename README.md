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

## Files

- `index.html` — the whole app (HTML/CSS/JS, one file)
- `manifest.json` — PWA manifest (name, icon, theme colour)
- `sw.js` — service worker (offline caching of the app shell)
- `icon.svg` — app icon

## Using it inside Claude

Just use the app as shown in the chat — your data saves automatically
between sessions (via Claude's storage), no setup needed. This works
great on desktop or mobile browsers, but a Claude-hosted preview can't be
"installed" to a home screen the way a real PWA can (browsers only allow
installing apps served from a real website).

## Installing it as a real app on your phone

To get the full PWA experience — an icon on your home screen, opening in
its own window, working offline — host all four files above together on
any static web host, for example:

1. **GitHub Pages** (free): create a repo, upload the four files, enable
   Pages in the repo settings, then visit the URL it gives you.
2. **Netlify / Vercel** (free): drag the folder containing the four files
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
