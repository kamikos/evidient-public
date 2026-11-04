import type { Substance } from '../shared/contract';

export const substances: Substance[] = [
  { id: "methylphenidate", name: "Methylphenidate", kind: "rx", rxcui: "6901", aliases: ["ritalin", "concerta", "medikinet", "equasym"], brands: ["Ritalin", "Concerta", "Medikinet", "Equasym"], drugClass: "Stimulant (ADHD)" },
  {
    "id": "alcohol",
    "name": "Alcohol",
    "kind": "alcohol",
    "aliases": [
      "ethanol",
      "beer",
      "wine",
      "spirits",
      "vodka",
      "drinking"
    ],
    "drugClass": "Alcohol",
    "brands": []
  },
  {
    "id": "acetaminophen",
    "name": "Acetaminophen",
    "kind": "otc",
    "rxcui": "161",
    "aliases": [
      "paracetamol",
      "tylenol",
      "panadol"
    ],
    "drugClass": "Analgesic / antipyretic",
    "brands": [
      "Tylenol",
      "Panadol"
    ]
  },
  {
    "id": "ibuprofen",
    "name": "Ibuprofen",
    "kind": "otc",
    "rxcui": "5640",
    "aliases": [
      "advil",
      "motrin",
      "nurofen"
    ],
    "drugClass": "NSAID",
    "brands": [
      "Advil",
      "Motrin",
      "Nurofen"
    ]
  },
  {
    "id": "aspirin",
    "name": "Aspirin",
    "kind": "otc",
    "rxcui": "1191",
    "aliases": [
      "acetylsalicylic acid",
      "bayer",
      "ecotrin"
    ],
    "drugClass": "NSAID / antiplatelet",
    "brands": [
      "Bayer",
      "Ecotrin"
    ]
  },
  {
    "id": "warfarin",
    "name": "Warfarin",
    "kind": "rx",
    "rxcui": "11289",
    "aliases": [
      "coumadin",
      "jantoven"
    ],
    "drugClass": "Vitamin K antagonist",
    "brands": [
      "Coumadin",
      "Jantoven"
    ]
  },
  {
    "id": "metronidazole",
    "name": "Metronidazole",
    "kind": "rx",
    "rxcui": "6922",
    "aliases": [
      "flagyl"
    ],
    "drugClass": "Nitroimidazole antibiotic",
    "brands": [
      "Flagyl"
    ]
  },
  {
    "id": "sertraline",
    "name": "Sertraline",
    "kind": "rx",
    "rxcui": "36437",
    "aliases": [
      "zoloft"
    ],
    "drugClass": "SSRI",
    "brands": [
      "Zoloft"
    ]
  },
  {
    "id": "tramadol",
    "name": "Tramadol",
    "kind": "rx",
    "rxcui": "10689",
    "aliases": [
      "ultram"
    ],
    "drugClass": "Opioid analgesic",
    "brands": [
      "Ultram"
    ]
  },
  {
    "id": "lorazepam",
    "name": "Lorazepam",
    "kind": "rx",
    "rxcui": "6470",
    "aliases": [
      "ativan"
    ],
    "drugClass": "Benzodiazepine",
    "brands": [
      "Ativan"
    ]
  },
  {
    "id": "zolpidem",
    "name": "Zolpidem",
    "kind": "rx",
    "rxcui": "39993",
    "aliases": [
      "ambien"
    ],
    "drugClass": "Sedative / hypnotic",
    "brands": [
      "Ambien"
    ]
  },
  {
    "id": "diphenhydramine",
    "name": "Diphenhydramine",
    "kind": "otc",
    "rxcui": "3498",
    "aliases": [
      "benadryl",
      "zzzquil"
    ],
    "drugClass": "Sedating antihistamine",
    "brands": [
      "Benadryl",
      "ZzzQuil"
    ]
  },
  {
    "id": "cetirizine",
    "name": "Cetirizine",
    "kind": "otc",
    "rxcui": "20610",
    "aliases": [
      "zyrtec"
    ],
    "drugClass": "Antihistamine",
    "brands": [
      "Zyrtec"
    ]
  },
  {
    "id": "amphetamine",
    "name": "Amphetamine",
    "kind": "rx",
    "rxcui": "725",
    "aliases": [
      "mixed amphetamine salts",
      "dextroamphetamine-amphetamine",
      "dextroamphetamine",
      "dexamphetamine",
      "adderall"
    ],
    "brands": [
      "Adderall"
    ],
    "drugClass": "Stimulant (ADHD)"
  },
  {
    "id": "hydroxyzine",
    "name": "Hydroxyzine",
    "kind": "rx",
    "rxcui": "5553",
    "aliases": [
      "atarax",
      "vistaril"
    ],
    "brands": [
      "Atarax",
      "Vistaril"
    ],
    "drugClass": "Antihistamine (anxiety, itch)"
  },
  {
    "id": "alprazolam",
    "name": "Alprazolam",
    "kind": "rx",
    "rxcui": "596",
    "aliases": [
      "xanax"
    ],
    "brands": [
      "Xanax"
    ],
    "drugClass": "Benzodiazepine"
  },
  {
    "id": "amoxicillin",
    "name": "Amoxicillin",
    "kind": "rx",
    "rxcui": "723",
    "aliases": [
      "amoxil"
    ],
    "brands": [
      "Amoxil"
    ],
    "drugClass": "Antibiotic (penicillin)"
  }
];

// Pinned oral single-ingredient products, except the standard Adderall mixed salts.
export const labelSetIds: Record<string, string> = {
  "methylphenidate": "10aa0dc0-bd0e-4927-a19a-8722d78ad67d",
  "acetaminophen": "004c39cd-b4f4-1cae-e063-6394a90a0697",
  "ibuprofen": "00872852-680a-41b3-901b-b991b12a176d",
  "aspirin": "00d9ab0d-ff25-784f-e063-6294a90a8497",
  "warfarin": "2c8f47c6-a180-4ad8-b962-04069d2270cb",
  "metronidazole": "0c55bfc1-770a-4cce-a5dd-446000b24f16",
  "sertraline": "00179766-980b-44b0-99d3-1fee2bb27e37",
  "tramadol": "00b7f61b-5173-43e6-a3f9-d2efbda40c19",
  "lorazepam": "247110f2-5468-4593-8d86-41f8c869e03d",
  "zolpidem": "25e71199-c55d-4cc6-8388-b309d654d2b0",
  "diphenhydramine": "01906eed-78ee-f2a1-e063-6294a90a809b",
  "cetirizine": "016b66fd-dde9-4f13-afaf-a8aafbdeed1a",
  "amphetamine": "f22635fe-821d-4cde-aa12-419f8b53db81",
  "hydroxyzine": "09092888-0c18-501d-e063-6294a90aad67",
  "alprazolam": "388e249d-b9b6-44c3-9f8f-880eced0239f",
  "amoxicillin": "ec7dd735-dc92-3d29-e053-2a95a90af549"
};
