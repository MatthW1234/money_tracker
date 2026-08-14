/* =========================================================
   DASHBOARD
   ========================================================= */
function renderDashboard(c){
  const range = periodRange(UI.dashboardPeriod);
  const list = txInRange(range.from, range.to);
  const income = sumIncome(list), expense = sumExpense(list), net = income-expense;
  const balance = currentBalance();

  const budgetEntries = Object.entries(DB.budgets);
  const showBudgets = UI.dashboardPeriod==='month' && budgetEntries.length>0;

  const savingsOpps = UI.dashboardPeriod==='month' ? computeSavingsOpportunities(list, range).filter(o=> o.diff > 1) : [];
  const showSavingsOpps = UI.dashboardPeriod==='month' && savingsOpps.length>0;

  const accountRows = perAccountBalances();
  const merchants = topMerchants(list, 8);

  const prevRange = previousPeriodRange(UI.dashboardPeriod);
  const showCompare = !!prevRange;
  let prevList = [], prevIncome=0, prevExpense=0;
  if(showCompare){
    prevList = txInRange(prevRange.from, prevRange.to);
    prevIncome = sumIncome(prevList);
    prevExpense = sumExpense(prevList);
  }

  const offset = UI.dashboardPeriod==='month' ? UI.dashboardMonthOffset : (UI.dashboardPeriod==='year' ? UI.dashboardYearOffset : 0);
  const canNav = UI.dashboardPeriod==='month' || UI.dashboardPeriod==='year';

  c.innerHTML = `
    <div class="panel-head" style="margin-bottom:14px;">
      <div class="seg" id="period-seg">
        <button data-p="month" class="${UI.dashboardPeriod==='month'?'active':''}">This month</button>
        <button data-p="year" class="${UI.dashboardPeriod==='year'?'active':''}">This year</button>
        <button data-p="all" class="${UI.dashboardPeriod==='all'?'active':''}">All time</button>
      </div>
      <div style="display:flex; align-items:center; gap:6px;">
        ${canNav ? `<button class="btn btn-ghost btn-sm" id="period-prev" title="Previous ${UI.dashboardPeriod}" style="padding:6px 9px;">${iconChevronLeft()}</button>` : ''}
        <div class="page-sub" style="margin:0; min-width:110px; text-align:center;">${range.label}</div>
        ${canNav ? `<button class="btn btn-ghost btn-sm" id="period-next" title="Next ${UI.dashboardPeriod}" style="padding:6px 9px;" ${offset>=0?'disabled':''}>${iconChevronRight()}</button>` : ''}
        ${canNav && offset!==0 ? `<button class="btn btn-ghost btn-sm" id="period-today">Today</button>` : ''}
      </div>
    </div>

    <div class="kpi-row">
      <div class="kpi-card income"><div class="stripe"></div><div class="kpi-lbl">Income</div><div class="kpi-val income num">${gbp(income)}</div><div class="kpi-sub">${list.filter(t=>t.amount>0 && countsTowardTotals(t)).length} transactions</div></div>
      <div class="kpi-card expense"><div class="stripe"></div><div class="kpi-lbl">Expenses</div><div class="kpi-val expense num">${gbp(expense)}</div><div class="kpi-sub">${list.filter(t=>t.amount<0 && countsTowardTotals(t)).length} transactions</div></div>
      <div class="kpi-card net"><div class="stripe"></div><div class="kpi-lbl">Net</div><div class="kpi-val num" style="color:${net>=0?'var(--brand)':'var(--expense)'}">${net>=0?'+':''}${gbp(net)}</div><div class="kpi-sub">Income minus expenses</div></div>
      <div class="kpi-card balance"><div class="stripe"></div><div class="kpi-lbl">Available cash</div><div class="kpi-val num" style="color:var(--gold)">${gbp(balance)}</div><div class="kpi-sub">Current, savings and cash balances less card debt</div></div>
    </div>

    ${accountRows.length ? `
    <div class="panel">
      <div class="panel-head"><div class="panel-title">Accounts<small>Assets and liabilities use their account type when balances are interpreted</small></div></div>
      <div class="account-grid">
        ${accountRows.map(a=> `
          <div class="account-card ${a.unassigned?'unassigned':''}">
            <div class="account-name">${escHTML(a.account)}${a.archived?' · archived':''}</div>
            <div style="font-size:9.5px;color:var(--ink-faint);text-transform:uppercase;letter-spacing:.05em;margin-top:2px;">${escHTML(accountTypeConfig(a.type).label)}</div>
            <div class="account-balance num" style="color:${isLiabilityType(a.type)?'var(--expense)':'var(--gold)'}">${isLiabilityType(a.type)&&a.balance<0?`${gbp(Math.abs(a.balance))} owed`:gbp(a.balance)}</div>
            <div class="account-sub">${a.count} transaction${a.count===1?'':'s'}${a.type==='credit_card'&&a.record&&a.record.creditLimit?` · ${Math.round(Math.max(0,-a.balance)/a.record.creditLimit*100)}% utilised`:''}</div>
          </div>
        `).join('')}
      </div>
    </div>` : ''}

    <div class="panel">
      <div class="panel-head">
        <div class="panel-title">Balance over time<small>Your actual balance trajectory, not just flow in vs out</small></div>
        <div style="display:flex;align-items:center;gap:10px;">
          <label class="regular-toggle" style="font-size:11.5px;">
            <input type="checkbox" id="balance-forecast-toggle" ${UI.showForecast?'checked':''}> Show forecast
          </label>
          <div class="seg" id="balance-seg">
            <button data-g="week" class="${UI.balanceGran==='week'?'active':''}">Weekly</button>
            <button data-g="month" class="${UI.balanceGran==='month'?'active':''}">Monthly</button>
            <button data-g="year" class="${UI.balanceGran==='year'?'active':''}">Yearly</button>
          </div>
        </div>
      </div>
      <div class="chart-wrap"><canvas id="balance-chart"></canvas></div>
      ${UI.showForecast ? `<p style="font-size:11px;color:var(--ink-faint);margin:10px 2px 0;">Dashed line is a rough projection based on your average net flow over the last 3 periods — not a guarantee, and it won't know about one-off bills or changes ahead.</p>` : ''}
    </div>

    <div class="panel" style="margin-top:16px;">
      <div class="panel-head"><div class="panel-title">Cash flow<small>${range.label} · where income actually went</small></div></div>
      <div style="position:relative;height:440px;"><div id="cashflow-sankey" style="width:100%;height:100%;"></div></div>
      <div id="cashflow-warning"></div>
    </div>

    <div class="grid-2" style="margin-top:16px;">
      <div class="panel">
        <div class="panel-head">
          <div class="panel-title">Trend<small>Income vs expenses over time</small></div>
          <div class="seg" id="trend-seg">
            <button data-g="week" class="${UI.trendGran==='week'?'active':''}">Weekly</button>
            <button data-g="month" class="${UI.trendGran==='month'?'active':''}">Monthly</button>
            <button data-g="year" class="${UI.trendGran==='year'?'active':''}">Yearly</button>
          </div>
        </div>
        <div class="chart-wrap"><canvas id="trend-chart"></canvas></div>
      </div>
      <div class="panel">
        <div class="panel-head"><div class="panel-title">Spending by category<small>${range.label}</small></div></div>
        <div class="chart-wrap donut"><canvas id="cat-chart"></canvas></div>
        <div class="legend-list" id="cat-legend"></div>
      </div>
    </div>

    <div class="panel" style="margin-top:16px;">
      <div class="panel-head"><div class="panel-title">Top merchants<small>${range.label} · who you spent the most with, not just which category</small></div></div>
      <div id="merchants-list"></div>
    </div>

    <div class="grid-2" style="margin-top:16px;">
      <div class="panel">
        <div class="panel-head"><div class="panel-title">Year to date<small>1 Jan – today, spending by category</small></div></div>
        <div class="chart-wrap donut"><canvas id="ytd-chart"></canvas></div>
        <div class="legend-list" id="ytd-legend"></div>
      </div>
      <div class="panel">
        <div class="panel-head"><div class="panel-title">Biggest movers<small>${range.label}</small></div></div>
        <div class="movers-grid">
          <div>
            <div class="movers-col-title income">Top income</div>
            <div id="movers-income"></div>
          </div>
          <div>
            <div class="movers-col-title expense">Top outgoings</div>
            <div id="movers-expense"></div>
          </div>
        </div>
      </div>
    </div>

    ${showBudgets ? `
    <div class="panel" style="margin-top:16px;">
      <div class="panel-head"><div class="panel-title">Budgets<small>${range.label}</small></div><button class="btn btn-sm" id="btn-pending-charge">Credit cards</button></div>
      <div id="budget-list"></div>
    </div>` : ''}

    ${showSavingsOpps ? `
    <div class="panel" style="margin-top:16px;">
      <div class="panel-head"><div class="panel-title">Savings opportunities<small>Discretionary categories running above your usual — ${range.label}</small></div></div>
      <div id="savings-opps-list"></div>
    </div>` : ''}

    ${showCompare ? `
    <div class="panel" style="margin-top:16px;">
      <div class="panel-head"><div class="panel-title">Compare to ${escHTML(prevRange.label)}<small>How this period stacks up against the one before it</small></div></div>
      <div class="compare-stats">
        ${compareStatHTML('Income', income, prevIncome, true)}
        ${compareStatHTML('Expenses', expense, prevExpense, false)}
        ${compareStatHTML('Net', net, prevIncome-prevExpense, true)}
      </div>
      <div id="compare-table"></div>
    </div>` : ''}

    <div class="panel" style="margin-top:16px;">
      <div class="panel-head"><div class="panel-title">Recent activity</div><button class="btn btn-sm btn-ghost" id="view-all-tx">View all →</button></div>
      <div class="table-wrap"><table><thead><tr><th>Date</th><th>Description</th><th>Category</th><th style="text-align:right;">Amount</th></tr></thead><tbody id="recent-body"></tbody></table></div>
    </div>
  `;

  document.getElementById('period-seg').addEventListener('click', e=>{
    const b = e.target.closest('button'); if(!b) return;
    UI.dashboardPeriod = b.dataset.p;
    UI.dashboardMonthOffset = 0;
    UI.dashboardYearOffset = 0;
    renderDashboard(c);
  });
  const prevBtn = document.getElementById('period-prev');
  const nextBtn = document.getElementById('period-next');
  const todayBtn = document.getElementById('period-today');
  if(prevBtn) prevBtn.onclick = ()=>{
    if(UI.dashboardPeriod==='month') UI.dashboardMonthOffset--;
    else UI.dashboardYearOffset--;
    renderDashboard(c);
  };
  if(nextBtn) nextBtn.onclick = ()=>{
    if(UI.dashboardPeriod==='month') UI.dashboardMonthOffset = Math.min(0, UI.dashboardMonthOffset+1);
    else UI.dashboardYearOffset = Math.min(0, UI.dashboardYearOffset+1);
    renderDashboard(c);
  };
  if(todayBtn) todayBtn.onclick = ()=>{
    UI.dashboardMonthOffset = 0; UI.dashboardYearOffset = 0;
    renderDashboard(c);
  };
  document.getElementById('trend-seg').addEventListener('click', e=>{
    const b = e.target.closest('button'); if(!b) return;
    UI.trendGran = b.dataset.g;
    document.querySelectorAll('#trend-seg button').forEach(x=> x.classList.toggle('active', x===b));
    drawTrendChart();
  });
  document.getElementById('balance-seg').addEventListener('click', e=>{
    const b = e.target.closest('button'); if(!b) return;
    UI.balanceGran = b.dataset.g;
    document.querySelectorAll('#balance-seg button').forEach(x=> x.classList.toggle('active', x===b));
    drawBalanceChart();
  });
  document.getElementById('balance-forecast-toggle').addEventListener('change', e=>{
    UI.showForecast = e.target.checked;
    renderDashboard(c);
  });
  document.getElementById('view-all-tx').onclick = ()=> { document.querySelector('[data-tab="transactions"]').click(); };
  const pendingBtn = document.getElementById('btn-pending-charge');
  if(pendingBtn) pendingBtn.onclick = ()=> openPendingCardsModal();

  const recentBody = document.getElementById('recent-body');
  const recent = [...list].sort((a,b)=> b.date.localeCompare(a.date) || 0).slice(0,8);
  recentBody.innerHTML = recent.length ? recent.map(rowHTML_recent).join('') :
    `<tr class="empty-row"><td colspan="4">No transactions in this period yet.</td></tr>`;

  drawTrendChart();
  drawBalanceChart();
  drawCashFlowChart(list, income);
  drawCategoryChart(list);
  drawYTDChart();
  renderMovers(list);
  renderMerchants(merchants);
  if(showBudgets) renderBudgets(list, budgetEntries, range);
  if(showSavingsOpps) renderSavingsOpportunities(savingsOpps);
  if(showCompare) renderCompareTable(list, prevList);
}
function compareStatHTML(label, current, previous, higherIsGood){
  const delta = current - previous;
  const pct = previous>0.004 ? Math.round(delta/previous*100) : (current>0.004 ? null : 0);
  const good = higherIsGood ? delta>=0 : delta<=0;
  const deltaColor = Math.abs(delta)<0.005 ? 'var(--ink-faint)' : (good ? 'var(--income)' : 'var(--expense)');
  const pctLabel = pct===null ? 'new' : `${delta>=0?'+':''}${pct}%`;
  return `<div class="compare-stat">
    <div class="compare-stat-lbl">${label}</div>
    <div class="compare-stat-val num">${gbp(current)}</div>
    <div class="compare-stat-delta" style="color:${deltaColor}">${delta>=0?'▲':'▼'} ${gbp(Math.abs(delta))} (${pctLabel})</div>
  </div>`;
}
function renderMerchants(merchants){
  const host = document.getElementById('merchants-list');
  if(!host) return;
  if(!merchants.length){
    host.innerHTML = `<div class="empty-state" style="padding:20px 10px;"><p style="font-size:12.5px;">No spending in this period to rank yet.</p></div>`;
    return;
  }
  const max = merchants[0].total;
  host.innerHTML = `<div class="merchant-rows">${merchants.map((m,i)=>`
    <div class="merchant-row">
      <span class="merchant-rank">${i+1}</span>
      <div class="merchant-mid">
        <div class="merchant-top"><span class="merchant-name">${escHTML(m.name)}</span><span class="merchant-amt num">${gbp(m.total)}</span></div>
        <div class="merchant-bar-track"><div class="merchant-bar-fill" style="width:${max? Math.round(m.total/max*100):0}%;"></div></div>
      </div>
      <span class="merchant-count">${m.count}×</span>
      <button class="row-icon-btn" data-action="merge-merchant" data-name="${escAttr(m.name)}" data-rawkeys="${escAttr(JSON.stringify(m.rawKeys))}" title="Rename or merge with another merchant">${iconEdit()}</button>
    </div>
  `).join('')}</div>`;
  host.querySelectorAll('[data-action="merge-merchant"]').forEach(b=>{
    b.onclick = ()=> openMerchantMergeModal(b.dataset.name, JSON.parse(b.dataset.rawkeys));
  });
}
function openMerchantMergeModal(currentName, rawKeys){
  const suggestions = allKnownMerchantNames().filter(n=> n!==currentName);
  openModal(`
    <div class="modal-head"><h3>Rename or merge merchant</h3></div>
    <div class="modal-body">
      <p style="margin:0 0 12px;color:var(--ink-soft);font-size:12.5px;">
        Currently grouped from: <strong>${escHTML(rawKeys.join(', '))}</strong>
      </p>
      <div class="field">
        <label>Show this as</label>
        <input type="text" id="mm-name" value="${escAttr(currentName)}" list="mm-suggestions">
        <datalist id="mm-suggestions">${suggestions.map(n=>`<option value="${escAttr(n)}">`).join('')}</datalist>
      </div>
      <p style="margin:10px 0 0;color:var(--ink-faint);font-size:11.5px;">Type an existing merchant name (pick from the list) to merge into it, or a new name to just relabel this one.</p>
    </div>
    <div class="modal-foot"><button class="btn" id="m-cancel">Cancel</button><button class="btn btn-primary" id="m-save">Save</button></div>
  `);
  document.getElementById('m-cancel').onclick = closeModal;
  document.getElementById('m-save').onclick = ()=>{
    const newName = document.getElementById('mm-name').value.trim();
    if(!newName){ toast('Enter a name', 'error'); return; }
    rawKeys.forEach(rk=>{
      if(newName===rk) delete DB.merchantAliases[rk];
      else DB.merchantAliases[rk] = newName;
    });
    scheduleSave(); closeModal(); renderContent();
    toast(`Grouped under "${newName}"`);
  };
}
// A "pending card" is a running total, not a log of individual purchases —
// you check your credit card app and enter the current total it shows,
// which replaces whatever was there before (it does NOT add up entry by
// entry). That matches how a card's own app already presents it, and means
// updating is a single quick number entry rather than itemising every
// purchase. Cards live in their own list, never in DB.transactions, so
// nothing that touches balance, income, expense totals, investments, or any
// chart can ever see them — only the budget bars (which explicitly opt in)
// do. They only apply to the month you're actually in right now, not one
// you've navigated back to, since a "current total" only means something
// for a cycle that's still open. Once the real card payment is imported,
// set the card back to £0 (or delete it) so the next cycle starts clean.
function renderBudgets(list, budgetEntries, range){
  const host = document.getElementById('budget-list');
  if(!host) return;
  const expandedList = expandSplits(list);
  const pace = range ? monthPaceInfo(range) : null;
  const isLiveMonth = UI.dashboardMonthOffset===0;
  const rows = budgetEntries.map(([catName, limit])=>{
    const spent = expandedList.filter(t=> t.category===catName && t.amount<0 && countsTowardTotals(t)).reduce((s,t)=> s+Math.abs(t.amount), 0);
    const pending = pendingForCategory(catName, isLiveMonth);
    const combined = spent + pending;
    const pct = limit>0 ? Math.min(999, Math.round(combined/limit*100)) : 0;
    const spentPct = limit>0 ? Math.min(100, spent/limit*100) : 0;
    const pendingPct = limit>0 ? Math.max(0, Math.min(100-spentPct, pending/limit*100)) : 0;
    const color = pct>=100 ? 'var(--expense)' : (pct>=80 ? 'var(--gold)' : 'var(--income)');
    let paceHTML = '';
    if(pace && pct<100){
      const paceDiff = pct - pace.pacePct;
      let paceLabel, paceColor;
      if(paceDiff > 15){ paceLabel = `running ${Math.round(paceDiff)}pts ahead of pace`; paceColor = 'var(--expense)'; }
      else if(paceDiff < -15){ paceLabel = 'well under pace'; paceColor = 'var(--income)'; }
      else { paceLabel = 'on pace'; paceColor = 'var(--ink-faint)'; }
      paceHTML = `<span style="color:${paceColor};"> · ${paceLabel}</span>`;
    }
    const paceMarker = pace ? `<div style="position:absolute;left:${Math.min(100,pace.pacePct)}%;top:0;bottom:0;width:2px;background:var(--ink);opacity:.45;" title="${Math.round(pace.pacePct)}% of the month has passed (day ${pace.elapsedDays} of ${pace.totalDays})"></div>` : '';
    const pendingSegment = pendingPct>0.5 ? `<div style="position:absolute;left:${spentPct}%;top:0;bottom:0;width:${pendingPct}%;background:repeating-linear-gradient(45deg, ${color}, ${color} 3px, transparent 3px, transparent 6px);opacity:.65;" title="${gbp(pending)} pending on card — not counted in your balance yet"></div>` : '';
    return `<div class="budget-row">
      <div class="budget-row-top">
        <span class="budget-name">${escHTML(catName)}</span>
        <span class="budget-figures num">${gbp(spent)}${pending>0.005?` <span style="color:var(--ink-faint);">+ ${gbp(pending)} on card</span>`:''} <span style="color:var(--ink-faint);">/ ${gbp(limit)}</span></span>
      </div>
      <div class="budget-bar-track" style="position:relative;">
        <div class="budget-bar-fill" style="width:${spentPct}%; background:${color};"></div>
        ${pendingSegment}
        ${paceMarker}
      </div>
      <div class="budget-pct" style="color:${color};">${pct}% ${pct>=100?'over budget':'used'}${paceHTML}</div>
    </div>`;
  }).join('');
  host.innerHTML = `<div class="budget-grid">${rows}</div>${pace ? `<p style="font-size:11px;color:var(--ink-faint);margin:10px 2px 0;">The dark marker on each bar shows where you'd be if spending were spread evenly across the month — you're ${Math.round(pace.pacePct)}% through it (day ${pace.elapsedDays} of ${pace.totalDays}). Striped segments are your cards' current pending totals, not yet in your balance.</p>` : ''}`;
}
function openPendingCardsModal(){
  function render(){
    const catOpts = DB.categories.filter(c=>c.kind==='expense').map(c=>`<option value="${escAttr(c.name)}">${escHTML(c.name)}</option>`).join('');
    openModal(`
      <div class="modal-head"><h3>Credit cards</h3></div>
      <div class="modal-body">
        <p style="font-size:12.5px;color:var(--ink-soft);margin:0 0 14px;">For a card tracked in a different app. Enter the current total it shows you've spent this cycle — each update <strong>replaces</strong> the previous figure, it doesn't add to it. This counts toward the matching budget right away, but never touches your balance or income/spending totals. Once the real card payment is imported here, set the card back to £0 (or delete it) to start the next cycle clean.</p>
        <div id="pc-list" style="display:flex;flex-direction:column;gap:10px;margin-bottom:16px;"></div>
        <div style="border-top:1px solid var(--line);padding-top:14px;">
          <div style="font-size:11.5px;font-weight:600;color:var(--ink-soft);margin-bottom:8px;">Add a card</div>
          <div class="form-grid">
            <div class="field span2"><label>Card name</label><input type="text" id="pc-name" placeholder="e.g. Amex Gold"></div>
            <div class="field"><label>Category</label><select id="pc-cat">${catOpts}</select></div>
            <div class="field"><label>Current total (£)</label><input type="number" id="pc-amount" min="0" step="0.01" placeholder="0.00"></div>
          </div>
          <button class="btn btn-primary btn-sm" id="pc-add" style="margin-top:6px;">Add card</button>
        </div>
      </div>
      <div class="modal-foot"><button class="btn" id="m-cancel">Close</button></div>
    `, {wide:true});
    document.getElementById('m-cancel').onclick = closeModal;
    document.getElementById('pc-add').onclick = ()=>{
      const name = document.getElementById('pc-name').value.trim();
      const amount = parseFloat(document.getElementById('pc-amount').value) || 0;
      const category = document.getElementById('pc-cat').value;
      if(!name){ toast('Give the card a name', 'error'); return; }
      DB.pendingCards.push({id:uid('card'), name, category, amount, updatedAt:new Date().toISOString()});
      scheduleSave();
      document.getElementById('pc-name').value = '';
      document.getElementById('pc-amount').value = '';
      renderList();
      renderContent();
      toast(`${name} added`);
    };
    renderList();
  }
  function renderList(){
    const host = document.getElementById('pc-list');
    if(!host) return;
    if(!DB.pendingCards.length){
      host.innerHTML = `<p style="font-size:12px;color:var(--ink-faint);">No cards yet — add one below.</p>`;
      return;
    }
    host.innerHTML = DB.pendingCards.map(cd=> `
      <div style="border:1px solid var(--line);border-radius:8px;padding:10px 12px;">
        <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:8px;">
          <div>
            <strong style="font-size:13px;">${escHTML(cd.name)}</strong>
            <span class="stamp-mini" style="margin-left:6px;">${escHTML(cd.category)}</span>
          </div>
          <button class="row-icon-btn" data-id="${cd.id}" data-action="del-card" title="Remove card">${iconTrash()}</button>
        </div>
        <div style="display:flex;align-items:center;gap:8px;">
          <span class="num" style="font-size:15px;font-weight:600;min-width:80px;">${gbp(cd.amount)}</span>
          <span style="font-size:11px;color:var(--ink-faint);flex:1;">updated ${timeAgoLabel(cd.updatedAt)}</span>
          <input type="number" min="0" step="0.01" placeholder="new total" data-id="${cd.id}" class="pc-update-input" style="width:100px;">
          <button class="btn btn-sm" data-id="${cd.id}" data-action="update-card">Update</button>
        </div>
      </div>
    `).join('');
    host.querySelectorAll('[data-action="del-card"]').forEach(b=> b.onclick = ()=>{
      const cd = DB.pendingCards.find(c=>c.id===b.dataset.id);
      DB.pendingCards = DB.pendingCards.filter(c=>c.id!==b.dataset.id);
      scheduleSave();
      renderList();
      renderContent();
      toast(cd ? `${cd.name} removed` : 'Card removed');
    });
    host.querySelectorAll('[data-action="update-card"]').forEach(b=> b.onclick = ()=>{
      const input = host.querySelector(`.pc-update-input[data-id="${b.dataset.id}"]`);
      const val = parseFloat(input.value);
      if(isNaN(val) || val<0){ toast('Enter a valid amount', 'error'); return; }
      const cd = DB.pendingCards.find(c=>c.id===b.dataset.id);
      if(!cd) return;
      cd.amount = val;
      cd.updatedAt = new Date().toISOString();
      scheduleSave();
      renderList();
      renderContent();
      toast(`${cd.name} updated to ${gbp(val)}`);
    });
  }
  render();
}
function renderSavingsOpportunities(opps){
  const host = document.getElementById('savings-opps-list');
  if(!host) return;
  const total = opps.reduce((s,o)=> s+o.diff, 0);
  const rows = opps.map(o=>{
    const pct = o.average>0 ? Math.round(o.diff/o.average*100) : null;
    return `<div class="merchant-row">
      <span class="merchant-rank" style="background:var(--expense-wash);color:var(--expense);">↑</span>
      <div class="merchant-mid">
        <div class="merchant-top"><span class="merchant-name">${escHTML(o.category)}</span><span class="merchant-amt num" style="color:var(--expense);">+${gbp(o.diff)}</span></div>
        <div style="font-size:11px;color:var(--ink-faint);">${gbp(o.current)} this period vs your ${gbp(o.average)} average (${o.monthsOfHistory}mo)${pct!=null?` · ${pct}% higher`:''}</div>
      </div>
    </div>`;
  }).join('');
  host.innerHTML = `
    <div style="margin-bottom:12px;padding:10px 14px;background:var(--expense-wash);border-radius:9px;font-size:13px;color:var(--ink);">
      Getting these back to your usual spending could free up roughly <strong>${gbp(total)}</strong> this period.
    </div>
    <div class="merchant-rows">${rows}</div>
  `;
}
function renderCompareTable(list, prevList){
  const host = document.getElementById('compare-table');
  if(!host) return;
  const byCat = {};
  expandSplits(list).forEach(t=>{ if(t.amount<0 && countsTowardTotals(t)){ const k=t.category||'Uncategorised'; byCat[k]=byCat[k]||{cur:0,prev:0}; byCat[k].cur+=Math.abs(t.amount); } });
  expandSplits(prevList).forEach(t=>{ if(t.amount<0 && countsTowardTotals(t)){ const k=t.category||'Uncategorised'; byCat[k]=byCat[k]||{cur:0,prev:0}; byCat[k].prev+=Math.abs(t.amount); } });
  const rows = Object.entries(byCat)
    .map(([name,v])=> ({name, ...v, delta:v.cur-v.prev}))
    .sort((a,b)=> Math.abs(b.delta)-Math.abs(a.delta))
    .slice(0,10);
  if(!rows.length){ host.innerHTML = `<div class="empty-state" style="padding:20px;"><p style="font-size:12.5px;">No expenses in either period to compare yet.</p></div>`; return; }
  host.innerHTML = `<div class="table-wrap"><table><thead><tr>
      <th>Category</th><th style="text-align:right;">This period</th><th style="text-align:right;">Last period</th><th style="text-align:right;">Change</th>
    </tr></thead><tbody>${rows.map(r=>{
      const pct = r.prev>0.004 ? Math.round(r.delta/r.prev*100) : (r.cur>0.004 ? null : 0);
      const pctLabel = pct===null ? 'new' : `${r.delta>=0?'+':''}${pct}%`;
      const color = Math.abs(r.delta)<0.005 ? 'var(--ink-faint)' : (r.delta>0 ? 'var(--expense)' : 'var(--income)');
      return `<tr>
        <td>${escHTML(r.name)}</td>
        <td class="amt num">${gbp(r.cur)}</td>
        <td class="amt num" style="color:var(--ink-faint);">${gbp(r.prev)}</td>
        <td class="amt num" style="color:${color};">${r.delta>=0?'+':''}${gbp(r.delta)} (${pctLabel})</td>
      </tr>`;
    }).join('')}</tbody></table></div>`;
}
function renderMovers(list){
  const income = list.filter(t=>t.amount>0 && countsTowardTotals(t)).sort((a,b)=>b.amount-a.amount).slice(0,5);
  const expense = list.filter(t=>t.amount<0 && countsTowardTotals(t)).sort((a,b)=>a.amount-b.amount).slice(0,5);
  const incomeHost = document.getElementById('movers-income');
  const expenseHost = document.getElementById('movers-expense');
  if(incomeHost) incomeHost.innerHTML = income.length ? income.map(moverRow).join('') :
    `<div class="empty-state" style="padding:16px 0;"><p style="font-size:12px;margin:0;">No income this period.</p></div>`;
  if(expenseHost) expenseHost.innerHTML = expense.length ? expense.map(moverRow).join('') :
    `<div class="empty-state" style="padding:16px 0;"><p style="font-size:12px;margin:0;">No outgoings this period.</p></div>`;
}
function moverRow(t, i){
  return `<div class="movers-row">
    <span class="movers-rank">${i+1}</span>
    <span class="movers-desc" title="${escAttr(t.description)}">${escHTML(t.description)}</span>
    <span class="movers-amt num" style="color:${t.amount>0?'var(--income)':'var(--ink)'}">${gbp(t.amount,{signed:true})}</span>
  </div>`;
}

function rowHTML_recent(t){
  const kind = categoryKind(t.category);
  const stampClass = t.transferId ? 'c-transfer' : (!t.category ? 'c-none' : (kind==='income' ? 'c-income' : 'c-expense'));
  const label = t.transferId ? 'Transfer' : (t.category || 'Uncategorised');
  return `<tr>
    <td>${ukDateShort(t.date)}</td>
    <td class="desc">${escHTML(t.description)}${t.excluded ? ' <span class="stamp-mini" title="Not counted in income/spending totals">excl.</span>' : ''}</td>
    <td><span class="stamp ${stampClass}">${escHTML(label)}</span></td>
    <td class="amt ${t.amount>0?'income':''} num">${gbp(t.amount, {signed:true})}</td>
  </tr>`;
}

function trendBuckets(gran){
  gran = gran || UI.trendGran;
  const now = todayISO();
  const buckets = [];
  if(gran==='week'){
    let start = mondayOf(now);
    for(let i=11;i>=0;i--){
      const from = addDays(start, -7*i);
      const to = addDays(from, 6);
      buckets.push({from, to, label: ukDateShort(from)});
    }
  } else if(gran==='month'){
    for(let i=11;i>=0;i--){
      const from = addMonths(now.slice(0,8)+'01', -i).slice(0,7)+'-01';
      const d = new Date(from+'T00:00:00');
      const to = localISODate(new Date(d.getFullYear(), d.getMonth()+1, 0));
      buckets.push({from, to, label: monthLabel(from.slice(0,7))});
    }
  } else {
    const y = parseInt(now.slice(0,4));
    for(let i=5;i>=0;i--){
      const yr = y-i;
      buckets.push({from:`${yr}-01-01`, to:`${yr}-12-31`, label:String(yr)});
    }
  }
  return buckets;
}

function balanceAt(dateISO){
  const liquidTypes=new Set(['current','savings','cash','credit_card']);
  const names=allAccountNames().filter(name=>liquidTypes.has((accountRecordFor(name)||{}).type||'current'));
  const opening=names.length?names.reduce((sum,name)=>sum+accountOpeningBalance(name),0):((DB.accountRecords||[]).length?0:(Number(DB.startingBalance)||0));
  return opening+DB.transactions.reduce((s,t)=>t.date<=dateISO&&transactionStatus(t)!=='pending'&&(!t.account||names.includes(t.account))?s+t.amount:s,0);
}
function computeForecastBuckets(gran, historicalBuckets, count){
  count = count || 6;
  const last3 = historicalBuckets.slice(-3);
  const nets = last3.map(b=> sumIncome(txInRange(b.from,b.to)) - sumExpense(txInRange(b.from,b.to)));
  const avgNet = nets.length ? nets.reduce((s,v)=>s+v,0)/nets.length : 0;
  let prevTo = historicalBuckets[historicalBuckets.length-1].to;
  let bal = balanceAt(prevTo);
  const out = [];
  for(let i=0;i<count;i++){
    let from, to, label;
    if(gran==='week'){
      from = addDays(prevTo,1); to = addDays(from,6); label = ukDateShort(from);
    } else if(gran==='month'){
      const d = new Date(prevTo+'T00:00:00');
      const nextMonth = new Date(d.getFullYear(), d.getMonth()+1, 1);
      from = localISODate(nextMonth);
      to = localISODate(new Date(nextMonth.getFullYear(), nextMonth.getMonth()+1, 0));
      label = monthLabel(from.slice(0,7));
    } else {
      const y = parseInt(prevTo.slice(0,4))+1;
      from = `${y}-01-01`; to = `${y}-12-31`; label = String(y);
    }
    bal += avgNet;
    out.push({label, balance:bal});
    prevTo = to;
  }
  return out;
}
function drawBalanceChart(){
  const buckets = trendBuckets(UI.balanceGran);
  const data = buckets.map(b=> balanceAt(b.to));
  const ctx = document.getElementById('balance-chart');
  if(!ctx) return;
  if(UI.charts.balance) UI.charts.balance.destroy();
  const datasets = [{
    label: 'Balance', data, tension:.3, fill:true, borderWidth:2.5, pointRadius:2,
    borderColor: cssVar('--brand'), backgroundColor: hexToRgba(cssVar('--brand'), .08),
    segment: {
      borderColor: (c)=> (c.p0.parsed.y<0 || c.p1.parsed.y<0) ? cssVar('--expense') : cssVar('--brand'),
    },
  }];
  let labels = buckets.map(b=>b.label);
  if(UI.showForecast){
    const forecast = computeForecastBuckets(UI.balanceGran, buckets, 6);
    labels = [...labels, ...forecast.map(f=>f.label)];
    const forecastData = [
      ...new Array(buckets.length-1).fill(null),
      data[data.length-1],
      ...forecast.map(f=>f.balance),
    ];
    datasets.push({
      label:'Forecast', data:forecastData, tension:.3, fill:false, borderWidth:2, pointRadius:2,
      borderColor:cssVar('--gold'), borderDash:[6,4],
    });
    datasets[0].data = [...data, ...new Array(forecast.length).fill(null)];
  }
  UI.charts.balance = new Chart(ctx, {
    type: 'line',
    data: { labels, datasets },
    options:{
      responsive:true, maintainAspectRatio:false,
      interaction:{mode:'index', intersect:false},
      plugins:{ legend:{display: UI.showForecast, position:'bottom', labels:{boxWidth:10, usePointStyle:true, font:{family:"'Inter',sans-serif", size:11}, color:chartTickColor()}},
        tooltip:{callbacks:{label:(ctx)=> ctx.parsed.y==null ? undefined : ` ${ctx.dataset.label}: ${gbp(ctx.parsed.y)}`}} },
      scales:{ y:{ ticks:{callback:(v)=>'£'+v.toLocaleString('en-GB'), font:{size:11}, color:chartTickColor()}, grid:{color:chartGridColor()} },
                x:{ grid:{display:false}, ticks:{font:{size:11}, color:chartTickColor()} } }
    }
  });
}
// Lays out one column of Sankey nodes stacked to fill availH, guaranteeing
// every node at least minNodeH regardless of its value — otherwise a long
// tail of small buckets gets squeezed into a few px and their labels pile up
// on top of each other. Nodes needing the floor take it; whatever height
// remains is distributed proportionally among the rest.
function layoutSankeyColumn(buckets, availH, gap, minNodeH){
  const total = buckets.reduce((s,b)=>s+b.value,0);
  if(!total || !buckets.length) return [];
  const totalGap = gap*(buckets.length-1);
  const forNodes = Math.max(0, availH - totalGap);
  const heights = new Array(buckets.length).fill(0);
  const floored = new Set();
  for(let pass=0; pass<buckets.length+1; pass++){
    const remainingValue = buckets.reduce((s,b,i)=> floored.has(i) ? s : s+b.value, 0);
    const remainingH = Math.max(0, forNodes - floored.size*minNodeH);
    let newlyFloored = false;
    buckets.forEach((b,i)=>{
      if(floored.has(i)){ heights[i] = minNodeH; return; }
      const h = remainingValue>0 ? b.value/remainingValue*remainingH : 0;
      if(h < minNodeH){ floored.add(i); heights[i] = minNodeH; newlyFloored = true; }
      else heights[i] = h;
    });
    if(!newlyFloored) break;
  }
  let cursor = 0;
  return buckets.map((b,i)=>{
    const node = Object.assign({}, b, {y:cursor, h:heights[i]});
    cursor += heights[i] + gap;
    return node;
  });
}
function drawCashFlowChart(list, income){
  const host = document.getElementById('cashflow-sankey');
  const warningHost = document.getElementById('cashflow-warning');
  if(!host) return;
  if(warningHost) warningHost.innerHTML = '';

  const byIncomeCat = {};
  const byExpenseCat = {};
  expandSplits(list).forEach(t=>{
    if(!countsTowardTotals(t)) return;
    if(t.amount>0){ const k=t.category||'Uncategorised'; byIncomeCat[k]=(byIncomeCat[k]||0)+t.amount; }
    else if(t.amount<0){ const k=t.category||'Uncategorised'; byExpenseCat[k]=(byExpenseCat[k]||0)+Math.abs(t.amount); }
  });

  const incomeSorted = Object.entries(byIncomeCat).sort((a,b)=> b[1]-a[1]);
  const incomeTop = incomeSorted.slice(0,5);
  const incomeOtherSum = incomeSorted.slice(5).reduce((s,e)=>s+e[1],0);

  const expenseSorted = Object.entries(byExpenseCat).sort((a,b)=> b[1]-a[1]);
  const expenseTop = expenseSorted.slice(0,5);
  const expenseOtherSum = expenseSorted.slice(5).reduce((s,e)=> s+e[1], 0);
  const totalExpense = expenseSorted.reduce((s,e)=> s+e[1], 0);
  const net = income - totalExpense;

  if(income<=0 && !expenseTop.length){
    host.innerHTML = `<div class="empty-state" style="padding:30px 10px;"><h4>No cash flow yet</h4><p style="font-size:12.5px;">Income and spending for this period will appear here.</p></div>`;
    return;
  }

  const incomeBuckets = incomeTop.map(([name,amt],i)=> ({label:name, value:amt, color:getDonutColors()[i%getDonutColors().length]})).filter(b=>b.value>0.005);
  if(incomeOtherSum>0.005) incomeBuckets.push({label:'Other income', value:incomeOtherSum, color:cssVar('--ink-faint')});

  const expenseBuckets = expenseTop.map(([name,amt],i)=> ({label:name, value:amt, color:getDonutColors()[i%getDonutColors().length]})).filter(b=>b.value>0.005);
  if(expenseOtherSum>0.005) expenseBuckets.push({label:'Other', value:expenseOtherSum, color:cssVar('--ink-faint')});
  if(net>0.005) expenseBuckets.push({label:'Net (saved)', value:net, color:cssVar('--income')});

  if(!incomeBuckets.length || !expenseBuckets.length){
    host.innerHTML = `<div class="empty-state" style="padding:30px 10px;"><h4>No cash flow yet</h4><p style="font-size:12.5px;">Income and spending for this period will appear here.</p></div>`;
    return;
  }

  const W = 920, H = 440;
  const padTop = 38, nodeW = 14, gap = 12, minNodeH = 30;
  const col0X = 130, col1X = 440, col2X = 750;
  const usableH = H - padTop*2;

  const leftNodes = layoutSankeyColumn(incomeBuckets, usableH, gap, minNodeH);
  const rightNodes = layoutSankeyColumn(expenseBuckets, usableH, gap, minNodeH);
  // The two side columns space their nodes apart with a gap; the middle
  // "Income" bar is a single continuous rect, so where each ribbon actually
  // attaches to it has to be packed with no gaps between segments. That
  // gapped-vs-packed mismatch is what makes the ribbons visibly diverge and
  // flow rather than run flat — without it, a ribbon whose source and target
  // happen to share the same proportional slot ends up perfectly horizontal.
  function packNoGap(nodes){
    let cursor = 0;
    return nodes.map(n=>{ const p = {y:cursor, h:n.h}; cursor += n.h; return p; });
  }
  const leftAttach = packNoGap(leftNodes);
  const rightAttach = packNoGap(rightNodes);
  const leftPackedTotal = leftAttach.length ? leftAttach[leftAttach.length-1].y + leftAttach[leftAttach.length-1].h : 0;
  const rightPackedTotal = rightAttach.length ? rightAttach[rightAttach.length-1].y + rightAttach[rightAttach.length-1].h : 0;
  const midH = Math.max(leftPackedTotal, rightPackedTotal);
  const opacity = isDarkMode() ? 0.4 : 0.28;

  host.innerHTML = `
    <svg viewBox="0 0 ${W} ${H}" style="width:100%;height:100%;" preserveAspectRatio="xMidYMid meet">
      ${leftNodes.map((n,i)=> `<path d="${sankeyRibbonPath(col0X+nodeW, padTop+n.y, n.h, col1X, padTop+leftAttach[i].y, leftAttach[i].h)}" fill="${n.color}" opacity="${opacity}"></path>`).join('')}
      ${rightNodes.map((n,i)=> `<path d="${sankeyRibbonPath(col1X+nodeW, padTop+rightAttach[i].y, rightAttach[i].h, col2X, padTop+n.y, n.h)}" fill="${n.color}" opacity="${opacity}"></path>`).join('')}
      ${leftNodes.map(n=> `
        <rect x="${col0X}" y="${padTop+n.y}" width="${nodeW}" height="${n.h}" rx="3" fill="${n.color}"></rect>
        <text x="${col0X-8}" y="${padTop+n.y+n.h/2-4}" text-anchor="end" font-size="13" font-weight="600" fill="var(--ink)">${escHTML(n.label)}</text>
        <text x="${col0X-8}" y="${padTop+n.y+n.h/2+13}" text-anchor="end" font-size="12" fill="var(--ink-faint)">${escHTML(gbp(n.value))}</text>
      `).join('')}
      <rect x="${col1X}" y="${padTop}" width="${nodeW}" height="${midH}" rx="3" fill="var(--ink)"></rect>
      <text x="${col1X+nodeW/2}" y="${padTop-20}" text-anchor="middle" font-size="13" font-weight="600" fill="var(--ink)">Income</text>
      <text x="${col1X+nodeW/2}" y="${padTop-6}" text-anchor="middle" font-size="12" fill="var(--ink-faint)">${escHTML(gbp(income))}</text>
      ${rightNodes.map(n=> `
        <rect x="${col2X}" y="${padTop+n.y}" width="${nodeW}" height="${n.h}" rx="3" fill="${n.color}"></rect>
        <text x="${col2X+nodeW+10}" y="${padTop+n.y+n.h/2-4}" font-size="13" font-weight="600" fill="var(--ink)">${escHTML(n.label)}</text>
        <text x="${col2X+nodeW+10}" y="${padTop+n.y+n.h/2+13}" font-size="12" fill="var(--ink-faint)">${escHTML(gbp(n.value))}</text>
      `).join('')}
    </svg>
  `;
  if(warningHost && net<-0.005){
    warningHost.innerHTML = `<p style="font-size:11.5px;color:var(--expense);font-weight:600;margin:8px 2px 0;">Spending exceeded income this period by ${gbp(Math.abs(net))} — a diagram can't show a negative flow, so that shortfall isn't pictured above.</p>`;
  }
}
function drawTrendChart(){
  const buckets = trendBuckets();
  const incomeData = buckets.map(b=> sumIncome(txInRange(b.from,b.to)));
  const expenseData = buckets.map(b=> sumExpense(txInRange(b.from,b.to)));
  const ctx = document.getElementById('trend-chart');
  if(!ctx) return;
  if(UI.charts.trend) UI.charts.trend.destroy();
  UI.charts.trend = new Chart(ctx, {
    type: UI.trendGran==='week' ? 'bar' : 'line',
    data: {
      labels: buckets.map(b=>b.label),
      datasets: [
        {label:'Income', data:incomeData, borderColor:cssVar('--income'), backgroundColor:UI.trendGran==='week'?cssVar('--income'):hexToRgba(cssVar('--income'),.12), tension:.3, fill:UI.trendGran!=='week', borderWidth:2, borderRadius:4, pointRadius:2},
        {label:'Expenses', data:expenseData, borderColor:cssVar('--expense'), backgroundColor:UI.trendGran==='week'?cssVar('--expense'):hexToRgba(cssVar('--expense'),.10), tension:.3, fill:UI.trendGran!=='week', borderWidth:2, borderRadius:4, pointRadius:2},
      ]
    },
    options:{
      responsive:true, maintainAspectRatio:false,
      interaction:{mode:'index', intersect:false},
      plugins:{ legend:{position:'bottom', labels:{boxWidth:10, usePointStyle:true, font:{family:"'Inter',sans-serif", size:11.5}, color:chartTickColor()}},
        tooltip:{callbacks:{label:(ctx)=> ` ${ctx.dataset.label}: ${gbp(ctx.parsed.y)}`}} },
      scales:{ y:{ beginAtZero:true, ticks:{callback:(v)=>'£'+v.toLocaleString('en-GB'), font:{size:11}, color:chartTickColor()}, grid:{color:chartGridColor()} },
                x:{ grid:{display:false}, ticks:{font:{size:11}, color:chartTickColor()} } }
    }
  });
}

// Chart.js draws to a <canvas>, which — unlike CSS or SVG — can't resolve
// var(--x) references, so colours handed to it have to be literal strings.
// cssVar() reads the current resolved value of a CSS custom property so
// chart colours stay in sync with the active theme; hexToRgba() derives a
// translucent fill from the same source instead of hardcoding a second,
// separate colour that could drift out of sync with it.
function cssVar(name){ return getComputedStyle(document.documentElement).getPropertyValue(name).trim(); }
function hexToRgba(hex, alpha){
  hex = (hex||'').trim().replace('#','');
  if(hex.length===3) hex = hex.split('').map(c=>c+c).join('');
  const r = parseInt(hex.slice(0,2),16)||0, g = parseInt(hex.slice(2,4),16)||0, b = parseInt(hex.slice(4,6),16)||0;
  return `rgba(${r},${g},${b},${alpha})`;
}
function chartGridColor(){ return isDarkMode() ? 'rgba(255,255,255,.08)' : '#E7EBE3'; }
function chartTickColor(){ return cssVar('--ink-faint'); }
const DONUT_COLORS = ['#0B6E4F','#A9791F','#B3392E','#2563EB','#7C3AED','#0D9488','#C2410C','#4B5563','#DB2777','#65A30D'];
const DONUT_COLORS_DARK = ['#2FBE8A','#E3AC4E','#F17164','#6699FF','#A78BFA','#2DD4BF','#F0975A','#9CA8A1','#F472B6','#A3D977'];
function getDonutColors(){ return isDarkMode() ? DONUT_COLORS_DARK : DONUT_COLORS; }
function drawDonutChart(list, chartKey, canvasId, legendId, emptyTitle, emptyDesc){
  const byCat = {};
  expandSplits(list).forEach(t=>{ if(t.amount<0 && countsTowardTotals(t)){ const k=t.category||'Uncategorised'; byCat[k]=(byCat[k]||0)+Math.abs(t.amount); } });
  let entries = Object.entries(byCat).sort((a,b)=>b[1]-a[1]);
  if(entries.length>8){
    const top = entries.slice(0,7);
    const rest = entries.slice(7).reduce((s,e)=>s+e[1],0);
    entries = [...top, ['Other', rest]];
  }
  const total = entries.reduce((s,e)=>s+e[1],0);
  const ctx = document.getElementById(canvasId);
  if(!ctx) return;
  if(UI.charts[chartKey]) UI.charts[chartKey].destroy();
  const legendEl = document.getElementById(legendId);
  if(!entries.length){
    ctx.parentElement.innerHTML = `<div class="empty-state" style="padding:30px 10px;"><h4>${emptyTitle}</h4><p style="font-size:12.5px;">${emptyDesc}</p></div>`;
    if(legendEl) legendEl.innerHTML='';
    return;
  }
  UI.charts[chartKey] = new Chart(ctx, {
    type:'doughnut',
    data:{ labels:entries.map(e=>e[0]), datasets:[{ data:entries.map(e=>e[1]), backgroundColor:getDonutColors(), borderWidth:2, borderColor:cssVar('--surface') }] },
    options:{ responsive:true, maintainAspectRatio:false, cutout:'62%',
      plugins:{ legend:{display:false}, tooltip:{callbacks:{label:(ctx)=> ` ${ctx.label}: ${gbp(ctx.parsed)}`}} } }
  });
  if(legendEl){
    legendEl.innerHTML = entries.map((e,i)=>{
      const pct = total? Math.round(e[1]/total*100) : 0;
      return `<div class="legend-row"><span class="legend-dot" style="background:${getDonutColors()[i%getDonutColors().length]}"></span><span class="legend-name">${escHTML(e[0])}</span><span class="legend-amt num">${gbp(e[1])}</span><span class="legend-pct">${pct}%</span></div>`;
    }).join('');
  }
}
function drawCategoryChart(list){
  drawDonutChart(list, 'cat', 'cat-chart', 'cat-legend', 'No spending yet', 'Categorised expenses for this period will appear here.');
}
function drawYTDChart(){
  const y = todayISO().slice(0,4);
  const ytdList = txInRange(`${y}-01-01`, todayISO());
  drawDonutChart(ytdList, 'ytd', 'ytd-chart', 'ytd-legend', 'No spending yet this year', 'Categorised expenses since 1 January will appear here.');
}

