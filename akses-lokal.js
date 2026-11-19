(() => {
'use strict';
// Data planogram disimpan di IndexedDB, pencarian tetap lokal di setiap HP.
// Tidak memakai sistem aktivasi atau Firebase. Gunakan HTTPS GitHub Pages.
const DB_NAME = 'planogram-DS-rait-v1'; // sama dengan versi lama agar data lama dapat dipakai
const DB_STORE = 'files';
const DB_KEY = 'KZ01';
const $ = id => document.getElementById(id);
const dataBtn = $('downloadDataBtn');
const record = $('remoteDataState');
const info = $('remoteDataInfo');
const progress = $('remoteDataProgress');
const dataModal = $('dataModal');
const dataDone = $('dataModalDone');
const cloudDot = $('cloudStatusDot');
const formatCount = n => Number(n).toLocaleString('id-ID');
let hasLocalData = false;
let downloadInProgress = false;

// Kamera bawaan aplikasi lama tetap dapat memulai otomatis.
window.__planogramAccessReady = false; // aktif setelah data lokal siap

function setDataReady(ready) {
  hasLocalData = !!ready;
  cloudDot?.classList.toggle('ready',hasLocalData);
  dataDone.disabled = !hasLocalData;
  $('settingsBtn').setAttribute('aria-label',hasLocalData?'Data tersimpan. Buka untuk memperbarui planogram':'Unduh data planogram ke HP');
}
function openDataModal(firstUse=false) {
  $('dataModalHelp').textContent = firstUse
    ? 'Selamat datang! Unduh data planogram sekali saja agar pencarian barcode dan posisi rak siap digunakan di HP ini.'
    : 'Data disimpan di HP. Tekan perbarui jika ada planogram toko yang lebih baru.';
  dataModal.hidden=false;
  document.body.style.overflow='hidden';
}
function closeDataModal() {
  dataModal.hidden=true;
  document.body.style.overflow='';
  if(hasLocalData) window.__planogramWakeScanner?.();
}
function afterSplash(callback) {
  const splash=$('launchSplash');
  const animation=splash?.getAnimations?.()[0];
  if(animation?.finished) animation.finished.then(callback,callback);
  else setTimeout(callback,1400);
}
function openLocalDB() {
  return new Promise((resolve,reject) => {
    if(!window.indexedDB){reject(new Error('Penyimpanan lokal tidak tersedia. Jangan gunakan mode privat.'));return;}
    const req=indexedDB.open(DB_NAME,1);
    req.onupgradeneeded=()=>{if(!req.result.objectStoreNames.contains(DB_STORE))req.result.createObjectStore(DB_STORE);};
    req.onsuccess=()=>resolve(req.result);
    req.onerror=()=>reject(req.error||new Error('Gagal membuka penyimpanan lokal.'));
  });
}
async function readLocal() {
  const db=await openLocalDB();
  try {
    return await new Promise((resolve,reject)=>{
      const tx=db.transaction(DB_STORE,'readonly');
      const req=tx.objectStore(DB_STORE).get(DB_KEY);
      req.onsuccess=()=>resolve(req.result||null);
      req.onerror=()=>reject(req.error||new Error('Gagal membaca planogram lokal.'));
      tx.onabort=()=>reject(tx.error||new Error('Penyimpanan lokal dibatalkan.'));
    });
  } finally {db.close();}
}
async function writeLocal(next) {
  const db=await openLocalDB();
  try {
    await new Promise((resolve,reject)=>{
      const tx=db.transaction(DB_STORE,'readwrite');
      tx.objectStore(DB_STORE).put(next,DB_KEY);
      tx.oncomplete=()=>resolve();
      tx.onerror=()=>reject(tx.error||new Error('Gagal menyimpan data.'));
      tx.onabort=()=>reject(tx.error||new Error('Penyimpanan dibatalkan.'));
    });
  } finally {db.close();}
}
function validatePlanogram(body) {
  if(!body || body.format!=='RAIT_PLANOGRAM_V1' || !body.dataset || typeof body.dataset!=='object')
    throw new Error('planogram.json tidak sesuai format aplikasi.');
  const d=body.dataset;
  if(!Array.isArray(d.racks)||!Array.isArray(d.items)||!d.meta||d.racks.length<1||d.items.length<1)
    throw new Error('Data planogram belum tersedia. Data lama tidak diubah.');
  if(d.racks.length>600||d.items.length>100000)throw new Error('Jumlah data di luar batas.');
  for(const it of d.items) {
    if(!it||!String(it.plu||'')||!String(it.barcode||'')||!String(it.rack||'')||!String(it.name||'')||!String(it.locationCode||''))
      throw new Error('Data item tidak lengkap. Pembaruan dibatalkan.');
  }
  return d;
}
async function restoreData() {
  try {
    const saved=await readLocal();
    if(saved?.items?.length && saved.racks?.length) {
      window.__planogramApplyData?.(saved);
      window.__planogramAccessReady = true;
      window.__planogramWakeScanner?.();
      record.textContent='Tersimpan di HP ✓';
      info.textContent=`Data lokal: ${formatCount(saved.items.length)} item · ${saved.racks.length} rak · ${saved.meta?.sourceDate||'tanpa tanggal'}`;
      dataBtn.textContent='↻ Perbarui Data Planogram';
      setDataReady(true);
      return true;
    }
    record.textContent='Belum diunduh';
    info.textContent='Unduh data sekali ke HP ini untuk memulai pencarian barang.';
    dataBtn.textContent='↓ Download Data Planogram';
    setDataReady(false);
    return false;
  } catch(e) {
    record.textContent='Belum siap';
    info.textContent=e.message;
    setDataReady(false);
    return false;
  }
}
async function downloadData() {
  if(downloadInProgress)return;
  downloadInProgress=true;
  dataBtn.disabled=true;
  progress.textContent='Mengunduh data terbaru…';
  try {
    const url=new URL('./planogram.json',location.href);
    url.searchParams.set('v',String(Date.now()));
    const res=await fetch(url.toString(),{cache:'no-store'});
    if(!res.ok)throw new Error('Unduhan gagal (HTTP '+res.status+'). Periksa file planogram.json di GitHub.');
    const text=await res.text();
    if(text.length>20*1024*1024)throw new Error('Ukuran data terlalu besar.');
    progress.textContent='Memeriksa data planogram…';
    const next=validatePlanogram(JSON.parse(text));
    progress.textContent='Menyimpan data ke HP…';
    // Tulis setelah validasi; jika gagal data lama tetap utuh.
    await writeLocal(next);
    window.__planogramApplyData?.(next);
    window.__planogramAccessReady = true;
    record.textContent='Tersimpan di HP ✓';
    info.textContent=`Data lokal: ${formatCount(next.items.length)} item · ${next.racks.length} rak · ${next.meta?.sourceDate||'tanpa tanggal'}`;
    dataBtn.textContent='↻ Perbarui Data Planogram';
    setDataReady(true);
    progress.textContent='✅ Data planogram berhasil diambil/diperbarui. Scanner siap dipakai.';
  } catch(e) {
    console.warn('Pembaruan planogram:',e);
    progress.textContent='❌ '+(e.message||'Gagal mengunduh. Data sebelumnya tetap aman.');
  } finally {
    dataBtn.disabled=false;
    downloadInProgress=false;
  }
}
function init() {
  dataBtn.disabled=false;
  dataBtn.addEventListener('click',downloadData);
  $('settingsBtn').addEventListener('click',()=>openDataModal(false));
  $('closeDataModal').addEventListener('click',closeDataModal);
  $('dataModalBackdrop').addEventListener('click',closeDataModal);
  dataDone.addEventListener('click',()=>{if(hasLocalData)closeDataModal();});
  document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!dataModal.hidden)closeDataModal();});
  restoreData().then(found=>{
    if(!found)afterSplash(()=>{if(!hasLocalData)openDataModal(true);});
  }).catch(()=>afterSplash(()=>{if(!hasLocalData)openDataModal(true);}));
}
init();
})();
