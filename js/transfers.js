(function(global){
  'use strict';

  const roundMoney=value=>Math.round(Number(value)*100)/100;
  function createPair(input){
    const value=input||{},sent=roundMoney(value.sentAmount),received=roundMoney(value.receivedAmount==null?sent:value.receivedAmount);
    const from=String(value.fromAccount||'').trim(),to=String(value.toAccount||'').trim();
    if(!from||!to)throw new Error('Choose both accounts.');
    if(from===to)throw new Error('From and To accounts must be different.');
    if(!Number.isFinite(sent)||sent<=0||!Number.isFinite(received)||received<=0)throw new Error('Transfer amounts must be positive.');
    if(typeof value.uid!=='function')throw new Error('A transfer ID generator is required.');
    const transferId=value.uid('xfer'),fee=Math.abs(roundMoney(sent-received));
    const status=['pending','cleared'].includes(value.status)?value.status:'cleared';
    const description=String(value.description||'').trim(),notes=String(value.notes||'').trim();
    const shared={category:'',notes,source:value.source||'manual',transferId,status};
    if(fee>=0.005)shared.transferFee=fee;
    return {
      transferId,fee,sent,received,
      transactions:[
        Object.assign({id:value.uid('tx'),date:value.date,amount:-sent,description:description||`Transfer to ${to}`,account:from},shared),
        Object.assign({id:value.uid('tx'),date:value.date,amount:received,description:description||`Transfer from ${from}`,account:to},shared),
      ],
    };
  }

  function findCandidates(input){
    const value=input||{},target=value.transaction;if(!target)return [];
    const maxDays=Number(value.maxDays)||3,targetTime=Date.parse(`${target.date}T00:00:00Z`),targetAmount=Math.abs(Number(target.amount)||0);
    return (value.transactions||[]).filter(candidate=>{
      if(!candidate||candidate.id===target.id||candidate.transferId||candidate.status==='reconciled'||candidate.account===target.account)return false;
      if(Math.sign(Number(candidate.amount))===Math.sign(Number(target.amount))||!Number(candidate.amount))return false;
      const time=Date.parse(`${candidate.date}T00:00:00Z`),days=Math.abs(time-targetTime)/86400000;
      const difference=Math.abs(Math.abs(Number(candidate.amount))-targetAmount);
      return Number.isFinite(days)&&days<=maxDays&&difference<=Math.max(2,targetAmount*0.03);
    }).map(candidate=>({
      transaction:candidate,
      days:Math.abs(Date.parse(`${candidate.date}T00:00:00Z`)-targetTime)/86400000,
      difference:roundMoney(Math.abs(Math.abs(Number(candidate.amount))-targetAmount)),
    })).sort((a,b)=>a.difference-b.difference||a.days-b.days).slice(0,8);
  }

  global.PocketLedgerTransfers={createPair,findCandidates};
})(window);
