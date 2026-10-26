// Checks that every metadata file under the source folder uses the same API version as
// sourceApiVersion in sfdx-project.json. Mixed versions make classes and components behave
// differently from each other. Prints GitHub annotations and exits 1 on any mismatch.
// Usage: node scripts/check-api-version.js [sourceDir] [projectFile]
const fs = require('fs');
const path = require('path');

const root = process.argv[2] || 'force-app';
const projectFile = process.argv[3] || 'sfdx-project.json';

if (!fs.existsSync(projectFile)) {
    console.log(`::error file=${projectFile}::${projectFile} not found, so there is no API version to compare against.`);
    process.exit(1);
}
const expected = JSON.parse(fs.readFileSync(projectFile, 'utf8')).sourceApiVersion;
if (!expected) {
    console.log(`::error file=${projectFile}::Set sourceApiVersion in ${projectFile} so every component can be checked against it.`);
    process.exit(1);
}

function walk(dir) {
    return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
        const full = path.join(dir, e.name);
        return e.isDirectory() ? walk(full) : [full];
    });
}

if (!fs.existsSync(root)) process.exit(0);

let checked = 0;
const errors = [];
for (const file of walk(root)) {
    if (!file.endsWith('-meta.xml')) continue;
    const lines = fs.readFileSync(file, 'utf8').split('\n');
    lines.forEach((text, i) => {
        const m = text.match(/<apiVersion>\s*([\d.]+)\s*<\/apiVersion>/);
        if (!m) return;
        checked++;
        if (Number(m[1]) !== Number(expected)) {
            errors.push(`::error file=${file},line=${i + 1}::API version ${m[1]} does not match sourceApiVersion ${expected} in ${projectFile}.`);
        }
    });
}

errors.forEach((e) => console.log(e));
if (errors.length) {
    console.error(`\n${errors.length} of ${checked} components are not on API version ${expected}.`);
    process.exit(1);
}
console.log(`API versions OK: ${checked} components on ${expected}`);
