import { readdir, writeFile } from 'node:fs/promises';
import { substances, labelSetIds } from '../data/substances';
import { edges } from '../data/edges';

async function main() {
  const labels = await readdir('data/sources/fda_label');
  const report = `# Evidient M1 + M2 implementation

Implemented the Expo Router / TypeScript scaffold, server clients, live source tools, 12 substances, 16 supported edges, snapshots, and four API routes. No git commit or push was made. Snapshots are present as repository files for the owner to commit.

## Acceptance evidence

- \`npm run typecheck\`: exit 0, no diagnostics.
- \`npm test\`: exit 0, 2 files passed, 8 tests passed, 3.30 seconds. Includes live RxNorm, openFDA, and PubMed calls.
- \`EXPO_NO_DOTENV=1 npx expo export -p web\`: exit 0, exported dist, all four API routes bundled.
- Export served with \`EXPO_NO_DOTENV=1 npx expo serve --port 8081\`. Server stopped after testing.
- Curl search returned sertraline, RxCUI 36437. Graph returned 3 substances and 2 edges, each with depth null.
- Health returned \`{"ok":false,"reason":"MODEL_API_KEY is not configured"}\`.
- Curl SSE events arrived at +21, +332, +642, +953, +1261 ms. Full output: [acceptance-http.txt](./acceptance-http.txt).
- README.md, assets/icon.svg, docs/, shared/contract.ts, ui/, and .env.local were not edited. Expo dotenv loading was disabled for verification to avoid reading .env.local.

## Files

Generated .expo/, dist/, and node_modules/ are ignored. Existing docs/ and shared/ remain read-only.

\`\`\`text
app/
  _layout.tsx, index.tsx
  api/{health,substances,graph,sse-test}+api.ts
server/
  env.ts, meta.ts, judge.ts, catalog.ts, data.test.ts
  tools/{http,rxnorm,openfda,pubmed,sourceStore}.ts
  tools/tools.test.ts
data/
  substances.ts, edges.ts, seed-support.json
  sources/fda_label/*.json (${labels.length} exact section snapshots)
  sources/pubmed/12022894.json
scripts/
  curate-edges.ts, snapshot-sources.ts, smoke-api.mjs, report-milestones.ts
artifacts/
  M1-M2-report.md, acceptance-http.txt
assets/
  icon.svg (preserved), expo.icon/, images/ (launcher and splash assets)
.env.example, .gitignore, app.json
package.json, package-lock.json, tsconfig.json, vitest.config.ts
README.md (preserved), docs/ (preserved), shared/contract.ts (preserved)
\`\`\`

## Pinned single-ingredient oral label set IDs

| Substance | RxCUI | set_id |
|---|---|---|
${substances.filter(s => s.kind !== 'alcohol').map(s => `| ${s.id} | ${s.rxcui} | ${labelSetIds[s.id]} |`).join('\n')}

## Edges and seed sources

FDA references below use the exact \`set_id#section\` format. The support excerpts and class-based mappings are recorded in data/seed-support.json.

| Pair | Category | Seed references |
|---|---|---|
${edges.map(e => `| ${e.pair} | ${e.category} | ${e.seedSources.map(s => `${s.kind}: ${s.id}`).join('<br>')} |`).join('\n')}

## Deviations and limits

- Dropped alcohol__warfarin. The pinned label and an additional openFDA search of precautions, drug_interactions, and warnings did not supply supporting alcohol interaction text. This does not establish absence of an interaction.
- Included OTC when_using sections because diphenhydramine's alcohol warning is stored there.
- Added fast-xml-parser for PubMed XML and tsx for repeatable snapshot/curation scripts.
- Scaffold generated SDK 58. Kept the template's reanimated and gesture-handler dependencies. Removed template demo screens and images.
- Contract unchanged. Label pins are a separate export from data/substances.ts.
- Native compilation was not run on Windows. Meta and Baseten inference were not exercised because credentials were not supplied through the process environment. Their model JSON results are validated with Zod.
- Three edges rely on explicit class-level label statements: lorazepam__tramadol, lorazepam__zolpidem, diphenhydramine__zolpidem. Kamil's planned human dataset review remains outstanding.
- npm install reported 12 moderate dependency advisories. No forced dependency upgrades were applied.

## Rerun

Run \`npm run typecheck\`, \`npm test\`, and \`npx expo export -p web\`. Set EXPO_NO_DOTENV=1 when the local environment file must remain unread. Run \`node scripts/smoke-api.mjs\` against a server on port 8081. \`npm run sources:snapshot\` explicitly refreshes pinned FDA labels; \`npm run data:curate\` rebuilds edges and checks supporting text against snapshots.
`;
  await writeFile('artifacts/M1-M2-report.md', report);
}
main().catch(error => { console.error(error); process.exitCode = 1; });
