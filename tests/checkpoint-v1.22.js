const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '..');
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');

function parseJavaScript() {
  const html = read('index.html');
  const files = [...html.matchAll(/<script src="([^"]+)"/g)].map((match) => match[1])
    .filter((file) => !file.startsWith('vendor/')).concat('sw.js');
  files.forEach((file) => new vm.Script(read(file), {filename: file}));
  assert(read('js/app.js').includes("const APP_VERSION = '1.22'"));
  assert(read('js/app.js').includes('const SCHEMA_VERSION = 11'));
}

function checkPwaAssets() {
  const html = read('index.html');
  const scriptSources = [...html.matchAll(/<script src="([^"]+)"/g)].map((match) => match[1]);
  scriptSources.forEach((source) => assert(fs.existsSync(path.join(root, source)), `missing script ${source}`));
  const styleSources = [...html.matchAll(/<link rel="stylesheet" href="([^"]+)"/g)].map((match) => match[1]);
  styleSources.forEach((source) => assert(fs.existsSync(path.join(root, source)), `missing stylesheet ${source}`));
  const worker = read('sw.js');
  assert(worker.includes("const CACHE = 'pocket-ledger-v25'"));
  ['css/app.css', 'js/app.js', 'js/device.js', 'js/recurring.js', 'js/diagnostics.js', 'js/transfers.js', 'js/reconciliation.js', 'js/start.js', 'js/views/dashboard.js', 'js/views/reconcile.js', 'js/views/health.js',
    'js/views/transactions.js', 'js/views/plan.js', 'js/views/investments.js', 'js/views/insights.js',
    'js/views/categories.js', 'js/views/import.js', 'js/views/settings.js']
    .forEach((asset) => assert(worker.includes(`'./${asset}'`), `service worker omits ${asset}`));
}

function testAccountView() {
  const buttons = [];
  const host = {
    _html: '',
    set innerHTML(value) { this._html = value; },
    get innerHTML() { return this._html; },
    querySelectorAll(selector) {
      const action = selector.match(/data-action="([^"]+)"/)[1];
      const pattern = new RegExp(`data-action="${action}" data-id="([^"]+)"`, 'g');
      const found = [...this._html.matchAll(pattern)].map((match) => ({action, dataset: {id: match[1]}, onclick: null}));
      buttons.push(...found);
      return found;
    },
  };
  const document = {getElementById: (id) => id === 'account-manager-body' ? host : null};
  const context = vm.createContext({window: {document}});
  vm.runInContext(read('js/views/accounts.js'), context);

  const records = [
    {id: 'current', name: 'Current Account', type: 'current', openingBalance: 250, institution: 'Bank', archived: false},
    {id: 'card', name: 'Credit Card', type: 'credit_card', openingBalance: -50, institution: '', archived: false},
  ];
  const database = {accountRecords: records, transactions: [{account: 'Current Account'}]};
  let saved = 0, synced = 0, edited = '', message = '';
  const accountTypes = [
    {value: 'current', label: 'Current account', group: 'asset'},
    {value: 'credit_card', label: 'Credit card', group: 'liability'},
  ];
  const view = context.window.PocketLedgerAccountsView.create({
    document, getDB: () => database, accountTypes,
    accountTypeConfig: (type) => accountTypes.find((item) => item.value === type),
    isLiabilityType: (type) => type === 'credit_card',
    gbp: (amount) => `£${Number(amount).toFixed(2)}`,
    escHTML: (value) => String(value), iconEdit: () => 'edit', iconUndo: () => 'undo', iconXSmall: () => 'archive',
    openAccountModal: (id) => { edited = id; },
    syncLegacyAccounts: () => { synced += 1; }, scheduleSave: () => { saved += 1; }, toast: (value) => { message = value; },
  });

  const options = view.typeOptions('credit_card');
  assert(options.includes('<optgroup label="Assets">'));
  assert(options.includes('<optgroup label="Liabilities">'));
  assert(options.includes('value="credit_card" selected'));

  view.render();
  assert(host.innerHTML.includes('Current Account'));
  assert(host.innerHTML.includes('£50.00 owed'));
  const edit = buttons.find((button) => button.action === 'edit-account' && button.dataset.id === 'current' && button.onclick);
  edit.onclick();
  assert.strictEqual(edited, 'current');
  const archive = buttons.find((button) => button.action === 'archive-account' && button.dataset.id === 'card' && button.onclick);
  archive.onclick();
  assert.strictEqual(records.find((record) => record.id === 'card').archived, true);
  assert.strictEqual(synced, 1);
  assert.strictEqual(saved, 1);
  assert.strictEqual(message, 'Archived "Credit Card"');
}

