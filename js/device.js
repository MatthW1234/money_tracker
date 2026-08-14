/* ---------- Theme (light / dark / auto) ----------
   Stored separately from the main DB, same pattern as the app lock — it's a
   device/browser preference, not ledger data, so it doesn't belong in
   backups or sync with it. Applied as data-theme="light"|"dark" on <html>;
   "auto" resolves to whichever the OS prefers and stays live if that changes
   while the app is open. */
const THEME_KEY = 'pocketledger_theme_v1';
function getThemePref(){
  try{ return window.localStorage.getItem(THEME_KEY) || 'auto'; }catch(e){ return 'auto'; }
}
function setThemePref(mode){
  try{ window.localStorage.setItem(THEME_KEY, mode); }catch(e){ /* ignore */ }
}
function systemPrefersDark(){
  return !!(window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches);
}
function resolvedTheme(){
  const pref = getThemePref();
  return pref==='auto' ? (systemPrefersDark() ? 'dark' : 'light') : pref;
}
function isDarkMode(){ return document.documentElement.getAttribute('data-theme') === 'dark'; }
function applyTheme(){
  document.documentElement.setAttribute('data-theme', resolvedTheme());
  updateThemeToggleIcon();
}
function updateThemeToggleIcon(){
  const btn = document.getElementById('btn-theme-toggle');
  if(!btn) return;
  const dark = isDarkMode();
  btn.innerHTML = dark ? iconSun() : iconMoon();
  btn.title = dark ? 'Switch to light theme' : 'Switch to dark theme';
}
function iconSun(){ return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"/></svg>`; }
function iconMoon(){ return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79Z"/></svg>`; }
if(window.matchMedia){
  const mq = window.matchMedia('(prefers-color-scheme: dark)');
  const onSystemThemeChange = ()=>{ if(getThemePref()==='auto') applyTheme(); };
  if(mq.addEventListener) mq.addEventListener('change', onSystemThemeChange);
  else if(mq.addListener) mq.addListener(onSystemThemeChange); // older Safari
}
applyTheme(); // set before first paint so the app never flashes the wrong theme

/* ---------- App lock (PIN gate) ----------
   This is a screen lock, not encryption: your data still sits as plain JSON
   in localStorage either way (that's what lets "Forgot PIN?" recover it
   without losing anything). What this protects against is someone picking
   up your unlocked phone/laptop and opening the installed app — it does not
   protect against someone opening browser dev tools on the device itself. */
const LOCK_KEY = 'pocketledger_lock_v1';
const LOCK_SUPPORTED = !!(window.crypto && window.crypto.subtle && window.localStorage);

function randomSaltHex(){
  const bytes = new Uint8Array(16);
  window.crypto.getRandomValues(bytes);
  return Array.from(bytes, b=>b.toString(16).padStart(2,'0')).join('');
}
async function sha256Hex(str){
  const buf = await window.crypto.subtle.digest('SHA-256', new TextEncoder().encode(str));
  return Array.from(new Uint8Array(buf), b=>b.toString(16).padStart(2,'0')).join('');
}
function getLockConfig(){
  if(!LOCK_SUPPORTED) return null;
  try{
    const raw = window.localStorage.getItem(LOCK_KEY);
    return raw ? JSON.parse(raw) : null;
  }catch(e){ return null; }
}
function isLockEnabled(){
  const cfg = getLockConfig();
  return !!(cfg && cfg.hash && cfg.salt);
}
async function setPin(pin){
  const salt = randomSaltHex();
  const hash = await sha256Hex(salt + pin);
  window.localStorage.setItem(LOCK_KEY, JSON.stringify({salt, hash}));
}
function removeLock(){
  window.localStorage.removeItem(LOCK_KEY);
}
async function verifyPin(pin){
  const cfg = getLockConfig();
  if(!cfg) return true;
  const hash = await sha256Hex(cfg.salt + pin);
  return hash === cfg.hash;
}

let lockScreenWired = false;
function showLockScreen(){
  document.getElementById('app').classList.add('hidden');
  const screen = document.getElementById('lock-screen');
  screen.classList.remove('hidden');
  const input = document.getElementById('lock-pin-input');
  input.value = '';
  document.getElementById('lock-error').textContent = '';
  setTimeout(()=> input.focus(), 50);
  if(!lockScreenWired){
    lockScreenWired = true;
    const tryUnlock = async ()=>{
      const ok = await verifyPin(input.value);
      if(ok){ hideLockScreen(); }
      else{
        document.getElementById('lock-error').textContent = 'Incorrect PIN — try again';
        input.value = ''; input.focus();
      }
    };
    document.getElementById('lock-unlock-btn').onclick = tryUnlock;
    input.addEventListener('keydown', (e)=>{ if(e.key === 'Enter') tryUnlock(); });
    document.getElementById('lock-forgot-btn').onclick = ()=>{
      document.getElementById('lock-card-sub').textContent =
        'Removing the app lock does not delete any of your data — it just turns the PIN screen off. You can set a new PIN afterwards from Settings.';
      document.getElementById('lock-unlock-btn').textContent = 'Remove app lock and continue';
      document.getElementById('lock-pin-input').classList.add('hidden');
      document.getElementById('lock-error').textContent = '';
      document.getElementById('lock-forgot-btn').classList.add('hidden');
      document.getElementById('lock-unlock-btn').onclick = ()=>{ removeLock(); hideLockScreen(); };
    };
  }
}
function hideLockScreen(){
  document.getElementById('lock-screen').classList.add('hidden');
  document.getElementById('app').classList.remove('hidden');
  startApp();
}
function lockNow(){
  if(!isLockEnabled()) return;
  showLockScreen();
}

