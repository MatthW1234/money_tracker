/* =========================================================
   IMPORT
   ========================================================= */
const ImportEngine=PocketLedgerImport;
function newImportState(){
  return {
    step: 1,
    fileName: '',
    fileFingerprint: '',
    headerSignature: '',
    profileId: '',
    headers: [],
    rows: [],
    hasHeader: true,
    mapping: {date:'', description:'', mode:'single', amount:'', moneyIn:'', moneyOut:'', balance:''},
    negativeIsOutgoing: true,
    dateFormat: 'DMY',
    parsed: [],
    rememberRules: true,
    learnedRules: [],
    destinationAccount: preferredImportAccountName(),
  };
}

function renderImport(c){
  if(!UI.importState) UI.importState = newImportState();
  const st = UI.importState;
  c.innerHTML = `
    <div class="steps" id="wizard-steps">
      ${stepPill(1,'Upload file',st.step)}<span class="step-arrow">›</span>
      ${stepPill(2,'Map columns',st.step)}<span class="step-arrow">›</span>
      ${stepPill(3,'Review & categorise',st.step)}<span class="step-arrow">›</span>
      ${stepPill(4,'Done',st.step)}
    </div>
    <div id="wizard-body"></div>
  `;
  renderWizardStep();
}
function stepPill(n,label,current){
  const cls = n===current ? 'active' : (n<current ? 'done' : '');
  return `<div class="step-pill ${cls}"><span class="n">${n<current?'✓':n}</span>${label}</div>`;
}
function renderWizardStep(){
  const st = UI.importState;
  const body = document.getElementById('wizard-body');
  if(st.step===1) return renderImportStep1(body);
  if(st.step===2) return renderImportStep2(body);
  if(st.step===3) return renderImportStep3(body);
  if(st.step===4) return renderImportStep4(body);
}

