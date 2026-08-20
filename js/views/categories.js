/* =========================================================
   CATEGORIES
   ========================================================= */
function renderCategories(c){
  c.innerHTML = `
    <div class="cat-cols">
      <div class="panel">
        <div class="panel-head"><div class="panel-title">Categories<small>Used across the dashboard, transactions and imports</small></div></div>
        <div class="cat-list" id="cat-list"></div>
      </div>
      <div class="panel">
        <div class="panel-head">
          <div class="panel-title">Auto-tagging rules<small>When a transaction description contains this text, suggest this category</small></div>
          <button class="btn btn-sm" id="btn-add-rule">${iconPlus()} Add rule</button>
        </div>
        <div class="cat-list" id="rule-list"></div>
      </div>
    </div>
    <div class="panel" style="margin-top:16px;">
      <div class="panel-head"><div class="panel-title">Merchant groupings<small>Combine different names for the same merchant on the Top Merchants panel — use the ✎ icon next to any merchant there to add one</small></div></div>
      <div class="cat-list" id="merchant-alias-list"></div>
    </div>
  `;
  renderCatList();
  renderRuleList();
  renderMerchantAliasList();
  document.getElementById('btn-add-rule').onclick = ()=> openRuleModal(null);
}
function renderMerchantAliasList(){
  const host = document.getElementById('merchant-alias-list');
  const entries = Object.entries(DB.merchantAliases);
  if(!entries.length){
    host.innerHTML = `<div class="empty-state" style="padding:16px;"><p style="font-size:12.5px;margin:0;">No groupings yet — merge merchants from the Top Merchants panel on the Dashboard.</p></div>`;
    return;
  }
  // Group by canonical name so multiple raw keys under one name show together.
  const byCanonical = {};
  entries.forEach(([raw, canonical])=>{ (byCanonical[canonical] = byCanonical[canonical] || []).push(raw); });
  host.innerHTML = Object.entries(byCanonical).map(([canonical, raws])=> `
    <div class="rule-row">
      <span class="kw">${escHTML(raws.join(', '))}</span>
      <span class="arrow">→</span>
      <span class="rc"><strong>${escHTML(canonical)}</strong></span>
      <button class="row-icon-btn" data-action="del-merchant-alias" data-raws="${escAttr(JSON.stringify(raws))}" title="Ungroup">${iconTrash()}</button>
    </div>
  `).join('');
  host.querySelectorAll('[data-action="del-merchant-alias"]').forEach(b=>{
    b.onclick = ()=>{
      JSON.parse(b.dataset.raws).forEach(rk=> delete DB.merchantAliases[rk]);
      scheduleSave(); renderMerchantAliasList(); toast('Ungrouped');
    };
  });
}
function renderCatList(){
  const host = document.getElementById('cat-list');
  const groups = [['income','Income'],['expense','Expense']];
  host.innerHTML = groups.map(([kind,label])=>{
    const cats = DB.categories.filter(c=>c.kind===kind);
    return `<div style="margin-bottom:6px;"><div style="font-size:11px;text-transform:uppercase;letter-spacing:.06em;color:var(--ink-faint);font-weight:700;margin:8px 2px 4px;">${label}</div>` +
      cats.map(cat=>{
        const used = DB.transactions.filter(t=>t.category===cat.name || (t.splits&&t.splits.some(s=>s.category===cat.name))).length;
        const isRegular = DB.regularCategories.includes(cat.name);
        const isDiscretionary = DB.discretionaryCategories.includes(cat.name);
        const isInvestment = DB.investmentCategories.includes(cat.name);
        const budget = DB.budgets[cat.name];
        return `<div class="cat-list-row">
          <span class="stamp ${kind==='income'?'c-income':'c-expense'}">${escHTML(cat.name)}</span>
          <span class="nm"></span>
          <span style="font-size:11.5px;color:var(--ink-faint);">${used} tx</span>
          <label class="regular-toggle" title="Estimate this category as a regular monthly ${kind==='income'?'income':'cost'} in Spending Plan, from your recent history — useful when the transactions vary in amount or description, like a credit card bill.">
            <input type="checkbox" data-action="toggle-regular" data-name="${escAttr(cat.name)}" ${isRegular?'checked':''}> Regular
          </label>
          ${kind==='expense' ? `<label class="regular-toggle" title="Flag this as discretionary (non-essential) spending, so it's included in Savings Opportunities on the dashboard.">
            <input type="checkbox" data-action="toggle-discretionary" data-name="${escAttr(cat.name)}" ${isDiscretionary?'checked':''}> Discretionary
          </label>` : ''}
          ${kind==='expense' ? `<label class="regular-toggle" title="Flag this as an investment/savings contribution, so it's tracked on the Investments tab.">
            <input type="checkbox" data-action="toggle-investment" data-name="${escAttr(cat.name)}" ${isInvestment?'checked':''}> Investment
          </label>` : ''}
          ${kind==='expense' ? `<label class="budget-input-wrap" title="Set a monthly budget for this category — shown as a progress bar on your dashboard.">
            Budget £<input type="number" min="0" step="1" class="budget-input" data-name="${escAttr(cat.name)}" value="${budget!=null?budget:''}" placeholder="—">/mo
          </label>` : ''}
          <button class="row-icon-btn" data-action="del-cat" data-name="${escAttr(cat.name)}" title="Delete">${iconTrash()}</button>
        </div>`;
      }).join('') + `</div>`;
  }).join('');
  host.querySelectorAll('[data-action="del-cat"]').forEach(b=> b.onclick = ()=> deleteCategory(b.dataset.name));
  host.querySelectorAll('.budget-input').forEach(inp=>{
    inp.addEventListener('change', (e)=>{
      const name = e.target.dataset.name;
      const v = parseFloat(e.target.value);
      if(isNaN(v) || v<=0){ delete DB.budgets[name]; e.target.value=''; }
      else DB.budgets[name] = v;
      scheduleSave();
      toast(isNaN(v)||v<=0 ? `Budget removed for ${name}` : `Budget for ${name} set to ${gbp(v)}/mo`);
    });
  });
  host.querySelectorAll('[data-action="toggle-regular"]').forEach(cb=>{
    cb.onchange = (e)=>{
      const name = e.target.dataset.name;
      if(e.target.checked){
        if(!DB.regularCategories.includes(name)) DB.regularCategories.push(name);
      } else {
        DB.regularCategories = DB.regularCategories.filter(n=>n!==name);
      }
      scheduleSave();
      toast(e.target.checked ? `${name} will be estimated as regular in Spending Plan` : `${name} no longer tracked as regular`);
    };
  });
  host.querySelectorAll('[data-action="toggle-discretionary"]').forEach(cb=>{
    cb.onchange = (e)=>{
      const name = e.target.dataset.name;
      if(e.target.checked){
        if(!DB.discretionaryCategories.includes(name)) DB.discretionaryCategories.push(name);
      } else {
        DB.discretionaryCategories = DB.discretionaryCategories.filter(n=>n!==name);
      }
      scheduleSave();
      toast(e.target.checked ? `${name} included in Savings Opportunities` : `${name} excluded from Savings Opportunities`);
    };
  });
  host.querySelectorAll('[data-action="toggle-investment"]').forEach(cb=>{
    cb.onchange = (e)=>{
      const name = e.target.dataset.name;
      if(e.target.checked){
        if(!DB.investmentCategories.includes(name)) DB.investmentCategories.push(name);
      } else {
        DB.investmentCategories = DB.investmentCategories.filter(n=>n!==name);
      }
      scheduleSave();
      toast(e.target.checked ? `${name} tracked on the Investments tab` : `${name} removed from the Investments tab`);
    };
  });
}
// Words that turn up constantly as bank-statement transaction-type noise
// rather than merchant names. A rule keyed on one of these (or anything very
// short) is much more likely to misfire across unrelated transactions than
// to correctly identify one merchant — usually a sign it was learned from a
// description before enough of the noise prefix had been stripped away.
const RULE_NOISE_WORDS = new Set([
  'CARD','PAYMENT','PAYMENTS','DIRECT','DEBIT','CREDIT','TRANSFER','TFR',
  'FASTER','STANDING','ORDER','THIRD','PARTY','BILL','CONTACTLESS','ONLINE',
  'RECEIPT','WITHDRAWAL','CASH','ATM','REF','REFERENCE','MANDATE','GBP',
  'MADE','FROM','TO','AT','VIA','NO','RATE','POS','MOBILE','APP','GIRO','BANK','SO','DD',
]);
// Learns a new auto-tagging rule from an already-categorised transaction,
// reusing the same noise-stripped merchant-name extraction used for merchant
// grouping and recurring detection. Returns the {keyword, category} that was
// learned, or null if nothing was added (no category, an existing rule
// already covers this description, or the merchant name is too short/vague
// to be a safe keyword) — callers use this to skip silently rather than
// create redundant or low-quality rules.
function learnRuleFromTransaction(t){
  if(!t || !t.category) return null;
  if(suggestCategory(t.description, t.amount)) return null;
  const word = merchantKeyFor(t.description).toUpperCase().replace(/[^A-Z0-9 ]/g,'').trim();
  if(word.length < 3) return null;
  if(DB.rules.some(r=> r.keyword.toUpperCase()===word)) return null;
  DB.rules.unshift({keyword:word, category:t.category});
  return {keyword:word, category:t.category};
}
function riskyRuleReason(keyword){
  const kw = (keyword||'').trim().toUpperCase();
  if(!kw) return '';
  if(RULE_NOISE_WORDS.has(kw)) return `"${kw}" is a common bank-statement word, not a merchant name — this rule may match far more transactions than intended.`;
  if(kw.length < 4) return `"${kw}" is quite short — it may match inside unrelated words or descriptions.`;
  return '';
}
function iconWarnTriangle(){ return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>`; }
function renderRuleList(){
  const host = document.getElementById('rule-list');
  if(!DB.rules.length){ host.innerHTML = `<div class="empty-state" style="padding:20px;"><p style="font-size:12.5px;">No rules yet. Add one to auto-suggest categories during import.</p></div>`; return; }
  const riskyCount = DB.rules.filter(r=> riskyRuleReason(r.keyword)).length;
  const audit=PocketLedgerRules.auditRules(DB.rules,DB.categories);
  const integrityProblems=audit.invalid.length+audit.missingCategories.length+audit.conflicts.length;
  const summary = `<div style="display:flex;flex-wrap:wrap;align-items:center;gap:8px;font-size:11.5px;margin-bottom:8px;">
    <span style="font-weight:700;color:${integrityProblems?'var(--expense)':'var(--income)'};">${integrityProblems?iconWarnTriangle():iconCheck()} ${audit.count} rules checked · ${audit.directional.length} direction-specific${integrityProblems?` · ${integrityProblems} integrity issue${integrityProblems===1?'':'s'}`:' · categories valid'}</span>
    ${audit.duplicates.length?`<span style="color:var(--ink-faint);">${audit.duplicates.length} exact duplicate${audit.duplicates.length===1?'':'s'} preserved</span>`:''}
    ${riskyCount?`<span style="color:var(--gold);font-weight:600;">${iconWarnTriangle()} ${riskyCount} generic-looking rule${riskyCount===1?'':'s'} to review</span>`:''}
  </div>`;
  host.innerHTML = summary + DB.rules.map((r,i)=>{
    const reason = riskyRuleReason(r.keyword);
    const impact = PocketLedgerRules.ruleImpact(DB.rules,DB.transactions,i);
    const dirBadge = r.direction==='out' ? `<span class="stamp-mini" style="color:var(--expense);background:var(--expense-wash);">money out only</span>`
      : r.direction==='in' ? `<span class="stamp-mini" style="color:var(--income);background:var(--income-wash);">money in only</span>` : '';
    return `
    <div class="rule-row">
      <span>if description contains</span>
      <span class="kw">${escHTML(r.keyword)}</span>
      ${dirBadge}
      ${reason ? `<span class="rule-risk-flag" style="color:var(--gold);cursor:help;" title="${escAttr(reason)}">${iconWarnTriangle()}</span>` : ''}
      <span class="arrow">→</span>
      <span class="rc"><strong>${escHTML(r.category)}</strong></span>
      <span style="font-size:10.5px;color:var(--ink-faint);white-space:nowrap;" title="${impact.shadowed?`${impact.shadowed} matching transaction${impact.shadowed===1?' is':'s are'} won by a more specific or higher-priority rule.`:'This rule wins every transaction it matches.'}">${impact.wins}/${impact.matches} active</span>
      <button class="row-icon-btn" data-action="move-rule-up" data-i="${i}" title="Raise priority" ${i===0?'disabled':''}>↑</button>
      <button class="row-icon-btn" data-action="move-rule-down" data-i="${i}" title="Lower priority" ${i===DB.rules.length-1?'disabled':''}>↓</button>
      <button class="row-icon-btn" data-action="edit-rule" data-i="${i}" title="Edit">${iconEdit()}</button>
      <button class="row-icon-btn" data-action="del-rule" data-i="${i}" title="Delete">${iconTrash()}</button>
    </div>
  `;
  }).join('');
  host.querySelectorAll('[data-action="edit-rule"]').forEach(b=> b.onclick = ()=> openRuleModal(parseInt(b.dataset.i)));
  host.querySelectorAll('[data-action="move-rule-up"],[data-action="move-rule-down"]').forEach(b=> b.onclick = ()=>{
    const from=parseInt(b.dataset.i);
    const to=from+(b.dataset.action==='move-rule-up'?-1:1);
    if(to<0||to>=DB.rules.length)return;
    [DB.rules[from],DB.rules[to]]=[DB.rules[to],DB.rules[from]];
    scheduleSave();renderRuleList();toast('Rule priority updated');
  });
  host.querySelectorAll('[data-action="del-rule"]').forEach(b=> b.onclick = ()=>{
    DB.rules.splice(parseInt(b.dataset.i),1); scheduleSave(); renderRuleList(); toast('Rule deleted');
  });
}
function deleteCategory(name){
  const used = DB.transactions.filter(t=>t.category===name || (t.splits&&t.splits.some(s=>s.category===name))).length;
  openModal(`
    <div class="modal-head"><h3>Delete “${escHTML(name)}”?</h3></div>
    <div class="modal-body"><p style="margin:0;color:var(--ink-soft);font-size:13px;">${used ? `${used} transaction${used===1?'':'s'} using this category will become Uncategorised.` : 'This category is not currently used.'}</p></div>
    <div class="modal-foot"><button class="btn" id="m-cancel">Cancel</button><button class="btn btn-danger" id="m-confirm">Delete</button></div>
  `);
  document.getElementById('m-cancel').onclick = closeModal;
  document.getElementById('m-confirm').onclick = ()=>{
    DB.categories = DB.categories.filter(c=>c.name!==name);
    DB.transactions.forEach(t=>{
      if(t.category===name) t.category='';
      if(t.splits) t.splits.forEach(s=>{ if(s.category===name) s.category=''; });
    });
    DB.rules = DB.rules.filter(r=>r.category!==name);
    DB.regularCategories = DB.regularCategories.filter(n=>n!==name);
    DB.discretionaryCategories = DB.discretionaryCategories.filter(n=>n!==name);
    DB.investmentCategories = DB.investmentCategories.filter(n=>n!==name);
    DB.pendingCards = DB.pendingCards.filter(c=>c.category!==name);
    delete DB.budgets[name];
    scheduleSave(); closeModal(); renderContent(); toast('Category deleted');
  };
}
function openCategoryModal(){
  openModal(`
    <div class="modal-head"><h3>Add category</h3></div>
    <div class="modal-body">
      <div class="form-grid">
        <div class="field span2"><label>Name</label><input type="text" id="c-name" placeholder="e.g. Pets"></div>
        <div class="field span2"><label>Type</label>
          <div class="seg" id="c-type-seg"><button type="button" data-k="expense" class="active">Expense</button><button type="button" data-k="income">Income</button></div>
        </div>
      </div>
    </div>
    <div class="modal-foot"><button class="btn" id="m-cancel">Cancel</button><button class="btn btn-primary" id="m-save">Add category</button></div>
  `);
  let kind='expense';
  document.getElementById('c-type-seg').addEventListener('click', e=>{
    const b = e.target.closest('button'); if(!b) return;
    kind = b.dataset.k;
    document.querySelectorAll('#c-type-seg button').forEach(x=>x.classList.toggle('active', x===b));
  });
  document.getElementById('m-cancel').onclick = closeModal;
  document.getElementById('m-save').onclick = ()=>{
    const name = document.getElementById('c-name').value.trim();
    if(!name){ toast('Enter a category name', 'error'); return; }
    if(DB.categories.some(c=>c.name.toLowerCase()===name.toLowerCase())){ toast('That category already exists', 'error'); return; }
    DB.categories.push({name, kind});
    scheduleSave(); closeModal(); renderContent(); toast('Category added');
  };
}
function ruleMatchPreview(keyword, category, direction, index){
  return PocketLedgerRules.simulateRule({keyword,category,direction},DB.transactions,DB.rules,index);
}
function openRuleModal(index){
  const isEdit = index!=null && index>=0;
  const rule = isEdit ? DB.rules[index] : null;
  const dir = rule?.direction || 'any';
  openModal(`
    <div class="modal-head"><h3>${isEdit?'Edit':'Add'} auto-tagging rule</h3></div>
    <div class="modal-body">
      <div class="form-grid">
        <div class="field span2"><label>If description contains</label><input type="text" id="r-kw" value="${rule?escAttr(rule.keyword):''}" placeholder="e.g. TESCO"></div>
        <div class="field span2"><label>Assign category</label><select id="r-cat">${categoryOptionsHTML(rule?rule.category:'', {includeUncategorized:false})}</select></div>
        <div class="field span2">
          <label>Applies to</label>
          <select id="r-dir">
            <option value="any" ${dir==='any'?'selected':''}>Any amount</option>
            <option value="out" ${dir==='out'?'selected':''}>Money out only (expenses)</option>
            <option value="in" ${dir==='in'?'selected':''}>Money in only (income)</option>
          </select>
          <p style="font-size:11px;color:var(--ink-faint);margin:4px 2px 0;">Use this if the same wording shows up for both directions — e.g. a transfer to and from savings — and each direction should get a different category.</p>
        </div>
        <div class="field span2">
          <div id="rule-preview" style="font-size:12px;background:var(--surface-2);border:1px solid var(--line);border-radius:8px;padding:10px 12px;line-height:1.6;"></div>
        </div>
      </div>
    </div>
    <div class="modal-foot"><button class="btn" id="m-cancel">Cancel</button><button class="btn btn-primary" id="m-save">${isEdit?'Save changes':'Add rule'}</button></div>
  `);
  function updatePreview(){
    const kw = document.getElementById('r-kw').value;
    const direction = document.getElementById('r-dir').value;
    const preview = document.getElementById('rule-preview');
    if(!kw.trim()){
      preview.innerHTML = `<span style="color:var(--ink-faint);">Start typing to see how many transactions this would match.</span>`;
      return;
    }
    const category = document.getElementById('r-cat').value;
    const {matches,wins,uncategorised,changes,conflicts,examples} = ruleMatchPreview(kw, category, direction, isEdit?index:null);
    const reason = riskyRuleReason(kw);
    preview.innerHTML = `
      <div style="display:flex;align-items:center;gap:6px;font-weight:600;color:${reason?'var(--gold)':'var(--ink)'};">
        ${reason ? iconWarnTriangle() : ''}
        Matches ${matches} transaction${matches===1?'':'s'} · wins ${wins}${matches>wins?` · ${matches-wins} superseded by a more specific rule`:''}
      </div>
      <div style="margin-top:4px;color:var(--ink-faint);">${uncategorised} uncategorised · ${changes} category change${changes===1?'':'s'}${conflicts?` · <span style="color:var(--gold);">${conflicts} competing-category match${conflicts===1?'':'es'}</span>`:''}</div>
      ${examples.length ? `<div style="margin-top:4px;color:var(--ink-faint);">e.g. ${examples.map(e=>escHTML(e.description)).join(' · ')}</div>` : ''}
      ${reason ? `<div style="margin-top:4px;color:var(--gold);">${escHTML(reason)}</div>` : ''}
    `;
  }
  document.getElementById('r-kw').addEventListener('input', updatePreview);
  document.getElementById('r-dir').addEventListener('change', updatePreview);
  document.getElementById('r-cat').addEventListener('change', updatePreview);
  updatePreview();
  document.getElementById('m-cancel').onclick = closeModal;
  document.getElementById('m-save').onclick = ()=>{
    const kw = document.getElementById('r-kw').value.trim();
    const cat = document.getElementById('r-cat').value;
    const direction = document.getElementById('r-dir').value;
    if(!kw){ toast('Enter text to match', 'error'); return; }
    if(isEdit){
      DB.rules[index] = {keyword:kw, category:cat, direction};
    } else {
      DB.rules.unshift({keyword:kw, category:cat, direction});
    }
    const applied = applyRuleToUncategorised(kw, cat, direction);
    scheduleSave(); closeModal(); renderCategories(document.getElementById('content')); renderSidebarBits();
    toast(applied ? `Rule ${isEdit?'updated':'added'} — applied to ${applied} existing uncategorised transaction${applied===1?'':'s'}` : `Rule ${isEdit?'updated':'added'}`);
  };
}
function applyRuleToUncategorised(keyword, category, direction){
  return PocketLedgerRules.applyToUncategorised(DB.transactions,keyword,category,direction);
}
