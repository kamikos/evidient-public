import { writeFile } from 'node:fs/promises';
import { labelSetIds } from '../data/substances';
import type { CuratedEdge, HarmCategory, SourceRef } from '../shared/contract';
import { getSourceText } from '../server/tools/sourceStore';

const specs: [string,string,HarmCategory,string,string,string,string][] = [
 ['alcohol','acetaminophen','liver','Liver injury warning','acetaminophen','warnings','alcoholic drinks'],
 ['alcohol','ibuprofen','bleeding','Gastrointestinal bleeding risk','ibuprofen','warnings','use of alcohol'],
 ['alcohol','metronidazole','reaction','Disulfiram-like reaction reports','metronidazole','drug_interactions','Alcoholic Beverages'],
 ['alcohol','sertraline','cns_depression','Alcohol interaction evidence','sertraline','drug_interactions','Alcohol'],
 ['alcohol','tramadol','cns_depression','CNS and respiratory depression','tramadol','boxed_warning','alcohol'],
 ['alcohol','lorazepam','cns_depression','Additive CNS depression','lorazepam','drug_interactions','such as alcohol'],
 ['alcohol','zolpidem','cns_depression','Additive psychomotor impairment','zolpidem','drug_interactions','Alcohol'],
 ['alcohol','diphenhydramine','cns_depression','Alcohol warning in label','diphenhydramine','when_using','alcoholic beverages'],
 ['alcohol','cetirizine','cns_depression','Increased drowsiness','cetirizine','warnings','alcohol, sedatives'],
 ['aspirin','ibuprofen','efficacy','Antiplatelet interference','ibuprofen','clinical_pharmacology','interaction with the antiplatelet activity of aspirin'],
 ['ibuprofen','warfarin','bleeding','Increased bleeding risk','warfarin','drug_interactions','ibuprofen'],
 ['sertraline','warfarin','bleeding','Increased bleeding risk','warfarin','drug_interactions','sertraline'],
 ['sertraline','tramadol','serotonin','Serotonin syndrome reports','sertraline','warnings','tramadol'],
 ['lorazepam','tramadol','cns_depression','CNS and respiratory depression','tramadol','boxed_warning','benzodiazepines'],
 ['lorazepam','zolpidem','cns_depression','Additive CNS depression','zolpidem','warnings_and_cautions','benzodiazepines'],
 ['diphenhydramine','zolpidem','cns_depression','Sedative interaction warning','diphenhydramine','ask_doctor_or_pharmacist','sedatives'],
 ['alcohol','hydroxyzine','cns_depression','Increased effects of alcohol','hydroxyzine','precautions','effects of alcohol may be increased'],
 ['alcohol','alprazolam','cns_depression','Additive CNS depression','alprazolam','drug_interactions','ethanol'],
 ['alprazolam','tramadol','cns_depression','CNS and respiratory depression','alprazolam','boxed_warning','benzodiazepines and opioids'],
 ['alprazolam','zolpidem','cns_depression','Additive CNS depression','alprazolam','drug_interactions','CNS depressants'],
 ['alprazolam','hydroxyzine','cns_depression','Additive CNS depression','alprazolam','drug_interactions','antihistaminics'],
 ['hydroxyzine','tramadol','cns_depression','Potentiated CNS depression','hydroxyzine','precautions','CENTRAL NERVOUS SYSTEM DEPRESSANTS'],
 ['hydroxyzine','lorazepam','cns_depression','Additive CNS depression','hydroxyzine','precautions','other CNS depressant drugs'],
 ['hydroxyzine','zolpidem','cns_depression','Additive CNS depression','hydroxyzine','precautions','other CNS depressant drugs'],
 ['amphetamine','sertraline','serotonin','Serotonin syndrome warning','amphetamine','warnings','selective serotonin reuptake inhibitors'],
 ['amphetamine','tramadol','serotonin','Serotonin syndrome warning','amphetamine','warnings','tramadol'],
];
async function main() {
const edges: CuratedEdge[]=[];
const support=[];
for(const [left,right,category,label,substance,section,needle] of specs){
 const [a,b]=[left,right].sort();
 const ref: SourceRef={kind:'fda_label',id:labelSetIds[substance]+'#'+section};
 const text=await getSourceText(ref);
 const index=text.toLowerCase().indexOf(needle.toLowerCase());
 if(index<0)throw Error('Unsupported edge '+a+'__'+b+' missing '+needle);
 const edge: CuratedEdge={pair:`${a}__${b}`,a,b,category,label,seedSources:[ref]};
 if(edge.pair==='alcohol__metronidazole'){
   const study: SourceRef={kind:'pubmed',id:'12022894'};
   const abstract=await getSourceText(study);
   if(!/metronidazole/i.test(abstract))throw Error('Unexpected abstract');
   edge.seedSources.push(study);
 }
 edges.push(edge);
 support.push({pair:edge.pair,source:ref,matchedText:text.slice(Math.max(0,index-(edges.length > 16 ? 500 : 180)),index+600),basis:(edges.length > 16 && !['alcohol__hydroxyzine','alcohol__alprazolam','amphetamine__tramadol'].includes(edge.pair)) || ['lorazepam__tramadol','lorazepam__zolpidem','diphenhydramine__zolpidem'].includes(edge.pair)?'Class-level label statement; class identity recorded in substances.ts':'Named substance statement in label'});
}
const studyRef: SourceRef = { kind: 'pubmed', id: '22076246' };
const abstract = await getSourceText(studyRef);
const excerpt = 'The stimulatory effects of co-administration of dexamphetamine 10 mg were not sufficient to overcome the impairing effects of alcohol on skills related to driving.';
if (!abstract.includes(excerpt)) throw Error('Study excerpt not found');
edges.push({ pair: 'alcohol__amphetamine', a: 'alcohol', b: 'amphetamine', category: 'other', label: 'Driving impairment in a dexamphetamine study', seedSources: [studyRef] });
support.push({ pair: 'alcohol__amphetamine', source: studyRef, matchedText: excerpt, basis: 'Human randomized crossover study, 18 subjects; dexamphetamine, not the full Adderall mixed-salts formulation. No label interaction statement found.' });
await writeFile('data/edges.ts' ,"import type { CuratedEdge } from '../shared/contract';\n\nexport const edges: CuratedEdge[] = "+JSON.stringify(edges,null,2)+";\n");
await writeFile('data/seed-support.json',JSON.stringify(support,null,2)+'\n');
console.log('Confirmed',edges.length,'edges and their source text');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
