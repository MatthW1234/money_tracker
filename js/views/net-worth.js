(function(global){
  'use strict';

  function create(deps){
    const {getDB,getUI,netWorthSummary,isLiabilityType,accountTypeConfig,gbp,escHTML,ukDate,ukDateShort,todayISO,uid,scheduleSave,renderContent,toast,cssVar,hexToRgba,chartTickColor,chartGridColor}=deps;
    const doc=deps.document||global.document,ChartClass=deps.Chart||global.Chart;

    function accountRowHTML(row){
      const record=row.record,owed=row.balance<0;
      const utilisation=record.type==='credit_card'&&record.creditLimit?Math.round(Math.max(0,-row.balance)/record.creditLimit*100):null;
      return `<div class="movers-row" style="align-items:flex-start;"><span class="movers-desc" style="white-space:normal;"><strong>${escHTML(record.name)}</strong>${record.archived?' <span class="stamp-mini">archived</span>':''}<br><span style="font-size:10.5px;color:var(--ink-faint);">${escHTML(accountTypeConfig(record.type).label)}${record.institution?` · ${escHTML(record.institution)}`:''}${utilisation!=null?` · ${utilisation}% of ${gbp(record.creditLimit)} limit`:''}</span></span><span class="movers-amt num" style="color:${owed?'var(--expense)':'var(--income)'};">${owed?`−${gbp(Math.abs(row.balance))}`:gbp(row.balance)}</span></div>`;
    }

    function render(container){
      const summary=netWorthSummary();
      const assets=summary.rows.filter(row=>row.balance>0||(row.balance===0&&!isLiabilityType(row.record.type)));
      const liabilities=summary.rows.filter(row=>row.balance<0||(row.balance===0&&isLiabilityType(row.record.type)));
      const snapshots=(getDB().netWorthSnapshots||[]).slice().sort((a,b)=>a.date.localeCompare(b.date));
      container.innerHTML=`
        <div class="kpi-row">
          <div class="kpi-card income"><div class="stripe"></div><div class="kpi-lbl">Assets</div><div class="kpi-val income num">${gbp(summary.totalAssets)}</div><div class="kpi-sub">Positive balances included in net worth</div></div>
          <div class="kpi-card expense"><div class="stripe"></div><div class="kpi-lbl">Liabilities</div><div class="kpi-val expense num">${gbp(summary.totalLiabilities)}</div><div class="kpi-sub">Amounts currently owed</div></div>
          <div class="kpi-card net"><div class="stripe"></div><div class="kpi-lbl">Net worth</div><div class="kpi-val num" style="color:${summary.netWorth>=0?'var(--brand)':'var(--expense)'}">${gbp(summary.netWorth)}</div><div class="kpi-sub">Assets minus liabilities</div></div>
          <div class="kpi-card balance"><div class="stripe"></div><div class="kpi-lbl">Included accounts</div><div class="kpi-val num" style="color:var(--gold)">${summary.rows.length}</div><div class="kpi-sub">Change inclusion from Settings</div></div>
        </div>
        <div class="grid-2">
          <div class="panel"><div class="panel-head"><div class="panel-title">Assets<small>Cash, savings, investments, pensions and property</small></div></div>${assets.length?assets.map(accountRowHTML).join(''):'<div class="empty-state" style="padding:24px 10px;"><p>No asset accounts are included yet.</p></div>'}</div>
          <div class="panel"><div class="panel-head"><div class="panel-title">Liabilities<small>Credit cards, loans and mortgages</small></div></div>${liabilities.length?liabilities.map(accountRowHTML).join(''):'<div class="empty-state" style="padding:24px 10px;"><p>No liability accounts are included yet.</p></div>'}</div>
        </div>
        <div class="panel" style="margin-top:16px;"><div class="panel-head"><div class="panel-title">Net-worth history<small>Saved snapshots only — historical figures are never silently rewritten</small></div></div>${snapshots.length?`<div class="chart-wrap"><canvas id="networth-chart"></canvas></div><div style="margin-top:12px;">${snapshots.slice().reverse().slice(0,6).map(snapshot=>`<div class="movers-row"><span class="movers-desc">${ukDate(snapshot.date)}<br><span style="font-size:10.5px;color:var(--ink-faint);">Assets ${gbp(snapshot.totalAssets)} · liabilities ${gbp(snapshot.totalLiabilities)}</span></span><span class="movers-amt num">${gbp(snapshot.netWorth)}</span></div>`).join('')}</div>`:'<div class="empty-state" style="padding:32px 10px;"><h4>No snapshots yet</h4><p>Save today’s snapshot when your account values are up to date. This creates an honest history rather than reconstructing values from incomplete data.</p></div>'}</div>`;
      if(snapshots.length)drawChart(snapshots);
    }

    function saveSnapshot(){
      const database=getDB(),summary=netWorthSummary(),date=todayISO();
      const snapshot={id:uid('nw'),date,createdAt:new Date().toISOString(),totalAssets:summary.totalAssets,totalLiabilities:summary.totalLiabilities,netWorth:summary.netWorth,accounts:summary.rows.map(row=>({accountId:row.record.id,name:row.record.name,balance:row.balance}))};
      const existing=(database.netWorthSnapshots||[]).findIndex(item=>item.date===date);
      if(existing>=0)database.netWorthSnapshots[existing]=snapshot;else database.netWorthSnapshots.push(snapshot);
      scheduleSave();renderContent();toast(existing>=0?'Today’s net-worth snapshot updated':'Net-worth snapshot saved');
    }

    function drawChart(snapshots){
      const canvas=doc.getElementById('networth-chart');if(!canvas)return;
      const charts=getUI().charts;if(charts.netWorth)charts.netWorth.destroy();
      charts.netWorth=new ChartClass(canvas,{type:'line',data:{labels:snapshots.map(item=>ukDateShort(item.date)),datasets:[{label:'Net worth',data:snapshots.map(item=>item.netWorth),borderColor:cssVar('--brand'),backgroundColor:hexToRgba(cssVar('--brand'),.09),fill:true,tension:.25,borderWidth:2.5,pointRadius:3}]},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false},tooltip:{callbacks:{label:item=>` ${gbp(item.parsed.y)}`}}},scales:{y:{ticks:{callback:value=>'£'+value.toLocaleString('en-GB'),font:{size:11},color:chartTickColor()},grid:{color:chartGridColor()}},x:{grid:{display:false},ticks:{font:{size:10.5},color:chartTickColor()}}}}});
    }

    return {accountRowHTML,render,saveSnapshot,drawChart};
  }

  global.PocketLedgerNetWorthView={create};
})(window);