function renderImportStep1(body){
  const li = DB.lastImport;
  const sessions=(DB.importSessions||[]).slice().sort((a,b)=>String(b.importedAt).localeCompare(String(a.importedAt))).slice(0,5);
  const importAccounts=activeAccountNames().filter(name=>!isLegacyImportedAccount(name));
  if(!importAccounts.includes(UI.importState.destinationAccount))UI.importState.destinationAccount=preferredImportAccountName();
  const lastImportNote = li ? `
    <div class="last-import-note" style="background:var(--surface-2); border:1px solid var(--line); border-radius:var(--radius); padding:12px 14px; margin-bottom:16px; font-size:12.5px; color:var(--ink-soft); line-height:1.6;">
      <strong style="color:var(--ink);">Last import:</strong> ${timeAgoLabel(li.timestamp)} — ${li.count} transaction${li.count===1?'':'s'} from "${escHTML(li.fileName)}"
      ${li.lastTx ? `<br><strong style="color:var(--ink);">Most recent transaction:</strong> ${ukDate(li.lastTx.date)} · ${escHTML(li.lastTx.description)} · ${gbp(li.lastTx.amount)}` : ''}
    </div>` : '';
  body.innerHTML = `
    <div class="panel">
      <div class="panel-head"><div class="panel-title">Upload your bank statement<small>Exported as CSV from online banking — Santander and most UK banks work the same way</small></div></div>
      ${lastImportNote}
      <div class="dropzone" id="dropzone">
        ${iconUpload()}
        <p><strong>Drag and drop a CSV file here</strong>, or</p>
        <button class="btn btn-primary btn-sm" id="btn-browse">Choose file</button>
        <input type="file" id="file-input" accept=".csv,text/csv" class="hidden">
        <p class="hint" style="margin-top:12px;">Your file stays in this browser — nothing is uploaded anywhere.</p>
      </div>
      <div class="field" style="margin-top:16px; max-width:260px;">
        <label>File has a header row</label>
        <select id="has-header"><option value="yes" selected>Yes, first row is column names</option><option value="no">No, data starts on row 1</option></select>
      </div>
      <div class="field" style="margin-top:12px; max-width:320px;">
        <label>Import into account</label>
        ${importAccounts.length?`<select id="import-account">${importAccounts.map(a=>`<option value="${escAttr(a)}" ${a===UI.importState.destinationAccount?'selected':''}>${escHTML(a)}</option>`).join('')}</select>`:`<div style="padding:10px 12px;border:1px solid var(--line);border-radius:8px;background:var(--gold-wash);color:var(--gold);font-size:12px;">Add a real account before importing. Pocket Ledger will no longer create a generic Imported account.</div><button class="btn btn-sm" id="import-add-account" style="margin-top:8px;">${iconPlus()} Add account</button>`}
        <span style="font-size:11px;color:var(--ink-faint);">Every transaction in this statement will be assigned to this account. Add and rename accounts under Settings.</span>
      </div>
      ${sessions.length?`<div class="panel" style="background:var(--surface-2);margin-top:18px;"><div class="panel-head"><div class="panel-title">Import history<small>Every retained import can be traced back to its source file and rows</small></div></div>${sessions.map(session=>`<div class="movers-row"><span class="movers-desc">${escHTML(session.fileName)}<br><span style="font-size:10.5px;color:var(--ink-faint);">${escHTML(session.accountName)} · ${session.startDate&&session.endDate?`${ukDateShort(session.startDate)} – ${ukDateShort(session.endDate)} · `:''}${session.importedCount} added · ${session.duplicateCount} duplicate${session.duplicateCount===1?'':'s'} skipped</span></span><span class="stamp-mini">${new Date(session.importedAt).toLocaleDateString('en-GB')}</span><button class="row-icon-btn" data-import-session="${session.id}" title="Inspect import">${iconAudit()}</button></div>`).join('')}</div>`:''}
    </div>
  `;
  const dz = document.getElementById('dropzone');
  const input = document.getElementById('file-input');
  document.getElementById('btn-browse').onclick = ()=> input.click();
  dz.addEventListener('dragover', e=>{ e.preventDefault(); dz.classList.add('drag'); });
  dz.addEventListener('dragleave', ()=> dz.classList.remove('drag'));
  dz.addEventListener('drop', e=>{
    e.preventDefault(); dz.classList.remove('drag');
    if(e.dataTransfer.files.length) handleFile(e.dataTransfer.files[0]);
  });
  input.addEventListener('change', e=>{ if(e.target.files.length) handleFile(e.target.files[0]); });
  document.getElementById('has-header').addEventListener('change', e=>{
    UI.importState.hasHeader = e.target.value==='yes';
  });
  const importAccount=document.getElementById('import-account');
  if(importAccount)importAccount.addEventListener('change', e=>{ UI.importState.destinationAccount=e.target.value; });
  const addAccount=document.getElementById('import-add-account');if(addAccount)addAccount.onclick=()=>openAccountModal(null);
  body.querySelectorAll('[data-import-session]').forEach(button=>{button.onclick=()=>openImportSessionModal(button.dataset.importSession);});
}
function iconUpload(){ return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M12 3v12"/><path d="M7 8l5-5 5 5"/><path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2"/></svg>`; }

async function handleFile(file){
  const st = UI.importState;
  st.fileName = file.name;
  try{
    const buf = await file.arrayBuffer();
    st.fileFingerprint=await ImportEngine.fingerprintBuffer(buf);
    const text=ImportEngine.decodeSmart(buf);
    const parsed=ImportEngine.parseCsvText(text,st.hasHeader,csvText=>Papa.parse(csvText,{skipEmptyLines:true}));
    if(!parsed.rows.length){toast('Could not read any rows from that file','error');return;}
    st.headers=parsed.headers;st.rows=parsed.rows;st.mapping=parsed.mapping;st.headerSignature=ImportEngine.headerSignature(parsed.headers);
    const record=accountRecordFor(st.destinationAccount),profile=(DB.importProfiles||[]).find(item=>item.accountId===(record&&record.id)&&item.headerSignature===st.headerSignature&&item.hasHeader===st.hasHeader);
    if(profile){
      const mapped=Object.assign({},profile.mapping),valid=['date','description','amount','moneyIn','moneyOut','balance'].every(key=>!mapped[key]||st.headers.includes(mapped[key]));
      if(valid){st.mapping=mapped;st.dateFormat=profile.dateFormat;st.negativeIsOutgoing=profile.negativeIsOutgoing;st.profileId=profile.id;}
    }
    st.step = 2;
    renderImport(document.getElementById('content'));
    toast(`Loaded ${st.rows.length} rows from ${file.name}`);
  }catch(err){
    console.error(err);
    toast('Could not read that file', 'error');
  }
}
function renderImportStep2(body){
  const st = UI.importState;
  const opts = (sel)=> `<option value="">— not in file —</option>` + st.headers.map(h=>`<option value="${escAttr(h)}" ${h===sel?'selected':''}>${escHTML(h)}</option>`).join('');
  body.innerHTML = `
    <div class="panel">
      <div class="panel-head"><div class="panel-title">Match your columns<small>${escHTML(st.fileName)} · ${st.rows.length} rows · ${st.profileId?'saved mapping profile applied':'we have guessed based on your headers'}</small></div></div>
      <div class="mapping-grid">
        <div class="field"><label>Date column</label><select id="map-date">${opts(st.mapping.date)}</select></div>
        <div class="field"><label>Date format</label><select id="map-dateformat">
          <option value="DMY" ${st.dateFormat==='DMY'?'selected':''}>DD/MM/YYYY (UK)</option>
          <option value="YMD" ${st.dateFormat==='YMD'?'selected':''}>YYYY-MM-DD</option>
          <option value="MDY" ${st.dateFormat==='MDY'?'selected':''}>MM/DD/YYYY (US)</option>
        </select></div>
        <div class="field"><label>Description column</label><select id="map-desc">${opts(st.mapping.description)}</select></div>
        <div class="field"><label>Amount layout</label><select id="map-mode">
          <option value="single" ${st.mapping.mode==='single'?'selected':''}>Single amount column</option>
          <option value="split" ${st.mapping.mode==='split'?'selected':''}>Separate money in / money out</option>
        </select></div>
      </div>
      <div id="map-amount-fields" style="margin-top:14px;"></div>
      <div class="field" style="margin-top:12px;max-width:260px;"><label>Running balance column <span style="font-weight:400;color:var(--ink-faint);">(optional)</span></label><select id="map-balance">${opts(st.mapping.balance||'')}</select><span style="font-size:10.5px;color:var(--ink-faint);">If present, the closing balance can be carried into reconciliation.</span></div>
      <div class="field" style="margin-top:6px;max-width:340px;" id="neg-toggle-wrap"></div>
      <div class="panel" style="background:var(--surface-2); margin-top:16px;">
        <div class="panel-title" style="font-size:13px;margin-bottom:8px;">Preview (first 4 rows)</div>
        <div class="table-wrap" id="map-preview"></div>
      </div>
    </div>
    <div class="modal-foot" style="border:none; padding:16px 0 0;">
      <button class="btn" id="btn-back1">← Back</button>
      <button class="btn btn-primary" id="btn-to-review">Continue →</button>
    </div>
  `;
  function renderAmountFields(){
    const host = document.getElementById('map-amount-fields');
    const negWrap = document.getElementById('neg-toggle-wrap');
    if(st.mapping.mode==='single'){
      host.innerHTML = `<div class="field" style="max-width:260px;"><label>Amount column</label><select id="map-amount">${opts(st.mapping.amount)}</select></div>`;
      negWrap.innerHTML = `<label style="display:flex;align-items:center;gap:8px;font-weight:500;font-size:12.5px;color:var(--ink-soft);"><input type="checkbox" id="map-neg" ${st.negativeIsOutgoing?'checked':''}> Negative amounts are money out (spending)</label>`;
      document.getElementById('map-amount').onchange = e=>{ st.mapping.amount = e.target.value; renderPreview(); };
      document.getElementById('map-neg').onchange = e=>{ st.negativeIsOutgoing = e.target.checked; renderPreview(); };
    } else {
      host.innerHTML = `<div class="mapping-grid">
        <div class="field"><label>Money in (credit) column</label><select id="map-in">${opts(st.mapping.moneyIn)}</select></div>
        <div class="field"><label>Money out (debit) column</label><select id="map-out">${opts(st.mapping.moneyOut)}</select></div>
      </div>`;
      negWrap.innerHTML = '';
      document.getElementById('map-in').onchange = e=>{ st.mapping.moneyIn = e.target.value; renderPreview(); };
      document.getElementById('map-out').onchange = e=>{ st.mapping.moneyOut = e.target.value; renderPreview(); };
    }
  }
  function renderPreview(){
    const sample = st.rows.slice(0,4).map(r=> parseImportRow(r, st));
    document.getElementById('map-preview').innerHTML = `<table><thead><tr><th>Date</th><th>Description</th><th style="text-align:right">Amount</th>${st.mapping.balance?'<th style="text-align:right">Balance</th>':''}</tr></thead><tbody>${
      sample.map(s=> s ? `<tr><td>${s.date?ukDate(s.date):'<span style=\"color:var(--expense)\">invalid</span>'}</td><td class="desc">${escHTML(s.description)}</td><td class="amt ${s.amount>0?'income':''}">${gbp(s.amount,{signed:true})}</td>${st.mapping.balance?`<td class="amt">${Number.isFinite(s.balance)?gbp(s.balance):'—'}</td>`:''}</tr>` : '').join('')
    }</tbody></table>`;
  }
  renderAmountFields();
  renderPreview();
  document.getElementById('map-date').onchange = e=>{ st.mapping.date = e.target.value; renderPreview(); };
  document.getElementById('map-dateformat').onchange = e=>{ st.dateFormat = e.target.value; renderPreview(); };
  document.getElementById('map-desc').onchange = e=>{ st.mapping.description = e.target.value; renderPreview(); };
  document.getElementById('map-mode').onchange = e=>{ st.mapping.mode = e.target.value; renderAmountFields(); renderPreview(); };
  document.getElementById('map-balance').onchange = e=>{ st.mapping.balance=e.target.value;renderPreview(); };
  document.getElementById('btn-back1').onclick = ()=>{ st.step=1; renderImport(document.getElementById('content')); };
  document.getElementById('btn-to-review').onclick = ()=>{
    if(!st.mapping.date || !st.mapping.description || (st.mapping.mode==='single' ? !st.mapping.amount : (!st.mapping.moneyIn && !st.mapping.moneyOut))){
      toast('Please map at least Date, Description and Amount', 'error'); return;
    }
    buildParsedRows();
    st.step = 3;
    renderImport(document.getElementById('content'));
  };
}

function parseImportRow(row,state){return ImportEngine.parseImportRow(row,state,localISODate);}

function buildParsedRows(){
  const st = UI.importState;
  const record=accountRecordFor(st.destinationAccount);
  st.parsed=ImportEngine.buildParsedRows(st,DB.transactions,suggestCategory,localISODate,{accountId:record&&record.id,accountName:st.destinationAccount});
}

function renderImportStep3(body){
  const st = UI.importState;
  const dupCount = st.parsed.filter(p=>p.duplicate).length;
  const invalidCount = st.parsed.filter(p=>!p.date).length;
  body.innerHTML = `
    <div class="panel">
      <div class="panel-head"><div class="panel-title">Review & assign categories<small>${st.parsed.length} rows parsed${dupCount?` · ${dupCount} possible duplicate${dupCount===1?'':'s'} (unticked)`:''}${invalidCount?` · ${invalidCount} with an unreadable date`:''}</small></div></div>
      <div class="tag-toolbar">
        <label style="display:flex;align-items:center;gap:6px;"><input type="checkbox" id="sel-all"> Select all</label>
        <span class="count" id="sel-count">0 selected</span>
        <span style="flex:1"></span>
        <select id="bulk-cat" style="min-width:170px;">${categoryOptionsHTML('')}</select>
        <button class="btn btn-sm" id="bulk-apply">Assign to selected</button>
      </div>
      <div class="table-wrap" style="max-height:420px;">
        <table>
          <thead><tr><th></th><th>Date</th><th>Description</th><th style="text-align:right">Amount</th><th>Category</th><th></th></tr></thead>
          <tbody id="import-body"></tbody>
        </table>
      </div>
      <label style="display:flex;align-items:center;gap:8px;margin-top:14px;font-size:12.5px;color:var(--ink-soft);">
        <input type="checkbox" id="remember-rules" ${st.rememberRules?'checked':''}>
        Remember my category choices as auto-tagging rules for future imports
      </label>
    </div>
    <div class="modal-foot" style="border:none; padding:16px 0 0;">
      <button class="btn" id="btn-back2">← Back</button>
      <button class="btn btn-primary" id="btn-confirm-import">Import <span id="import-n">0</span> transactions</button>
    </div>
  `;
  renderImportBody();
  document.getElementById('sel-all').onchange = e=>{
    st.parsed.forEach(p=>{ if(p.date) p.include = e.target.checked; });
    renderImportBody();
  };
  document.getElementById('bulk-apply').onclick = ()=>{
    const cat = document.getElementById('bulk-cat').value;
    let n=0;
    st.parsed.forEach(p=>{ if(p.include){ p.category = cat; n++; } });
    if(!n){ toast('Select some rows first', 'error'); return; }
    renderImportBody();
    toast(`Applied to ${n} rows`);
  };
  document.getElementById('remember-rules').onchange = e=>{ st.rememberRules = e.target.checked; };
  document.getElementById('btn-back2').onclick = ()=>{ st.step=2; renderImport(document.getElementById('content')); };
  document.getElementById('btn-confirm-import').onclick = confirmImport;
}
function renderImportBody(){
  const st = UI.importState;
  const body = document.getElementById('import-body');
  body.innerHTML = st.parsed.map(p=>{
    const kind = categoryKind(p.category);
    const stampClass = !p.category ? 'c-none' : (kind==='income' ? 'c-income' : 'c-expense');
    return `<tr style="${p.duplicate?'opacity:.6':''}">
      <td><input type="checkbox" class="row-check" data-id="${p.rowId}" ${p.include?'checked':''} ${!p.date?'disabled':''}></td>
      <td>${p.date?ukDateShort(p.date):'<span style="color:var(--expense);font-size:11.5px;">invalid</span>'}</td>
      <td class="desc" title="${escAttr(p.description)}">${escHTML(p.description)} ${p.duplicate?'<span class="dup-flag">possible duplicate</span>':''}</td>
      <td class="amt ${p.amount>0?'income':''}">${gbp(p.amount,{signed:true})}</td>
      <td class="cat-cell"><span class="stamp ${stampClass} cat-badge-clickable" data-action="open-import-cat-picker" data-id="${p.rowId}" title="Click to change category">${escHTML(p.category || 'Uncategorised')}</span></td>
      <td></td>
    </tr>`;
  }).join('');
  body.querySelectorAll('.row-check').forEach(cb=> cb.onchange = e=>{
    const p = st.parsed.find(x=>x.rowId===e.target.dataset.id); p.include = e.target.checked; updateSelCount();
  });
  body.querySelectorAll('[data-action="open-import-cat-picker"]').forEach(el=>{
    el.addEventListener('click', ()=> openInlineImportCategoryPicker(el));
  });
  updateSelCount();
}
function openInlineImportCategoryPicker(badgeEl){
  const st = UI.importState;
  const rowId = badgeEl.dataset.id;
  const p = st.parsed.find(x=>x.rowId===rowId);
  if(!p) return;
  const td = badgeEl.closest('td');
  const sel = document.createElement('select');
  sel.className = 'cat-select-inline';
  sel.innerHTML = categoryOptionsHTML(p.category);
  sel.value = p.category || '';
  td.innerHTML = '';
  td.appendChild(sel);
  sel.focus();
  let committed = false;
  function commit(){
    if(committed) return;
    committed = true;
    p.category = sel.value;
    const kind = categoryKind(p.category);
    const stampClass = !p.category ? 'c-none' : (kind==='income' ? 'c-income' : 'c-expense');
    const badge = document.createElement('span');
    badge.className = `stamp ${stampClass} cat-badge-clickable`;
    badge.dataset.action = 'open-import-cat-picker';
    badge.dataset.id = p.rowId;
    badge.title = 'Click to change category';
    badge.textContent = p.category || 'Uncategorised';
    badge.addEventListener('click', ()=> openInlineImportCategoryPicker(badge));
    td.innerHTML = '';
    td.appendChild(badge);
  }
  sel.addEventListener('change', commit);
  sel.addEventListener('blur', commit);
}
function updateSelCount(){
  const st = UI.importState;
  const n = st.parsed.filter(p=>p.include).length;
  const el = document.getElementById('sel-count'); if(el) el.textContent = `${n} selected`;
  const btnN = document.getElementById('import-n'); if(btnN) btnN.textContent = n;
}

function confirmImport(){
  const st = UI.importState;
  const destinationAccount = String(st.destinationAccount||'').trim();
  if(!destinationAccount){ toast('Choose an account for this import', 'error'); return; }
  const destinationRecord=accountRecordFor(destinationAccount);
  if(!destinationRecord||destinationRecord.archived||isLegacyImportedAccount(destinationAccount)){toast('Choose an active account from Settings before importing','error');return;}
  const toImport = st.parsed.filter(p=>p.include && p.date);
  if(!toImport.length){ toast('No rows selected to import', 'error'); return; }
  const learnedRules = [],sessionId=uid('import'),importedAt=new Date().toISOString(),transactionIds=[];
  if(!DB.importProfiles)DB.importProfiles=[];
  let profile=DB.importProfiles.find(item=>item.id===st.profileId)||DB.importProfiles.find(item=>item.accountId===destinationRecord.id&&item.headerSignature===st.headerSignature&&item.hasHeader===st.hasHeader);
  if(!profile){profile={id:uid('profile'),name:`${destinationAccount} CSV`,accountId:destinationRecord.id,accountName:destinationAccount};DB.importProfiles.push(profile);}
  Object.assign(profile,{accountId:destinationRecord.id,accountName:destinationAccount,headerSignature:st.headerSignature,mapping:Object.assign({},st.mapping),dateFormat:st.dateFormat,negativeIsOutgoing:st.negativeIsOutgoing,hasHeader:st.hasHeader,updatedAt:importedAt});
  const headerIndex=name=>st.headers.indexOf(name),rawValue=(row,name)=>{const index=headerIndex(name);return index<0?'':String(row.rawRow[index]||'');};
  toImport.forEach(p=>{
    const t = {
      id: uid('tx'), date:p.date, description:p.description, amount:p.amount,
      category:p.category||'', account:destinationAccount,accountId:destinationRecord.id, notes:'', source:'import', status:'cleared',
      importProvenance:{
        sessionId,fileName:st.fileName,fileFingerprint:st.fileFingerprint,rowNumber:p.rowNumber,
        rawDate:rawValue(p,st.mapping.date),rawDescription:rawValue(p,st.mapping.description),
        rawAmount:st.mapping.mode==='single'?rawValue(p,st.mapping.amount):`${rawValue(p,st.mapping.moneyIn)} | ${rawValue(p,st.mapping.moneyOut)}`,
        rawRow:p.rawRow.slice(),importedAt,profileId:profile.id,
      },
    };
    DB.transactions.push(t);p.importedTransactionId=t.id;transactionIds.push(t.id);
    if(st.rememberRules){
      const learned = learnRuleFromTransaction(t);
      if(learned) learnedRules.push(learned);
    }
  });
  DB.transactions.sort((a,b)=> a.date.localeCompare(b.date));
  const validDates=st.parsed.filter(p=>p.date).map(p=>p.date).sort();
  const session={
    id:sessionId,fileName:st.fileName,fileFingerprint:st.fileFingerprint,importedAt,accountId:destinationRecord.id,accountName:destinationAccount,
    profileId:profile.id,headerSignature:st.headerSignature,mapping:Object.assign({},st.mapping),dateFormat:st.dateFormat,negativeIsOutgoing:st.negativeIsOutgoing,hasHeader:st.hasHeader,
    totalRows:st.parsed.length,importedCount:toImport.length,duplicateCount:st.parsed.filter(p=>p.duplicate&&!p.include).length,
    excludedCount:st.parsed.filter(p=>p.date&&!p.duplicate&&!p.include).length,invalidCount:st.parsed.filter(p=>!p.date).length,
    startDate:validDates[0]||'',endDate:validDates[validDates.length-1]||'',transactionIds,
    closingBalance:ImportEngine.statementClosingBalance(st.parsed),
    rows:st.parsed.map(p=>({rowNumber:p.rowNumber,status:!p.date?'invalid':p.include?'imported':p.duplicate?'duplicate':'excluded',transactionId:p.importedTransactionId||p.matchedTransactionId||'',date:p.date||'',description:p.description,amount:p.amount})),
  };
  if(!DB.importSessions)DB.importSessions=[];DB.importSessions.push(session);
  const mostRecent = toImport.reduce((best,p)=> (!best || p.date > best.date) ? p : best, null);
  DB.lastImport = {
    timestamp: importedAt,
    fileName: st.fileName,
    count: toImport.length,
    account: destinationAccount,
    accountId:destinationRecord.id,
    sessionId,
    lastTx: mostRecent ? {date: mostRecent.date, description: mostRecent.description, amount: mostRecent.amount} : null,
  };
  scheduleSave();
  st.step = 4;
  st.importedCount = toImport.length;
  st.importSessionId=sessionId;
  st.learnedRules = learnedRules;
  renderImport(document.getElementById('content'));
  renderSidebarBits();
}
function renderImportStep4(body){
  const st = UI.importState;
  const learned = st.learnedRules || [];
  body.innerHTML = `
    <div class="empty-state panel" style="padding:60px 20px;">
      <svg viewBox="0 0 24 24" fill="none" stroke="var(--income)" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="m9 12 2 2 4-4"/></svg>
      <h4>Import complete</h4>
      <p>${st.importedCount} transaction${st.importedCount===1?'':'s'} added to your ledger. The source file and original row are retained for audit and reconciliation.</p>
      ${learned.length ? `
        <div style="text-align:left; max-width:420px; margin:16px auto 0; background:var(--surface-2); border:1px solid var(--line); border-radius:var(--radius); padding:12px 16px;">
          <div style="font-size:11.5px;font-weight:600;color:var(--ink-soft);margin-bottom:6px;">Learned ${learned.length} new auto-tagging rule${learned.length===1?'':'s'} from your category choices:</div>
          ${learned.map(r=> `<div style="font-size:12px;color:var(--ink);padding:3px 0;">"${escHTML(r.keyword)}" → ${escHTML(r.category)}</div>`).join('')}
          <div style="font-size:11px;color:var(--ink-faint);margin-top:6px;">Wrong? Edit or delete these any time under Categories → Auto-tagging rules.</div>
        </div>` : ''}
      <div style="display:flex;gap:10px;justify-content:center;margin-top:16px;">
        <button class="btn" id="btn-import-more">Import another file</button>
        <button class="btn btn-primary" id="btn-goto-tx">View transactions →</button>
      </div>
    </div>
  `;
  document.getElementById('btn-import-more').onclick = ()=>{ UI.importState = newImportState(); renderImport(document.getElementById('content')); };
  document.getElementById('btn-goto-tx').onclick = ()=>{ document.querySelector('[data-tab="transactions"]').click(); };
}

function openImportSessionModal(id){
  const session=(DB.importSessions||[]).find(item=>item.id===id);if(!session)return;
  const rows=Array.isArray(session.rows)?session.rows:[],fingerprint=String(session.fileFingerprint||'');
  openModal(`<div class="modal-head"><h3>Import audit</h3></div><div class="modal-body">
    <p style="margin:0 0 12px;color:var(--ink-soft);font-size:13px;"><strong>${escHTML(session.fileName)}</strong><br>${escHTML(session.accountName)} · ${new Date(session.importedAt).toLocaleString('en-GB')}</p>
    <div class="qc-line"><span>Rows read</span><span class="num">${session.totalRows}</span></div>
    <div class="qc-line"><span>Transactions added</span><span class="num">${session.importedCount}</span></div>
    <div class="qc-line"><span>Duplicates linked and skipped</span><span class="num">${session.duplicateCount}</span></div>
    <div class="qc-line"><span>Excluded / invalid</span><span class="num">${session.excludedCount} / ${session.invalidCount}</span></div>
    <div class="qc-line"><span>Statement range</span><span>${session.startDate&&session.endDate?`${ukDate(session.startDate)} – ${ukDate(session.endDate)}`:'Not available'}</span></div>
    <p style="font-size:10.5px;color:var(--ink-faint);margin:12px 0 0;word-break:break-all;">File fingerprint: ${escHTML(fingerprint||'Legacy import — no fingerprint')}</p>
    ${rows.length?`<div class="table-wrap" style="max-height:230px;margin-top:12px;"><table><thead><tr><th>Row</th><th>Status</th><th>Date</th><th>Description</th><th style="text-align:right">Amount</th></tr></thead><tbody>${rows.map(row=>`<tr><td>${row.rowNumber}</td><td><span class="stamp-mini">${escHTML(row.status)}</span></td><td>${row.date?ukDateShort(row.date):'—'}</td><td class="desc">${escHTML(row.description)}</td><td class="amt ${row.amount>0?'income':''}">${gbp(row.amount,{signed:true})}</td></tr>`).join('')}</tbody></table></div>`:''}
  </div><div class="modal-foot"><button class="btn btn-primary" id="m-close">Close</button></div>`);
  document.getElementById('m-close').onclick=closeModal;
}
