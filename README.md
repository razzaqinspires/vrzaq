<div align="center">
  <h1>vrzaq</h1>
  <p><strong>Quantum Formatter by Razzaq</strong></p>
  <p>Sebuah platform pemrosesan kode yang cerdas, dapat diperluas, dan digerakkan oleh event. Lebih dari sekadar pemformat kode, `vrzaq` adalah sistem penjaga kualitas kode Anda.</p>
  
  <p>
    <a href="https://www.npmjs.com/package/vrzaq"><img src="https://img.shields.io/npm/v/vrzaq.svg" alt="NPM Version"></a>
    <a href="https://github.com/razzaqinspires/quantum-formatter/blob/main/LICENSE"><img src="https://img.shields.io/npm/l/vrzaq.svg" alt="License"></a>
  </p>
</div>

---

`vrzaq` adalah alat baris perintah (CLI) yang dibangun untuk mengotomatiskan dan meningkatkan kualitas kode JavaScript Anda. Ditenagai oleh mesin paralel, caching cerdas, dan sistem plugin yang kuat, `vrzaq` memastikan kode Anda tidak hanya rapi, tetapi juga konsisten dan andal.

## ✨ Fitur Unggulan

* **🚀 Kinerja Paralel:** Memanfaatkan semua core CPU untuk memindai dan memproses file dengan kecepatan kilat.
* **🧠 Caching Cerdas:** Secara otomatis melewati file yang tidak berubah, membuat eksekusi berulang menjadi instan.
* **👁️ Mode Pengawasan Cerdas (`--watch`):** Secara otomatis memformat file saat Anda menyimpannya, memberikan umpan balik *real-time*.
* **🔌 Arsitektur Plugin Berbasis Event:** Perluas fungsionalitas dengan plugin kustom untuk validasi, transformasi, atau pelaporan.
* **🛡️ Backup Berintegritas:** Secara otomatis membuat backup sebelum melakukan perubahan dan memverifikasi integritasnya.
* **⚙️ Konfigurasi Fleksibel:** Kustomisasi penuh perilaku `vrzaq` dan pluginnya melalui file `razzaq.config.js`.
* **🕵️ Analisis Cerdas:** Cari tahu mengapa sebuah file diabaikan dengan perintah `razzaq why <path>`.

## 📦 Instalasi

Untuk penggunaan sebagai CLI global, instal dengan:
```bash
npm install -g vrzaq
```
Untuk penggunaan sebagai *library* di dalam proyek, instal sebagai dependensi lokal:
```bash
npm install vrzaq --save-dev
```

## ⚡ Penggunaan CLI

Setelah terinstal global, Anda bisa menggunakan perintah `razzaq` dari terminal di dalam direktori proyek Anda.

#### Perintah Umum

* **Menjalankan proses lengkap (backup, validasi, format):**
    ```bash
    razzaq run
    ```
* **Menjalankan dalam mode pengawasan:**
    ```bash
    razzaq run --watch
    ```
* **Menjalankan tanpa backup (lebih cepat untuk penggunaan sehari-hari):**
    ```bash
    razzaq run --no-backup
    ```
* **Melihat mengapa file diabaikan:**
    ```bash
    razzaq why ./dist/bundle.js
    ```
* **Melihat daftar backup:**
    ```bash
    razzaq backup list
    ```

## ⚙️ Konfigurasi (`razzaq.config.js`)

Untuk kontrol penuh, buat file `razzaq.config.js` di *root* proyek Anda.

**Contoh `razzaq.config.js`:**
```javascript
// Header lisensi kustom untuk perusahaan Anda
const MY_COMPANY_HEADER = `/**
 * © 2025 My Awesome Company. All rights reserved.
 */`;

export default {
    backupRetentionLimit: 10,
    ignorePatterns: ['build/**'],
    plugins: [
        './plugins/file-size-reporter-plugin.js',
        ['./plugins/enforce-license-header-plugin.js', { header: MY_COMPANY_HEADER }]
    ]
};
```

## 🤖 Otomatisasi dengan Git Hooks (Sangat Direkomendasikan)

Pastikan kode Anda selalu rapi **sebelum di-commit** dengan mengintegrasikan `vrzaq` menggunakan `husky` dan `lint-staged`.

