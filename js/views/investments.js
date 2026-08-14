/* =========================================================
   INVESTMENTS
   ========================================================= */
function discretionaryExpenseList(list){
  return expandSplits(list).filter(t=> t.amount<0 && countsTowardTotals(t) && DB.discretionaryCategories.includes(t.category));
}
function sumDiscretionary(list){ return discretionaryExpenseList(list).reduce((s,t)=> s+Math.abs(t.amount), 0); }

// The headroom breakdown: income minus essentials minus what you already
// invest leaves your "uncommitted" money for the period. Some of that is
// already going to discretionary spending (dining out, etc); whatever's left
// beyond that is money that isn't allocated to anything in particular — the
// clearest candidate for a bigger contribution.
function investmentHeadroom(range){
  const list = txInRange(range.from, range.to);
  const income = sumIncome(list);
  const expense = sumExpense(list);
  const categorisedInvestAmt=investExpenseList(list).reduce((s,t)=>s+Math.abs(t.amount),0);
  const transferContributions=investmentTransferContributionList(list);
  const transferredInvestAmt=transferContributions.reduce((s,t)=>s+Math.abs(t.amount),0);
  const transferCostAmt=transferContributions.reduce((s,t)=>s+Math.abs(Number(t.transferFee)||0),0);
  const investAmt = categorisedInvestAmt+transferredInvestAmt;
  const withdrawalAmt=investmentWithdrawalList(list).reduce((s,t)=>s+Math.abs(t.amount),0);
  const netInvestAmt=investAmt-withdrawalAmt;
  const discAmt = sumDiscretionary(list);
  const essentialAmt = Math.max(0, expense - categorisedInvestAmt - discAmt);
  const headroom = income - essentialAmt - investAmt - transferCostAmt;
  const trueSurplus = headroom - discAmt;
  const rate = income > 0 ? (investAmt / income * 100) : 0;
  return { income, expense, investAmt,withdrawalAmt,netInvestAmt,transferCostAmt,categorisedInvestAmt,transferredInvestAmt,discAmt,essentialAmt,headroom,trueSurplus,rate,count:investmentContributionList(list).length };
}
function investmentMonthlySeries(){
  return trendBuckets('month').map(b=>{
    const list = txInRange(b.from, b.to);
    const invest = sumInvest(list);
    const income = sumIncome(list);
    const rate = income > 0 ? (invest / income * 100) : 0;
    return { ...b, invest, income, rate };
  });
}
function investmentRecurring(){
  return detectRecurring()
    .filter(r=> DB.investmentCategories.includes(r.category))
    .map(r=>{
      const overdueDays = daysBetween(r.nextExpected, todayISO());
      return { ...r, overdueDays, missed: overdueDays > 5 };
    })
    .sort((a,b)=> b.overdueDays - a.overdueDays);
}
function lastInvestmentTx(){
  const all = investmentContributionList(DB.transactions).sort((a,b)=> b.date.localeCompare(a.date));
  return all.length ? all[0] : null;
}
function openInvestmentValuationModal(id,preferredAccountId){
  const existing=id?(DB.investmentValuations||[]).find(v=>v.id===id):null;
  const accounts=investmentAccountRecords().filter(r=>!r.archived||(existing&&r.id===existing.accountId));
  if(!accounts.length){toast('Add an investment or pension account first','error');openAccountModal(null,'investment');return;}
  const accountId=existing?existing.accountId:(preferredAccountId&&accounts.some(r=>r.id===preferredAccountId)?preferredAccountId:accounts[0].id);
  const currentRecord=accounts.find(r=>r.id===accountId)||accounts[0];
  const suggested=existing?existing.value:accountBalanceByName(currentRecord.name);
  openModal(`<div class="modal-head"><h3>${existing?'Edit':'Update'} investment value</h3></div><div class="modal-body">
    <div class="form-grid">
      <div class="field span2"><label>Account</label><select id="valuation-account">${accounts.map(r=>`<option value="${r.id}" ${r.id===accountId?'selected':''}>${escHTML(r.name)}</option>`).join('')}</select></div>
      <div class="field"><label>Valuation date</label><input id="valuation-date" type="date" max="${todayISO()}" value="${existing?existing.date:todayISO()}"></div>
      <div class="field"><label>Total account value (£)</label><input id="valuation-value" type="number" min="0" step="0.01" value="${Number(suggested||0).toFixed(2)}"></div>
      <div class="field span2"><label>Notes (optional)</label><textarea id="valuation-notes" placeholder="e.g. Trading 212 month-end value">${escHTML(existing?existing.notes:'')}</textarea></div>
    </div>
    <p style="font-size:11.5px;color:var(--ink-faint);margin:12px 0 0;">Enter the complete end-of-day account value shown by Trading 212, including invested holdings and uninvested cash. This updates net worth but never creates income or spending.</p>
  </div><div class="modal-foot"><button class="btn" id="m-cancel">Cancel</button><button class="btn btn-primary" id="m-save">Save value</button></div>`);
  const accountEl=document.getElementById('valuation-account'),valueEl=document.getElementById('valuation-value');
  if(!existing)accountEl.onchange=()=>{const r=accounts.find(x=>x.id===accountEl.value);if(r)valueEl.value=Number(accountBalanceByName(r.name)||0).toFixed(2);};
  document.getElementById('m-cancel').onclick=closeModal;
  document.getElementById('m-save').onclick=()=>{
    const chosenId=accountEl.value,date=document.getElementById('valuation-date').value,value=Number(valueEl.value),notes=document.getElementById('valuation-notes').value.trim();
    const record=accounts.find(r=>r.id===chosenId);
    if(!record||!validISODate(date)||date>todayISO()||!Number.isFinite(value)||value<0){toast('Choose an account, valid date and non-negative value','error');return;}
    const collision=(DB.investmentValuations||[]).find(v=>v.accountId===chosenId&&v.date===date&&v.id!==(existing&&existing.id));
    if(existing){
      if(collision){toast('That account already has a value for this date','error');return;}
      Object.assign(existing,{accountId:chosenId,accountName:record.name,date,value,currency:record.currency||'GBP',notes,updatedAt:new Date().toISOString()});
    }else if(collision){
      Object.assign(collision,{value,notes,updatedAt:new Date().toISOString()});
    }else{
      DB.investmentValuations.push({id:uid('val'),accountId:chosenId,accountName:record.name,date,value,currency:record.currency||'GBP',source:'manual',notes,createdAt:new Date().toISOString(),updatedAt:null});
    }
    scheduleSave();closeModal();renderContent();renderSidebarBits();toast(existing||collision?'Investment value updated':'Investment value saved');
  };
}
function confirmDeleteInvestmentValuation(id){
  const valuation=(DB.investmentValuations||[]).find(v=>v.id===id);if(!valuation)return;
  const record=(DB.accountRecords||[]).find(r=>r.id===valuation.accountId);
  openModal(`<div class="modal-head"><h3>Delete this valuation?</h3></div><div class="modal-body"><p style="margin:0;color:var(--ink-soft);font-size:13px;">${escHTML(record?record.name:valuation.accountName)} · ${ukDate(valuation.date)} · ${gbp(valuation.value)}</p><p style="margin:10px 0 0;color:var(--ink-faint);font-size:11.5px;">Transactions and transfers are not affected. The account will fall back to its previous valuation or opening balance.</p></div><div class="modal-foot"><button class="btn" id="m-cancel">Cancel</button><button class="btn btn-danger" id="m-delete">Delete valuation</button></div>`);
  document.getElementById('m-cancel').onclick=closeModal;document.getElementById('m-delete').onclick=()=>{DB.investmentValuations=DB.investmentValuations.filter(v=>v.id!==id);scheduleSave();closeModal();renderContent();renderSidebarBits();toast('Investment valuation deleted');};
}
function renderInvestmentValuationPanel(){
  const accounts=investmentAccountRecords(),valuations=(DB.investmentValuations||[]).slice().sort((a,b)=>b.date.localeCompare(a.date));
  if(!accounts.length)return '';
  return `<div class="panel" style="margin-bottom:16px;">
    <div class="panel-head"><div class="panel-title">Portfolio values<small>Valuations change net worth; transfers explain money added or withdrawn</small></div></div>
    ${accounts.map(record=>{
      const latest=latestInvestmentValuation(record.id),balance=accountBalanceByName(record.name),performance=latest?investmentValuationPerformance(latest):null;
      const lifetime=investmentAccountLifetimeStats(record);
      const age=latest?Math.max(0,daysBetween(latest.date,todayISO())):null,stale=age!=null&&age>35;
      return `<div class="movers-row" style="align-items:center;">
        <span class="movers-desc" style="white-space:normal;"><strong>${escHTML(record.name)}</strong>${record.archived?' <span class="stamp-mini">archived</span>':''}<br><span style="font-size:10.5px;color:${stale?'var(--expense)':'var(--ink-faint)'};">${latest?`Last valued ${ukDate(latest.date)}${age?` · ${age}d ago`:''}${stale&&!record.archived?' · update recommended':''}`:'No valuation yet · opening balance and transfers only'}</span><br><span style="font-size:10.5px;color:var(--ink-faint);">Gross ${gbp(lifetime.gross)} · withdrawn ${gbp(lifetime.withdrawals)} · net ${gbp(lifetime.net,{signed:true})}${lifetime.fees?` · costs ${gbp(lifetime.fees)}`:''}</span>${performance?`<br><span style="font-size:10.5px;color:${performance.gain>=0?'var(--income)':'var(--expense)'};">Since previous value: ${gbp(performance.gain,{signed:true})} market movement · ${gbp(performance.netFlow,{signed:true})} net transfers</span>`:''}</span>
        <span class="movers-amt num">${gbp(balance)}</span>
        ${record.archived?'':`<button class="row-icon-btn" data-action="add-valuation" data-account-id="${record.id}" title="Update value">${iconPlus()}</button>`}
      </div>`;
    }).join('')}
    ${valuations.length?`<div style="border-top:1px solid var(--line);margin-top:12px;padding-top:12px;"><div class="panel-title" style="font-size:12px;margin-bottom:6px;">Recent valuations</div>${valuations.slice(0,8).map(v=>{const r=(DB.accountRecords||[]).find(a=>a.id===v.accountId),p=investmentValuationPerformance(v);return `<div class="movers-row"><span class="movers-desc">${ukDate(v.date)} · ${escHTML(r?r.name:v.accountName)}${v.notes?`<br><span style="font-size:10.5px;color:var(--ink-faint);">${escHTML(v.notes)}</span>`:''}</span><span class="movers-amt num">${gbp(v.value)}${p?`<br><span style="font-size:10.5px;color:${p.gain>=0?'var(--income)':'var(--expense)'};">${gbp(p.gain,{signed:true})} movement</span>`:''}</span><button class="row-icon-btn" data-action="edit-valuation" data-id="${v.id}" title="Edit valuation">${iconEdit()}</button><button class="row-icon-btn" data-action="delete-valuation" data-id="${v.id}" title="Delete valuation">${iconTrash()}</button></div>`;}).join('')}</div>`:`<div class="empty-state" style="padding:22px 10px 8px;"><p>Add today’s total Trading 212 account value to establish the valuation cutover. Your older category history will remain untouched.</p></div>`}
    ${valuations.length>=2?`<div class="chart-wrap" style="margin-top:14px;"><canvas id="investment-value-chart"></canvas></div>`:''}
  </div>`;
}
function renderInvestments(c){
  const hasInvestmentAccount=(DB.accountRecords||[]).some(r=>!r.archived&&['investment','pension'].includes(r.type));
  if(!DB.investmentCategories.length&&!hasInvestmentAccount){
    c.innerHTML = `
      <div class="empty-state panel" style="padding:60px 20px;">
        ${iconInvest()}
        <h4>No investment tracking set up yet</h4>
        <p style="max-width:460px;margin-left:auto;margin-right:auto;">Add an investment or pension account and record money moved into it as a transfer. Pocket Ledger will count the contribution without treating it as spending. You can still flag a legacy expense category as <strong>Investment</strong>.</p>
        <div style="display:flex;justify-content:center;gap:8px;flex-wrap:wrap;margin-top:10px;"><button class="btn btn-primary" id="btn-add-invest-account">Add investment account</button><button class="btn" id="btn-goto-categories">Use a category</button></div>
      </div>`;
    document.getElementById('btn-add-invest-account').onclick = ()=>openAccountModal(null,'investment');
    document.getElementById('btn-goto-categories').onclick = ()=>{ document.querySelector('[data-tab="categories"]').click(); };
    return;
  }

  const range = periodRange(UI.investPeriod);
  const h = investmentHeadroom(range);
  const portfolio=investmentPortfolioStats();
  const last = lastInvestmentTx();
  const lastLabel = last ? `${ukDate(last.date)}${last.date<=todayISO() ? ` · ${Math.max(0,daysBetween(last.date, todayISO()))}d ago` : ''}` : 'No contributions yet';
  const recurring = investmentRecurring();

  c.innerHTML = `
    <div class="panel-head" style="margin-bottom:14px;">
      <div class="seg" id="invest-period-seg">
        <button data-p="month" class="${UI.investPeriod==='month'?'active':''}">This month</button>
        <button data-p="year" class="${UI.investPeriod==='year'?'active':''}">This year</button>
        <button data-p="all" class="${UI.investPeriod==='all'?'active':''}">All time</button>
      </div>
      <div class="page-sub" style="margin:0;">${range.label}</div>
    </div>

    ${renderInvestmentValuationPanel()}

    <div class="kpi-row">
      <div class="kpi-card income"><div class="stripe"></div><div class="kpi-lbl">Gross contributions</div><div class="kpi-val income num">${gbp(h.investAmt)}</div><div class="kpi-sub">${h.count} contribution${h.count===1?'':'s'} · ${range.label}</div></div>
      <div class="kpi-card expense"><div class="stripe"></div><div class="kpi-lbl">Withdrawals</div><div class="kpi-val expense num">${gbp(h.withdrawalAmt)}</div><div class="kpi-sub">Money returned from investments · ${range.label}</div></div>
      <div class="kpi-card balance"><div class="stripe"></div><div class="kpi-lbl">Net contributions</div><div class="kpi-val num" style="color:${h.netInvestAmt>=0?'var(--gold)':'var(--expense)'}">${gbp(h.netInvestAmt,{signed:true})}</div><div class="kpi-sub">Gross less withdrawals · ${range.label}</div></div>
      <div class="kpi-card net"><div class="stripe"></div><div class="kpi-lbl">Current account value</div><div class="kpi-val num" style="color:var(--brand)">${gbp(portfolio.currentValue)}</div><div class="kpi-sub">All investment and pension accounts</div></div>
      <div class="kpi-card net"><div class="stripe"></div><div class="kpi-lbl">Market movement</div><div class="kpi-val num" style="color:${portfolio.marketMovement>=0?'var(--income)':'var(--expense)'}">${gbp(portfolio.marketMovement,{signed:true})}</div><div class="kpi-sub">All time · value minus opening balances and net transfers</div></div>
    </div>

    <div class="panel" style="margin-bottom:16px;"><div class="qc-line"><span>Contribution rate for ${range.label.toLowerCase()}</span><span class="num">${h.rate.toFixed(1)}%</span></div><div class="qc-line"><span>Comfortable headroom after gross contributions</span><span class="num" style="color:${h.headroom>=0?'var(--brand)':'var(--expense)'}">${gbp(h.headroom)}</span></div><div class="qc-line"><span>Last contribution</span><span class="num">${lastLabel}</span></div>${portfolio.fees?`<div class="qc-line"><span>Recorded transfer costs</span><span class="num">${gbp(portfolio.fees)}</span></div>`:''}</div>

    <div class="grid-2">
      <div class="panel">
        <div class="panel-head"><div class="panel-title">Monthly contributions<small>Last 12 months</small></div></div>
        <div class="chart-wrap"><canvas id="invest-contrib-chart"></canvas></div>
      </div>
      <div class="panel">
        <div class="panel-head"><div class="panel-title">Contribution rate vs income<small>Investing as a % of income, last 12 months</small></div></div>
        <div class="chart-wrap"><canvas id="invest-rate-chart"></canvas></div>
      </div>
    </div>

    <div class="grid-2" style="margin-top:16px;">
      <div class="panel">
        <div class="panel-head"><div class="panel-title">Where your headroom sits<small>${range.label}</small></div></div>
        <div class="qc-line"><span>Income</span><span class="num">${gbp(h.income)}</span></div>
        <div class="qc-line"><span>− Essential &amp; committed spending</span><span class="num">−${gbp(h.essentialAmt)}</span></div>
        <div class="qc-line"><span>− Current investment contributions</span><span class="num">−${gbp(h.investAmt)}</span></div>
        ${h.transferredInvestAmt?`<div class="qc-line" style="padding-left:12px;"><span>· recorded as account transfers</span><span class="num">${gbp(h.transferredInvestAmt)}</span></div>`:''}
        ${h.transferCostAmt?`<div class="qc-line"><span>− Investment transfer costs</span><span class="num">−${gbp(h.transferCostAmt)}</span></div>`:''}
        <div class="qc-line qc-total"><span>= Uncommitted headroom</span><span class="num" style="color:${h.headroom>=0?'var(--brand)':'var(--expense)'}">${gbp(h.headroom)}</span></div>
        <div class="qc-line" style="padding-left:12px;"><span>· already going to discretionary spending</span><span class="num">${gbp(h.discAmt)}</span></div>
        <div class="qc-line" style="padding-left:12px;"><span>· genuinely unallocated</span><span class="num" style="color:${h.trueSurplus>=0?'var(--income)':'var(--expense)'}">${gbp(h.trueSurplus)}</span></div>
        <p style="font-size:11px;color:var(--ink-faint);margin:12px 2px 0;">"Genuinely unallocated" is money that's neither essential, already invested, nor spent on discretionary things — the clearest room to put more toward investing, if you're comfortable with it.</p>
      </div>
      <div class="panel">
        <div class="panel-head"><div class="panel-title">Recurring category contributions<small>Detected from legacy categorised transaction history</small></div></div>
        <div id="invest-recurring-list"></div>
      </div>
    </div>
  `;

  document.getElementById('invest-period-seg').addEventListener('click', e=>{
    const b = e.target.closest('button'); if(!b) return;
    UI.investPeriod = b.dataset.p;
    renderInvestments(c);
  });
  document.querySelectorAll('[data-action="add-valuation"]').forEach(b=>b.onclick=()=>openInvestmentValuationModal(null,b.dataset.accountId));
  document.querySelectorAll('[data-action="edit-valuation"]').forEach(b=>b.onclick=()=>openInvestmentValuationModal(b.dataset.id));
  document.querySelectorAll('[data-action="delete-valuation"]').forEach(b=>b.onclick=()=>confirmDeleteInvestmentValuation(b.dataset.id));

  const recHost = document.getElementById('invest-recurring-list');
  if(!recurring.length){
    recHost.innerHTML = `<div class="empty-state" style="padding:24px 10px;"><h4>Nothing recurring detected yet</h4><p style="font-size:12.5px;">This detector uses legacy investment categories. Account transfers are already included in the totals above.</p></div>`;
  } else {
    recHost.innerHTML = recurring.map(r=> `
      <div class="movers-row">
        <span class="movers-desc" style="white-space:normal;line-height:1.4;" title="${escAttr(r.description)}">${escHTML(r.description)} <span class="stamp-mini">${escHTML(r.category)}</span><br><span style="color:var(--ink-faint);font-size:10.5px;">every ~${r.avgIntervalDays}d · ${r.occurrences} seen · next ~${ukDateShort(r.nextExpected)}</span></span>
        <span class="movers-amt num" style="color:var(--ink);">${gbp(Math.abs(r.amount))}</span>
        <span class="stamp-mini" style="background:${r.missed?'var(--expense-wash)':'var(--income-wash)'};color:${r.missed?'var(--expense)':'var(--income)'};">${r.missed ? `${r.overdueDays}d overdue` : 'on track'}</span>
      </div>
    `).join('');
  }

  drawInvestContribChart();
  drawInvestRateChart();
  drawInvestmentValueChart();
}
function drawInvestmentValueChart(){
  const ctx=document.getElementById('investment-value-chart');if(!ctx)return;
  const accounts=investmentAccountRecords().filter(r=>investmentValuationsForAccount(r.id).length);
  const palette=[cssVar('--brand'),cssVar('--income'),cssVar('--gold'),cssVar('--expense')];
  const labels=[...new Set((DB.investmentValuations||[]).map(v=>v.date))].sort();
  if(UI.charts.investValue)UI.charts.investValue.destroy();
  UI.charts.investValue=new Chart(ctx,{type:'line',data:{labels:labels.map(ukDateShort),datasets:accounts.map((r,i)=>{const byDate=new Map(investmentValuationsForAccount(r.id).map(v=>[v.date,v.value]));return {label:r.name,data:labels.map(d=>byDate.has(d)?byDate.get(d):null),borderColor:palette[i%palette.length],backgroundColor:'transparent',tension:.2,borderWidth:2.5,pointRadius:3,spanGaps:true};})},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:accounts.length>1,labels:{color:chartTickColor()}},tooltip:{callbacks:{label:item=>` ${item.dataset.label}: ${gbp(item.parsed.y)}`}}},scales:{y:{ticks:{callback:v=>'£'+v.toLocaleString('en-GB'),font:{size:11},color:chartTickColor()},grid:{color:chartGridColor()}},x:{grid:{display:false},ticks:{font:{size:10.5},color:chartTickColor()}}}}});
}
function iconInvest(){ return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" width="40" height="40"><path d="M3 17l6-6 4 4 8-8"/><path d="M15 7h6v6"/></svg>`; }
// Generic single-source, multi-target Sankey ribbon path — a smooth curve
// connecting a vertical band on the left to a vertical band on the right.
// Shared by any Sankey diagram in the app; hand-rolled as inline SVG rather
// than pulling in a charting plugin, since a source-fans-out-to-targets shape
// is simple enough that this is less code and less risk than a new dependency.
function sankeyRibbonPath(x1,y1,h1,x2,y2,h2,curvature){
  curvature = curvature==null ? 0.6 : curvature;
  const pull = (x2-x1)*curvature;
  const cx1 = x1+pull, cx2 = x2-pull;
  return `M${x1},${y1} C${cx1},${y1} ${cx2},${y2} ${x2},${y2} L${x2},${y2+h2} C${cx2},${y2+h2} ${cx1},${y1+h1} ${x1},${y1+h1} Z`;
}
function drawInvestContribChart(){
  const series = investmentMonthlySeries();
  const ctx = document.getElementById('invest-contrib-chart');
  if(!ctx) return;
  if(UI.charts.investContrib) UI.charts.investContrib.destroy();
  UI.charts.investContrib = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: series.map(s=>s.label),
      datasets: [{ label:'Invested', data: series.map(s=>s.invest), backgroundColor:cssVar('--brand'), borderRadius:3 }],
    },
    options:{
      responsive:true, maintainAspectRatio:false,
      plugins:{ legend:{display:false}, tooltip:{callbacks:{label:(item)=> ` ${gbp(item.parsed.y)}`}} },
      scales:{ y:{ ticks:{callback:(v)=>'£'+v.toLocaleString('en-GB'), font:{size:11}, color:chartTickColor()}, grid:{color:chartGridColor()} },
                x:{ grid:{display:false}, ticks:{font:{size:10.5}, color:chartTickColor()} } }
    }
  });
}
function drawInvestRateChart(){
  const series = investmentMonthlySeries();
  const ctx = document.getElementById('invest-rate-chart');
  if(!ctx) return;
  if(UI.charts.investRate) UI.charts.investRate.destroy();
  UI.charts.investRate = new Chart(ctx, {
    type: 'line',
    data: {
      labels: series.map(s=>s.label),
      datasets: [{ label:'Rate', data: series.map(s=>s.rate), tension:.3, fill:true, borderWidth:2.5, pointRadius:2,
        borderColor:cssVar('--gold'), backgroundColor:hexToRgba(cssVar('--gold'),.1) }],
    },
    options:{
      responsive:true, maintainAspectRatio:false,
      plugins:{ legend:{display:false}, tooltip:{callbacks:{label:(item)=> ` ${item.parsed.y.toFixed(1)}% of income`}} },
      scales:{ y:{ ticks:{callback:(v)=>v+'%', font:{size:11}, color:chartTickColor()}, grid:{color:chartGridColor()} },
                x:{ grid:{display:false}, ticks:{font:{size:10.5}, color:chartTickColor()} } }
    }
  });
}

