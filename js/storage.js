(function(global){
  'use strict';

  function create(options){
    options=options||{};
    const idb=options.indexedDB;
    const local=options.localStorage;
    const localKey=options.localKey||'pocketledger_data_v1';
    const fallbackKey=`${localKey}:fallback`;
    const dbName=options.dbName||'pocketledger';
    const storeName=options.storeName||'ledger';
    const recordKey='primary';
    let db=null,initialising=null;
    const state={mode:'starting',migrated:false,verified:false,hasLegacyCopy:false,fallbackReason:''};

    function localOriginal(){try{return local&&local.getItem(localKey);}catch(e){return null;}}
    function localFallback(){try{return local&&local.getItem(fallbackKey);}catch(e){return null;}}
    function localGet(){return localFallback()??localOriginal();}
    function localSet(value){if(!local)throw new Error('Browser storage is unavailable.');local.setItem(fallbackKey,value);}
    function openDB(){
      return new Promise((resolve,reject)=>{
        if(!idb){reject(new Error('IndexedDB is unavailable.'));return;}
        const request=idb.open(dbName,1);
        request.onupgradeneeded=()=>{if(!request.result.objectStoreNames.contains(storeName))request.result.createObjectStore(storeName);};
        request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error||new Error('Could not open IndexedDB.'));
        request.onblocked=()=>reject(new Error('IndexedDB upgrade was blocked by another app window.'));
      });
    }
    function request(mode,operation){
      return new Promise((resolve,reject)=>{
        let tx;
        try{tx=db.transaction(storeName,mode);}catch(e){reject(e);return;}
        const store=tx.objectStore(storeName),req=operation(store);
        req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error||new Error('IndexedDB request failed.'));
      });
    }
    async function getRecord(){return request('readonly',store=>store.get(recordKey));}
    async function putText(json,source){
      await request('readwrite',store=>store.put({json,savedAt:new Date().toISOString(),source:source||'app'},recordKey));
    }
    async function init(){
      if(initialising)return initialising;
      initialising=(async()=>{
        const legacy=localOriginal(),fallback=localFallback();state.hasLegacyCopy=legacy!=null;
        try{
          db=await openDB();
          let record=await getRecord();
          const migrationSource=fallback??(!record?legacy:null);
          if(migrationSource!=null){
            await putText(migrationSource,fallback!=null?'fallback-recovery':'localStorage-migration');record=await getRecord();
            if(!record||record.json!==migrationSource)throw new Error('IndexedDB migration read-back did not match the original data.');
            if(fallback!=null)try{local.removeItem(fallbackKey);}catch(e){/* harmless: the verified database copy wins */}
            state.migrated=true;state.verified=true;
          }
          state.mode='indexeddb';return state;
        }catch(error){
          state.mode='localstorage';state.fallbackReason=error&&error.message?error.message:String(error);return state;
        }
      })();
      return initialising;
    }
    async function load(){
      await init();
      if(state.mode==='indexeddb'){
        const record=await getRecord();return record&&typeof record.json==='string'?record.json:null;
      }
      return localGet();
    }
    async function save(json){
      await init();
      if(state.mode==='indexeddb'){
        try{await putText(json,'app');return;}
        catch(error){state.mode='localstorage';state.fallbackReason=error&&error.message?error.message:String(error);}
      }
      localSet(json);
    }
    function status(){return Object.assign({},state);}
    function getLegacyCopy(){return localOriginal();}
    function close(){if(db)db.close();db=null;}
    return {init,load,save,status,getLegacyCopy,close};
  }

  global.PocketLedgerStorage={create};
})(window);
