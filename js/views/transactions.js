/* =========================================================
   TRANSACTIONS
   ========================================================= */
function filteredSortedTx(){
  let list = DB.transactions.slice();
  const f = UI.txFilters;
  if(f.preset) list=PocketLedgerReview.applyPreset(list,f.preset,todayISO());
  if(f.search){
    const q = f.search.toLowerCase();
    list = list.filter(t=> t.description.toLowerCase().includes(q) || (t.notes||'').toLowerCase().includes(q));
  }
  if(f.category!=='all'){
    list = list.filter(t=> f.category==='uncategorised'
      ? (!t.category && !t.transferId && !(t.splits&&t.splits.length))
      : (t.splits&&t.splits.length ? t.splits.some(s=>s.category===f.category) : t.category===f.category));
  }
  if(f.type!=='all'){
    if(f.type==='transfer') list = list.filter(t=> !!t.transferId);
    else if(f.type==='excluded') list = list.filter(t=> !!t.excluded && !t.transferId);
    else if(f.type==='income') list = list.filter(t=> t.amount>0 && !t.transferId);
    else list = list.filter(t=> t.amount<0 && !t.transferId);
  }
  if(f.status && f.status!=='all') list = list.filter(t=>transactionStatus(t)===f.status);
  if(f.from) list = list.filter(t=> t.date >= f.from);
  if(f.to) list = list.filter(t=> t.date <= f.to);
  const {col, dir} = UI.txSort;
  list.sort((a,b)=>{
    let av=a[col], bv=b[col];
    if(col==='amount'){ av=Math.abs(a.amount); bv=Math.abs(b.amount); }
    if(typeof av==='string') av=av.toLowerCase();
    if(typeof bv==='string') bv=bv.toLowerCase();
    if(av<bv) return dir==='asc'?-1:1;
    if(av>bv) return dir==='asc'?1:-1;
    return 0;
  });
  return list;
}
function txColumnVisible(name){return DB.appPreferences?.transactionColumns?.[name]!==false;}
function applyTransactionDatePreset(kind){
  let range;if(kind==='month')range=PocketLedgerPreferences.month(todayISO());else if(kind==='tax-year')range=PocketLedgerPreferences.ukTaxYear(todayISO());else range=PocketLedgerPreferences.statement(DB,UI.reconcileAccount||preferredImportAccountName());
  if(!range.from&&!range.to){toast('No completed statement period was found for the selected account','error');return;}
  UI.txFilters.from=range.from;UI.txFilters.to=range.to;UI.txFilters.preset='';UI.selectedSavedViewId='';saveDesktopPreferences();renderTransactions(document.getElementById('content'));
}

