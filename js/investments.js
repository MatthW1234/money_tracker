(function(global){
  'use strict';

  const INVESTMENT_TYPES=new Set(['investment','pension']);
  const money=global.PocketLedgerMoney||{sum:values=>(values||[]).reduce((sum,value)=>sum+Number(value||0),0),add:(a,b)=>Number(a||0)+Number(b||0)};

  function create(deps){
    const getDB=deps.getDB;
    const todayISO=deps.todayISO;
    const transactionStatus=deps.transactionStatus;
    const accountOpeningBalance=deps.accountOpeningBalance;
    const expandSplits=deps.expandSplits;
    const countsTowardTotals=deps.countsTowardTotals;

    function db(){return getDB();}
    function accountRecordFor(name){return (db().accountRecords||[]).find(r=>r.name===name)||null;}
    function isInvestmentRecord(record){return !!record&&INVESTMENT_TYPES.has(record.type);}

    function investmentAccountRecords(){
      return (db().accountRecords||[]).filter(isInvestmentRecord);
    }

    function investmentValuationsForAccount(accountId){
      return (db().investmentValuations||[])
        .filter(v=>v.accountId===accountId)
        .sort((a,b)=>a.date.localeCompare(b.date)||(a.createdAt||'').localeCompare(b.createdAt||''));
    }

    function latestInvestmentValuation(accountId,asOfDate){
      const limit=asOfDate||todayISO();
      const rows=investmentValuationsForAccount(accountId).filter(v=>v.date<=limit);
      return rows.length?rows[rows.length-1]:null;
    }

    function accountTransactionsTotal(account,fromExclusive,toInclusive){
      return money.sum(db().transactions.filter(t=>t.account===account&&transactionStatus(t)!=='pending'&&(!fromExclusive||t.date>fromExclusive)&&(!toInclusive||t.date<=toInclusive)).map(t=>t.amount));
    }

    function accountTransferFlow(account,fromExclusive,toInclusive){
      return money.sum(db().transactions.filter(t=>t.account===account&&t.transferId&&transactionStatus(t)!=='pending'&&(!fromExclusive||t.date>fromExclusive)&&(!toInclusive||t.date<=toInclusive)).map(t=>t.amount));
    }

    function accountBalanceByName(account,asOfDate){
      const record=accountRecordFor(account),limit=asOfDate||todayISO();
      if(isInvestmentRecord(record)){
        const valuation=latestInvestmentValuation(record.id,limit);
        if(valuation)return money.add(valuation.value,accountTransactionsTotal(account,valuation.date,limit));
      }
      const rows=db().transactions.filter(t=>t.account===account&&transactionStatus(t)!=='pending'&&(!asOfDate||t.date<=asOfDate));
      return money.add(accountOpeningBalance(account),money.sum(rows.map(t=>t.amount)));
    }

    function investmentValuationPerformance(valuation){
      const rows=investmentValuationsForAccount(valuation.accountId),index=rows.findIndex(v=>v.id===valuation.id);
      if(index<=0)return null;
      const previous=rows[index-1],record=(db().accountRecords||[]).find(r=>r.id===valuation.accountId);
      if(!record)return null;
      const netFlow=accountTransferFlow(record.name,previous.date,valuation.date);
      const gain=valuation.value-previous.value-netFlow;
      return {previous,netFlow,gain,rate:previous.value+Math.max(0,netFlow)>0?gain/(previous.value+Math.max(0,netFlow))*100:0};
    }

    function latestInvestmentPerformance(record){
      const latest=latestInvestmentValuation(record.id);
      return latest?investmentValuationPerformance(latest):null;
    }

    function investExpenseList(list){
      return expandSplits(list).filter(t=>t.amount<0&&countsTowardTotals(t)&&db().investmentCategories.includes(t.category));
    }

    function investmentTransferContributionList(list){
      return list.filter(t=>{
        if(!t.transferId||t.amount<=0)return false;
        const destination=accountRecordFor(t.account);
        if(!isInvestmentRecord(destination))return false;
        return db().transactions.some(pair=>pair.transferId===t.transferId&&pair.id!==t.id&&pair.amount<0&&!isInvestmentRecord(accountRecordFor(pair.account)));
      }).map(t=>Object.assign({},t,{amount:-Math.abs(t.amount),category:'Investment transfer',contributionSource:'transfer'}));
    }

    function investmentContributionList(list){
      return [...investExpenseList(list),...investmentTransferContributionList(list)].sort((a,b)=>a.date.localeCompare(b.date));
    }

    function sumInvest(list){
      return investmentContributionList(list).reduce((sum,t)=>sum+Math.abs(t.amount),0);
    }

    function investmentTransferWithdrawalList(list){
      return list.filter(t=>{
        if(!t.transferId||t.amount>=0)return false;
        const source=accountRecordFor(t.account);
        if(!isInvestmentRecord(source))return false;
        return db().transactions.some(pair=>pair.transferId===t.transferId&&pair.id!==t.id&&pair.amount>0&&!isInvestmentRecord(accountRecordFor(pair.account)));
      });
    }

    function legacyInvestmentWithdrawalList(list){
      return expandSplits(list).filter(t=>t.amount>0&&countsTowardTotals(t)&&/^Investment In$/i.test(t.category||''));
    }

    function investmentWithdrawalList(list){
      return [...investmentTransferWithdrawalList(list),...legacyInvestmentWithdrawalList(list)].sort((a,b)=>a.date.localeCompare(b.date));
    }

    function investmentAccountLifetimeStats(record){
      const rows=db().transactions.filter(t=>t.account===record.name&&transactionStatus(t)!=='pending');
      const gross=rows.filter(t=>t.transferId&&t.amount>0).reduce((sum,t)=>sum+t.amount,0);
      const withdrawals=rows.filter(t=>t.transferId&&t.amount<0).reduce((sum,t)=>sum+Math.abs(t.amount),0);
      const fees=rows.filter(t=>t.transferId).reduce((sum,t)=>sum+Math.abs(Number(t.transferFee)||0),0);
      const net=gross-withdrawals,currentValue=accountBalanceByName(record.name);
      return {record,gross,withdrawals,net,fees,currentValue,marketMovement:currentValue-(Number(record.openingBalance)||0)-net};
    }

    function investmentPortfolioStats(){
      const rows=investmentAccountRecords().map(investmentAccountLifetimeStats);
      return {
        rows,
        gross:rows.reduce((sum,row)=>sum+row.gross,0),
        withdrawals:rows.reduce((sum,row)=>sum+row.withdrawals,0),
        net:rows.reduce((sum,row)=>sum+row.net,0),
        fees:rows.reduce((sum,row)=>sum+row.fees,0),
        currentValue:rows.reduce((sum,row)=>sum+row.currentValue,0),
        marketMovement:rows.reduce((sum,row)=>sum+row.marketMovement,0),
      };
    }

    return {
      investmentAccountRecords,investmentValuationsForAccount,latestInvestmentValuation,
      accountTransactionsTotal,accountTransferFlow,accountBalanceByName,
      investmentValuationPerformance,latestInvestmentPerformance,investExpenseList,
      investmentTransferContributionList,investmentContributionList,sumInvest,
      investmentTransferWithdrawalList,legacyInvestmentWithdrawalList,investmentWithdrawalList,
      investmentAccountLifetimeStats,investmentPortfolioStats,
    };
  }

  global.PocketLedgerInvestments={create};
})(window);
