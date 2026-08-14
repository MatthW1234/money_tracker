/* =========================================================
   SPENDING PLAN
   ========================================================= */
function computeManualRegular(){
  const now = new Date();
  const results = [];
  const expandedTx = expandSplits(DB.transactions);
  DB.regularCategories.forEach(catName=>{
    const cat = DB.categories.find(c=>c.name===catName);
    if(!cat) return;
    // Average over up to the last 3 *complete* months (excludes the current
    // partial month so it isn't skewed by however much has posted so far).
    const monthlyTotals = [];
    for(let i=1;i<=3;i++){
      const base = new Date(now.getFullYear(), now.getMonth()-i, 1);
      const from = localISODate(base);
      const to = localISODate(new Date(base.getFullYear(), base.getMonth()+1, 0));
      const list = expandedTx.filter(t=> t.category===catName && t.date>=from && t.date<=to);
      if(list.length) monthlyTotals.push(list.reduce((s,t)=> s+Math.abs(t.amount), 0));
    }
    if(!monthlyTotals.length){
      results.push({ key:'manual:'+catName, description:catName, category:catName, amount:0, kind:cat.kind, manual:true, noHistory:true, stillDue:false });
      return;
    }
    const avg = monthlyTotals.reduce((s,v)=>s+v,0) / monthlyTotals.length;
    const thisMonthFrom = localISODate(new Date(now.getFullYear(), now.getMonth(), 1));
    const postedThisMonth = expandedTx.some(t=> t.category===catName && t.date>=thisMonthFrom);
    results.push({
      key: 'manual:'+catName,
      description: catName,
      category: catName,
      amount: cat.kind==='income' ? avg : -avg,
      kind: cat.kind,
      manual: true,
      monthsOfHistory: monthlyTotals.length,
      stillDue: !postedThisMonth,
    });
  });
  return results;
}

function recurringFrequencyLabel(item){
  return ({weekly:'Weekly',fortnightly:'Every 2 weeks',four_weekly:'Every 4 weeks',monthly:'Monthly',quarterly:'Quarterly',semiannual:'Every 6 months',annual:'Yearly',custom:`Every ${item.customDays||30} days`})[item.frequency] || 'Monthly';
}
function addAnchoredMonths(iso,months,anchorDay){
  const source=new Date(iso+'T00:00:00');
  const first=new Date(source.getFullYear(),source.getMonth()+months,1);
  const lastDay=new Date(first.getFullYear(),first.getMonth()+1,0).getDate();
  first.setDate(Math.min(anchorDay||source.getDate(),lastDay));
  return localISODate(first);
}
function advanceRecurringDate(item,fromDate){
  const from=fromDate||item.nextDate;
  if(item.frequency==='weekly') return addDays(from,7);
  if(item.frequency==='fortnightly') return addDays(from,14);
  if(item.frequency==='four_weekly') return addDays(from,28);
  if(item.frequency==='quarterly') return addAnchoredMonths(from,3,item.anchorDay);
  if(item.frequency==='semiannual') return addAnchoredMonths(from,6,item.anchorDay);
  if(item.frequency==='annual') return addAnchoredMonths(from,12,item.anchorDay);
  if(item.frequency==='custom') return addDays(from,Math.max(1,item.customDays||30));
  return addAnchoredMonths(from,1,item.anchorDay);
}
function recurringMonthlyAmount(item){
  const factor=({weekly:52/12,fortnightly:26/12,four_weekly:13/12,monthly:1,quarterly:1/3,semiannual:1/6,annual:1/12})[item.frequency]
    || 365/(Math.max(1,item.customDays||30)*12);
  return item.amount*factor;
}
function recurringOccurrenceDates(item,horizon){
  if(item.status!=='active'||!validISODate(item.nextDate)) return [];
  const dates=[];let cursor=item.nextDate,guard=0;
  while(cursor<=horizon&&guard++<120){
    if(!item.endDate||cursor<=item.endDate) dates.push(cursor);
    if(item.endDate&&cursor>=item.endDate) break;
    const next=advanceRecurringDate(item,cursor);if(next<=cursor)break;cursor=next;
  }
  return dates;
}
function formalMatchesDetected(item,detected){
  const a=normalizeDescForRecurring(item.name),b=normalizeDescForRecurring(detected.description);
  return !!a&&a===b&&item.kind===(detected.amount>0?'income':'expense');
}
function formalRecurringRows(){
  return (DB.recurringItems||[]).filter(item=>item.status==='active').map(item=>({
    key:'formal:'+item.id,id:item.id,formal:true,manual:false,description:item.name,category:item.category,
    amount:item.kind==='income'?item.amount:-item.amount,monthlyAmount:item.kind==='income'?recurringMonthlyAmount(item):-recurringMonthlyAmount(item),
    kind:item.kind,nextExpected:item.nextDate,frequency:item.frequency,variable:item.variable,minAmount:item.minAmount,maxAmount:item.maxAmount,
    avgIntervalDays:null,status:item.status,item,
  }));
}
function planNumbers(){
  const balance = currentBalance();
  const manualSet = new Set(DB.regularCategories);
  const formal = formalRecurringRows();
  // A category tracked manually supersedes any transaction-level auto-detection
  // within that same category, so nothing gets counted twice.
  const autoRaw = detectRecurring()
    .filter(r=> !DB.dismissedRecurring.includes(r.key))
    .filter(r=> !manualSet.has(r.category))
    .filter(r=> !formal.some(f=>formalMatchesDetected(f.item,r)));
  const manualRaw = computeManualRegular().filter(r=>!formal.some(f=>f.kind===r.kind&&f.category&&f.category===r.category));

  const nextIncomeDate = (()=>{
    const dates = formal.filter(r=>r.amount>0).map(r=> r.nextExpected).filter(d=>d>=todayISO()).sort();
    return dates.length ? dates[0] : null;
  })();
  const horizon = nextIncomeDate || addDays(todayISO(), 30);

  const auto = autoRaw.map(r=> ({...r, manual:false, stillDue: r.nextExpected <= horizon}));
  const confirmed=formal.map(r=>({...r,stillDue:r.nextExpected<=horizon}));
  const all = [...confirmed,...auto, ...manualRaw];

  const recurringIncome = all.filter(r=> r.manual ? r.kind==='income' : r.amount>0).sort((a,b)=> (a.nextExpected||'9999').localeCompare(b.nextExpected||'9999'));
  const recurringExpense = all.filter(r=> r.manual ? r.kind!=='income' : r.amount<=0).sort((a,b)=> (a.nextExpected||'9999').localeCompare(b.nextExpected||'9999'));

  const regularMonthlyOutgoings = recurringExpense.reduce((s,r)=> s+Math.abs(r.formal?r.monthlyAmount:r.amount), 0);
  const regularMonthlyIncome = recurringIncome.reduce((s,r)=> s+(r.formal?r.monthlyAmount:r.amount), 0);
  const scheduledMonthlyOutgoings=confirmed.filter(r=>r.amount<0).reduce((s,r)=>s+Math.abs(r.monthlyAmount),0);
  const scheduledMonthlyIncome=confirmed.filter(r=>r.amount>0).reduce((s,r)=>s+r.monthlyAmount,0);

  const stillDueItems = confirmed.filter(r=>r.amount<0&&r.stillDue);
  const stillDueTotal = stillDueItems.reduce((s,r)=> s+(r.formal?recurringOccurrenceDates(r.item,horizon).length*Math.abs(r.amount):Math.abs(r.amount)), 0);
  const goalStats=savingsGoalStats();
  const wishlistTotal = DB.wishlist.reduce((s,w)=> s+w.amount, 0);
  const availableBeforeWishlist=balance-stillDueTotal-goalStats.allocated;
  const availableToSpend = availableBeforeWishlist - wishlistTotal;
  return { balance, recurringIncome, recurringExpense, regularMonthlyOutgoings, regularMonthlyIncome,
    scheduledMonthlyOutgoings,scheduledMonthlyIncome,nextIncomeDate, horizon, stillDueItems, stillDueTotal,goalStats,wishlistTotal,availableBeforeWishlist,availableToSpend };
}


