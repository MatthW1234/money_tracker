(function(global){
  'use strict';
  const day=value=>{const time=Date.parse(`${value}T00:00:00Z`);return Number.isFinite(time)?Math.floor(time/86400000):null;};
  const difference=(a,b)=>{const one=day(a),two=day(b);return one==null||two==null?Infinity:two-one;};
  const words=value=>new Set(String(value||'').toUpperCase().replace(/[^A-Z0-9 ]/g,' ').split(/\s+/).filter(word=>word.length>2));
  function similarity(a,b){const left=words(a),right=words(b);if(!left.size||!right.size)return 0;let shared=0;left.forEach(word=>{if(right.has(word))shared++;});return shared/Math.max(left.size,right.size);}
  function candidates(item,transactions,options){
    const maxDays=Number(options&&options.maxDays)||10,expectedAmount=Math.abs(Number(item.amount)||0);
    return (transactions||[]).filter(transaction=>{
      if(transaction.transferId||transaction.excluded||transaction.recurringItemId)return false;
      if(item.account&&transaction.account!==item.account)return false;
      if(item.kind==='income'&&!(transaction.amount>0)||item.kind!=='income'&&!(transaction.amount<0))return false;
      return Math.abs(difference(item.nextDate,transaction.date))<=maxDays;
    }).map(transaction=>{
      const dateOffset=difference(item.nextDate,transaction.date),amount=Math.abs(Number(transaction.amount)||0),amountChange=expectedAmount?Math.abs(amount-expectedAmount)/expectedAmount:0,textScore=similarity(item.name,transaction.description);
      const score=Math.max(0,100-Math.abs(dateOffset)*4-Math.min(50,amountChange*100)+(textScore*35));
      return {transaction,dateOffset,amountChange,textScore,score,late:dateOffset>2,changedPrice:amountChange>0.1};
    }).filter(candidate=>candidate.textScore>0||candidate.amountChange<=0.25).sort((a,b)=>b.score-a.score);
  }
  function status(item,transactions,today){const matches=candidates(item,transactions),overdue=item.status==='active'&&item.nextDate<(today||new Date().toISOString().slice(0,10));return {matches,overdue,duplicateLooking:matches.length>1,best:matches[0]||null};}
  function link(options){const item=options.item,transaction=options.transaction;if(!item||!transaction)throw new Error('Choose a schedule and transaction.');if(transaction.recurringItemId&&transaction.recurringItemId!==item.id)throw new Error('That transaction is already linked to another schedule.');transaction.recurringItemId=item.id;return {id:options.uid('recmatch'),recurringItemId:item.id,transactionId:transaction.id,expectedDate:item.nextDate,actualDate:transaction.date,expectedAmount:Number(item.amount),actualAmount:Math.abs(Number(transaction.amount)),matchedAt:options.matchedAt||new Date().toISOString(),source:options.source||'confirmed'};}
  global.PocketLedgerRecurringMatch={difference,similarity,candidates,status,link};
})(window);
