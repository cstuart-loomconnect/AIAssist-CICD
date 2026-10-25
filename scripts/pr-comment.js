// Builds and posts (or updates) the CI results comment on a pull request.
// Called from actions/github-script in .github/workflows/pr-validation.yml (AIAssist-CICD).
const fs = require('fs');
const path = require('path');

const MARKER = '<!-- ci-results -->';
const ICON = { success: '✅', failure: '❌', skipped: '⏭️', cancelled: '🚫' };

// Returns the first JSON file in dir that satisfies `accept`, or null.
function readJson(dir, accept) {
    if (!fs.existsSync(dir)) return null;
    for (const file of fs.readdirSync(dir).filter((f) => f.endsWith('.json'))) {
        try {
            const parsed = JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8'));
            if (accept(parsed)) return parsed;
        } catch (e) {
            // not the file we want
        }
    }
    return null;
}

function apexSection() {
    const result = readJson('apex-test-results', (r) => r.summary && r.summary.testsRan !== undefined);
    if (!result) return '_No Apex test results (no Apex in this change, or the job did not run)._';
    const s = result.summary;
    const lines = [
        `| Tests ran | Passing | Failing | Org-wide coverage |`,
        `|---|---|---|---|`,
        `| ${s.testsRan} | ${s.passing} | ${s.failing} | ${s.orgWideCoverage} |`
    ];
    const failed = (result.tests || []).filter((t) => t.Outcome === 'Fail').slice(0, 10);
    if (failed.length) {
        lines.push('', '**Failing tests**');
        for (const t of failed) lines.push(`- \`${t.FullName}\`: ${String(t.Message || '').split('\n')[0]}`);
    }
    return lines.join('\n');
}

function analyzerSection() {
    const r = readJson('code-analyzer-results', (r) => r.violationCounts !== undefined);
    if (!r) return '_No Code Analyzer results._';
    const c = r.violationCounts || {};
    const lines = [
        `| Critical | High | Moderate | Low | Info |`,
        `|---|---|---|---|---|`,
        `| ${c.sev1 || 0} | ${c.sev2 || 0} | ${c.sev3 || 0} | ${c.sev4 || 0} | ${c.sev5 || 0} |`
    ];
    const serious = (r.violations || []).filter((v) => v.severity <= 2).slice(0, 10);
    if (serious.length) {
        lines.push('', '**Critical / High findings**');
        for (const v of serious) {
            const loc = (v.locations || [])[v.primaryLocationIndex || 0] || {};
            const file = loc.file ? String(loc.file).replace(/^.*force-app/, 'force-app') : '';
            lines.push(`- \`${v.rule}\` ${file}:${loc.startLine || '?'} — ${String(v.message).split('\n')[0]}`);
        }
    }
    return lines.join('\n');
}

module.exports = async ({ github, context, needs }) => {
    const rows = Object.entries(needs).map(([job, n]) => `| ${job} | ${ICON[n.result] || n.result} ${n.result} |`);
    const runUrl = `${context.serverUrl}/${context.repo.owner}/${context.repo.repo}/actions/runs/${context.runId}`;
    const body = [
        MARKER,
        '## CI results',
        '',
        '| Job | Result |',
        '|---|---|',
        ...rows,
        '',
        '### Apex tests',
        apexSection(),
        '',
        '### Code Analyzer',
        analyzerSection(),
        '',
        `[Full run and downloadable reports](${runUrl})`
    ].join('\n');

    const { data: comments } = await github.rest.issues.listComments({
        ...context.repo,
        issue_number: context.issue.number,
        per_page: 100
    });
    const existing = comments.find((c) => c.body && c.body.startsWith(MARKER));
    if (existing) {
        await github.rest.issues.updateComment({ ...context.repo, comment_id: existing.id, body });
    } else {
        await github.rest.issues.createComment({ ...context.repo, issue_number: context.issue.number, body });
    }
};