function testDiagnostics() {
  const context = vm.createContext({window: {}});
  vm.runInContext(read('js/diagnostics.js'), context);
  const diagnostics = context.window.PocketLedgerDiagnostics;
  const database = {
    accountRecords: [
      {id: 'current', name: 'Current Account', type: 'current', openingBalance: 0, archived: false},
      {id: 'savings', name: 'Savings', type: 'savings', openingBalance: 0, archived: false},
      {id: 'isa', name: 'Trading 212 S&S ISA', type: 'investment', openingBalance: 0, archived: false},
    ],
    categories: [{name: 'Groceries', kind: 'expense'}],
    rules: [{keyword: 'SHOP', category: 'Missing category'}],
    reconciliations: {}, investmentValuations: [],
    transactions: [
      {id: 'pending90', date: '2026-08-10', description: 'Trading 212', amount: -90, account: 'Current Account', status: 'pending'},
      {id: 'orphan-leg', date: '2026-08-09', description: 'Transfer', amount: -50, account: 'Current Account', status: 'cleared', transferId: 'one-leg'},
      {id: 'fee-out', date: '2026-08-08', description: 'ISA funding', amount: -100.70, account: 'Current Account', status: 'reconciled', reconciliationId: 'missing-rec', transferId: 'fee-pair', transferFee: 0.70},
      {id: 'fee-in', date: '2026-08-08', description: 'ISA funding', amount: 100, account: 'Trading 212 S&S ISA', status: 'cleared', transferId: 'fee-pair', transferFee: 0.70},
      {id: 'mismatch-out', date: '2026-08-08', description: 'Savings transfer', amount: -20, account: 'Current Account', status: 'cleared', transferId: 'mismatch-pair'},
      {id: 'mismatch-in', date: '2026-08-08', description: 'Savings transfer', amount: 19, account: 'Savings', status: 'cleared', transferId: 'mismatch-pair'},
      {id: 'duplicate-a', date: '2026-08-07', description: 'Shop', amount: -12, account: 'Current Account', status: 'cleared', category: 'Groceries'},
      {id: 'duplicate-b', date: '2026-08-07', description: 'Shop', amount: -12, account: 'Current Account', status: 'cleared', category: 'Groceries'},
      {id: 'unknown', date: '2026-08-06', description: 'Old account row', amount: -5, account: 'Imported', status: 'cleared'},
    ],
  };
  const report = diagnostics.auditLedger(database, {today: '2026-08-14'});
  const codes = new Set(report.issues.map((item) => item.code));
  ['unknown-account', 'uncategorised-spending', 'exact-duplicate', 'transfer-leg-count',
    'transfer-status-mismatch', 'transfer-fee-mismatch', 'orphaned-reconciled', 'rule-missing-category', 'missing-valuation']
    .forEach((code) => assert(codes.has(code), `diagnostic omitted ${code}`));
  assert(report.summary.error > 0);
  assert(report.summary.warning > 0);
  const suggestions = diagnostics.differenceSuggestions({db: database, account: 'Current Account', statementDate: '2026-08-10', difference: -90});
  assert(suggestions.some((suggestion) => suggestion.transactionIds.includes('pending90')));
}

function testTransfers() {
  const context = vm.createContext({window: {}});
  vm.runInContext(read('js/transfers.js'), context);
  let sequence = 0;
  const transfer = context.window.PocketLedgerTransfers.createPair({
    uid: (prefix) => `${prefix}_${++sequence}`, date: '2026-08-14', fromAccount: 'Current Account',
    toAccount: 'Trading 212 S&S ISA', sentAmount: 100.70, receivedAmount: 100,
    description: 'ISA funding', status: 'cleared',
  });
  assert.strictEqual(transfer.fee, 0.70);
  assert.strictEqual(transfer.transactions.length, 2);
  assert.strictEqual(transfer.transactions[0].amount, -100.70);
  assert.strictEqual(transfer.transactions[1].amount, 100);
  assert.strictEqual(transfer.transactions[0].transferId, transfer.transactions[1].transferId);
  assert.strictEqual(transfer.transactions[1].account, 'Trading 212 S&S ISA');
  assert.throws(() => context.window.PocketLedgerTransfers.createPair({uid: () => 'id', fromAccount: 'Savings', toAccount: 'Savings', sentAmount: 10, receivedAmount: 10}));

  const target = {id: 'bank', date: '2026-08-14', account: 'Current Account', amount: -50};
  const match = {id: 'saving', date: '2026-08-15', account: 'Savings', amount: 50};
  const candidates = context.window.PocketLedgerTransfers.findCandidates({transaction: target, transactions: [target, match]});
  assert.strictEqual(candidates[0].transaction.id, 'saving');
}

