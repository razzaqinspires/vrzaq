# Panduan Kontribusi untuk vrzaq (Quantum-Formatter)

Halo! Terima kasih atas minat Anda untuk berkontribusi pada `vrzaq`. Kami sangat antusias menyambut kontribusi dari komunitas. Setiap kontribusi, sekecil apa pun, sangat kami hargai.

Sebelum memulai, silakan luangkan waktu untuk membaca [Kode Etik (Code of Conduct)](./CODE_OF_CONDUCT.md) kita.

## Bagaimana Saya Bisa Berkontribusi?

Ada banyak cara untuk berkontribusi, di antaranya:
* **Melaporkan Bug:** Jika Anda menemukan sesuatu yang tidak berfungsi sebagaimana mestinya, silakan buka *Issue* baru.
* **Mengajukan Fitur Baru:** Punya ide brilian untuk `vrzaq`? Diskusikan di *Issue* agar kita bisa merancangnya bersama.
* **Menulis Kode:** Bantu kami memperbaiki bug atau mengembangkan fitur baru yang sudah disetujui.
* **Memperbaiki Dokumentasi:** Menemukan kesalahan ketik atau kalimat yang membingungkan di `README.md` atau di dalam kode? Perbaikan dokumentasi sangat penting!

## Alur Kerja Kontribusi Kode

Jika Anda ingin menulis kode, berikut adalah langkah-langkah untuk mengajukan perubahan Anda.

### Langkah 1: Siapkan Proyek Anda
1.  **Fork** repositori `razzaqinspires/quantum-formatter` ke akun GitHub Anda.
2.  **Clone** *fork* tersebut ke komputer lokal Anda:
    ```bash
    git clone [https://github.com/USERNAME_ANDA/quantum-formatter.git](https://github.com/USERNAME_ANDA/quantum-formatter.git)
    cd quantum-formatter
    ```
3.  **Instal semua dependensi** yang dibutuhkan proyek:
    ```bash
    npm install
    ```

### Langkah 2: Uji Coba Lokal dengan `npm link`
Ini adalah langkah penting agar Anda bisa menguji perintah `razzaq` versi lokal Anda.
1.  Di dalam direktori proyek `quantum-formatter`, jalankan:
    ```bash
    npm link
    ```
    Perintah ini akan membuat perintah `razzaq` di terminal Anda menunjuk ke kode lokal ini.
2.  Sekarang, Anda bisa masuk ke **direktori proyek lain** di komputer Anda dan menjalankan `razzaq run` untuk melihat efek dari perubahan yang Anda buat.

### Langkah 3: Buat Branch Baru
Selalu buat *branch* baru untuk setiap perubahan yang Anda kerjakan. Ini menjaga riwayat tetap bersih. Gunakan nama yang deskriptif.
```bash
# Untuk fitur baru:
git checkout -b feat/menambahkan-reporter-baru

# Untuk perbaikan bug:
git checkout -b fix/masalah-pada-mode-watch
```

### Langkah 4: Lakukan Perubahan & Uji Coba
Tulis kode Anda! Pastikan Anda mengikuti gaya penulisan kode yang sudah ada. Setelah selesai, jalankan pengujian (jika tersedia) untuk memastikan Anda tidak merusak fungsionalitas yang sudah ada.
```bash
npm test
```

### Langkah 5: Commit & Push Perubahan Anda
Buat commit dengan pesan yang jelas. Kami sangat menyarankan untuk mengikuti standar Conventional Commits.
**Contoh Pesan Commit:**
- `feat:` __Menambahkan dukungan reporter HTML__
- `fix:` __Memperbaiki error saat file kosong diproses__
- `docs:` __Memperbarui panduan penggunaan di README.md__
Simpan dan unggah perubahan Anda ke fork Anda:
```bash
git add .
git commit -m "feat: Menambahkan dukungan reporter HTML"
git push origin feat/menambahkan-reporter-baru
```

### Langkah 6: Buat Pull Request
Buka halaman fork Anda di GitHub. Anda akan melihat tombol untuk membuat Pull Request (PR). Klik tombol tersebut, berikan judul dan deskripsi yang jelas tentang perubahan yang Anda buat, lalu kirimkan.
Tim kami akan meninjau PR Anda sesegera mungkin. Terima kasih banyak atas kontribusi Anda!