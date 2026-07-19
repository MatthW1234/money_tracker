# Pocket Ledger

A personal income & spending tracker: dashboard with weekly/monthly/yearly
analytics, a transactions log, bank statement (CSV) import with category
assignment, and category/rule management. All your data is stored privately
— nothing is sent to a server.

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

## Installing it as a real app on your phone (optional)

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

Note: because each browser tab/site has its own separate storage, data
you enter inside Claude and data you enter on a self-hosted copy won't
be shared automatically — use **Export backup** (sidebar) to download a
`.json` copy, and **Settings → Restore from backup…** on the other copy
to load it in. Restoring replaces whatever's currently on that device,
so export first if you want to keep both.

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
