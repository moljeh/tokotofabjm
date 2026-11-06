// ========================================================
// 1. KONFIGURASI APLIKASI UTAMA
// ========================================================
// ⚠️ GANTI DENGAN URL DEPLOYMENT GOOGLE APPS SCRIPT ANDA ⚠️
const WEBAPP_URL = "https://script.google.com/macros/s/AKfycbx4wwmZtG7n7mKD8tN1etQLDe3K8D8St3Vzo807go51BCXNUpr8at2RtmFebs_GMCPL3Q/exec"; 
const TOKEN = "RAHASIA_KAS_STOK_2026"; 

// Variabel Penampung Cache Data
let dataBarang = [];
let dataLaporan = { pemasukan: [], pengeluaran: [] };
let imageCache = {}; // <--- TAMBAHAN: Memori penyimpan gambar sementara

// ========================================================
// 2. FUNGSI UTILITAS (ALAT BANTU DOM & UI)
// ========================================================
const getEl = (id) => document.getElementById(id);

// Menampilkan Notifikasi Hitam di Bawah Layar
const showToast = (msg) => {
  const toast = getEl("toast");
  toast.textContent = msg;
  toast.className = "toast show";
  setTimeout(() => toast.className = "toast", 3000);
};

// Mengubah Teks Label Sinkronisasi (Pojok Kanan Atas)
const setStatus = (status, state) => {
  const el = getEl("sync-status");
  if(el){
    el.textContent = status;
    el.className = `status-badge ${state}`;
  }
};

// ========================================================
// 3. FUNGSI PEMFORMATAN UANG & INPUT RIBUAN
// ========================================================
const formatRupiah = (angka) => new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(angka);

// Saat mengetik di kotak form, otomatis tambahkan titik (Contoh: 60000 -> 60.000)
const formatInputRibuan = (e) => {
  let val = e.target.value.replace(/[^0-9]/g, ''); // Hapus semua selain angka
  if (val) {
    e.target.value = new Intl.NumberFormat('id-ID').format(val);
  } else {
    e.target.value = '';
  }
};

// Menerapkan listener ke semua ID form uang (termasuk form Jasa)
['brg-hargabeli', 'brg-hargajual', 'in-harga', 'out-jumlah', 'jasa-total'].forEach(id => {
  const el = getEl(id);
  if (el) el.addEventListener('input', formatInputRibuan);
});

// Menghapus titik sebelum data dikirim ke Database (Contoh: 60.000 -> 60000)
const cleanRibuan = (str) => {
  return str ? str.toString().replace(/\./g, '') : '';
};

// ========================================================
// 4. FUNGSI PEMROSESAN GAMBAR (KOMPRESI BASE64 & ZOOM)
// ========================================================
// Mengubah File ke Base64 dengan kompresi maksimal Lebar 400px
const fileToBase64 = (file) => new Promise((resolve, reject) => {
  if (!file) return reject(new Error("File tidak ada"));
  if (file.size > 3 * 1024 * 1024) return reject(new Error("Maksimal ukuran foto 3 MB"));
  
  const reader = new FileReader();
  reader.readAsDataURL(file);
  reader.onload = (event) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      const MAX_WIDTH = 400; 
      let width = img.width;
      let height = img.height;
      
      if (width > MAX_WIDTH) {
        height = Math.round((height * MAX_WIDTH) / width);
        width = MAX_WIDTH;
      }
      
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, width, height);
      
      const dataUrl = canvas.toDataURL('image/jpeg', 0.7); // Kompres Kualitas 70%
      resolve(dataUrl.split(',')[1]);
    };
    img.src = event.target.result;
  };
  reader.onerror = error => reject(error);
});

// Menampilkan Pop-Up Foto Secara Penuh
window.zoomImage = function(src) {
  const modal = getEl('image-modal');
  getEl('zoomed-image').src = src;
  modal.classList.remove('hidden');
};

// Menutup Pop-Up Foto
window.closeImageModal = function() {
  const modal = getEl('image-modal');
  modal.classList.add('hidden');
  setTimeout(() => getEl('zoomed-image').src = "", 300); // Tunggu animasi selesai baru kosongkan
};

