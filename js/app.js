/* =========================================================
   POCKET LEDGER — application shell and UI logic
   ========================================================= */

const APP_VERSION = '1.34';
const SCHEMA_VERSION = 21;
const STORAGE_KEY = 'pocketledger:data:v1';
const PRE_RESTORE_KEY = 'pocketledger_pre_restore_v1';
const {gbp,ukDate,ukDateShort,timeAgoLabel,monthLabel,escHTML,escAttr,statusLabel,statusPillHTML}=PocketLedgerUI.create();
const Money=PocketLedgerMoney;

const ACCOUNT_TYPES=PocketLedgerModel.ACCOUNT_TYPES;
const RECURRING_FREQUENCIES=PocketLedgerModel.RECURRING_FREQUENCIES;

const DEFAULT_CATEGORIES = [
  {name:'Salary', kind:'income'},
  {name:'Freelance', kind:'income'},
  {name:'Interest', kind:'income'},
  {name:'Gifts Received', kind:'income'},
  {name:'Other Income', kind:'income'},
  {name:'Rent/Mortgage', kind:'expense'},
  {name:'Groceries', kind:'expense'},
  {name:'Utilities', kind:'expense'},
  {name:'Transport', kind:'expense'},
  {name:'Dining Out', kind:'expense'},
  {name:'Entertainment', kind:'expense'},
  {name:'Health', kind:'expense'},
  {name:'Shopping', kind:'expense'},
  {name:'Subscriptions', kind:'expense'},
  {name:'Insurance', kind:'expense'},
  {name:'Savings/Investment', kind:'expense'},
  {name:'Education', kind:'expense'},
  {name:'Travel', kind:'expense'},
  {name:'Credit Card Payment', kind:'expense'},
  {name:'Other Expense', kind:'expense'},
];

const DEFAULT_RULES = [
  {keyword:'TESCO', category:'Groceries'},
  {keyword:'SAINSBURY', category:'Groceries'},
  {keyword:'ASDA', category:'Groceries'},
  {keyword:'MORRISONS', category:'Groceries'},
  {keyword:'ALDI', category:'Groceries'},
  {keyword:'LIDL', category:'Groceries'},
  {keyword:'WAITROSE', category:'Groceries'},
  {keyword:'NETFLIX', category:'Subscriptions'},
  {keyword:'SPOTIFY', category:'Subscriptions'},
  {keyword:'DISNEY', category:'Subscriptions'},
  {keyword:'AMAZON PRIME', category:'Subscriptions'},
  {keyword:'UBER', category:'Transport'},
  {keyword:'TFL', category:'Transport'},
  {keyword:'TRAINLINE', category:'Transport'},
  {keyword:'SHELL', category:'Transport'},
  {keyword:'BP ', category:'Transport'},
  {keyword:'COSTA', category:'Dining Out'},
  {keyword:'STARBUCKS', category:'Dining Out'},
  {keyword:'PRET', category:'Dining Out'},
  {keyword:'DELIVEROO', category:'Dining Out'},
  {keyword:'JUST EAT', category:'Dining Out'},
  {keyword:'BRITISH GAS', category:'Utilities'},
  {keyword:'THAMES WATER', category:'Utilities'},
  {keyword:'EDF', category:'Utilities'},
  {keyword:'OCTOPUS ENERGY', category:'Utilities'},
  {keyword:'RENT', category:'Rent/Mortgage'},
  {keyword:'MORTGAGE', category:'Rent/Mortgage'},
  {keyword:'SALARY', category:'Salary'},
  {keyword:'PAYROLL', category:'Salary'},
  {keyword:'GYM', category:'Health'},
];

function uid(prefix){ return (prefix||'id') + '_' + Math.random().toString(36).slice(2,10) + Date.now().toString(36); }
function localISODate(d){
  d = d || new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}
function todayISO(){ return localISODate(new Date()); }
function clamp(n,a,b){ return Math.max(a, Math.min(b,n)); }
function nextMonthDate(day){
  const now=new Date(),candidate=new Date(now.getFullYear(),now.getMonth(),day);
  if(candidate<=new Date(now.getFullYear(),now.getMonth(),now.getDate())) candidate.setMonth(candidate.getMonth()+1);
  return localISODate(candidate);
}

