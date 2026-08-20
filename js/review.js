(function(global){
  'use strict';

  const text=value=>String(value||'').trim().replace(/\s+/g,' ').toUpperCase();
  function duplicateGroups(transactions){
    const groups=new Map();
    (transactions||[]).filter(t=>!t.transferId).forEach(t=>{
      const key=[t.accountId||t.account||'',t.date||'',Number(t.amount||0).toFixed(2),text(t.description)].join('\u0000');
      const rows=groups.get(key)||[];rows.push(t);groups.set(key,rows);
    });
    return [...groups.values()].filter(rows=>rows.length>1);
  }
  function unmatchedTransferGroups(transactions){
    const groups=new Map();
    (transactions||[]).filter(t=>t.transferId).forEach(t=>{const rows=groups.get(t.transferId)||[];rows.push(t);groups.set(t.transferId,rows);});
    return [...groups.entries()].filter(([,rows])=>rows.length!==2).map(([transferId,rows])=>({transferId,rows}));
  }
  function inbox(database){
    const db=database||{},transactions=db.transactions||[];
    const uncategorised=transactions.filter(t=>t.amount<0&&!t.transferId&&!t.excluded&&!(t.splits&&t.splits.length)&&!t.category);
    const duplicates=duplicateGroups(transactions);
    const unmatchedTransfers=unmatchedTransferGroups(transactions);
    const unmatchedFunding=(db.investmentActivities||[]).filter(a=>['deposit','withdrawal'].includes(a.type)&&!a.linkedTransactionId);
    return {uncategorised,duplicates,unmatchedTransfers,unmatchedFunding,total:uncategorised.length+duplicates.length+unmatchedTransfers.length+unmatchedFunding.length};
  }
  function applyPreset(transactions,preset,today){
    const list=transactions||[],now=today||new Date().toISOString().slice(0,10);
    if(preset==='this-month')return list.filter(t=>t.date&&t.date.slice(0,7)===now.slice(0,7));
    if(preset==='needs-receipt')return list.filter(t=>t.amount<0&&!t.transferId&&!t.receiptRef);
    if(preset==='large-card')return list.filter(t=>t.amount<=-100&&!t.transferId&&/card/i.test(String(t.account||'')));
    return list;
  }
  global.PocketLedgerReview={duplicateGroups,unmatchedTransferGroups,inbox,applyPreset};
})(window);
