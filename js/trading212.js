(function(global){
  'use strict';

  const money=global.PocketLedgerMoney||{round:value=>Math.round(Number(value||0)*100)/100,toPence:value=>Math.round(Number(value||0)*100)};
  const clean=value=>String(value==null?'':value).trim();
  const key=value=>clean(value).toLowerCase().replace(/[^a-z0-9]/g,'');
  const parseNumber=value=>{
    let text=clean(value);if(!text)return 0;let negative=false;
    if(/^\(.*\)$/.test(text)){negative=true;text=text.slice(1,-1);}
    text=text.replace(/[^0-9.\-]/g,'');if(text.includes('-')){negative=true;text=text.replace(/-/g,'');}
    const result=Number(text);return Number.isFinite(result)?money.round(negative?-result:result):0;
  };
  const isoDate=value=>{
    const text=clean(value),match=text.match(/^(\d{4})-(\d{2})-(\d{2})/);if(match)return `${match[1]}-${match[2]}-${match[3]}`;
    const parsed=new Date(text);return Number.isNaN(parsed.getTime())?'':`${parsed.getFullYear()}-${String(parsed.getMonth()+1).padStart(2,'0')}-${String(parsed.getDate()).padStart(2,'0')}`;
  };
  function classify(action){
    const value=clean(action).toLowerCase();
    if(/deposit|card deposit|bank transfer in/.test(value))return 'deposit';
    if(/withdraw/.test(value))return 'withdrawal';
    if(/dividend|distribution/.test(value))return 'dividend';
    if(/interest on cash|cash interest|interest/.test(value))return 'interest';
    if(/market buy|limit buy|stop buy|buy/.test(value))return 'trade_buy';
    if(/market sell|limit sell|stop sell|sell/.test(value))return 'trade_sell';
    if(/fee|charge|tax/.test(value))return 'fee';
    if(/currency conversion/.test(value))return 'currency_conversion';
    return 'other';
  }
  function parse(text,parseCsv){
    const result=parseCsv(String(text||'').trim()),table=Array.isArray(result&&result.data)?result.data:[];
    if(table.length<2)return {headers:[],activities:[]};
    const headers=table[0].map(clean),indexByKey=new Map(headers.map((header,index)=>[key(header),index]));
    const find=(...names)=>{for(const name of names){if(indexByKey.has(key(name)))return indexByKey.get(key(name));}return -1;};
    const columns={action:find('Action','Type'),time:find('Time','Date'),total:find('Total','Amount'),currency:find('Currency (Total)','Currency'),fee:find('Charge amount','Fee'),fxFee:find('Currency conversion fee','FX fee'),result:find('Result'),name:find('Name','Instrument'),ticker:find('Ticker'),isin:find('ISIN'),id:find('ID','Order ID'),shares:find('No. of shares','Quantity'),notes:find('Notes')};
    if(columns.action<0||columns.time<0)throw new Error('This does not look like a Trading 212 history export: Action and Time columns are required.');
    const get=(row,column)=>column<0?'':clean(row[column]);
    const activities=table.slice(1).filter(row=>Array.isArray(row)&&row.some(cell=>clean(cell))).map((row,index)=>{
      const action=get(row,columns.action),type=classify(action),rawTotal=parseNumber(get(row,columns.total)),fee=money.round(Math.abs(parseNumber(get(row,columns.fee)))+Math.abs(parseNumber(get(row,columns.fxFee))));
      let amount=Math.abs(rawTotal);if(type==='withdrawal'||type==='trade_buy'||type==='fee')amount=-amount;
      return {rowNumber:index+2,action,type,date:isoDate(get(row,columns.time)),time:get(row,columns.time),amount:money.round(amount),fee,currency:get(row,columns.currency)||'GBP',result:parseNumber(get(row,columns.result)),name:get(row,columns.name),ticker:get(row,columns.ticker),isin:get(row,columns.isin),providerId:get(row,columns.id),shares:parseNumber(get(row,columns.shares)),notes:get(row,columns.notes),rawRow:row.map(clean)};
    }).filter(activity=>activity.date&&activity.action);
    return {headers,activities};
  }
  function activityKey(activity,accountId){
    return activity.providerId?`${accountId}|id|${activity.providerId}`:`${accountId}|row|${activity.time||activity.date}|${key(activity.action)}|${money.toPence(activity.amount)}|${key(activity.name)}`;
  }
  const day=value=>{const parsed=Date.parse(`${value}T00:00:00Z`);return Number.isFinite(parsed)?Math.floor(parsed/86400000):0;};
  function matchFunding(activities,transactions,accountRecord){
    const used=new Set();
    return (activities||[]).map(activity=>{
      if(!['deposit','withdrawal'].includes(activity.type))return Object.assign({},activity,{linkedTransactionId:'',matchStatus:'not-required'});
      const expectedSign=activity.type==='deposit'?1:-1,candidates=(transactions||[]).filter(transaction=>{
        if(used.has(transaction.id)||transaction.accountId!==accountRecord.id||!transaction.transferId||Math.sign(Number(transaction.amount))!==expectedSign)return false;
        return Math.abs(day(transaction.date)-day(activity.date))<=5&&money.toPence(Math.abs(transaction.amount))===money.toPence(Math.abs(activity.amount));
      }).sort((a,b)=>Math.abs(day(a.date)-day(activity.date))-Math.abs(day(b.date)-day(activity.date)));
      const matched=candidates[0];if(matched)used.add(matched.id);
      return Object.assign({},activity,{linkedTransactionId:matched&&matched.id||'',matchStatus:matched?'matched':'unmatched'});
    });
  }
  function summarise(activities){
    const rows=activities||[],sum=type=>money.round(rows.filter(row=>row.type===type).reduce((total,row)=>total+Math.abs(Number(row.amount)||0),0));
    return {rows:rows.length,deposits:sum('deposit'),withdrawals:sum('withdrawal'),dividends:sum('dividend'),interest:sum('interest'),fees:money.round(rows.reduce((total,row)=>total+Math.abs(Number(row.fee)||0)+(row.type==='fee'?Math.abs(Number(row.amount)||0):0),0)),trades:rows.filter(row=>row.type==='trade_buy'||row.type==='trade_sell').length,unmatchedFunding:rows.filter(row=>['deposit','withdrawal'].includes(row.type)&&row.matchStatus==='unmatched').length};
  }

  global.PocketLedgerTrading212={parse,classify,activityKey,matchFunding,summarise};
})(window);
