(() => {
'use strict';
// Aktivasi ringan: hanya pembatas tampilan. Password dan JSON bersifat publik
// di situs statis; ini BUKAN keamanan untuk melindungi data rahasia.
const PASSWORD = 'rait123';
const ACCESS_KEY = 'planogram-ds-rait-access-v1';
const DB_NAME = 'planogram-DS-rait-v1';
const DB_STORE = 'files';
const DB_KEY = 'KZ01';
const $ = id => document.getElementById(id);
const gate = $('activationGate');
const intro = $('activationIntro');
const code = $('activationCode');
const state = $('activationStatus');
const form = $('activationForm');
const submit = $('activateBtn');
const dataBtn = $('downloadDataBtn');
const record = $('remoteDataState');
const info = $('remoteDataInfo');
const progress = $('remoteDataProgress');
const formatCount = n => Number(n).toLocaleString('id-ID');
let accessGranted = false;

function alreadyUnlocked() {
  try {return localStorage.getItem(ACCESS_KEY) === '1';}catch(e){return false;}
}
function saveUnlock() {
  try {localStorage.setItem(ACCESS_KEY,'1');return true;}catch(e){return false;}
}
function showGate(message) {
  gate.hidden = false;
  form.hidden = false;
  if(message) state.textContent = message;
}
function grantAccess(note) {
  if(!accessGranted) {
    accessGranted = true;
    window.__planogramAccessReady = true;
    gate.hidden = true;
    // Do not change scanning internals. Let the existing function start camera.
    window.__planogramWakeScanner?.();
    restoreData().catch(e => {
      progress.textContent='Tidak bisa memuat data lokal: '+e.message;
    });
  }
  dataBtn.disabled = false;
  if(note)record.textContent = note;
}
function enterPassword() {
  if(code.value.trim() !== PASSWORD) {
    state.textContent='Password salah. Periksa kembali atau hubungi @Raitttt.';
    code.value='';code.focus();
    return;
  }
  const persisted=saveUnlock();
  code.value='';
  grantAccess('Akses tersedia ✓');
  if(!persisted) progress.textContent='Browser membatasi penyimpanan izin. Password mungkin diminta lagi saat reload.';
}
function openLocalDB() {
  return new Promise((resolve,reject) => {
    if(!window.indexedDB) {reject(new Error('IndexedDB tidak tersedia. Hindari mode privat.'));return;}
    const req=indexedDB.open(DB_NAME,1);
    req.onupgradeneeded=()=>{if(!req.result.objectStoreNames.contains(DB_STORE))req.result.createObjectStore(DB_STORE);};
    req.onsuccess=()=>resolve(req.result);
    req.onerror=()=>reject(req.error||new Error('Gagal membuka penyimpanan lokal.'));
  });
}
async function readLocal() {
  const db=await openLocalDB();
  return new Promise((resolve,reject)=>{
    const tx=db.transaction(DB_STORE,'readonly');const req=tx.objectStore(DB_STORE).get(DB_KEY);
    req.onsuccess=()=>resolve(req.result||null);
    req.onerror=()=>reject(req.error||new Error('Gagal membaca data.'));
    tx.oncomplete=()=>db.close();tx.onabort=()=>db.close();
  });
}
async function writeLocal(next) {
  const db=await openLocalDB();
  try {
    await new Promise((resolve,reject)=>{
      const tx=db.transaction(DB_STORE,'readwrite');
      tx.objectStore(DB_STORE).put(next,DB_KEY);
      tx.oncomplete=resolve;
      tx.onerror=()=>reject(tx.error||new Error('Gagal menyimpan data.'));
      tx.onabort=()=>reject(tx.error||new Error('Penyimpanan dibatalkan.'));
    });
  } finally {db.close();}
}
function validatePlanogram(body) {
  if(!body || body.format !== 'RAIT_PLANOGRAM_V1' || !body.dataset || typeof body.dataset !== 'object')
    throw new Error('planogram.json belum sesuai format aplikasi.');
  const d=body.dataset;
  if(!Array.isArray(d.racks)||!Array.isArray(d.items)||!d.meta||d.racks.length<1||d.items.length<1)
    throw new Error('Data planogram belum tersedia. Data lokal lama tidak diubah.');
  if(d.racks.length>600||d.items.length>100000)
    throw new Error('Jumlah data di luar batas aplikasi.');
  for(const it of d.items) {
    if(!it||!String(it.plu||'')||!String(it.barcode||'')||!String(it.rack||'')||!String(it.name||'')||!String(it.locationCode||''))
      throw new Error('Ada item yang belum lengkap. Pembaruan dibatalkan.');
  }
  return d;
}
async function restoreData() {
  try {
    const saved=await readLocal();
    if(saved?.items?.length&&saved.racks?.length) {
      window.__planogramApplyData?.(saved);
      record.textContent='Tersimpan di HP ✓';
      info.textContent=`Data lokal: ${formatCount(saved.items.length)} item · ${saved.racks.length} rak · ${saved.meta.sourceDate||'tanpa tanggal'}`;
      dataBtn.textContent='↻ Perbarui Data Planogram';
      return;
    }
    record.textContent='Belum diunduh';
    info.textContent='Ketuk Download untuk memasang data planogram siap pakai ke HP ini.';
    dataBtn.textContent='↓ Download Data Planogram';
  } catch(e) {
    record.textContent='Penyimpanan belum siap';info.textContent=e.message;
  }
}
async function downloadData() {
  if(!accessGranted)return;
  dataBtn.disabled=true;progress.textContent='Mengunduh data terbaru…';
  try {
    const url=new URL('./planogram.json',location.href);
    url.searchParams.set('v',String(Date.now()));
    const res=await fetch(url.toString(),{cache:'no-store'});
    if(!res.ok)throw new Error('Server data merespons HTTP '+res.status);
    const text=await res.text();
    if(text.length>20*1024*1024)throw new Error('Ukuran data terlalu besar.');
    progress.textContent='Memeriksa kelengkapan data…';
    const next=validatePlanogram(JSON.parse(text));
    progress.textContent='Menyimpan dan memasang data di HP…';
    await writeLocal(next);
    window.__planogramApplyData?.(next);
    record.textContent='Tersimpan di HP ✓';
    info.textContent=`Data lokal: ${formatCount(next.items.length)} item · ${next.racks.length} rak · ${next.meta.sourceDate||'tanpa tanggal'}`;
    dataBtn.textContent='↻ Perbarui Data Planogram';
    progress.textContent='✅ Data planogram berhasil diambil/diperbarui. Scanner siap dipakai.';
  } catch(e) {
    console.warn('Pembaruan planogram:',e);
    progress.textContent='❌ '+(e.message||'Gagal mengunduh data. Data lama tetap aman.');
  } finally {dataBtn.disabled=!accessGranted;}
}

function init() {
  dataBtn.addEventListener('click',downloadData);
  submit.addEventListener('click',enterPassword);
  code.addEventListener('keydown',e=>{if(e.key==='Enter')enterPassword();});
  // Maintain existing Data button route; no Firebase admin interface.
  $('settingsBtn').onclick=()=>{$('remoteDataPanel').scrollIntoView({behavior:'smooth',block:'start'});};
  intro.textContent='Masukkan password sekali saja di browser ini untuk membuka aplikasi.';
  state.textContent='Password hanya diminta pada penggunaan pertama di browser ini.';
  if(alreadyUnlocked()) grantAccess();
  else showGate();
}
init();
})();
