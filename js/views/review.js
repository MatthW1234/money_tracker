function reviewCard(title,count,detail,action,label){
  return `<div class="kpi-card"><div class="kpi-label">${title}</div><div class="kpi-value num">${count}</div><div class="kpi-sub">${detail}</div>${action?`<button class="btn btn-sm" style="margin-top:10px;" data-review-action="${action}">${label}</button>`:''}</div>`;
}
function renderReview(c){
  const review=PocketLedgerReview.inbox(DB);
  const anomalyReport=PocketLedgerAnomalies.analyse(DB,{today:todayISO()});
  c.innerHTML=`
    <div class="panel" style="margin-bottom:16px;"><div class="panel-head"><div class="panel-title">Gentle alerts<small>Local, explainable comparisons · ${anomalyReport.alerts.length} active</small></div></div>
      ${anomalyReport.alerts.length?`<div style="display:flex;flex-direction:column;gap:8px;">${anomalyReport.alerts.map((alert,index)=>`<div class="budget-input-wrap" style="white-space:normal;justify-content:space-between;gap:12px;border-left:3px solid ${alert.severity==='attention'?'var(--expense)':'var(--gold)'};"><span><strong style="color:var(--ink);">${escHTML(alert.title)}</strong><br><span style="font-size:11px;color:var(--ink-faint);">${escHTML(alert.detail)}</span></span><span style="display:flex;gap:6px;"><button class="btn btn-sm btn-ghost" data-alert-review="${index}">Review</button><button class="btn btn-sm btn-ghost" data-alert-dismiss="${index}">Dismiss</button></span></div>`).join('')}</div>`:`<div class="empty-state" style="padding:20px 10px;"><h4>No unusual changes detected</h4><p>Alerts appear only when enough history exists to make the comparison meaningful.</p></div>`}
    </div>
    <div class="panel" style="margin-bottom:16px;"><div class="panel-head"><div class="panel-title">Review inbox<small>A single queue after imports or statement updates; nothing here changes data automatically</small></div></div>
      <div class="kpi-row">
        ${reviewCard('Uncategorised',review.uncategorised.length,'Outgoing entries needing a category','uncategorised','Review')}
        ${reviewCard('Possible duplicates',review.duplicates.length,'Exact account/date/amount/description groups','duplicates','Inspect')}
        ${reviewCard('Broken transfers',review.unmatchedTransfers.length,'Transfer IDs without exactly two legs','transfers','Open health')}
        ${reviewCard('Unmatched funding',review.unmatchedFunding.length,'Trading 212 deposits or withdrawals without a ledger transfer','funding','Open investments')}
      </div>
    </div>
    <div class="panel"><div class="panel-head"><div class="panel-title">Suggested routine<small>${review.total?`${review.total} review item${review.total===1?'':'s'} remain`:'The current inbox is clear'}</small></div></div>
      <ol style="margin:0;padding-left:20px;color:var(--ink-soft);font-size:12.5px;line-height:1.8;"><li>Categorise new spending.</li><li>Inspect exact duplicates before deleting anything.</li><li>Repair incomplete transfers.</li><li>Match provider funding to the correct Invest or S&amp;S ISA transfer.</li></ol>
    </div>`;
  c.querySelectorAll('[data-alert-review]').forEach(button=>button.onclick=()=>{const alert=anomalyReport.alerts[Number(button.dataset.alertReview)];if(alert.transactionId)openTxModal(alert.transactionId);else if(alert.recurringItemId)setTab('plan');});
  c.querySelectorAll('[data-alert-dismiss]').forEach(button=>button.onclick=()=>{const alert=anomalyReport.alerts[Number(button.dataset.alertDismiss)];DB.dismissedAlerts.push({id:alert.id,dismissedAt:new Date().toISOString()});scheduleSave();renderReview(c);toast('Alert dismissed');});
  c.querySelectorAll('[data-review-action]').forEach(button=>button.onclick=()=>{
    const action=button.dataset.reviewAction;
    if(action==='uncategorised'){UI.txFilters={search:'',category:'uncategorised',type:'all',status:'all',from:'',to:'',preset:''};setTab('transactions');}
    else if(action==='duplicates')openDuplicatesModal();
    else if(action==='transfers')setTab('health');
    else if(action==='funding')setTab('investments');
  });
}
