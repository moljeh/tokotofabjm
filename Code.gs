// ========================================================
// 1. KONFIGURASI BACKEND & KEAMANAN
// ========================================================
const TOKEN = "RAHASIA_KAS_STOK_2026"; 
const DB_NAME = "Kas Toko Tofa BJM"; // Nama Folder Drive Penyimpanan

// ========================================================
// 2. FUNGSI SETUP & RESET DATABASE
// ========================================================
// Sistem otomatis memastikan database ada tanpa perlu buat manual
function ensureDatabaseSetup() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  if (ss.getSheetByName("Barang")) return; 

  let shBarang = ss.insertSheet("Barang");
  shBarang.appendRow(["ID", "Nama", "Stok", "HargaBeli", "HargaJual", "Gambar"]);
  shBarang.getRange("A1:F1").setFontWeight("bold");
  shBarang.setFrozenRows(1);

  let shPemasukan = ss.insertSheet("Pemasukan");
  shPemasukan.appendRow(["Tanggal", "IDBarang", "Nama", "Qty", "Harga", "Total", "Ket"]);
  shPemasukan.getRange("A1:G1").setFontWeight("bold");
  shPemasukan.setFrozenRows(1);

  let shPengeluaran = ss.insertSheet("Pengeluaran");
  shPengeluaran.appendRow(["Tanggal", "Keterangan", "Jumlah"]);
  shPengeluaran.getRange("A1:C1").setFontWeight("bold");
  shPengeluaran.setFrozenRows(1);

  const folderName = DB_NAME + " - Gambar Barang";
  const fileSS = DriveApp.getFileById(ss.getId());
  const parentFolder = fileSS.getParents().hasNext() ? fileSS.getParents().next() : DriveApp.getRootFolder();
  if (!parentFolder.getFoldersByName(folderName).hasNext()) {
    parentFolder.createFolder(folderName);
  }
}

// Fitur Baru: Membersihkan Keseluruhan Data dan Mengosongkan Gambar
function resetDatabase() {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();

    // Mengosongkan Data Tabel (Kecuali Header pada Baris 1)
    const shBarang = ss.getSheetByName("Barang");
    if (shBarang && shBarang.getLastRow() > 1) {
      shBarang.getRange(2, 1, shBarang.getLastRow() - 1, shBarang.getLastColumn()).clearContent();
    }

    const shPem = ss.getSheetByName("Pemasukan");
    if (shPem && shPem.getLastRow() > 1) {
      shPem.getRange(2, 1, shPem.getLastRow() - 1, shPem.getLastColumn()).clearContent();
    }

    const shPeng = ss.getSheetByName("Pengeluaran");
    if (shPeng && shPeng.getLastRow() > 1) {
      shPeng.getRange(2, 1, shPeng.getLastRow() - 1, shPeng.getLastColumn()).clearContent();
    }

    // Membuang folder gambar ke Tong Sampah (Akan dibuat baru lagi saat fungsi `ensureDatabaseSetup` berjalan nanti)
    const folderName = DB_NAME + " - Gambar Barang";
    const fileSS = DriveApp.getFileById(ss.getId());
    const parentFolder = fileSS.getParents().hasNext() ? fileSS.getParents().next() : DriveApp.getRootFolder();
    const folders = parentFolder.getFoldersByName(folderName);
    
    if (folders.hasNext()) {
      folders.next().setTrashed(true);
    }
  } finally {
    lock.releaseLock();
  }
  return true;
}

// Mendapatkan Objek Folder untuk menyimpan gambar spesifik
function getFolderGambar() {
  const folderName = DB_NAME + " - Gambar Barang";
  const fileSS = DriveApp.getFileById(SpreadsheetApp.getActiveSpreadsheet().getId());
  const parentFolder = fileSS.getParents().hasNext() ? fileSS.getParents().next() : DriveApp.getRootFolder();
  const folders = parentFolder.getFoldersByName(folderName);
  return folders.hasNext() ? folders.next() : parentFolder.createFolder(folderName);
}