function renderPlan(c){
  const n = planNumbers();
  const horizonLabel = n.nextIncomeDate ? `before your next expected pay (~${ukDateShort(n.horizon)})` : `in the next 30 days`;

  c.innerHTML = `
    <div class="kpi-row">
      <div class="kpi-card balance"><div class="stripe"></div><div class="kpi-lbl">Available cash</div><div class="kpi-val num" style="color:var(--gold)">${gbp(n.balance)}</div><div class="kpi-sub">Liquid accounts less card debt</div></div>
      <div class="kpi-card expense"><div class="stripe"></div><div class="kpi-lbl">Bills still due</div><div class="kpi-val expense num">${gbp(n.stillDueTotal)}</div><div class="kpi-sub">${n.stillDueItems.length} item${n.stillDueItems.length===1?'':'s'}, ${horizonLabel}</div></div>
      <div class="kpi-card net"><div class="stripe"></div><div class="kpi-lbl">Earmarked savings</div><div class="kpi-val num">${gbp(n.goalStats.allocated)}</div><div class="kpi-sub">${DB.savingsGoals.length} goal${DB.savingsGoals.length===1?'':'s'} · ${gbp(n.goalStats.monthlyNeeded)}/mo needed</div></div>
      <div class="kpi-card income"><div class="stripe"></div><div class="kpi-lbl">Available to spend</div><div class="kpi-val income num" style="color:${n.availableToSpend>=0?'var(--income)':'var(--expense)'}">${gbp(n.availableToSpend)}</div><div class="kpi-sub">After bills, earmarked savings and wishlist</div></div>
    </div>

    <div class="panel">
      <div class="panel-head">
        <div class="panel-title">Upcoming<small>What's expected to hit your account soon</small></div>
        <div class="seg" id="upcoming-seg">
          <button data-d="30" class="${UI.upcomingDays===30?'active':''}">30 days</button>
          <button data-d="60" class="${UI.upcomingDays===60?'active':''}">60 days</button>
        </div>
      </div>
      <div id="upcoming-list"></div>
    </div>

    <div class="panel" style="margin-top:16px;">
      <div class="panel-head">
        <div class="panel-title">Savings goals &amp; sinking funds<small>Earmarked from your existing cash · separate from purchases you're only considering</small></div>
        <button class="btn btn-sm" id="plan-add-goal">${iconPlus()} Add goal</button>
      </div>
      <div id="savings-goals"></div>
    </div>

    <div class="panel" style="margin-top:16px;">
      <div class="panel-head">
        <div class="panel-title">Scheduled recurring<small>Confirmed schedules drive your plan · ${gbp(n.scheduledMonthlyIncome)}/mo income · ${gbp(n.scheduledMonthlyOutgoings)}/mo outgoings</small></div>
        <button class="btn btn-sm" id="plan-add-recurring">${iconPlus()} Add recurring</button>
      </div>
      <div id="managed-recurring"></div>
    </div>

    <div class="grid-2" style="margin-top:16px;">
      <div class="panel">
        <div class="panel-head"><div class="panel-title">Automatic suggestions<small>Patterns spotted in your history — confirm a schedule or dismiss it</small></div></div>
        <div class="recurring-grid">
          <div>
            <div class="movers-col-title income">Potential income patterns</div>
            <div id="recurring-income"></div>
          </div>
          <div>
            <div class="movers-col-title expense">Potential bill patterns</div>
            <div id="recurring-expense"></div>
          </div>
        </div>
      </div>
      <div class="panel">
        <div class="panel-head"><div class="panel-title">Quick check<small>See the effect of a purchase without committing to it</small></div></div>
        <div class="field" style="max-width:220px;">
          <label>If I spent (£)</label>
          <input type="number" id="qc-amount" min="0" step="0.01" placeholder="0.00">
        </div>
        <div id="qc-result" class="qc-result"></div>
        <button class="btn btn-sm" id="qc-add-wish" style="margin-top:10px;" disabled>${iconPlus()} Add this to wishlist</button>
      </div>
    </div>

    <div class="panel" style="margin-top:16px;">
      <div class="panel-head">
        <div class="panel-title">Wishlist<small>Purchases you're weighing up, stacked against what you can actually spend</small></div>
      </div>
      <div id="wishlist-body"></div>
    </div>
  `;

  renderUpcoming(n);
  renderSavingsGoals(n);
  document.getElementById('plan-add-goal').onclick=()=>openSavingsGoalModal(null);
  renderManagedRecurring();
  document.getElementById('plan-add-recurring').onclick=()=>openRecurringModal(null);
  document.getElementById('upcoming-seg').addEventListener('click', e=>{
    const b = e.target.closest('button'); if(!b) return;
    UI.upcomingDays = parseInt(b.dataset.d);
    renderPlan(c);
  });
  renderRecurringLists(n);
  renderWishlist(n);

  const qcAmount = document.getElementById('qc-amount');
  const qcResult = document.getElementById('qc-result');
  const qcAddBtn = document.getElementById('qc-add-wish');
  function updateQuickCheck(){
    const v = parseFloat(qcAmount.value);
    if(isNaN(v) || v<=0){
      qcResult.innerHTML = '';
      qcAddBtn.disabled = true;
      return;
    }
    const after = n.availableToSpend - v;
    qcResult.innerHTML = `
      <div class="qc-line"><span>Available to spend now</span><span class="num">${gbp(n.availableToSpend)}</span></div>
      <div class="qc-line"><span>This purchase</span><span class="num">−${gbp(v)}</span></div>
      <div class="qc-line qc-total"><span>Left afterward</span><span class="num" style="color:${after>=0?'var(--income)':'var(--expense)'}">${gbp(after)}</span></div>
    `;
    qcAddBtn.disabled = false;
  }
  qcAmount.addEventListener('input', updateQuickCheck);
  qcAddBtn.onclick = ()=>{
    const v = parseFloat(qcAmount.value);
    if(isNaN(v) || v<=0) return;
    openWishModal(null, v);
  };
}