const {
  isPlainObject,validISODate,finiteNumber,accountTypeConfig,isLiabilityType,inferAccountType,makeAccountRecord,
  transactionStatus,countsTowardTotals,expenseEffect,categoryRowsFor,expandSplits,sumIncome,sumExpense,accountRecordFor,
  transactionAccountRecord,transactionBelongsToAccount,
  allAccountNames,activeAccountNames,isLegacyImportedAccount,preferredImportAccountName,syncLegacyAccounts,
  ensureAccountRecord,accountOpeningBalance,accountTransactionsTo,clearedAccountBalance,reconciliationHistory,currentBalance,
  normaliseTransaction,normaliseAccountRecord,normaliseRecurringItem,normaliseSavingsGoal,normaliseInvestmentValuation,
  migrateAccountRecords,preferredCurrentAccountNameFromRaw,migrateLegacyImportedAssignments,normaliseDB,
}=PocketLedgerModel.create({
  getDB:()=>DB,uid,clamp,buildEmptyDB,defaultCategories:DEFAULT_CATEGORIES,
  normaliseRules:PocketLedgerRules.normaliseRules,schemaVersion:SCHEMA_VERSION,appVersion:APP_VERSION,money:Money,
});

function buildSeedDB(){
  const tx = [];
  const months = [1,2,3,4,5,6,7];
  let rand = mulberry32(42);
  function rnd(min,max){ return Math.round((min + rand()*(max-min))*100)/100; }
  function pick(arr){ return arr[Math.floor(rand()*arr.length)]; }
  months.forEach(m=>{
    const y = 2026;
    const dstr = (d)=> `${y}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
    tx.push({id:uid('tx'), date:dstr(1), description:'Monthly Salary', amount:2450.00, category:'Salary', account:'Current Account', notes:'', source:'sample'});
    if(m%2===0) tx.push({id:uid('tx'), date:dstr(14), description:'Freelance web project', amount:rnd(200,450), category:'Freelance', account:'Current Account', notes:'', source:'sample'});
    tx.push({id:uid('tx'), date:dstr(5), description:'Savings interest', amount:rnd(3,10), category:'Interest', account:'Savings', notes:'', source:'sample'});
    tx.push({id:uid('tx'), date:dstr(1), description:'Rent', amount:-950.00, category:'Rent/Mortgage', account:'Current Account', notes:'', source:'sample'});
    tx.push({id:uid('tx'), date:dstr(3), description:'British Gas - electricity & gas', amount:-rnd(60,110), category:'Utilities', account:'Current Account', notes:'', source:'sample'});
    tx.push({id:uid('tx'), date:dstr(4), description:'BT Internet & phone', amount:-42.00, category:'Utilities', account:'Current Account', notes:'', source:'sample'});
    tx.push({id:uid('tx'), date:dstr(2), description:'Car insurance', amount:-58.00, category:'Insurance', account:'Current Account', notes:'', source:'sample'});
    tx.push({id:uid('tx'), date:dstr(6), description:'Netflix subscription', amount:-15.99, category:'Subscriptions', account:'Credit Card', notes:'', source:'sample'});
    tx.push({id:uid('tx'), date:dstr(15), description:'PureGym membership', amount:-29.99, category:'Subscriptions', account:'Credit Card', notes:'', source:'sample'});
    [2,9,16,23].forEach(d=> tx.push({id:uid('tx'), date:dstr(clamp(d,1,27)), description:'Tesco Store', amount:-rnd(30,70), category:'Groceries', account:'Credit Card', notes:'', source:'sample'}));
    for(let i=0;i<3;i++) tx.push({id:uid('tx'), date:dstr(Math.floor(rand()*27)+1), description:pick(['Shell Garage','TFL Travel','Trainline']), amount:-rnd(10,40), category:'Transport', account:'Credit Card', notes:'', source:'sample'});
    for(let i=0;i<3;i++) tx.push({id:uid('tx'), date:dstr(Math.floor(rand()*27)+1), description:pick(['Nandos','Costa Coffee','Deliveroo']), amount:-rnd(8,35), category:'Dining Out', account:'Credit Card', notes:'', source:'sample'});
    for(let i=0;i<2;i++) tx.push({id:uid('tx'), date:dstr(Math.floor(rand()*27)+1), description:pick(['Cinema','Spotify','Steam Game']), amount:-rnd(10,45), category:'Entertainment', account:'Credit Card', notes:'', source:'sample'});
    tx.push({id:uid('tx'), date:dstr(1), description:'Pension contribution', amount:-250.00, category:'Savings/Investment', account:'Current Account', notes:'External investment contribution', source:'sample'});
    // A card payment is a transfer: cash falls in the current account while
    // the matching positive entry reduces the card liability. Recording only
    // the bank side would count the same spending twice in net worth.
    const cardPayment=rnd(120,420),cardPaymentDate=dstr(clamp(22+Math.floor(rand()*4),1,27)),cardTransferId=uid('xfer');
    tx.push(
      {id:uid('tx'),date:cardPaymentDate,description:'Credit card payment',amount:-cardPayment,category:'',account:'Current Account',notes:'',source:'sample',transferId:cardTransferId},
      {id:uid('tx'),date:cardPaymentDate,description:'Payment received',amount:cardPayment,category:'',account:'Credit Card',notes:'',source:'sample',transferId:cardTransferId},
    );
  });
  tx.forEach(t=>{ t.status = 'cleared'; });
  tx.sort((a,b)=> a.date.localeCompare(b.date));
  return {
    schemaVersion: SCHEMA_VERSION,
    appVersion: APP_VERSION,
    startingBalance: 500,
    categories: JSON.parse(JSON.stringify(DEFAULT_CATEGORIES)),
    rules: JSON.parse(JSON.stringify(DEFAULT_RULES)),
    transactions: tx,
    wishlist: [
      {id:uid('wish'), name:'New laptop', amount:850, targetDate:'', createdAt:todayISO()},
      {id:uid('wish'), name:'Weekend trip', amount:220, targetDate:'', createdAt:todayISO()},
    ],
    dismissedRecurring: [],
    regularCategories: [],
    recurringItems: [
      {id:uid('rec'),name:'Monthly Salary',kind:'income',category:'Salary',account:'Current Account',amount:2450,variable:false,minAmount:null,maxAmount:null,frequency:'monthly',customDays:null,nextDate:nextMonthDate(1),anchorDay:1,endDate:'',status:'active',notes:'',createdAt:new Date().toISOString(),lastMatchedDate:''},
      {id:uid('rec'),name:'Rent',kind:'expense',category:'Rent/Mortgage',account:'Current Account',amount:950,variable:false,minAmount:null,maxAmount:null,frequency:'monthly',customDays:null,nextDate:nextMonthDate(1),anchorDay:1,endDate:'',status:'active',notes:'',createdAt:new Date().toISOString(),lastMatchedDate:''},
      {id:uid('rec'),name:'Netflix subscription',kind:'expense',category:'Subscriptions',account:'Credit Card',amount:15.99,variable:false,minAmount:null,maxAmount:null,frequency:'monthly',customDays:null,nextDate:nextMonthDate(6),anchorDay:6,endDate:'',status:'active',notes:'',createdAt:new Date().toISOString(),lastMatchedDate:''},
    ],
    savingsGoals: [
      {id:uid('goal'),name:'Emergency fund',type:'goal',targetAmount:3000,targetDate:addMonths(todayISO(),12),account:'Savings',priority:'high',status:'active',notes:'Three months of essential expenses',createdAt:new Date().toISOString(),activity:[{id:uid('ga'),date:todayISO(),amount:500,notes:'Opening allocation'}]},
      {id:uid('goal'),name:'Annual insurance',type:'sinking_fund',targetAmount:600,targetDate:addMonths(todayISO(),8),account:'Savings',priority:'medium',status:'active',notes:'Build up gradually before renewal',createdAt:new Date().toISOString(),activity:[{id:uid('ga'),date:todayISO(),amount:150,notes:'Opening allocation'}]},
    ],
    budgets: { 'Groceries':400, 'Dining Out':150, 'Entertainment':100, 'Transport':120, 'Subscriptions':80 },
    accountStartingBalances: { 'Current Account':500, 'Savings': 300, 'Credit Card':0 },
    merchantAliases: {},
    accounts: ['Current Account', 'Savings', 'Credit Card'],
    accountRecords: [
      makeAccountRecord('Current Account','current',500),
      makeAccountRecord('Savings','savings',300),
      makeAccountRecord('Credit Card','credit_card',0,{creditLimit:3000}),
    ],
    discretionaryCategories: ['Dining Out', 'Entertainment', 'Shopping', 'Subscriptions', 'Travel'],
    investmentCategories: ['Savings/Investment'],
    pendingCards: [],
    reconciliations: {},
    lastBackupAt: null,
    lastImport: null,
    importSessions: [],
    importProfiles: [],
    netWorthSnapshots: [],
    investmentValuations: [],
    investmentActivities: [],
    investmentImportSessions: [],
    transactionLinks: [],
    savedViews: [],
    accountCloses: [],
    accountCloseAudit: [],
    recurringMatches: [],
    appPreferences: PocketLedgerPreferences.normalise(),
    dismissedAlerts: [],
  };
}
function mulberry32(a){ return function(){ let t=a+=0x6D2B79F5; t=Math.imul(t^t>>>15,t|1); t^=t+Math.imul(t^t>>>7,t|61); return ((t^t>>>14)>>>0)/4294967296; }; }

function buildEmptyDB(){
  return {
    schemaVersion: SCHEMA_VERSION,
    appVersion: APP_VERSION,
    startingBalance: 0,
    categories: JSON.parse(JSON.stringify(DEFAULT_CATEGORIES)),
    rules: JSON.parse(JSON.stringify(DEFAULT_RULES)),
    transactions: [],
    wishlist: [],
    dismissedRecurring: [],
    regularCategories: [],
    recurringItems: [],
    savingsGoals: [],
    budgets: {},
    accountStartingBalances: {},
    merchantAliases: {},
    accounts: [],
    accountRecords: [],
    discretionaryCategories: [],
    investmentCategories: [],
    pendingCards: [],
    reconciliations: {},
    lastBackupAt: null,
    lastImport: null,
    importSessions: [],
    importProfiles: [],
    netWorthSnapshots: [],
    investmentValuations: [],
    investmentActivities: [],
    investmentImportSessions: [],
    transactionLinks: [],
    savedViews: [],
    accountCloses: [],
    accountCloseAudit: [],
    recurringMatches: [],
    appPreferences: PocketLedgerPreferences.normalise(),
    dismissedAlerts: [],
  };
}

/* ---------- persistence ---------- */
let DB = null;
let saveTimer = null;
// window.storage is a Claude-only API. When this app is self-hosted (GitHub
// Pages, etc.) and installed as a PWA, that API doesn't exist — so we use
// IndexedDB. The v1 localStorage record is retained unchanged as a recovery
// copy after its contents have been written and read back verbatim.
const IN_CLAUDE = !!(window.storage && window.storage.get && window.storage.set);
const LOCAL_KEY = 'pocketledger_data_v1';
let BROWSER_STORAGE=null;
async function browserStorage(){
  if(!BROWSER_STORAGE){
    BROWSER_STORAGE=PocketLedgerStorage.create({indexedDB:window.indexedDB,localStorage:window.localStorage,localKey:LOCAL_KEY,dbName:'pocketledger',storeName:'ledger'});
    await BROWSER_STORAGE.init();
  }
  return BROWSER_STORAGE;
}
function scheduleSave(){
  clearTimeout(saveTimer);
  saveTimer = setTimeout(persist, 450);
}
async function persist(){
  if(DB&&DB.accountRecords) syncLegacyAccounts();
  const json = JSON.stringify(DB);
  try{
    if(IN_CLAUDE){
      await window.storage.set(STORAGE_KEY, json, false);
    } else await (await browserStorage()).save(json);
  }catch(e){
    console.error('save failed', e);
    toast('Could not save changes — try again in a moment', 'error');
  }
}
async function loadDB(){
  try{
    if(IN_CLAUDE){
      const res = await window.storage.get(STORAGE_KEY, false);
      if(res && res.value) return JSON.parse(res.value);
      return null;
    }
    const raw=await (await browserStorage()).load();
    if(raw)return JSON.parse(raw);
  }catch(e){ /* key not found, storage unavailable, or corrupt JSON */ }
  return null;
}

function mondayOf(iso){
  const d = new Date(iso + 'T00:00:00');
  const day = (d.getDay() + 6) % 7; // 0 = Monday
  d.setDate(d.getDate() - day);
  return localISODate(d);
}
function addDays(iso, n){
  const d = new Date(iso + 'T00:00:00');
  d.setDate(d.getDate()+n);
  return localISODate(d);
}
function addMonths(iso, n){
  const d = new Date(iso + 'T00:00:00');
  d.setMonth(d.getMonth()+n);
  return localISODate(d);
}
function monthKey(iso){ return iso.slice(0,7); }
function yearKey(iso){ return iso.slice(0,4); }

/* ---------- category helpers ---------- */
function categoryKind(name){
  const c = DB.categories.find(c=>c.name===name);
  return c ? c.kind : null;
}
function categoryOptionsHTML(selected, opts){
  opts = opts || {};
  const groups = {income:[], expense:[]};
  DB.categories.forEach(c=> groups[c.kind].push(c.name));
  let html = '';
  if(opts.includeUncategorized !== false){
    html += `<option value="" ${!selected?'selected':''}>Uncategorised</option>`;
  }
  html += `<optgroup label="Income">` + groups.income.map(n=>`<option value="${escAttr(n)}" ${n===selected?'selected':''}>${escHTML(n)}</option>`).join('') + `</optgroup>`;
  html += `<optgroup label="Expense">` + groups.expense.map(n=>`<option value="${escAttr(n)}" ${n===selected?'selected':''}>${escHTML(n)}</option>`).join('') + `</optgroup>`;
  return html;
}
function suggestCategory(description, amount){
  return PocketLedgerRules.suggestCategory(DB.rules,description,amount);
}

/* ---------- calc helpers ---------- */
function txInRange(from, to){
  return DB.transactions.filter(t=> t.date >= from && t.date <= to);
}
// A transaction can optionally carry t.splits = [{id, category, amount}, ...]
// instead of a single t.category, when its total is allocated across more
// than one category (e.g. one supermarket trip covering groceries and
// household goods). t.category is blank while split. Anywhere that groups or
// sums by category needs to see the split pieces individually rather than
// the one parent row — categoryRowsFor/expandSplits do that; anything that
// only cares about the total cash amount (sumIncome, sumExpense, balance,
// duplicate detection, merchant grouping) can keep using the plain list,
// since a split doesn't change the transaction's date, account, or total.
/* =========================================================
   INVESTMENT VALUATIONS
   Valuations are end-of-day account checkpoints. They are deliberately
   separate from transactions: market movement changes net worth, but is not
   income or spending. Transactions after the latest checkpoint remain live.
   ========================================================= */
const {
  investmentAccountRecords,investmentValuationsForAccount,latestInvestmentValuation,
  accountTransactionsTotal,accountTransferFlow,accountBalanceByName,
  investmentValuationPerformance,latestInvestmentPerformance,investExpenseList,
  investmentTransferContributionList,investmentContributionList,sumInvest,
  investmentTransferWithdrawalList,legacyInvestmentWithdrawalList,investmentWithdrawalList,
  investmentAccountLifetimeStats,investmentPortfolioStats,
}=PocketLedgerInvestments.create({
  getDB:()=>DB,todayISO,transactionStatus,accountOpeningBalance,expandSplits,countsTowardTotals,
});
function perAccountBalances(){
  const accounts = new Set((DB.accountRecords||[]).map(r=>r.name));
  (DB.accounts||[]).forEach(a=>accounts.add(a));
  Object.keys(DB.accountStartingBalances).forEach(a=> accounts.add(a));
  DB.transactions.forEach(t=>{ if(t.account) accounts.add(t.account); });
  const rows = [...accounts].map(account=>{
    const list = DB.transactions.filter(t=> t.account===account);
    const balance = accountBalanceByName(account);
    const record=accountRecordFor(account);
    return { account, balance, count: list.length, record, type:record?record.type:'current', archived:!!(record&&record.archived) };
  });
  const unassigned = DB.transactions.filter(t=> !t.account);
  if(unassigned.length){
    rows.push({ account:'Unassigned', balance: unassigned.reduce((s,t)=>s+t.amount,0), count: unassigned.length, unassigned:true });
  }
  return rows.sort((a,b)=> b.balance-a.balance);
}
function merchantKeyFor(description){
  return normalizeDescForRecurring(description) || description.trim().toUpperCase() || 'Unknown';
}
function topMerchants(list, limit){
  limit = limit || 8;
  const byMerchant = {};
  list.forEach(t=>{
    if(t.amount>=0 || !countsTowardTotals(t)) return;
    const rawKey = merchantKeyFor(t.description);
    const key = DB.merchantAliases[rawKey] || rawKey;
    byMerchant[key] = byMerchant[key] || {total:0, count:0, rawKeys:new Set()};
    byMerchant[key].total += Math.abs(t.amount);
    byMerchant[key].count += 1;
    byMerchant[key].rawKeys.add(rawKey);
  });
  return Object.entries(byMerchant)
    .map(([name,v])=> ({name, total:v.total, count:v.count, rawKeys:[...v.rawKeys]}))
    .sort((a,b)=> b.total-a.total)
    .slice(0, limit);
}
function allKnownMerchantNames(){
  const names = new Set();
  DB.transactions.forEach(t=>{
    if(t.amount>=0 || !countsTowardTotals(t)) return;
    let key = merchantKeyFor(t.description);
    if(DB.merchantAliases[key]) key = DB.merchantAliases[key];
    names.add(key);
  });
  return [...names].sort();
}

function periodRange(period){
  const now = new Date();
  if(period==='month'){
    const base = new Date(now.getFullYear(), now.getMonth() + UI.dashboardMonthOffset, 1);
    const from = localISODate(base);
    const to = localISODate(new Date(base.getFullYear(), base.getMonth()+1, 0));
    return {from, to, label: base.toLocaleDateString('en-GB',{month:'long', year:'numeric'})};
  }
  if(period==='year'){
    const y = now.getFullYear() + UI.dashboardYearOffset;
    return {from:`${y}-01-01`, to:`${y}-12-31`, label:String(y)};
  }
  return {from:'0000-01-01', to:'9999-12-31', label:'All time'};
}
function previousPeriodRange(period){
  const now = new Date();
  if(period==='month'){
    const base = new Date(now.getFullYear(), now.getMonth() + UI.dashboardMonthOffset - 1, 1);
    const from = localISODate(base);
    const to = localISODate(new Date(base.getFullYear(), base.getMonth()+1, 0));
    return {from, to, label: base.toLocaleDateString('en-GB',{month:'long', year:'numeric'})};
  }
  if(period==='year'){
    const y = now.getFullYear() + UI.dashboardYearOffset - 1;
    return {from:`${y}-01-01`, to:`${y}-12-31`, label:String(y)};
  }
  return null;
}

/* ---------- toast ---------- */
function toast(msg, type, opts){
  opts = opts || {};
  const host = document.getElementById('toast-host');
  const el = document.createElement('div');
  el.className = 'toast' + (type==='error' ? ' error' : '');
  const span = document.createElement('span');
  span.style.flex = '1';
  span.textContent = msg;
  el.appendChild(span);
  let dismissed = false;
  function dismiss(){
    if(dismissed) return;
    dismissed = true;
    el.style.opacity='0'; el.style.transition='opacity .25s'; setTimeout(()=>el.remove(),250);
  }
  if(opts.actionLabel && opts.onAction){
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'toast-action';
    btn.textContent = opts.actionLabel;
    btn.onclick = ()=>{ dismiss(); opts.onAction(); };
    el.appendChild(btn);
  }
  host.appendChild(el);
  setTimeout(dismiss, opts.duration || 2600);
}

/* ---------- modal ---------- */
function openModal(html, opts){
  opts = opts || {};
  const host = document.getElementById('modal-host');
  host.innerHTML = `<div class="modal-overlay" id="modal-overlay"><div class="modal ${opts.wide?'wide':''}" role="dialog" aria-modal="true">${html}</div></div>`;
  document.getElementById('modal-overlay').addEventListener('mousedown', (e)=>{
    if(e.target.id==='modal-overlay') closeModal();
  });
  document.addEventListener('keydown', escCloseOnce);
}
function escCloseOnce(e){ if(e.key==='Escape'){ closeModal(); } }
function closeModal(){
  document.getElementById('modal-host').innerHTML = '';
  document.removeEventListener('keydown', escCloseOnce);
}

/* =========================================================
   STATE
   ========================================================= */
const UI = {
  tab: 'dashboard',
  dashboardPeriod: 'month',
  dashboardMonthOffset: 0,
  upcomingDays: 30,
  dashboardYearOffset: 0,
  trendGran: 'month',
  balanceGran: 'month',
  showForecast: false,
  txSort: {col:'date', dir:'desc'},
  txSelected: new Set(),
  txFilters: {search:'', category:'all', type:'all', status:'all', from:'', to:'', preset:''},
  charts: {},
  importState: null,
  investPeriod: 'month',
  insightsPeriod: 'month',
  reconcileAccount: '',
  reconcileStep: 1,
  reconcileStartDate: '',
  reconcileDate: todayISO(),
  reconcileStatementBalance: '',
  reconcileImportSessionId: '',
  reconcileWarningsAcknowledged: false,
  lastUndo: null,
  selectedSavedViewId: '',
};
// Generic one-shot undo for bulk actions. Only the most recent bulk action
// is remembered — a fresh one simply replaces it rather than building a full
// history stack, which keeps this simple and matches what the "Undo" toast
// button can realistically offer anyway (undoing three actions ago via a
// toast that's long since disappeared isn't a real workflow).
function pushUndo(label, restoreFn){
  UI.lastUndo = {label, restore:restoreFn};
}
function offerUndo(message){
  if(!UI.lastUndo) { toast(message); return; }
  const label = UI.lastUndo.label;
  toast(message, null, {
    actionLabel: 'Undo',
    duration: 7000,
    onAction: ()=>{
      if(!UI.lastUndo) return;
      UI.lastUndo.restore();
      UI.lastUndo = null;
      scheduleSave(); renderContent(); renderSidebarBits();
      toast(`Undone: ${label}`);
    },
  });
}
function activeCloseForTransaction(transaction){const record=transactionAccountRecord(transaction);return record?PocketLedgerPeriodClose.activeFor(DB.accountCloses,record):null;}
function closedPeriodBlocks(transaction){const close=activeCloseForTransaction(transaction);return close&&PocketLedgerPeriodClose.protects(transaction,close)?close:null;}
function warnClosedPeriod(transaction){const close=closedPeriodBlocks(transaction);if(!close)return false;toast(`This entry is protected by the ${ukDate(close.closedThrough)} close. Reopen it from Reconcile first.`,'error',{duration:5200});return true;}
function saveDesktopPreferences(){DB.appPreferences=PocketLedgerPreferences.normalise(Object.assign({},DB.appPreferences,{transactionSort:UI.txSort,transactionFilters:UI.txFilters}));scheduleSave();}
function applyDesktopPreferences(){const preferences=PocketLedgerPreferences.normalise(DB.appPreferences);DB.appPreferences=preferences;UI.txSort=Object.assign({},preferences.transactionSort);UI.txFilters=Object.assign({},preferences.transactionFilters);document.body.classList.toggle('density-compact',preferences.density==='compact');}
function openCommandPalette(){
  const commands=[['Add transaction','n',()=>openTxModal(null)],['Search transactions','/',()=>{setTab('transactions');setTimeout(()=>document.getElementById('f-search')?.focus(),0);}],['Import statement','i',()=>setTab('import')],['Reconcile accounts','r',()=>setTab('reconcile')],['Review inbox','v',()=>setTab('review')]];
  openModal(`<div class="modal-head"><h3>Keyboard commands</h3></div><div class="modal-body">${commands.map((command,index)=>`<button class="btn" style="display:flex;width:100%;justify-content:space-between;margin-bottom:7px;" data-command="${index}"><span>${command[0]}</span><kbd>${command[1]}</kbd></button>`).join('')}<p style="font-size:11px;color:var(--ink-faint);margin:10px 0 0;">Press ? anywhere outside a form to reopen this palette. Escape closes dialogs.</p></div><div class="modal-foot"><button class="btn btn-primary" id="m-close">Close</button></div>`);
  document.querySelectorAll('[data-command]').forEach(button=>button.onclick=()=>{const action=commands[Number(button.dataset.command)][2];closeModal();action();});document.getElementById('m-close').onclick=closeModal;
}

const NAV_ICONS_TITLE = {
  dashboard: ['Dashboard','All figures update automatically from your transactions.'],
  transactions: ['Transactions','Every income and outgoing you\u2019ve logged or imported.'],
  reconcile: ['Reconcile accounts','Check your ledger against a bank statement and lock an agreed balance.'],
  health: ['Data Health','Read-only checks for account, transfer, reconciliation, rule and valuation problems.'],
  review: ['Review inbox','Work through categorisation, duplicate, transfer and investment-funding exceptions.'],
  import: ['Import statement','Bring in a CSV from your bank and assign categories in bulk.'],
  categories: ['Categories','Manage the groups used across your dashboard and imports, and the auto-tagging rules.'],
  plan: ['Spending Plan','What you can actually afford, based on your balance and regular bills.'],
  investments: ['Investments','How much you\u2019re putting away, and how much more room you likely have.'],
  networth: ['Net Worth','Your included assets minus liabilities, with snapshots you control.'],
  insights: ['Insights','Patterns in your spending that a single total won\u2019t show you.'],
};

function setTab(tab){
  UI.tab = tab;
  document.querySelectorAll('.nav-item').forEach(b=> b.classList.toggle('active', b.dataset.tab===tab));
  const [title, sub] = NAV_ICONS_TITLE[tab];
  document.getElementById('page-title').textContent = title;
  document.getElementById('page-sub').textContent = sub;
  renderTopbarActions();
  renderContent();
}

/* =========================================================
   RENDER: shell bits
   ========================================================= */
function renderSidebarBits(){
  document.getElementById('sidebar-balance').textContent = gbp(currentBalance());
  const uncat = DB.transactions.filter(t=>!t.category && !t.transferId && !(t.splits&&t.splits.length)).length;
  const badge = document.getElementById('uncat-badge');
  if(uncat>0){ badge.textContent = uncat; badge.classList.remove('hidden'); }
  else{ badge.classList.add('hidden'); }
}

function renderTopbarActions(){
  const host = document.getElementById('topbar-actions');
  if(UI.tab==='transactions'){
    host.innerHTML = `
      <button class="btn" id="btn-autocat">${iconWand()} Auto-categorise</button>
      <button class="btn" id="btn-recheck">${iconRefresh()} Re-check all</button>
      <button class="btn" id="btn-find-dupes">${iconLayers()} Find duplicates</button>
      <button class="btn btn-primary" id="btn-add-tx">${iconPlus()} Add transaction</button>`;
    document.getElementById('btn-add-tx').onclick = ()=> openTxModal(null);
    document.getElementById('btn-autocat').onclick = autoCategoriseAll;
    document.getElementById('btn-recheck').onclick = reapplyRulesToAll;
    document.getElementById('btn-find-dupes').onclick = openDuplicatesModal;
    updateRecheckButtonLabel();
  } else if(UI.tab==='categories'){
    host.innerHTML = `<button class="btn btn-primary" id="btn-add-cat">${iconPlus()} Add category</button>`;
    document.getElementById('btn-add-cat').onclick = ()=> openCategoryModal(null);
  } else if(UI.tab==='plan'){
    host.innerHTML = `<button class="btn" id="btn-add-recurring">${iconPlus()} Add recurring</button><button class="btn" id="btn-add-wish">${iconPlus()} Add to wishlist</button><button class="btn btn-primary" id="btn-add-goal">${iconPlus()} Add goal</button>`;
    document.getElementById('btn-add-recurring').onclick = ()=> openRecurringModal(null);
    document.getElementById('btn-add-wish').onclick = ()=> openWishModal(null);
    document.getElementById('btn-add-goal').onclick = ()=> openSavingsGoalModal(null);
  } else if(UI.tab==='investments'){
    host.innerHTML = `<button class="btn btn-primary" id="btn-update-investment-value">${iconPlus()} Update value</button>`;
    document.getElementById('btn-update-investment-value').onclick = ()=>openInvestmentValuationModal(null);
  } else if(UI.tab==='networth'){
    host.innerHTML = `<button class="btn btn-primary" id="btn-save-networth">${iconPlus()} Save today\u2019s snapshot</button>`;
    document.getElementById('btn-save-networth').onclick = saveNetWorthSnapshot;
  } else {
    host.innerHTML = '';
  }
}

function iconPlus(){ return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>`; }
function iconWand(){ return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M15 4V2M15 16v-2M8 9h2M20 9h2M17.8 11.8 19 13M15 9l-9.9 9.9a1 1 0 0 0 0 1.4l.6.6a1 1 0 0 0 1.4 0L17 12"/></svg>`; }
function iconRefresh(){ return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>`; }
function iconChevronLeft(){ return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="15 18 9 12 15 6"/></svg>`; }
function iconChevronRight(){ return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg>`; }

function renderContent(){
  renderSidebarBits();
  const c = document.getElementById('content');
  if(UI.tab==='dashboard') renderDashboard(c);
  else if(UI.tab==='transactions') renderTransactions(c);
  else if(UI.tab==='reconcile') renderReconcile(c);
  else if(UI.tab==='health') renderHealth(c);
  else if(UI.tab==='review') renderReview(c);
  else if(UI.tab==='import') renderImport(c);
  else if(UI.tab==='categories') renderCategories(c);
  else if(UI.tab==='plan') renderPlan(c);
  else if(UI.tab==='investments') renderInvestments(c);
  else if(UI.tab==='networth') renderNetWorth(c);
  else if(UI.tab==='insights') renderInsights(c);
}
