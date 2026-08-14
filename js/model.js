(function(global){
  'use strict';

  const ACCOUNT_TYPES=[
    {value:'current',label:'Current account',group:'asset'},
    {value:'savings',label:'Savings account',group:'asset'},
    {value:'cash',label:'Cash',group:'asset'},
    {value:'investment',label:'Investment account',group:'asset'},
    {value:'pension',label:'Pension',group:'asset'},
    {value:'property',label:'Property',group:'asset'},
    {value:'other_asset',label:'Other asset',group:'asset'},
    {value:'credit_card',label:'Credit card',group:'liability'},
    {value:'loan',label:'Loan',group:'liability'},
    {value:'mortgage',label:'Mortgage',group:'liability'},
    {value:'other_liability',label:'Other liability',group:'liability'},
  ];
  const RECURRING_FREQUENCIES=['weekly','fortnightly','four_weekly','monthly','quarterly','semiannual','annual','custom'];

  function create(deps){
    const {getDB,uid,clamp,buildEmptyDB,defaultCategories,normaliseRules,schemaVersion,appVersion}=deps;

    function db(){return getDB();}
    function isPlainObject(value){return !!value&&typeof value==='object'&&!Array.isArray(value);}
    function validISODate(value){return typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value);}
    function finiteNumber(value,fallback){return Number.isFinite(value)?value:fallback;}
    function accountTypeConfig(type){return ACCOUNT_TYPES.find(t=>t.value===type)||ACCOUNT_TYPES[0];}
    function isLiabilityType(type){return accountTypeConfig(type).group==='liability';}
    function inferAccountType(name){
      const value=String(name||'').toLowerCase();
      if(/credit|card|amex/.test(value))return 'credit_card';
      if(/mortgage/.test(value))return 'mortgage';
      if(/loan/.test(value))return 'loan';
      if(/pension/.test(value))return 'pension';
      if(/investment|stocks|shares|isa/.test(value))return 'investment';
      if(/saving/.test(value))return 'savings';
      if(/cash|wallet/.test(value))return 'cash';
      return 'current';
    }
    function makeAccountRecord(name,type,openingBalance,extra){
      return Object.assign({
        id:uid('acct'),name:String(name||'').trim(),type:type||inferAccountType(name),institution:'',currency:'GBP',
        openingBalance:Number(openingBalance)||0,openingBalanceDate:'',creditLimit:null,
        archived:false,includeInNetWorth:true,createdAt:new Date().toISOString(),
      },extra||{});
    }
    function transactionStatus(transaction){
      return ['pending','cleared','reconciled'].includes(transaction.status)?transaction.status:'cleared';
    }
    function countsTowardTotals(transaction){return !transaction.transferId&&!transaction.excluded&&transaction.status!=='pending';}
    function categoryRowsFor(transaction){
      if(transaction.splits&&transaction.splits.length){
        return transaction.splits.map(split=>Object.assign({},transaction,{category:split.category,amount:split.amount,splitId:split.id,isSplitPart:true}));
      }
      return [transaction];
    }
    function expandSplits(list){return (list||[]).flatMap(categoryRowsFor);}
    function sumIncome(list){return list.reduce((sum,t)=>(t.amount>0&&countsTowardTotals(t))?sum+t.amount:sum,0);}
    function sumExpense(list){return list.reduce((sum,t)=>(t.amount<0&&countsTowardTotals(t))?sum+Math.abs(t.amount):sum,0);}
    function accountRecordFor(name){return (db().accountRecords||[]).find(record=>record.name===name)||null;}
    function allAccountNames(){
      const ledger=db(),names=new Set((ledger.accountRecords||[]).map(record=>record.name));
      (ledger.accounts||[]).forEach(name=>names.add(name));
      Object.keys(ledger.accountStartingBalances||{}).forEach(name=>names.add(name));
      (ledger.transactions||[]).forEach(transaction=>{if(transaction.account)names.add(transaction.account);});
      return [...names].sort();
    }
    function activeAccountNames(){
      const ledger=db(),active=(ledger.accountRecords||[]).filter(record=>!record.archived).map(record=>record.name);
      (ledger.transactions||[]).forEach(transaction=>{
        if(transaction.account&&!accountRecordFor(transaction.account)&&!active.includes(transaction.account))active.push(transaction.account);
      });
      return active.sort();
    }
    function isLegacyImportedAccount(name){return String(name||'').trim().toLowerCase()==='imported';}
    function preferredImportAccountName(){
      const records=(db().accountRecords||[]).filter(record=>!record.archived&&!isLegacyImportedAccount(record.name));
      return (records.find(record=>record.name.toLowerCase()==='current account')||records.find(record=>record.type==='current')||records[0]||{}).name||'';
    }
    function syncLegacyAccounts(){
      const ledger=db();
      ledger.accounts=(ledger.accountRecords||[]).map(record=>record.name);
      ledger.accountStartingBalances={};
      ledger.accountRecords.forEach(record=>{ledger.accountStartingBalances[record.name]=Number(record.openingBalance)||0;});
      ledger.transactions.forEach(transaction=>{const record=accountRecordFor(transaction.account);if(record)transaction.accountId=record.id;});
      ledger.startingBalance=ledger.accountRecords.length?(Number(ledger.accountRecords[0].openingBalance)||0):0;
    }
    function ensureAccountRecord(name){
      const ledger=db();name=String(name||'').trim();if(!name)return null;
      let record=accountRecordFor(name);
      if(!record){record=makeAccountRecord(name,inferAccountType(name),0);ledger.accountRecords.push(record);syncLegacyAccounts();}
      return record;
    }
    function accountOpeningBalance(account){
      const ledger=db(),record=accountRecordFor(account);
      if(record)return Number(record.openingBalance)||0;
      if(Object.prototype.hasOwnProperty.call(ledger.accountStartingBalances||{},account))return Number(ledger.accountStartingBalances[account])||0;
      return (ledger.accounts||[])[0]===account?(Number(ledger.startingBalance)||0):0;
    }
    function accountTransactionsTo(account,date){
      return db().transactions.filter(t=>t.account===account&&t.date<=date).sort((a,b)=>a.date.localeCompare(b.date)||a.description.localeCompare(b.description));
    }
    function clearedAccountBalance(account,date){
      return accountOpeningBalance(account)+accountTransactionsTo(account,date)
        .filter(t=>transactionStatus(t)!=='pending').reduce((sum,t)=>sum+Number(t.amount||0),0);
    }
    function reconciliationHistory(account){
      const reconciliation=db().reconciliations[account];
      return reconciliation&&Array.isArray(reconciliation.history)?reconciliation.history:[];
    }
    function currentBalance(){
      const ledger=db(),liquidTypes=new Set(['current','savings','cash','credit_card']);
      const names=allAccountNames().filter(name=>liquidTypes.has((accountRecordFor(name)||{}).type||'current'));
      const opening=names.length?names.reduce((sum,name)=>sum+accountOpeningBalance(name),0):((ledger.accountRecords||[]).length?0:(Number(ledger.startingBalance)||0));
      return opening+ledger.transactions.reduce((sum,t)=>t.status==='pending'||(t.account&&!names.includes(t.account))?sum:sum+t.amount,0);
    }

    function normaliseTransaction(raw){
      if(!isPlainObject(raw))return null;
      const amount=Number(raw.amount);
      if(!validISODate(raw.date)||!Number.isFinite(amount)||!String(raw.description||'').trim())return null;
      const clean=Object.assign({},raw,{
        id:typeof raw.id==='string'&&raw.id?raw.id:uid('tx'),date:raw.date,description:String(raw.description).trim(),amount,
        category:typeof raw.category==='string'?raw.category:'',account:typeof raw.account==='string'?raw.account:'',
        notes:typeof raw.notes==='string'?raw.notes:'',source:typeof raw.source==='string'?raw.source:'restored',
        status:transactionStatus(raw),excluded:!!raw.excluded,
      });
      if(Array.isArray(raw.splits)){
        clean.splits=raw.splits.map(split=>isPlainObject(split)&&Number.isFinite(Number(split.amount))?{
          id:typeof split.id==='string'&&split.id?split.id:uid('split'),category:typeof split.category==='string'?split.category:'',amount:Number(split.amount),
        }:null).filter(Boolean);
      }
      return clean;
    }
    function normaliseAccountRecord(raw){
      if(!isPlainObject(raw)||!String(raw.name||'').trim())return null;
      const type=ACCOUNT_TYPES.some(item=>item.value===raw.type)?raw.type:inferAccountType(raw.name);
      const openingBalance=Number(raw.openingBalance),creditLimit=raw.creditLimit==null||raw.creditLimit===''?null:Number(raw.creditLimit);
      return makeAccountRecord(raw.name,type,Number.isFinite(openingBalance)?openingBalance:0,{
        id:typeof raw.id==='string'&&raw.id?raw.id:uid('acct'),institution:typeof raw.institution==='string'?raw.institution:'',
        currency:typeof raw.currency==='string'&&raw.currency?raw.currency:'GBP',openingBalanceDate:validISODate(raw.openingBalanceDate)?raw.openingBalanceDate:'',
        creditLimit:Number.isFinite(creditLimit)&&creditLimit>0?creditLimit:null,archived:!!raw.archived,
        includeInNetWorth:raw.includeInNetWorth!==false,createdAt:typeof raw.createdAt==='string'?raw.createdAt:new Date().toISOString(),
      });
    }
    function normaliseRecurringItem(raw){
      if(!isPlainObject(raw)||!String(raw.name||'').trim())return null;
      const amount=Number(raw.amount),kind=raw.kind==='income'?'income':'expense';
      if(!Number.isFinite(amount)||amount<=0||!validISODate(raw.nextDate))return null;
      const frequency=RECURRING_FREQUENCIES.includes(raw.frequency)?raw.frequency:'monthly';
      const customDays=frequency==='custom'?Math.max(1,Math.round(Number(raw.customDays)||30)):null;
      const minAmount=raw.minAmount==null||raw.minAmount===''?null:Number(raw.minAmount);
      const maxAmount=raw.maxAmount==null||raw.maxAmount===''?null:Number(raw.maxAmount);
      const endDate=validISODate(raw.endDate)?raw.endDate:'';
      let status=['active','paused','ended'].includes(raw.status)?raw.status:'active';
      if(status==='active'&&endDate&&raw.nextDate>endDate)status='ended';
      return {
        id:typeof raw.id==='string'&&raw.id?raw.id:uid('rec'),name:String(raw.name).trim(),kind,
        category:typeof raw.category==='string'?raw.category:'',account:typeof raw.account==='string'?raw.account:'',amount,
        variable:!!raw.variable,minAmount:Number.isFinite(minAmount)&&minAmount>=0?minAmount:null,maxAmount:Number.isFinite(maxAmount)&&maxAmount>=0?maxAmount:null,
        frequency,customDays,nextDate:raw.nextDate,anchorDay:clamp(Math.round(Number(raw.anchorDay)||Number(raw.nextDate.slice(8,10))),1,31),
        endDate,status,notes:typeof raw.notes==='string'?raw.notes:'',createdAt:typeof raw.createdAt==='string'?raw.createdAt:new Date().toISOString(),
        lastMatchedDate:validISODate(raw.lastMatchedDate)?raw.lastMatchedDate:'',
      };
    }
    function normaliseSavingsGoal(raw){
      if(!isPlainObject(raw)||!String(raw.name||'').trim())return null;
      const targetAmount=Number(raw.targetAmount);if(!Number.isFinite(targetAmount)||targetAmount<=0)return null;
      const activity=Array.isArray(raw.activity)?raw.activity.map(entry=>{
        if(!isPlainObject(entry)||!validISODate(entry.date)||!Number.isFinite(Number(entry.amount))||Number(entry.amount)===0)return null;
        return {id:typeof entry.id==='string'&&entry.id?entry.id:uid('ga'),date:entry.date,amount:Number(entry.amount),notes:typeof entry.notes==='string'?entry.notes:''};
      }).filter(Boolean):[];
      return {
        id:typeof raw.id==='string'&&raw.id?raw.id:uid('goal'),name:String(raw.name).trim(),type:raw.type==='sinking_fund'?'sinking_fund':'goal',
        targetAmount,targetDate:validISODate(raw.targetDate)?raw.targetDate:'',account:typeof raw.account==='string'?raw.account:'',
        priority:['high','medium','low'].includes(raw.priority)?raw.priority:'medium',status:raw.status==='paused'?'paused':'active',
        notes:typeof raw.notes==='string'?raw.notes:'',createdAt:typeof raw.createdAt==='string'?raw.createdAt:new Date().toISOString(),activity,
      };
    }
    function normaliseInvestmentValuation(raw,accountRecords){
      if(!isPlainObject(raw)||!validISODate(raw.date)||!Number.isFinite(Number(raw.value))||Number(raw.value)<0)return null;
      const record=accountRecords.find(item=>item.id===raw.accountId)||accountRecords.find(item=>item.name===raw.accountName);
      if(!record||!['investment','pension'].includes(record.type))return null;
      return {
        id:typeof raw.id==='string'&&raw.id?raw.id:uid('val'),accountId:record.id,accountName:record.name,date:raw.date,value:Number(raw.value),
        currency:typeof raw.currency==='string'&&raw.currency?raw.currency:(record.currency||'GBP'),
        source:['manual','csv','api'].includes(raw.source)?raw.source:'manual',notes:typeof raw.notes==='string'?raw.notes:'',
        createdAt:typeof raw.createdAt==='string'?raw.createdAt:new Date().toISOString(),updatedAt:typeof raw.updatedAt==='string'?raw.updatedAt:null,
      };
    }
    function normaliseReconciliations(raw,transactions){
      if(!isPlainObject(raw))return {};
      const result={};
      Object.entries(raw).forEach(([account,value])=>{
        if(!isPlainObject(value)||!Array.isArray(value.history))return;
        const history=value.history.map(entry=>{
          if(!isPlainObject(entry)||!validISODate(entry.statementDate)||!Number.isFinite(Number(entry.statementBalance)))return null;
          const id=typeof entry.id==='string'&&entry.id?entry.id:uid('rec');
          const transactionIds=Array.isArray(entry.transactionIds)?entry.transactionIds.filter(value=>typeof value==='string'):(transactions||[]).filter(transaction=>transaction.reconciliationId===id).map(transaction=>transaction.id);
          const snapshots=Array.isArray(entry.transactionSnapshots)?entry.transactionSnapshots.filter(snapshot=>isPlainObject(snapshot)&&typeof snapshot.id==='string').map(snapshot=>({
            id:snapshot.id,date:validISODate(snapshot.date)?snapshot.date:'',description:typeof snapshot.description==='string'?snapshot.description:'',
            amount:finiteNumber(Number(snapshot.amount),0),category:typeof snapshot.category==='string'?snapshot.category:'',account:typeof snapshot.account==='string'?snapshot.account:account,
            status:['pending','cleared','reconciled'].includes(snapshot.status)?snapshot.status:'reconciled',transferId:typeof snapshot.transferId==='string'?snapshot.transferId:null,
            excluded:!!snapshot.excluded,isAdjustment:!!snapshot.isAdjustment,
          })):[];
          return Object.assign({},entry,{
            id,statementDate:entry.statementDate,statementStartDate:validISODate(entry.statementStartDate)?entry.statementStartDate:'',statementBalance:Number(entry.statementBalance),
            openingBalance:entry.openingBalance==null?null:finiteNumber(Number(entry.openingBalance),null),calculatedBalance:entry.calculatedBalance==null?null:finiteNumber(Number(entry.calculatedBalance),null),
            inflows:entry.inflows==null?null:finiteNumber(Number(entry.inflows),null),outflows:entry.outflows==null?null:finiteNumber(Number(entry.outflows),null),
            differenceAtCompletion:entry.differenceAtCompletion==null?0:finiteNumber(Number(entry.differenceAtCompletion),0),
            completedAt:typeof entry.completedAt==='string'?entry.completedAt:new Date().toISOString(),transactionCount:Math.max(0,Math.round(Number(entry.transactionCount)||transactionIds.length)),
            transactionIds,transactionSnapshots:snapshots,balanceAdjustmentIds:Array.isArray(entry.balanceAdjustmentIds)?entry.balanceAdjustmentIds.filter(value=>typeof value==='string'):[],
            diagnosticWarnings:Array.isArray(entry.diagnosticWarnings)?entry.diagnosticWarnings.filter(value=>typeof value==='string'):[],auditVersion:entry.auditVersion===1||snapshots.length?1:0,
          });
        }).filter(Boolean);
        result[account]=Object.assign({},value,{history});
      });
      return result;
    }
    function migrateAccountRecords(raw,transactions){
      const records=Array.isArray(raw.accountRecords)?raw.accountRecords.map(normaliseAccountRecord).filter(Boolean):[];
      const migratedFromLegacy=records.length===0,names=new Set();
      (Array.isArray(raw.accounts)?raw.accounts:[]).forEach(name=>{if(typeof name==='string'&&name.trim())names.add(name.trim());});
      if(isPlainObject(raw.accountStartingBalances))Object.keys(raw.accountStartingBalances).forEach(name=>names.add(name));
      transactions.forEach(t=>{if(t.account)names.add(t.account);});
      let position=0;
      names.forEach(name=>{
        if(records.some(record=>record.name.toLowerCase()===name.toLowerCase()))return;
        let opening=0;
        if(isPlainObject(raw.accountStartingBalances)&&Object.prototype.hasOwnProperty.call(raw.accountStartingBalances,name))opening=Number(raw.accountStartingBalances[name])||0;
        else if(migratedFromLegacy&&position===0)opening=Number(raw.startingBalance)||0;
        records.push(makeAccountRecord(name,inferAccountType(name),opening));position++;
      });
      return records;
    }
    function preferredCurrentAccountNameFromRaw(raw,transactions){
      const names=[],add=name=>{name=String(name||'').trim();if(name&&!isLegacyImportedAccount(name)&&!names.some(item=>item.toLowerCase()===name.toLowerCase()))names.push(name);};
      (Array.isArray(raw.accountRecords)?raw.accountRecords:[]).filter(record=>record&&record.type==='current'&&!record.archived).forEach(record=>add(record.name));
      if(isPlainObject(raw.accountStartingBalances))Object.keys(raw.accountStartingBalances).forEach(add);
      (Array.isArray(raw.accounts)?raw.accounts:[]).forEach(add);transactions.forEach(t=>add(t.account));
      return names.find(name=>name.toLowerCase()==='current account')||names[0]||'Current Account';
    }
    function migrateLegacyImportedAssignments(raw,transactions){
      const count=transactions.filter(t=>isLegacyImportedAccount(t.account)).length;
      if(!count)return {count:0,target:''};
      const target=preferredCurrentAccountNameFromRaw(raw,transactions);
      transactions.forEach(t=>{if(isLegacyImportedAccount(t.account)){t.account=target;delete t.accountId;}});
      return {count,target};
    }
    function normaliseDB(raw){
      if(!isPlainObject(raw))throw new Error('The backup does not contain a ledger object.');
      if(!Array.isArray(raw.transactions)||!Array.isArray(raw.categories))throw new Error('Transactions or categories are missing.');
      const transactions=raw.transactions.map(normaliseTransaction),invalidTransactions=transactions.filter(t=>!t).length;
      if(invalidTransactions)throw new Error(`${invalidTransactions} transaction${invalidTransactions===1?' is':'s are'} invalid.`);
      const importedMigration=migrateLegacyImportedAssignments(raw,transactions);
      const accountRecords=migrateAccountRecords(raw,transactions).filter(record=>!isLegacyImportedAccount(record.name));
      const clean=Object.assign(buildEmptyDB(),{
        schemaVersion,appVersion,startingBalance:finiteNumber(Number(raw.startingBalance),0),
        categories:raw.categories.filter(c=>isPlainObject(c)&&typeof c.name==='string'&&['income','expense'].includes(c.kind)).map(c=>({name:c.name,kind:c.kind})),
        rules:normaliseRules(raw.rules),transactions,wishlist:Array.isArray(raw.wishlist)?raw.wishlist.filter(isPlainObject):[],
        dismissedRecurring:Array.isArray(raw.dismissedRecurring)?raw.dismissedRecurring.filter(x=>typeof x==='string'):[],
        regularCategories:Array.isArray(raw.regularCategories)?raw.regularCategories.filter(x=>typeof x==='string'):[],
        recurringItems:Array.isArray(raw.recurringItems)?raw.recurringItems.map(normaliseRecurringItem).filter(Boolean):[],
        savingsGoals:Array.isArray(raw.savingsGoals)?raw.savingsGoals.map(normaliseSavingsGoal).filter(Boolean):[],
        budgets:isPlainObject(raw.budgets)?raw.budgets:{},accountStartingBalances:isPlainObject(raw.accountStartingBalances)?raw.accountStartingBalances:{},
        merchantAliases:isPlainObject(raw.merchantAliases)?raw.merchantAliases:{},accounts:Array.isArray(raw.accounts)?raw.accounts.filter(x=>typeof x==='string'):[],
        accountRecords,discretionaryCategories:Array.isArray(raw.discretionaryCategories)?raw.discretionaryCategories.filter(x=>typeof x==='string'):[],
        investmentCategories:Array.isArray(raw.investmentCategories)?raw.investmentCategories.filter(x=>typeof x==='string'):[],
        pendingCards:Array.isArray(raw.pendingCards)?raw.pendingCards.filter(isPlainObject):[],reconciliations:normaliseReconciliations(raw.reconciliations,transactions),
        lastBackupAt:typeof raw.lastBackupAt==='string'?raw.lastBackupAt:null,lastImport:isPlainObject(raw.lastImport)?raw.lastImport:null,
        netWorthSnapshots:Array.isArray(raw.netWorthSnapshots)?raw.netWorthSnapshots.filter(s=>isPlainObject(s)&&validISODate(s.date)&&Number.isFinite(Number(s.netWorth))).map(s=>Object.assign({},s,{netWorth:Number(s.netWorth),totalAssets:Number(s.totalAssets)||0,totalLiabilities:Number(s.totalLiabilities)||0})):[],
        investmentValuations:Array.isArray(raw.investmentValuations)?raw.investmentValuations.map(v=>normaliseInvestmentValuation(v,accountRecords)).filter(Boolean):[],
      });
      if(importedMigration.count){
        clean.recurringItems.forEach(item=>{if(isLegacyImportedAccount(item.account))item.account=importedMigration.target;});
        clean.savingsGoals.forEach(goal=>{if(isLegacyImportedAccount(goal.account))goal.account=importedMigration.target;});
        if(clean.lastImport&&isLegacyImportedAccount(clean.lastImport.account))clean.lastImport.account=importedMigration.target;
        if(clean.reconciliations.Imported){
          const existing=clean.reconciliations[importedMigration.target]||{history:[]};
          existing.history=[...(existing.history||[]),...(clean.reconciliations.Imported.history||[])];
          clean.reconciliations[importedMigration.target]=existing;delete clean.reconciliations.Imported;
        }
        clean.lastAccountMigration={kind:'legacy-imported',count:importedMigration.count,target:importedMigration.target,migratedAt:new Date().toISOString()};
      }
      clean.accounts=accountRecords.map(record=>record.name);clean.accountStartingBalances={};
      accountRecords.forEach(record=>{clean.accountStartingBalances[record.name]=record.openingBalance;});
      clean.transactions.forEach(t=>{const record=accountRecords.find(item=>item.name===t.account);if(record)t.accountId=record.id;});
      if(accountRecords.length)clean.startingBalance=accountRecords[0].openingBalance;
      if(!clean.categories.length)clean.categories=JSON.parse(JSON.stringify(defaultCategories));
      return clean;
    }

    return {
      isPlainObject,validISODate,finiteNumber,accountTypeConfig,isLiabilityType,inferAccountType,makeAccountRecord,
      transactionStatus,countsTowardTotals,categoryRowsFor,expandSplits,sumIncome,sumExpense,accountRecordFor,
      allAccountNames,activeAccountNames,isLegacyImportedAccount,preferredImportAccountName,syncLegacyAccounts,
      ensureAccountRecord,accountOpeningBalance,accountTransactionsTo,clearedAccountBalance,reconciliationHistory,currentBalance,
      normaliseTransaction,normaliseAccountRecord,normaliseRecurringItem,normaliseSavingsGoal,normaliseInvestmentValuation,normaliseReconciliations,
      migrateAccountRecords,preferredCurrentAccountNameFromRaw,migrateLegacyImportedAssignments,normaliseDB,
    };
  }

  global.PocketLedgerModel={ACCOUNT_TYPES,RECURRING_FREQUENCIES,create};
})(window);