// ========================================================
// 5. FUNGSI MODAL KONFIRMASI MODERN (PENGGANTI ALERT)
// ========================================================
const showConfirm = (title, message, btnText = "OK", btnClass = "btn-primary") => {
  return new Promise((resolve) => {
    const modal = getEl('custom-modal');
    const btnOk = getEl('btn-modal-ok');
    const btnBatal = getEl('btn-modal-batal');

    getEl('modal-title').textContent = title;
    getEl('modal-message').innerHTML = message; // innerHTML agar mendukung tag HTML bawaan (seperti <b>)
    btnOk.textContent = btnText;
    btnOk.className = `btn ${btnClass}`; 

    modal.classList.remove('hidden');

    const cleanup = () => {
      modal.classList.add('hidden');
      btnOk.removeEventListener('click', onOk);
      btnBatal.removeEventListener('click', onBatal);
    };

    const onOk = () => { cleanup(); resolve(true); };
    const onBatal = () => { cleanup(); resolve(false); };

    btnOk.addEventListener('click', onOk);
    btnBatal.addEventListener('click', onBatal);
  });
};

// ========================================================
// 6. FUNGSI KOMUNIKASI SERVER (API FETCHING)
// ========================================================
async function api(action, payload = {}, silent = false) {
  if (!silent) setStatus("Memproses...", "syncing");
  try {
    const res = await fetch(WEBAPP_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ action, payload, token: TOKEN })
    });
    const result = await res.json();
    if (!result.ok) throw new Error(result.error || "Terjadi kesalahan server");
    if (!silent) setStatus("Tersinkron", "synced");
    return result.data;
  } catch (err) {
    console.error(err);
    if (!silent) setStatus("Gagal", "error");
    throw err;
  }
}

// ========================================================
// 7. FUNGSI ROUTING & SIDEBAR DRAWER MOBILE
// ========================================================
const sidebar = getEl('sidebar');
const overlay = getEl('sidebar-overlay');

// Buka Menu
function openSidebar() {
  sidebar.classList.add('open');
  overlay.classList.remove('hidden');
  // Tambahkan "history palsu" agar tombol back HP bisa mencegat dan menutup menu
  history.pushState({ menuOpen: true }, '');
}

// Tutup Menu
function closeSidebar() {
  sidebar.classList.remove('open');
  overlay.classList.add('hidden');
}

// Event Listener Tombol Hamburger & Tombol Silang
if (getEl('btn-menu')) getEl('btn-menu').addEventListener('click', openSidebar);
if (getEl('btn-close-menu')) {
  getEl('btn-close-menu').addEventListener('click', () => {
    closeSidebar();
    if (history.state && history.state.menuOpen) history.back(); // Bersihkan history palsu
  });
}
if (overlay) {
  overlay.addEventListener('click', () => {
    closeSidebar();
    if (history.state && history.state.menuOpen) history.back(); 
  });
}

// ⚠️ FITUR PENTING: Mencegat Tombol "Kembali" (Back) di HP
window.addEventListener('popstate', (e) => {
  if (sidebar.classList.contains('open')) {
    closeSidebar(); // Jika menu terbuka dan tombol back ditekan, tutup menu saja (jangan keluar aplikasi)
  }
});

// Fungsi Navigasi Halaman
window.switchView = function(target) {
  document.querySelectorAll('.nav-links a').forEach(a => {
    if(a.getAttribute('data-target') === target) a.classList.add('active');
    else a.classList.remove('active');
  });
  document.querySelectorAll('.view').forEach(view => view.classList.add('hidden'));
  
  const targetEl = getEl(target);
  if(targetEl) targetEl.classList.remove('hidden');
  
  loadDataByView(target);
  window.scrollTo({ top: 0, behavior: 'smooth' });
  
  // Tutup sidebar otomatis saat menu dipilih di HP
  if (window.innerWidth < 900) {
    closeSidebar();
  }
};

// Event Saat Link Menu Diklik
document.querySelectorAll('.nav-links a').forEach(link => {
  link.addEventListener('click', (e) => {
    e.preventDefault();
    const target = link.getAttribute('data-target');
    switchView(target);
  });
});

async function loadDataByView(view) {
  if (view === 'dashboard') await loadDashboard();
  if (view === 'barang') await loadBarang();
  if (view === 'pemasukan') await loadDropdownBarang();
}