function upcomingBillsFor(n, days){
  const horizon = addDays(todayISO(), days);
  const combined = [...n.recurringIncome, ...n.recurringExpense].filter(r=>r.formal);
  const dated = combined.flatMap(r=>r.formal
      ? recurringOccurrenceDates(r.item,horizon).map(date=>({...r,nextExpected:date,occurrence:true}))
      : [r])
    .filter(r=> !r.manual && r.nextExpected <= horizon)
    .sort((a,b)=> a.nextExpected.localeCompare(b.nextExpected));
  const undated = [];
  return { dated, undated };
}
function daysUntilLabel(dateStr){
  const d = daysBetween(todayISO(), dateStr);
  if(d<0) return `${Math.abs(d)}d overdue`;
  if(d===0) return 'today';
  if(d===1) return 'tomorrow';
  return `in ${d} days`;
}
function renderUpcoming(n){
  const host = document.getElementById('upcoming-list');
  if(!host) return;
  const { dated, undated } = upcomingBillsFor(n, UI.upcomingDays);
  if(!dated.length && !undated.length){
    host.innerHTML = `<div class="empty-state" style="padding:24px 10px;"><h4>Nothing scheduled soon</h4><p style="font-size:12.5px;">Add a recurring item or confirm a suggestion to place it on your upcoming schedule.</p></div>`;
    return;
  }
  let html = '';
  if(dated.length){
    html += dated.map(r=> `<div class="upcoming-row">
      <div class="upcoming-date">
        <div class="upcoming-day">${ukDateShort(r.nextExpected)}</div>
        <div class="upcoming-rel">${daysUntilLabel(r.nextExpected)}</div>
      </div>
      <div class="upcoming-desc">${escHTML(r.description)}${r.formal?` <span class="stamp-mini">scheduled</span>`:''}</div>
      <div class="upcoming-amt num" style="color:${r.amount>0?'var(--income)':'var(--ink)'}">${gbp(r.amount,{signed:true})}</div>
    </div>`).join('');
  }
  if(undated.length){
    html += `<div class="upcoming-subhead">Expected this month · no fixed date</div>`;
    html += undated.map(r=> `<div class="upcoming-row">
      <div class="upcoming-date"><div class="upcoming-day">—</div></div>
      <div class="upcoming-desc">${escHTML(r.description)} <span class="stamp-mini">est.</span></div>
      <div class="upcoming-amt num" style="color:${r.amount>0?'var(--income)':'var(--ink)'}">${gbp(r.amount,{signed:true})}</div>
    </div>`).join('');
  }
  host.innerHTML = html;
}
function renderRecurringLists(n){
  const incomeHost = document.getElementById('recurring-income');
  const expenseHost = document.getElementById('recurring-expense');
  const income=n.recurringIncome.filter(r=>!r.formal),expense=n.recurringExpense.filter(r=>!r.formal);
  incomeHost.innerHTML = income.length ? income.map(recurringRow).join('') :
    `<div class="empty-state" style="padding:16px 0;"><p style="font-size:12px;margin:0;">No recurring income detected yet.</p></div>`;
  expenseHost.innerHTML = expense.length ? expense.map(recurringRow).join('') :
    `<div class="empty-state" style="padding:16px 0;"><p style="font-size:12px;margin:0;">No recurring bills detected yet.</p></div>`;
  document.querySelectorAll('[data-action="dismiss-recurring"]').forEach(b=>{
    b.onclick = ()=>{
      DB.dismissedRecurring.push(b.dataset.key);
      scheduleSave();
      renderPlan(document.getElementById('content'));
      toast('Dismissed — won\u2019t be counted as regular going forward');
    };
  });
  document.querySelectorAll('[data-action="untrack-regular"]').forEach(b=>{
    b.onclick = ()=>{
      DB.regularCategories = DB.regularCategories.filter(n=> n!==b.dataset.name);
      scheduleSave();
      renderPlan(document.getElementById('content'));
      toast('Stopped tracking ' + b.dataset.name + ' as regular');
    };
  });
  document.querySelectorAll('[data-action="confirm-recurring"]').forEach(b=>{
    b.onclick=()=>{
      const found=detectRecurring().find(r=>r.key===b.dataset.key);
      if(found) openRecurringModal(null,found);
    };
  });
}
function recurringRow(r){
  if(r.manual){
    const sub = r.noHistory
      ? `<span style="color:var(--ink-faint);font-size:10.5px;">tracked as regular · no history yet</span>`
      : `<span style="color:var(--ink-faint);font-size:10.5px;">est. from last ${r.monthsOfHistory} month${r.monthsOfHistory===1?'':'s'} · category average${r.stillDue?' · not posted yet this month':''}</span>`;
    return `<div class="movers-row">
      <span class="movers-desc" title="${escAttr(r.description)}">${escHTML(r.description)} <span class="stamp-mini">est.</span><br>${sub}</span>
      <span class="movers-amt num" style="color:${r.amount>0?'var(--income)':'var(--ink)'}">${r.noHistory ? '—' : gbp(r.amount,{signed:true})}</span>
      <button class="row-icon-btn" data-action="untrack-regular" data-name="${escAttr(r.category)}" title="Stop tracking this category as regular">${iconXSmall()}</button>
    </div>`;
  }
  return `<div class="movers-row">
    <span class="movers-desc" title="${escAttr(r.description)}">${escHTML(r.description)}<br><span style="color:var(--ink-faint);font-size:10.5px;">every ~${r.avgIntervalDays}d · next ~${ukDateShort(r.nextExpected)}</span></span>
    <span class="movers-amt num" style="color:${r.amount>0?'var(--income)':'var(--ink)'}">${gbp(r.amount,{signed:true})}</span>
    <button class="row-icon-btn" data-action="confirm-recurring" data-key="${escAttr(r.key)}" title="Confirm and schedule">${iconCheck()}</button>
    <button class="row-icon-btn" data-action="dismiss-recurring" data-key="${escAttr(r.key)}" title="Not actually recurring">${iconXSmall()}</button>
  </div>`;
}
function renderManagedRecurring(){
  const host=document.getElementById('managed-recurring');if(!host)return;
  const items=[...(DB.recurringItems||[])].sort((a,b)=>{
    const rank={active:0,paused:1,ended:2};return (rank[a.status]-rank[b.status])||a.nextDate.localeCompare(b.nextDate);
  });
  if(!items.length){
    host.innerHTML=`<div class="empty-state" style="padding:28px 10px;"><h4>No confirmed schedules yet</h4><p style="font-size:12.5px;">Add one manually, or confirm a suggestion below. Confirmed dates are used for upcoming bills and available-to-spend.</p></div>`;return;
  }
  host.innerHTML=`<div class="table-wrap"><table><thead><tr><th>Name</th><th>Frequency</th><th>Next date</th><th>Status</th><th style="text-align:right;">Expected</th><th></th></tr></thead><tbody>${items.map(item=>{
    const overdue=item.status==='active'&&item.nextDate<todayISO();
    const range=item.variable&&(item.minAmount!=null||item.maxAmount!=null)
      ? `<div style="font-size:10.5px;color:var(--ink-faint);">${item.minAmount!=null?gbp(item.minAmount):'—'}–${item.maxAmount!=null?gbp(item.maxAmount):'—'}</div>`:'';
    const statusLabel=overdue?'Overdue':item.status[0].toUpperCase()+item.status.slice(1);
    const statusClass=overdue?'status-pending':item.status==='active'?'status-cleared':'status-reconciled';
    return `<tr>
      <td class="desc"><strong>${escHTML(item.name)}</strong><div style="font-size:10.5px;color:var(--ink-faint);">${escHTML(item.category||'Uncategorised')}${item.account?` · ${escHTML(item.account)}`:''}${item.variable?' · variable':''}</div></td>
      <td>${escHTML(recurringFrequencyLabel(item))}</td>
      <td>${ukDateShort(item.nextDate)}${overdue?`<div style="font-size:10.5px;color:var(--expense);">${daysUntilLabel(item.nextDate)}</div>`:''}</td>
      <td><span class="status-pill ${statusClass}">${statusLabel}</span></td>
      <td class="amt num" style="color:${item.kind==='income'?'var(--income)':'var(--ink)'}">${item.kind==='income'?'+':'−'}${gbp(item.amount)}${range}</td>
      <td class="row-actions">
        ${item.status==='active'?`<button class="row-icon-btn" data-action="rec-occurred" data-id="${item.id}" title="Record occurrence">${iconCheck()}</button><button class="row-icon-btn" data-action="rec-skip" data-id="${item.id}" title="Skip this occurrence">${iconChevronRight()}</button>`:''}
        ${item.status!=='ended'?`<button class="row-icon-btn" data-action="rec-pause" data-id="${item.id}" title="${item.status==='paused'?'Resume':'Pause'}">${item.status==='paused'?iconPlay():iconPause()}</button>`:''}
        <button class="row-icon-btn" data-action="rec-edit" data-id="${item.id}" title="Edit">${iconEdit()}</button>
        ${item.status!=='ended'?`<button class="row-icon-btn" data-action="rec-end" data-id="${item.id}" title="End schedule">${iconXSmall()}</button>`:''}
      </td>
    </tr>`;
  }).join('')}</tbody></table></div>`;
  host.querySelectorAll('[data-action="rec-edit"]').forEach(b=>b.onclick=()=>openRecurringModal(b.dataset.id));
  host.querySelectorAll('[data-action="rec-occurred"]').forEach(b=>b.onclick=()=>openRecurringOccurrenceModal(b.dataset.id));
  host.querySelectorAll('[data-action="rec-skip"]').forEach(b=>b.onclick=()=>confirmSkipRecurring(b.dataset.id));
  host.querySelectorAll('[data-action="rec-pause"]').forEach(b=>b.onclick=()=>toggleRecurringPause(b.dataset.id));
  host.querySelectorAll('[data-action="rec-end"]').forEach(b=>b.onclick=()=>confirmEndRecurring(b.dataset.id));
}
function iconPause(){return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="9" y1="5" x2="9" y2="19"/><line x1="15" y1="5" x2="15" y2="19"/></svg>`;}
function iconPlay(){return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="7 4 20 12 7 20 7 4"/></svg>`;}
function openRecurringModal(id,suggestion){
  const existing=id?(DB.recurringItems||[]).find(x=>x.id===id):null;
  const item=existing||{
    name:suggestion?suggestion.description:'',kind:suggestion&&suggestion.amount>0?'income':'expense',category:suggestion?suggestion.category:'',account:suggestion?suggestion.account||'':'',
    amount:suggestion?Math.abs(suggestion.amount):0,variable:false,minAmount:null,maxAmount:null,frequency:'monthly',customDays:30,
    nextDate:suggestion?suggestion.nextExpected:todayISO(),anchorDay:null,endDate:'',status:'active',notes:''
  };
  openModal(`
    <div class="modal-head"><h3>${existing?'Edit recurring item':suggestion?'Confirm recurring schedule':'Add recurring item'}</h3></div>
    <div class="modal-body"><div class="form-grid">
      <div class="field span2"><label>Type</label><div class="seg" id="rec-kind"><button type="button" data-kind="expense" class="${item.kind==='expense'?'active':''}">Expense</button><button type="button" data-kind="income" class="${item.kind==='income'?'active':''}">Income</button></div></div>
      <div class="field span2"><label>Name</label><input id="rec-name" type="text" value="${escAttr(item.name)}" placeholder="e.g. Council tax"></div>
      <div class="field"><label>Typical amount (£)</label><input id="rec-amount" type="number" min="0" step="0.01" value="${item.amount?Number(item.amount).toFixed(2):''}"></div>
      <div class="field"><label>Category</label><select id="rec-category"></select></div>
      <div class="field"><label>Account</label><input id="rec-account" type="text" list="rec-account-list" value="${escAttr(item.account||'')}"><datalist id="rec-account-list">${activeAccountNames().map(a=>`<option value="${escAttr(a)}">`).join('')}</datalist></div>
      <div class="field"><label>Frequency</label><select id="rec-frequency">${RECURRING_FREQUENCIES.map(f=>`<option value="${f}" ${item.frequency===f?'selected':''}>${recurringFrequencyLabel({...item,frequency:f})}</option>`).join('')}</select></div>
      <div class="field" id="rec-custom-wrap"><label>Repeat every (days)</label><input id="rec-custom-days" type="number" min="1" step="1" value="${item.customDays||30}"></div>
      <div class="field"><label>Next expected date</label><input id="rec-next" type="date" value="${item.nextDate}"></div>
      <div class="field"><label>End date (optional)</label><input id="rec-end" type="date" value="${item.endDate||''}"></div>
      <div class="field span2"><label class="regular-toggle"><input id="rec-variable" type="checkbox" ${item.variable?'checked':''}> Amount varies</label></div>
      <div class="field" id="rec-min-wrap"><label>Expected minimum (£)</label><input id="rec-min" type="number" min="0" step="0.01" value="${item.minAmount==null?'':item.minAmount}"></div>
      <div class="field" id="rec-max-wrap"><label>Expected maximum (£)</label><input id="rec-max" type="number" min="0" step="0.01" value="${item.maxAmount==null?'':item.maxAmount}"></div>
      <div class="field span2"><label>Notes (optional)</label><textarea id="rec-notes">${escHTML(item.notes||'')}</textarea></div>
    </div></div>
    <div class="modal-foot"><button class="btn" id="m-cancel">Cancel</button><button class="btn btn-primary" id="m-save">${existing?'Save changes':'Save schedule'}</button></div>
  `,{wide:true});
  let kind=item.kind;
  const categorySelect=document.getElementById('rec-category');
  function fillRecurringCategories(){
    const categories=DB.categories.filter(c=>c.kind===kind);
    categorySelect.innerHTML=`<option value="">Uncategorised</option>`+categories.map(c=>`<option value="${escAttr(c.name)}" ${c.name===item.category?'selected':''}>${escHTML(c.name)}</option>`).join('');
  }
  function updateRecurringFields(){
    document.getElementById('rec-custom-wrap').style.display=document.getElementById('rec-frequency').value==='custom'?'':'none';
    const variable=document.getElementById('rec-variable').checked;
    document.getElementById('rec-min-wrap').style.display=variable?'':'none';document.getElementById('rec-max-wrap').style.display=variable?'':'none';
  }
  fillRecurringCategories();updateRecurringFields();
  document.getElementById('rec-kind').onclick=e=>{const b=e.target.closest('button');if(!b)return;kind=b.dataset.kind;document.querySelectorAll('#rec-kind button').forEach(x=>x.classList.toggle('active',x===b));item.category='';fillRecurringCategories();};
  document.getElementById('rec-frequency').onchange=updateRecurringFields;document.getElementById('rec-variable').onchange=updateRecurringFields;
  document.getElementById('m-cancel').onclick=closeModal;
  document.getElementById('m-save').onclick=()=>{
    const name=document.getElementById('rec-name').value.trim(),amount=Number(document.getElementById('rec-amount').value),nextDate=document.getElementById('rec-next').value;
    const frequency=document.getElementById('rec-frequency').value,customDays=Math.round(Number(document.getElementById('rec-custom-days').value)),endDate=document.getElementById('rec-end').value;
    const variable=document.getElementById('rec-variable').checked,minRaw=document.getElementById('rec-min').value,maxRaw=document.getElementById('rec-max').value;
    const minAmount=minRaw===''?null:Number(minRaw),maxAmount=maxRaw===''?null:Number(maxRaw);
    if(!name||!Number.isFinite(amount)||amount<=0||!validISODate(nextDate)){toast('Enter a name, positive amount and next date','error');return;}
    if(frequency==='custom'&&(!Number.isFinite(customDays)||customDays<1)){toast('Enter a repeat interval of at least one day','error');return;}
    if(endDate&&endDate<nextDate){toast('End date cannot be before the next expected date','error');return;}
    if(variable&&minAmount!=null&&maxAmount!=null&&minAmount>maxAmount){toast('Minimum amount cannot exceed maximum','error');return;}
    const account=document.getElementById('rec-account').value.trim();if(account)ensureAccountRecord(account);
    const values={name,kind,category:categorySelect.value,account,amount,variable,minAmount:variable?minAmount:null,maxAmount:variable?maxAmount:null,frequency,customDays:frequency==='custom'?customDays:null,nextDate,anchorDay:Number(nextDate.slice(8,10)),endDate,status:existing?existing.status:'active',notes:document.getElementById('rec-notes').value.trim()};
    if(existing)Object.assign(existing,values);else DB.recurringItems.push(Object.assign({id:uid('rec'),createdAt:new Date().toISOString(),lastMatchedDate:''},values));
    if(suggestion&&!DB.dismissedRecurring.includes(suggestion.key))DB.dismissedRecurring.push(suggestion.key);
    scheduleSave();closeModal();renderContent();toast(existing?'Recurring item updated':'Recurring schedule saved');
  };
}
function advanceRecurringItem(item,throughDate){
  let next=advanceRecurringDate(item,item.nextDate),guard=0;
  while(next<=throughDate&&guard++<120)next=advanceRecurringDate(item,next);
  item.nextDate=next;if(item.endDate&&item.nextDate>item.endDate)item.status='ended';
}
function openRecurringOccurrenceModal(id){
  const item=(DB.recurringItems||[]).find(x=>x.id===id);if(!item)return;
  openModal(`<div class="modal-head"><h3>Record ${item.kind==='income'?'income':'payment'}</h3></div><div class="modal-body">
    <p style="margin:0 0 14px;color:var(--ink-soft);font-size:13px;">${escHTML(item.name)} was expected ${ukDate(item.nextDate)}. Recording it advances the schedule.</p>
    <div class="form-grid"><div class="field"><label>Actual date</label><input id="rec-occ-date" type="date" value="${item.nextDate}"></div><div class="field"><label>Actual amount (£)</label><input id="rec-occ-amount" type="number" min="0" step="0.01" value="${Number(item.amount).toFixed(2)}"></div>
    <div class="field span2"><label class="regular-toggle"><input id="rec-occ-add" type="checkbox" checked> Add this occurrence to Transactions</label></div></div>
  </div><div class="modal-foot"><button class="btn" id="m-cancel">Cancel</button><button class="btn btn-primary" id="m-confirm">Record and continue</button></div>`);
  document.getElementById('m-cancel').onclick=closeModal;document.getElementById('m-confirm').onclick=()=>{
    const date=document.getElementById('rec-occ-date').value,amount=Number(document.getElementById('rec-occ-amount').value),add=document.getElementById('rec-occ-add').checked;
    if(!validISODate(date)||!Number.isFinite(amount)||amount<=0){toast('Enter a valid date and positive amount','error');return;}
    if(add){
      const duplicate=DB.transactions.some(t=>t.recurringItemId===item.id&&t.date===date);
      if(duplicate){toast('That scheduled occurrence is already in Transactions','error');return;}
      DB.transactions.push({id:uid('tx'),date,description:item.name,amount:item.kind==='income'?amount:-amount,category:item.category,account:item.account,notes:item.notes||'',source:'recurring',status:'cleared',recurringItemId:item.id});
    }
    item.lastMatchedDate=date;advanceRecurringItem(item,date);scheduleSave();closeModal();renderContent();toast(add?'Occurrence added to Transactions':'Schedule advanced');
  };
}
function toggleRecurringPause(id){const item=DB.recurringItems.find(x=>x.id===id);if(!item)return;item.status=item.status==='paused'?'active':'paused';scheduleSave();renderContent();toast(item.status==='active'?'Schedule resumed':'Schedule paused');}
function confirmSkipRecurring(id){const item=DB.recurringItems.find(x=>x.id===id);if(!item)return;openModal(`<div class="modal-head"><h3>Skip this occurrence?</h3></div><div class="modal-body"><p style="margin:0;color:var(--ink-soft);font-size:13px;">${escHTML(item.name)} on ${ukDate(item.nextDate)} will not be added to Transactions. The next date will move forward once.</p></div><div class="modal-foot"><button class="btn" id="m-cancel">Cancel</button><button class="btn btn-primary" id="m-confirm">Skip once</button></div>`);document.getElementById('m-cancel').onclick=closeModal;document.getElementById('m-confirm').onclick=()=>{item.nextDate=advanceRecurringDate(item,item.nextDate);if(item.endDate&&item.nextDate>item.endDate)item.status='ended';scheduleSave();closeModal();renderContent();toast('Occurrence skipped');};}
function confirmEndRecurring(id){const item=DB.recurringItems.find(x=>x.id===id);if(!item)return;openModal(`<div class="modal-head"><h3>End recurring schedule?</h3></div><div class="modal-body"><p style="margin:0;color:var(--ink-soft);font-size:13px;">${escHTML(item.name)} will stay in your history but no longer affect upcoming bills or plan totals.</p></div><div class="modal-foot"><button class="btn" id="m-cancel">Cancel</button><button class="btn btn-danger" id="m-confirm">End schedule</button></div>`);document.getElementById('m-cancel').onclick=closeModal;document.getElementById('m-confirm').onclick=()=>{item.status='ended';scheduleSave();closeModal();renderContent();toast('Schedule ended');};}
function iconXSmall(){ return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="13" height="13"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`; }

function savingsGoalState(goal){
  const saved=savingsGoalBalance(goal),remaining=Math.max(0,goal.targetAmount-saved),pct=goal.targetAmount?clamp(saved/goal.targetAmount*100,0,100):0;
  if(saved>=goal.targetAmount)return {label:'Funded',className:'status-cleared',saved,remaining,pct,onTrack:true};
  if(goal.status==='paused')return {label:'Paused',className:'status-reconciled',saved,remaining,pct,onTrack:false};
  if(goal.targetDate&&goal.targetDate<todayISO())return {label:'Overdue',className:'status-pending',saved,remaining,pct,onTrack:false};
  let onTrack=true;
  if(goal.targetDate&&validISODate(String(goal.createdAt||'').slice(0,10))){
    const start=String(goal.createdAt).slice(0,10),total=Math.max(1,daysBetween(start,goal.targetDate)),elapsed=clamp(daysBetween(start,todayISO()),0,total);
    onTrack=saved+0.01>=goal.targetAmount*(elapsed/total);
  }
  return {label:onTrack?'On track':'Behind',className:onTrack?'status-cleared':'status-pending',saved,remaining,pct,onTrack};
}
function renderSavingsGoals(n){
  const host=document.getElementById('savings-goals');if(!host)return;
  const goals=[...(DB.savingsGoals||[])].sort((a,b)=>{
    const priority={high:0,medium:1,low:2};
    return (a.status==='paused')-(b.status==='paused')||(priority[a.priority]-priority[b.priority])||(a.targetDate||'9999').localeCompare(b.targetDate||'9999');
  });
  if(!goals.length){
    host.innerHTML=`<div class="empty-state" style="padding:28px 10px;"><h4>No savings goals yet</h4><p style="font-size:12.5px;">Use a savings goal for a longer-term target, or a sinking fund for a known future cost. Earmarking does not create a bank transaction or change net worth.</p></div>`;return;
  }
  host.innerHTML=`<div class="table-wrap"><table><thead><tr><th>Goal</th><th>Progress</th><th>Target</th><th style="text-align:right;">Monthly needed</th><th>Status</th><th></th></tr></thead><tbody>${goals.map(goal=>{
    const state=savingsGoalState(goal),monthly=savingsGoalMonthlyNeeded(goal);
    const typeLabel=goal.type==='sinking_fund'?'Sinking fund':'Savings goal';
    return `<tr>
      <td class="desc"><strong>${escHTML(goal.name)}</strong><div style="font-size:10.5px;color:var(--ink-faint);">${typeLabel} · ${goal.priority} priority${goal.account?` · ${escHTML(goal.account)}`:''}</div></td>
      <td style="min-width:170px;"><div style="display:flex;justify-content:space-between;gap:8px;font-size:11px;margin-bottom:5px;"><span>${gbp(state.saved)} saved</span><span>${Math.round(state.pct)}%</span></div><div class="budget-bar-track"><div class="budget-bar-fill" style="width:${state.pct}%;background:${state.pct>=100?'var(--income)':'var(--brand)'};"></div></div><div style="font-size:10.5px;color:var(--ink-faint);margin-top:4px;">${gbp(state.remaining)} remaining</div></td>
      <td>${gbp(goal.targetAmount)}${goal.targetDate?`<div style="font-size:10.5px;color:${goal.targetDate<todayISO()&&state.remaining?'var(--expense)':'var(--ink-faint)'};">by ${ukDateShort(goal.targetDate)}</div>`:'<div style="font-size:10.5px;color:var(--ink-faint);">No date</div>'}</td>
      <td class="amt num">${goal.targetDate&&state.remaining?gbp(monthly)+'/mo':'—'}</td>
      <td><span class="status-pill ${state.className}">${state.label}</span></td>
      <td class="row-actions">
        <button class="row-icon-btn" data-action="goal-add" data-id="${goal.id}" title="Add money">${iconPlus()}</button>
        ${state.saved>0?`<button class="row-icon-btn" data-action="goal-withdraw" data-id="${goal.id}" title="Use or release money">${iconMinus()}</button>`:''}
        <button class="row-icon-btn" data-action="goal-history" data-id="${goal.id}" title="View activity">${iconLayers()}</button>
        <button class="row-icon-btn" data-action="goal-pause" data-id="${goal.id}" title="${goal.status==='paused'?'Resume':'Pause'}">${goal.status==='paused'?iconPlay():iconPause()}</button>
        <button class="row-icon-btn" data-action="goal-edit" data-id="${goal.id}" title="Edit">${iconEdit()}</button>
        <button class="row-icon-btn" data-action="goal-delete" data-id="${goal.id}" title="Delete">${iconTrash()}</button>
      </td>
    </tr>`;
  }).join('')}</tbody></table></div>
  <p style="font-size:10.5px;color:var(--ink-faint);margin:10px 2px 0;">Earmarked amounts are allocations within your existing cash. They reduce Available to spend but do not create transactions or change net worth.</p>`;
  host.querySelectorAll('[data-action="goal-add"]').forEach(b=>b.onclick=()=>openGoalFundingModal(b.dataset.id,'add'));
  host.querySelectorAll('[data-action="goal-withdraw"]').forEach(b=>b.onclick=()=>openGoalFundingModal(b.dataset.id,'withdraw'));
  host.querySelectorAll('[data-action="goal-history"]').forEach(b=>b.onclick=()=>openGoalActivityModal(b.dataset.id));
  host.querySelectorAll('[data-action="goal-pause"]').forEach(b=>b.onclick=()=>toggleSavingsGoal(b.dataset.id));
  host.querySelectorAll('[data-action="goal-edit"]').forEach(b=>b.onclick=()=>openSavingsGoalModal(b.dataset.id));
  host.querySelectorAll('[data-action="goal-delete"]').forEach(b=>b.onclick=()=>confirmDeleteSavingsGoal(b.dataset.id));
}
function iconMinus(){return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="5" y1="12" x2="19" y2="12"/></svg>`;}
function openSavingsGoalModal(id){
  const existing=id?(DB.savingsGoals||[]).find(g=>g.id===id):null;
  const goal=existing||{name:'',type:'goal',targetAmount:0,targetDate:'',account:'Savings',priority:'medium',notes:''};
  openModal(`<div class="modal-head"><h3>${existing?'Edit':'Add'} ${existing?(goal.type==='sinking_fund'?'sinking fund':'savings goal'):'goal'}</h3></div><div class="modal-body">
    <div class="form-grid">
      <div class="field span2"><label>Type</label><div class="seg" id="goal-type"><button type="button" data-type="goal" class="${goal.type==='goal'?'active':''}">Savings goal</button><button type="button" data-type="sinking_fund" class="${goal.type==='sinking_fund'?'active':''}">Sinking fund</button></div><div style="font-size:10.5px;color:var(--ink-faint);margin-top:5px;">Goals build toward broader savings; sinking funds prepare for a known future cost.</div></div>
      <div class="field span2"><label>Name</label><input id="goal-name" type="text" value="${escAttr(goal.name)}" placeholder="e.g. Emergency fund"></div>
      <div class="field"><label>Target amount (£)</label><input id="goal-target" type="number" min="0" step="0.01" value="${goal.targetAmount?Number(goal.targetAmount).toFixed(2):''}"></div>
      <div class="field"><label>Target date (optional)</label><input id="goal-date" type="date" value="${goal.targetDate||''}"></div>
      ${existing?'':`<div class="field"><label>Already earmarked (£)</label><input id="goal-opening" type="number" min="0" step="0.01" value="0.00"></div>`}
      <div class="field"><label>Held in account (optional)</label><input id="goal-account" type="text" list="goal-account-list" value="${escAttr(goal.account||'')}"><datalist id="goal-account-list">${activeAccountNames().map(a=>`<option value="${escAttr(a)}">`).join('')}</datalist></div>
      <div class="field"><label>Priority</label><select id="goal-priority"><option value="high" ${goal.priority==='high'?'selected':''}>High</option><option value="medium" ${goal.priority==='medium'?'selected':''}>Medium</option><option value="low" ${goal.priority==='low'?'selected':''}>Low</option></select></div>
      <div class="field span2"><label>Notes (optional)</label><textarea id="goal-notes">${escHTML(goal.notes||'')}</textarea></div>
    </div></div><div class="modal-foot"><button class="btn" id="m-cancel">Cancel</button><button class="btn btn-primary" id="m-save">${existing?'Save changes':'Create goal'}</button></div>`,{wide:true});
  let type=goal.type;
  document.getElementById('goal-type').onclick=e=>{const b=e.target.closest('button');if(!b)return;type=b.dataset.type;document.querySelectorAll('#goal-type button').forEach(x=>x.classList.toggle('active',x===b));};
  document.getElementById('m-cancel').onclick=closeModal;
  document.getElementById('m-save').onclick=()=>{
    const name=document.getElementById('goal-name').value.trim(),targetAmount=Number(document.getElementById('goal-target').value),targetDate=document.getElementById('goal-date').value;
    const account=document.getElementById('goal-account').value.trim(),priority=document.getElementById('goal-priority').value,notes=document.getElementById('goal-notes').value.trim();
    const opening=existing?0:Number(document.getElementById('goal-opening').value||0);
    if(!name||!Number.isFinite(targetAmount)||targetAmount<=0){toast('Enter a name and positive target amount','error');return;}
    if(!existing&&targetDate&&targetDate<todayISO()){toast('Choose today or a future target date','error');return;}
    if(!Number.isFinite(opening)||opening<0){toast('Already earmarked must be zero or more','error');return;}
    if(account)ensureAccountRecord(account);
    const values={name,type,targetAmount,targetDate,account,priority,notes};
    if(existing)Object.assign(existing,values);else{
      const activity=opening>0?[{id:uid('ga'),date:todayISO(),amount:opening,notes:'Opening allocation'}]:[];
      DB.savingsGoals.push(Object.assign({id:uid('goal'),status:'active',createdAt:new Date().toISOString(),activity},values));
    }
    scheduleSave();closeModal();renderContent();toast(existing?'Goal updated':'Savings goal created');
  };
}
function openGoalFundingModal(id,direction){
  const goal=DB.savingsGoals.find(g=>g.id===id);if(!goal)return;
  const withdrawing=direction==='withdraw',balance=savingsGoalBalance(goal);
  openModal(`<div class="modal-head"><h3>${withdrawing?'Use or release':'Add'} money</h3></div><div class="modal-body"><p style="margin:0 0 14px;color:var(--ink-soft);font-size:13px;">${escHTML(goal.name)} currently has ${gbp(balance)} earmarked. This changes its allocation only; it does not add a bank transaction.</p><div class="form-grid">
    <div class="field"><label>Date</label><input id="goal-fund-date" type="date" value="${todayISO()}"></div><div class="field"><label>Amount (£)</label><input id="goal-fund-amount" type="number" min="0" ${withdrawing?`max="${balance}"`:''} step="0.01" placeholder="0.00"></div>
    <div class="field span2"><label>Note (optional)</label><input id="goal-fund-note" type="text" placeholder="${withdrawing?'e.g. Paid annual insurance':'e.g. Monthly contribution'}"></div>
  </div></div><div class="modal-foot"><button class="btn" id="m-cancel">Cancel</button><button class="btn btn-primary" id="m-confirm">${withdrawing?'Release money':'Add money'}</button></div>`);
  document.getElementById('m-cancel').onclick=closeModal;document.getElementById('m-confirm').onclick=()=>{
    const date=document.getElementById('goal-fund-date').value,amount=Number(document.getElementById('goal-fund-amount').value),notes=document.getElementById('goal-fund-note').value.trim();
    if(!validISODate(date)||!Number.isFinite(amount)||amount<=0){toast('Enter a valid date and positive amount','error');return;}
    if(withdrawing&&amount>balance){toast('You cannot release more than is earmarked','error');return;}
    goal.activity.push({id:uid('ga'),date,amount:withdrawing?-amount:amount,notes});
    scheduleSave();closeModal();renderContent();toast(withdrawing?'Money released from goal':'Money added to goal');
  };
}
function openGoalActivityModal(id){
  const goal=DB.savingsGoals.find(g=>g.id===id);if(!goal)return;
  const activity=[...(goal.activity||[])].sort((a,b)=>b.date.localeCompare(a.date));
  openModal(`<div class="modal-head"><h3>${escHTML(goal.name)} activity</h3></div><div class="modal-body">${activity.length?`<div class="table-wrap"><table><thead><tr><th>Date</th><th>Note</th><th style="text-align:right;">Change</th></tr></thead><tbody>${activity.map(entry=>`<tr><td>${ukDate(entry.date)}</td><td class="desc">${escHTML(entry.notes||'Allocation change')}</td><td class="amt num" style="color:${entry.amount>0?'var(--income)':'var(--expense)'}">${gbp(entry.amount,{signed:true})}</td></tr>`).join('')}</tbody></table></div>`:`<div class="empty-state" style="padding:24px 10px;"><h4>No activity yet</h4><p style="font-size:12.5px;">Add money to begin funding this goal.</p></div>`}<div class="qc-line qc-total" style="margin-top:12px;"><span>Currently earmarked</span><span class="num">${gbp(savingsGoalBalance(goal))}</span></div></div><div class="modal-foot"><button class="btn btn-primary" id="m-close">Close</button></div>`,{wide:true});
  document.getElementById('m-close').onclick=closeModal;
}
function toggleSavingsGoal(id){const goal=DB.savingsGoals.find(g=>g.id===id);if(!goal)return;goal.status=goal.status==='paused'?'active':'paused';scheduleSave();renderContent();toast(goal.status==='active'?'Goal resumed':'Goal paused');}
function confirmDeleteSavingsGoal(id){
  const goal=DB.savingsGoals.find(g=>g.id===id);if(!goal)return;const balance=savingsGoalBalance(goal);
  openModal(`<div class="modal-head"><h3>Delete this goal?</h3></div><div class="modal-body"><p style="margin:0;color:var(--ink-soft);font-size:13px;">${escHTML(goal.name)} and its activity history will be removed. ${balance?`${gbp(balance)} will stop being earmarked and return to Available to spend.`:'No money is currently earmarked.'}</p></div><div class="modal-foot"><button class="btn" id="m-cancel">Cancel</button><button class="btn btn-danger" id="m-confirm">Delete goal</button></div>`);
  document.getElementById('m-cancel').onclick=closeModal;document.getElementById('m-confirm').onclick=()=>{DB.savingsGoals=DB.savingsGoals.filter(g=>g.id!==id);scheduleSave();closeModal();renderContent();toast('Goal deleted');};
}

