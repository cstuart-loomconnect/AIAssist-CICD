// Usage: node scripts/ci/check-coverage.js <test-results-dir> <min-percent>
// Reads the JSON written by `sf apex run test --result-format json` and fails below the threshold.
const fs = require('fs');
const path = require('path');

const [dir = 'test-results', min = '75'] = process.argv.slice(2);
// The CLI names the file test-result-<runId>.json (run IDs contain letters), and also writes other
// JSON files (coverage detail), so pick the one that holds the run summary.
const files = fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => f.endsWith('.json')) : [];
let summary;
for (const f of files) {
    try {
        const parsed = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
        if (parsed.summary && parsed.summary.testsRan !== undefined) {
            summary = parsed.summary;
            break;
        }
    } catch (e) {
        // not a results file
    }
}
if (!summary) {
    console.error(`No Apex test summary found in ${dir}. Files present: ${files.join(', ') || 'none'}`);
    process.exit(1);
}
const coverage = parseInt(String(summary.orgWideCoverage).replace('%', ''), 10);
console.log(`Tests: ${summary.passing} passing, ${summary.failing} failing. Org-wide coverage: ${coverage}%`);
if (Number(summary.failing) > 0) process.exit(1);
if (Number.isNaN(coverage) || coverage < Number(min)) {
    console.error(`Coverage ${coverage}% is below the required ${min}%`);
    process.exit(1);
}
