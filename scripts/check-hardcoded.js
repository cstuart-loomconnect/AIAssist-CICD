// Looks for org-specific values written straight into the source: Salesforce record IDs and
// org URLs (My Domain, Lightning, Experience Cloud, Visualforce and instance hosts). They work in
// the org they were copied from and break everywhere else. Use Custom Metadata, Custom Labels,
// Named Credentials or a SOQL lookup by DeveloperName instead.
// Prints GitHub annotations and exits 1 on any finding.
// Usage: node scripts/check-hardcoded.js [sourceDir] [exceptionsFile]
// Known exceptions can be listed in config/hardcoded-exceptions.txt (one path substring per line).
const fs = require('fs');
const path = require('path');

const root = process.argv[2] || 'force-app';
const exceptionsFile = process.argv[3] || 'config/hardcoded-exceptions.txt';
const exceptions = fs.existsSync(exceptionsFile)
    ? fs
          .readFileSync(exceptionsFile, 'utf8')
          .split('\n')
          .map((l) => l.trim())
          .filter((l) => l && !l.startsWith('#'))
    : [];

// Folders where an endpoint URL is the whole point of the component.
const URL_FOLDERS = new Set(['namedCredentials', 'externalCredentials', 'remoteSiteSettings', 'cspTrustedSites', 'corsWhitelistOrigins']);

// A 15 or 18 character ID inside quotes or XML element text: 3-character key prefix, 2-character
// pod, the reserved "0", then the 9-character record number (plus a 3-character checksum).
const ID = /(?<=['"`>])([A-Za-z0-9]{5}0[A-Za-z0-9]{9}(?:[A-Za-z0-9]{3})?)(?=['"`<])/g;
// Hosts that only exist for one org or one instance.
const ORG_HOST =
    /\b[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.(?:my\.salesforce\.com|lightning\.force\.com|my\.site\.com|my\.salesforce-sites\.com|visualforce\.com|vf\.force\.com|my\.salesforce-setup\.com)\b|\b(?:na|eu|ap|cs|um|gs|usa)\d+\.(?:salesforce|force)\.com\b/gi;

function walk(dir) {
    return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
        const full = path.join(dir, e.name);
        return e.isDirectory() ? walk(full) : [full];
    });
}

// Blanks out comments but keeps strings and line breaks, so line numbers still match.
function stripComments(text, kind) {
    if (kind === 'xml') return text.replace(/<!--[\s\S]*?-->/g, (c) => c.replace(/[^\n]/g, ' '));
    let out = '';
    let quote = null;
    for (let i = 0; i < text.length; i++) {
        const c = text[i];
        const next = text[i + 1];
        if (quote) {
            out += c;
            if (c === '\\') {
                out += next ?? '';
                i++;
            } else if (c === quote) {
                quote = null;
            }
        } else if (c === '/' && next === '/') {
            while (i < text.length && text[i] !== '\n') i++;
            out += '\n';
        } else if (c === '/' && next === '*') {
            const end = text.indexOf('*/', i + 2);
            const stop = end === -1 ? text.length : end + 2;
            out += text.slice(i, stop).replace(/[^\n]/g, ' ');
            i = stop - 1;
        } else {
            if (c === "'" || c === '"' || c === '`') quote = c;
            out += c;
        }
    }
    return out;
}

function kindOf(file) {
    if (/\.(cls|trigger|js)$/.test(file)) return 'code';
    if (file.endsWith('.html') || file.endsWith('.cmp') || file.endsWith('.page') || file.endsWith('.component')) return 'xml';
    if (file.endsWith('.flow-meta.xml')) return 'xml';
    return null;
}

if (!fs.existsSync(root)) process.exit(0);

const errors = [];
for (const file of walk(root)) {
    const kind = kindOf(file);
    if (!kind || exceptions.some((x) => file.includes(x))) continue;
    const parts = file.split(path.sep);
    const raw = fs.readFileSync(file, 'utf8');
    // Test data is allowed made-up IDs; real org URLs are still wrong there.
    const isTest = parts.includes('__tests__') || (file.endsWith('.cls') && /@istest/i.test(raw));
    const checkUrls = !parts.some((p) => URL_FOLDERS.has(p));
    const lines = stripComments(raw, kind).split('\n');

    lines.forEach((text, i) => {
        const at = `file=${file},line=${i + 1}`;
        if (!isTest) {
            for (const [, id] of text.matchAll(ID)) {
                // Real IDs are mostly digits and capitals; three digits rules out ordinary words.
                if ((id.match(/\d/g) || []).length < 3) continue;
                errors.push(`::error ${at}::Hardcoded record ID "${id}". Look the record up by DeveloperName or store it in Custom Metadata.`);
            }
        }
        if (checkUrls) {
            for (const [host] of text.matchAll(ORG_HOST)) {
                errors.push(`::error ${at}::Hardcoded org URL "${host}". Use a Named Credential, URL.getOrgDomainUrl() or a relative link.`);
            }
        }
    });
}

errors.forEach((e) => console.log(e));
if (errors.length) {
    console.error(`\n${errors.length} hardcoded reference(s). Add a path to ${exceptionsFile} only if the value genuinely has to be fixed.`);
    process.exit(1);
}
console.log('No hardcoded record IDs or org URLs');