// ========================================================
// 8. LOGIKA HALAMAN DASHBOARD & FITUR RESET SEMUA DATA
// ========================================================
async function loadDashboard() {
  try {
    const res = await api('getDashboard');
    getEl('dash-pemasukan').textContent = formatRupiah(res.totPemasukan);
    getEl('dash-pengeluaran').textContent = formatRupiah(res.totPengeluaran);
    getEl('dash-saldo').textContent = formatRupiah(res.totSaldo);
    
    // (Kode pembuat tabel "5 Barang Teratas" telah dihapus)
  } catch(e) { 
    showToast(e.message); 
  }
}

// Fitur Baru: Menghapus Semua Data Aplikasi
const btnReset = getEl('btn-reset-app');
if (btnReset) {
  btnReset.addEventListener('click', async () => {
    const isConfirmed = await showConfirm(
      "Peringatan Kritis!",
      "Apakah Anda benar-benar yakin ingin menghapus <b>SELURUH</b> data (Barang, Transaksi, dan Foto)?<br><br>Tindakan ini <b>TIDAK BISA dibatalkan</b> dan akan mengembalikan aplikasi seperti baru.",
      "Ya, Hapus Semua Data",
      "btn-danger"
    );

    if (!isConfirmed) return;

    try {
      setStatus("Mereset...", "syncing");
      await api('resetDatabase', {});
      showToast("Aplikasi berhasil di-reset! Memuat ulang...");
      
      // Mengosongkan cache frontend lokal
      dataBarang = [];
      dataLaporan = { pemasukan: [], pengeluaran: [] };
      
      // Memuat ulang keseluruhan halaman web
      setTimeout(() => {
        window.location.reload();
      }, 1500);
    } catch (err) {
      showToast(err.message);
    }
  });
}




// ========================================================
// 13. PWA (PROGRESSIVE WEB APP) & INSTALL BANNER
// ========================================================
let deferredPrompt;
const pwaBanner = getEl('pwa-install-banner');
const btnInstall = getEl('btn-pwa-install');
const btnTolak = getEl('btn-pwa-tolak');

// Mendaftarkan Service Worker agar web memiliki Cache & Offline Mode
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js')
      .then(reg => console.log('Service Worker terdaftar!', reg.scope))
      .catch(err => console.error('SW Gagal:', err));
  });
}

// Mencegat notifikasi Install bawaan Chrome/Android yang kaku
window.addEventListener('beforeinstallprompt', (e) => {
  // Cegah Chrome memunculkan mini-infobar bawaannya
  e.preventDefault();
  // Simpan event untuk dipanggil saat tombol custom kita ditekan
  deferredPrompt = e;
  
  // Munculkan banner cantik kita dengan jeda 2 detik agar tidak mengagetkan user
  setTimeout(() => {
    if (pwaBanner) pwaBanner.classList.add('show');
  }, 2000);
});

// Aksi ketika tombol "Install Sekarang" ditekan
if (btnInstall) {
  btnInstall.addEventListener('click', async () => {
    pwaBanner.classList.remove('show'); // Sembunyikan banner
    if (deferredPrompt) {
      // Munculkan dialog install resmi dari sistem Android/Browser
      deferredPrompt.prompt();
      // Tunggu respon user (apakah menekan Install atau Cancel di dialog sistem)
      const { outcome } = await deferredPrompt.userChoice;
      console.log(`Keputusan install user: ${outcome}`);
      deferredPrompt = null;
    }
  });
}

// Aksi ketika tombol "Nanti Saja" ditekan
if (btnTolak) {
  btnTolak.addEventListener('click', () => {
    pwaBanner.classList.remove('show');
  });
}





// ========================================================
// 9. LOGIKA HALAMAN BARANG (CRUD & RENDER GAMBAR SKELETON)
// ========================================================
function renderStokBadge(stok) {
  const num = Number(stok);
  if (num === 0) return `<span class="badge badge-red">0</span>`;
  if (num <= 5) return `<span class="badge badge-yellow">${num}</span>`;
  return `<span class="badge badge-green">${num}</span>`;
}

async function loadBarang() {
  try {
    dataBarang = await api('getBarang');
    renderTableBarang(dataBarang);
  } catch(e) { showToast(e.message); }
}