// ========================================================
// 3. FUNGSI ROUTER UTAMA (PENERIMA REQUEST DARI WEB)
// ========================================================
function doPost(e) {
  try {
    const req = JSON.parse(e.postData.contents);
    if (req.token !== TOKEN) return out({ ok: false, error: "Token tidak valid!" });

    // Pengecekan otomatis kesiapan database
    ensureDatabaseSetup();

    const action = req.action;
    const payload = req.payload;

    if (action === 'getDashboard') return out({ ok: true, data: getDashboard() });
    if (action === 'getBarang') return out({ ok: true, data: getBarang() });
    if (action === 'tambahBarang') return out({ ok: true, data: tambahBarang(payload) });
    if (action === 'updateBarang') return out({ ok: true, data: updateBarang(payload) });
    if (action === 'hapusBarang') return out({ ok: true, data: hapusBarang(payload) });
    if (action === 'catatPemasukan') return out({ ok: true, data: catatPemasukan(payload) });
    if (action === 'catatPemasukanJasa') return out({ ok: true, data: catatPemasukanJasa(payload) });
    if (action === 'catatPengeluaran') return out({ ok: true, data: catatPengeluaran(payload) });
    if (action === 'getLaporan') return out({ ok: true, data: getLaporan(payload) });
    if (action === 'getImageBase64') return out({ ok: true, data: getImageBase64(payload) });
    if (action === 'resetDatabase') return out({ ok: true, data: resetDatabase() });
    if (action === 'updatePemasukan') return out({ ok: true, data: updatePemasukan(payload) });
    if (action === 'hapusPemasukan') return out({ ok: true, data: hapusPemasukan(payload) });
    if (action === 'updatePengeluaran') return out({ ok: true, data: updatePengeluaran(payload) });
    if (action === 'hapusPengeluaran') return out({ ok: true, data: hapusPengeluaran(payload) });

    return out({ ok: false, error: "Action API tidak ditemukan" });
  } catch (err) {
    return out({ ok: false, error: err.toString() });
  }
}

// Membungkus output agar selalu mematuhi standar JSON
function out(obj) { 
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON); 
}

// ========================================================
// 4. FUNGSI BYPASS GAMBAR GOOGLE DRIVE (ANTI-BLOKIR)
// ========================================================
function getImageBase64(payload) {
  try {
    const file = DriveApp.getFileById(payload.fileId);
    const base64 = Utilities.base64Encode(file.getBlob().getBytes());
    const mime = file.getMimeType();
    return { base64: `data:${mime};base64,${base64}` };
  } catch(e) {
    return { base64: null };
  }
}

function simpanGambar(fotoBase64, fotoMime, nama) {
  if (!fotoBase64) return "";
  const blob = Utilities.newBlob(Utilities.base64Decode(fotoBase64), fotoMime, `IMG_${nama}_${new Date().getTime()}.jpg`);
  const file = getFolderGambar().createFile(blob);
  
  // Karena gambar sekarang disalurkan lewat API Base64, kita cukup menyimpan ID-nya saja ke excel.
  return file.getId(); 
}

// ========================================================
// 5. FUNGSI MANAJEMEN BARANG & DASHBOARD (CRUD)
// ========================================================
function getDashboard() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  
  // Menghitung Saldo Masuk
  const dataIn = ss.getSheetByName("Pemasukan").getDataRange().getValues();
  let totIn = 0; for (let i = 1; i < dataIn.length; i++) totIn += Number(dataIn[i][5]); 

  // Menghitung Saldo Keluar
  const dataOut = ss.getSheetByName("Pengeluaran").getDataRange().getValues();
  let totOut = 0; for (let i = 1; i < dataOut.length; i++) totOut += Number(dataOut[i][2]); 

  return { 
    totPemasukan: totIn, 
    totPengeluaran: totOut, 
    totSaldo: totIn - totOut, 
    topBarang: getBarang().slice(-5).reverse() // Ambil 5 barang inputan terkahir
  };
}

function getBarang() {
  const data = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Barang").getDataRange().getValues();
  data.shift(); // Buang array header baris pertama
  return data;
}

function tambahBarang(payload) {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000); // Sistem antrean anti-crash
  try {
    const sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Barang");
    sh.appendRow([ 
      "BRG" + new Date().getTime(), 
      payload.nama, 
      payload.stok, 
      payload.hargabeli, 
      payload.hargajual, 
      simpanGambar(payload.fotoBase64, payload.fotoMime, payload.nama) 
    ]);
  } finally { lock.releaseLock(); }
  return true;
}

