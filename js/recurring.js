/* ---------- recurring transaction detection ---------- */
// UK bank statements pad the real merchant name with boilerplate on either
// side — a payment-type prefix ("CARD PAYMENT TO", "DIRECT DEBIT PAYMENT
// TO"...) and often a per-transaction reference/order code suffix ("AMAZON
// PRIME*KJ66U0E55" — a different code every time). Both get stripped before
// the merchant name itself is extracted, so the same merchant groups
// together correctly across transactions.
const DESC_NOISE_PREFIXES = [
  'THIRD PARTY PAYMENT MADE VIA FASTER PAYMENT TO', 'THIRD PARTY PAYMENT MADE VIA FASTER PAYMENT FROM',
  'BILL PAYMENT VIA FASTER PAYMENT TO', 'BILL PAYMENT VIA FASTER PAYMENT FROM',
  'DIRECT DEBIT PAYMENT TO', 'REGULAR TRANSFER PAYMENT TO',
  'FASTER PAYMENTS RECEIPT REF.', 'FASTER PAYMENT RECEIPT REF.',
  'FASTER PAYMENTS RECEIPT', 'FASTER PAYMENT RECEIPT',
  'CONTACTLESS PAYMENT TO', 'DEBIT CARD PAYMENT TO',
  'ONLINE PAYMENT TO', 'STANDING ORDER TO', 'STANDING ORDER',
  'DIRECT DEBIT TO', 'DIRECT DEBIT',
  'THIRD PARTY PAYMENT TO', 'THIRD PARTY PAYMENT',
  'BILL PAYMENT TO', 'BILL PAYMENT FROM', 'BILL PAYMENT VIA', 'BILL PAYMENT',
  'BANK GIRO CREDIT REF', 'BANK GIRO CREDIT',
  'CASH WITHDRAWAL AT', 'CASH WITHDRAWAL', 'ATM WITHDRAWAL AT', 'ATM WITHDRAWAL',
  'CARD PAYMENT TO', 'CARD PAYMENT',
  'TRANSFER TO', 'TRANSFER FROM', 'PAYMENT TO', 'PAYMENT FROM',
].sort((a,b)=> b.length-a.length);
const DESC_NOISE_PHRASES = ['GOOGLE PAY','APPLE PAY','SAMSUNG PAY'];
const DESC_STOP_WORDS = new Set(['REF','REFERENCE','MANDATE','GBP','RATE','ON','VIA','MADE','FROM','TO','AT','NO']);

