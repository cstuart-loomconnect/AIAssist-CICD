// Checks metadata API names under force-app against the project naming conventions
// (see CONTRIBUTING.md). Prints GitHub annotations and exits 1 on any violation.
// Usage: node scripts/check-naming.js [sourceDir] [exceptionsFile]
// Known exceptions can be listed in config/naming-exceptions.txt (one path substring per line).
const fs = require('fs');
const path = require('path');

const root = process.argv[2] || 'force-app';
const exceptionsFile = process.argv[3] || 'config/naming-exceptions.txt';
const exceptions = fs.existsSync(exceptionsFile)
    ? fs
          .readFileSync(exceptionsFile, 'utf8')
          .split('\n')
          .map((l) => l.trim())
          .filter((l) => l && !l.startsWith('#'))
    : [];

const PASCAL = /^[A-Z][A-Za-z0-9]*$/;
const CAMEL = /^[a-z][A-Za-z0-9]*$/;
const ANY_ALNUM = /^[A-Za-z][A-Za-z0-9]*$/;

// Folders where a space in the file name is legitimate (encoded layout / report names etc.).
const SPACE_OK = new Set(['layouts', 'reports', 'dashboards', 'email', 'documents', 'objectTranslations', 'translations']);
// Component folders whose file name (up to the first dot) is the API name.
const PASCAL_FOLDERS = new Set([
    'permissionsets',
    'permissionsetgroups',
    'flows',
    'flexipages',
    'applications',
    'staticresources',
    'customPermissions',
    'tabs',
    'externalCredentials',
    'namedCredentials'
]);
const OBJECT_CHILDREN = new Set([
    'recordTypes',
    'validationRules',
    'fieldSets',
    'listViews',
    'compactLayouts',
    'businessProcesses',
    'webLinks'
]);

const errors = [];
const fail = (file, msg) => errors.push({ file, msg });

// "My_Field__c" -> "My_Field"; returns null when the name is not a custom API name.
function customCore(name) {
    const m = name.match(/^(.+?)__(?:c|mdt|e|b|x)$/);
    return m ? m[1] : null;
}

function check(file, label, name, pattern, expected) {
    if (!pattern.test(name)) {
        fail(file, `${label} "${name}" ${expected}. Use letters and numbers only: no spaces, underscores or hyphens.`);
    }
}

function checkApiName(file, label, rawName, pattern = PASCAL, expected = 'must be PascalCase') {
    const core = customCore(rawName);
    check(file, label, core === null ? rawName : core, pattern, expected);
}

// Path of the component bundle folder, so a bundle is reported once rather than once per file.
function bundleDir(parts, defaultIndex, depth) {
    return parts.slice(0, defaultIndex + 1 + depth).join(path.sep);
}

function walk(dir) {
    return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
        const full = path.join(dir, e.name);
        return e.isDirectory() ? walk(full) : [full];
    });
}

if (!fs.existsSync(root)) process.exit(0);

for (const file of walk(root)) {
    if (exceptions.some((x) => file.includes(x))) continue;
    const parts = file.split(path.sep);
    const i = parts.indexOf('default');
    if (i === -1) continue;
    const [folder, ...rest] = parts.slice(i + 1);
    if (!folder || rest.length === 0) continue;
    const base = rest[rest.length - 1];
    if (base === '.gitkeep') continue;

    if (/\s/.test(file) && !SPACE_OK.has(folder)) {
        fail(file, 'File and folder names must not contain spaces.');
        continue;
    }

    const stem = base.split('.')[0];
    if (folder === 'classes' || folder === 'triggers') {
        if (base.endsWith('-meta.xml')) continue;
        check(file, 'Apex name', stem, PASCAL, 'must be PascalCase');
    } else if (folder === 'lwc') {
        check(bundleDir(parts, i, 2), 'LWC bundle', rest[0], CAMEL, 'must be camelCase');
    } else if (folder === 'aura') {
        check(bundleDir(parts, i, 2), 'Aura bundle', rest[0], ANY_ALNUM, 'must start with a letter');
    } else if (folder === 'objects') {
        checkApiName(file, 'Object', rest[0]);
        if (rest.length >= 3 && rest[1] === 'fields') {
            checkApiName(file, 'Field', base.replace('.field-meta.xml', ''));
        } else if (rest.length >= 3 && OBJECT_CHILDREN.has(rest[1])) {
            checkApiName(file, `${rest[1]} name`, base.split('.')[0]);
        }
    } else if (folder === 'customMetadata') {
        const [type, record] = base.split('.');
        if (record) check(file, 'Custom metadata record', record, PASCAL, 'must be PascalCase');
    } else if (PASCAL_FOLDERS.has(folder)) {
        if (rest.length > 1) continue; // static resource sub-folders etc.
        checkApiName(file, `${folder} name`, stem);
    }
}

const unique = [...new Map(errors.map((e) => [`${e.file}|${e.msg}`, e])).values()];
for (const e of unique) console.log(`::error file=${e.file}::${e.msg}`);
if (unique.length) {
    console.error(`\n${unique.length} naming violation(s). See CONTRIBUTING.md#naming-conventions`);
    process.exit(1);
}
console.log('Naming conventions OK');
