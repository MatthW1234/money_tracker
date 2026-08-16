(function(global){
  'use strict';

  const SCALE=100;
  const number=value=>{
    const parsed=Number(value);
    return Number.isFinite(parsed)?parsed:0;
  };
  const toPence=value=>Math.round((number(value)+Number.EPSILON)*SCALE);
  const fromPence=value=>Number(value||0)/SCALE;
  const round=value=>fromPence(toPence(value));
  const sum=values=>fromPence((values||[]).reduce((total,value)=>total+toPence(value),0));
  const add=(left,right)=>fromPence(toPence(left)+toPence(right));
  const subtract=(left,right)=>fromPence(toPence(left)-toPence(right));
  const absolute=value=>fromPence(Math.abs(toPence(value)));
  const equal=(left,right)=>toPence(left)===toPence(right);
  const isZero=value=>toPence(value)===0;

  global.PocketLedgerMoney={SCALE,toPence,fromPence,round,sum,add,subtract,absolute,equal,isZero};
})(window);
