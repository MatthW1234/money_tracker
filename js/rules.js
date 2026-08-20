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
    const match=explainMatch(rules,description,amount);
    return match?match.rule.category:'';
  }

  // Rules remain specificity-first for backwards compatibility: the longest
  // matching keyword wins. Array order is the visible priority when two
  // matching keywords are equally specific.
  function explainMatch(rules,description,amount){
    const candidates=[];
    (rules||[]).forEach((rule,index)=>{
      if(!ruleMatches(rule,description,amount)) return;
      candidates.push({rule,index,keywordLength:String(rule.keyword||'').length});
    });
    candidates.sort((a,b)=>b.keywordLength-a.keywordLength || a.index-b.index);
    if(!candidates.length) return null;
    return {rule:candidates[0].rule,index:candidates[0].index,candidates,reason:candidates.length===1
      ? `Matched “${candidates[0].rule.keyword}”.`
      : `“${candidates[0].rule.keyword}” won as the most specific match${candidates[0].keywordLength===candidates[1].keywordLength?' and highest-priority tie':''}.`};
  }

  function simulateRule(rule,transactions,rules,replacingIndex){
    const draft=normaliseRule(rule);
    if(!draft || !String(draft.keyword||'').trim()) return {matches:0,wins:0,uncategorised:0,changes:0,conflicts:0,examples:[]};
    const projected=(rules||[]).slice();
    if(Number.isInteger(replacingIndex) && replacingIndex>=0 && replacingIndex<projected.length) projected[replacingIndex]=draft;
    else projected.unshift(draft);
    const draftIndex=Number.isInteger(replacingIndex) && replacingIndex>=0 ? replacingIndex : 0;
    let matches=0,wins=0,uncategorised=0,changes=0,conflicts=0;
    const examples=[];
    (transactions||[]).forEach(t=>{
      if(t.transferId || !ruleMatches(draft,t.description,t.amount)) return;
      matches++;
      const outcome=explainMatch(projected,t.description,t.amount);
      if(!outcome || outcome.index!==draftIndex) return;
      wins++;
      if(!t.category && !(t.splits&&t.splits.length)) uncategorised++;
      if(!t.splits?.length && t.category!==draft.category) changes++;
      if(outcome.candidates.some(c=>c.index!==draftIndex && c.rule.category!==draft.category)) conflicts++;
      if(examples.length<5) examples.push({description:t.description,amount:t.amount,currentCategory:t.category||'',candidateCount:outcome.candidates.length});
    });
    return {matches,wins,uncategorised,changes,conflicts,examples};
  }

  function ruleImpact(rules,transactions,index){
    const rule=(rules||[])[index];
    if(!rule) return {matches:0,wins:0,shadowed:0};
    let matches=0,wins=0;
    (transactions||[]).forEach(t=>{
      if(t.transferId || !ruleMatches(rule,t.description,t.amount)) return;
      matches++;
      const outcome=explainMatch(rules,t.description,t.amount);
      if(outcome&&outcome.index===index) wins++;
    });
    return {matches,wins,shadowed:matches-wins};
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

  global.PocketLedgerRules={normaliseDirection,normaliseRule,normaliseRules,ruleMatches,suggestCategory,explainMatch,simulateRule,ruleImpact,matchingTransactions,applyToUncategorised,auditRules};
})(window);
