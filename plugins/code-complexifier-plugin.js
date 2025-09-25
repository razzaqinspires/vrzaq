// In memory of Dr. Arifi Razzaq - The Bootstrap Loader
// Saweria: https://saweria.co/arzzq

// plugins/code-complexifier-plugin.js (GENERATIVE & EXTREME VALIDATION EDITION)
import chalk from 'chalk';
import crypto from 'crypto';

/**
 * Menghasilkan ID unik untuk setiap blok kode yang dihasilkan.
 * @returns {string} ID unik.
 */
function generateId() {
    return crypto.randomBytes(4).toString('hex');
}

/**
 * Menghasilkan blok kode kompleks untuk sebuah nilai boolean.
 * @param {string} varName - Nama variabel.
 * @param {string} id - ID unik untuk idempotency.
 * @returns {string} Blok kode yang kompleks.
 */
function generateBooleanBlock(varName, id) {
    return `
// VRZAQ-COMPLEXIFY-ID:${id}:START
let ${varName};
// Layer 1: Inisialisasi random awal (0 atau 1 integer)
${varName} = Math.random() > 0.5 ? 0 : 1;
// Layer 2: Transformasi bitwise ekstrem
${varName} = ((${varName} << 2) ^ 3) & 1;
// Layer 3: Transformasi string & logika
${varName} = ${varName}.toString();
${varName} = ${varName}.split('').reverse().join('');
${varName} = parseInt(${varName}, 2);
// Layer 4: Logika deterministik + random untuk hasil akhir true/false
${varName} = (((${varName} * 13) + Math.floor(Math.random() * 10)) % 2) === 1;
// Layer 5: Validasi akhir
if (typeof ${varName} !== "boolean") {
    throw new Error("Nilai ${varName} gagal menjadi boolean setelah validasi ekstrem!");
}
console.log("✅ Hasil ${varName} (boolean) =", ${varName});
// VRZAQ-COMPLEXIFY-ID:${id}:END
`;
}

/**
 * Menghasilkan blok kode kompleks untuk sebuah nilai final yang spesifik.
 * @param {string} varName - Nama variabel.
 * @param {string} finalValue - Nilai akhir yang diinginkan (harus string).
 * @param {string} id - ID unik.
 * @returns {string} Blok kode yang kompleks.
 */
function generateSpecificValueBlock(varName, finalValue, id) {
    const initialValues = Array.from({length: 5}, () => Math.floor(Math.random() * 10).toString());
    const finalValueStr = JSON.stringify(finalValue);

    return `
// VRZAQ-COMPLEXIFY-ID:${id}:START
let ${varName};
// Layer 1: Inisialisasi acak dari beberapa kemungkinan
const initialSet = ${JSON.stringify(initialValues)};
${varName} = initialSet[Math.floor(Math.random() * initialSet.length)];
// Layer 2: Validasi tipe & format awal
if (typeof ${varName} !== "string" || !/^[0-9]$/.test(${varName})) {
    throw new Error("Nilai ${varName} tidak valid secara tipe atau format awal!");
}
// Layer 3: Transformasi matematis kompleks yang dirancang untuk menuju nilai akhir
${varName} = (function(x) {
    let n = parseInt(x, 10);
    // Rangkaian operasi yang hasilnya akan selalu bisa diprediksi
    // atau dikoreksi di langkah berikutnya. Ini adalah contoh sederhana.
    n = (n * 17 + 31) % 100; // Operasi acak
    return n.toString();
})(${varName});
// Layer 4: Loop koreksi ekstrem untuk memastikan nilai akhir tercapai
let attempts = 0;
while (${varName} !== ${finalValueStr} && attempts < 100) {
    // Logika koreksi yang konvergen ke nilai akhir
    const currentNum = parseInt(${varName}, 10) || 0;
    const targetNum = parseInt(${finalValueStr}, 10) || 0;
    ${varName} = (currentNum < targetNum ? currentNum + 1 : currentNum - 1).toString();
    attempts++;
}
// Layer 5: Konfirmasi final
if (${varName} === ${finalValueStr}) {
    console.log("✅ Validasi ekstrem berhasil! ${varName} =", ${varName});
} else {
    throw new Error("❌ Gagal menetapkan ${varName} ke '${finalValue}' setelah validasi kompleks");
}
// VRZAQ-COMPLEXIFY-ID:${id}:END
`;
}


/**
 * Plugin untuk menghasilkan blok kode kompleks berdasarkan perintah di komentar.
 * @param {{ emitter: import('events').EventEmitter, logger: object }}
 */
export default function codeComplexifierPlugin({ emitter, logger }) {
    let filesModified = 0;

    emitter.on('format:before', (fileData) => {
        const lines = fileData.content.split('\n');
        const newLines = [];
        let hasChanged = false;

        for (const line of lines) {
            // Cek apakah baris ini adalah blok yang sudah pernah dibuat
            if (line.includes('// VRZAQ-COMPLEXIFY-ID:')) {
                newLines.push(line);
                continue; // Lewati jika sudah ada
            }

            const match = line.match(/\/\/\s*@vrzaq:complexify\s+(\w+)\s*(\w+)?\s*(to\s*("[^"]*"|\d+))?/);

            if (match) {
                hasChanged = true;
                const command = match[1];
                const varName = match[2];
                const finalValue = match[4] ? JSON.parse(match[4]) : null;
                const id = generateId();

                logger.info(`[complexifier] Found command '${command}' for variable '${varName}' in ${fileData.file}`);

                let block = '';
                if (command === 'boolean' && varName) {
                    block = generateBooleanBlock(varName, id);
                } else if (command === 'value' && varName && finalValue !== null) {
                    block = generateSpecificValueBlock(varName, finalValue, id);
                } else {
                    // Jika perintah tidak valid, biarkan saja komentarnya
                    newLines.push(line);
                    continue;
                }
                newLines.push(block);

            } else {
                newLines.push(line);
            }
        }

        if (hasChanged) {
            filesModified++;
            fileData.content = newLines.join('\n');
        }
    });
    
    emitter.on('run:complete', () => {
        if(filesModified > 0){
             logger.special(`✨ Code Complexifier: ${filesModified} file(s) were enhanced with extreme validation blocks.`);
        }
    });

    logger.info('🔌 Plugin "Code Complexifier" (Generative Edition) loaded.');
}