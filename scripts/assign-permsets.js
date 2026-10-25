// Usage: node scripts/assign-permsets.js [sourceDir]
// Assigns every permission set in the source folder (default force-app) to the scratch org's default user, ignoring failures
// for sets that are not assignable (e.g. those requiring a license the user lacks).
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const dir = path.join(process.argv[2] || 'force-app', 'main/default/permissionsets');
if (!fs.existsSync(dir)) process.exit(0);
const names = fs
    .readdirSync(dir)
    .filter((f) => f.endsWith('.permissionset-meta.xml'))
    .map((f) => f.replace('.permissionset-meta.xml', ''));
for (const name of names) {
    try {
        execSync(`sf org assign permset --name ${name}`, { stdio: 'inherit' });
    } catch (e) {
        console.warn(`Skipped permission set ${name}`);
    }
}
