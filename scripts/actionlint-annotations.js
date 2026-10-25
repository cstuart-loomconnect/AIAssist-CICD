// Turns actionlint's JSON output into one GitHub annotation per finding. Exits 1 if there are any.
// Usage: node scripts/actionlint-annotations.js actionlint.json
const fs = require('fs');

const text = fs.readFileSync(process.argv[2] || 'actionlint.json', 'utf8').trim();
const errors = text ? JSON.parse(text) : [];
for (const e of errors) {
    console.log(`::error file=${e.filepath},line=${e.line},col=${e.column}::[${e.kind}] ${e.message}`);
}
console.log(`${errors.length} actionlint finding(s)`);
process.exit(errors.length ? 1 : 0);
