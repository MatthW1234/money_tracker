(function(global){
  'use strict';
  const defaults={density:'comfortable',transactionColumns:{account:true,status:true},transactionSort:{col:'date',dir:'desc'},transactionFilters:{search:'',category:'all',type:'all',status:'all',from:'',to:'',preset:''},lastUsedAccount:''};
  function normalise(raw){const value=raw&&typeof raw==='object'?raw:{};return {density:value.density==='compact'?'compact':'comfortable',transactionColumns:{account:value.transactionColumns?.account!==false,status:value.transactionColumns?.status!==false},transactionSort:{col:['date','description','category','account','status','amount'].includes(value.transactionSort?.col)?value.transactionSort.col:'date',dir:value.transactionSort?.dir==='asc'?'asc':'desc'},transactionFilters:Object.assign({},defaults.transactionFilters,value.transactionFilters&&typeof value.transactionFilters==='object'?value.transactionFilters:{}),lastUsedAccount:typeof value.lastUsedAccount==='string'?value.lastUsedAccount:''};}
  function ukTaxYear(today){const date=new Date(`${today}T00:00:00`),year=date.getFullYear(),startYear=(date.getMonth()>3||(date.getMonth()===3&&date.getDate()>=6))?year:year-1;return {from:`${startYear}-04-06`,to:`${startYear+1}-04-05`};}
  function month(today){return {from:`${today.slice(0,7)}-01`,to:today};}
  function statement(database,account){const history=database&&database.reconciliations&&database.reconciliations[account]&&database.reconciliations[account].history||[],last=history[history.length-1];return last?{from:last.statementStartDate||'',to:last.statementDate||''}:{from:'',to:''};}
  global.PocketLedgerPreferences={defaults,normalise,ukTaxYear,month,statement};
})(window);
