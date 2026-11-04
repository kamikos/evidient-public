from pathlib import Path
import json, re
root=Path('.')
base=Path('artifacts')
audit=json.loads((base/'M4-card-audit.json').read_text())
assert len(audit)==17, 'Run m4-audit after all 17 records exist'
assert not any(r['problems'] for r in audit)
summary={}
for name in ['M4-precompute.json','M4-precompute-acetaminophen__alcohol,alcohol__diphenhydramine.json','M4-precompute-alcohol__cetirizine.json','M4-precompute-sertraline__warfarin.json','M4-precompute-alcohol__metronidazole.json','M4-precompute-diphenhydramine__zolpidem.json']:
 for r in json.loads((base/name).read_text())['rows']:
  if r['status']=='written':summary[r['pair']+('.inject' if r['inject'] else '')]=r
ledger=[json.loads(s) for s in (base/'M4-spend.jsonl').read_text().splitlines()]
known=sum(r['usd'] for r in ledger)
by_model={}
for r in ledger:
 m=by_model.setdefault(r['model'],dict(input=0,output=0,usd=0))
 for key in m:m[key]+=r[key]
# Conservative allowance for interrupted responses and provider timeouts without terminal usage.
reserve=3.0
spend=dict(reportedUSD=known,unreportedUsageReserveUSD=reserve,conservativeTotalUSD=known+reserve,byModel=by_model)
(base/'M4-cost-summary.json').write_text(json.dumps(spend,indent=2)+'\n')
header='| Edge | Proposed | Accepted | Rejected | Depth | Conflicts | Gaps | Seconds | USD |\n|---|---:|---:|---:|---|---:|---:|---:|---:|\n'
table=header
for r in audit:
 job=summary[r['edge']]
 table+=f"| {r['edge']} | {r['proposed']} | {r['accepted']} | {r['rejected']} | {r['depth']} | {r['conflicts']} | {r['gaps']} | {job['seconds']:.1f} | {job['estimatedUSD']:.5f} |\n"
retained=sum(summary[r['edge']]['estimatedUSD'] for r in audit)
precompute=f'''# M4 precompute

{table}
Seconds and USD cover the retained generation command, including its automatic retries. Earlier superseded generations, live smoke, SSE, and identify calls are included in the task-wide cost below. Rejected counts belong to the retained card, not failed attempts.

Retained generation commands: ${retained:.5f}. All reported task usage: ${known:.5f}. Conservative task estimate including a $3.00 reserve for interrupted or timed-out requests without terminal usage: ${known+reserve:.5f}, below the $20 cap.

Spark input/output: $1.25/$4.25 per million. Wonder input/output: $4/$20 per million. API output_tokens includes reasoning; it is counted once. See M4-cost-summary.json and M4-spend.jsonl. The provider's final invoice may differ from token-based estimates.
'''
(base/'M4-precompute.md').write_text(precompute)
events=[json.loads(s[6:]) for s in (base/'M4-live-inject.txt').read_text().splitlines() if s.startswith('data: ')]
card=next(e['card'] for e in events if e['type']=='card_ready')
plants=[c for c in card['claims'] if c.get('injected')]
assert len(plants)==2 and all(not c['accepted'] for c in plants)
assert any(c['quoteCheck']=='not_found' for c in plants)
assert any(c['quoteCheck']=='matched' and c.get('support') not in [None,'supports'] for c in plants)
wall=float(re.search(r'WALL_SECONDS=([\d.]+)',(base/'M4-live-inject-wall.txt').read_text()).group(1))
receives=re.findall(r'^(\S+) <= Recv data,', (base/'M4-live-inject-timing.txt').read_text(),re.M)
stream=dict(seconds=wall,events=len(events),heartbeats=(base/'M4-live-inject.txt').read_text().count(': heartbeat'),receiveChunks=len(receives),firstReceive=receives[0],lastReceive=receives[-1],plantedClaims=plants)
(base/'M4-live-inject-summary.json').write_text(json.dumps(stream,indent=2)+'\n')
def line(file,needle):
 return next(i for i,s in enumerate(Path(file).read_text().splitlines(),1) if needle in s)
