(function(global){
  'use strict';

  function create(deps){
    const {getDB,accountTypes,accountTypeConfig,isLiabilityType,gbp,escHTML,iconEdit,iconUndo,iconXSmall,openAccountModal,syncLegacyAccounts,scheduleSave,toast}=deps;
    const doc=deps.document||global.document;

    function typeOptions(selected){
      const assets=accountTypes.filter(type=>type.group==='asset'),liabilities=accountTypes.filter(type=>type.group==='liability');
      const options=types=>types.map(type=>`<option value="${type.value}" ${type.value===selected?'selected':''}>${type.label}</option>`).join('');
      return `<optgroup label="Assets">${options(assets)}</optgroup><optgroup label="Liabilities">${options(liabilities)}</optgroup>`;
    }

    function render(){
      const host=doc.getElementById('account-manager-body');if(!host)return;
      const database=getDB(),records=(database.accountRecords||[]).slice().sort((a,b)=>Number(a.archived)-Number(b.archived)||a.name.localeCompare(b.name));
      if(!records.length){host.innerHTML='<p style="font-size:11.5px;color:var(--ink-faint);margin:0;">No accounts yet — add one above.</p>';return;}
      host.innerHTML=`<div style="display:flex;flex-direction:column;gap:8px;">${records.map(record=>{
        const usedCount=database.transactions.filter(transaction=>transaction.account===record.name).length,type=accountTypeConfig(record.type);
        return `<div class="budget-input-wrap" style="justify-content:space-between;opacity:${record.archived?'.65':'1'};"><span><strong style="color:var(--ink);">${escHTML(record.name)}</strong> <span style="color:var(--ink-faint);font-size:10.5px;">${escHTML(type.label)} · ${usedCount} tx${record.archived?' · archived':''}</span><br><span class="num" style="font-size:10.5px;color:var(--ink-faint);">Opening ${isLiabilityType(record.type)&&record.openingBalance<0?`${gbp(Math.abs(record.openingBalance))} owed`:gbp(record.openingBalance)}${record.institution?` · ${escHTML(record.institution)}`:''}</span></span><span style="display:flex;align-items:center;gap:4px;"><button class="row-icon-btn" data-action="edit-account" data-id="${record.id}" title="Edit account">${iconEdit()}</button><button class="row-icon-btn" data-action="archive-account" data-id="${record.id}" title="${record.archived?'Restore account':'Archive account'}">${record.archived?iconUndo():iconXSmall()}</button></span></div>`;
      }).join('')}</div>`;
      host.querySelectorAll('[data-action="edit-account"]').forEach(button=>{button.onclick=()=>openAccountModal(button.dataset.id);});
      host.querySelectorAll('[data-action="archive-account"]').forEach(button=>{
        button.onclick=()=>{
          const record=getDB().accountRecords.find(item=>item.id===button.dataset.id);if(!record)return;
          record.archived=!record.archived;syncLegacyAccounts();scheduleSave();render();
          toast(record.archived?`Archived "${record.name}"`:`Restored "${record.name}"`);
        };
      });
    }

    return {render,typeOptions};
  }

  global.PocketLedgerAccountsView={create};
})(window);
