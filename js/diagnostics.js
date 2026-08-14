(function(global){
  'use strict';

  const TOLERANCE=0.005;
  const validStatus=value=>['pending','cleared','reconciled'].includes(value)?value:'cleared';
  const moneyEqual=(a,b,tolerance)=>Math.abs(Number(a||0)-Number(b||0))<(tolerance==null?TOLERANCE:tolerance);
  const isoDay=value=>{const time=Date.parse(`${value}T00:00:00Z`);return Number.isFinite(time)?Math.floor(time/86400000):null;};
  const dayDifference=(from,to)=>{const a=isoDay(from),b=isoDay(to);return a==null||b==null?null:b-a;};
  const text=value=>String(value||'').trim().replace(/\s+/g,' ').toUpperCase();

  function issue(section,severity,code,title,detail,extra){
    return Object.assign({section,severity,code,title,detail},extra||{});
  }

  function auditLedger(database,options){
    const db=database||{},opts=options||{},today=opts.today||new Date().toISOString().slice(0,10);
    const transactions=Array.isArray(db.transactions)?db.transactions:[];
    const accounts=Array.isArray(db.accountRecords)?db.accountRecords:[];
    const categories=new Set((db.categories||[]).map(category=>category&&category.name).filter(Boolean));
    const accountByName=new Map(accounts.map(account=>[account.name,account]));
    const issues=[];

    const unassigned=transactions.filter(transaction=>!String(transaction.account||'').trim());
    if(unassigned.length)issues.push(issue('accounts','error','unassigned-transactions','Transactions have no account',`${unassigned.length} transaction${unassigned.length===1?' is':'s are'} not assigned to an account.`,{transactionIds:unassigned.map(t=>t.id)}));

    const unknownGroups=new Map();
    transactions.forEach(transaction=>{
      if(!transaction.account||accountByName.has(transaction.account))return;
      const rows=unknownGroups.get(transaction.account)||[];rows.push(transaction);unknownGroups.set(transaction.account,rows);
    });
    unknownGroups.forEach((rows,name)=>issues.push(issue('accounts','warning','unknown-account',`Unknown account: ${name}`,`${rows.length} transaction${rows.length===1?' uses':'s use'} an account that is missing from Account Management.`,{account:name,transactionIds:rows.map(t=>t.id)})));

    accounts.filter(account=>account.archived).forEach(account=>{
      const rows=transactions.filter(transaction=>transaction.account===account.name);
      if(rows.length)issues.push(issue('accounts','info','archived-account-activity',`${account.name} is archived`,`${rows.length} historical transaction${rows.length===1?' remains':'s remain'} attached to this account. This is expected when the account was closed.`,{account:account.name,transactionIds:rows.map(t=>t.id)}));
    });

    const uncategorised=transactions.filter(transaction=>transaction.amount<0&&!transaction.transferId&&!transaction.excluded&&!(transaction.splits&&transaction.splits.length)&&!transaction.category);
    if(uncategorised.length)issues.push(issue('transactions','warning','uncategorised-spending','Uncategorised spending',`${uncategorised.length} outgoing transaction${uncategorised.length===1?' needs':'s need'} a category or transfer classification.`,{transactionIds:uncategorised.map(t=>t.id)}));

    const adjustments=transactions.filter(transaction=>transaction.isAdjustment||transaction.excluded&&text(transaction.description)==='BALANCE ADJUSTMENT');
    if(adjustments.length)issues.push(issue('reconciliation','info','balance-adjustments','Balance adjustments are present',`${adjustments.length} adjustment${adjustments.length===1?' changes':'s change'} account balances without affecting income or spending. Review these before diagnosing an unexplained difference.`,{transactionIds:adjustments.map(t=>t.id)}));

    const exactGroups=new Map();
    transactions.filter(transaction=>!transaction.transferId).forEach(transaction=>{
      const key=[transaction.account||'',transaction.date||'',Number(transaction.amount||0).toFixed(2),text(transaction.description)].join('\u0000');
      const rows=exactGroups.get(key)||[];rows.push(transaction);exactGroups.set(key,rows);
    });
    const duplicateCandidates=[...exactGroups.values()].filter(rows=>rows.length>1);
    if(duplicateCandidates.length){
      const extraRecords=duplicateCandidates.reduce((sum,rows)=>sum+rows.length-1,0);
      issues.push(issue('transactions','warning','exact-duplicate','Possible exact duplicates',`${duplicateCandidates.length} group${duplicateCandidates.length===1?' has':'s have'} matching account, date, amount and description (${extraRecords} possible extra record${extraRecords===1?'':'s'}). Repeated purchases can be legitimate, so review before deleting anything.`,{transactionIds:duplicateCandidates.flatMap(rows=>rows.map(t=>t.id))}));
    }

    const transferGroups=new Map();
    transactions.filter(transaction=>transaction.transferId).forEach(transaction=>{
      const rows=transferGroups.get(transaction.transferId)||[];rows.push(transaction);transferGroups.set(transaction.transferId,rows);
    });
    transferGroups.forEach((rows,transferId)=>{
      const extra={transferId,transactionIds:rows.map(t=>t.id)};
      if(rows.length!==2){
        issues.push(issue('transfers','error','transfer-leg-count','Incomplete or over-linked transfer',`Transfer ${transferId} has ${rows.length} leg${rows.length===1?'':'s'}; a valid transfer must have exactly two.`,extra));return;
      }
      const accountsUsed=new Set(rows.map(row=>row.account));
      if(accountsUsed.size!==2)issues.push(issue('transfers','error','same-account-transfer','Transfer does not move between two accounts','Both transfer legs point to the same account.',extra));
      const outgoing=rows.find(row=>Number(row.amount)<0),incoming=rows.find(row=>Number(row.amount)>0);
      if(!outgoing||!incoming){
        issues.push(issue('transfers','error','transfer-direction','Transfer signs are invalid','A transfer needs one outgoing leg and one incoming leg.',extra));
      }else{
        const difference=Math.abs(Math.abs(Number(outgoing.amount))-Number(incoming.amount));
        const recordedFee=Math.max(...rows.map(row=>Math.abs(Number(row.transferFee)||0)));
        if(!moneyEqual(difference,recordedFee))issues.push(issue('transfers','warning','transfer-fee-mismatch','Transfer amounts do not match the recorded cost',`The two legs differ by £${difference.toFixed(2)}, but the recorded transfer cost is £${recordedFee.toFixed(2)}.`,Object.assign({account:outgoing.account},extra)));
      }
      const statuses=new Set(rows.map(row=>validStatus(row.status)));
      if(statuses.has('reconciled')&&statuses.size>1)issues.push(issue('transfers','warning','transfer-status-mismatch','Only one transfer leg is reconciled','The paired account entry is still pending or cleared, so the transfer is only partly locked.',extra));
    });

    const reconciliationIds=new Set();
    accounts.forEach(account=>{
      const history=db.reconciliations&&db.reconciliations[account.name]&&Array.isArray(db.reconciliations[account.name].history)?db.reconciliations[account.name].history:[];
      history.forEach(entry=>{if(entry&&entry.id)reconciliationIds.add(entry.id);});
      if(account.archived)return;
      if(!history.length){
        issues.push(issue('reconciliation','info','never-reconciled',`${account.name} has never been reconciled`,'Complete a statement check to establish a reliable balance anchor.',{account:account.name}));return;
      }
      const last=history[history.length-1];
      const opening=Number(account.openingBalance)||0;
      const calculated=transactions.filter(transaction=>transaction.account===account.name&&transaction.date<=last.statementDate&&validStatus(transaction.status)!=='pending').reduce((sum,transaction)=>sum+Number(transaction.amount||0),opening);
      const drift=Number(last.statementBalance)-calculated;
      if(!moneyEqual(drift,0))issues.push(issue('reconciliation','error','reconciliation-drift',`${account.name} no longer matches its last reconciliation`,`The ${last.statementDate} statement anchor now differs by £${Math.abs(drift).toFixed(2)}. A backdated edit, deletion or status change may have occurred.`,{account:account.name,reconciliationId:last.id,amount:drift}));
      if(global.PocketLedgerReconciliation&&Array.isArray(last.transactionSnapshots)&&last.transactionSnapshots.length){
        const audit=global.PocketLedgerReconciliation.snapshotAudit(last,transactions,account.name);
        if(!audit.ok)issues.push(issue('reconciliation','error','reconciliation-snapshot-change',`${account.name} reconciliation records have changed`,`${audit.missing.length} included transaction${audit.missing.length===1?' is':'s are'} missing, ${audit.changed.length} changed and ${audit.unexpected.length} new backdated entr${audit.unexpected.length===1?'y is':'ies are'} present.`,{account:account.name,reconciliationId:last.id,transactionIds:[...audit.changed.map(item=>item.id),...audit.unexpected.map(item=>item.id)]}));
      }else if(last.auditVersion===0)issues.push(issue('reconciliation','info','legacy-reconciliation-audit',`${account.name} has legacy reconciliation history`,'The balance anchor is retained, but this older reconciliation predates transaction-level audit snapshots.',{account:account.name,reconciliationId:last.id}));
    });
    const orphaned=transactions.filter(transaction=>validStatus(transaction.status)==='reconciled'&&(!transaction.reconciliationId||!reconciliationIds.has(transaction.reconciliationId)));
    if(orphaned.length)issues.push(issue('reconciliation','error','orphaned-reconciled','Reconciled transactions have no matching history',`${orphaned.length} locked transaction${orphaned.length===1?' is':'s are'} not linked to a retained reconciliation record.`,{transactionIds:orphaned.map(t=>t.id)}));

    const missingRuleCategories=(db.rules||[]).filter(rule=>rule&&rule.category&&!categories.has(rule.category));
    if(missingRuleCategories.length)issues.push(issue('rules','warning','rule-missing-category','Rules point to missing categories',`${missingRuleCategories.length} auto-tagging rule${missingRuleCategories.length===1?' references':'s reference'} a category that no longer exists.`));
    const ruleKeys=new Map();
    (db.rules||[]).forEach((rule,index)=>{
      if(!rule||!rule.keyword)return;const key=`${text(rule.keyword)}\u0000${rule.direction||'any'}`,rows=ruleKeys.get(key)||[];rows.push({index,category:rule.category});ruleKeys.set(key,rows);
    });
    const conflicts=[...ruleKeys.values()].filter(rows=>new Set(rows.map(row=>row.category)).size>1);
    if(conflicts.length)issues.push(issue('rules','warning','rule-conflicts','Auto-tagging rules conflict',`${conflicts.length} keyword and direction combination${conflicts.length===1?' maps':'s map'} to more than one category.`));

    accounts.filter(account=>!account.archived&&['investment','pension'].includes(account.type)).forEach(account=>{
      const values=(db.investmentValuations||[]).filter(value=>value.accountId===account.id||!value.accountId&&value.accountName===account.name).sort((a,b)=>String(b.date).localeCompare(String(a.date)));
      if(!values.length){issues.push(issue('investments','info','missing-valuation',`${account.name} has no valuation`,'Its displayed value currently relies on its opening balance and subsequent account activity.',{account:account.name}));return;}
      const age=dayDifference(values[0].date,today);
      if(age!=null&&age>35)issues.push(issue('investments','warning','stale-valuation',`${account.name} valuation is ${age} days old`,`Update the total account value from the platform, including invested holdings and uninvested cash.`,{account:account.name,valuationId:values[0].id}));
    });

    const severityOrder={error:0,warning:1,info:2};
    issues.sort((a,b)=>severityOrder[a.severity]-severityOrder[b.severity]||a.section.localeCompare(b.section)||a.title.localeCompare(b.title));
    const summary={error:issues.filter(item=>item.severity==='error').length,warning:issues.filter(item=>item.severity==='warning').length,info:issues.filter(item=>item.severity==='info').length};
    return {generatedAt:new Date().toISOString(),issues,summary,ok:summary.error===0&&summary.warning===0};
  }

  function differenceSuggestions(options){
    const opts=options||{},db=opts.db||{},difference=Number(opts.difference),account=opts.account,statementDate=opts.statementDate;
    if(!account||!statementDate||!Number.isFinite(difference)||moneyEqual(difference,0))return [];
    const rows=(db.transactions||[]).filter(transaction=>transaction.account===account&&transaction.date&&transaction.id&&validStatus(transaction.status)!=='reconciled');
    const pending=rows.filter(transaction=>transaction.date<=statementDate&&validStatus(transaction.status)==='pending').map(transaction=>({transaction,delta:Number(transaction.amount)||0,reason:'pending'}));
    const boundary=rows.filter(transaction=>transaction.date>statementDate&&dayDifference(statementDate,transaction.date)<=3).map(transaction=>({transaction,delta:Number(transaction.amount)||0,reason:'boundary'}));
    const cleared=rows.filter(transaction=>transaction.date<=statementDate&&validStatus(transaction.status)==='cleared').sort((a,b)=>b.date.localeCompare(a.date)).slice(0,60).map(transaction=>({transaction,delta:-(Number(transaction.amount)||0),reason:'cleared'}));
    const candidates=[...pending,...boundary,...cleared].filter(candidate=>Math.abs(candidate.delta)>=TOLERANCE).slice(0,80);
    const matches=[];
    const add=items=>{
      const ids=items.map(item=>item.transaction.id).sort(),key=ids.join('|');if(matches.some(match=>match.key===key))return;
      const amount=items.reduce((sum,item)=>sum+item.delta,0);if(!moneyEqual(amount,difference))return;
      matches.push({key,transactionIds:ids,count:items.length,amount,reasons:[...new Set(items.map(item=>item.reason))],transactions:items.map(item=>item.transaction)});
    };
    candidates.forEach(candidate=>add([candidate]));
    for(let i=0;i<candidates.length&&matches.length<8;i++)for(let j=i+1;j<candidates.length&&matches.length<8;j++)add([candidates[i],candidates[j]]);
    for(let i=0;i<candidates.length&&matches.length<8;i++)for(let j=i+1;j<candidates.length&&matches.length<8;j++)for(let k=j+1;k<candidates.length&&matches.length<8;k++)add([candidates[i],candidates[j],candidates[k]]);
    return matches.slice(0,5).map(match=>({
      transactionIds:match.transactionIds,
      title:match.count===1?'One transaction exactly matches the difference':`${match.count} transactions combine to the difference`,
      detail:match.transactions.map(transaction=>`${transaction.date} · ${transaction.description} · £${Math.abs(Number(transaction.amount)).toFixed(2)}`).join(' | '),
      reasons:match.reasons,
    }));
  }

  global.PocketLedgerDiagnostics={auditLedger,differenceSuggestions,moneyEqual};
})(window);
