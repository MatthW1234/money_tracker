/* =========================================================
   INSIGHTS
   ========================================================= */
// A trailing N-day rolling sum, one point per day over the lookback window —
// different from spendByDayOfWeek (which buckets by weekday across a whole
// period) or the monthly trend charts (which reset at calendar boundaries).
// This tracks short-term trajectory: is spending over the last week/month
// accelerating or decelerating right now, regardless of where in the
// calendar month you happen to be.
function merchantSpendInRange(canonicalName, from, to){
  return txInRange(from,to).reduce((s,t)=>{
    if(t.amount>=0 || !countsTowardTotals(t)) return s;
    const rawKey = merchantKeyFor(t.description);
    const key = DB.merchantAliases[rawKey] || rawKey;
    return key===canonicalName ? s+Math.abs(t.amount) : s;
  }, 0);
}
function merchantSpendTrend(limit){
  limit = limit || 6;
  const now = todayISO();
  const curFrom = addMonths(now.slice(0,8)+'01', -2).slice(0,7)+'-01';
  const curTo = now;
  const prevFrom = addMonths(curFrom, -3);
  const prevTo = addDays(curFrom, -1);
  const top = topMerchants(txInRange(prevFrom, curTo), limit);
  return top.map(m=>{
    const cur = merchantSpendInRange(m.name, curFrom, curTo);
    const prev = merchantSpendInRange(m.name, prevFrom, prevTo);
    const delta = cur-prev;
    const pct = prev>0.005 ? (delta/prev*100) : (cur>0.005 ? 100 : 0);
    return {name:m.name, cur, prev, delta, pct};
  });
}
function yearOverYearSeries(){
  const now = new Date();
  const thisYearNum = now.getFullYear();
  const lastYearNum = thisYearNum-1;
  const months = [];
  for(let m=0;m<12;m++){
    const from1 = localISODate(new Date(thisYearNum,m,1));
    const to1 = localISODate(new Date(thisYearNum,m+1,0));
    const from0 = localISODate(new Date(lastYearNum,m,1));
    const to0 = localISODate(new Date(lastYearNum,m+1,0));
    months.push({
      label: new Date(thisYearNum,m,1).toLocaleDateString('en-GB',{month:'short'}),
      thisYear: sumExpense(txInRange(from1,to1)),
      lastYear: sumExpense(txInRange(from0,to0)),
    });
  }
  return {months, thisYearNum, lastYearNum};
}
function renderInsights(c){
  const range = periodRange(UI.insightsPeriod);
  const biggest = biggestTransactions(range, 10);
  const dow = spendByDayOfWeek(range);
  const dowMax = Math.max(1, ...dow.map(d=>d.total));
  const dowTop = dow.reduce((best,d)=> d.total>best.total ? d : best, dow[0]);
  const savingsRate = savingsRateTrend();
  const merchants = merchantSpendTrend(6);
  const yoy = yearOverYearSeries();
  const creep = detectBillCreep();
  const momentum = spendMomentum();

  c.innerHTML = `
    <div class="panel-head" style="margin-bottom:14px;">
      <div class="seg" id="insights-period-seg">
        <button data-p="month" class="${UI.insightsPeriod==='month'?'active':''}">This month</button>
        <button data-p="year" class="${UI.insightsPeriod==='year'?'active':''}">This year</button>
        <button data-p="all" class="${UI.insightsPeriod==='all'?'active':''}">All time</button>
      </div>
      <div class="page-sub" style="margin:0;">${range.label}</div>
    </div>

    <div class="grid-2">
      <div class="panel">
        <div class="panel-head"><div class="panel-title">Biggest transactions<small>${range.label} · top 10 by size</small></div></div>
        <div id="insights-biggest"></div>
      </div>
      <div class="panel">
        <div class="panel-head"><div class="panel-title">Spending by day of week<small>${range.label}${dow.some(d=>d.total>0) ? ` · most goes out on ${dowTop.label}` : ''}</small></div></div>
        <div class="chart-wrap"><canvas id="insights-dow-chart"></canvas></div>
      </div>
    </div>

    <div class="grid-2" style="margin-top:16px;">
      <div class="panel">
        <div class="panel-head"><div class="panel-title">Savings rate trend<small>Last 12 months · (income − spending) ÷ income</small></div></div>
        <div class="chart-wrap"><canvas id="insights-savings-rate-chart"></canvas></div>
        ${savingsRate.some(s=>s.lowIncome||s.noIncome) ? `<p style="font-size:11px;color:var(--ink-faint);margin:8px 2px 0;">Hollow points mark months with unusually low or no recorded income — the % swings wildly when there's barely any income to divide by, so treat those figures as noise rather than a real trend.</p>` : ''}
      </div>
      <div class="panel">
        <div class="panel-head"><div class="panel-title">Merchant spend trends<small>Last 3 months vs the 3 before that</small></div></div>
        <div id="insights-merchant-trends"></div>
      </div>
    </div>

    <div class="grid-2" style="margin-top:16px;">
      <div class="panel">
        <div class="panel-head"><div class="panel-title">Year over year<small>${yoy.thisYearNum} vs ${yoy.lastYearNum} · spending by month</small></div></div>
        <div style="position:relative;height:280px;"><canvas id="insights-yoy-chart"></canvas></div>
      </div>
      <div class="panel">
        <div class="panel-head"><div class="panel-title">Subscription &amp; bill creep<small>Recurring payments that have quietly gone up</small></div></div>
        <div id="insights-creep"></div>
      </div>
    </div>

    <div class="panel" style="margin-top:16px;">
      <div class="panel-head"><div class="panel-title">Spending momentum<small>Rolling totals, day by day — not tied to calendar months</small></div></div>
      <div id="insights-momentum-stats" class="kpi-row" style="margin-bottom:16px;"></div>
      <div style="position:relative;height:240px;"><canvas id="insights-momentum-chart"></canvas></div>
    </div>
  `;

  const host = document.getElementById('insights-biggest');
  if(!biggest.length){
    host.innerHTML = `<div class="empty-state" style="padding:24px 10px;"><h4>Nothing in this period</h4><p style="font-size:12.5px;">Transactions for ${escHTML(range.label)} will show up here.</p></div>`;
  } else {
    host.innerHTML = biggest.map(t=> `
      <div class="movers-row">
        <span class="movers-desc" style="white-space:normal;line-height:1.4;" title="${escAttr(t.description)}">${escHTML(t.description)}<br><span style="color:var(--ink-faint);font-size:10.5px;">${ukDate(t.date)}${t.category?` · ${escHTML(t.category)}`:''}${(t.splits&&t.splits.length)?` · Split (${t.splits.length})`:''}</span></span>
        <span class="movers-amt num" style="color:${t.amount>0?'var(--income)':'var(--ink)'};">${gbp(t.amount,{signed:true})}</span>
      </div>
    `).join('');
  }

  const mHost = document.getElementById('insights-merchant-trends');
  if(!merchants.length){
    mHost.innerHTML = `<div class="empty-state" style="padding:24px 10px;"><h4>Not enough history yet</h4><p style="font-size:12.5px;">Once you've got a few months of transactions, merchant trends will show up here.</p></div>`;
  } else {
    mHost.innerHTML = merchants.map(m=>{
      const flat = Math.abs(m.pct) < 1;
      const up = m.pct >= 1;
      const arrow = flat ? '→' : (up ? '↑' : '↓');
      const color = flat ? 'var(--ink-faint)' : (up ? 'var(--expense)' : 'var(--income)');
      return `
      <div class="movers-row">
        <span class="movers-desc" title="${escAttr(m.name)}">${escHTML(m.name)}<br><span style="color:var(--ink-faint);font-size:10.5px;">${gbp(m.prev)} → ${gbp(m.cur)}</span></span>
        <span class="movers-amt num" style="color:${color};">${arrow} ${Math.abs(m.pct).toFixed(0)}%</span>
      </div>`;
    }).join('');
  }

  const creepHost = document.getElementById('insights-creep');
  if(!creep.length){
    creepHost.innerHTML = `<div class="empty-state" style="padding:24px 10px;"><h4>Nothing creeping up</h4><p style="font-size:12.5px;">Your recurring payments have stayed roughly the same amount each time.</p></div>`;
  } else {
    creepHost.innerHTML = creep.map(cr=> `
      <div class="movers-row">
        <span class="movers-desc" style="white-space:normal;line-height:1.4;" title="${escAttr(cr.description)}">${escHTML(cr.description)}${cr.category?` <span class="stamp-mini">${escHTML(cr.category)}</span>`:''}<br><span style="color:var(--ink-faint);font-size:10.5px;">${gbp(cr.firstAmt)} (${ukDateShort(cr.firstDate)}) → ${gbp(cr.lastAmt)} (${ukDateShort(cr.lastDate)})</span></span>
        <span class="movers-amt num" style="color:var(--expense);">↑ ${cr.pct.toFixed(0)}%</span>
      </div>
    `).join('');
  }

  function momentumCardHTML(win, label){
    let subline;
    if(win.isHighest){
      subline = `<span style="color:var(--expense);font-weight:600;">Highest ${label==='Last 7 days'?'7-day':'30-day'} spend in ${momentum.lookback}d</span>`;
    } else if(win.pctChange!=null){
      const up = win.pctChange >= 0;
      subline = `<span style="color:${up?'var(--expense)':'var(--income)'};">${up?'↑':'↓'} ${Math.abs(win.pctChange).toFixed(0)}% vs previous period</span>`;
    } else {
      subline = `<span style="color:var(--ink-faint);">Not enough history yet to compare</span>`;
    }
    return `<div class="kpi-card expense"><div class="stripe"></div><div class="kpi-lbl">${label}</div><div class="kpi-val expense num">${gbp(win.current)}</div><div class="kpi-sub">${subline}</div></div>`;
  }
  document.getElementById('insights-momentum-stats').innerHTML = momentumCardHTML(momentum.win7,'Last 7 days') + momentumCardHTML(momentum.win30,'Last 30 days');

  document.getElementById('insights-period-seg').addEventListener('click', e=>{
    const b = e.target.closest('button'); if(!b) return;
    UI.insightsPeriod = b.dataset.p;
    renderInsights(c);
  });

  drawDowChart(dow, dowMax);
  drawSavingsRateChart(savingsRate);
  drawYoyChart(yoy);
  drawMomentumChart(momentum);
}
function drawMomentumChart(momentum){
  const ctx = document.getElementById('insights-momentum-chart');
  if(!ctx) return;
  if(UI.charts.momentum) UI.charts.momentum.destroy();
  UI.charts.momentum = new Chart(ctx, {
    type: 'line',
    data: {
      labels: momentum.series7.map(s=>ukDateShort(s.date)),
      datasets: [{ label:'Trailing 7-day spend', data: momentum.series7.map(s=>s.sum), tension:.3, fill:true, borderWidth:2, pointRadius:0,
        borderColor:cssVar('--expense'), backgroundColor:hexToRgba(cssVar('--expense'),.08) }],
    },
    options:{
      responsive:true, maintainAspectRatio:false,
      interaction:{mode:'index', intersect:false},
      plugins:{ legend:{display:false}, tooltip:{callbacks:{
        title:(items)=> `Trailing 7 days ending ${items[0].label}`,
        label:(item)=> ` ${gbp(item.parsed.y)}`,
      } } },
      scales:{ y:{ ticks:{callback:(v)=>'£'+v.toLocaleString('en-GB'), font:{size:11}, color:chartTickColor()}, grid:{color:chartGridColor()} },
                x:{ grid:{display:false}, ticks:{font:{size:10}, color:chartTickColor(), maxTicksLimit:10} } }
    }
  });
}
function drawSavingsRateChart(series){
  const ctx = document.getElementById('insights-savings-rate-chart');
  if(!ctx) return;
  if(UI.charts.savingsRate) UI.charts.savingsRate.destroy();
  const flagged = s => s.lowIncome || s.noIncome;
  UI.charts.savingsRate = new Chart(ctx, {
    type: 'line',
    data: {
      labels: series.map(s=>s.label),
      datasets: [{ label:'Savings rate', data: series.map(s=>s.displayRate), tension:.3, fill:true, borderWidth:2.5,
        pointRadius: series.map(s=> flagged(s) ? 4 : 2),
        pointBackgroundColor: series.map(s=> flagged(s) ? cssVar('--surface') : cssVar('--brand')),
        pointBorderColor: series.map(s=> flagged(s) ? cssVar('--gold') : cssVar('--brand')),
        pointBorderWidth: series.map(s=> flagged(s) ? 2 : 1),
        borderColor:cssVar('--brand'), backgroundColor:hexToRgba(cssVar('--brand'),.1) }],
    },
    options:{
      responsive:true, maintainAspectRatio:false,
      plugins:{ legend:{display:false}, tooltip:{callbacks:{
        label:(item)=>{
          const s = series[item.dataIndex];
          if(s.noIncome) return ' No income recorded this month';
          if(s.lowIncome) return [` ${s.rawRate.toFixed(0)}% (income was unusually low: ${gbp(s.income)})`, ' % swings a lot when income is this small — not very meaningful'];
          return ` ${s.rawRate.toFixed(1)}% of income saved`;
        },
      } } },
      scales:{ y:{ ticks:{callback:(v)=>v+'%', font:{size:11}, color:chartTickColor()}, grid:{color:chartGridColor()} },
                x:{ grid:{display:false}, ticks:{font:{size:10.5}, color:chartTickColor()} } }
    }
  });
}
function drawYoyChart(yoy){
  const ctx = document.getElementById('insights-yoy-chart');
  if(!ctx) return;
  if(UI.charts.yoy) UI.charts.yoy.destroy();
  UI.charts.yoy = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: yoy.months.map(m=>m.label),
      datasets: [
        { label:String(yoy.lastYearNum), data: yoy.months.map(m=>m.lastYear), backgroundColor:cssVar('--ink-faint'), borderRadius:3 },
        { label:String(yoy.thisYearNum), data: yoy.months.map(m=>m.thisYear), backgroundColor:cssVar('--brand'), borderRadius:3 },
      ],
    },
    options:{
      responsive:true, maintainAspectRatio:false,
      plugins:{ legend:{position:'bottom', labels:{boxWidth:10, usePointStyle:true, font:{family:"'Inter',sans-serif", size:11.5}, color:chartTickColor()}},
        tooltip:{callbacks:{label:(item)=> ` ${item.dataset.label}: ${gbp(item.parsed.y)}`}} },
      scales:{ y:{ ticks:{callback:(v)=>'£'+v.toLocaleString('en-GB'), font:{size:11}, color:chartTickColor()}, grid:{color:chartGridColor()} },
                x:{ grid:{display:false}, ticks:{font:{size:11}, color:chartTickColor()} } }
    }
  });
}
function drawDowChart(dow, dowMax){
  const ctx = document.getElementById('insights-dow-chart');
  if(!ctx) return;
  if(UI.charts.dow) UI.charts.dow.destroy();
  if(!dow.some(d=>d.total>0)){
    ctx.parentElement.innerHTML = `<div class="empty-state" style="padding:30px 10px;"><h4>No spending yet</h4><p style="font-size:12.5px;">Once you have expenses logged for this period, the pattern by weekday will show up here.</p></div>`;
    return;
  }
  UI.charts.dow = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: dow.map(d=>d.label),
      datasets: [{ label:'Spent', data: dow.map(d=>d.total),
        backgroundColor: dow.map(d=> d.total===dowMax ? cssVar('--expense') : cssVar('--brand')), borderRadius:3 }],
    },
    options:{
      responsive:true, maintainAspectRatio:false,
      plugins:{ legend:{display:false}, tooltip:{callbacks:{label:(item)=>{
        const d = dow[item.dataIndex];
        return ` ${gbp(d.total)} across ${d.count} transaction${d.count===1?'':'s'}`;
      }}} },
      scales:{ y:{ ticks:{callback:(v)=>'£'+v.toLocaleString('en-GB'), font:{size:11}, color:chartTickColor()}, grid:{color:chartGridColor()} },
                x:{ grid:{display:false}, ticks:{font:{size:11}, color:chartTickColor()} } }
    }
  });
}