// Menarik Gambar Anti-Blokir secara Diam-Diam
// Menarik Gambar Anti-Blokir secara Diam-Diam & Menyimpan ke Cache
async function fetchImageAndRender(fileId, imgDomId, namaBarang) {
  try {
    const res = await api('getImageBase64', { fileId }, true); // True = Silent Mode
    const el = document.getElementById(imgDomId);
    
    if (res && res.base64) {
      // Simpan gambar ke dalam cache memori lokal
      imageCache[fileId] = res.base64;
      
      if (el) {
        // Sulap div skeleton menjadi image asli
        el.outerHTML = `<img id="${imgDomId}" src="${res.base64}" class="img-thumb zoomable" alt="Foto ${namaBarang}" onclick="zoomImage(this.src)">`;
      }
    }
  } catch(e) {
    const el = document.getElementById(imgDomId);
    if (el) el.outerHTML = '<div class="img-placeholder" style="width:100%; height:100%; border-radius:0;">Gagal muat</div>';
  }
}

// ========================================================
// TIMPA FUNGSI INI DENGAN LOGIKA RENDER GRID (TOKO ONLINE)
// ========================================================
function renderTableBarang(data) {
  const container = document.querySelector('#grid-barang'); 
  
  if (data.length === 0) {
    container.innerHTML = '<div style="grid-column: 1 / -1; text-align: center; padding: 3rem 1rem; color: #64748b;">Belum ada barang yang ditemukan.</div>';
    return;
  }
  
  container.style.display = 'grid'; 
  
  let htmlString = "";
  let imagesToLoad = []; 

  data.forEach((b) => {
    let fileId = b[5]; 
    const imgDomId = `img-grid-${b[0]}`; 
    let imgHtml = `<div class="img-placeholder" style="width:100%; height:100%; border-radius:0;">Tanpa Foto</div>`;
    
    if (fileId && fileId.length > 5) {
      if (fileId.includes('id=')) fileId = fileId.split('id=')[1].split('&')[0];
      else if (fileId.includes('/d/')) fileId = fileId.split('/d/')[1].split('/')[0];
      
      // CEK CACHE: Jika gambar sudah pernah diload, gunakan gambar dari memori (Tanpa Loading)
      if (imageCache[fileId]) {
        imgHtml = `<img id="${imgDomId}" src="${imageCache[fileId]}" class="img-thumb zoomable" alt="Foto ${b[1]}" onclick="zoomImage(this.src)">`;
      } else {
        // Jika belum ada di cache, tampilkan kotak abu-abu berkedip dan antrekan untuk didownload
        imgHtml = `<div id="${imgDomId}" style="width:100%; height:100%; border-radius:0;" class="skeleton"></div>`;
        imagesToLoad.push({ fileId, imgDomId, nama: b[1] });
      }
    }
    
    htmlString += `
      <div class="product-card">
        <div class="product-card-img-wrap">
          <div class="product-badge-stok badge ${Number(b[2]) === 0 ? 'badge-red' : Number(b[2]) <= 5 ? 'badge-yellow' : 'badge-green'}">
            Stok: ${b[2]}
          </div>
          ${imgHtml}
        </div>
        <div class="product-info">
          <div class="product-title">${b[1]}</div>
          <div class="product-price-box">
            <div class="price-jual">${formatRupiah(b[4])}</div>
            <div class="price-beli">Beli: ${formatRupiah(b[3])}</div>
          </div>
        </div>
        <div class="product-actions">
          <button class="btn-grid-edit" onclick="editBarang('${b[0]}')">Edit</button>
          <button class="btn-grid-del" onclick="hapusBarang('${b[0]}', '${b[1]}')">Hapus</button>
        </div>
      </div>
    `;
  });

  container.innerHTML = htmlString; 
  
  // Hanya mendownload gambar yang BELUM ADA di dalam cache
  imagesToLoad.forEach(item => fetchImageAndRender(item.fileId, item.imgDomId, item.nama)); 
}

// Fitur Pencarian Lokal
getEl('search-barang').addEventListener('input', (e) => {
  const q = e.target.value.toLowerCase();
  const filtered = dataBarang.filter(b => b[1].toLowerCase().includes(q));
  renderTableBarang(filtered);
});

// Fitur Memasukkan Data ke Dalam Form Edit
window.editBarang = function(id) {
  const b = dataBarang.find(item => item[0] === id);
  if (b) {
    getEl('brg-id').value = b[0];
    getEl('brg-nama').value = b[1];
    getEl('brg-stok').value = b[2];
    getEl('brg-hargabeli').value = new Intl.NumberFormat('id-ID').format(b[3]);
    getEl('brg-hargajual').value = new Intl.NumberFormat('id-ID').format(b[4]);
    
    getEl('form-barang-title').textContent = "Edit Barang";
    getEl('btn-batal-barang').classList.remove('hidden');
    
    // Pindah otomatis ke menu Input Barang saat mau diedit
    switchView('tambah-barang'); 
  }
};

