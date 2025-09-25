// In memory of Dr. Arifi Razzaq - The Bootstrap Loader
// Saweria: https://saweria.co/arzzq

// =================================================================
// == KONFIGURASI VRZAQ - EDISI PAMUNGKAS (SEMUA PLUGIN AKTIF) ==
// =================================================================

/** @type {import('./config.js').Config} */
export default {
    // --- Konfigurasi Inti ---
    targetExtensions: ['.js', '.mjs', '.cjs', '.ts', '.jsx', '.tsx'], // <-- 'tsx' sekarang memiliki titik
    ignorePatterns: [
        'node_modules/**',
        '.git/**',
        '.backups_vrzaq/**',
        'package-lock.json',
        'dist/**',
        'coverage/**',
    ],

    
    // =================================================================
    // == PENGATURAN PRETTIER (BARU!)                             ==
    // =================================================================
    // Semua opsi di sini akan menimpa file .prettierrc atau setelan default.
    prettier: {
      "tabWidth": 2,
      "useTabs": false,
      "semi": true,
      "singleQuote": true,
      "trailingComma": "es5",
      "printWidth": 80,
      "bracketSpacing": true,
      "arrowParens": "always"
    },
    // =================================================================
    // == PENGATURAN PLUGIN AKTIF                                   ==
    // =================================================================
    // Urutan plugin penting. Analis berjalan pertama, diikuti oleh
    // pengubah kode, dan diakhiri oleh pelapor.
    plugins: [
        // --- TAHAP ANALISIS (MENGUMPULKAN DATA) ---
        // 1. Analis Spesialis: Memindai struktur objek untuk @typedef yang lebih baik.
        './plugins/deep-struct-analyzer.js',

        // --- TAHAP MODIFIKASI KODE ---
        // 2. Pembersih Console Otomatis: Menghapus log debugging secara aman.
        // ['./plugins/auto-remove-console-plugin.js', {
            // Hapus semua console KECUALI .error untuk production builds.
            // methodsToRemove: ['log', 'warn', 'info', 'debug', 'table', 'trace'],
            // Set ke `true` untuk hanya melihat apa yang akan dihapus tanpa mengubah file.
            // reportOnly: false, 
        // }],

        // 3. Manajer Header Lisensi: Memastikan semua file memiliki identitas.
        ['./plugins/enforce-license-header-plugin.js', {
            mode: 'update', // 'add' (hanya tambah jika tidak ada) atau 'update' (paksa perbarui)
            signature: '©', // Tanda unik untuk mengenali header
            author: 'Vrzaq Project Contributors',
            license: 'MIT',
        }],

        // 4. Mesin Dokumentasi & Analisis Prediktif (Paket Lengkap).
        // Cukup aktifkan yang ini karena sudah mencakup semua fitur dari autodoc-plugin.js
        './plugins/autodoc-predictive-plugin.js',
        
        // 5. Generator Kode Kompleks (Opsional, aktifkan jika perlu).
        // Dijalankan setelah autodoc agar tidak mendokumentasikan trigger comment.
        './plugins/code-complexifier-plugin.js',

        // --- TAHAP LINTING & PELAPORAN (TIDAK MENGUBAH KODE) ---
        // 6. Linter Pendeteksi Console: Memberi peringatan jika masih ada console yang dilarang.
        // ['./plugins/disallow-console-plugin.js', {
            // mode: 'warn', // 'warn' atau 'strict' (menggagalkan proses file)
            // Setelah pembersih berjalan, kita hanya ingin melacak `console.error`.
            // forbidden: ['error'], 
        // }],

        // 7. Pendeteksi TODO/FIXME dengan Bantuan AI.
        // './plugins/detect-todo-plugin.js',
        
        // 8. Pelapor Ukuran File.
        ['./plugins/file-size-reporter-plugin.js', {
            limit: 10 // Tampilkan 10 file terbesar dalam proyek.
        }],
    ],
    
    // =================================================================
    // == PENGATURAN FITUR EKSPERIMENTAL (TERMASUK AI)              ==
    // =================================================================
    experimental: {
        ai: {
            // Pilih provider: 'openai' atau 'gemini'.
            // Plugin akan menggunakan key yang sesuai dari file .env Anda.
            provider: 'gemini', 
            
            // Ambil API key dari environment variable untuk keamanan.
            apiKey: process.env.GEMINI_API_KEY, 
            
            // (Opsional) Tentukan model spesifik.
            model: 'gemini-1.5-flash-latest',

            // (Opsional) Kustomisasi prompt yang dikirim ke AI.
            promptTemplate: `Developer meninggalkan komentar ini: "{{todoText}}". Berdasarkan konteks kode berikut, berikan satu saran perbaikan yang singkat dan jelas dalam bahasa Indonesia.\n\nKonteks Kode:\n\`\`\`javascript\n{{codeContext}}\n\`\`\``
        },
    },
};