function renderTransactions(c){
  UI.txSelected = new Set();
  const f = UI.txFilters;
  c.innerHTML = `
    <div class="panel" style="padding:10px 12px;margin-bottom:10px;display:flex;align-items:end;gap:8px;flex-wrap:wrap;">
      <div class="field" style="min-width:210px;"><label>Saved or quick view</label><select id="tx-view-select"><option value="">Custom filters</option><optgroup label="Quick views"><option value="preset:this-month" ${f.preset==='this-month'?'selected':''}>This month</option><option value="preset:needs-receipt" ${f.preset==='needs-receipt'?'selected':''}>Needs receipt</option><option value="preset:large-card" ${f.preset==='large-card'?'selected':''}>Large card purchases (£100+)</option></optgroup>${DB.savedViews.length?`<optgroup label="My views">${DB.savedViews.map(view=>`<option value="saved:${escAttr(view.id)}" ${UI.selectedSavedViewId===view.id?'selected':''}>${escHTML(view.name)}</option>`).join('')}</optgroup>`:''}</select></div>
      <button class="btn btn-sm" id="tx-save-view">Save current view</button>
      <button class="btn btn-sm btn-ghost" id="tx-delete-view" ${UI.selectedSavedViewId?'':'disabled'}>Delete selected view</button>
      <span style="flex:1"></span><button class="btn btn-sm btn-ghost" data-date-preset="month">This month</button><button class="btn btn-sm btn-ghost" data-date-preset="statement">Last statement</button><button class="btn btn-sm btn-ghost" data-date-preset="tax-year">UK tax year</button>
    </div>
    <div class="filters-row">
      <div class="field"><label>Search</label><input type="text" class="search-input" id="f-search" placeholder="Description or note…" value="${escAttr(f.search)}"></div>
      <div class="field"><label>Category</label><select id="f-category">
        <option value="all">All categories</option>
        <option value="uncategorised" ${f.category==='uncategorised'?'selected':''}>Uncategorised</option>
        ${DB.categories.map(cat=>`<option value="${escAttr(cat.name)}" ${f.category===cat.name?'selected':''}>${escHTML(cat.name)}</option>`).join('')}
      </select></div>
      <div class="field"><label>Type</label><select id="f-type">
        <option value="all">Income & Expense</option>
        <option value="income" ${f.type==='income'?'selected':''}>Income only</option>
        <option value="expense" ${f.type==='expense'?'selected':''}>Expense only</option>
        <option value="transfer" ${f.type==='transfer'?'selected':''}>Transfers only</option>
        <option value="excluded" ${f.type==='excluded'?'selected':''}>Excluded from totals</option>
      </select></div>
      <div class="field"><label>Status</label><select id="f-status">
        <option value="all">All statuses</option>
        <option value="pending" ${f.status==='pending'?'selected':''}>Pending</option>
        <option value="cleared" ${f.status==='cleared'?'selected':''}>Cleared</option>
        <option value="reconciled" ${f.status==='reconciled'?'selected':''}>Reconciled</option>
      </select></div>
      <div class="field"><label>From</label><input type="date" id="f-from" value="${f.from}"></div>
      <div class="field"><label>To</label><input type="date" id="f-to" value="${f.to}"></div>
      <div class="field"><label>&nbsp;</label><button class="btn btn-ghost btn-sm" id="f-clear">Clear filters</button></div>
    </div>
    <div id="bulk-toolbar"></div>
    <div class="table-wrap">
      <table>
        <thead><tr>
          <th style="width:32px;"><input type="checkbox" id="tx-select-all"></th>
          <th data-col="date">Date</th>
          <th data-col="description">Description</th>
          <th data-col="category">Category</th>
          ${txColumnVisible('account')?'<th data-col="account">Account</th>':''}
          ${txColumnVisible('status')?'<th data-col="status">Status</th>':''}
          <th data-col="amount" style="text-align:right;">Amount</th>
          <th></th>
        </tr></thead>
        <tbody id="tx-body"></tbody>
      </table>
    </div>
  `;
  const viewSelect=document.getElementById('tx-view-select'),deleteView=document.getElementById('tx-delete-view');
  viewSelect.onchange=()=>{
    const value=viewSelect.value;
    UI.selectedSavedViewId=value.startsWith('saved:')?value.slice(6):'';
    if(value.startsWith('preset:'))UI.txFilters={search:'',category:'all',type:'all',status:'all',from:'',to:'',preset:value.slice(7)};
    else if(value.startsWith('saved:')){const view=DB.savedViews.find(item=>item.id===value.slice(6));if(view)UI.txFilters=Object.assign({search:'',category:'all',type:'all',status:'all',from:'',to:'',preset:''},view.filters);}
    else UI.txFilters.preset='';
    renderTransactions(c);updateRecheckButtonLabel();
  };
  document.getElementById('tx-save-view').onclick=openSaveTransactionViewModal;
  c.querySelectorAll('[data-date-preset]').forEach(button=>button.onclick=()=>applyTransactionDatePreset(button.dataset.datePreset));
  deleteView.onclick=()=>{const id=UI.selectedSavedViewId;DB.savedViews=DB.savedViews.filter(view=>view.id!==id);UI.selectedSavedViewId='';scheduleSave();renderTransactions(c);toast('Saved view deleted');};
  let txFilterDebounce = null;
  const debouncedFilterChange = ()=>{
    clearTimeout(txFilterDebounce);
    txFilterDebounce = setTimeout(onTxFilterChange, 180);
  };
  ['f-search','f-category','f-type','f-status','f-from','f-to'].forEach(id=>{
    document.getElementById(id).addEventListener('input', debouncedFilterChange);
    document.getElementById(id).addEventListener('change', onTxFilterChange);
  });
  document.getElementById('f-clear').onclick = ()=>{
    UI.txFilters = {search:'', category:'all', type:'all', status:'all', from:'', to:'', preset:''};
    UI.selectedSavedViewId='';
    renderTransactions(c);
    updateRecheckButtonLabel();
  };
  document.querySelectorAll('th[data-col]').forEach(th=>{
    th.addEventListener('click', ()=>{
      if(UI.txSort.col===th.dataset.col) UI.txSort.dir = UI.txSort.dir==='asc'?'desc':'asc';
      else UI.txSort = {col:th.dataset.col, dir:'asc'};
      renderTxBody();
      saveDesktopPreferences();
      document.querySelectorAll('th[data-col]').forEach(h=>h.classList.remove('sorted'));
      th.classList.add('sorted');
    });
  });
  document.getElementById('tx-select-all').addEventListener('change', (e)=>{
    const visible = filteredSortedTx();
    if(e.target.checked) visible.filter(t=>transactionStatus(t)!=='reconciled'&&!closedPeriodBlocks(t)).forEach(t=> UI.txSelected.add(t.id));
    else visible.forEach(t=> UI.txSelected.delete(t.id));
    renderTxBody();
  });
  const txBody = document.getElementById('tx-body');
  txBody.addEventListener('click', handleTxBodyClick);
  txBody.addEventListener('change', handleTxBodyChange);
  renderTxBody();
  saveDesktopPreferences();
}
function onTxFilterChange(){
  UI.txFilters.search = document.getElementById('f-search').value;
  UI.txFilters.category = document.getElementById('f-category').value;
  UI.txFilters.type = document.getElementById('f-type').value;
  UI.txFilters.status = document.getElementById('f-status').value;
  UI.txFilters.from = document.getElementById('f-from').value;
  UI.txFilters.to = document.getElementById('f-to').value;
  UI.txFilters.preset='';
  UI.selectedSavedViewId='';
  renderTxBody();
  updateRecheckButtonLabel();
  saveDesktopPreferences();
}
function openSaveTransactionViewModal(){
  openModal(`<div class="modal-head"><h3>Save transaction view</h3></div><div class="modal-body"><div class="field"><label>View name</label><input id="saved-view-name" type="text" maxlength="80" placeholder="e.g. Current statement"></div><p style="font-size:11.5px;color:var(--ink-faint);margin:9px 0 0;">Search, category, type, status and date filters will be retained. The transactions themselves are not copied.</p></div><div class="modal-foot"><button class="btn" id="m-cancel">Cancel</button><button class="btn btn-primary" id="m-save">Save view</button></div>`);
  document.getElementById('m-cancel').onclick=closeModal;document.getElementById('m-save').onclick=()=>{const name=document.getElementById('saved-view-name').value.trim();if(!name){toast('Enter a view name','error');return;}DB.savedViews.push({id:uid('view'),name,filters:Object.assign({},UI.txFilters,{preset:''}),createdAt:new Date().toISOString()});scheduleSave();closeModal();renderTransactions(document.getElementById('content'));toast('Transaction view saved');};
}
function updateRecheckButtonLabel(){
  const btn = document.getElementById('btn-recheck');
  if(!btn) return;
  const f = UI.txFilters;
  const isFiltered = !!(f.search || f.category!=='all' || f.type!=='all' || (f.status&&f.status!=='all') || f.from || f.to);
  btn.innerHTML = isFiltered ? `${iconRefresh()} Re-check filtered` : `${iconRefresh()} Re-check all`;
}
function renderBulkToolbar(){
  const host = document.getElementById('bulk-toolbar');
  if(!host) return;
  const n = UI.txSelected.size;
  if(!n){ host.innerHTML = ''; return; }
  const accounts = activeAccountNames();
  host.innerHTML = `
    <div class="tag-toolbar">
      <span class="count"><strong>${n}</strong> selected</span>
      <button class="btn btn-sm btn-ghost" id="bulk-clear">Clear selection</button>
      <span style="flex:1"></span>
      <span>Set account:</span>
      <select id="bulk-account-input" style="width:170px;"><option value="">Choose account…</option>${accounts.map(a=>`<option value="${escAttr(a)}">${escHTML(a)}</option>`).join('')}</select>
      <button class="btn btn-sm" id="bulk-account-apply">Apply</button>
      <span>Set category:</span>
      <select id="bulk-category-select" style="min-width:150px;">${categoryOptionsHTML('')}</select>
      <button class="btn btn-sm" id="bulk-category-apply">Apply</button>
      <span>Set status:</span>
      <select id="bulk-status-select"><option value="pending">Pending</option><option value="cleared">Cleared</option></select>
      <button class="btn btn-sm" id="bulk-status-apply">Apply</button>
      <label style="display:flex;align-items:center;gap:5px;font-size:11.5px;color:var(--ink-soft);font-weight:500;white-space:nowrap;">
        <input type="checkbox" id="bulk-remember-rules"> Also create rules from these
      </label>
    </div>
  `;
  document.getElementById('bulk-clear').onclick = ()=>{ UI.txSelected.clear(); renderTxBody(); };
  document.getElementById('bulk-account-apply').onclick = ()=>{
    const val = document.getElementById('bulk-account-input').value.trim();
    if(!val){ toast('Enter an account name', 'error'); return; }
    let count = 0;
    const before = [];
    UI.txSelected.forEach(id=>{
      const t = DB.transactions.find(x=>x.id===id);
      if(t && !t.transferId&&!closedPeriodBlocks(t)){ before.push({id:t.id, account:t.account}); t.account = val; count++; }
    });
    pushUndo(`set account to "${val}" for ${count} transaction${count===1?'':'s'}`, ()=>{
      before.forEach(b=>{ const t = DB.transactions.find(x=>x.id===b.id); if(t) t.account = b.account; });
    });
    scheduleSave(); UI.txSelected.clear(); renderTxBody(); renderSidebarBits();
    offerUndo(`Set account to "${val}" for ${count} transaction${count===1?'':'s'}`);
  };
  document.getElementById('bulk-category-apply').onclick = ()=>{
    const val = document.getElementById('bulk-category-select').value;
    const alsoLearn = document.getElementById('bulk-remember-rules').checked;
    let count = 0;
    const learned = [];
    const before = [];
    UI.txSelected.forEach(id=>{
      const t = DB.transactions.find(x=>x.id===id);
      if(t && !t.transferId && !(t.splits&&t.splits.length)&&!closedPeriodBlocks(t)){
        before.push({id:t.id, category:t.category});
        t.category = val;
        count++;
        if(alsoLearn){
          const r = learnRuleFromTransaction(t);
          if(r) learned.push(r);
        }
      }
    });
    pushUndo(`set category to "${val}" for ${count} transaction${count===1?'':'s'}`, ()=>{
      before.forEach(b=>{ const t = DB.transactions.find(x=>x.id===b.id); if(t) t.category = b.category; });
      learned.forEach(r=>{ DB.rules = DB.rules.filter(x=> !(x.keyword===r.keyword && x.category===r.category)); });
    });
    scheduleSave(); UI.txSelected.clear(); renderTxBody(); renderSidebarBits();
    if(alsoLearn && learned.length){
      offerUndo(`Set category for ${count} transaction${count===1?'':'s'} — learned ${learned.length} new rule${learned.length===1?'':'s'} (e.g. "${learned[0].keyword}" → ${learned[0].category})`);
    } else {
      offerUndo(`Set category for ${count} transaction${count===1?'':'s'}`);
    }
  };
  document.getElementById('bulk-status-apply').onclick = ()=>{
    const status = document.getElementById('bulk-status-select').value;
    const before=[];
    UI.txSelected.forEach(id=>{
      const t=DB.transactions.find(x=>x.id===id);
      if(t && transactionStatus(t)!=='reconciled'&&!closedPeriodBlocks(t)){ before.push({id:t.id,status:t.status});t.status=status; }
    });
    pushUndo(`set ${before.length} transaction${before.length===1?'':'s'} to ${status}`,()=>before.forEach(b=>{const t=DB.transactions.find(x=>x.id===b.id);if(t)t.status=b.status;}));
    scheduleSave();UI.txSelected.clear();renderTxBody();offerUndo(`Marked ${before.length} transaction${before.length===1?'':'s'} as ${status}`);
  };
}
function renderTxBody(){
  const body = document.getElementById('tx-body');
  const list = filteredSortedTx();
  renderBulkToolbar();
  const selectAll = document.getElementById('tx-select-all');
  if(selectAll){
    const editable = list.filter(t=>transactionStatus(t)!=='reconciled'&&!closedPeriodBlocks(t));
    selectAll.checked = editable.length>0 && editable.every(t=> UI.txSelected.has(t.id));
  }
  if(!list.length){
    body.innerHTML = `<tr class="empty-row"><td colspan="8">No transactions match these filters.</td></tr>`;
    return;
  }
  body.innerHTML = list.map(rowHTML_tx).join('');
}
function handleTxBodyClick(e){
  const badge = e.target.closest('[data-action="open-cat-picker"]');
  if(badge){ openInlineCategoryPicker(badge); return; }
  const splitBtn = e.target.closest('[data-action="open-split"]');
  if(splitBtn){ openSplitModal(splitBtn.dataset.id); return; }
  const editBtn = e.target.closest('[data-action="edit-tx"]');
  if(editBtn){ openTxModal(editBtn.dataset.id); return; }
  const delBtn = e.target.closest('[data-action="delete-tx"]');
  if(delBtn){ deleteTx(delBtn.dataset.id); return; }
  const convBtn = e.target.closest('[data-action="convert-transfer"]');
  if(convBtn){ openConvertToTransferModal(convBtn.dataset.id); return; }
  const linkBtn=e.target.closest('[data-action="link-return"]');if(linkBtn){openReturnLinkModal(linkBtn.dataset.id);return;}
  const unlinkBtn=e.target.closest('[data-action="unlink-return"]');if(unlinkBtn){unlinkReturnEvent(unlinkBtn.dataset.id);return;}
  const revBtn = e.target.closest('[data-action="revert-transfer"]');
  if(revBtn){ revertTransfer(revBtn.dataset.id); return; }
}
function handleTxBodyChange(e){
  if(!e.target.classList.contains('tx-row-check')) return;
  const id = e.target.dataset.id;
  if(e.target.checked) UI.txSelected.add(id);
  else UI.txSelected.delete(id);
  renderBulkToolbar();
  const selectAll = document.getElementById('tx-select-all');
  if(selectAll){
    const list = filteredSortedTx();
    const editable = list.filter(t=>transactionStatus(t)!=='reconciled'&&!closedPeriodBlocks(t));
    selectAll.checked = editable.length>0 && editable.every(t=> UI.txSelected.has(t.id));
  }
}
function openInlineCategoryPicker(badgeEl){
  const id = badgeEl.dataset.id;
  const t = DB.transactions.find(x=>x.id===id);
  if(!t) return;
  if(transactionStatus(t)==='reconciled'){ toast('Reconciled transactions are locked. Reopen the reconciliation first.', 'error'); return; }
  if(warnClosedPeriod(t))return;
  const td = badgeEl.closest('td');
  const sel = document.createElement('select');
  sel.className = 'cat-select-inline';
  sel.innerHTML = categoryOptionsHTML(t.category);
  sel.value = t.category || '';
  td.innerHTML = '';
  td.appendChild(sel);
  sel.focus();
  let committed = false;
  function commit(){
    if(committed) return;
    committed = true;
    t.category = sel.value;
    scheduleSave();
    renderSidebarBits();
    const kind = categoryKind(t.category);
    const stampClass = !t.category ? 'c-none' : (kind==='income' ? 'c-income' : 'c-expense');
    const badge = document.createElement('span');
    badge.className = `stamp ${stampClass} cat-badge-clickable`;
    badge.dataset.action = 'open-cat-picker';
    badge.dataset.id = t.id;
    badge.title = 'Click to change category';
    badge.textContent = t.category || 'Uncategorised';
    td.innerHTML = '';
    td.appendChild(badge);
    toast('Category updated');
  }
  sel.addEventListener('change', commit);
  sel.addEventListener('blur', commit);
}
function rowHTML_tx(t){
  const checked = UI.txSelected.has(t.id) ? 'checked' : '';
  const status = transactionStatus(t);
  const locked = status==='reconciled'||!!closedPeriodBlocks(t);
  if(t.transferId){
    return `<tr class="transfer-row">
      <td><input type="checkbox" class="tx-row-check" data-id="${t.id}" ${checked} ${locked?'disabled':''}></td>
      <td class="num">${ukDate(t.date)}</td>
      <td class="desc" title="${escAttr(t.description)}">${escHTML(t.description)}</td>
      <td><span class="stamp c-transfer">Transfer</span></td>
      ${txColumnVisible('account')?`<td>${escHTML(t.account||'—')}</td>`:''}
      ${txColumnVisible('status')?`<td>${statusPillHTML(status)}</td>`:''}
      <td class="amt ${t.amount>0?'income':''}">${gbp(t.amount,{signed:true})}</td>
      <td class="row-actions">
        <button class="row-icon-btn" data-action="revert-transfer" data-id="${t.id}" title="Remove transfer tag and revert to a normal transaction">${iconUndo()}</button>
        <button class="row-icon-btn" data-action="delete-tx" data-id="${t.id}" title="Delete both sides of this transfer">${iconTrash()}</button>
      </td>
    </tr>`;
  }
  const isSplit = t.splits && t.splits.length;
  const kind = categoryKind(t.category);
  const stampClass = isSplit ? 'c-split' : (!t.category ? 'c-none' : (kind==='income' ? 'c-income' : 'c-expense'));
  const catLabel = isSplit ? `Split (${t.splits.length})` : (t.category || 'Uncategorised');
  return `<tr>
    <td><input type="checkbox" class="tx-row-check" data-id="${t.id}" ${checked} ${locked?'disabled':''}></td>
    <td class="num">${ukDate(t.date)}</td>
    <td class="desc" title="${escAttr(t.description)}">${escHTML(t.description)}${t.excluded ? ' <span class="stamp-mini" title="Not counted in income/spending totals">excl.</span>' : ''}${t.linkedEventType?` <span class="stamp-mini">${escHTML(t.linkedEventType)}</span>`:''}</td>
    <td class="cat-cell"><span class="stamp ${stampClass} cat-badge-clickable" data-action="${isSplit?'open-split':'open-cat-picker'}" data-id="${t.id}" title="${isSplit?'Click to edit split':'Click to change category'}">${escHTML(catLabel)}</span></td>
    ${txColumnVisible('account')?`<td>${escHTML(t.account||'—')}</td>`:''}
    ${txColumnVisible('status')?`<td>${statusPillHTML(status)}</td>`:''}
    <td class="amt ${t.amount>0?'income':''}">${gbp(t.amount,{signed:true})}</td>
    <td class="row-actions">
      <button class="row-icon-btn" data-action="open-split" data-id="${t.id}" title="${isSplit?'Edit split':'Split across categories'}">${iconSplit()}</button>
      <button class="row-icon-btn" data-action="convert-transfer" data-id="${t.id}" title="Convert to transfer">${iconSwap()}</button>
      ${t.linkedEventId?`<button class="row-icon-btn" data-action="unlink-return" data-id="${t.id}" title="Remove refund/reversal link">${iconLink()}</button>`:t.amount>0?`<button class="row-icon-btn" data-action="link-return" data-id="${t.id}" title="Link to an original payment">${iconLink()}</button>`:''}
      <button class="row-icon-btn" data-action="edit-tx" data-id="${t.id}" title="Edit">${iconEdit()}</button>
      <button class="row-icon-btn" data-action="delete-tx" data-id="${t.id}" title="Delete">${iconTrash()}</button>
    </td>
  </tr>`;
}
function iconSplit(){ return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 3v7a4 4 0 0 0 4 4h4"/><path d="M6 21v-7"/><path d="m14 10 4 4-4 4"/></svg>`; }
function iconSwap(){ return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/></svg>`; }
function iconLink(){return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10 13a5 5 0 0 0 7.1.1l2-2a5 5 0 0 0-7.1-7.1l-1.1 1.1"/><path d="M14 11a5 5 0 0 0-7.1-.1l-2 2A5 5 0 0 0 12 20l1.1-1.1"/></svg>`;}
function iconUndo(){ return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 .49-9.36L1 10"/></svg>`; }
function iconEdit(){ return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4Z"/></svg>`; }
function iconTrash(){ return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2"/></svg>`; }

function deleteTx(id){
  const t = DB.transactions.find(x=>x.id===id);
  if(!t) return;
  if(transactionStatus(t)==='reconciled'){ toast('Reconciled transactions are locked. Reopen the reconciliation first.', 'error'); return; }
  if(warnClosedPeriod(t))return;
  const pair = t.transferId ? DB.transactions.find(x=> x.transferId===t.transferId && x.id!==t.id) : null;
  if(pair && transactionStatus(pair)==='reconciled'){ toast('The matching side is reconciled and locked. Reopen that account reconciliation first.', 'error'); return; }
  if(pair&&warnClosedPeriod(pair))return;
  openModal(`
    <div class="modal-head"><h3>${pair ? 'Delete this transfer?' : 'Delete transaction?'}</h3></div>
    <div class="modal-body">
      <p style="margin:0 0 4px;">${escHTML(t.description)}</p>
      <p style="color:var(--ink-soft); font-size:13px; margin:0;">${ukDate(t.date)} · ${gbp(t.amount,{signed:true})}</p>
      ${pair ? `<p style="color:var(--ink-soft); font-size:13px; margin:8px 0 0;">This will also remove the matching side: <strong>${escHTML(pair.account)}</strong> ${gbp(pair.amount,{signed:true})}.</p>` : ''}
    </div>
    <div class="modal-foot"><button class="btn" id="m-cancel">Cancel</button><button class="btn btn-danger" id="m-confirm">Delete</button></div>
  `);
  document.getElementById('m-cancel').onclick = closeModal;
  document.getElementById('m-confirm').onclick = ()=>{
    const linked=(DB.transactionLinks||[]).filter(link=>[link.originalTransactionId,link.returnTransactionId].includes(t.id)||(pair&&[link.originalTransactionId,link.returnTransactionId].includes(pair.id)));linked.forEach(link=>PocketLedgerLinkedEvents.removeLink(link,DB.transactions));DB.transactionLinks=(DB.transactionLinks||[]).filter(link=>!linked.includes(link));
    if(pair) DB.transactions = DB.transactions.filter(x=> x.transferId !== t.transferId);
    else DB.transactions = DB.transactions.filter(x=>x.id!==id);
    scheduleSave(); closeModal(); renderContent(); toast(pair ? 'Transfer deleted' : 'Transaction deleted');
  };
}
function openReturnLinkModal(id){
  const returned=DB.transactions.find(transaction=>transaction.id===id);if(!returned||returned.amount<=0||returned.transferId)return;
  if(transactionStatus(returned)==='reconciled'){toast('Reopen this transaction’s reconciliation before changing its reporting link','error');return;}
  if(warnClosedPeriod(returned))return;
  const candidates=PocketLedgerLinkedEvents.suggestOriginals(returned,DB.transactions);if(!candidates.length){toast('No eligible earlier outgoing payment was found on this account','error');return;}
  openModal(`<div class="modal-head"><h3>Link returned money</h3></div><div class="modal-body"><p style="margin:0 0 12px;color:var(--ink-soft);font-size:12.5px;">${escHTML(returned.description)} · ${ukDate(returned.date)} · ${gbp(returned.amount)}</p><div class="field"><label>What happened?</label><select id="return-type"><option value="refund">Refund</option><option value="reversal">Reversed payment</option><option value="chargeback">Chargeback</option></select></div><div class="field" style="margin-top:10px;"><label>Original payment</label><select id="return-original">${candidates.map(candidate=>`<option value="${escAttr(candidate.transaction.id)}">${ukDate(candidate.transaction.date)} · ${escHTML(candidate.transaction.description)} · ${gbp(Math.abs(candidate.transaction.amount))}${candidate.difference?` · ${gbp(candidate.difference)} partial`:''}</option>`).join('')}</select></div><p style="font-size:11px;color:var(--ink-faint);margin:10px 0 0;">The incoming money will reduce the original spending category instead of being counted as income. The bank balance and both original transactions remain unchanged.</p></div><div class="modal-foot"><button class="btn" id="m-cancel">Cancel</button><button class="btn btn-primary" id="m-confirm">Link return</button></div>`);
  document.getElementById('m-cancel').onclick=closeModal;document.getElementById('m-confirm').onclick=()=>{const original=DB.transactions.find(transaction=>transaction.id===document.getElementById('return-original').value);try{const link=PocketLedgerLinkedEvents.createReturnLink({uid,original,returned,type:document.getElementById('return-type').value});if(!DB.transactionLinks)DB.transactionLinks=[];DB.transactionLinks.push(link);scheduleSave();closeModal();renderContent();toast('Returned money linked to its original payment');}catch(error){toast(error.message,'error');}};
}
function unlinkReturnEvent(transactionId){
  const transaction=DB.transactions.find(row=>row.id===transactionId);if(!transaction||transactionStatus(transaction)==='reconciled'){toast('Reopen this transaction’s reconciliation before removing its link','error');return;}
  if(warnClosedPeriod(transaction))return;
  const link=(DB.transactionLinks||[]).find(item=>item.returnTransactionId===transactionId);if(!link)return;PocketLedgerLinkedEvents.removeLink(link,DB.transactions);DB.transactionLinks=DB.transactionLinks.filter(item=>item.id!==link.id);scheduleSave();renderContent();toast('Return link removed');
}
function openConvertToTransferModal(id){
  const t = DB.transactions.find(x=>x.id===id);
  if(!t || t.transferId) return;
  if(transactionStatus(t)==='reconciled'){ toast('Reconciled transactions are locked. Reopen the reconciliation first.', 'error'); return; }
  if(warnClosedPeriod(t))return;
  if(t.splits && t.splits.length){ toast('Remove the split before converting this to a transfer', 'error'); return; }
  const outgoing = t.amount<0;
  const candidates=PocketLedgerTransfers.findCandidates({transactions:DB.transactions,transaction:t,maxDays:3});
  openModal(`
    <div class="modal-head"><h3>Convert to transfer</h3></div>
    <div class="modal-body">
      <p style="margin:0 0 4px;">${escHTML(t.description)}</p>
      <p style="color:var(--ink-soft); font-size:13px; margin:0 0 14px;">${ukDate(t.date)} · ${escHTML(t.account||'—')} · ${gbp(t.amount,{signed:true})}</p>
      <div class="field">
        <label>${outgoing ? 'Which account did this money go TO?' : 'Which account did this money come FROM?'}</label>
        <select id="cv-other-account"><option value="">Choose account…</option>${activeAccountNames().filter(a=>a!==t.account).map(a=>`<option value="${escAttr(a)}">${escHTML(a)}</option>`).join('')}</select>
      </div>
      <div class="field" style="margin-top:10px;"><label>Amount ${outgoing?'received by':'sent from'} the other account (£)</label><input type="number" id="cv-other-amount" min="0.01" step="0.01" value="${Math.abs(t.amount).toFixed(2)}"><span style="font-size:10.5px;color:var(--ink-faint);">Usually the same. Enter the amount actually credited when a provider deducted a deposit or FX fee.</span></div>
      ${candidates.length?`<div class="field" style="margin-top:10px;"><label>Possible existing matching entry</label><select id="cv-existing-match"><option value="">Create the other side</option>${candidates.map(candidate=>`<option value="${candidate.transaction.id}">${ukDate(candidate.transaction.date)} · ${escHTML(candidate.transaction.account)} · ${gbp(candidate.transaction.amount,{signed:true})}${candidate.difference?` · ${gbp(candidate.difference)} difference`:''}</option>`).join('')}</select><span style="font-size:10.5px;color:var(--ink-faint);">Choose a match to link two imported entries instead of creating a duplicate.</span></div>`:''}
      <p style="color:var(--ink-faint); font-size:11.5px; margin:10px 0 0;">This will link it to a matching entry on the other account and remove its category. Any difference between the two sides is retained as a transfer cost, so the bank statement still reconciles.</p>
    </div>
    <div class="modal-foot"><button class="btn" id="m-cancel">Cancel</button><button class="btn btn-primary" id="m-confirm">Convert</button></div>
  `);
  const matchEl=document.getElementById('cv-existing-match');
  if(matchEl)matchEl.onchange=()=>{const match=DB.transactions.find(row=>row.id===matchEl.value);if(!match)return;document.getElementById('cv-other-account').value=match.account;document.getElementById('cv-other-amount').value=Math.abs(match.amount).toFixed(2);};
  document.getElementById('m-cancel').onclick = closeModal;
  document.getElementById('m-confirm').onclick = ()=>{
    const otherAccount = document.getElementById('cv-other-account').value.trim(),otherAmount=Number(document.getElementById('cv-other-amount').value),existingMatch=matchEl&&matchEl.value?DB.transactions.find(row=>row.id===matchEl.value):null;
    if(!otherAccount){ toast('Enter the other account', 'error'); return; }
    if(otherAccount === t.account){ toast('That\u2019s the same account this transaction is already on', 'error'); return; }
    if(!Number.isFinite(otherAmount)||otherAmount<=0){toast('Enter the positive amount on the other account','error');return;}
    const tid = uid('xfer'),difference=Math.round((Math.abs(t.amount)-otherAmount)*100)/100;
    t.transferId = tid;
    if(Math.abs(difference)>=0.005)t.transferFee=Math.abs(difference);
    t.preTransferCategory = t.category;
    t.category = '';
    if(existingMatch){
      existingMatch.transferId=tid;existingMatch.preTransferCategory=existingMatch.category;existingMatch.category='';
      if(Math.abs(difference)>=0.005)existingMatch.transferFee=Math.abs(difference);
    }else DB.transactions.push({
        id: uid('tx'), date: t.date, amount: outgoing?otherAmount:-otherAmount,
        description: outgoing ? `Transfer from ${t.account}` : `Transfer to ${t.account}`,
        category: '', account: otherAccount, notes: t.notes||'', source:'manual', transferId: tid, transferFee:Math.abs(difference)>=0.005?Math.abs(difference):undefined,status:transactionStatus(t),
      });
    scheduleSave(); closeModal(); renderContent();
    toast(existingMatch?'Existing entries linked as a transfer':'Converted to a transfer');
  };
}
function revertTransfer(id){
  const t = DB.transactions.find(x=>x.id===id);
  if(!t || !t.transferId) return;
  if(transactionStatus(t)==='reconciled'){ toast('Reconciled transactions are locked. Reopen the reconciliation first.', 'error'); return; }
  if(warnClosedPeriod(t))return;
  const pair = DB.transactions.find(x=> x.transferId===t.transferId && x.id!==t.id);
  if(pair && transactionStatus(pair)==='reconciled'){ toast('The matching side is reconciled and locked. Reopen that account reconciliation first.', 'error'); return; }
  if(pair&&warnClosedPeriod(pair))return;
  const hadOriginalCategory = t.preTransferCategory !== undefined;
  openModal(`
    <div class="modal-head"><h3>Remove transfer tag?</h3></div>
    <div class="modal-body">
      <p style="margin:0 0 4px;">${escHTML(t.description)}</p>
      <p style="color:var(--ink-soft); font-size:13px; margin:0 0 12px;">${ukDate(t.date)} · ${escHTML(t.account||'—')} · ${gbp(t.amount,{signed:true})}</p>
      <p style="color:var(--ink-soft); font-size:13px; margin:0;">This one will go back to being a normal ${t.amount>0?'income':'expense'} transaction${hadOriginalCategory && t.preTransferCategory ? `, restored to its original category (<strong>${escHTML(t.preTransferCategory)}</strong>)` : ''}.</p>
      ${pair ? `<p style="color:var(--ink-soft); font-size:13px; margin:8px 0 0;">The matching entry on <strong>${escHTML(pair.account)}</strong> (${gbp(pair.amount,{signed:true})}) will be deleted, since it only existed to make the transfer balance.</p>` : ''}
    </div>
    <div class="modal-foot"><button class="btn" id="m-cancel">Cancel</button><button class="btn btn-primary" id="m-confirm">Remove transfer tag</button></div>
  `);
  document.getElementById('m-cancel').onclick = closeModal;
  document.getElementById('m-confirm').onclick = ()=>{
    if(pair) DB.transactions = DB.transactions.filter(x=> x.id!==pair.id);
    delete t.transferId;
    delete t.transferFee;
    if(hadOriginalCategory){ t.category = t.preTransferCategory; delete t.preTransferCategory; }
    scheduleSave(); closeModal(); renderContent();
    toast('Transfer tag removed');
  };
}

function openTxModal(id){
  const t = id ? DB.transactions.find(x=>x.id===id) : null;
  if(t && transactionStatus(t)==='reconciled'){ toast('Reconciled transactions are locked. Reopen the reconciliation first.', 'error'); return; }
  if(t&&warnClosedPeriod(t))return;
  const isIncome = t ? t.amount>0 : false;
  const isSplit = !!(t && t.splits && t.splits.length);
  const availableAccounts=activeAccountNames();
  if(t&&t.account&&!availableAccounts.includes(t.account))availableAccounts.push(t.account);
  const defaultAccount=t&&t.account?t.account:(DB.appPreferences?.lastUsedAccount&&availableAccounts.includes(DB.appPreferences.lastUsedAccount)?DB.appPreferences.lastUsedAccount:(preferredImportAccountName()||availableAccounts[0]||''));
  const defaultToAccount=availableAccounts.find(account=>account!==defaultAccount)||'';
  const accountOptions=selected=>availableAccounts.map(account=>`<option value="${escAttr(account)}" ${account===selected?'selected':''}>${escHTML(account)}</option>`).join('');
  openModal(`
    <div class="modal-head"><h3>${t?'Edit transaction':'Add transaction'}</h3></div>
    <div class="modal-body">
      <div class="field span2" style="margin-bottom:14px;">
        <label>Type</label>
        <div class="seg" id="tx-type-seg">
          <button type="button" data-k="expense" class="${!isIncome?'active':''}">Spent</button>
          <button type="button" data-k="income" class="${isIncome?'active':''}">Received</button>
          ${t ? '' : `<button type="button" data-k="transfer">Moved between accounts</button>`}
        </div>
      </div>
      <div class="form-grid">
        <div class="field"><label>Date</label><input type="date" id="tx-date" value="${t?t.date:todayISO()}"></div>
        <div class="field"><label id="tx-amount-label">Amount (£)</label><input type="number" id="tx-amount" min="0" step="0.01" value="${t?Math.abs(t.amount).toFixed(2):''}" placeholder="0.00" ${isSplit?'readonly title="This transaction is split across categories — edit amounts via Manage split"':''}></div>
        <div class="field span2" id="tx-desc-wrap"><label>Description</label><input type="text" id="tx-desc" value="${t?escAttr(t.description):''}" placeholder="e.g. Tesco Store"></div>
        <div class="field" id="tx-category-wrap">
          <label>Category</label>
          ${isSplit
            ? `<div><span class="stamp c-split" style="display:inline-block;margin-bottom:6px;">Split (${t.splits.length})</span><br><button type="button" class="btn btn-sm" id="tx-manage-split">Manage split…</button></div>`
            : `<select id="tx-category"></select>`}
        </div>
        <div class="field" id="tx-account-wrap"><label>Account</label><select id="tx-account">${accountOptions(defaultAccount)}</select></div>
        <div class="field" id="tx-status-wrap"><label>Status</label><select id="tx-status"><option value="pending" ${t&&transactionStatus(t)==='pending'?'selected':''}>Pending</option><option value="cleared" ${!t||transactionStatus(t)==='cleared'?'selected':''}>Cleared</option></select></div>
        <div class="field" id="tx-from-wrap" style="display:none;"><label>Money left</label><select id="tx-from-account">${accountOptions(defaultAccount)}</select></div>
        <div class="field" id="tx-to-wrap" style="display:none;"><label>Money arrived in</label><select id="tx-to-account">${accountOptions(defaultToAccount)}</select></div>
        <div class="field" id="tx-received-wrap" style="display:none;"><label>Amount received (£)</label><input type="number" id="tx-received-amount" min="0.01" step="0.01" placeholder="0.00"><span style="font-size:10.5px;color:var(--ink-faint);">Use the amount actually credited. For example, £100.70 sent and £100.00 received records a £0.70 cost.</span></div>
        <div class="field" id="tx-transfer-status-wrap" style="display:none;"><label>Transfer status</label><select id="tx-transfer-status"><option value="pending">Pending</option><option value="cleared" selected>Cleared</option></select></div>
        <div class="field span2" id="tx-transfer-summary" style="display:none;font-size:11.5px;color:var(--ink-faint);"></div>
        <div class="field span2" id="tx-excluded-wrap">
          <label class="regular-toggle" style="font-size:12.5px;">
            <input type="checkbox" id="tx-excluded" ${t&&t.excluded?'checked':''}> Don't count this as income or spending
          </label>
          <div style="font-size:11px;color:var(--ink-faint);margin-top:3px;">For things like money you're holding for someone else — it still counts toward your balance, just not your income/spending totals, budgets or recurring detection.</div>
        </div>
        <div class="field span2"><label>Notes (optional)</label><textarea id="tx-notes">${t?escHTML(t.notes||''):''}</textarea></div>
      </div>
    </div>
    <div class="modal-foot"><button class="btn" id="m-cancel">Cancel</button><button class="btn btn-primary" id="m-save">${t?'Save changes':'Add'}</button></div>
  `);
  if(isSplit){ document.getElementById('tx-manage-split').onclick = ()=>{ closeModal(); openSplitModal(id); }; }
  let currentKind = isIncome ? 'income' : 'expense';
  let receivedTouched=false;
  function fillCategories(){
    const sel = document.getElementById('tx-category');
    if(!sel) return;
    const opts = DB.categories.filter(c=>c.kind===currentKind);
    sel.innerHTML = opts.map(c=>`<option value="${escAttr(c.name)}" ${t&&t.category===c.name?'selected':''}>${escHTML(c.name)}</option>`).join('');
  }
  function updateFieldVisibility(){
    const isTransfer = currentKind==='transfer';
    document.getElementById('tx-category-wrap').style.display = isTransfer ? 'none' : '';
    document.getElementById('tx-account-wrap').style.display = isTransfer ? 'none' : '';
    document.getElementById('tx-status-wrap').style.display = isTransfer ? 'none' : '';
    document.getElementById('tx-from-wrap').style.display = isTransfer ? '' : 'none';
    document.getElementById('tx-to-wrap').style.display = isTransfer ? '' : 'none';
    document.getElementById('tx-received-wrap').style.display = isTransfer ? '' : 'none';
    document.getElementById('tx-transfer-status-wrap').style.display = isTransfer ? '' : 'none';
    document.getElementById('tx-transfer-summary').style.display = isTransfer ? '' : 'none';
    document.getElementById('tx-excluded-wrap').style.display = isTransfer ? 'none' : '';
    document.getElementById('tx-amount-label').textContent = isTransfer ? 'Amount sent (£)' : 'Amount (£)';
    document.getElementById('tx-desc').placeholder = isTransfer ? 'e.g. Savings top-up (optional)' : 'e.g. Tesco Store';
    if(isTransfer&&!receivedTouched&&!document.getElementById('tx-received-amount').value)document.getElementById('tx-received-amount').value=document.getElementById('tx-amount').value;
    updateTransferSummary();
  }
  function updateTransferSummary(){
    const host=document.getElementById('tx-transfer-summary');if(!host)return;
    const sent=Number(document.getElementById('tx-amount').value),received=Number(document.getElementById('tx-received-amount').value),from=document.getElementById('tx-from-account').value,to=document.getElementById('tx-to-account').value;
    if(currentKind!=='transfer'||!sent||!received){host.textContent='Choose two existing accounts. Transfers do not count as income or spending.';return;}
    const cost=Math.abs(Math.round((sent-received)*100)/100);
    host.innerHTML=`<strong>${escHTML(from||'—')} → ${escHTML(to||'—')}</strong> · ${gbp(sent)} sent · ${gbp(received)} received${cost>=0.005?` · ${gbp(cost)} transfer cost`:''}`;
  }
  fillCategories();
  updateFieldVisibility();
  document.getElementById('tx-type-seg').addEventListener('click', e=>{
    const b = e.target.closest('button'); if(!b) return;
    currentKind = b.dataset.k;
    document.querySelectorAll('#tx-type-seg button').forEach(x=>x.classList.toggle('active', x===b));
    fillCategories();
    updateFieldVisibility();
  });
  document.getElementById('tx-amount').addEventListener('input',()=>{if(currentKind==='transfer'&&!receivedTouched)document.getElementById('tx-received-amount').value=document.getElementById('tx-amount').value;updateTransferSummary();});
  document.getElementById('tx-received-amount').addEventListener('input',()=>{receivedTouched=true;updateTransferSummary();});
  document.getElementById('tx-from-account').addEventListener('change',updateTransferSummary);
  document.getElementById('tx-to-account').addEventListener('change',updateTransferSummary);
  document.getElementById('m-cancel').onclick = closeModal;
  document.getElementById('m-save').onclick = ()=>{
    const date = document.getElementById('tx-date').value;
    const amountRaw = parseFloat(document.getElementById('tx-amount').value);
    const notes = document.getElementById('tx-notes').value.trim();
    if(!date || isNaN(amountRaw) || amountRaw<=0){
      toast('Please fill in date and a positive amount', 'error'); return;
    }
    if(currentKind==='transfer'){
      const fromAccount = document.getElementById('tx-from-account').value;
      const toAccount = document.getElementById('tx-to-account').value;
      const receivedAmount=Number(document.getElementById('tx-received-amount').value);
      const desc = document.getElementById('tx-desc').value.trim();
      let pair;
      try{pair=PocketLedgerTransfers.createPair({uid,date,fromAccount,toAccount,sentAmount:amountRaw,receivedAmount,description:desc,notes,status:document.getElementById('tx-transfer-status').value});}
      catch(error){toast(error.message,'error');return;}
      DB.transactions.push(...pair.transactions);
      DB.appPreferences.lastUsedAccount=fromAccount;
      scheduleSave(); closeModal(); renderContent();
      toast(pair.fee?`Transfer recorded with ${gbp(pair.fee)} cost`:`Transfer of ${gbp(pair.sent)} recorded`);
      return;
    }
    const desc = document.getElementById('tx-desc').value.trim();
    const category = isSplit ? t.category : document.getElementById('tx-category').value;
    const account = document.getElementById('tx-account').value.trim();
    const excluded = document.getElementById('tx-excluded').checked;
    const status = document.getElementById('tx-status').value;
    if(!desc){
      toast('Please enter a description', 'error'); return;
    }
    if(account) ensureAccountRecord(account);
    const amount = currentKind==='income' ? Math.abs(amountRaw) : -Math.abs(amountRaw);
    if(t){
      Object.assign(t, {date, amount, description:desc, category, account, notes, excluded, status});
    } else {
      DB.transactions.push({id:uid('tx'), date, amount, description:desc, category, account, notes, excluded, source:'manual', status});
    }
    DB.appPreferences.lastUsedAccount=account;scheduleSave(); closeModal(); renderContent();
    toast(t?'Transaction updated':'Transaction added');
  };
}

function openSplitModal(id){
  const t = DB.transactions.find(x=>x.id===id);
  if(!t) return;
  if(transactionStatus(t)==='reconciled'){ toast('Reconciled transactions are locked. Reopen the reconciliation first.', 'error'); return; }
  if(warnClosedPeriod(t))return;
  if(t.transferId){ toast('Transfers can\u2019t be split', 'error'); return; }
  const sign = t.amount<0 ? -1 : 1;
  const total = Math.abs(t.amount);
  const kind = t.amount>0 ? 'income' : 'expense';
  let rows;
  if(t.splits && t.splits.length){
    rows = t.splits.map(s=>({id:s.id||uid('sp'), category:s.category||'', amount:Math.abs(s.amount)}));
  } else {
    rows = [
      {id:uid('sp'), category:t.category||'', amount:total},
      {id:uid('sp'), category:'', amount:0},
    ];
  }
  const wasSplit = !!(t.splits && t.splits.length);

  function currentRemaining(){
    const allocated = rows.reduce((s,r)=> s+(parseFloat(r.amount)||0), 0);
    return Math.round((total-allocated)*100)/100;
  }
  function updateRemaining(){
    const remaining = currentRemaining();
    const el = document.getElementById('split-remaining');
    if(el){ el.textContent = gbp(remaining); el.style.color = Math.abs(remaining)<0.005 ? 'var(--income)' : 'var(--expense)'; }
    const saveBtn = document.getElementById('m-save');
    if(saveBtn) saveBtn.disabled = Math.abs(remaining) >= 0.005;
  }
  function render(){
    const catOpts = DB.categories.filter(c=>c.kind===kind);
    const remaining = currentRemaining();
    openModal(`
      <div class="modal-head"><h3>Split transaction</h3></div>
      <div class="modal-body">
        <p style="margin:0 0 4px;">${escHTML(t.description)}</p>
        <p style="color:var(--ink-soft);font-size:13px;margin:0 0 14px;">${ukDate(t.date)} · ${escHTML(t.account||'—')} · Total ${gbp(total)}</p>
        <div id="split-rows" style="display:flex;flex-direction:column;gap:8px;">
          ${rows.map((r,i)=>`
            <div style="display:flex;gap:8px;align-items:center;">
              <select class="split-cat" data-i="${i}" style="flex:1;min-width:0;">
                <option value="">Uncategorised</option>
                ${catOpts.map(c=>`<option value="${escAttr(c.name)}" ${r.category===c.name?'selected':''}>${escHTML(c.name)}</option>`).join('')}
              </select>
              <input type="number" class="split-amt" data-i="${i}" min="0" step="0.01" value="${r.amount.toFixed(2)}" style="width:100px;flex-shrink:0;">
              <button type="button" class="row-icon-btn" data-action="split-del" data-i="${i}" title="Remove this split" ${rows.length<=2?'disabled':''}>${iconTrash()}</button>
            </div>
          `).join('')}
        </div>
        <button type="button" class="btn btn-sm" id="split-add" style="margin-top:10px;">${iconPlus()} Add another split</button>
        <div class="qc-line qc-total" style="margin-top:14px;">
          <span>Remaining to allocate</span>
          <span class="num" id="split-remaining" style="color:${Math.abs(remaining)<0.005?'var(--income)':'var(--expense)'};">${gbp(remaining)}</span>
        </div>
      </div>
      <div class="modal-foot">
        ${wasSplit ? `<button class="btn" id="m-unsplit" style="margin-right:auto;">Remove split</button>` : ''}
        <button class="btn" id="m-cancel">Cancel</button>
        <button class="btn btn-primary" id="m-save" ${Math.abs(remaining)>=0.005?'disabled':''}>Save split</button>
      </div>
    `);
    wire();
  }
  function wire(){
    document.getElementById('m-cancel').onclick = closeModal;
    document.querySelectorAll('.split-cat').forEach(sel=> sel.onchange = e=>{ rows[+e.target.dataset.i].category = e.target.value; });
    document.querySelectorAll('.split-amt').forEach(inp=> inp.oninput = e=>{ rows[+e.target.dataset.i].amount = parseFloat(e.target.value)||0; updateRemaining(); });
    document.querySelectorAll('[data-action="split-del"]').forEach(b=> b.onclick = e=>{
      const i = +e.currentTarget.dataset.i;
      if(rows.length<=2) return;
      rows.splice(i,1);
      render();
    });
    document.getElementById('split-add').onclick = ()=>{ rows.push({id:uid('sp'), category:'', amount:0}); render(); };
    const unsplitBtn = document.getElementById('m-unsplit');
    if(unsplitBtn) unsplitBtn.onclick = ()=>{
      delete t.splits;
      t.category = '';
      scheduleSave(); closeModal(); renderContent(); renderSidebarBits();
      toast('Split removed — pick a category for this transaction');
    };
    document.getElementById('m-save').onclick = ()=>{
      if(Math.abs(currentRemaining()) >= 0.005){ toast('Amounts must add up to the total', 'error'); return; }
      const cleanRows = rows.filter(r=> r.amount>0.004);
      if(cleanRows.length < 2){
        delete t.splits;
        t.category = cleanRows[0] ? cleanRows[0].category : '';
      } else {
        t.splits = cleanRows.map(r=>({id:r.id, category:r.category, amount: sign*r.amount}));
        t.category = '';
      }
      scheduleSave(); closeModal(); renderContent(); renderSidebarBits();
      toast('Split saved');
    };
  }
  render();
}

function autoCategoriseAll(){
  let count = 0;
  const before = [];
  DB.transactions.forEach(t=>{
    if(!t.category && !t.transferId && !(t.splits&&t.splits.length)){
      const s = suggestCategory(t.description, t.amount);
      if(s){ before.push({id:t.id}); t.category = s; count++; }
    }
  });
  if(count){
    pushUndo(`auto-categorise ${count} transaction${count===1?'':'s'}`, ()=>{
      before.forEach(b=>{ const t = DB.transactions.find(x=>x.id===b.id); if(t) t.category=''; });
    });
    scheduleSave(); renderContent();
    offerUndo(`Auto-categorised ${count} transaction${count===1?'':'s'}`);
  }
  else toast('No matching rules for your uncategorised transactions');
}
function reapplyRulesToAll(){
  const f = UI.txFilters;
  const isFiltered = !!(f.search || f.category!=='all' || f.type!=='all' || f.from || f.to);
  const scope = filteredSortedTx();
  const changes = [];
  scope.forEach(t=>{
    if(t.transferId || (t.splits&&t.splits.length)) return;
    const suggested = suggestCategory(t.description, t.amount);
    if(suggested && suggested !== t.category){
      changes.push({id:t.id, description:t.description, prevCategory:t.category, from:t.category||'Uncategorised', to:suggested});
    }
  });
  const scopeLabel = isFiltered ? `within your current filters (${scope.length} transaction${scope.length===1?'':'s'} matched)` : `across all ${scope.length} transactions`;
  if(!changes.length){ toast(`Everything ${scopeLabel} already matches your current rules`); return; }
  openModal(`
    <div class="modal-head"><h3>Re-check ${isFiltered?'filtered':'all'} categories?</h3></div>
    <div class="modal-body">
      <p style="margin:0 0 10px;color:var(--ink-soft);font-size:13px;">${changes.length} transaction${changes.length===1?'':'s'} ${scopeLabel} will be updated to match your current rules — including ones that already have a different category assigned.</p>
      <div style="max-height:200px;overflow:auto;border:1px solid var(--line);border-radius:8px;padding:4px 10px;">
        ${changes.slice(0,10).map(c=>`<div style="font-size:12px;padding:6px 0;border-bottom:1px solid var(--line);">${escHTML(c.description)}<br><span style="color:var(--ink-faint);">${escHTML(c.from)}</span> → <strong>${escHTML(c.to)}</strong></div>`).join('')}
        ${changes.length>10 ? `<div style="font-size:11.5px;color:var(--ink-faint);padding:6px 0 2px;">and ${changes.length-10} more…</div>` : ''}
      </div>
    </div>
    <div class="modal-foot"><button class="btn" id="m-cancel">Cancel</button><button class="btn btn-primary" id="m-confirm">Update ${changes.length}</button></div>
  `);
  document.getElementById('m-cancel').onclick = closeModal;
  document.getElementById('m-confirm').onclick = ()=>{
    changes.forEach(c=>{
      const t = DB.transactions.find(x=>x.id===c.id);
      if(t) t.category = c.to;
    });
    pushUndo(`re-check ${changes.length} transaction${changes.length===1?'':'s'}`, ()=>{
      changes.forEach(c=>{ const t = DB.transactions.find(x=>x.id===c.id); if(t) t.category = c.prevCategory; });
    });
    scheduleSave(); closeModal(); renderContent();
    offerUndo(`Updated ${changes.length} transaction${changes.length===1?'':'s'}`);
  };
}

/* =========================================================
   DUPLICATE DETECTION
   ========================================================= */
function iconLayers(){ return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><path d="m12 2 9 5-9 5-9-5 9-5Z"/><path d="m3 12 9 5 9-5"/><path d="m3 17 9 5 9-5"/></svg>`; }
// Groups likely-duplicate transactions: an EXACT match (same date, amount,
// and description) is very high confidence — usually a statement imported
// twice. A LIKELY match (same amount, same cleaned merchant name, dates
// within 3 days) catches the same transaction entered once manually and
// once via a later import with a slightly different posted date. Transfers
// are excluded since a transfer pair is *supposed* to have a mirrored
// amount on a different account — that's not a duplicate, it's by design.
function findDuplicateGroups(){
  const list = DB.transactions.filter(t=>!t.transferId);
  const exactMap = new Map();
  list.forEach(t=>{
    const key = t.date+'|'+t.amount.toFixed(2)+'|'+t.description.trim().toUpperCase()+'|'+(t.account||'');
    if(!exactMap.has(key)) exactMap.set(key, []);
    exactMap.get(key).push(t);
  });
  const used = new Set();
  const groups = [];
  exactMap.forEach(group=>{
    if(group.length>1){
      groups.push({type:'exact', items:group});
      group.forEach(t=>used.add(t.id));
    }
  });
  const remaining = list.filter(t=>!used.has(t.id));
  const likelyMap = new Map();
  remaining.forEach(t=>{
    const key = t.amount.toFixed(2)+'|'+merchantKeyFor(t.description)+'|'+(t.account||'');
    if(!likelyMap.has(key)) likelyMap.set(key, []);
    likelyMap.get(key).push(t);
  });
  likelyMap.forEach(group=>{
    if(group.length<2) return;
    group.sort((a,b)=>a.date.localeCompare(b.date));
    // Cluster within the group by date proximity (<=3 days apart) rather than
    // treating the whole group as one cluster, in case the same merchant/amount
    // recurs months apart (e.g. a regular £30 top-up) — that's not a duplicate.
    let cluster = [group[0]];
    for(let i=1;i<group.length;i++){
      if(Math.abs(daysBetween(group[i-1].date, group[i].date)) <= 3){
        cluster.push(group[i]);
      } else {
        if(cluster.length>1) groups.push({type:'likely', items:cluster.slice()});
        cluster = [group[i]];
      }
    }
    if(cluster.length>1) groups.push({type:'likely', items:cluster.slice()});
  });
  return groups;
}
function openDuplicatesModal(){
  const groups = findDuplicateGroups();
  if(!groups.length){ toast('No likely duplicates found'); return; }
  const totalExtra = groups.reduce((s,g)=> s+(g.items.length-1), 0);
  openModal(`
    <div class="modal-head"><h3>Possible duplicate transactions</h3></div>
    <div class="modal-body">
      <p style="margin:0 0 10px;color:var(--ink-soft);font-size:13px;">Found ${groups.length} group${groups.length===1?'':'s'} — ${totalExtra} transaction${totalExtra===1?'':'s'} could be removed if these are true duplicates. Nothing is deleted until you tick a row and confirm below; the first entry in each group is kept by default.</p>
      <div id="dupe-groups" style="max-height:360px;overflow:auto;display:flex;flex-direction:column;gap:12px;"></div>
    </div>
    <div class="modal-foot"><button class="btn" id="m-cancel">Close</button><button class="btn btn-primary" id="m-confirm">Delete selected</button></div>
  `, {wide:true});
  const host = document.getElementById('dupe-groups');
  host.innerHTML = groups.map((g,gi)=> `
    <div style="border:1px solid var(--line);border-radius:8px;padding:10px 12px;">
      <div style="font-size:11px;font-weight:600;color:${g.type==='exact'?'var(--expense)':'var(--gold)'};margin-bottom:6px;">${g.type==='exact' ? 'EXACT MATCH — same date, amount &amp; description' : 'LIKELY MATCH — same amount &amp; merchant, dates within a few days'}</div>
      ${g.items.map((t,ti)=> `
        <label style="display:flex;align-items:center;gap:8px;padding:4px 0;font-size:12.5px;cursor:pointer;">
          <input type="checkbox" class="dupe-check" data-gi="${gi}" data-id="${t.id}" ${ti>0?'checked':''}>
          <span style="flex:1;">${escHTML(t.description)} <span style="color:var(--ink-faint);">· ${escHTML(t.account||'—')}${(t.splits&&t.splits.length) ? ` · Split (${t.splits.length})` : (t.category?` · ${escHTML(t.category)}`:'')}</span></span>
          <span style="color:var(--ink-faint);">${ukDate(t.date)}</span>
          <span class="num" style="font-weight:600;min-width:70px;text-align:right;">${gbp(t.amount,{signed:true})}</span>
        </label>
      `).join('')}
    </div>
  `).join('');
  document.getElementById('m-cancel').onclick = closeModal;
  document.getElementById('m-confirm').onclick = ()=>{
    const ids = Array.from(host.querySelectorAll('.dupe-check:checked')).map(cb=>cb.dataset.id);
    if(!ids.length){ toast('Nothing selected', 'error'); return; }
    const deleted = DB.transactions.filter(t=>ids.includes(t.id)).map(t=> JSON.parse(JSON.stringify(t)));
    DB.transactions = DB.transactions.filter(t=>!ids.includes(t.id));
    pushUndo(`delete ${ids.length} duplicate transaction${ids.length===1?'':'s'}`, ()=>{
      DB.transactions.push(...deleted);
    });
    scheduleSave(); closeModal(); renderContent(); renderSidebarBits();
    offerUndo(`Deleted ${ids.length} duplicate transaction${ids.length===1?'':'s'}`);
  };
}