function updateBarang(payload) {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Barang");
    const data = sh.getDataRange().getValues();
    for (let i = 1; i < data.length; i++) {
      if (data[i][0] === payload.id) {
        sh.getRange(i+1, 2).setValue(payload.nama);
        sh.getRange(i+1, 3).setValue(payload.stok);
        sh.getRange(i+1, 4).setValue(payload.hargabeli);
        sh.getRange(i+1, 5).setValue(payload.hargajual);
        if (payload.fotoBase64) {
          sh.getRange(i+1, 6).setValue(simpanGambar(payload.fotoBase64, payload.fotoMime, payload.nama));
        }
        break;
      }
    }
  } finally { lock.releaseLock(); }
  return true;
}

function hapusBarang(payload) {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Barang");
    const data = sh.getDataRange().getValues();
    for (let i = 1; i < data.length; i++) {
      if (data[i][0] === payload.id) {
        sh.deleteRow(i + 1);
        break;
      }
    }
  } finally { lock.releaseLock(); }
  return true;
}

// ========================================================
// 6. FUNGSI PENCATATAN KEUANGAN (TRANSAKSI)
// ========================================================
function catatPemasukan(payload) {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const shB = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Barang");
    const dataB = shB.getDataRange().getValues();
    let rowIndex = -1, bData = null;
    
    for (let i = 1; i < dataB.length; i++) {
      if (dataB[i][0] === payload.idBarang) { 
        rowIndex = i + 1; 
        bData = dataB[i]; 
        break; 
      }
    }
    
    if (!bData) throw new Error("Barang tidak ditemukan.");
    
    const qty = Number(payload.qty);
    const stokSekarang = Number(bData[2]);
    if (stokSekarang < qty) throw new Error(`Stok tidak cukup! (Sisa: ${stokSekarang})`); 
    
    const hargaJual = payload.hargaManual ? Number(payload.hargaManual) : Number(bData[4]);
    
    // Kurangi Stok dari Data Barang
    shB.getRange(rowIndex, 3).setValue(stokSekarang - qty);
    
    // Rekam Transaksi Penjualan Barang
    SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Pemasukan").appendRow([
      new Date().toLocaleString('id-ID'), 
      payload.idBarang, 
      bData[1], 
      qty, 
      hargaJual, 
      qty * hargaJual, 
      payload.ket || "-"
    ]);
  } finally { lock.releaseLock(); }
  return true;
}

// Mencatat Pendapatan Jasa tanpa Memotong Stok Apapun
function catatPemasukanJasa(payload) {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Pemasukan").appendRow([
      new Date().toLocaleString('id-ID'), 
      "JASA",             
      payload.namaJasa,   
      1,                  
      Number(payload.total), 
      Number(payload.total), 
      payload.ket || "-"
    ]);
  } finally { lock.releaseLock(); }
  return true;
}

function catatPengeluaran(payload) {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try { 
    SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Pengeluaran").appendRow([
      new Date().toLocaleString('id-ID'), 
      payload.ket, 
      Number(payload.jumlah)
    ]); 
  } finally { lock.releaseLock(); }
  return true;
}

// ========================================================
// 7. FUNGSI PEMBACA TANGGAL DAN PEMBUAT LAPORAN
// ========================================================
function parseTanggalStr(val) {
  if (!val) return new Date("");
  if (val instanceof Date) return val;
  
  let str = String(val).trim();
  let dateOnly = str.split(',')[0].split(' ')[0]; // Mencegah kegagalan parsing karena embel-embel Jam/Detik
  
  let parts = dateOnly.split('/');
  if (parts.length === 3) {
    let isoDate = `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}T00:00:00`;
    let d = new Date(isoDate);
    if (!isNaN(d.getTime())) return d;
  }
  
  return new Date(str); 
}