function testReconciliationSession() {
  const context = vm.createContext({window: {}});
  vm.runInContext(read('js/reconciliation.js'), context);
  const engine = context.window.PocketLedgerReconciliation;
  const database = {
    transactions: [
      {id: 'old', account: 'Current Account', date: '2026-07-31', amount: 100, status: 'reconciled'},
      {id: 'in', account: 'Current Account', date: '2026-08-03', amount: 80, status: 'cleared'},
      {id: 'out', account: 'Current Account', date: '2026-08-04', amount: -30, status: 'cleared'},
      {id: 'pending', account: 'Current Account', date: '2026-08-05', amount: -10, status: 'pending'},
    ],
    reconciliations: {'Current Account': {history: [{id: 'rec-old', statementDate: '2026-07-31', statementBalance: 100, completedAt: '2026-07-31T12:00:00Z', transactionCount: 1}]}},
  };
  const record = {name: 'Current Account', openingBalance: 0, openingBalanceDate: '2026-07-01'};
  assert.strictEqual(engine.suggestedStartDate(database, 'Current Account', '2026-08-14', record), '2026-08-01');
  const session = engine.buildSession({db: database, account: 'Current Account', accountRecord: record, startDate: '2026-08-01', endDate: '2026-08-14', statementBalance: 150});
  assert.strictEqual(session.calculatedClosing, 150);
  assert.strictEqual(session.difference, 0);
  assert.strictEqual(session.inflows, 80);
  assert.strictEqual(session.outflows, 30);
  assert.strictEqual(session.pendingCount, 1);
  assert.strictEqual(session.transactions.length, 3);
  const auditedRows = [database.transactions[1], database.transactions[2]];
  const auditRecord = {statementStartDate: '2026-08-01', statementDate: '2026-08-14', transactionSnapshots: auditedRows.map(engine.transactionSnapshot)};
  assert.strictEqual(engine.snapshotAudit(auditRecord, auditedRows, 'Current Account').ok, true);
  database.transactions[1].amount = 81;
  database.transactions[2].amount = -31;
  const changed = engine.snapshotAudit(auditRecord, auditedRows, 'Current Account');
  assert.strictEqual(changed.ok, false);
  assert.strictEqual(changed.changed.length, 2);
  assert.strictEqual(changed.changed.every((item) => item.fields.includes('amount')), true);
}

function checkBackupCompatibility() {
  const context = vm.createContext({window: {}});
  vm.runInContext(read('js/rules.js'), context);
  vm.runInContext(read('js/model.js'), context);
  let database = null, sequence = 0;
  const empty = () => ({
    schemaVersion: 11, appVersion: '1.22', startingBalance: 0,
    categories: [], rules: [], transactions: [], wishlist: [], dismissedRecurring: [], regularCategories: [],
    recurringItems: [], savingsGoals: [], budgets: {}, accountStartingBalances: {}, merchantAliases: {}, accounts: [],
    accountRecords: [], discretionaryCategories: [], investmentCategories: [], pendingCards: [], reconciliations: {},
    lastBackupAt: null, lastImport: null, netWorthSnapshots: [], investmentValuations: [],
  });
  const model = context.window.PocketLedgerModel.create({
    getDB: () => database, uid: (prefix) => `${prefix}_${++sequence}`,
    clamp: (number, min, max) => Math.max(min, Math.min(max, number)), buildEmptyDB: empty,
    defaultCategories: [], normaliseRules: context.window.PocketLedgerRules.normaliseRules,
    schemaVersion: 11, appVersion: '1.22',
  });
  const backupPath = path.resolve(root, '../../upload/pocket-ledger-backup-2026-08-13.json');
  database = model.normaliseDB(JSON.parse(fs.readFileSync(backupPath, 'utf8')));
  assert.strictEqual(database.transactions.length, 1116);
  assert.strictEqual(database.rules.length, 141);
  assert.strictEqual(database.schemaVersion, 11);
  assert.strictEqual(database.transactions.filter((transaction) => transaction.account === 'Imported').length, 0);
  assert.strictEqual(database.transactions.filter((transaction) => transaction.account === 'Current Account').length > 0, true);
  assert.strictEqual(database.lastAccountMigration.count, 4);
  assert.strictEqual(database.lastAccountMigration.target, 'Current Account');
  const raw = JSON.parse(fs.readFileSync(backupPath, 'utf8'));
  raw.reconciliations = {'Current Account': {history: [{id: 'legacy-rec', statementDate: '2026-01-31', statementBalance: 100, completedAt: '2026-01-31T12:00:00Z', transactionCount: 0}]}};
  const migrated = model.normaliseDB(raw);
  assert.strictEqual(migrated.reconciliations['Current Account'].history[0].auditVersion, 0);
  assert.deepStrictEqual(Array.from(migrated.reconciliations['Current Account'].history[0].transactionSnapshots), []);
}