function stripDescPrefix(s){
  let changed = true, iterations = 0;
  while(changed && iterations<3){
    changed = false;
    for(const p of DESC_NOISE_PREFIXES){
      if(s.startsWith(p)){ s = s.slice(p.length).trim(); changed = true; break; }
    }
    iterations++;
  }
  return s;
}
function normalizeDescForRecurring(desc){
  let s = String(desc||'').toUpperCase().trim();
  s = stripDescPrefix(s);
  // "AMAZON PRIME*KJ66U0E55" / "UBER *TRIP HELP.UBER.C" — everything from the
  // first * onwards is almost always a per-transaction code, not the merchant.
  const starIdx = s.indexOf('*');
  if(starIdx > 0) s = s.slice(0, starIdx).trim();
  DESC_NOISE_PHRASES.forEach(p=>{ s = s.split(p).join(' '); });
  s = s.replace(/[0-9]/g,' ').replace(/[^A-Z ]/g,' ').replace(/\s+/g,' ').trim();
  const words = s.split(' ').filter(w=> w && !DESC_STOP_WORDS.has(w));
  const deduped = words.filter((w,i)=> words.indexOf(w)===i);
  const result = deduped.slice(0,2).join(' ');
  return result || s.split(' ').filter(Boolean).slice(0,2).join(' ');
}
function daysBetween(a,b){
  return Math.round((new Date(b+'T00:00:00') - new Date(a+'T00:00:00')) / 86400000);
}
function recurringKey(descKey, amount){ return descKey+'|'+Math.round(amount); }
function detectRecurring(){
  const byDesc = {};
  DB.transactions.forEach(t=>{
    if(!countsTowardTotals(t)) return;
    if(t.splits && t.splits.length) return; // split transactions don't have one category to cluster on
    const key = normalizeDescForRecurring(t.description);
    if(!key) return;
    (byDesc[key] = byDesc[key] || []).push(t);
  });
  const results = [];
  Object.entries(byDesc).forEach(([descKey, txs])=>{
    if(txs.length < 2) return;
    // Cluster same-description transactions by similar amount (tolerant of a
    // few pence of rounding, but not genuinely different amounts).
    const sorted = [...txs].sort((a,b)=> a.amount-b.amount);
    const clusters = [];
    sorted.forEach(t=>{
      const c = clusters.find(c=> Math.abs(t.amount - c.avg) <= Math.max(1, Math.abs(c.avg)*0.05));
      if(c){ c.items.push(t); c.avg = c.items.reduce((s,x)=>s+x.amount,0)/c.items.length; }
      else clusters.push({avg:t.amount, items:[t]});
    });
    clusters.forEach(c=>{
      if(c.items.length < 2) return;
      const byDate = [...c.items].sort((a,b)=> a.date.localeCompare(b.date));
      const gaps = [];
      for(let i=1;i<byDate.length;i++) gaps.push(daysBetween(byDate[i-1].date, byDate[i].date));
      const avgGap = gaps.reduce((s,g)=>s+g,0)/gaps.length;
      // "Roughly monthly": every gap between 10–45 days, averaging 24–36 days.
      // Loose enough to survive weekends/bank holidays shifting a date a bit.
      const plausible = gaps.every(g=> g>=10 && g<=45) && avgGap>=24 && avgGap<=36;
      if(!plausible) return;
      const last = byDate[byDate.length-1];
      results.push({
        key: recurringKey(descKey, c.avg),
        description: last.description,
        amount: c.avg,
        category: last.category,
        account: last.account||'',
        occurrences: byDate.length,
        avgIntervalDays: Math.round(avgGap),
        lastDate: last.date,
        nextExpected: addDays(last.date, Math.round(avgGap)),
      });
    });
  });
  return results.sort((a,b)=> a.amount - b.amount);
}
// detectRecurring() clusters by amount similarity first, which is right for
// its own purpose (matching "the same regular payment") but means a bill
// whose price actually changed gets split into two unrelated clusters
// rather than recognised as one bill that crept up. This groups by
// description only and compares early vs recent amounts directly.
function detectBillCreep(){
  const byDesc = {};
  DB.transactions.forEach(t=>{
    if(!countsTowardTotals(t) || (t.splits && t.splits.length)) return;
    if(t.amount>=0) return;
    const key = normalizeDescForRecurring(t.description);
    if(!key) return;
    (byDesc[key] = byDesc[key] || []).push(t);
  });
  const results = [];
  Object.entries(byDesc).forEach(([descKey, txs])=>{
    if(txs.length < 3) return;
    const byDate = [...txs].sort((a,b)=> a.date.localeCompare(b.date));
    const gaps = [];
    for(let i=1;i<byDate.length;i++) gaps.push(daysBetween(byDate[i-1].date, byDate[i].date));
    const avgGap = gaps.reduce((s,g)=>s+g,0)/gaps.length;
    // Looser than detectRecurring's window — creep detection just needs
    // "roughly monthly", not a strictly unbroken run.
    const plausible = gaps.every(g=> g>=15 && g<=60) && avgGap>=20 && avgGap<=40;
    if(!plausible) return;
    const n = Math.min(2, Math.floor(byDate.length/2)) || 1;
    const avgOf = arr => arr.reduce((s,t)=>s+Math.abs(t.amount),0)/arr.length;
    const firstAmt = avgOf(byDate.slice(0, n));
    const lastAmt = avgOf(byDate.slice(-n));
    const increase = lastAmt - firstAmt;
    const pct = firstAmt>0 ? (increase/firstAmt*100) : 0;
    if(increase <= 1 || pct < 5) return; // ignore rounding noise / trivial changes
    const last = byDate[byDate.length-1];
    results.push({
      description: last.description, category: last.category,
      firstAmt, lastAmt, increase, pct,
      firstDate: byDate[0].date, lastDate: last.date, occurrences: byDate.length,
    });
  });
  return results.sort((a,b)=> b.pct-a.pct);
}
