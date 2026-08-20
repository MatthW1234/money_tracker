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
  assert(read('js/app.js').includes("const APP_VERSION = '1.34'"));
  assert(read('js/app.js').includes('const SCHEMA_VERSION = 21'));
}

function checkPwaAssets() {
  const html = read('index.html');
  const scriptSources = [...html.matchAll(/<script src="([^"]+)"/g)].map((match) => match[1]);
  scriptSources.forEach((source) => assert(fs.existsSync(path.join(root, source)), `missing script ${source}`));
  const styleSources = [...html.matchAll(/<link rel="stylesheet" href="([^"]+)"/g)].map((match) => match[1]);
  styleSources.forEach((source) => assert(fs.existsSync(path.join(root, source)), `missing stylesheet ${source}`));
  const worker = read('sw.js');
  assert(worker.includes("const CACHE = 'pocket-ledger-v37'"));
  ['css/app.css', 'js/money.js', 'js/backup.js', 'js/review.js', 'js/period-close.js', 'js/preferences.js', 'js/anomalies.js', 'js/linked-events.js', 'js/trading212.js', 'js/app.js', 'js/device.js', 'js/recurring.js', 'js/recurring-match.js', 'js/diagnostics.js', 'js/transfers.js', 'js/reconciliation.js', 'js/start.js', 'js/views/dashboard.js', 'js/views/reconcile.js', 'js/views/health.js', 'js/views/review.js',
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
  vm.runInContext(read('js/money.js'), context);
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
      {id: 'bad-split', date: '2026-08-06', description: 'Split row', amount: -10, account: 'Current Account', accountId: 'current', status: 'cleared', splits: [{amount: -4}, {amount: -5}]},
    ],
  };
  const report = diagnostics.auditLedger(database, {today: '2026-08-14'});
  const codes = new Set(report.issues.map((item) => item.code));
  ['unknown-account', 'uncategorised-spending', 'exact-duplicate', 'transfer-leg-count',
    'transfer-status-mismatch', 'transfer-fee-mismatch', 'orphaned-reconciled', 'rule-missing-category', 'missing-valuation', 'split-total-mismatch']
    .forEach((code) => assert(codes.has(code), `diagnostic omitted ${code}`));
  assert(report.summary.error > 0);
  assert(report.summary.warning > 0);
  const suggestions = diagnostics.differenceSuggestions({db: database, account: 'Current Account', statementDate: '2026-08-10', difference: -90});
  assert(suggestions.some((suggestion) => suggestion.transactionIds.includes('pending90')));
}