function renderWishlist(n){
  const host = document.getElementById('wishlist-body');
  if(!DB.wishlist.length){
    host.innerHTML = `<div class="empty-state" style="padding:30px 10px;"><h4>Nothing on your wishlist yet</h4><p style="font-size:12.5px;">Add a purchase you're considering to see how it stacks up against what you can spend.</p></div>`;
    return;
  }
  let running = 0;
  const rows = DB.wishlist.map((w,i)=>{
    running += w.amount;
    const after = n.availableBeforeWishlist - running;
    return `<tr>
      <td>${i+1}</td>
      <td class="desc">${escHTML(w.name)}</td>
      <td>${w.targetDate ? ukDateShort(w.targetDate) : '<span style="color:var(--ink-faint);">—</span>'}</td>
      <td class="amt num">${gbp(w.amount)}</td>
      <td class="amt num" style="color:${after>=0?'var(--ink)':'var(--expense)'}">${gbp(after)}</td>
      <td class="row-actions">
        <button class="row-icon-btn" data-action="wish-up" data-id="${w.id}" title="Move up" ${i===0?'disabled':''}>${iconChevronUp()}</button>
        <button class="row-icon-btn" data-action="wish-down" data-id="${w.id}" title="Move down" ${i===DB.wishlist.length-1?'disabled':''}>${iconChevronDown()}</button>
        <button class="row-icon-btn" data-action="wish-buy" data-id="${w.id}" title="Mark as bought — logs it as a transaction">${iconCheck()}</button>
        <button class="row-icon-btn" data-action="wish-edit" data-id="${w.id}" title="Edit">${iconEdit()}</button>
        <button class="row-icon-btn" data-action="wish-delete" data-id="${w.id}" title="Remove">${iconTrash()}</button>
      </td>
    </tr>`;
  }).join('');
  host.innerHTML = `<div class="table-wrap"><table><thead><tr>
      <th>#</th><th>Purchase</th><th>Target date</th><th style="text-align:right;">Amount</th><th style="text-align:right;">Left after</th><th></th>
    </tr></thead><tbody>${rows}</tbody></table></div>`;

  host.querySelectorAll('[data-action="wish-up"]').forEach(b=> b.onclick = ()=> moveWish(b.dataset.id,-1));
  host.querySelectorAll('[data-action="wish-down"]').forEach(b=> b.onclick = ()=> moveWish(b.dataset.id,1));
  host.querySelectorAll('[data-action="wish-buy"]').forEach(b=> b.onclick = ()=> buyWish(b.dataset.id));
  host.querySelectorAll('[data-action="wish-edit"]').forEach(b=> b.onclick = ()=> openWishModal(b.dataset.id));
  host.querySelectorAll('[data-action="wish-delete"]').forEach(b=> b.onclick = ()=> deleteWish(b.dataset.id));
}
function iconChevronUp(){ return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="18 15 12 9 6 15"/></svg>`; }
function iconChevronDown(){ return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"/></svg>`; }
function iconCheck(){ return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>`; }

function moveWish(id, dir){
  const i = DB.wishlist.findIndex(w=>w.id===id);
  const j = i+dir;
  if(i<0 || j<0 || j>=DB.wishlist.length) return;
  [DB.wishlist[i], DB.wishlist[j]] = [DB.wishlist[j], DB.wishlist[i]];
  scheduleSave(); renderPlan(document.getElementById('content'));
}
function deleteWish(id){
  const w = DB.wishlist.find(x=>x.id===id);
  if(!w) return;
  openModal(`
    <div class="modal-head"><h3>Remove from wishlist?</h3></div>
    <div class="modal-body"><p style="margin:0;color:var(--ink-soft);font-size:13px;">${escHTML(w.name)} — ${gbp(w.amount)}</p></div>
    <div class="modal-foot"><button class="btn" id="m-cancel">Cancel</button><button class="btn btn-danger" id="m-confirm">Remove</button></div>
  `);
  document.getElementById('m-cancel').onclick = closeModal;
  document.getElementById('m-confirm').onclick = ()=>{
    DB.wishlist = DB.wishlist.filter(x=>x.id!==id);
    scheduleSave(); closeModal(); renderPlan(document.getElementById('content')); toast('Removed from wishlist');
  };
}
function buyWish(id){
  const w = DB.wishlist.find(x=>x.id===id);
  if(!w) return;
  openModal(`
    <div class="modal-head"><h3>Mark as bought</h3></div>
    <div class="modal-body">
      <p style="margin:0 0 14px;color:var(--ink-soft);font-size:13px;">This logs it as an expense transaction today and removes it from your wishlist.</p>
      <div class="form-grid">
        <div class="field span2"><label>Description</label><input type="text" id="buy-desc" value="${escAttr(w.name)}"></div>
        <div class="field"><label>Amount (£)</label><input type="number" id="buy-amount" min="0" step="0.01" value="${w.amount.toFixed(2)}"></div>
        <div class="field"><label>Category</label><select id="buy-category">${categoryOptionsHTML('', {includeUncategorized:true})}</select></div>
      </div>
    </div>
    <div class="modal-foot"><button class="btn" id="m-cancel">Cancel</button><button class="btn btn-primary" id="m-confirm">Log purchase</button></div>
  `);
  document.getElementById('m-cancel').onclick = closeModal;
  document.getElementById('m-confirm').onclick = ()=>{
    const desc = document.getElementById('buy-desc').value.trim() || w.name;
    const amt = parseFloat(document.getElementById('buy-amount').value);
    const cat = document.getElementById('buy-category').value;
    if(isNaN(amt) || amt<=0){ toast('Enter a valid amount', 'error'); return; }
    DB.transactions.push({id:uid('tx'), date:todayISO(), description:desc, amount:-Math.abs(amt), category:cat, account:'', notes:'Bought from wishlist', source:'manual'});
    DB.wishlist = DB.wishlist.filter(x=>x.id!==id);
    scheduleSave(); closeModal(); renderContent();
    toast('Logged as a transaction and removed from wishlist');
  };
}
function openWishModal(id, prefillAmount){
  const w = id ? DB.wishlist.find(x=>x.id===id) : null;
  openModal(`
    <div class="modal-head"><h3>${w?'Edit wishlist item':'Add to wishlist'}</h3></div>
    <div class="modal-body">
      <div class="form-grid">
        <div class="field span2"><label>What is it?</label><input type="text" id="w-name" value="${w?escAttr(w.name):''}" placeholder="e.g. New laptop"></div>
        <div class="field"><label>Amount (£)</label><input type="number" id="w-amount" min="0" step="0.01" value="${w?w.amount.toFixed(2):(prefillAmount?prefillAmount.toFixed(2):'')}"></div>
        <div class="field"><label>Target date (optional)</label><input type="date" id="w-date" value="${w?(w.targetDate||''):''}"></div>
      </div>
    </div>
    <div class="modal-foot"><button class="btn" id="m-cancel">Cancel</button><button class="btn btn-primary" id="m-save">${w?'Save changes':'Add to wishlist'}</button></div>
  `);
  document.getElementById('m-cancel').onclick = closeModal;
  document.getElementById('m-save').onclick = ()=>{
    const name = document.getElementById('w-name').value.trim();
    const amount = parseFloat(document.getElementById('w-amount').value);
    const targetDate = document.getElementById('w-date').value;
    if(!name || isNaN(amount) || amount<=0){ toast('Enter a name and a positive amount', 'error'); return; }
    if(w){
      Object.assign(w, {name, amount, targetDate});
    } else {
      DB.wishlist.push({id:uid('wish'), name, amount, targetDate, createdAt:todayISO()});
    }
    scheduleSave(); closeModal(); renderContent();
    toast(w?'Wishlist item updated':'Added to wishlist');
  };
}

