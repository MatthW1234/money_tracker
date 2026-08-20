const AccountsView=PocketLedgerAccountsView.create({
  getDB:()=>DB,accountTypes:ACCOUNT_TYPES,accountTypeConfig,isLiabilityType,gbp,escHTML,
  iconEdit,iconUndo,iconXSmall,openAccountModal,syncLegacyAccounts,scheduleSave,toast,
});
const renderAccountManagerBody=AccountsView.render;
const accountTypeOptions=AccountsView.typeOptions;

/* =========================================================
   SETTINGS / BACKUP
   ========================================================= */
function legacyMovementCounts(){
  const rows=expandSplits(DB.transactions||[]);
  return {
    savingsOut:rows.filter(t=>t.amount<0&&t.category==='Savings'&&!t.transferId).length,
    savingsIn:rows.filter(t=>t.amount>0&&t.category==='Savings Withdrawal'&&!t.transferId).length,
    investmentOut:rows.filter(t=>t.amount<0&&t.category==='Investment Out'&&!t.transferId).length,
    investmentIn:rows.filter(t=>t.amount>0&&t.category==='Investment In'&&!t.transferId).length
  };
}
function openAccountSetupGuide(){
  const counts=legacyMovementCounts();
  const total=counts.savingsOut+counts.savingsIn+counts.investmentOut+counts.investmentIn;
  openModal(`<div class="modal-head"><h3>Set up accounts without double-counting</h3></div><div class="modal-body">
    <div style="display:flex;flex-direction:column;gap:14px;color:var(--ink-soft);font-size:12.5px;line-height:1.55;">
      <div><strong style="color:var(--ink);">1. Keep Current Account as your statement destination.</strong><br>New imports must use a real account. The old synthetic “Imported” destination is no longer available.</div>
      <div><strong style="color:var(--ink);">2. Add Savings with its actual balance today.</strong><br>From that cutover date onward, convert the current-account side of each savings movement into a transfer to or from Savings. Use Savings Goals only to earmark part of that balance; goal funding is not another bank transaction.</div>
      <div><strong style="color:var(--ink);">3. Add your provider as an Investment account with its actual value today.</strong><br>Record future deposits and withdrawals as transfers. Deposits will appear as contributions on Investments, while transfers remain excluded from spending.</div>
      ${total?`<div style="padding:10px 12px;background:var(--brand-wash);border-radius:8px;"><strong style="color:var(--ink);">Your existing history is preserved.</strong><br>${total} older entries still use movement categories: ${counts.savingsOut} savings deposit${counts.savingsOut===1?'':'s'}, ${counts.savingsIn} savings withdrawal${counts.savingsIn===1?'':'s'}, ${counts.investmentOut} investment deposit${counts.investmentOut===1?'':'s'} and ${counts.investmentIn} investment withdrawal${counts.investmentIn===1?'':'s'}. Do not also recreate those as transfers after entering today’s real account balances, or they will be counted twice.</div>`:''}
      <div><strong style="color:var(--ink);">When an imported statement line is a transfer:</strong><br>Open that transaction and convert it to a transfer instead of adding a second transaction manually. Pocket Ledger creates the matching side for you.</div>
    </div>
  </div><div class="modal-foot"><button class="btn" id="m-close-guide">Close</button><button class="btn" id="m-add-savings">Add Savings</button><button class="btn btn-primary" id="m-add-investment">Add Investment</button></div>`,{wide:true});
  document.getElementById('m-close-guide').onclick=closeModal;
  document.getElementById('m-add-savings').onclick=()=>openAccountModal(null,'savings');
  document.getElementById('m-add-investment').onclick=()=>openAccountModal(null,'investment');
}
function openAccountModal(id,preferredType){
  const record=id?(DB.accountRecords||[]).find(r=>r.id===id):null;
  const initialType=record?record.type:(preferredType||'current');
  const displayedOpening=record?(isLiabilityType(record.type)?Math.abs(Number(record.openingBalance)||0):Number(record.openingBalance)||0):0;
  openModal(`<div class="modal-head"><h3>${record?'Edit':'Add'} account</h3></div><div class="modal-body"><div class="form-grid">
    <div class="field span2"><label>Account name</label><input type="text" id="acct-name" value="${record?escAttr(record.name):''}" placeholder="e.g. Santander current account"></div>
    <div class="field"><label>Account type</label><select id="acct-type">${accountTypeOptions(initialType)}</select></div>
    <div class="field"><label>Institution (optional)</label><input type="text" id="acct-institution" value="${record?escAttr(record.institution||''):''}" placeholder="e.g. Santander"></div>
    <div class="field"><label id="acct-opening-label">Opening balance (£)</label><input type="number" step="0.01" min="0" id="acct-opening" value="${displayedOpening}"><span id="acct-opening-help" style="font-size:10.5px;color:var(--ink-faint);"></span></div>
    <div class="field"><label>Balance date (optional)</label><input type="date" id="acct-opening-date" value="${record?record.openingBalanceDate||'':''}"></div>
    <div class="field span2" id="acct-limit-wrap"><label>Credit limit (£)</label><input type="number" min="0" step="0.01" id="acct-limit" value="${record&&record.creditLimit?record.creditLimit:''}"></div>
    <div class="field span2" id="acct-cycle-wrap"><div class="form-grid"><div class="field"><label>Statement day</label><input type="number" min="1" max="28" id="acct-statement-day" value="${record&&record.statementDay||''}" placeholder="e.g. 15"></div><div class="field"><label>Payment due day</label><input type="number" min="1" max="28" id="acct-due-day" value="${record&&record.dueDay||''}" placeholder="e.g. 10"></div><div class="field"><label>Minimum payment (£)</label><input type="number" min="0" step="0.01" id="acct-minimum-payment" value="${record&&record.minimumPayment!=null?record.minimumPayment:''}"></div><div class="field"><label class="regular-toggle" style="font-size:12px;margin-top:25px;"><input type="checkbox" id="acct-autopay-full" ${record&&record.autopayFullBalance?'checked':''}> Direct debit pays full balance</label></div></div></div>
    <div class="field span2"><label class="regular-toggle" style="font-size:12.5px;"><input type="checkbox" id="acct-networth" ${!record||record.includeInNetWorth!==false?'checked':''}> Include this account in net worth</label></div>
  </div></div><div class="modal-foot"><button class="btn" id="m-cancel">Cancel</button><button class="btn btn-primary" id="m-save">${record?'Save changes':'Add account'}</button></div>`);
  const typeEl=document.getElementById('acct-type');
  function updateTypeFields(){
    const liability=isLiabilityType(typeEl.value);
    document.getElementById('acct-opening-label').textContent=liability?'Opening amount owed (£)':'Opening balance (£)';
    document.getElementById('acct-opening-help').textContent=liability?'Enter the positive amount owed; Pocket Ledger stores it as a liability.':['investment','pension'].includes(typeEl.value)?'For a clean cutover, enter the total value shown by your provider today. Later valuations supersede it.':'Enter the account value at the start of your transaction history.';
    document.getElementById('acct-limit-wrap').style.display=typeEl.value==='credit_card'?'':'none';
    document.getElementById('acct-cycle-wrap').style.display=typeEl.value==='credit_card'?'':'none';
  }
  typeEl.onchange=updateTypeFields;updateTypeFields();
  document.getElementById('m-cancel').onclick=closeModal;
  document.getElementById('m-save').onclick=()=>{
    const name=document.getElementById('acct-name').value.trim(),type=typeEl.value,institution=document.getElementById('acct-institution').value.trim();
    const rawOpening=Number(document.getElementById('acct-opening').value||0),openingBalance=isLiabilityType(type)?-Math.abs(rawOpening):rawOpening;
    const openingBalanceDate=document.getElementById('acct-opening-date').value,limitRaw=Number(document.getElementById('acct-limit').value),creditLimit=type==='credit_card'&&Number.isFinite(limitRaw)&&limitRaw>0?limitRaw:null;
    const statementDayRaw=Number(document.getElementById('acct-statement-day').value),dueDayRaw=Number(document.getElementById('acct-due-day').value),minimumRaw=Number(document.getElementById('acct-minimum-payment').value);
    const statementDay=type==='credit_card'&&statementDayRaw>=1&&statementDayRaw<=28?Math.round(statementDayRaw):null,dueDay=type==='credit_card'&&dueDayRaw>=1&&dueDayRaw<=28?Math.round(dueDayRaw):null,minimumPayment=type==='credit_card'&&Number.isFinite(minimumRaw)&&minimumRaw>=0?Money.round(minimumRaw):null,autopayFullBalance=type==='credit_card'&&document.getElementById('acct-autopay-full').checked;
    if(!name){toast('Enter an account name','error');return;}
    if((DB.accountRecords||[]).some(r=>r.id!==(record&&record.id)&&r.name.toLowerCase()===name.toLowerCase())){toast('That account name already exists','error');return;}
    if(!Number.isFinite(rawOpening)||rawOpening<0){toast('Enter a valid opening amount','error');return;}
    if(record&&['investment','pension'].includes(record.type)&&!['investment','pension'].includes(type)&&(DB.investmentValuations||[]).some(v=>v.accountId===record.id)){toast('Delete this account’s valuations before changing it to a non-investment type','error');return;}
    if(record){
      const oldName=record.name;
      Object.assign(record,{name,type,institution,openingBalance,openingBalanceDate,creditLimit,statementDay,dueDay,minimumPayment,autopayFullBalance,includeInNetWorth:document.getElementById('acct-networth').checked});
      if(oldName!==name){
        DB.transactions.forEach(t=>{if(t.account===oldName)t.account=name;});
        (DB.recurringItems||[]).forEach(item=>{if(item.account===oldName)item.account=name;});
        (DB.savingsGoals||[]).forEach(goal=>{if(goal.account===oldName)goal.account=name;});
        (DB.investmentValuations||[]).forEach(v=>{if(v.accountId===record.id)v.accountName=name;});
        if(DB.reconciliations[oldName]){DB.reconciliations[name]=DB.reconciliations[oldName];delete DB.reconciliations[oldName];}
        if(UI.reconcileAccount===oldName)UI.reconcileAccount=name;
      }
    }else DB.accountRecords.push(makeAccountRecord(name,type,openingBalance,{institution,openingBalanceDate,creditLimit,statementDay,dueDay,minimumPayment,autopayFullBalance,includeInNetWorth:document.getElementById('acct-networth').checked}));
    syncLegacyAccounts();scheduleSave();closeModal();renderContent();toast(record?'Account updated':'Account added');
  };
}
function renderAppLockBody(){
  const host = document.getElementById('app-lock-body');
  if(!host) return;

  if(!LOCK_SUPPORTED){
    host.innerHTML = `<p style="font-size:11.5px;color:var(--ink-faint);margin:0;">App lock isn't available in this browser.</p>`;
    return;
  }

  if(isLockEnabled()){
    host.innerHTML = `
      <p style="font-size:11.5px;color:var(--ink-faint);margin:0 0 10px;">A PIN is required to open this app.</p>
      <div style="display:flex;gap:8px;flex-wrap:wrap;">
        <button class="btn btn-sm" id="lock-lock-now">Lock now</button>
        <button class="btn btn-sm" id="lock-change">Change PIN</button>
        <button class="btn btn-sm btn-danger" id="lock-turn-off">Turn off app lock</button>
      </div>`;
    document.getElementById('lock-lock-now').onclick = ()=>{ closeModal(); lockNow(); };
    document.getElementById('lock-change').onclick = ()=> renderAppLockSetForm(host, true);
    document.getElementById('lock-turn-off').onclick = ()=>{
      openModal(`
        <div class="modal-head"><h3>Turn off app lock?</h3></div>
        <div class="modal-body"><p style="margin:0;color:var(--ink-soft);font-size:13px;">Anyone who opens this app on this device will see your data without entering a PIN. Your transactions themselves are not affected.</p></div>
        <div class="modal-foot"><button class="btn" id="m-cancel4">Cancel</button><button class="btn btn-danger" id="m-confirm4">Turn off app lock</button></div>
      `);
      document.getElementById('m-cancel4').onclick = closeModal;
      document.getElementById('m-confirm4').onclick = ()=>{
        removeLock(); closeModal(); toast('App lock turned off');
      };
    };
    return;
  }

  renderAppLockSetForm(host, false);
}
function renderAppLockSetForm(host, isChange){
  host.innerHTML = `
    <p style="font-size:11.5px;color:var(--ink-faint);margin:0 0 10px;">
      ${isChange ? 'Choose a new PIN.' : 'Require a PIN before this app opens on this device. This is a screen lock, not encryption — see the note on the lock screen for what it does and doesn\u2019t protect against.'}
    </p>
    <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:flex-end;">
      <div class="field" style="width:120px;">
        <label>New PIN</label>
        <input type="password" inputmode="numeric" id="lock-new-pin" maxlength="12" placeholder="4+ digits">
      </div>
      <div class="field" style="width:120px;">
        <label>Confirm</label>
        <input type="password" inputmode="numeric" id="lock-new-pin-confirm" maxlength="12">
      </div>
      <button class="btn btn-primary btn-sm" id="lock-save-pin">${isChange ? 'Save new PIN' : 'Set PIN'}</button>
      ${isChange ? `<button class="btn btn-sm" id="lock-cancel-change">Cancel</button>` : ''}
    </div>
    <div class="lock-error" id="lock-set-error" style="margin-top:8px;"></div>
  `;
  if(isChange){
    document.getElementById('lock-cancel-change').onclick = renderAppLockBody;
  }
  document.getElementById('lock-save-pin').onclick = async ()=>{
    const pin = document.getElementById('lock-new-pin').value;
    const confirm = document.getElementById('lock-new-pin-confirm').value;
    const errEl = document.getElementById('lock-set-error');
    if(pin.length < 4){ errEl.textContent = 'Use at least 4 digits'; return; }
    if(pin !== confirm){ errEl.textContent = 'PINs don\u2019t match'; return; }
    await setPin(pin);
    renderAppLockBody();
    toast(isChange ? 'PIN changed' : 'App lock turned on');
  };
}
function openSettingsModal(){
  const storageInfo=storageStatusInfo();
  openModal(`
    <div class="modal-head"><h3>Settings</h3></div>
    <div class="modal-body">
      <div style="margin-bottom:14px;">
        <div style="font-size:11.5px;font-weight:600;color:var(--ink-soft);margin-bottom:8px;">Theme</div>
        <div class="seg" id="theme-seg">
          <button data-t="light" class="${getThemePref()==='light'?'active':''}">Light</button>
          <button data-t="dark" class="${getThemePref()==='dark'?'active':''}">Dark</button>
          <button data-t="auto" class="${getThemePref()==='auto'?'active':''}">Auto</button>
        </div>
        <p style="font-size:11px;color:var(--ink-faint);margin:6px 2px 0;">"Auto" follows your device's system setting.</p>
      </div>
      <div style="border-top:1px solid var(--line);padding-top:14px;margin-bottom:14px;">
        <div style="font-size:11.5px;font-weight:600;color:var(--ink-soft);margin-bottom:8px;">Desktop layout</div>
        <div class="field"><label>Table density</label><select id="desktop-density"><option value="comfortable" ${DB.appPreferences.density==='comfortable'?'selected':''}>Comfortable</option><option value="compact" ${DB.appPreferences.density==='compact'?'selected':''}>Compact</option></select></div>
        <div style="display:flex;gap:14px;flex-wrap:wrap;margin-top:9px;"><label class="regular-toggle"><input id="desktop-col-account" type="checkbox" ${DB.appPreferences.transactionColumns.account?'checked':''}> Show account column</label><label class="regular-toggle"><input id="desktop-col-status" type="checkbox" ${DB.appPreferences.transactionColumns.status?'checked':''}> Show status column</label></div>
        <button class="btn btn-sm" id="desktop-shortcuts" style="margin-top:10px;">Keyboard shortcuts</button>
      </div>
      <div style="border-top:1px solid var(--line); padding-top:14px; margin-bottom:14px;">
        <div style="font-size:11.5px;font-weight:600;color:var(--ink-soft);margin-bottom:8px;">Accounts</div>
        <div style="font-size:11.5px;color:var(--ink-faint);margin-bottom:10px;">Account types determine whether a balance is treated as an asset or liability. Archiving hides an account from new entries without deleting its history.</div>
        <div style="display:flex;gap:8px;flex-wrap:wrap;"><button class="btn btn-sm" id="add-account-btn">${iconPlus()} Add account</button><button class="btn btn-sm" id="account-guide-btn">Account setup guide</button></div>
        <div id="account-manager-body"></div>
      </div>
      <div style="border-top:1px solid var(--line); padding-top:14px; margin-bottom:14px;">
        <div style="font-size:11.5px;font-weight:600;color:var(--ink-soft);margin-bottom:8px;">App lock</div>
        <div id="app-lock-body"></div>
      </div>
      <div style="border-top:1px solid var(--line); padding-top:16px; display:flex; flex-direction:column; gap:8px;">
        <div style="font-size:11.5px;color:var(--ink-faint);">App version ${APP_VERSION} · ${DB.lastBackupAt ? `Last backup ${timeAgoLabel(DB.lastBackupAt)}` : 'No backup recorded yet'} · ${storageInfo.label}</div>
        <div style="font-size:11px;color:var(--ink-faint);">${storageInfo.detail}</div>
        <button class="btn" id="s-export">Export backup now</button>
        <button class="btn" id="s-export-csv">Export transactions CSV</button>
        <button class="btn" id="s-restore">Restore from backup…</button>
        <input type="file" id="s-restore-file" accept=".json,application/json" class="hidden">
        ${storageInfo.canRecoverLegacy?'<button class="btn" id="s-recover-legacy">Recover the pre-IndexedDB copy</button>':''}
        ${hasPreRestoreSnapshot() ? '<button class="btn" id="s-undo-restore">Recover data from before the last restore</button>' : ''}
        <button class="btn btn-danger" id="s-clear-tx">Remove all transactions</button>
        <button class="btn" id="s-load-sample">Load sample data</button>
        <button class="btn btn-danger" id="s-clear">Clear everything (transactions, categories & rules)</button>
      </div>
    </div>
    <div class="modal-foot"><button class="btn btn-primary" id="m-cancel">Close</button></div>
  `);
  renderAccountManagerBody();
  renderAppLockBody();
  document.getElementById('theme-seg').addEventListener('click', e=>{
    const b = e.target.closest('button'); if(!b) return;
    setThemePref(b.dataset.t);
    applyTheme();
    document.querySelectorAll('#theme-seg button').forEach(x=> x.classList.toggle('active', x===b));
    renderContent();
  });
  document.getElementById('add-account-btn').onclick = ()=>openAccountModal(null);
  document.getElementById('desktop-density').onchange=event=>{DB.appPreferences.density=event.target.value;applyDesktopPreferences();scheduleSave();};
  document.getElementById('desktop-col-account').onchange=event=>{DB.appPreferences.transactionColumns.account=event.target.checked;scheduleSave();};
  document.getElementById('desktop-col-status').onchange=event=>{DB.appPreferences.transactionColumns.status=event.target.checked;scheduleSave();};
  document.getElementById('desktop-shortcuts').onclick=()=>{closeModal();openCommandPalette();};
  document.getElementById('account-guide-btn').onclick = openAccountSetupGuide;
  document.getElementById('m-cancel').onclick = closeModal;
  document.getElementById('s-load-sample').onclick = ()=>{
    DB = buildSeedDB(); scheduleSave(); closeModal(); renderContent(); toast('Sample data loaded');
  };
  document.getElementById('s-restore').onclick = ()=> document.getElementById('s-restore-file').click();
  document.getElementById('s-export').onclick = exportBackup;
  document.getElementById('s-export-csv').onclick = exportTransactionsCSV;
  const undoRestore = document.getElementById('s-undo-restore');
  if(undoRestore) undoRestore.onclick = recoverPreRestoreSnapshot;
  const recoverLegacy=document.getElementById('s-recover-legacy');
  if(recoverLegacy)recoverLegacy.onclick=recoverLegacyStorageCopy;
  document.getElementById('s-restore-file').addEventListener('change', (e)=>{
    if(e.target.files.length) handleRestoreFile(e.target.files[0]);
  });
  document.getElementById('s-clear-tx').onclick = ()=>{
    const n = DB.transactions.length;
    openModal(`
      <div class="modal-head"><h3>Remove all transactions?</h3></div>
      <div class="modal-body"><p style="margin:0;color:var(--ink-soft);font-size:13px;">
        This deletes all ${n} transaction${n===1?'':'s'} currently in your ledger — including the sample data, and anything you've added or imported since.
        Your categories and auto-tagging rules are kept. This can't be undone.
      </p></div>
      <div class="modal-foot"><button class="btn" id="m-cancel2b">Cancel</button><button class="btn btn-danger" id="m-confirm2b">Remove transactions</button></div>
    `);
    document.getElementById('m-cancel2b').onclick = closeModal;
    document.getElementById('m-confirm2b').onclick = ()=>{
      DB.transactions = [];
      scheduleSave(); closeModal(); renderContent(); toast('All transactions removed — categories and rules kept');
    };
  };
  document.getElementById('s-clear').onclick = ()=>{
    openModal(`
      <div class="modal-head"><h3>Clear everything?</h3></div>
      <div class="modal-body"><p style="margin:0;color:var(--ink-soft);font-size:13px;">This removes every transaction, category and rule from this device. This can't be undone.</p></div>
      <div class="modal-foot"><button class="btn" id="m-cancel2">Cancel</button><button class="btn btn-danger" id="m-confirm2">Clear everything</button></div>
    `);
    document.getElementById('m-cancel2').onclick = closeModal;
    document.getElementById('m-confirm2').onclick = ()=>{
      DB = buildEmptyDB(); scheduleSave(); closeModal(); renderContent(); toast('All data cleared');
    };
  };
}
function storageStatusInfo(){
  if(IN_CLAUDE)return {label:'Claude storage',detail:'Data is stored by the Claude app. JSON export remains available for transfer.',canRecoverLegacy:false};
  const state=BROWSER_STORAGE?BROWSER_STORAGE.status():{mode:'starting'};
  if(state.mode==='indexeddb')return {
    label:'IndexedDB',
    detail:state.hasLegacyCopy?'Your earlier local-storage record is retained unchanged as a recovery copy.':'Your ledger uses the browser database; no pre-migration local-storage copy was present.',
    canRecoverLegacy:state.hasLegacyCopy,
  };
  return {label:'localStorage fallback',detail:'IndexedDB was unavailable, so Pocket Ledger is continuing with its previous browser storage.',canRecoverLegacy:false};
}
function recoverLegacyStorageCopy(){
  if(IN_CLAUDE||!BROWSER_STORAGE)return;
  const raw=BROWSER_STORAGE.getLegacyCopy();let clean;
  try{clean=normaliseDB(JSON.parse(raw||''));}catch(e){toast('The pre-IndexedDB copy is missing or invalid','error');return;}
  const audit=PocketLedgerRules.auditRules(clean.rules,clean.categories);
  openModal(`<div class="modal-head"><h3>Recover the pre-IndexedDB copy?</h3></div><div class="modal-body">
    <p style="margin:0 0 8px;color:var(--ink-soft);font-size:13px;">This recovery copy contains <strong>${clean.transactions.length}</strong> transactions and <strong>${audit.count}</strong> rules. It was frozen when IndexedDB was first enabled.</p>
    <p style="margin:0;color:var(--ink-soft);font-size:13px;">Your current ledger will be replaced. Export it first if you may need to return to it.</p>
  </div><div class="modal-foot"><button class="btn" id="m-cancel">Cancel</button><button class="btn btn-primary" id="m-confirm">Recover copy</button></div>`);
  document.getElementById('m-cancel').onclick=closeModal;document.getElementById('m-confirm').onclick=async()=>{
    savePreRestoreSnapshot();DB=clean;await persist();closeModal();renderContent();toast('Pre-IndexedDB copy recovered');
  };
}
function hasPreRestoreSnapshot(){
  try{ return !!window.localStorage.getItem(PRE_RESTORE_KEY); }catch(e){ return false; }
}
function savePreRestoreSnapshot(){
  try{ window.localStorage.setItem(PRE_RESTORE_KEY, JSON.stringify({savedAt:new Date().toISOString(),data:DB})); return true; }
  catch(e){ return false; }
}
function recoverPreRestoreSnapshot(){
  let snapshot;
  try{ snapshot=JSON.parse(window.localStorage.getItem(PRE_RESTORE_KEY)||'null'); }
  catch(e){ snapshot=null; }
  if(!snapshot || !snapshot.data){ toast('No recovery snapshot is available','error'); return; }
  let clean;
  try{ clean=normaliseDB(snapshot.data); }catch(e){ toast(`Recovery snapshot is invalid: ${e.message}`,'error'); return; }
  openModal(`<div class="modal-head"><h3>Recover pre-restore data?</h3></div><div class="modal-body"><p style="margin:0;color:var(--ink-soft);font-size:13px;">This restores ${clean.transactions.length} transactions saved ${timeAgoLabel(snapshot.savedAt)}. Your current ledger will be replaced.</p></div><div class="modal-foot"><button class="btn" id="m-cancel">Cancel</button><button class="btn btn-primary" id="m-confirm">Recover</button></div>`);
  document.getElementById('m-cancel').onclick=closeModal;
  document.getElementById('m-confirm').onclick=()=>{ DB=clean;scheduleSave();closeModal();renderContent();toast('Pre-restore data recovered'); };
}
function handleRestoreFile(file){
  const reader = new FileReader();
  reader.onload = (e)=>{
    let parsed;
    try{ parsed = JSON.parse(e.target.result); }
    catch(err){ toast('That file isn\u2019t valid JSON — is it a Pocket Ledger backup?', 'error'); return; }
    const verification=PocketLedgerBackup.verify(parsed);
    if(!verification.ok){ toast(`Backup validation failed: ${verification.message}`, 'error'); return; }
    let clean;
    try{ clean=normaliseDB(parsed); }
    catch(err){ toast(`Backup validation failed: ${err.message}`, 'error'); return; }
    const currentCount = DB.transactions.length;
    const ruleAudit=PocketLedgerRules.auditRules(clean.rules,clean.categories);
    const comparison=PocketLedgerBackup.diff(DB,clean),txDelta=comparison.counts.transactions.delta;
    const manifest=parsed.backupManifest;
    const newerSchema=Number(parsed.schemaVersion||manifest?.schemaVersion||0)>SCHEMA_VERSION;
    const integrityColour=verification.status==='verified'?'var(--income)':'var(--gold)';
    const range=comparison.after.firstTransactionDate?`${comparison.after.firstTransactionDate} to ${comparison.after.lastTransactionDate}`:'no dated transactions';
    openModal(`
      <div class="modal-head"><h3>Restore this backup?</h3></div>
      <div class="modal-body">
        <p style="margin:0 0 8px;color:var(--ink-soft);font-size:13px;">
          This file contains <strong>${clean.transactions.length}</strong> transaction${clean.transactions.length===1?'':'s'}, ${clean.categories.length} categories and <strong>${ruleAudit.count} auto-tagging rules</strong>. ${ruleAudit.directional.length?`${ruleAudit.directional.length} direction-specific rule${ruleAudit.directional.length===1?' is':'s are'} preserved.`:''}
        </p>
        <div style="border:1px solid var(--line);background:var(--surface-2);border-radius:8px;padding:10px 12px;margin:0 0 10px;font-size:12px;line-height:1.65;">
          <div style="font-weight:700;color:${integrityColour};">${verification.status==='verified'?iconCheck():iconWarnTriangle()} ${escHTML(verification.message)}</div>
          <div>Transactions: ${currentCount} → <strong>${clean.transactions.length}</strong> (${txDelta>=0?'+':''}${txDelta}) · ${comparison.addedTransactions} new IDs · ${comparison.removedTransactions} removed IDs</div>
          <div>Accounts: ${comparison.counts.accounts.before} → ${comparison.counts.accounts.after} · Rules: ${comparison.counts.rules.before} → ${comparison.counts.rules.after}</div>
          <div>Date coverage: ${escHTML(range)}${manifest?.createdAt?` · Created ${timeAgoLabel(manifest.createdAt)}`:''}</div>
        </div>
        ${newerSchema?`<p style="margin:8px 0;color:var(--expense);font-size:12px;font-weight:700;">This backup was created by newer schema ${Number(parsed.schemaVersion||manifest?.schemaVersion)}. Unknown future fields may not survive this restore.</p>`:''}
        ${ruleAudit.invalid.length||ruleAudit.missingCategories.length||ruleAudit.conflicts.length?`<p style="margin:8px 0 0;color:var(--expense);font-size:12px;">Rule integrity warning: ${ruleAudit.invalid.length} invalid, ${ruleAudit.missingCategories.length} missing a category and ${ruleAudit.conflicts.length} conflicting duplicate${ruleAudit.conflicts.length===1?'':'s'}.</p>`:''}
        <p style="margin:0;color:var(--ink-soft);font-size:13px;">
          ${currentCount ? `Your current ${currentCount} transaction${currentCount===1?'':'s'} on this device will be <strong>replaced</strong> — export a backup first if you want to keep them.` : 'This device currently has no data, so nothing will be lost.'}
        </p>
      </div>
      <div class="modal-foot"><button class="btn" id="m-cancel3">Cancel</button><button class="btn btn-primary" id="m-confirm3">Restore backup</button></div>
    `);
    document.getElementById('m-cancel3').onclick = closeModal;
    document.getElementById('m-confirm3').onclick = ()=>{
      savePreRestoreSnapshot();
      DB = clean;
      scheduleSave(); closeModal(); renderContent();
      toast(`Restored ${clean.transactions.length} transactions`);
    };
  };
  reader.onerror = ()=> toast('Could not read that file', 'error');
  reader.readAsText(file);
}
function downloadTextFile(contents,type,fileName){
  const blob=new Blob([contents],{type}),url=URL.createObjectURL(blob),a=document.createElement('a');
  a.href=url;a.download=fileName;document.body.appendChild(a);a.click();a.remove();URL.revokeObjectURL(url);
}
function exportBackup(){
  syncLegacyAccounts();
  DB.lastBackupAt = new Date().toISOString();
  DB.appVersion = APP_VERSION;
  DB.schemaVersion = SCHEMA_VERSION;
  scheduleSave();
  const payload=PocketLedgerBackup.create(DB,{appVersion:APP_VERSION,schemaVersion:SCHEMA_VERSION,createdAt:DB.lastBackupAt});
  downloadTextFile(JSON.stringify(payload,null,2),'application/json',`pocket-ledger-backup-${todayISO()}.json`);
  toast('Verified backup downloaded');
}
function exportTransactionsCSV(){
  downloadTextFile('\uFEFF'+PocketLedgerBackup.transactionsCSV(DB),'text/csv;charset=utf-8',`pocket-ledger-transactions-${todayISO()}.csv`);
  toast(`Exported ${DB.transactions.length} transactions`);
}