function testTransfers() {
  const context = vm.createContext({window: {}});
  vm.runInContext(read('js/money.js'), context);
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

async function testImportProvenance() {
  const context = vm.createContext({window: {}, TextDecoder, Uint8Array});
  vm.runInContext(read('js/import.js'), context);
  const engine = context.window.PocketLedgerImport;
  const bytes = new TextEncoder().encode('Date,Description,Amount\n01/08/2026,Coffee,-3.50');
  const fingerprint = await engine.fingerprintBuffer(bytes.buffer, null);
  assert(/^fnv1a-/.test(fingerprint));
  const state = {
    headers: ['Date', 'Description', 'Amount'], rows: [['01/08/2026', 'Coffee', '-3.50'], ['02/08/2026', 'Lunch', '-8.20']],
    hasHeader: true, mapping: {date: 'Date', description: 'Description', mode: 'single', amount: 'Amount'},
    negativeIsOutgoing: true, dateFormat: 'DMY', fileFingerprint: fingerprint, destinationAccount: 'Current Account',
  };
  const transactions = [
    {id: 'existing', account: 'Current Account', accountId: 'current', date: '2026-08-01', description: 'Coffee', amount: -3.50,
      importProvenance: {fileFingerprint: fingerprint, rowNumber: 2}},
    {id: 'other-account', account: 'Savings', accountId: 'savings', date: '2026-08-02', description: 'Lunch', amount: -8.20},
  ];
  const rows = engine.buildParsedRows(state, transactions, () => 'Dining Out', (date) => date.toISOString().slice(0, 10), {accountId: 'current', accountName: 'Current Account'});
  assert.strictEqual(rows[0].duplicate, true);
  assert.strictEqual(rows[0].duplicateReason, 'same-source-row');
  assert.strictEqual(rows[0].matchedTransactionId, 'existing');
  assert.strictEqual(rows[1].duplicate, false);
  assert.strictEqual(rows[1].rowNumber, 3);
  assert.strictEqual(engine.headerSignature(state.headers), 'date\u001fdescription\u001famount');
  assert.strictEqual(engine.statementClosingBalance([
    {date: '2026-08-01', balance: 100}, {date: '2026-08-02', balance: 91.80},
  ]), 91.80);
}

function testTrading212Import() {
  const context = vm.createContext({window: {}});
  vm.runInContext(read('js/money.js'), context);
  vm.runInContext(read('js/trading212.js'), context);
  const engine = context.window.PocketLedgerTrading212;
  const csv = [
    ['Action','Time','ISIN','Ticker','Name','No. of shares','Total','Currency (Total)','Charge amount','ID'],
    ['Deposit','2026-08-01 09:00:00','','','','','100.00','GBP','','dep-1'],
    ['Market buy','2026-08-02 10:00:00','GB00TEST','TEST','Test ETF','2','50.00','GBP','0.08','buy-1'],
    ['Dividend','2026-08-03 10:00:00','GB00TEST','TEST','Test ETF','','2.00','GBP','','div-1'],
    ['Interest on cash','2026-08-04 10:00:00','','','','','1.00','GBP','','int-1'],
    ['Withdrawal','2026-08-05 10:00:00','','','','','90.34','GBP','','wd-1'],
  ];
  const parsed = engine.parse('synthetic', () => ({data: csv}));
  assert.strictEqual(parsed.activities.length, 5);
  assert.deepStrictEqual(Array.from(parsed.activities.map((activity) => activity.type)), ['deposit','trade_buy','dividend','interest','withdrawal']);
  const account = {id: 'isa', name: 'Trading 212 S&S ISA'};
  const transactions = [
    {id:'in', accountId:'isa', account:account.name, date:'2026-08-01', amount:100, transferId:'x1'},
    {id:'out', accountId:'isa', account:account.name, date:'2026-08-06', amount:-90.34, transferId:'x2'},
  ];
  const matched = engine.matchFunding(parsed.activities, transactions, account);
  assert.strictEqual(matched.find((activity) => activity.type === 'deposit').linkedTransactionId, 'in');
  assert.strictEqual(matched.find((activity) => activity.type === 'withdrawal').linkedTransactionId, 'out');
  const summary = engine.summarise(matched);
  assert.strictEqual(summary.deposits, 100);
  assert.strictEqual(summary.withdrawals, 90.34);
  assert.strictEqual(summary.dividends, 2);
  assert.strictEqual(summary.interest, 1);
  assert.strictEqual(summary.trades, 1);
  assert.strictEqual(summary.unmatchedFunding, 0);
}

function testLinkedEvents() {
  const context = vm.createContext({window: {}});
  vm.runInContext(read('js/money.js'), context);vm.runInContext(read('js/linked-events.js'), context);
  const engine=context.window.PocketLedgerLinkedEvents,original={id:'purchase',accountId:'card',date:'2026-07-01',amount:-100,category:'Shopping',status:'reconciled'},returned={id:'refund',accountId:'card',date:'2026-07-20',amount:40,category:'',status:'cleared'};
  const candidates=engine.suggestOriginals(returned,[original,returned]);assert.strictEqual(candidates[0].transaction.id,'purchase');
  const link=engine.createReturnLink({uid:()=> 'link-1',original,returned,type:'refund'});assert.strictEqual(link.amount,40);assert.strictEqual(returned.category,'Shopping');assert.strictEqual(returned.linkedEventType,'refund');
  const counts=()=>true;assert.strictEqual(engine.expenseEffect(original,counts),100);assert.strictEqual(engine.expenseEffect(returned,counts),-40);
  const schedule=engine.creditCardSchedule({type:'credit_card',statementDay:15,dueDay:10,autopayFullBalance:true},'2026-08-16',-320.50);assert.strictEqual(schedule.statementDate,'2026-09-15');assert.strictEqual(schedule.dueDate,'2026-10-10');assert.strictEqual(schedule.expectedPayment,320.50);
  engine.removeLink(link,[original,returned]);assert.strictEqual(returned.linkedEventType,undefined);
}

function testRuleWorkshop() {
  const context=vm.createContext({window:{}});
  vm.runInContext(read('js/rules.js'),context);
  const rules=context.window.PocketLedgerRules;
  const configured=[
    {keyword:'SHOP',category:'Shopping',direction:'out'},
    {keyword:'COFFEE SHOP',category:'Dining Out',direction:'out'},
    {keyword:'SHOP',category:'Income',direction:'in'},
  ];
  const outgoing={id:'out',description:'MY COFFEE SHOP',amount:-5,category:'Shopping'};
  const incoming={id:'in',description:'SHOP REFUND',amount:5,category:''};
  const explained=rules.explainMatch(configured,outgoing.description,outgoing.amount);
  assert.strictEqual(explained.rule.category,'Dining Out');
  assert.strictEqual(explained.index,1);
  assert.strictEqual(explained.candidates.length,2);
  assert.strictEqual(rules.suggestCategory(configured,incoming.description,incoming.amount),'Income');
  const preview=rules.simulateRule({keyword:'COFFEE',category:'Food',direction:'out'},[outgoing,incoming],configured,null);
  assert.strictEqual(preview.matches,1);
  assert.strictEqual(preview.wins,0);
  assert.strictEqual(preview.changes,0);
  const tie=[{keyword:'CAFE',category:'First'},{keyword:'SHOP',category:'Second'}];
  assert.strictEqual(rules.explainMatch(tie,'CAFE SHOP',-1).rule.category,'First');
  tie.reverse();
  assert.strictEqual(rules.explainMatch(tie,'CAFE SHOP',-1).rule.category,'Second');
  assert.deepStrictEqual(JSON.parse(JSON.stringify(rules.ruleImpact(configured,[outgoing,incoming],0))),{matches:1,wins:0,shadowed:1});
}

function testBackupIntegrity() {
  const context=vm.createContext({window:{}});
  vm.runInContext(read('js/backup.js'),context);
  const backup=context.window.PocketLedgerBackup;
  const ledger={schemaVersion:16,appVersion:'1.29',transactions:[{id:'a',date:'2026-08-01',description:'Coffee',amount:-3.5,category:'Dining Out',account:'Current Account',status:'cleared'}],accountRecords:[{id:'current'}],categories:[{name:'Dining Out'}],rules:[{keyword:'COFFEE',category:'Dining Out'}],reconciliations:{},investmentValuations:[]};
  const payload=backup.create(ledger,{createdAt:'2026-08-16T12:00:00Z',appVersion:'1.29',schemaVersion:16});
  assert.strictEqual(backup.verify(payload).status,'verified');
  assert.strictEqual(payload.backupManifest.summary.transactions,1);
  payload.transactions[0].amount=-99;
  assert.strictEqual(backup.verify(payload).status,'tampered');
  assert.strictEqual(backup.verify(ledger).status,'legacy');
  const comparison=backup.diff({transactions:[],accountRecords:[],categories:[],rules:[],reconciliations:{},investmentValuations:[]},ledger);
  assert.strictEqual(comparison.addedTransactions,1);
  assert.strictEqual(comparison.counts.transactions.delta,1);
  const csv=backup.transactionsCSV(ledger);
  assert(csv.includes('Transaction ID'));
  assert(csv.includes('Coffee,-3.50'));
}

function testReviewInbox() {
  const context=vm.createContext({window:{}});vm.runInContext(read('js/review.js'),context);
  const review=context.window.PocketLedgerReview;
  const transactions=[
    {id:'u',date:'2026-08-01',description:'Coffee',amount:-3.5,account:'Current Account',category:''},
    {id:'d1',date:'2026-08-02',description:'Shop',amount:-10,account:'Current Account',category:'Shopping'},
    {id:'d2',date:'2026-08-02',description:'Shop',amount:-10,account:'Current Account',category:'Shopping'},
    {id:'x',date:'2026-08-03',description:'Transfer',amount:-20,account:'Current Account',transferId:'one-leg'},
  ];
  const result=review.inbox({transactions,investmentActivities:[{id:'fund',type:'deposit'}]});
  assert.strictEqual(result.uncategorised.length,1);assert.strictEqual(result.duplicates.length,1);assert.strictEqual(result.unmatchedTransfers.length,1);assert.strictEqual(result.unmatchedFunding.length,1);assert.strictEqual(result.total,4);
  assert.strictEqual(review.applyPreset(transactions,'this-month','2026-08-20').length,4);
  assert.strictEqual(review.applyPreset(transactions,'needs-receipt','2026-08-20').length,3);
}

function testPeriodClose() {
  const context=vm.createContext({window:{}});vm.runInContext(read('js/period-close.js'),context);
  const closeEngine=context.window.PocketLedgerPeriodClose,account={id:'current',name:'Current Account'};
  const transactions=[{id:'a',date:'2026-07-10',description:'Shop',amount:-10,category:'Shopping',accountId:'current',account:'Current Account',status:'cleared'},{id:'later',date:'2026-08-10',description:'Later',amount:-5,accountId:'current',account:'Current Account'}];
  const close=closeEngine.create({uid:()=> 'close-1',account,closedThrough:'2026-07-31',closedAt:'2026-08-01T00:00:00Z',transactions});
  assert.strictEqual(close.snapshots.length,1);assert.strictEqual(closeEngine.activeFor([close],account).id,'close-1');assert.strictEqual(closeEngine.protects(transactions[0],close),true);assert.strictEqual(closeEngine.protects(transactions[1],close),false);assert.strictEqual(closeEngine.changes(close,transactions).length,0);
  transactions[0].category='Groceries';transactions.push({id:'late',date:'2026-07-30',description:'Late entry',amount:-2,accountId:'current',account:'Current Account'});
  const changes=closeEngine.changes(close,transactions);assert(changes.some(change=>change.kind==='edited'));assert(changes.some(change=>change.kind==='added'));
  close.reopenedAt='2026-08-02T00:00:00Z';assert.strictEqual(closeEngine.activeFor([close],account),null);
}

function testRecurringMatch() {
  const context=vm.createContext({window:{}});vm.runInContext(read('js/recurring-match.js'),context);
  const engine=context.window.PocketLedgerRecurringMatch,item={id:'rent',name:'Monthly Rent',kind:'expense',account:'Current Account',amount:950,nextDate:'2026-08-01',status:'active'};
  const transactions=[{id:'actual',date:'2026-08-03',description:'RENT PAYMENT',amount:-975,account:'Current Account'},{id:'wrong',date:'2026-08-02',description:'Salary',amount:2000,account:'Current Account'}];
  const candidates=engine.candidates(item,transactions);assert.strictEqual(candidates.length,1);assert.strictEqual(candidates[0].transaction.id,'actual');assert.strictEqual(candidates[0].changedPrice,false);assert.strictEqual(engine.status(item,transactions,'2026-08-10').overdue,true);
  const record=engine.link({uid:()=> 'match-1',item,transaction:transactions[0],matchedAt:'2026-08-03T12:00:00Z'});assert.strictEqual(record.expectedDate,'2026-08-01');assert.strictEqual(record.actualDate,'2026-08-03');assert.strictEqual(transactions[0].recurringItemId,'rent');
}

function testDesktopPreferences() {
  const context=vm.createContext({window:{}});vm.runInContext(read('js/preferences.js'),context);
  const preferences=context.window.PocketLedgerPreferences;
  const normal=preferences.normalise({density:'compact',transactionColumns:{account:false},lastUsedAccount:'Savings'});assert.strictEqual(normal.density,'compact');assert.strictEqual(normal.transactionColumns.account,false);assert.strictEqual(normal.transactionColumns.status,true);assert.strictEqual(normal.lastUsedAccount,'Savings');
  assert.deepStrictEqual(JSON.parse(JSON.stringify(preferences.ukTaxYear('2026-04-05'))),{from:'2025-04-06',to:'2026-04-05'});
  assert.deepStrictEqual(JSON.parse(JSON.stringify(preferences.ukTaxYear('2026-04-06'))),{from:'2026-04-06',to:'2027-04-05'});
  assert.deepStrictEqual(JSON.parse(JSON.stringify(preferences.month('2026-08-20'))),{from:'2026-08-01',to:'2026-08-20'});
}

function testAnomalyAlerts() {
  const context=vm.createContext({window:{}});vm.runInContext(read('js/anomalies.js'),context);
  const engine=context.window.PocketLedgerAnomalies,transactions=[10,11,9,35].map((amount,index)=>({id:`c${index}`,date:`2026-0${index+5}-01`,description:'Corner Shop',amount:-amount,category:'Shopping',account:'Current Account',status:'cleared'}));
  transactions.push(...[10,10,12].map((amount,index)=>({id:`s${index}`,date:`2026-0${index+5}-02`,description:'Video Service',amount:-amount,category:'Subscriptions',account:'Credit Card',status:'cleared'})));
  const database={transactions,recurringItems:[{id:'salary',name:'Salary',kind:'income',amount:2000,nextDate:'2026-08-01',status:'active'}],dismissedAlerts:[]};
  const report=engine.analyse(database,{today:'2026-08-20'});assert(report.alerts.some(alert=>alert.type==='unusual-spending'));assert(report.alerts.some(alert=>alert.type==='subscription-increase'));assert(report.alerts.some(alert=>alert.type==='missing-income'));
  database.dismissedAlerts=[{id:report.alerts[0].id,dismissedAt:'2026-08-20T00:00:00Z'}];assert.strictEqual(engine.analyse(database,{today:'2026-08-20'}).alerts.length,report.alerts.length-1);
}

function testReconciliationSession() {
  const context = vm.createContext({window: {}});
  vm.runInContext(read('js/money.js'), context);
  vm.runInContext(read('js/linked-events.js'), context);
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
  const importSession = {rows: [
    {rowNumber: 2, status: 'imported', transactionId: 'in', date: '2026-08-03'},
    {rowNumber: 3, status: 'excluded', transactionId: '', date: '2026-08-06'},
  ]};
  const match = engine.statementMatchSummary(importSession, database.transactions, 'Current Account', '2026-08-01', '2026-08-14');
  assert.strictEqual(match.matched.length, 1);
  assert.strictEqual(match.statementOnly.length, 1);
  assert.strictEqual(match.ledgerOnly.length, 2);
  const applied = engine.applyStatementMatches(match);
  assert.strictEqual(applied.matched, 1);
  assert.strictEqual(applied.pending, 2);
  assert.strictEqual(database.transactions[2].status, 'pending');
}

function checkBackupCompatibility() {
  const context = vm.createContext({window: {}});
  vm.runInContext(read('js/money.js'), context);
  vm.runInContext(read('js/rules.js'), context);
  vm.runInContext(read('js/model.js'), context);
  let database = null, sequence = 0;
  const empty = () => ({
    schemaVersion: 21, appVersion: '1.34', startingBalance: 0,
    categories: [], rules: [], transactions: [], wishlist: [], dismissedRecurring: [], regularCategories: [],
    recurringItems: [], savingsGoals: [], budgets: {}, accountStartingBalances: {}, merchantAliases: {}, accounts: [],
    accountRecords: [], discretionaryCategories: [], investmentCategories: [], pendingCards: [], reconciliations: {},
    lastBackupAt: null, lastImport: null, importSessions: [], importProfiles: [], netWorthSnapshots: [], investmentValuations: [], investmentActivities: [], investmentImportSessions: [], transactionLinks: [],
  });
  const model = context.window.PocketLedgerModel.create({
    getDB: () => database, uid: (prefix) => `${prefix}_${++sequence}`,
    clamp: (number, min, max) => Math.max(min, Math.min(max, number)), buildEmptyDB: empty,
    defaultCategories: [], normaliseRules: context.window.PocketLedgerRules.normaliseRules,
    schemaVersion: 21, appVersion: '1.34', money: context.window.PocketLedgerMoney,
  });
  const backupPath = path.resolve(root, '../../upload/pocket-ledger-backup-2026-08-13.json');
  database = model.normaliseDB(JSON.parse(fs.readFileSync(backupPath, 'utf8')));
  assert.strictEqual(database.transactions.length, 1116);
  assert.strictEqual(database.rules.length, 141);
  assert.strictEqual(database.schemaVersion, 21);
  assert.strictEqual(database.transactions.filter((transaction) => transaction.account === 'Imported').length, 0);
  assert.strictEqual(database.transactions.filter((transaction) => transaction.account === 'Current Account').length > 0, true);
  assert.strictEqual(database.lastAccountMigration.count, 4);
  assert.strictEqual(database.lastAccountMigration.target, 'Current Account');
  assert.strictEqual(database.transactions.every((transaction) => !transaction.account || !!transaction.accountId), true);
  assert.strictEqual(database.transactions.every((transaction) => Math.abs(Math.round(transaction.amount * 100) - transaction.amount * 100) < 1e-8), true);
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
  vm.runInContext("(()=>{const account='Current Account',accountRecord=accountRecordFor(account),linked=DB.transactions.find(transaction=>transaction.account===account);DB.importSessions.push({id:'statement-shell',fileName:'statement.csv',fileFingerprint:'abc',importedAt:new Date().toISOString(),accountId:accountRecord.id,accountName:account,startDate:'2026-01-01',endDate:todayISO(),closingBalance:clearedAccountBalance(account,todayISO()),importedCount:1,duplicateCount:0,rows:[{rowNumber:2,status:'imported',transactionId:linked.id,date:linked.date,description:linked.description,amount:linked.amount}]});UI.reconcileAccount=account;UI.reconcileImportSessionId='statement-shell';UI.reconcileStartDate='2026-01-01';UI.reconcileDate=todayISO();UI.reconcileStep=3;setTab('reconcile');const balance=clearedAccountBalance(account,todayISO());completeReconciliation(account,'2026-01-01',todayISO(),balance,[]);const history=reconciliationHistory(account),record=history[history.length-1];if(!record||record.auditVersion!==1||!record.transactionSnapshots.length||record.completedSchemaVersion!==21||record.importSessionId!=='statement-shell'||record.statementMatchedCount!==1)throw new Error('assisted audit snapshot was not stored');const audit=PocketLedgerReconciliation.snapshotAudit(record,DB.transactions,account);if(!audit.ok)throw new Error('fresh audit snapshot failed');setTab('dashboard');})()", context);
  assert.strictEqual(elements.get('page-title').textContent, 'Dashboard');
}

(async () => {
  parseJavaScript();
  checkPwaAssets();
  testAccountView();
  testDiagnostics();
  testTransfers();
  await testImportProvenance();
  testTrading212Import();
  testLinkedEvents();
  testRuleWorkshop();
  testBackupIntegrity();
  testReviewInbox();
  testPeriodClose();
  testRecurringMatch();
  testDesktopPreferences();
  testAnomalyAlerts();
  testReconciliationSession();
  checkBackupCompatibility();
  await executeApplicationShell();
  console.log('v1.34 checkpoint checks passed');
})().catch((error) => { console.error(error); process.exitCode = 1; });
