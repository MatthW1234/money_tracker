(function(global){
  'use strict';

  function cloneWithoutManifest(value){
    const clone=JSON.parse(JSON.stringify(value||{}));
    delete clone.backupManifest;
    return clone;
  }

  function checksumText(text){
    let hash=0x811c9dc5;
    for(let index=0;index<text.length;index++){
      hash^=text.charCodeAt(index);
      hash=Math.imul(hash,0x01000193);
    }
    return `fnv1a-${(hash>>>0).toString(16).padStart(8,'0')}`;
  }

  function summary(database){
    const db=database||{},transactions=Array.isArray(db.transactions)?db.transactions:[];
    const dates=transactions.map(transaction=>transaction&&transaction.date).filter(value=>/^\d{4}-\d{2}-\d{2}$/.test(value)).sort();
    return {
      transactions:transactions.length,
      accounts:Array.isArray(db.accountRecords)?db.accountRecords.length:0,
      categories:Array.isArray(db.categories)?db.categories.length:0,
      rules:Array.isArray(db.rules)?db.rules.length:0,
      reconciliations:Object.values(db.reconciliations||{}).reduce((count,record)=>count+(Array.isArray(record&&record.history)?record.history.length:0),0),
      investmentValuations:Array.isArray(db.investmentValuations)?db.investmentValuations.length:0,
      firstTransactionDate:dates[0]||'',lastTransactionDate:dates[dates.length-1]||'',
    };
  }

  function create(database,options){
    const payload=cloneWithoutManifest(database),opts=options||{};
    payload.backupManifest={
      format:'pocket-ledger-backup',manifestVersion:1,createdAt:opts.createdAt||new Date().toISOString(),
      appVersion:String(opts.appVersion||payload.appVersion||''),schemaVersion:Number(opts.schemaVersion||payload.schemaVersion||0),
      checksum:checksumText(JSON.stringify(payload)),summary:summary(payload),
    };
    return payload;
  }

  function verify(database){
    const manifest=database&&database.backupManifest;
    if(!manifest)return {status:'legacy',ok:true,message:'This backup predates integrity manifests, so its contents cannot be checksum-verified.'};
    if(manifest.format!=='pocket-ledger-backup'||manifest.manifestVersion!==1||typeof manifest.checksum!=='string')return {status:'invalid',ok:false,message:'The backup manifest is incomplete or unsupported.'};
    const actual=checksumText(JSON.stringify(cloneWithoutManifest(database))),ok=actual===manifest.checksum;
    return {status:ok?'verified':'tampered',ok,expected:manifest.checksum,actual,message:ok?'Integrity checksum verified.':'The backup contents do not match its integrity checksum.'};
  }

  function diff(current,candidate){
    const before=summary(current),after=summary(candidate),fields=['transactions','accounts','categories','rules','reconciliations','investmentValuations'];
    const counts={};fields.forEach(field=>{counts[field]={before:before[field],after:after[field],delta:after[field]-before[field]};});
    const beforeIds=new Set((current&&current.transactions||[]).map(transaction=>transaction&&transaction.id).filter(Boolean));
    const afterIds=new Set((candidate&&candidate.transactions||[]).map(transaction=>transaction&&transaction.id).filter(Boolean));
    return {counts,addedTransactions:[...afterIds].filter(id=>!beforeIds.has(id)).length,removedTransactions:[...beforeIds].filter(id=>!afterIds.has(id)).length,before,after};
  }

  function csvCell(value){
    const text=String(value==null?'':value);
    return /[",\r\n]/.test(text)?`"${text.replace(/"/g,'""')}"`:text;
  }

  function transactionsCSV(database){
    const headers=['Date','Description','Amount','Category','Account','Status','Notes','Transaction ID','Transfer ID','Linked event type'];
    const rows=(database&&database.transactions||[]).slice().sort((a,b)=>String(a.date).localeCompare(String(b.date))).map(transaction=>[
      transaction.date,transaction.description,Number(transaction.amount||0).toFixed(2),transaction.category,transaction.account,transaction.status,transaction.notes,transaction.id,transaction.transferId||'',transaction.linkedEventType||'',
    ]);
    return [headers,...rows].map(row=>row.map(csvCell).join(',')).join('\r\n');
  }

  global.PocketLedgerBackup={checksumText,summary,create,verify,diff,transactionsCSV};
})(window);
