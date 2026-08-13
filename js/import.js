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
    const mode=(moneyIn||moneyOut)&&!amount?'split':'single';
    return {date,description,mode,amount:amount||'',moneyIn:moneyIn||'',moneyOut:moneyOut||''};
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
    return {date,description,amount};
  }

  function duplicateKey(transaction){
    return `${transaction.date}|${String(transaction.description||'').trim().toUpperCase()}|${Number(transaction.amount||0).toFixed(2)}`;
  }

  function buildParsedRows(state,transactions,suggestCategory,localISODate){
    const existingKeys=new Set((transactions||[]).map(duplicateKey));
    return state.rows.map((row,index)=>{
      const parsed=parseImportRow(row,state,localISODate);if(!parsed)return null;
      const duplicate=existingKeys.has(duplicateKey(parsed));
      return {
        rowId:`imp_${index}`,date:parsed.date,description:parsed.description,amount:parsed.amount,
        category:suggestCategory(parsed.description,parsed.amount),duplicate,include:!duplicate,
      };
    }).filter(Boolean);
  }

  global.PocketLedgerImport={decodeSmart,guessMapping,parseCsvText,parseMoney,parseAnyDate,parseImportRow,duplicateKey,buildParsedRows};
})(window);
