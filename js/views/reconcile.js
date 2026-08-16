/* =========================================================
   ACCOUNT RECONCILIATION
   ========================================================= */
function iconAudit(){return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 4h16v16H4z"/><path d="M8 9h8M8 13h5M8 17h3"/><path d="m15 16 1.5 1.5L20 14"/></svg>`;}
function renderReconcile(c){
  const accounts = activeAccountNames();
  if(!accounts.length){
    c.innerHTML = `<div class="empty-state panel"><h4>Add an account first</h4><p>Accounts can be created from Settings, then checked here against a bank statement.</p></div>`;
    return;
  }
  if(!UI.reconcileAccount || !accounts.includes(UI.reconcileAccount)) UI.reconcileAccount = accounts[0];
  const account = UI.reconcileAccount;
  const accountRecord=accountRecordFor(account),liability=!!(accountRecord&&isLiabilityType(accountRecord.type));
  const sourceSessions=(DB.importSessions||[]).filter(item=>item.accountId===(accountRecord&&accountRecord.id)||!item.accountId&&item.accountName===account).sort((a,b)=>String(b.importedAt).localeCompare(String(a.importedAt)));
  if(UI.reconcileImportSessionId&&!sourceSessions.some(item=>item.id===UI.reconcileImportSessionId))UI.reconcileImportSessionId='';
  const sourceSession=sourceSessions.find(item=>item.id===UI.reconcileImportSessionId)||null;
  const statementDate = UI.reconcileDate || todayISO();
  if(!UI.reconcileStartDate)UI.reconcileStartDate=PocketLedgerReconciliation.suggestedStartDate(DB,account,statementDate,accountRecord);
  const startDate=UI.reconcileStartDate;
  const statementInput = UI.reconcileStatementBalance==='' ? null : Number(UI.reconcileStatementBalance);
  const statementValue = statementInput===null ? null : (liability?-Math.abs(statementInput):statementInput);
  const session=PocketLedgerReconciliation.buildSession({db:DB,account,accountRecord,startDate,endDate:statementDate,statementBalance:statementValue});
  const statementMatch=PocketLedgerReconciliation.statementMatchSummary(sourceSession,DB.transactions,account,startDate,statementDate);
  const ledgerBalance=session.calculatedClosing,difference=session.difference;
  const suggestions=difference===null?[]:PocketLedgerDiagnostics.differenceSuggestions({db:DB,account,statementDate,difference});
  const history = reconciliationHistory(account);
  const last = history.length ? history[history.length-1] : null;
  const step=Math.max(1,Math.min(5,Number(UI.reconcileStep)||1));
  const stepNames=['Statement','Opening anchor','Match entries','Explain difference','Complete'];
  const completionIds=new Set(session.includedTransactions.filter(transaction=>transactionStatus(transaction)==='cleared').map(transaction=>transaction.id));
  const completionWarnings=step===5?PocketLedgerDiagnostics.auditLedger(DB,{today:todayISO()}).issues.filter(item=>['error','warning'].includes(item.severity)&&(item.account===account||(item.transactionIds||[]).some(id=>completionIds.has(id)))):[];
  const stepNav=`<div class="seg" style="margin-bottom:16px;">${stepNames.map((name,index)=>`<button type="button" data-rec-step="${index+1}" class="${step===index+1?'active':''}">${index+1}. ${name}</button>`).join('')}</div>`;
  let body='';
  if(step===1){
    body=`<div class="panel"><div class="panel-head"><div class="panel-title">Statement details<small>Choose the exact period and closing balance shown by the provider</small></div></div>
      <div class="form-grid">
        <div class="field span2"><label>Account</label><select id="rec-account">${accounts.map(name=>`<option value="${escAttr(name)}" ${name===account?'selected':''}>${escHTML(name)}</option>`).join('')}</select></div>
        <div class="field span2"><label>Use an imported statement <span style="font-weight:400;color:var(--ink-faint);">(optional)</span></label><select id="rec-import-session"><option value="">Manual statement details</option>${sourceSessions.map(item=>`<option value="${escAttr(item.id)}" ${item.id===UI.reconcileImportSessionId?'selected':''}>${escHTML(item.fileName)} · ${item.endDate?ukDateShort(item.endDate):new Date(item.importedAt).toLocaleDateString('en-GB')}</option>`).join('')}</select><span style="font-size:10.5px;color:var(--ink-faint);">Selecting an import fills its period and available closing balance, then enables assisted matching.</span></div>
        <div class="field"><label>Statement starts</label><input type="date" id="rec-start" max="${statementDate}" value="${startDate}"></div>
        <div class="field"><label>Statement ends</label><input type="date" id="rec-date" value="${statementDate}"></div>
        <div class="field span2"><label>${liability?'Closing amount owed':'Closing balance'} (£)</label><input type="number" step="0.01" ${liability?'min="0"':''} id="rec-balance" value="${statementInput===null?'':statementInput}"></div>
      </div>
      ${sourceSession?`<div class="budget-input-wrap" style="display:block;white-space:normal;margin-top:12px;border-left:3px solid var(--income);"><strong style="color:var(--ink);">Statement source linked</strong><br><span style="font-size:11px;color:var(--ink-faint);">${escHTML(sourceSession.fileName)} · ${sourceSession.importedCount} added · ${sourceSession.duplicateCount} existing transaction${sourceSession.duplicateCount===1?'':'s'} linked${sourceSession.closingBalance==null?' · no running-balance column was available':''}</span></div>`:''}
      <p style="font-size:11.5px;color:var(--ink-faint);margin:12px 0 0;">Use the statement closing date rather than today. Credit-card balances can be entered as the positive amount owed; Pocket Ledger applies the liability sign internally.</p>
    </div>`;
  }else if(step===2){
    const anchor=session.previous?session.previous.statementBalance:session.openingBalance,anchorLabel=session.previous?`Previous reconciliation · ${ukDate(session.previous.statementDate)}`:'Account opening balance';
    body=`<div class="panel"><div class="panel-head"><div class="panel-title">Opening anchor<small>Confirm where this statement begins before matching individual entries</small></div></div>
      <div class="reconcile-summary">
        <div class="reconcile-figure"><div class="lbl">${anchorLabel}</div><div class="val num">${gbp(anchor)}</div></div>
        <div class="reconcile-figure"><div class="lbl">Statement period</div><div class="val" style="font-size:15px;">${startDate?ukDate(startDate):'All history'} – ${ukDate(statementDate)}</div></div>
        <div class="reconcile-figure"><div class="lbl">Entries in period</div><div class="val num">${session.transactions.length}</div></div>
      </div>
      <div class="qc-line"><span>Included money received</span><span class="num">${gbp(session.inflows)}</span></div>
      <div class="qc-line"><span>Included money paid</span><span class="num">−${gbp(session.outflows)}</span></div>
      <div class="qc-line"><span>Pending entries not included</span><span class="num">${session.pendingCount}</span></div>
      <p style="font-size:11.5px;color:var(--ink-faint);margin:12px 0 0;">The calculated closing balance still uses the complete account history up to the statement date. The period controls which entries you review in the next step.</p>
    </div>`;
  }else if(step===3){
    body=`<div class="panel"><div class="panel-head"><div class="panel-title">Match statement entries<small>“On statement” includes the entry in the calculated balance</small></div></div>
      ${sourceSession?`<div class="reconcile-summary"><div class="reconcile-figure"><div class="lbl">Matched statement rows</div><div class="val num">${statementMatch.matched.length}</div></div><div class="reconcile-figure"><div class="lbl">Ledger only</div><div class="val num">${statementMatch.ledgerOnly.length}</div></div><div class="reconcile-figure"><div class="lbl">Statement only</div><div class="val num">${statementMatch.statementOnly.length}</div></div></div><div class="budget-input-wrap" style="display:flex;white-space:normal;align-items:center;justify-content:space-between;gap:12px;${statementMatch.statementOnly.length?'border-left:3px solid var(--gold);':'border-left:3px solid var(--income);'}"><span><strong style="color:var(--ink);">Assisted matching is ready</strong><br><span style="font-size:10.5px;color:var(--ink-faint);">Applying it marks linked statement rows Cleared and unmatched ledger entries Pending. You can still change individual boxes afterwards.</span></span><button class="btn btn-sm btn-primary" id="rec-apply-matches">Apply matches</button></div>`:''}
      <div class="table-wrap"><table><thead><tr><th style="width:90px;">On statement</th><th>Date</th><th>Description</th><th>Category</th><th>Status</th><th style="text-align:right;">Amount</th></tr></thead><tbody>${session.transactions.length?session.transactions.map(transaction=>{const status=transactionStatus(transaction),locked=status==='reconciled',matched=statementMatch.matchedIds.has(transaction.id);return `<tr class="${locked?'reconcile-row-locked':''}"><td><input type="checkbox" data-rec-id="${transaction.id}" ${status!=='pending'?'checked':''} ${locked?'disabled':''} aria-label="${locked?'Previously reconciled':'Appears on statement'}"></td><td>${ukDate(transaction.date)}</td><td class="desc" title="${escAttr(transaction.description)}">${escHTML(transaction.description)} ${matched?'<span class="stamp-mini">statement match</span>':''}</td><td>${escHTML(transaction.category||'—')}</td><td>${statusPillHTML(status)}</td><td class="amt ${transaction.amount>0?'income':'expense'}">${gbp(transaction.amount,{signed:true})}</td></tr>`;}).join(''):`<tr class="empty-row"><td colspan="6">No transactions fall within this statement period.</td></tr>`}</tbody></table></div>
    </div>`;
  }else if(step===4){
    body=`<div class="panel"><div class="panel-head"><div class="panel-title">Explain the difference<small>Review likely causes before considering a balance adjustment</small></div><button class="btn btn-sm" id="rec-health">Open Data Health</button></div>
      <div class="reconcile-summary">
        <div class="reconcile-figure"><div class="lbl">Calculated closing</div><div class="val num">${gbp(ledgerBalance)}</div></div>
        <div class="reconcile-figure"><div class="lbl">${liability?'Statement amount owed':'Statement closing'}</div><div class="val num">${statementValue===null?'—':liability?gbp(Math.abs(statementValue)):gbp(statementValue)}</div></div>
        <div class="reconcile-figure"><div class="lbl">Difference</div><div class="val num" style="color:${difference===null?'var(--ink-faint)':Math.abs(difference)<0.005?'var(--income)':'var(--expense)'};">${difference===null?'—':gbp(difference)}</div></div>
      </div>
      ${difference!==null&&Math.abs(difference)>=0.005?`<div class="budget-input-wrap" style="display:block;white-space:normal;border-left:3px solid var(--gold);"><strong style="color:var(--ink);font-size:12.5px;">Possible explanations</strong>${suggestions.length?suggestions.map((suggestion,index)=>`<div style="display:flex;justify-content:space-between;align-items:flex-start;gap:10px;margin-top:9px;"><span><strong style="font-size:11.5px;color:var(--ink-soft);">${escHTML(suggestion.title)}</strong><br><span style="font-size:10.5px;color:var(--ink-faint);">${escHTML(suggestion.detail)}</span></span><button class="btn btn-sm btn-ghost" data-rec-suggestion="${index}">Review</button></div>`).join(''):`<p style="font-size:11.5px;color:var(--ink-faint);margin:7px 0 0;">No combination of up to three pending, recently cleared or statement-boundary entries exactly matches. Check transfer pairs, opening balance and adjustments in Data Health.</p>`}</div>`:`<div class="budget-input-wrap" style="white-space:normal;border-left:3px solid var(--income);"><strong style="color:var(--income);">The statement balances exactly.</strong></div>`}
      <div style="margin-top:14px;"><button class="btn btn-sm" id="rec-adjust">Add balance adjustment</button><p style="font-size:10.5px;color:var(--ink-faint);margin:6px 0 0;">Use an adjustment only when the opening balance or missing history cannot be corrected directly.</p></div>
    </div>`;
  }else{
    const ready=difference!==null&&Math.abs(difference)<0.005;
    const warningsReady=!completionWarnings.length||UI.reconcileWarningsAcknowledged;
    body=`<div class="panel"><div class="panel-head"><div class="panel-title">Complete reconciliation<small>Lock this agreed statement period</small></div></div>
      <div class="reconcile-summary">
        <div class="reconcile-figure"><div class="lbl">Account</div><div class="val" style="font-size:15px;">${escHTML(account)}</div></div>
        <div class="reconcile-figure"><div class="lbl">Statement period</div><div class="val" style="font-size:15px;">${startDate?ukDate(startDate):'All history'} – ${ukDate(statementDate)}</div></div>
        <div class="reconcile-figure"><div class="lbl">Closing balance</div><div class="val num">${statementValue===null?'—':liability?`${gbp(Math.abs(statementValue))} owed`:gbp(statementValue)}</div></div>
      </div>
      <div class="qc-line"><span>Entries ready to lock</span><span class="num">${session.includedTransactions.filter(transaction=>transactionStatus(transaction)==='cleared').length}</span></div>
      <div class="qc-line"><span>Difference</span><span class="num" style="color:${ready?'var(--income)':'var(--expense)'};">${difference===null?'—':gbp(difference)}</span></div>
      ${completionWarnings.length?`<div class="budget-input-wrap" style="display:block;white-space:normal;border-left:3px solid var(--gold);margin-top:12px;"><strong style="color:var(--ink);">${completionWarnings.length} diagnostic warning${completionWarnings.length===1?'':'s'} will be recorded</strong>${completionWarnings.map(item=>`<div style="font-size:11px;color:var(--ink-faint);margin-top:5px;">${escHTML(item.title)}</div>`).join('')}<label class="regular-toggle" style="font-size:11.5px;margin-top:10px;"><input type="checkbox" id="rec-ack-warnings" ${UI.reconcileWarningsAcknowledged?'checked':''}> I reviewed these warnings and want them retained in the audit record</label></div>`:''}
      ${ready?`<p style="font-size:12px;color:var(--income);">Ready to complete. Included cleared entries up to the statement date will be locked.</p>`:`<p style="font-size:12px;color:var(--expense);">Return to Match entries or Explain difference until the difference reaches £0.00.</p>`}
      <div style="display:flex;justify-content:flex-end;margin-top:14px;"><button class="btn btn-primary" id="rec-complete" ${ready&&warningsReady?'':'disabled'}>Complete reconciliation</button></div>
    </div>`;
  }
  c.innerHTML = `
    ${stepNav}${body}
    <div style="display:flex;justify-content:space-between;gap:10px;margin:14px 0 18px;"><button class="btn" id="rec-back" ${step===1?'disabled':''}>Back</button><button class="btn btn-primary" id="rec-next" ${step===5?'disabled':''}>Next</button></div>
    ${last?`<div class="panel"><div class="panel-head"><div class="panel-title">Reconciliation history</div><button class="btn btn-sm btn-ghost" id="rec-reopen">Reopen last reconciliation</button></div>${history.slice().reverse().map(record=>`<div class="movers-row"><span class="movers-desc">${record.statementStartDate?`${ukDate(record.statementStartDate)} – `:''}${ukDate(record.statementDate)} ${record.auditVersion===1?'<span class="stamp-mini">audited</span>':'<span class="stamp-mini">legacy</span>'}<br><span style="font-size:10.5px;color:var(--ink-faint);">Completed ${new Date(record.completedAt).toLocaleString('en-GB')} · ${record.transactionCount} locked${record.diagnosticWarnings&&record.diagnosticWarnings.length?` · ${record.diagnosticWarnings.length} warning${record.diagnosticWarnings.length===1?'':'s'}`:''}</span></span><span class="movers-amt num">${gbp(record.statementBalance)}</span><button class="row-icon-btn" data-rec-audit="${record.id}" title="View reconciliation audit">${iconAudit()}</button></div>`).join('')}</div>`:''}
  `;
  c.querySelectorAll('[data-rec-step]').forEach(button=>{button.onclick=()=>{UI.reconcileStep=Number(button.dataset.recStep);renderReconcile(c);};});
  const accountEl=document.getElementById('rec-account');if(accountEl)accountEl.onchange=e=>{UI.reconcileAccount=e.target.value;UI.reconcileStatementBalance='';UI.reconcileStartDate='';UI.reconcileImportSessionId='';UI.reconcileWarningsAcknowledged=false;UI.reconcileStep=1;renderReconcile(c);};
  const sourceEl=document.getElementById('rec-import-session');if(sourceEl)sourceEl.onchange=e=>{UI.reconcileImportSessionId=e.target.value;const selected=sourceSessions.find(item=>item.id===e.target.value);if(selected){UI.reconcileStartDate=selected.startDate||'';UI.reconcileDate=selected.endDate||todayISO();if(selected.closingBalance!=null)UI.reconcileStatementBalance=Math.abs(Number(selected.closingBalance)).toFixed(2);}UI.reconcileWarningsAcknowledged=false;renderReconcile(c);};
  const startEl=document.getElementById('rec-start');if(startEl)startEl.onchange=e=>{UI.reconcileStartDate=e.target.value;UI.reconcileWarningsAcknowledged=false;renderReconcile(c);};
  const dateEl=document.getElementById('rec-date');if(dateEl)dateEl.onchange=e=>{UI.reconcileDate=e.target.value||todayISO();UI.reconcileStartDate='';UI.reconcileWarningsAcknowledged=false;renderReconcile(c);};
  const balanceEl=document.getElementById('rec-balance');if(balanceEl)balanceEl.onchange=e=>{UI.reconcileStatementBalance=e.target.value;UI.reconcileWarningsAcknowledged=false;renderReconcile(c);};
  c.querySelectorAll('[data-rec-id]').forEach(cb=>{
    cb.onchange = ()=>{
      const t = DB.transactions.find(x=>x.id===cb.dataset.recId);
      if(!t || transactionStatus(t)==='reconciled') return;
      t.status = cb.checked ? 'cleared' : 'pending';
      UI.reconcileWarningsAcknowledged=false;scheduleSave(); renderReconcile(c);
    };
  });
  const applyMatches=document.getElementById('rec-apply-matches');if(applyMatches)applyMatches.onclick=()=>{
    openModal(`<div class="modal-head"><h3>Apply statement matches?</h3></div><div class="modal-body"><p style="margin:0;color:var(--ink-soft);font-size:13px;">${statementMatch.matched.length} linked entr${statementMatch.matched.length===1?'y':'ies'} will be marked Cleared and ${statementMatch.ledgerOnly.length} ledger-only entr${statementMatch.ledgerOnly.length===1?'y':'ies'} will be marked Pending. Previously reconciled transactions remain locked.</p>${statementMatch.statementOnly.length?`<p style="color:var(--gold);font-size:12px;margin:10px 0 0;">${statementMatch.statementOnly.length} statement row${statementMatch.statementOnly.length===1?' has':'s have'} no retained transaction and will still need review.</p>`:''}</div><div class="modal-foot"><button class="btn" id="m-cancel">Cancel</button><button class="btn btn-primary" id="m-confirm">Apply matches</button></div>`);
    document.getElementById('m-cancel').onclick=closeModal;document.getElementById('m-confirm').onclick=()=>{const result=PocketLedgerReconciliation.applyStatementMatches(statementMatch);UI.reconcileWarningsAcknowledged=false;scheduleSave();closeModal();renderReconcile(c);toast(`Matched ${result.matched} statement entries; ${result.pending} left pending`);};
  };
  c.querySelectorAll('[data-rec-suggestion]').forEach(button=>{button.onclick=()=>{const suggestion=suggestions[Number(button.dataset.recSuggestion)];if(suggestion&&suggestion.transactionIds.length)openTxModal(suggestion.transactionIds[0]);};});
  const healthButton=document.getElementById('rec-health');if(healthButton)healthButton.onclick=()=>setTab('health');
  const adjust=document.getElementById('rec-adjust');if(adjust)adjust.onclick=()=>openBalanceAdjustmentModal(account,statementDate);
  const complete = document.getElementById('rec-complete');
  const acknowledge=document.getElementById('rec-ack-warnings');if(acknowledge)acknowledge.onchange=()=>{UI.reconcileWarningsAcknowledged=acknowledge.checked;if(complete)complete.disabled=!(difference!==null&&Math.abs(difference)<0.005&&UI.reconcileWarningsAcknowledged);};
  if(complete)complete.onclick = ()=>completeReconciliation(account,startDate,statementDate,statementValue,completionWarnings.map(item=>item.code));
  document.getElementById('rec-back').onclick=()=>{UI.reconcileStep=Math.max(1,step-1);renderReconcile(c);};
  document.getElementById('rec-next').onclick=()=>{if(step===1&&(statementValue===null||!Number.isFinite(statementValue))){toast('Enter the statement closing balance','error');return;}if(step===1&&startDate&&startDate>statementDate){toast('The statement start must be on or before its end date','error');return;}UI.reconcileStep=Math.min(5,step+1);renderReconcile(c);};
  const reopen = document.getElementById('rec-reopen');
  if(reopen) reopen.onclick = ()=>reopenLastReconciliation(account);
  c.querySelectorAll('[data-rec-audit]').forEach(button=>{button.onclick=()=>openReconciliationAuditModal(account,button.dataset.recAudit);});
}
function completeReconciliation(account,startDate,statementDate,statementBalance,diagnosticWarnings){
  const difference = Money.subtract(statementBalance,clearedAccountBalance(account,statementDate));
  if(!Number.isFinite(statementBalance) || Math.abs(difference)>=0.005){ toast('The difference must be £0.00 before completing', 'error'); return; }
  const id = uid('rec');
  const sourceSession=(DB.importSessions||[]).find(item=>item.id===UI.reconcileImportSessionId)||null;
  const sourceSummary=PocketLedgerReconciliation.statementMatchSummary(sourceSession,DB.transactions,account,startDate,statementDate);
  const affected = accountTransactionsTo(account,statementDate).filter(t=>transactionStatus(t)==='cleared');
  affected.forEach(t=>{ t.status='reconciled'; t.reconciliationId=id; });
  if(!DB.reconciliations[account]) DB.reconciliations[account]={history:[]};
  if(!Array.isArray(DB.reconciliations[account].history)) DB.reconciliations[account].history=[];
  const record=accountRecordFor(account),label=record&&isLiabilityType(record.type)?`${gbp(Math.abs(statementBalance))} owed`:gbp(statementBalance);
  const session=PocketLedgerReconciliation.buildSession({db:DB,account,accountRecord:record,startDate,endDate:statementDate,statementBalance});
  const previous=session.previous,openingBalance=previous?previous.statementBalance:Number(record&&record.openingBalance)||0;
  DB.reconciliations[account].history.push({
    id,auditVersion:1,statementStartDate:startDate||'',statementDate,openingBalance,statementBalance,calculatedBalance:session.calculatedClosing,
    inflows:session.inflows,outflows:session.outflows,differenceAtCompletion:Money.subtract(statementBalance,session.calculatedClosing),
    completedAt:new Date().toISOString(),completedSchemaVersion:SCHEMA_VERSION,transactionCount:affected.length,
    transactionIds:affected.map(transaction=>transaction.id),transactionSnapshots:affected.map(PocketLedgerReconciliation.transactionSnapshot),
    balanceAdjustmentIds:affected.filter(transaction=>transaction.isAdjustment).map(transaction=>transaction.id),diagnosticWarnings:[...new Set(diagnosticWarnings||[])],
    importSessionId:sourceSession&&sourceSession.id||'',statementFileName:sourceSession&&sourceSession.fileName||'',statementFileFingerprint:sourceSession&&sourceSession.fileFingerprint||'',
    statementMatchedCount:sourceSummary.matched.length,statementOnlyCount:sourceSummary.statementOnly.length,ledgerOnlyCount:sourceSummary.ledgerOnly.length,
  });
  UI.reconcileStep=1;UI.reconcileStartDate='';UI.reconcileStatementBalance='';UI.reconcileImportSessionId='';UI.reconcileWarningsAcknowledged=false;scheduleSave(); renderContent(); toast(`Reconciled ${account} to ${label}`);
}
function openReconciliationAuditModal(account,id){
  const record=reconciliationHistory(account).find(entry=>entry.id===id);if(!record)return;
  const audit=PocketLedgerReconciliation.snapshotAudit(record,DB.transactions,account);
  openModal(`<div class="modal-head"><h3>Reconciliation audit</h3></div><div class="modal-body">
    <p style="margin:0 0 12px;color:var(--ink-soft);font-size:13px;"><strong>${escHTML(account)}</strong> · ${record.statementStartDate?`${ukDate(record.statementStartDate)} – `:''}${ukDate(record.statementDate)} · ${gbp(record.statementBalance)}</p>
    ${record.auditVersion===1?`<div class="qc-line"><span>Opening anchor</span><span class="num">${gbp(record.openingBalance)}</span></div><div class="qc-line"><span>Period inflows</span><span class="num">${gbp(record.inflows||0)}</span></div><div class="qc-line"><span>Period outflows</span><span class="num">−${gbp(record.outflows||0)}</span></div><div class="qc-line"><span>Included transactions</span><span class="num">${record.transactionCount}</span></div>${record.importSessionId?`<div class="qc-line"><span>Statement source</span><span>${escHTML(record.statementFileName||'Imported statement')}</span></div><div class="qc-line"><span>Statement matching</span><span>${record.statementMatchedCount} matched · ${record.statementOnlyCount} statement only · ${record.ledgerOnlyCount} ledger only</span></div>`:''}<div class="qc-line"><span>Snapshot integrity</span><span style="color:${audit.ok?'var(--income)':'var(--expense)'};">${audit.ok?'Unchanged':`${audit.missing.length} missing · ${audit.changed.length} changed · ${audit.unexpected.length} added`}</span></div>${record.balanceAdjustmentIds&&record.balanceAdjustmentIds.length?`<p style="font-size:11.5px;color:var(--gold);">Used ${record.balanceAdjustmentIds.length} balance adjustment${record.balanceAdjustmentIds.length===1?'':'s'}.</p>`:''}${record.diagnosticWarnings&&record.diagnosticWarnings.length?`<p style="font-size:11.5px;color:var(--gold);">Warnings retained: ${escHTML(record.diagnosticWarnings.join(', '))}</p>`:''}`:`<p style="color:var(--ink-faint);font-size:12px;">This reconciliation predates audit snapshots. Its date and balance anchor are preserved, but individual transaction values were not captured.</p>`}
  </div><div class="modal-foot"><button class="btn btn-primary" id="m-close">Close</button></div>`);
  document.getElementById('m-close').onclick=closeModal;
}
function reopenLastReconciliation(account){
  const history = reconciliationHistory(account);
  const last = history[history.length-1];
  if(!last) return;
  const audit=PocketLedgerReconciliation.snapshotAudit(last,DB.transactions,account);
  openModal(`<div class="modal-head"><h3>Reopen reconciliation?</h3></div><div class="modal-body"><p style="margin:0;color:var(--ink-soft);font-size:13px;">Transactions locked by the ${ukDate(last.statementDate)} reconciliation will return to Cleared so they can be corrected.</p>${audit.available&&!audit.ok?`<p style="color:var(--expense);font-size:12px;margin:10px 0 0;"><strong>Audit warning:</strong> ${audit.missing.length} included transaction${audit.missing.length===1?' is':'s are'} missing, ${audit.changed.length} changed and ${audit.unexpected.length} new backdated entr${audit.unexpected.length===1?'y is':'ies are'} present. Reopening cannot restore deleted records.</p>`:''}${!audit.available?`<p style="color:var(--gold);font-size:12px;margin:10px 0 0;">This is a legacy reconciliation without transaction snapshots. Only currently linked transactions can be unlocked.</p>`:''}</div><div class="modal-foot"><button class="btn" id="m-cancel">Cancel</button><button class="btn btn-primary" id="m-confirm">Reopen</button></div>`);
  document.getElementById('m-cancel').onclick=closeModal;
  document.getElementById('m-confirm').onclick=()=>{
    DB.transactions.forEach(t=>{ if(t.reconciliationId===last.id){ t.status='cleared'; delete t.reconciliationId; } });
    history.pop();UI.reconcileStep=3;UI.reconcileStartDate=last.statementStartDate||'';UI.reconcileDate=last.statementDate;UI.reconcileStatementBalance=Math.abs(Number(last.statementBalance)).toFixed(2);UI.reconcileImportSessionId=last.importSessionId||'';UI.reconcileWarningsAcknowledged=false;scheduleSave(); closeModal(); renderContent(); toast('Last reconciliation reopened');
  };
}
function openBalanceAdjustmentModal(account, date){
  openModal(`<div class="modal-head"><h3>Add balance adjustment</h3></div><div class="modal-body"><p style="margin:0 0 14px;color:var(--ink-soft);font-size:12.5px;">Use this only when the opening balance or transaction history cannot otherwise be corrected. It changes the account balance but is excluded from income and spending reports.</p><div class="form-grid"><div class="field"><label>Date</label><input type="date" id="adj-date" value="${date}"></div><div class="field"><label>Adjustment (£)</label><input type="number" step="0.01" id="adj-amount"></div><div class="field span2"><label>Reason</label><input type="text" id="adj-notes" placeholder="e.g. Opening balance correction"></div></div></div><div class="modal-foot"><button class="btn" id="m-cancel">Cancel</button><button class="btn btn-primary" id="m-save">Add adjustment</button></div>`);
  document.getElementById('m-cancel').onclick=closeModal;
  document.getElementById('m-save').onclick=()=>{
    const amount=Number(document.getElementById('adj-amount').value), adjDate=document.getElementById('adj-date').value, notes=document.getElementById('adj-notes').value.trim();
    if(!Number.isFinite(amount) || Math.abs(amount)<0.005 || !validISODate(adjDate)){ toast('Enter a valid date and non-zero amount','error');return; }
    DB.transactions.push({id:uid('tx'),date:adjDate,description:'Balance adjustment',amount,category:'',account,notes,source:'manual',status:'cleared',excluded:true,isAdjustment:true});
    scheduleSave();closeModal();renderContent();toast('Balance adjustment added');
  };
}