1.  **Instalasi dev dependencies:** `npm install -D husky lint-staged`
2.  **Inisialisasi Husky:** `npx husky init`
3.  **Buat Pre-Commit Hook:** `npx husky add .husky/pre-commit "npx lint-staged"`
4.  **Konfigurasi `lint-staged` di `package.json` Anda:**
    ```json
    "lint-staged": {
      "*.{js,json,mjs,cjs,ts}": "razzaq run --no-backup"
    }
    ```

---

## 🚀 Penggunaan Tingkat Lanjut: Sebagai Library (Programmatic API)

Selain sebagai CLI, kekuatan sejati `vrzaq` terbuka saat digunakan sebagai modul di dalam skrip otomatisasi Anda (misalnya, skrip build, CI/CD, atau bot).

### Konsep Inti: EventEmitter
Fungsi utama `runQuantumFormatter` tidak langsung mengembalikan hasil, melainkan sebuah **`EventEmitter`**. Ini memungkinkan Anda untuk "mendengarkan" setiap tahapan proses secara *real-time*.

**Event Utama yang Bisa Didengarkan:**
* `scan:complete`: Setelah pemindaian file selesai.
* `file:validate`: Untuk setiap file yang divalidasi.
* `run:complete`: Saat semua proses berhasil. Mengembalikan hasil statistik.
* `run:error`: Jika terjadi error fatal.

### Contoh Skrip Build Kustom

Bayangkan Anda memiliki file `scripts/build.js` di proyek Anda. Anda bisa mengimpor dan mengontrol `vrzaq` seperti ini:

```javascript
// scripts/build.js
import { runQuantumFormatter, BackupManager, Core } from 'vrzaq';

async function runCustomBuild() {
    console.log('🚀 Memulai skrip build kustom...');

    try {
        const emitter = await runQuantumFormatter({ backup: false });

        emitter.on('scan:complete', (data) => {
            console.log(`🔍 Ditemukan ${data.fileCount} file untuk diproses.`);
        });

        emitter.on('run:complete', async (result) => {
            if (result.errors.length > 0) {
                console.error('❌ Build gagal karena ditemukan error pada file berikut:');
                result.errors.forEach(err => console.error(`  - ${err.file}: ${err.error.message}`));
                process.exit(1); // Gagalkan skrip, penting untuk CI/CD
            } else {
                console.log('✨ Semua file bersih dan tervalidasi!');
                console.log('📦 Membuat backup dari proyek yang sudah bersih...');
                const allFiles = await Core.scanFiles(process.cwd());
                await BackupManager.createBackup(allFiles);
                console.log('🎉 Skrip build kustom berhasil diselesaikan!');
            }
        });
        
        emitter.on('run:error', (error) => {
            console.error('❌ Terjadi error fatal selama eksekusi vrzaq:', error);
            process.exit(1);
        });

    } catch (error) {
        console.error('❌ Gagal memulai proses vrzaq:', error);
        process.exit(1);
    }
}

runCustomBuild();
```
**Di mana ini digunakan?**
* **Skrip CI/CD:** Untuk menjalankan validasi kode dan menggagalkan *build* jika ada error.
* **Alat Otomatisasi Lain:** Mengintegrasikan `vrzaq` ke dalam alur kerja yang lebih besar.
* **Bot (Telegram/WhatsApp):** Seperti yang telah kita diskusikan, bot akan mengimpor `vrzaq` untuk menjalankan tugas dan melaporkan hasilnya.

## 🤝 Berkontribusi

Kami sangat terbuka untuk kontribusi dari komunitas! Baik itu laporan bug, permintaan fitur baru, atau *pull request*. Silakan baca **[Panduan Kontribusi](./CONTRIBUTING.md)** kami untuk memulai.

Proyek ini mematuhi **[Kode Etik](./CODE_OF_CONDUCT.md)** kami.

## ❤️ Dukung Kreator

`vrzaq` adalah proyek *open-source* yang dikelola oleh Arifi Razzaq. Jika Anda merasa alat ini bermanfaat, pertimbangkan untuk memberikan dukungan:

* **Saweria:** [https://saweria.co/arzzq](https://saweria.co/arzzq)
* **WhatsApp:** [+62 831-9390-5842](https://wa.me/6283193905842)

## 📜 Lisensi

Dirilis di bawah [Lisensi MIT](./LICENSE).