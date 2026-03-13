import fs from 'node:fs/promises';
import path from 'node:path';

const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
if (!token) {
  console.error('Missing GITHUB_TOKEN (or GH_TOKEN) env var.');
  process.exit(1);
}

const repoRoot = process.cwd();
const svgPath = path.join(repoRoot, 'assets', 'contributions.svg');

const now = new Date();
const to = now.toISOString();
const fromDate = new Date(now);
fromDate.setUTCDate(fromDate.getUTCDate() - 365);
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

const yearRange = `${fromDate.getUTCFullYear()}-${now.getUTCFullYear()}`;

let svg = await fs.readFile(svgPath, 'utf8');

// Update the main number (first <text> that uses filter="url(#numGlow)")
svg = svg.replace(
  /(<text[^>]*filter="url\(#numGlow\)"[^>]*>\s*)(\d+)(\s*<)/m,
  `$1${total}$3`
);

// Update the year badge text (the badge at the bottom-right)
svg = svg.replace(
  /(<text[^>]*fill="#a5b4fc">)\d{4}-\d{4}(<\/text>)/m,
  `$1${yearRange}$2`
);

await fs.writeFile(svgPath, svg, 'utf8');

console.log(`Updated ${path.relative(repoRoot, svgPath)} => totalContributions=${total}, range=${yearRange}`);
