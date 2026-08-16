(function(global){
  'use strict';

  const money=global.PocketLedgerMoney||{round:value=>Math.round(Number(value)*100)/100,sum:values=>(values||[]).reduce((sum,value)=>sum+Number(value||0),0),add:(a,b)=>Number(a||0)+Number(b||0),subtract:(a,b)=>Number(a||0)-Number(b||0)};

  const status=transaction=>['pending','cleared','reconciled'].includes(transaction&&transaction.status)?transaction.status:'cleared';
  const addDays=(iso,days)=>{const date=new Date(`${iso}T12:00:00`);date.setDate(date.getDate()+days);return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;};
  function historyFor(db,account){const record=db&&db.reconciliations&&db.reconciliations[account];return record&&Array.isArray(record.history)?record.history:[];}
  function previousReconciliation(db,account,endDate){return historyFor(db,account).filter(entry=>entry&&entry.statementDate<endDate).sort((a,b)=>a.statementDate.localeCompare(b.statementDate)).pop()||null;}
  function suggestedStartDate(db,account,endDate,accountRecord){
    const previous=previousReconciliation(db,account,endDate);if(previous)return addDays(previous.statementDate,1);
    return accountRecord&&accountRecord.openingBalanceDate&&accountRecord.openingBalanceDate<=endDate?accountRecord.openingBalanceDate:'';
  }
  function buildSession(input){
    const value=input||{},db=value.db||{},account=value.account,endDate=value.endDate,startDate=value.startDate||'',record=value.accountRecord||{};
    const rows=(db.transactions||[]).filter(transaction=>transaction.account===account&&transaction.date<=endDate).sort((a,b)=>a.date.localeCompare(b.date)||String(a.description).localeCompare(String(b.description)));
    const periodRows=rows.filter(transaction=>!startDate||transaction.date>=startDate);
    const included=rows.filter(transaction=>status(transaction)!=='pending');
    const openingBalance=Number(record.openingBalance)||0;
    const calculatedClosing=money.add(openingBalance,money.sum(included.map(transaction=>transaction.amount)));
    const periodIncluded=periodRows.filter(transaction=>status(transaction)!=='pending');
    const inflows=money.sum(periodIncluded.filter(transaction=>transaction.amount>0).map(transaction=>transaction.amount));
    const outflows=money.sum(periodIncluded.filter(transaction=>transaction.amount<0).map(transaction=>Math.abs(Number(transaction.amount))));
    const statementBalance=value.statementBalance==null?null:Number(value.statementBalance);
    const difference=statementBalance==null||!Number.isFinite(statementBalance)?null:money.subtract(statementBalance,calculatedClosing);
    const previous=previousReconciliation(db,account,endDate);
    return {
      account,startDate,endDate,previous,openingBalance,statementBalance,calculatedClosing,difference,
      transactions:periodRows,includedTransactions:periodIncluded,inflows,outflows,
      pendingCount:periodRows.filter(transaction=>status(transaction)==='pending').length,
      reconciledCount:periodRows.filter(transaction=>status(transaction)==='reconciled').length,
    };
  }

  function transactionSnapshot(transaction){
    return {
      id:transaction.id,date:transaction.date,description:String(transaction.description||''),amount:money.round(transaction.amount),
      category:String(transaction.category||''),account:String(transaction.account||''),status:status(transaction),
      transferId:transaction.transferId||null,excluded:!!transaction.excluded,isAdjustment:!!transaction.isAdjustment,
    };
  }
  function snapshotAudit(record,transactions,account){
    const snapshots=Array.isArray(record&&record.transactionSnapshots)?record.transactionSnapshots:[];
    if(!record||!snapshots.length)return {available:false,missing:[],changed:[],unexpected:[],ok:true};
    const currentById=new Map((transactions||[]).map(transaction=>[transaction.id,transaction])),missing=[],changed=[];
    snapshots.forEach(snapshot=>{
      const current=currentById.get(snapshot.id);if(!current){missing.push(snapshot);return;}
      const now=transactionSnapshot(current),fields=['date','description','amount','category','account','status','transferId','excluded','isAdjustment'];
      const differences=fields.filter(field=>now[field]!==snapshot[field]);if(differences.length)changed.push({id:snapshot.id,fields:differences,snapshot,current:now});
    });
    const ids=new Set(snapshots.map(snapshot=>snapshot.id)),start=record.statementStartDate||'',end=record.statementDate;
    const unexpected=(transactions||[]).filter(transaction=>transaction.account===account&&transaction.date<=end&&(!start||transaction.date>=start)&&status(transaction)!=='pending'&&!ids.has(transaction.id)&&!transaction.reconciliationId);
    return {available:true,missing,changed,unexpected,ok:!missing.length&&!changed.length&&!unexpected.length};
  }

  function statementMatchSummary(importSession,transactions,account,startDate,endDate){
    if(!importSession)return {available:false,matched:[],ledgerOnly:[],statementOnly:[],matchedIds:new Set()};
    const all=transactions||[],byId=new Map(all.map(transaction=>[transaction.id,transaction]));
    const statementRows=(importSession.rows||[]).filter(row=>(!startDate||!row.date||row.date>=startDate)&&(!endDate||!row.date||row.date<=endDate));
    const matched=[],statementOnly=[];
    statementRows.forEach(row=>{
      const transaction=row.transactionId&&byId.get(row.transactionId);
      if(transaction&&transaction.account===account){matched.push({row,transaction});}
      else statementOnly.push(row);
    });
    const matchedIds=new Set(matched.map(item=>item.transaction.id));
    const ledgerOnly=all.filter(transaction=>transaction.account===account&&transaction.date&&(!startDate||transaction.date>=startDate)&&(!endDate||transaction.date<=endDate)&&status(transaction)!=='reconciled'&&!matchedIds.has(transaction.id));
    return {available:true,matched,ledgerOnly,statementOnly,matchedIds};
  }

  function applyStatementMatches(summary){
    if(!summary||!summary.available)return {matched:0,pending:0};
    let matched=0,pending=0;
    summary.matched.forEach(item=>{if(status(item.transaction)!=='reconciled'){item.transaction.status='cleared';matched++;}});
    summary.ledgerOnly.forEach(transaction=>{if(status(transaction)!=='reconciled'){transaction.status='pending';pending++;}});
    return {matched,pending};
  }

  global.PocketLedgerReconciliation={status,addDays,historyFor,previousReconciliation,suggestedStartDate,buildSession,transactionSnapshot,snapshotAudit,statementMatchSummary,applyStatementMatches};
})(window);
