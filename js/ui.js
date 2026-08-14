(function(global){
  'use strict';

  function create(options){
    const now=(options&&options.now)||(()=>Date.now());
    function gbp(value,opts){
      opts=opts||{};value=Number(value)||0;
      const negative=value<-0.004,formatted='£'+Math.abs(value).toLocaleString('en-GB',{minimumFractionDigits:2,maximumFractionDigits:2});
      if(opts.signed&&value>0.004)return '+'+formatted;
      if(negative)return opts.parens?'('+formatted+')':'-'+formatted;
      return formatted;
    }
    function ukDate(iso){
      if(!iso)return '';
      const date=new Date(iso+'T00:00:00');
      return Number.isNaN(date.getTime())?iso:date.toLocaleDateString('en-GB',{day:'2-digit',month:'short',year:'numeric'});
    }
    function ukDateShort(iso){
      const date=new Date(iso+'T00:00:00');
      return Number.isNaN(date.getTime())?iso:date.toLocaleDateString('en-GB',{day:'2-digit',month:'short'});
    }
    function timeAgoLabel(iso){
      const then=new Date(iso);if(Number.isNaN(then.getTime()))return '';
      const minutes=Math.floor((now()-then.getTime())/60000);
      if(minutes<1)return 'just now';
      if(minutes<60)return `${minutes} minute${minutes===1?'':'s'} ago`;
      const hours=Math.floor(minutes/60);
      if(hours<24)return `${hours} hour${hours===1?'':'s'} ago`;
      const days=Math.floor(hours/24);
      if(days===1)return 'yesterday';
      if(days<7)return `${days} days ago`;
      return then.toLocaleDateString('en-GB',{day:'2-digit',month:'short',year:'numeric'});
    }
    function monthLabel(key){
      const [year,month]=String(key||'').split('-'),date=new Date(parseInt(year,10),parseInt(month,10)-1,1);
      return date.toLocaleDateString('en-GB',{month:'short',year:'2-digit'});
    }
    function escHTML(value){return String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));}
    function escAttr(value){return escHTML(value);}
    function statusLabel(status){return status==='reconciled'?'Reconciled':(status==='pending'?'Pending':'Cleared');}
    function statusPillHTML(status){
      status=['pending','cleared','reconciled'].includes(status)?status:'cleared';
      return `<span class="status-pill status-${status}">${statusLabel(status)}</span>`;
    }
    return {gbp,ukDate,ukDateShort,timeAgoLabel,monthLabel,escHTML,escAttr,statusLabel,statusPillHTML};
  }

  global.PocketLedgerUI={create};
})(window);