// Menampilkan Preview Gambar Sebelum Disimpan
getEl('brg-foto').addEventListener('change', (e) => {
  const file = e.target.files[0];
  const container = getEl('foto-preview-container');
  const preview = getEl('brg-foto-preview');
  if (file) {
    preview.src = URL.createObjectURL(file);
    container.classList.remove('hidden');
  } else {
    container.classList.add('hidden');
  }
});

// Submit Form Simpan/Update Barang
getEl('form-barang').addEventListener('submit', async (e) => {
  e.preventDefault();
  const btnSubmit = e.target.querySelector('button[type="submit"]');
  const textAwal = btnSubmit.textContent;
  btnSubmit.disabled = true;
  btnSubmit.textContent = "⏳ Menyimpan...";

  const id = getEl('brg-id').value;
  const nama = getEl('brg-nama').value;
  const stok = getEl('brg-stok').value;
  const beli = cleanRibuan(getEl('brg-hargabeli').value); 
  const jual = cleanRibuan(getEl('brg-hargajual').value); 
  const file = getEl('brg-foto').files[0];
  
  try {
    let fotoBase64 = null;
    let fotoMime = null;
    if (file) {
      fotoBase64 = await fileToBase64(file);
      fotoMime = 'image/jpeg'; 
    }

    const payload = { id, nama, stok, hargabeli: beli, hargajual: jual, fotoBase64, fotoMime };
    const action = id ? 'updateBarang' : 'tambahBarang';
    
    await api(action, payload);
    showToast(`Barang berhasil di${id ? 'update' : 'tambah'}!`);
    resetFormBarang();
    
    // Setelah selesai disimpan, kembali secara otomatis ke menu Daftar Barang
    switchView('barang'); 
  } catch (err) { showToast(err.message); } 
  finally { btnSubmit.disabled = false; btnSubmit.textContent = textAwal; }
});

// Hapus Barang dengan Validasi Dialog
window.hapusBarang = async function(id, nama) {
  const isConfirmed = await showConfirm(
    "Hapus Barang",
    `Apakah Anda yakin ingin menghapus barang "<b>${nama}</b>"?<br>Data yang dihapus tidak bisa dikembalikan.`,
    "Ya, Hapus",
    "btn-danger"
  );
  if (!isConfirmed) return;

  try {
    setStatus("Menghapus...", "syncing");
    await api('hapusBarang', { id });
    showToast(`Barang "${nama}" berhasil dihapus.`);
    loadBarang(); 
  } catch (err) { showToast(err.message); }
};

// Tombol Batal Edit / Pembersih Form
function resetFormBarang() {
  getEl('form-barang').reset();
  getEl('brg-id').value = '';
  getEl('foto-preview-container').classList.add('hidden');
  getEl('form-barang-title').textContent = "Tambah Barang Baru";
  getEl('btn-batal-barang').classList.add('hidden');
}
getEl('btn-batal-barang').addEventListener('click', () => {
  resetFormBarang();
  // Jika batal mengedit, kembalikan user ke menu Daftar Barang
  switchView('barang'); 
});


// ========================================================
// 10. LOGIKA HALAMAN PEMASUKAN (BARANG & JASA)
// ========================================================
async function loadDropdownBarang() {
  try {
    if (dataBarang.length === 0) dataBarang = await api('getBarang');
    const sel = getEl('in-barang');
    sel.innerHTML = '<option value="">-- Pilih Barang --</option>';
    dataBarang.forEach(b => {
      if (Number(b[2]) > 0) {
        sel.innerHTML += `<option value="${b[0]}" data-harga="${b[4]}" data-stok="${b[2]}">${b[1]} (Stok: ${b[2]})</option>`;
      }
    });
  } catch (err) { showToast(err.message); }
}

