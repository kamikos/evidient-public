import type { CuratedEdge } from '../shared/contract';

export const edges: CuratedEdge[] = [
  {
    "pair": "acetaminophen__alcohol",
    "a": "acetaminophen",
    "b": "alcohol",
    "category": "liver",
    "label": "Liver injury warning",
    "seedSources": [
      {
        "kind": "fda_label",
        "id": "004c39cd-b4f4-1cae-e063-6394a90a0697#warnings"
      }
    ]
  },
  {
    "pair": "alcohol__ibuprofen",
    "a": "alcohol",
    "b": "ibuprofen",
    "category": "bleeding",
    "label": "Gastrointestinal bleeding risk",
    "seedSources": [
      {
        "kind": "fda_label",
        "id": "00872852-680a-41b3-901b-b991b12a176d#warnings"
      }
    ]
  },
  {
    "pair": "alcohol__metronidazole",
    "a": "alcohol",
    "b": "metronidazole",
    "category": "reaction",
    "label": "Disulfiram-like reaction reports",
    "seedSources": [
      {
        "kind": "fda_label",
        "id": "0c55bfc1-770a-4cce-a5dd-446000b24f16#drug_interactions"
      },
      {
        "kind": "pubmed",
        "id": "12022894"
      }
    ]
  },
  {
    "pair": "alcohol__sertraline",
    "a": "alcohol",
    "b": "sertraline",
    "category": "cns_depression",
    "label": "Alcohol interaction evidence",
    "seedSources": [
      {
        "kind": "fda_label",
        "id": "00179766-980b-44b0-99d3-1fee2bb27e37#drug_interactions"
      }
    ]
  },
  {
    "pair": "alcohol__tramadol",
    "a": "alcohol",
    "b": "tramadol",
    "category": "cns_depression",
    "label": "CNS and respiratory depression",
    "seedSources": [
      {
        "kind": "fda_label",
        "id": "00b7f61b-5173-43e6-a3f9-d2efbda40c19#boxed_warning"
      }
    ]
  },
  {
    "pair": "alcohol__lorazepam",
    "a": "alcohol",
    "b": "lorazepam",
    "category": "cns_depression",
    "label": "Additive CNS depression",
    "seedSources": [
      {
        "kind": "fda_label",
        "id": "247110f2-5468-4593-8d86-41f8c869e03d#drug_interactions"
      }
    ]
  },
  {
    "pair": "alcohol__zolpidem",
    "a": "alcohol",
    "b": "zolpidem",
    "category": "cns_depression",
    "label": "Additive psychomotor impairment",
    "seedSources": [
      {
        "kind": "fda_label",
        "id": "25e71199-c55d-4cc6-8388-b309d654d2b0#drug_interactions"
      }
    ]
  },
  {
    "pair": "alcohol__diphenhydramine",
    "a": "alcohol",
    "b": "diphenhydramine",
    "category": "cns_depression",
    "label": "Alcohol warning in label",
    "seedSources": [
      {
        "kind": "fda_label",
        "id": "01906eed-78ee-f2a1-e063-6294a90a809b#when_using"
      }
    ]
  },
  {
    "pair": "alcohol__cetirizine",
    "a": "alcohol",
    "b": "cetirizine",
    "category": "cns_depression",
    "label": "Increased drowsiness",
    "seedSources": [
      {
        "kind": "fda_label",
        "id": "016b66fd-dde9-4f13-afaf-a8aafbdeed1a#warnings"
      }
    ]
  },
  {
    "pair": "aspirin__ibuprofen",
    "a": "aspirin",
    "b": "ibuprofen",
    "category": "efficacy",
    "label": "Antiplatelet interference",
    "seedSources": [
      {
        "kind": "fda_label",
        "id": "00872852-680a-41b3-901b-b991b12a176d#clinical_pharmacology"
      }
    ]
  },
  {
    "pair": "ibuprofen__warfarin",
    "a": "ibuprofen",
    "b": "warfarin",
    "category": "bleeding",
    "label": "Increased bleeding risk",
    "seedSources": [
      {
        "kind": "fda_label",
        "id": "2c8f47c6-a180-4ad8-b962-04069d2270cb#drug_interactions"
      }
    ]
  },
  {
    "pair": "sertraline__warfarin",
    "a": "sertraline",
    "b": "warfarin",
    "category": "bleeding",
    "label": "Increased bleeding risk",
    "seedSources": [
      {
        "kind": "fda_label",
        "id": "2c8f47c6-a180-4ad8-b962-04069d2270cb#drug_interactions"
      }
    ]
  },
  {
    "pair": "sertraline__tramadol",
    "a": "sertraline",
    "b": "tramadol",
    "category": "serotonin",
    "label": "Serotonin syndrome reports",
    "seedSources": [
      {
        "kind": "fda_label",
        "id": "00179766-980b-44b0-99d3-1fee2bb27e37#warnings"
      }
    ]
  },
  {
    "pair": "lorazepam__tramadol",
    "a": "lorazepam",
    "b": "tramadol",
    "category": "cns_depression",
    "label": "CNS and respiratory depression",
    "seedSources": [
      {
        "kind": "fda_label",
        "id": "00b7f61b-5173-43e6-a3f9-d2efbda40c19#boxed_warning"
      }
    ]
  },
  {
    "pair": "lorazepam__zolpidem",
    "a": "lorazepam",
    "b": "zolpidem",
    "category": "cns_depression",
    "label": "Additive CNS depression",
    "seedSources": [
      {
        "kind": "fda_label",
        "id": "25e71199-c55d-4cc6-8388-b309d654d2b0#warnings_and_cautions"
      }
    ]
  },
  {
    "pair": "diphenhydramine__zolpidem",
    "a": "diphenhydramine",
    "b": "zolpidem",
    "category": "cns_depression",
    "label": "Sedative interaction warning",
    "seedSources": [
      {
        "kind": "fda_label",
        "id": "01906eed-78ee-f2a1-e063-6294a90a809b#ask_doctor_or_pharmacist"
      }
    ]
  },
  {
    "pair": "alcohol__hydroxyzine",
    "a": "alcohol",
    "b": "hydroxyzine",
    "category": "cns_depression",
    "label": "Increased effects of alcohol",
    "seedSources": [
      {
        "kind": "fda_label",
        "id": "09092888-0c18-501d-e063-6294a90aad67#precautions"
      }
    ]
  },
  {
    "pair": "alcohol__alprazolam",
    "a": "alcohol",
    "b": "alprazolam",
    "category": "cns_depression",
    "label": "Additive CNS depression",
    "seedSources": [
      {
        "kind": "fda_label",
        "id": "388e249d-b9b6-44c3-9f8f-880eced0239f#drug_interactions"
      }
    ]
  },
  {
    "pair": "alprazolam__tramadol",
    "a": "alprazolam",
    "b": "tramadol",
    "category": "cns_depression",
    "label": "CNS and respiratory depression",
    "seedSources": [
      {
        "kind": "fda_label",
        "id": "388e249d-b9b6-44c3-9f8f-880eced0239f#boxed_warning"
      }
    ]
  },
  {
    "pair": "alprazolam__zolpidem",
    "a": "alprazolam",
    "b": "zolpidem",
    "category": "cns_depression",
    "label": "Additive CNS depression",
    "seedSources": [
      {
        "kind": "fda_label",
        "id": "388e249d-b9b6-44c3-9f8f-880eced0239f#drug_interactions"
      }
    ]
  },
  {
    "pair": "alprazolam__hydroxyzine",
    "a": "alprazolam",
    "b": "hydroxyzine",
    "category": "cns_depression",
    "label": "Additive CNS depression",
    "seedSources": [
      {
        "kind": "fda_label",
        "id": "388e249d-b9b6-44c3-9f8f-880eced0239f#drug_interactions"
      }
    ]
  },
  {
    "pair": "hydroxyzine__tramadol",
    "a": "hydroxyzine",
    "b": "tramadol",
    "category": "cns_depression",
    "label": "Potentiated CNS depression",
    "seedSources": [
      {
        "kind": "fda_label",
        "id": "09092888-0c18-501d-e063-6294a90aad67#precautions"
      }
    ]
  },
  {
    "pair": "hydroxyzine__lorazepam",
    "a": "hydroxyzine",
    "b": "lorazepam",
    "category": "cns_depression",
    "label": "Additive CNS depression",
    "seedSources": [
      {
        "kind": "fda_label",
        "id": "09092888-0c18-501d-e063-6294a90aad67#precautions"
      }
    ]
  },
  {
    "pair": "hydroxyzine__zolpidem",
    "a": "hydroxyzine",
    "b": "zolpidem",
    "category": "cns_depression",
    "label": "Additive CNS depression",
    "seedSources": [
      {
        "kind": "fda_label",
        "id": "09092888-0c18-501d-e063-6294a90aad67#precautions"
      }
    ]
  },
  {
    "pair": "amphetamine__sertraline",
    "a": "amphetamine",
    "b": "sertraline",
    "category": "serotonin",
    "label": "Serotonin syndrome warning",
    "seedSources": [
      {
        "kind": "fda_label",
        "id": "f22635fe-821d-4cde-aa12-419f8b53db81#warnings"
      }
    ]
  },
  {
    "pair": "amphetamine__tramadol",
    "a": "amphetamine",
    "b": "tramadol",
    "category": "serotonin",
    "label": "Serotonin syndrome warning",
    "seedSources": [
      {
        "kind": "fda_label",
        "id": "f22635fe-821d-4cde-aa12-419f8b53db81#warnings"
      }
    ]
  },
  {
    "pair": "alcohol__amphetamine",
    "a": "alcohol",
    "b": "amphetamine",
    "category": "other",
    "label": "Driving impairment in a dexamphetamine study",
    "seedSources": [
      {
        "kind": "pubmed",
        "id": "22076246"
      }
    ]
  },
  { pair: "alcohol__methylphenidate", a: "alcohol", b: "methylphenidate", category: "other", label: "Faster release from extended-release capsules with alcohol", seedSources: [{ kind: "fda_label", id: "10aa0dc0-bd0e-4927-a19a-8722d78ad67d#clinical_pharmacology" }] }
];
