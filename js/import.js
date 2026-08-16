(function(global){
  'use strict';

  function decodeSmart(buffer){
    const utf8=new TextDecoder('utf-8').decode(buffer);
    if(!utf8.includes('\ufffd'))return utf8;
    try{return new TextDecoder('windows-1252').decode(buffer);}catch(error){return utf8;}
  }

  function guessMapping(headers){
    const find=names=>{
      for(const name of names){
        const index=headers.findIndex(header=>String(header||'').toLowerCase().replace(/[^a-z]/g,'').includes(name));
        if(index>-1)return headers[index];
      }
      return '';
    };
    const date=find(['date']);
    const description=find(['description','details','narrative','memo','reference']);
    const moneyIn=find(['moneyin','creditamount','paidin','credit']);
    const moneyOut=find(['moneyout','debitamount','paidout','debit']);
    const amount=find(['amount','value','transactionamount']);
    const balance=find(['runningbalance','accountbalance','balance']);
    const mode=(moneyIn||moneyOut)&&!amount?'split':'single';
    return {date,description,mode,amount:amount||'',moneyIn:moneyIn||'',moneyOut:moneyOut||'',balance:balance||''};
  }

  function parseCsvText(text,hasHeader,parseCsv){
    const result=parseCsv(String(text||'').trim());
    let rows=Array.isArray(result&&result.data)?result.data:[];
    if(!rows.length)return {headers:[],rows:[],mapping:guessMapping([])};
    const headers=hasHeader
      ? rows[0].map(header=>String(header||'').trim())
      : rows[0].map((_,index)=>`Column ${index+1}`);
    if(hasHeader)rows=rows.slice(1);
    rows=rows.filter(row=>Array.isArray(row)&&row.some(cell=>String(cell||'').trim()!==''));
    return {headers,rows,mapping:guessMapping(headers)};
  }

  function headerSignature(headers){
    return (headers||[]).map(header=>String(header||'').trim().toLowerCase().replace(/\s+/g,' ')).join('\u001f');
  }

  async function fingerprintBuffer(buffer,cryptoImpl){
    const bytes=new Uint8Array(buffer),cryptoApi=cryptoImpl||global.crypto;
    if(cryptoApi&&cryptoApi.subtle&&typeof cryptoApi.subtle.digest==='function'){
      const digest=await cryptoApi.subtle.digest('SHA-256',bytes);
      return [...new Uint8Array(digest)].map(value=>value.toString(16).padStart(2,'0')).join('');
    }
    let hash=2166136261;
    bytes.forEach(value=>{hash^=value;hash=Math.imul(hash,16777619);});
    return `fnv1a-${(hash>>>0).toString(16).padStart(8,'0')}-${bytes.length}`;
  }

  function parseMoney(value){
    if(value===undefined||value===null||value==='')return 0;
    let text=String(value).trim();if(!text)return 0;
    let negative=false;
    if(/^\(.*\)$/.test(text)){negative=true;text=text.slice(1,-1);}
    text=text.replace(/[^0-9.\-]/g,'');
    if(text.includes('-')){negative=true;text=text.replace(/-/g,'');}
    if(!text)return 0;
    const number=parseFloat(text);
    return Number.isNaN(number)?0:(negative?-number:number);
  }

  function pad(value){return String(value).padStart(2,'0');}

  function parseAnyDate(value,format,localISODate){
    if(!value)return '';
    const text=String(value).trim();
    let match=text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
    if(match)return `${match[1]}-${pad(match[2])}-${pad(match[3])}`;
    match=text.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})/);
    if(match){
      let first=parseInt(match[1],10),second=parseInt(match[2],10),year=match[3];
      if(year.length===2)year=(parseInt(year,10)>50?'19':'20')+year;
      let day,month;
      if(format==='MDY'){month=first;day=second;}else{day=first;month=second;}
      if(month>12){const swap=month;month=day;day=swap;}
      return `${year}-${pad(month)}-${pad(day)}`;
    }
    const date=new Date(text);
    return Number.isNaN(date.getTime())?'':localISODate(date);
  }

  function parseImportRow(row,state,localISODate){
    const headerIndex=name=>state.headers.indexOf(name);
    const dateIndex=headerIndex(state.mapping.date),descriptionIndex=headerIndex(state.mapping.description);
    if(dateIndex<0||descriptionIndex<0)return null;
    const date=parseAnyDate(row[dateIndex],state.dateFormat,localISODate);
    const description=String(row[descriptionIndex]||'').trim();
    let amount=0;
    if(state.mapping.mode==='single'){
      let value=parseMoney(row[headerIndex(state.mapping.amount)]);
      if(!state.negativeIsOutgoing)value=-value;
      amount=value;
    }else{
      const moneyInIndex=headerIndex(state.mapping.moneyIn),moneyOutIndex=headerIndex(state.mapping.moneyOut);
      const moneyIn=moneyInIndex>-1?parseMoney(row[moneyInIndex]):0;
      const moneyOut=moneyOutIndex>-1?parseMoney(row[moneyOutIndex]):0;
      amount=moneyIn-Math.abs(moneyOut);
    }
    const balanceIndex=headerIndex(state.mapping.balance),balance=balanceIndex>-1&&String(row[balanceIndex]||'').trim()!==''?parseMoney(row[balanceIndex]):null;
    return {date,description,amount,balance};
  }

  function duplicateKey(transaction,accountReference){
    const account=accountReference||transaction.accountId||transaction.account||'';
    return `${account}|${transaction.date}|${String(transaction.description||'').trim().toUpperCase()}|${Number(transaction.amount||0).toFixed(2)}`;
  }

  function buildParsedRows(state,transactions,suggestCategory,localISODate,options){
    const opts=options||{},accountReference=opts.accountId||opts.accountName||state.destinationAccount||'';
    const existingKeys=new Map();
    (transactions||[]).forEach(transaction=>{
      const transactionAccount=transaction.accountId||transaction.account||'';
      if(accountReference&&transactionAccount!==accountReference&&transaction.account!==opts.accountName)return;
      const key=duplicateKey(transaction,accountReference||transactionAccount),rows=existingKeys.get(key)||[];rows.push(transaction);existingKeys.set(key,rows);
    });
    return state.rows.map((row,index)=>{
      const parsed=parseImportRow(row,state,localISODate);if(!parsed)return null;
      const rowNumber=index+(state.hasHeader?2:1);
      const provenanceMatch=(transactions||[]).find(transaction=>{
        const source=transaction.importProvenance;
        return source&&state.fileFingerprint&&source.fileFingerprint===state.fileFingerprint&&Number(source.rowNumber)===rowNumber&&(!opts.accountId||transaction.accountId===opts.accountId);
      });
      const contentMatch=(existingKeys.get(duplicateKey(parsed,accountReference))||[])[0]||null;
      const matched=provenanceMatch||contentMatch,duplicate=!!matched;
      return {
        rowId:`imp_${index}`,date:parsed.date,description:parsed.description,amount:parsed.amount,balance:parsed.balance,
        category:suggestCategory(parsed.description,parsed.amount),duplicate,duplicateReason:provenanceMatch?'same-source-row':contentMatch?'same-account-match':'',
        matchedTransactionId:matched&&matched.id||'',include:!duplicate,rowNumber,rawRow:row.map(value=>String(value==null?'':value)),
      };
    }).filter(Boolean);
  }

  function statementClosingBalance(rows){
    const valid=(rows||[]).filter(row=>row.date&&Number.isFinite(row.balance));if(!valid.length)return null;
    const dates=valid.map(row=>row.date),endDate=dates.slice().sort().pop(),endRows=valid.filter(row=>row.date===endDate);
    const orderedDates=(rows||[]).filter(row=>row.date).map(row=>row.date),ascending=orderedDates.length<2||orderedDates[0]<=orderedDates[orderedDates.length-1];
    return Number((ascending?endRows[endRows.length-1]:endRows[0]).balance);
  }

  global.PocketLedgerImport={decodeSmart,guessMapping,parseCsvText,headerSignature,fingerprintBuffer,parseMoney,parseAnyDate,parseImportRow,duplicateKey,buildParsedRows,statementClosingBalance};
})(window);