// Fungsi Otomatis Hitung Total Pemasukan & Kunci Jika Melebihi Stok
const hitungTotalPemasukan = () => {
  const inputQty = getEl('in-qty');
  const qty = Number(inputQty.value) || 0;
  const selectBarang = getEl('in-barang');
  const opt = selectBarang.options[selectBarang.selectedIndex];
  const btnSubmit = document.querySelector('#form-pemasukan button[type="submit"]');
  
  if (opt && opt.value) {
    const hargaSatuan = Number(opt.getAttribute('data-harga')) || 0;
    const stokMaks = Number(opt.getAttribute('data-stok')) || 0;
    const total = qty * hargaSatuan;
    
    if (qty > stokMaks) {
      inputQty.style.borderColor = 'var(--danger)';
      inputQty.style.boxShadow = '0 0 0 4px var(--danger-light)';
      inputQty.style.color = 'var(--danger)';
      btnSubmit.disabled = true;
      showToast(`⚠️ Peringatan: Stok hanya tersisa ${stokMaks}!`);
    } else {
      inputQty.style.borderColor = '';
      inputQty.style.boxShadow = '';
      inputQty.style.color = '';
      btnSubmit.disabled = false;
    }
    
    if (qty > 0 && qty <= stokMaks) {
      getEl('in-harga').value = new Intl.NumberFormat('id-ID').format(total);
    } else {
      getEl('in-harga').value = '';
    }
  } else {
    getEl('in-harga').value = '';
  }
};
getEl('in-barang').addEventListener('change', hitungTotalPemasukan);
getEl('in-qty').addEventListener('input', hitungTotalPemasukan);

// Pemasukan Penjualan Barang (Memotong Stok)
getEl('form-pemasukan').addEventListener('submit', async (e) => {
  e.preventDefault();
  const selectBarang = getEl('in-barang');
  const opt = selectBarang.options[selectBarang.selectedIndex];
  const stokMaks = Number(opt.getAttribute('data-stok')) || 0;
  const qty = Number(getEl('in-qty').value);

  if (qty > stokMaks) {
    showToast(`❌ Gagal: Qty melebihi stok yang ada (${stokMaks})!`);
    return;
  }

  const btnSubmit = e.target.querySelector('button[type="submit"]');
  const textAwal = btnSubmit.textContent;
  btnSubmit.disabled = true;
  btnSubmit.textContent = "⏳ Menyimpan...";

  const idBarang = getEl('in-barang').value;
  const ket = getEl('in-ket').value;
  const strTotalHarga = getEl('in-harga').value;
  let hargaSatuanKirim = "";
  
  if (strTotalHarga !== "") {
    const totalBersih = Number(cleanRibuan(strTotalHarga));
    if (qty > 0) hargaSatuanKirim = totalBersih / qty; // Bagi rata agar rapi di Sheets
  }

  try {
    await api('catatPemasukan', { idBarang, qty, hargaManual: hargaSatuanKirim, ket });
    showToast("Penjualan berhasil dicatat!");
    getEl('form-pemasukan').reset();
    getEl('in-qty').style.borderColor = '';
    getEl('in-qty').style.boxShadow = '';
    getEl('in-qty').style.color = '';
    getEl('in-harga').value = ""; 
    dataBarang = []; // Reset cache stok
    loadDropdownBarang(); 
  } catch(err) { showToast(err.message); } 
  finally { btnSubmit.disabled = false; btnSubmit.textContent = textAwal; }
});

// Pemasukan Jasa (Tanpa Memotong Stok)
getEl('form-pemasukan-jasa').addEventListener('submit', async (e) => {
  e.preventDefault();
  const btnSubmit = e.target.querySelector('button[type="submit"]');
  const textAwal = btnSubmit.textContent;
  btnSubmit.disabled = true;
  btnSubmit.textContent = "⏳ Menyimpan...";

  const namaJasa = getEl('jasa-nama').value;
  const total = cleanRibuan(getEl('jasa-total').value);
  const ket = getEl('jasa-ket').value;

  try {
    await api('catatPemasukanJasa', { namaJasa, total, ket });
    showToast("Pendapatan Jasa berhasil dicatat!");
    getEl('form-pemasukan-jasa').reset();
  } catch(err) { showToast(err.message); } 
  finally { btnSubmit.disabled = false; btnSubmit.textContent = textAwal; }
});