def ref(file,needle):return f'`{file}:{line(file,needle)}`'
report=f'''# M4 implementation report

All 16 curated edges and the injected metronidazole record are saved. Every final card has at least one accepted claim. Both metronidazole caches have at least three accepted claims, human_studies depth, a label-versus-PMID-12022894 conflict, and a bounded search gap. No commits, pushes, dependency changes, shared-contract changes, UI edits, or docs/README edits were made.

## Live smoke and fixes

- Meta accepted the research Responses streaming/function-tool requests, continuation IDs, strict Spark synthesis, and strict Wonder judgment. Wonder uses JUDGE_MODEL with muse-wonder-1.0 as default, low reasoning, Zod validation, and one invalid-output retry. Baseten paths and its environment key were removed. {ref('server/judge.ts','export const JUDGE_MODEL')}; `server/env.ts:1`; `.env.example:1`.
- Early smoke took 173.5 seconds and retained only two claims. Trial claims attached population and duration to results-only quotes; Wonder correctly rejected them. Research now requests quotes covering every asserted detail, batches seed claims/searches, uses low reasoning, avoids redundant reads, and excludes unrelated co-exposures. {ref('server/agent/research.ts','const prompt =')}.
- The next smoke restored human_studies and the conflict but retained only two claims. Separating clinical symptoms and acetaldehyde findings produced three supported claims. A review's absence of convincing evidence is explicitly distinguished from a measured null finding. Co-exposure relevance and MAY-versus-observed-harm wording are now part of independent verification. {ref('server/agent/verify.ts','Assess whether')}.
- Generated conflict summaries occasionally failed sentence judgment despite accepted claims on both sides. A fallback built from accepted claim text is independently judged; it is still dropped if unsupported. Independent sentence checks run concurrently. {ref('server/agent/synthesize.ts','const headlineCheck')}; {ref('server/agent/synthesize.ts','let summary')}.
- Gaps remain gated on successful searches and are explicitly bounded to retrieved results. If the healthy-male metronidazole seed lacks a recorded gap, a pregnancy-specific query is tried within the existing 14-call budget; no gap is inferred if retrieval fails. {ref('server/agent/research.ts','The seed trial covers')}.
- Indirect avoidance, caution, and patient-monitoring instructions were found in cetirizine/sertraline-warfarin copy. The advice filter now rejects those forms, with regression tests. Affected cards were regenerated. {ref('server/agent/advice.ts','return /')}; `server/agent/hardening.test.ts:24`.
- The intentionally fabricated injected claim was wasting a repair turn. Planted claims retain their original rejections and are excluded from correction requests. {ref('server/agent/run.ts','const corrections')}.
- Diphenhydramine-zolpidem exhausted three original attempts with zero accepted claims. Its seed is a precautionary instruction rather than a quantified interaction. The label tool now reads the other substance's pinned interaction section; prompts preserve the class-level statement without appending uncited membership or unrelated comparator results. This is a class-based evidence card requiring human review. {ref('server/agent/research.ts','if (!refs.length')}.
- PubMed numeric character entities were decoded, fixing Visapaa's displayed author name to Visapää. `server/tools/pubmed.ts:{line('server/tools/pubmed.ts','function textOf')}`.
- Per-model token accounting and a persistent spend ledger include every completed inference and retry. The live-call guard leaves headroom below $20. {ref('server/agent/runtime.ts','export function estimatedUSD')}; {ref('server/agent/runtime.ts','function spendGuard')}. Precompute supports comma-separated --pair selection, --force, per-edge elapsed time/gaps/cost, atomic cache writes, and failure traces. `scripts/precompute.ts:1`.

## Precompute

{table}

The original batch retried aspirin-ibuprofen after zero accepted claims, ibuprofen-warfarin after the 240-second limit, and diphenhydramine-zolpidem after zero accepted claims. Focused reruns corrected copy/relevance issues in acetaminophen-alcohol, alcohol-diphenhydramine, alcohol-cetirizine, sertraline-warfarin, and metronidazole. Some provider timeouts also required retries. Logs and failed traces are retained in artifacts.

## Live SSE and identify

`curl -N` returned HTTP 200 with {len(events)} events, {stream['heartbeats']} heartbeats, and {len(receives)} receive chunks from {receives[0]} through {receives[-1]}. It streamed incrementally rather than buffering until card_ready. The final captured run took {wall:.3f} seconds; the initial run took 118.920 seconds. The <90-second target was missed.

Both original planted claims were rejected: fabricated quote was not_found and skipped judgment; the real-quote universal fatality claim was matched and judged {next(c['support'] for c in plants if c['quoteCheck']=='matched')}. See M4-live-inject.txt, M4-live-inject-timing.txt, and M4-live-inject-summary.json. The SSE capture preceded the final conflict-fallback/population-gap improvements; final precompute exercises those same pipeline changes and includes the conflict in both caches.

The generated Metronidazole Tablets USP 500 mg image mapped to metronidazole with high confidence. Vitamin C 1000 mg returned an unmatched candidate with null substanceId. Responses are in M4-identify.txt; both PNGs and raw responses are retained. Expo on 8081 was stopped after endpoint checks. Port 8090 was untouched and remained listening.

## Validation and cost

- npm run typecheck: exit 0.
- npx tsc --noEmit --project scripts/tsconfig.server.json: exit 0.
- npm test: 91 tests across 9 files pass. The original live RxNav test passed earlier, then twice hit connect timeouts. Its exact-resolution/properties protocol is now tested with deterministic HTTP fixtures; PubMed and FDA integration tests remain live. The timeout log is retained as M4-tests-rxnorm-timeout.txt. No production RxNorm fallback was added.
- npx expo export -p web: exit 0, six API routes exported. Existing Vite/NO_COLOR warnings remain; Expo reported forced process exit after completing export.
- scripts/m4-audit.mjs: all 17 records pass matched-quote/support, accepted-citation, displayed-advice, and planted-claim checks. This is a structural audit, not clinical validation.

Retained generation commands cost ${retained:.5f}. All reported model usage, including superseded runs, retries, smoke, SSE, and identify, costs ${known:.5f}. A conservative $3.00 reserve covers interrupted/timed-out responses without terminal usage, giving an estimated task total of ${known+reserve:.5f}. No further live calls were made after this accounting. The $20 cap was not reached. See M4-cost-summary.json for per-model token totals.

## Human review

- Metronidazole's null result concerns 12 healthy male volunteers and a specific exposure/observation window. It does not settle effects in other populations. The label-versus-study conflict describes differing evidence, not proof that either source is wrong.
- Lorazepam-tramadol, lorazepam-zolpidem, and diphenhydramine-zolpidem rely on class-level label statements. In particular, the lorazepam-zolpidem ledger includes an alcohol/other-CNS-depressant complex-behavior statement; confirm its relevance to the displayed pair. These are not direct pair-specific trials.
- Aspirin-ibuprofen's retained claim reports a dosing-specific mean platelet-inhibition result and individual lower values. The final card omits the label's stronger interference scenarios after rejections. Review whether this presents the edge adequately before release.
- Ibuprofen-warfarin retains coumarin/NSAID class material and an acenocoumarol cohort grouping several NSAIDs. It must not be read as a direct warfarin-plus-ibuprofen trial. Review its limited-depth presentation.
- Some gaps use very narrow pregnancy or outcome queries. They describe the retrieved search only, not exhaustive absence of evidence. Some earlier cached gap text is less explicit about this scope than the final prompt.
- Some cards have only one accepted claim or label_only/limited depth. Rejected claims remain available for audit. Conservative judges can disagree, including an early rejected mechanism claim whose rationale sounded supportive. Human review remains necessary.
- Initial smoke used the existing snapshot writer, refreshing PMID 12022894's cached retrieval timestamp and creating five extra PubMed snapshots. New retrievals now stay in memory. The five extra files were moved to artifacts/M4-retrieved-sources; the existing PMID 12022894 snapshot retains its refreshed timestamp. This incidental source-cache refresh is outside the requested data/evidence ownership area; it did not alter the curated edge, seed identity, or source passage.
'''
(base/'M4-report.md').write_text(report,encoding='utf-8')
print(json.dumps(dict(records=len(audit),reportedUSD=known,conservativeTotalUSD=known+reserve,wallSeconds=wall)))
