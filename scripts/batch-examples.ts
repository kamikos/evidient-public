import { packetSchema } from "./batch-packets";
import { main, read, save } from "./batch-io";
// Human-authored examples from the packet; no generation endpoint is used.
export function examples() {
  const examples = [
    {
      pair: "alcohol__bupropion",
      sourceId: "ES:63265#4.5",
      quote:
        "Aunque en los datos clínicos no se identifica la existencia de una interacción farmacocinética entre bupropión y alcohol, en raras ocasiones se ha notificado la aparición de acontecimientos adversos neuropsiquiátricos o de una disminución de la tolerancia al alcohol en pacientes que beben alcohol durante el tratamiento con Zyntabac.",
      quoteEnglish:
        "Although clinical data do not identify a pharmacokinetic interaction between bupropion and alcohol, rare neuropsychiatric adverse events or reduced alcohol tolerance have been reported in patients drinking alcohol during Zyntabac treatment.",
      text: "The Spanish bupropion label reports rare neuropsychiatric events or reduced alcohol tolerance in patients drinking alcohol during treatment.",
      headline:
        "The Spanish label reports rare adverse events with alcohol during bupropion treatment.",
      category: "cns_depression",
      outcome: "neuropsychiatric_events",
    },
    {
      pair: "adalimumab__azathioprine",
      sourceId: "ES:103256013#4.4",
      quote:
        "Algunos de estos linfomas hepatoesplénicos de células T con Humira se han presentado en pacientes adultos jóvenes en tratamiento concomitante con azatioprina o 6 - mercaptopurina utilizada para la enfermedad inflamatoria intestinal.",
      quoteEnglish:
        "Some of these hepatosplenic T-cell lymphomas with Humira occurred in young adult patients receiving concomitant azathioprine or 6-mercaptopurine for inflammatory bowel disease.",
      text: "The Spanish adalimumab label describes hepatosplenic T-cell lymphoma cases in young adults receiving azathioprine or mercaptopurine for inflammatory bowel disease.",
      headline:
        "The Spanish label reports lymphoma cases with adalimumab and azathioprine or mercaptopurine.",
      category: "other",
      outcome: "hepatosplenic_t_cell_lymphoma",
    },
  ];
  for (const e of examples) {
    packetSchema.parse(read(`data/batch/packets/${e.pair}.json`));
    save(`data/batch/claims/${e.pair}.json`, {
      pair: e.pair,
      curator: "gpt-6.1-sol",
      claims: [
        {
          id: "c1",
          text: e.text,
          quote: e.quote,
          quoteEnglish: e.quoteEnglish,
          sourceId: e.sourceId,
          stance: "increases_risk",
          outcome: e.outcome,
        },
      ],
      headline: { text: e.headline, claimIds: ["c1"] },
      reported: [{ text: e.text, claimIds: ["c1"] }],
      mechanism: [],
      category: e.category,
      gaps: [],
    });
  }
}
if (main("batch-examples.ts")) examples();