// ========================================================
// 11. LOGIKA HALAMAN PENGELUARAN
// ========================================================
getEl('form-pengeluaran').addEventListener('submit', async (e) => {
  e.preventDefault();
  const btnSubmit = e.target.querySelector('button[type="submit"]');
  const textAwal = btnSubmit.textContent;
  btnSubmit.disabled = true;
  btnSubmit.textContent = "⏳ Menyimpan...";

  try {
    const jumlahBersih = cleanRibuan(getEl('out-jumlah').value);
    await api('catatPengeluaran', { jumlah: jumlahBersih, ket: getEl('out-ket').value });
    showToast("Pengeluaran berhasil dicatat!");
    getEl('form-pengeluaran').reset();
  } catch(err) { showToast(err.message); } 
  finally { btnSubmit.disabled = false; btnSubmit.textContent = textAwal; }
});

// ========================================================
// 12. LOGIKA HALAMAN LAPORAN (FILTER & CETAK/CSV)
// ========================================================
getEl('lap-jenis').addEventListener('change', (e) => {
  const val = e.target.value;
  getEl('lap-bulan-group').classList.toggle('hidden', val !== 'bulanan');
  getEl('lap-tahun-group').classList.toggle('hidden', val === 'semua');
});

getEl('form-filter-laporan').addEventListener('submit', async (e) => {
  e.preventDefault();
  const btnSubmit = e.target.querySelector('button[type="submit"]');
  const textAwal = btnSubmit.textContent;
  btnSubmit.disabled = true;
  btnSubmit.textContent = "⏳ Memuat...";

  try {
    const res = await api('getLaporan', { jenis: getEl('lap-jenis').value, bulan: getEl('lap-bulan').value, tahun: getEl('lap-tahun').value });
    dataLaporan = res;
    getEl('judul-laporan').textContent = res.judul;
    getEl('tanggal-cetak').textContent = `Dicetak pada: ${new Date().toLocaleString('id-ID')}`;
    getEl('lap-tot-pemasukan').textContent = formatRupiah(res.totPemasukan);
    getEl('lap-tot-pengeluaran').textContent = formatRupiah(res.totPengeluaran);
    getEl('lap-tot-saldo').textContent = formatRupiah(res.saldo);

    const tbodyIn = document.querySelector('#tabel-lap-pemasukan tbody');
    tbodyIn.innerHTML = res.pemasukan.length === 0 ? '<tr><td colspan="6" class="text-center">Tidak ada data</td></tr>' : '';
    res.pemasukan.forEach(r => tbodyIn.innerHTML += `<tr><td>${r[0]}</td><td>${r[2]}</td><td>${r[3]}</td><td>${formatRupiah(r[4])}</td><td>${formatRupiah(r[5])}</td><td>${r[6]}</td></tr>`);

    const tbodyOut = document.querySelector('#tabel-lap-pengeluaran tbody');
    tbodyOut.innerHTML = res.pengeluaran.length === 0 ? '<tr><td colspan="3" class="text-center">Tidak ada data</td></tr>' : '';
    res.pengeluaran.forEach(r => tbodyOut.innerHTML += `<tr><td>${r[0]}</td><td>${r[1]}</td><td>${formatRupiah(r[2])}</td></tr>`);
  } catch(err) { showToast(err.message); } 
  finally { btnSubmit.disabled = false; btnSubmit.textContent = textAwal; }
});

// Aksi Cetak PDF Browser
getEl('btn-cetak').addEventListener('click', () => window.print());

// Aksi Pembuatan dan Ekspor CSV
getEl('btn-csv').addEventListener('click', () => {
  let csvContent = "data:text/csv;charset=utf-8," + getEl('judul-laporan').textContent + "\n\n";
  
  csvContent += "PEMASUKAN\nTanggal,Barang/Jasa,Qty,Harga,Total,Keterangan\n";
  dataLaporan.pemasukan.forEach(r => {
    let row = r.map(cell => `"${String(cell).replace(/"/g, '""')}"`);
    row.splice(1, 1); // Membuang ID Barang agar tidak ikut tercetak
    csvContent += row.join(",") + "\n";
  });
  
  csvContent += "\nPENGELUARAN\nTanggal,Keterangan,Jumlah\n";
  dataLaporan.pengeluaran.forEach(r => {
    let row = r.map(cell => `"${String(cell).replace(/"/g, '""')}"`);
    csvContent += row.join(",") + "\n";
  });
  
  const link = document.createElement("a");
  link.setAttribute("href", encodeURI(csvContent));
  link.setAttribute("download", `Laporan_${new Date().getTime()}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
});

// MEMULAI APLIKASI SAAT PERTAMA KALI DIBUKA
loadDashboard();