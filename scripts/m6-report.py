"""Build the M6 handoff and prove old cards changed only by signal backfill."""
import json
import subprocess
from pathlib import Path


def without_signal(value):
    if isinstance(value, dict):
        return {k: without_signal(v) for k, v in value.items() if k != 'signal'}
    if isinstance(value, list):
        return [without_signal(v) for v in value]
    return value


baseline = json.loads(Path('artifacts/M6-baseline.json').read_text())['revision']
old_names = subprocess.check_output(
    ['git', 'ls-tree', '--name-only', baseline, 'data/evidence/'], text=True
).splitlines()
for name in old_names:
    old = json.loads(subprocess.check_output(['git', 'show', f'{baseline}:{name}'], text=True, encoding='utf8'))
    new = json.loads(Path(name).read_text(encoding='utf8'))
    assert without_signal(old) == without_signal(new), f'Existing card was regenerated or edited: {name}'

audit = json.loads(Path('artifacts/M6-card-audit.json').read_text(encoding='utf8'))
assert not any(row['problems'] for row in audit), 'Card audit has failures'
ledger = [json.loads(line) for line in Path('artifacts/M6-spend.jsonl').read_text().splitlines()]
spend = sum(row['usd'] for row in ledger)
assert spend < 8, 'Spend cap exceeded'
models = {}
for row in ledger:
    model = models.setdefault(row['model'], {'input': 0, 'output': 0, 'usd': 0})
    for key in ['input', 'output', 'usd']:
        model[key] += row[key]
Path('artifacts/M6-cost-summary.json').write_text(json.dumps({'estimatedUSD': spend, 'capUSD': 8, 'completedCalls': len(ledger), 'byModel': models}, indent=2) + '\n')
lines = ['# M6 implementation report', '',
         'Signals report accepted label wording, never a safety verdict. No model calls were used for the backfill.', '',
         f'Catalog: 16 substances, 27 edges. The original 16 edges retain their order. All {len(old_names)} existing evidence records, including the injected demo, are semantically unchanged except for signal fields in the card and replay.', '',
         '## Label pins', '', '| Substance | Set ID | Effective date | Product |', '|---|---|---|---|']
for name in ['amphetamine', 'hydroxyzine', 'alprazolam', 'amoxicillin']:
    label = json.loads(Path(f'artifacts/M6-label-{name}.json').read_text(encoding='utf8'))
    set_id = label['set_id']
    lines.append(f"| {name} | [{set_id}](https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid={set_id}) | {label['effective_time']} | {', '.join(label['openfda']['generic_name'])} |")
lines += ['', 'Raw openFDA responses are retained in artifacts/M6-label-*.json. Relevant sections are snapshotted in data/sources/fda_label. Adderall is the standard mixed-salts tablet; the other pins have one active ingredient.', '',
          '## Added edges and supporting excerpts', '',
          'Class statements remain class statements. Tramadol is an opioid analgesic, sertraline an SSRI, alprazolam and lorazepam benzodiazepines, zolpidem a CNS-depressant hypnotic, and hydroxyzine a sedating antihistamine. The catalog and pinned labels establish these identities. Pair cards do not imply pair-specific clinical trials from a class warning.', '']
support = json.loads(Path('data/seed-support.json').read_text(encoding='utf8'))
for proof in support[16:]:
    ref = proof['source']
    lines += [f"### {proof['pair']}", '', f"Source: {ref['kind']}:{ref['id']}", '', proof['basis'], '', '> ' + proof['matchedText'], '']
hydro = json.loads(Path('artifacts/M6-label-hydroxyzine.json').read_text(encoding='utf8'))
qt = ' '.join(hydro['precautions'])
qt = qt[qt.index('Caution is recommended during the concomitant use'):qt.index('Since drowsiness')]
lines += ['## Dropped or excluded candidates', '',
          '- hydroxyzine__sertraline: the hydroxyzine precautions section discusses QT prolongation and names citalopram and fluoxetine, but does not name sertraline. A specific sertraline QT interaction was not established, so no edge was added.',
          '> ' + qt.strip(), '',
          '- alprazolam__lorazepam: skipped as requested because it duplicates the same drug class.',
          '- alcohol__amoxicillin: no alcohol interaction statement found in the pinned Amoxil label. No edge or card was created. Absence of a curated edge makes no safety claim.',
          '- alcohol__amphetamine has no supporting interaction statement in the pinned Adderall sections. It was retained under the permitted PubMed exception with PubMed-only seeds, PMID 22076246. This randomized crossover study used dexamphetamine in 18 subjects, not the complete Adderall mixed-salts formulation. The card must preserve that scope.', '',
          '## Brand verification', '',
          'Brand lookups and matching ingredients are recorded in artifacts/M6-brand-verification.json. Additional references: [Panadol](https://www.panadol.com/), [Nurofen](https://www.nhs.uk/medicines/ibuprofen-for-adults/), [Atarax and Vistaril](https://medlineplus.gov/druginfo/meds/a682866.html). Adderall, Xanax and Amoxil are the pinned product names. Atarax is a historical US brand; Vistaril uses the pamoate salt. Brand aliases identify the substance and do not assert equivalence across formulations.', '',
          '## Card review', '', '| Pair | Proposed | Accepted | Rejected | Depth | Conflicts | Gaps | Signal |', '|---|---:|---:|---:|---|---:|---:|---|']
for row in audit:
    card = json.loads(Path(f"data/evidence/{row['edge']}.json").read_text(encoding='utf8'))['card']
    lines.append(f"| {row['edge']} | {row['proposed']} | {row['accepted']} | {row['rejected']} | {row['depth']} | {row['conflicts']} | {row['gaps']} | {card['signal']['level']} |")
lines += ['', 'Full sentence and signal-basis dump: artifacts/M6-cards.md. Automated audit: artifacts/M6-card-audit.json. No completed card required a quality rerun. The interrupted initial process wrote no cards and was restarted once using the same explicit new-pair filter. After all 11 writes succeeded, precompute hit the Windows path limit for its summary filename; long selections now use a short content hash. No card was regenerated to resolve that summary-only error. New headlines were reviewed for pair focus and study-population scope. All cards have reported content, headlines at most 25 words, no un-attributed advice, valid accepted-claim citations, and at most one gap.', '',
          '## Validation and spend', '',
          'Passed npm run typecheck, server script typecheck, npm test, M6 card audit, existing-card preservation check, and npm run build:web. server/generated includes the final cards and source snapshots.', '',
          f'Estimated model spend: ${spend:.6f} across {len(ledger)} completed calls, including the interrupted initial process and any reruns. Cap: $8. Usage ledger: artifacts/M6-spend.jsonl. Estimates use the existing runtime per-model token rates; interrupted streams without a returned usage record cannot be metered by the client.', '',
          'No push or deployment. Port 8090 was not used. Shared contract and UI files belong to the orchestrator and are excluded from this implementation commit.', '']
Path('artifacts/M6-report.md').write_text('\n'.join(lines), encoding='utf8')
print(f'Preserved {len(old_names)} existing records; {len(audit)} cards audited; spend ${spend:.6f}')
