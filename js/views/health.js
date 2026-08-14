/* =========================================================
   DATA HEALTH
   ========================================================= */
function healthSeverityLabel(severity){return severity==='error'?'Needs attention':severity==='warning'?'Review':'Information';}
function healthSeverityColor(severity){return severity==='error'?'var(--expense)':severity==='warning'?'var(--gold)':'var(--brand)';}
function healthSectionLabel(section){return ({accounts:'Accounts',transactions:'Transactions',transfers:'Transfers',reconciliation:'Reconciliation',rules:'Rules',investments:'Investments'})[section]||section;}
function healthActionLabel(item){
  if(item.code==='exact-duplicate')return 'Review duplicates';
  if(item.code==='uncategorised-spending')return 'Review spending';
  if(item.section==='reconciliation'&&item.account)return 'Open reconciliation';
  if(item.section==='investments'&&item.account)return 'Update value';
  if(item.section==='rules')return 'Review rules';
  if(item.transactionIds&&item.transactionIds.length)return 'Open transaction';
  return '';
}
function runHealthAction(item){
  if(item.code==='exact-duplicate'){openDuplicatesModal();return;}
  if(item.code==='uncategorised-spending'){
    UI.txFilters={search:'',category:'all',type:'uncategorised',status:'all',from:'',to:''};setTab('transactions');return;
  }
  if(item.section==='reconciliation'&&item.account){
    UI.reconcileAccount=item.account;UI.reconcileStatementBalance='';setTab('reconcile');return;
  }
  if(item.section==='investments'&&item.account){
    const record=accountRecordFor(item.account);openInvestmentValuationModal(null,record&&record.id);return;
  }
  if(item.section==='rules'){setTab('categories');return;}
  if(item.transactionIds&&item.transactionIds.length)openTxModal(item.transactionIds[0]);
}
function renderHealth(c){
  const report=PocketLedgerDiagnostics.auditLedger(DB,{today:todayISO()});
  const sections=['accounts','transactions','transfers','reconciliation','rules','investments'];
  c.innerHTML=`
    <div class="kpi-row" style="margin-bottom:16px;">
      <div class="kpi-card"><div class="kpi-label">Needs attention</div><div class="kpi-value num" style="color:${report.summary.error?'var(--expense)':'var(--income)'};">${report.summary.error}</div><div class="kpi-sub">Structural or reconciliation problems</div></div>
      <div class="kpi-card"><div class="kpi-label">Review</div><div class="kpi-value num" style="color:${report.summary.warning?'var(--gold)':'var(--income)'};">${report.summary.warning}</div><div class="kpi-sub">Likely cleanup or stale information</div></div>
      <div class="kpi-card"><div class="kpi-label">Information</div><div class="kpi-value num">${report.summary.info}</div><div class="kpi-sub">Useful context, not necessarily a fault</div></div>
      <div class="kpi-card"><div class="kpi-label">Overall status</div><div class="kpi-value" style="font-size:22px;color:${report.ok?'var(--income)':'var(--expense)'};">${report.ok?'Healthy':'Check items'}</div><div class="kpi-sub">Read-only scan · nothing changed</div></div>
    </div>
    <div class="panel" style="margin-bottom:16px;">
      <div class="panel-head"><div class="panel-title">What this checks<small>Account assignments, transfer pairs, duplicates, reconciliation anchors, rules and investment valuations</small></div></div>
      <p style="margin:0;color:var(--ink-soft);font-size:12.5px;line-height:1.6;">These checks never edit transactions. Information items can describe expected historical records, such as activity retained on an archived account. Resolve red items first, then review amber items.</p>
    </div>
    ${sections.map(section=>{
      const items=report.issues.filter(item=>item.section===section);if(!items.length)return '';
      return `<div class="panel" style="margin-bottom:16px;"><div class="panel-head"><div class="panel-title">${healthSectionLabel(section)}<small>${items.length} finding${items.length===1?'':'s'}</small></div></div>
        <div style="display:flex;flex-direction:column;gap:9px;">${items.map((item,index)=>{
          const label=healthActionLabel(item);
          return `<div class="budget-input-wrap" style="justify-content:space-between;align-items:flex-start;border-left:3px solid ${healthSeverityColor(item.severity)};white-space:normal;">
            <span style="min-width:0;"><span class="stamp-mini" style="color:${healthSeverityColor(item.severity)};border-color:${healthSeverityColor(item.severity)};">${healthSeverityLabel(item.severity)}</span><br><strong style="display:inline-block;margin-top:5px;color:var(--ink);">${escHTML(item.title)}</strong><br><span style="font-size:11.5px;color:var(--ink-faint);line-height:1.45;">${escHTML(item.detail)}</span></span>
            ${label?`<button class="btn btn-sm btn-ghost" data-health-section="${section}" data-health-index="${index}">${label}</button>`:''}
          </div>`;
        }).join('')}</div></div>`;
    }).join('')}
    ${report.issues.length?'':`<div class="empty-state panel"><h4>No health issues found</h4><p>Account assignments, transfers, reconciliation history, rules and valuations all passed the current checks.</p></div>`}
  `;
  sections.forEach(section=>{
    const items=report.issues.filter(item=>item.section===section);
    c.querySelectorAll(`[data-health-section="${section}"]`).forEach(button=>{button.onclick=()=>runHealthAction(items[Number(button.dataset.healthIndex)]);});
  });
}
