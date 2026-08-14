(function(global){
  'use strict';

  const DOW_LABELS=['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];

  function create(deps){
    const {getDB,todayISO,localISODate,addDays,daysBetween,txInRange,trendBuckets,expandSplits,countsTowardTotals,sumIncome,sumExpense,accountBalanceByName,accountTypeConfig}=deps;
    const db=()=>getDB();

    function computeSavingsOpportunities(list,range){
      const periodStart=new Date(range.from+'T00:00:00'),expandedList=expandSplits(list),results=[];
      (db().discretionaryCategories||[]).forEach(category=>{
        if(!db().categories.some(item=>item.name===category))return;
        const current=expandedList.filter(t=>t.category===category&&t.amount<0&&countsTowardTotals(t)).reduce((sum,t)=>sum+Math.abs(t.amount),0);
        const monthlyTotals=[];
        for(let index=1;index<=3;index++){
          const base=new Date(periodStart.getFullYear(),periodStart.getMonth()-index,1);
          const from=localISODate(base),to=localISODate(new Date(base.getFullYear(),base.getMonth()+1,0));
          const spend=expandSplits(txInRange(from,to)).filter(t=>t.category===category&&t.amount<0&&countsTowardTotals(t)).reduce((sum,t)=>sum+Math.abs(t.amount),0);
          if(spend>0)monthlyTotals.push(spend);
        }
        if(!monthlyTotals.length)return;
        const average=monthlyTotals.reduce((sum,value)=>sum+value,0)/monthlyTotals.length;
        results.push({category,current,average,diff:current-average,monthsOfHistory:monthlyTotals.length});
      });
      return results.sort((a,b)=>b.diff-a.diff);
    }

    function monthPaceInfo(range){
      const from=new Date(range.from+'T00:00:00'),to=new Date(range.to+'T00:00:00'),today=new Date(todayISO()+'T00:00:00');
      const totalDays=Math.round((to-from)/86400000)+1;
      const elapsedDays=today<from?0:(today>to?totalDays:Math.round((today-from)/86400000)+1);
      return {totalDays,elapsedDays,pacePct:totalDays>0?elapsedDays/totalDays*100:0};
    }

    function pendingForCategory(category,isLiveMonth){
      return isLiveMonth?(db().pendingCards||[]).filter(card=>card.category===category).reduce((sum,card)=>sum+card.amount,0):0;
    }

    function savingsGoalBalance(goal){return Math.max(0,(goal.activity||[]).reduce((sum,entry)=>sum+Number(entry.amount||0),0));}
    function savingsGoalMonthlyNeeded(goal){
      const remaining=Math.max(0,goal.targetAmount-savingsGoalBalance(goal));
      if(!remaining||goal.status==='paused'||!goal.targetDate)return 0;
      const days=daysBetween(todayISO(),goal.targetDate);
      return days<=0?remaining:remaining/Math.max(1,Math.ceil(days/30.4375));
    }
    function savingsGoalStats(){
      const goals=db().savingsGoals||[];
      return {
        allocated:goals.reduce((sum,goal)=>sum+savingsGoalBalance(goal),0),
        target:goals.reduce((sum,goal)=>sum+goal.targetAmount,0),
        monthlyNeeded:goals.reduce((sum,goal)=>sum+savingsGoalMonthlyNeeded(goal),0),
        funded:goals.filter(goal=>savingsGoalBalance(goal)>=goal.targetAmount).length,
      };
    }

    function biggestTransactions(range,limit){
      return db().transactions.filter(t=>countsTowardTotals(t)&&t.date>=range.from&&t.date<=range.to).sort((a,b)=>Math.abs(b.amount)-Math.abs(a.amount)).slice(0,limit||10);
    }
    function rollingSpendSeries(windowDays,lookbackDays){
      const series=[];
      for(let index=lookbackDays-1;index>=0;index--){
        const endDate=addDays(todayISO(),-index),startDate=addDays(endDate,-(windowDays-1));
        series.push({date:endDate,sum:sumExpense(txInRange(startDate,endDate))});
      }
      return series;
    }
    function spendMomentum(){
      const lookback=90,series7=rollingSpendSeries(7,lookback),series30=rollingSpendSeries(30,lookback);
      const summarise=(series,windowDays)=>{
        const current=series[series.length-1].sum,previousIndex=series.length-1-windowDays;
        const previous=previousIndex>=0?series[previousIndex].sum:null;
        const pctChange=previous!=null&&previous>0.005?(current-previous)/previous*100:null;
        const maximum=Math.max(...series.map(item=>item.sum));
        return {current,previous,pctChange,isHighest:current>0.005&&Math.abs(current-maximum)<0.005};
      };
      return {series7,series30,win7:summarise(series7,7),win30:summarise(series30,30),lookback};
    }
    function spendByDayOfWeek(range){
      const totals=[0,0,0,0,0,0,0],counts=[0,0,0,0,0,0,0];
      db().transactions.forEach(t=>{
        if(!countsTowardTotals(t)||t.amount>=0||t.date<range.from||t.date>range.to)return;
        const day=new Date(t.date+'T00:00:00').getDay();totals[day]+=Math.abs(t.amount);counts[day]++;
      });
      return DOW_LABELS.map((label,index)=>({label,total:totals[index],count:counts[index]}));
    }
    function savingsRateTrend(){
      const buckets=trendBuckets('month').map(bucket=>{
        const list=txInRange(bucket.from,bucket.to),income=sumIncome(list),expense=sumExpense(list);
        return Object.assign({},bucket,{income,expense,net:income-expense});
      });
      const incomes=buckets.map(bucket=>bucket.income).filter(value=>value>0).sort((a,b)=>a-b);
      const median=incomes.length?incomes[Math.floor(incomes.length/2)]:0;
      return buckets.map(bucket=>{
        const rawRate=bucket.income>0?bucket.net/bucket.income*100:0;
        return Object.assign({},bucket,{rawRate,displayRate:Math.max(-100,Math.min(150,rawRate)),lowIncome:median>0&&bucket.income>0&&bucket.income<median*0.25,noIncome:bucket.income<=0});
      });
    }
    function netWorthSummary(){
      const rows=(db().accountRecords||[]).filter(record=>record.includeInNetWorth!==false).map(record=>({record,balance:accountBalanceByName(record.name),group:accountTypeConfig(record.type).group}));
      let totalAssets=0,totalLiabilities=0;
      rows.forEach(row=>{if(row.balance>=0)totalAssets+=row.balance;else totalLiabilities+=Math.abs(row.balance);});
      return {rows,totalAssets,totalLiabilities,netWorth:totalAssets-totalLiabilities};
    }

    return {computeSavingsOpportunities,monthPaceInfo,pendingForCategory,savingsGoalBalance,savingsGoalMonthlyNeeded,savingsGoalStats,biggestTransactions,rollingSpendSeries,spendMomentum,spendByDayOfWeek,savingsRateTrend,netWorthSummary};
  }

  global.PocketLedgerReports={DOW_LABELS,create};
})(window);