async function executeApplicationShell() {
  class Element {
    constructor() {
      this.innerHTML = ''; this.textContent = ''; this.value = ''; this.checked = false; this.dataset = {};
      this.parentElement = {innerHTML: ''};
      this.style = {setProperty() {}};
      this.classList = {add() {}, remove() {}, toggle() {}, contains() { return false; }};
    }
    addEventListener() {} querySelectorAll() { return []; } querySelector() { return null; } closest() { return null; }
    appendChild() {} remove() {} click() {} focus() {} select() {} setAttribute() {} getAttribute() { return null; } getContext() { return {}; }
  }
  const elements = new Map();
  const document = {
    body: new Element(), documentElement: new Element(),
    getElementById(id) { if (!elements.has(id)) elements.set(id, new Element()); return elements.get(id); },
    createElement() { return new Element(); }, querySelectorAll() { return []; }, querySelector() { return null; },
  };
  const localStorage = {getItem() { return null; }, setItem() {}, removeItem() {}};
  const window = {
    document, localStorage, storage: {async get() { return null; }, async set() {}},
    matchMedia() { return {matches: false, addEventListener() {}}; },
    addEventListener() {}, location: {protocol: 'https:', origin: 'https://example.test'},
  };
  const Chart = class { destroy() {} };
  const context = vm.createContext({
    window, document, localStorage, navigator: {}, location: window.location, Chart, Papa: {},
    console, URL, Blob, Date, Math, JSON, Set, Map, Promise,
    setTimeout() { return 1; }, clearTimeout() {}, requestAnimationFrame(callback) { callback(); },
    getComputedStyle() { return {getPropertyValue() { return '#000000'; }}; },
  });
  window.window = window; window.navigator = context.navigator; window.Chart = Chart; window.Papa = context.Papa;
  const scripts = [...read('index.html').matchAll(/<script src="([^"]+)"/g)].map((match) => match[1])
    .filter((file) => !file.startsWith('vendor/'));
  Object.assign(context, window);
  for (const file of scripts) {
    await vm.runInContext(read(file), context, {filename: file});
    Object.assign(context, window);
  }
  assert.strictEqual(elements.get('page-title').textContent, 'Dashboard');
  vm.runInContext("['transactions','reconcile','health','import','categories','plan','investments','networth','insights','dashboard'].forEach(setTab)", context);
  vm.runInContext("UI.reconcileStatementBalance='0';[1,2,3,4,5].forEach(step=>{UI.reconcileStep=step;setTab('reconcile')});setTab('dashboard')", context);
  vm.runInContext("(()=>{const account='Current Account',balance=clearedAccountBalance(account,todayISO());completeReconciliation(account,'2026-01-01',todayISO(),balance,[]);const history=reconciliationHistory(account),record=history[history.length-1];if(!record||record.auditVersion!==1||!record.transactionSnapshots.length||record.completedSchemaVersion!==11)throw new Error('audit snapshot was not stored');const audit=PocketLedgerReconciliation.snapshotAudit(record,DB.transactions,account);if(!audit.ok)throw new Error('fresh audit snapshot failed');})()", context);
  assert.strictEqual(elements.get('page-title').textContent, 'Dashboard');
}

(async () => {
  parseJavaScript();
  checkPwaAssets();
  testAccountView();
  testDiagnostics();
  testTransfers();
  testReconciliationSession();
  checkBackupCompatibility();
  await executeApplicationShell();
  console.log('v1.22 checkpoint checks passed');
})().catch((error) => { console.error(error); process.exitCode = 1; });
