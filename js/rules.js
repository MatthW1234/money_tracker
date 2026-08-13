(function(global){
  'use strict';

  const VALID_DIRECTIONS = new Set(['any','in','out']);
  const LEGACY_DIRECTIONS = {income:'in',expense:'out'};

  function hasOwn(object,key){
    return Object.prototype.hasOwnProperty.call(object,key);
  }

  function normaliseDirection(value){
    if(value==null || value==='') return 'any';
    const direction=String(value).toLowerCase();
    return LEGACY_DIRECTIONS[direction] || (VALID_DIRECTIONS.has(direction)?direction:'any');
  }

  function normaliseRule(raw){
    if(!raw || typeof raw!=='object' || Array.isArray(raw)) return null;
    if(typeof raw.keyword!=='string' || typeof raw.category!=='string') return null;
    const rule={keyword:raw.keyword,category:raw.category};
    // Old/default rules omitted direction. Keep that shape on round-trip while
    // still treating omission as "any" at match time. Explicit directions and
    // the v1.05 restore aliases are canonicalised.
    if(hasOwn(raw,'direction')){
      const rawDirection=String(raw.direction).toLowerCase();
      rule.direction=LEGACY_DIRECTIONS[rawDirection] || (VALID_DIRECTIONS.has(rawDirection)?rawDirection:raw.direction);
    }
    return rule;
  }

  function normaliseRules(rules){
    return Array.isArray(rules)?rules.map(normaliseRule).filter(Boolean):[];
  }

  function ruleMatches(rule,description,amount){
    if(!rule || !String(description||'').toUpperCase().includes(String(rule.keyword||'').toUpperCase())) return false;
    const direction=normaliseDirection(rule.direction);
    if(direction==='out' && !(Number(amount)<0)) return false;
    if(direction==='in' && !(Number(amount)>0)) return false;
    return true;
  }

  function suggestCategory(rules,description,amount){
    let best=null;
    (rules||[]).forEach((rule,index)=>{
      if(!ruleMatches(rule,description,amount)) return;
      const keywordLength=String(rule.keyword||'').length;
      if(!best || keywordLength>best.keywordLength) best={category:rule.category,keywordLength,index};
    });
    return best?best.category:'';
  }

  function matchingTransactions(transactions,keyword,direction){
    const rule={keyword:String(keyword||'').trim(),category:'',direction:normaliseDirection(direction)};
    if(!rule.keyword) return [];
    return (transactions||[]).filter(t=>!t.transferId&&ruleMatches(rule,t.description,t.amount));
  }

  function applyToUncategorised(transactions,keyword,category,direction){
    const rule={keyword,category,direction:normaliseDirection(direction)};
    let count=0;
    (transactions||[]).forEach(t=>{
      if(t.category || t.transferId || (t.splits&&t.splits.length) || !ruleMatches(rule,t.description,t.amount)) return;
      t.category=category;count++;
    });
    return count;
  }

  function auditRules(rules,categories){
    const categoryNames=new Set((categories||[]).map(c=>typeof c==='string'?c:c&&c.name).filter(Boolean));
    const invalid=[],missingCategories=[],directional=[];
    const groups=new Map();
    (rules||[]).forEach((rule,index)=>{
      if(!rule || typeof rule.keyword!=='string' || typeof rule.category!=='string'){
        invalid.push({index,reason:'Rule must contain text keyword and category fields.'});return;
      }
      const rawDirection=hasOwn(rule,'direction')?String(rule.direction).toLowerCase():'any';
      if(!VALID_DIRECTIONS.has(rawDirection) && !hasOwn(LEGACY_DIRECTIONS,rawDirection)) invalid.push({index,reason:`Unknown direction "${rule.direction}".`});
      const direction=normaliseDirection(rule.direction);
      if(direction!=='any') directional.push({index,direction});
      if(categoryNames.size&&!categoryNames.has(rule.category)) missingCategories.push({index,category:rule.category});
      const key=`${rule.keyword.toUpperCase()}\u0000${direction}`;
      const group=groups.get(key)||[];group.push({index,category:rule.category});groups.set(key,group);
    });
    const duplicates=[],conflicts=[];
    groups.forEach(group=>{
      if(group.length<2)return;
      const categoriesFound=[...new Set(group.map(item=>item.category))];
      const record={indices:group.map(item=>item.index),categories:categoriesFound};
      if(categoriesFound.length>1)conflicts.push(record);else duplicates.push(record);
    });
    return {count:Array.isArray(rules)?rules.length:0,invalid,missingCategories,directional,duplicates,conflicts,ok:!invalid.length&&!missingCategories.length&&!conflicts.length};
  }

  global.PocketLedgerRules={normaliseDirection,normaliseRule,normaliseRules,ruleMatches,suggestCategory,matchingTransactions,applyToUncategorised,auditRules};
})(window);
