(function(global){
  'use strict';

  const money=global.PocketLedgerMoney||{round:value=>Math.round(Number(value||0)*100)/100};
  const RETURN_TYPES=new Set(['refund','reversal','chargeback']);
  function isReturn(transaction){return !!transaction&&RETURN_TYPES.has(transaction.linkedEventType)&&Number(transaction.amount)>0;}
  function expenseEffect(transaction,countsTowardTotals){
    if(!transaction||!countsTowardTotals(transaction))return 0;
    if(isReturn(transaction))return -Math.abs(Number(transaction.amount)||0);
    return Number(transaction.amount)<0?Math.abs(Number(transaction.amount)||0):0;
  }
  function suggestOriginals(transaction,transactions){
    if(!transaction||Number(transaction.amount)<=0)return [];
    const targetTime=Date.parse(`${transaction.date}T00:00:00Z`),amount=Math.abs(Number(transaction.amount));
    return (transactions||[]).filter(candidate=>candidate.id!==transaction.id&&!candidate.transferId&&Number(candidate.amount)<0&&candidate.accountId===transaction.accountId&&!candidate.linkedEventType&&candidate.status!=='pending')
      .map(candidate=>({transaction:candidate,days:(targetTime-Date.parse(`${candidate.date}T00:00:00Z`))/86400000,difference:money.round(Math.abs(Math.abs(Number(candidate.amount))-amount))}))
      .filter(candidate=>candidate.days>=0&&candidate.days<=180&&amount<=Math.abs(Number(candidate.transaction.amount))+0.005)
      .sort((a,b)=>a.difference-b.difference||a.days-b.days).slice(0,20);
  }
  function createReturnLink(input){
    const value=input||{},original=value.original,returned=value.returned,type=RETURN_TYPES.has(value.type)?value.type:'refund';
    if(!original||!returned||original.id===returned.id)throw new Error('Choose two different transactions.');
    if(Number(original.amount)>=0||Number(returned.amount)<=0)throw new Error('A return link needs an original outgoing payment and incoming money.');
    if(original.accountId!==returned.accountId)throw new Error('The original payment and return must use the same account.');
    if(returned.transferId||returned.excluded)throw new Error('Transfers and excluded entries cannot be linked as refunds.');
    if(returned.linkedEventId)throw new Error('This incoming transaction is already linked.');
    if(typeof value.uid!=='function')throw new Error('A link ID generator is required.');
    const id=value.uid('link'),link={id,type,originalTransactionId:original.id,returnTransactionId:returned.id,amount:money.round(Math.abs(returned.amount)),createdAt:new Date().toISOString(),notes:String(value.notes||'')};
    returned.linkedEventId=id;returned.linkedEventType=type;returned.linkedTransactionId=original.id;
    if(!returned.category&&original.category)returned.category=original.category;
    return link;
  }
  function removeLink(link,transactions){
    if(!link)return;const returned=(transactions||[]).find(transaction=>transaction.id===link.returnTransactionId);
    if(returned){delete returned.linkedEventId;delete returned.linkedEventType;delete returned.linkedTransactionId;}
  }
  function nextDateForDay(today,day,after){
    const base=new Date(`${today}T12:00:00`),candidate=new Date(base.getFullYear(),base.getMonth(),Math.max(1,Math.min(28,Number(day)||1)));
    if(after?candidate<=base:candidate<base)candidate.setMonth(candidate.getMonth()+1);
    return `${candidate.getFullYear()}-${String(candidate.getMonth()+1).padStart(2,'0')}-${String(candidate.getDate()).padStart(2,'0')}`;
  }
  function creditCardSchedule(record,today,balance){
    if(!record||record.type!=='credit_card'||!record.statementDay||!record.dueDay)return null;
    const statementDate=nextDateForDay(today,record.statementDay,true),statementMonth=new Date(`${statementDate}T12:00:00`),due=new Date(statementMonth.getFullYear(),statementMonth.getMonth()+(Number(record.dueDay)<=Number(record.statementDay)?1:0),Math.max(1,Math.min(28,Number(record.dueDay))));
    const dueDate=`${due.getFullYear()}-${String(due.getMonth()+1).padStart(2,'0')}-${String(due.getDate()).padStart(2,'0')}`;
    return {statementDate,dueDate,expectedPayment:record.autopayFullBalance?Math.max(0,-Number(balance||0)):Math.max(0,Number(record.minimumPayment)||0),autopayFullBalance:!!record.autopayFullBalance};
  }

  global.PocketLedgerLinkedEvents={RETURN_TYPES,isReturn,expenseEffect,suggestOriginals,createReturnLink,removeLink,creditCardSchedule};
})(window);