function getLaporan(payload) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const dataIn = ss.getSheetByName("Pemasukan").getDataRange().getValues();
  const dataOut = ss.getSheetByName("Pengeluaran").getDataRange().getValues();
  
  // Sisipkan nomor baris asli Excel sebelum header dibuang
  let mapIn = dataIn.map((r, i) => { r.push(i + 1); return r; });
  let mapOut = dataOut.map((r, i) => { r.push(i + 1); return r; });
  
  mapIn.shift(); mapOut.shift(); 

  const filterByDate = (row) => {
    if (payload.jenis === 'semua') return true;
    const d = parseTanggalStr(row[0]);
    if (isNaN(d.getTime())) return false;
    if (payload.jenis === 'tahunan') return d.getFullYear() === Number(payload.tahun);
    if (payload.jenis === 'bulanan') return d.getFullYear() === Number(payload.tahun) && (d.getMonth() + 1) === Number(payload.bulan);
  };

  const filteredIn = mapIn.filter(filterByDate).reverse(); 
  const filteredOut = mapOut.filter(filterByDate).reverse();
  
  let totIn = filteredIn.reduce((acc, row) => acc + Number(row[5]), 0);
  let totOut = filteredOut.reduce((acc, row) => acc + Number(row[2]), 0);

  let judul = "Laporan Keseluruhan";
  if (payload.jenis === 'tahunan') judul = `Laporan Tahunan - ${payload.tahun}`;
  if (payload.jenis === 'bulanan') {
    const namaBulan = ["", "Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];
    judul = `Laporan Bulanan - ${namaBulan[Number(payload.bulan)]} ${payload.tahun}`;
  }

  return { judul: judul, totPemasukan: totIn, totPengeluaran: totOut, saldo: totIn - totOut, pemasukan: filteredIn, pengeluaran: filteredOut };
}


// ========================================================
// 8. FUNGSI EDIT & HAPUS TRANSAKSI (AUTO-SINKRONISASI STOK)
// ========================================================
function updatePemasukan(payload) {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const shPem = ss.getSheetByName("Pemasukan");
    const shBarang = ss.getSheetByName("Barang");
    const row = Number(payload.row);
    
    const oldIdBarang = shPem.getRange(row, 2).getValue();
    const oldQty = Number(shPem.getRange(row, 4).getValue());
    const newQty = Number(payload.qty);
    const newTotal = Number(payload.total);
    const newHargaSatuan = newQty > 0 ? newTotal / newQty : 0;

    // Hitung selisih stok jika produk fisik
    if (oldIdBarang !== "JASA") {
       const dataB = shBarang.getDataRange().getValues();
       let rowBarang = -1; let stokSekarang = 0;
       for (let i = 1; i < dataB.length; i++) {
         if (dataB[i][0] === oldIdBarang) { rowBarang = i + 1; stokSekarang = Number(dataB[i][2]); break; }
       }
       if (rowBarang > -1) {
          const selisih = newQty - oldQty;
          if (stokSekarang - selisih < 0) throw new Error(`Gagal: Sisa stok saat ini (${stokSekarang}) tidak mencukupi untuk penambahan qty ini!`);
          shBarang.getRange(rowBarang, 3).setValue(stokSekarang - selisih);
       }
    }
    shPem.getRange(row, 4).setValue(newQty);
    shPem.getRange(row, 5).setValue(newHargaSatuan);
    shPem.getRange(row, 6).setValue(newTotal);
    if (payload.ket) shPem.getRange(row, 7).setValue(payload.ket);
  } finally { lock.releaseLock(); }
  return true;
}

function hapusPemasukan(payload) {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const shPem = ss.getSheetByName("Pemasukan");
    const row = Number(payload.row);

    const oldIdBarang = shPem.getRange(row, 2).getValue();
    const oldQty = Number(shPem.getRange(row, 4).getValue());

    if (oldIdBarang !== "JASA") {
       const shBarang = ss.getSheetByName("Barang");
       const dataB = shBarang.getDataRange().getValues();
       let rowBarang = -1; let stokSekarang = 0;
       for (let i = 1; i < dataB.length; i++) {
         if (dataB[i][0] === oldIdBarang) { rowBarang = i + 1; stokSekarang = Number(dataB[i][2]); break; }
       }
       if (rowBarang > -1) shBarang.getRange(rowBarang, 3).setValue(stokSekarang + oldQty);
    }
    shPem.deleteRow(row);
  } finally { lock.releaseLock(); }
  return true;
}

function updatePengeluaran(payload) {
  const lock = LockService.getScriptLock(); lock.waitLock(10000);
  try {
    const shPeng = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Pengeluaran");
    shPeng.getRange(Number(payload.row), 2).setValue(payload.ket);
    shPeng.getRange(Number(payload.row), 3).setValue(Number(payload.jumlah));
  } finally { lock.releaseLock(); }
  return true;
}

function hapusPengeluaran(payload) {
  const lock = LockService.getScriptLock(); lock.waitLock(10000);
  try { SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Pengeluaran").deleteRow(Number(payload.row)); } 
  finally { lock.releaseLock(); }
  return true;
}