const {
  computeSavingsOpportunities,monthPaceInfo,pendingForCategory,savingsGoalBalance,
  savingsGoalMonthlyNeeded,savingsGoalStats,biggestTransactions,rollingSpendSeries,
  spendMomentum,spendByDayOfWeek,savingsRateTrend,netWorthSummary,
}=PocketLedgerReports.create({
  getDB:()=>DB,todayISO,localISODate,addDays,daysBetween,txInRange,trendBuckets,
  expandSplits,countsTowardTotals,sumIncome,sumExpense,accountBalanceByName,accountTypeConfig,
});
const NetWorthView=PocketLedgerNetWorthView.create({
  getDB:()=>DB,getUI:()=>UI,netWorthSummary,isLiabilityType,accountTypeConfig,gbp,escHTML,
  ukDate,ukDateShort,todayISO,uid,scheduleSave,renderContent,toast,cssVar,hexToRgba,
  chartTickColor,chartGridColor,
});
const renderNetWorth=NetWorthView.render;
const saveNetWorthSnapshot=NetWorthView.saveSnapshot;

/* =========================================================
   INIT
   ========================================================= */
let appStarted = false;
function startApp(){
  if(appStarted) return;
  appStarted = true;

  document.getElementById('nav').addEventListener('click', (e)=>{
    const b = e.target.closest('.nav-item'); if(!b) return;
    setTab(b.dataset.tab);
  });
  document.getElementById('btn-settings').onclick = openSettingsModal;
  document.getElementById('btn-export').onclick = exportBackup;
  document.getElementById('btn-theme-toggle').onclick = ()=>{
    setThemePref(isDarkMode() ? 'light' : 'dark');
    applyTheme();
    renderContent();
  };
  updateThemeToggleIcon();

  setTab('dashboard');

  // Register service worker if this file is being served from a real origin
  // (this silently does nothing inside a sandboxed preview — that's expected).
  if('serviceWorker' in navigator){
    navigator.serviceWorker.register('sw.js').catch(()=>{ /* not hosted standalone — fine */ });
  }
}
async function init(){
  const loaded = await loadDB();
  checkStorageHealth();
  try{ DB = loaded ? normaliseDB(loaded) : buildSeedDB(); }
  catch(e){
    console.error('Could not migrate saved data',e);
    DB = buildSeedDB();
    setTimeout(()=>toast(`Saved data could not be loaded: ${e.message}`, 'error', {duration:7000}),50);
  }
  if(!DB.wishlist) DB.wishlist = [];
  if(!DB.dismissedRecurring) DB.dismissedRecurring = [];
  if(!DB.regularCategories) DB.regularCategories = [];
  if(!DB.recurringItems) DB.recurringItems = [];
  if(!DB.savingsGoals) DB.savingsGoals = [];
  if(!DB.budgets) DB.budgets = {};
  if(!DB.accountStartingBalances) DB.accountStartingBalances = {};
  if(!DB.merchantAliases) DB.merchantAliases = {};
  if(!DB.accounts) DB.accounts = [];
  if(!DB.accountRecords) DB.accountRecords = [];
  if(!DB.discretionaryCategories) DB.discretionaryCategories = [];
  if(!DB.investmentCategories) DB.investmentCategories = [];
  if(!DB.pendingCards) DB.pendingCards = [];
  if(!DB.netWorthSnapshots) DB.netWorthSnapshots = [];
  if(!DB.investmentValuations) DB.investmentValuations = [];
  if(DB.lastImport === undefined) DB.lastImport = null;
  if(!loaded || (loaded.schemaVersion||1)!==SCHEMA_VERSION) scheduleSave();

  if(!IN_CLAUDE&&BROWSER_STORAGE&&BROWSER_STORAGE.status().migrated){
    setTimeout(()=>toast('Existing data moved to IndexedDB and verified; the original recovery copy was kept','success',{duration:5000}),80);
  }
  if(DB.lastAccountMigration&&DB.lastAccountMigration.kind==='legacy-imported'){
    const migration=DB.lastAccountMigration;
    setTimeout(()=>toast(`Moved ${migration.count} imported transaction${migration.count===1?'':'s'} into ${migration.target}`,'success',{duration:6500}),140);
  }

  if(isLockEnabled()){
    showLockScreen();
    // startApp() runs the first time hideLockScreen() succeeds — see below.
  } else {
    startApp();
  }
}
function checkStorageHealth(){
  if(IN_CLAUDE) return; // Claude's own storage is handled separately and reliably.

  const banner = document.getElementById('storage-warning');
  const textEl = document.getElementById('storage-warning-text');

  if(location.protocol === 'file:'){
    textEl.innerHTML = `<strong>Your data won't save.</strong> You're opening this file directly (file://) — browsers block persistent storage for local files like this, even if you install it as a desktop app from here (the app still points at this same file://, so the problem follows it). Serve it over http(s) instead: run <code style="background:rgba(0,0,0,.06);padding:1px 5px;border-radius:4px;">python3 -m http.server</code> in this folder and open <code style="background:rgba(0,0,0,.06);padding:1px 5px;border-radius:4px;">http://localhost:8000</code>, or host it online (GitHub Pages, Netlify) — then install from that address instead.`;
    banner.classList.remove('hidden');
    return;
  }
  if(BROWSER_STORAGE&&BROWSER_STORAGE.status().mode==='indexeddb')return;
  try{
    const testKey = '__pocketledger_storage_test__';
    window.localStorage.setItem(testKey, '1');
    window.localStorage.removeItem(testKey);
  }catch(e){
    textEl.innerHTML = `<strong>Your data won't save.</strong> This browser is blocking local storage for this page (common in private/incognito windows, or with strict tracking-protection settings). Try a normal browser window, or a different browser.`;
    banner.classList.remove('hidden');
    return;
  }
}
const dismissBtn = document.getElementById('storage-warning-dismiss');
if(dismissBtn) dismissBtn.onclick = ()=> document.getElementById('storage-warning').classList.add('hidden');
init();
