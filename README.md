# Game Mechanism Library — GitHub Pages edition

This isolated frontend publishes the reviewed static catalog at `public-324b9527d01066c5`. It keeps the full 4,982-card public catalog, 272 retained archive entries, and 13 deleted-ID tombstones. The original 503 catalog files remain unchanged. Search text is generated as a separate build artifact and loaded only after a search is entered; the homepage loads the index and visible card chunks only.

## Local build

- Node.js 22+
- `npm ci`
- `npm run test:import`
- `npm run build`

For the GitHub Pages project path, build with `VITE_BASE_PATH=/game-mechanism-library/`. For a root-hosted local check, leave `VITE_BASE_PATH` unset. The app uses hash-based detail URLs so card and archive links remain usable on GitHub Pages without a server rewrite. A small generated 404 handler also redirects old `/mechanism/<id>` paths to the matching hash route.

## Community submissions

Submissions are GitHub Issues and are public. A maintainer reviews an issue, adds `approved-for-catalog`, and closes it. To inspect eligible records, export them with:

```sh
gh issue list --repo mmlong818/game-mechanism-library --state closed --label approved-for-catalog --json number,title,body,labels,state,url > approved-issues.json
node scripts/import-approved-issues.mjs --input approved-issues.json --dry-run
node scripts/import-approved-issues.mjs --input approved-issues.json
```

The importer accepts only closed, approved issues, rejects malformed or duplicate IDs, and writes a separate ignored `community-approved.json`. The next Pages build emits those cards into community-only chunks and the search index. It never changes the 4,982 source cards or the public archive/deleted indexes. The previous Sites D1 submission database is not migrated or deleted by this repository.

## Privacy boundary

The repository contains the static public catalog and frontend only. It excludes the prior Workers/D1 admin backend, credentials, private author/reviewer evidence, private environment files, and Sites runtime data. A Pages deployment publishes this repository's static output publicly.
