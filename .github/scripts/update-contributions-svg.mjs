import fs from 'node:fs/promises';
import path from 'node:path';

const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
if (!token) {
  console.error('Missing GITHUB_TOKEN (or GH_TOKEN) env var.');
  process.exit(1);
}

const repoRoot = process.cwd();
const svgPath = path.join(repoRoot, 'assets', 'contributions-card.svg');

const now = new Date();
const to = now.toISOString();

// Range selection:
// - "year" (default): Jan 1st of current year -> now (matches GitHub's year view)
// - "last_year": last 365 days -> now
const rangeMode = (process.env.CONTRIB_RANGE || 'year').toLowerCase();

let fromDate;
let rangeLabel;
let badgeText;

if (rangeMode === 'last_year') {
  fromDate = new Date(now);
  fromDate.setUTCDate(fromDate.getUTCDate() - 365);
  rangeLabel = 'contributions in the last year';
  badgeText = `${fromDate.getUTCFullYear()}-${now.getUTCFullYear()}`;
} else {
  const year = now.getUTCFullYear();
  fromDate = new Date(Date.UTC(year, 0, 1, 0, 0, 0));
  rangeLabel = `contributions in ${year}`;
  badgeText = `${year}`;
}

const from = fromDate.toISOString();

const login =
  process.env.GITHUB_USER ||
  process.env.GITHUB_REPOSITORY_OWNER ||
  process.env.GITHUB_ACTOR;

if (!login) {
  console.error('Unable to infer GitHub login. Set GITHUB_USER env var.');
  process.exit(1);
}

const query = `query($login: String!, $from: DateTime!, $to: DateTime!) {
  user(login: $login) {
    contributionsCollection(from: $from, to: $to) {
      contributionCalendar {
        totalContributions
      }
    }
  }
}`;

const response = await fetch('https://api.github.com/graphql', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    query,
    variables: { login, from, to },
  }),
});

if (!response.ok) {
  const text = await response.text();
  console.error(`GitHub GraphQL request failed: ${response.status} ${response.statusText}`);
  console.error(text);
  process.exit(1);
}

const payload = await response.json();
if (payload.errors?.length) {
  console.error('GitHub GraphQL returned errors:');
  console.error(JSON.stringify(payload.errors, null, 2));
  process.exit(1);
}

const total = payload?.data?.user?.contributionsCollection?.contributionCalendar?.totalContributions;
if (typeof total !== 'number') {
  console.error('Unexpected response payload shape.');
  console.error(JSON.stringify(payload, null, 2));
  process.exit(1);
}

let svg = await fs.readFile(svgPath, 'utf8');

// Update the main number (first <text> that uses filter="url(#numGlow)")
svg = svg.replace(
  /(<text[^>]*filter="url\(#numGlow\)"[^>]*>\s*)(\d+)(\s*<)/m,
  `$1${total}$3`
);

// Update the label under the number (preserve the <animate/> inside the text node)
svg = svg.replace(
  /(<text\s+[^>]*x="400"\s+y="150"[^>]*>\s*)([^<]*?)(\s*<animate\b)/m,
  `$1${rangeLabel}$3`
);

// Update the year badge text (the badge at the bottom-right)
svg = svg.replace(  
  /(<g\s+transform="translate\(700,\s*170\)">[\s\S]*?<text[^>]*fill="#a5b4fc">)([^<]*)(<\/text>)/m,
  `$1${badgeText}$3`
);

await fs.writeFile(svgPath, svg, 'utf8');

console.log(
  `Updated ${path.relative(repoRoot, svgPath)} => totalContributions=${total}, mode=${rangeMode}`
);
