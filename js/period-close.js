(function(global){
  'use strict';
  const fields=['date','description','amount','category','accountId','account','status','transferId','linkedEventId','excluded'];
  function transactionSnapshot(transaction){const snapshot={id:transaction.id};fields.forEach(field=>snapshot[field]=transaction[field]??null);return snapshot;}
  function belongs(transaction,account){return transaction&&(transaction.accountId===account.id||transaction.account===account.name);}
  function activeFor(closes,account){return [...(closes||[])].filter(close=>!close.reopenedAt&&(close.accountId===account.id||close.accountName===account.name)).sort((a,b)=>String(b.closedThrough).localeCompare(String(a.closedThrough)))[0]||null;}
  function create(options){
    const account=options.account,closedThrough=options.closedThrough,transactions=(options.transactions||[]).filter(t=>belongs(t,account)&&t.date<=closedThrough);
    if(!account||!/^\d{4}-\d{2}-\d{2}$/.test(closedThrough))throw new Error('Choose an account and valid close date.');
    return {id:options.uid('close'),accountId:account.id,accountName:account.name,closedThrough,closedAt:options.closedAt||new Date().toISOString(),note:String(options.note||''),snapshots:transactions.map(transactionSnapshot)};
  }
  function protects(transaction,close){return !!(transaction&&close&&transaction.date<=close.closedThrough&&(transaction.accountId===close.accountId||transaction.account===close.accountName));}
  function changes(close,transactions){
    if(!close)return [];
    const current=new Map((transactions||[]).filter(t=>t.accountId===close.accountId||t.account===close.accountName).map(t=>[t.id,t]));
    const snapshotIds=new Set(close.snapshots.map(s=>s.id)),items=[];
    close.snapshots.forEach(snapshot=>{const transaction=current.get(snapshot.id);if(!transaction){items.push({kind:'deleted',id:snapshot.id,description:snapshot.description||'Deleted transaction'});return;}const changed=fields.filter(field=>(transaction[field]??null)!==snapshot[field]);if(changed.length)items.push({kind:'edited',id:snapshot.id,description:transaction.description,fields:changed});});
    current.forEach(transaction=>{if(transaction.date<=close.closedThrough&&!snapshotIds.has(transaction.id))items.push({kind:'added',id:transaction.id,description:transaction.description});});
    return items;
  }
  global.PocketLedgerPeriodClose={transactionSnapshot,activeFor,create,protects,changes};
})(window);
