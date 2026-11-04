import { readdirSync } from "node:fs";
import { z } from "zod";
import { euSchema } from "./eu-smpc";
import { main, read, save } from "./batch-io";
export function metadata() {
  const dates = new Map<string, number>();
  for (const f of readdirSync("data/batch/http")) {
    const raw = z
      .object({ body: z.string() })
      .parse(read("data/batch/http/" + f));
    try {
      const parsed = z
        .object({
          resultados: z.array(
            z.object({
              nregistro: z.string(),
              docs: z.array(
                z.object({ tipo: z.number(), fecha: z.number().optional() }),
              ),
            }),
          ),
        })
        .safeParse(JSON.parse(raw.body));
      if (parsed.success)
        for (const p of parsed.data.resultados) {
          const d = p.docs.find((d) => d.tipo === 1)?.fecha;
          if (d) dates.set(p.nregistro, d);
        }
    } catch {
      /* HTML and XML responses have no registry dates. */
    }
  }
  for (const country of ["ES", "FR"])
    for (const f of readdirSync(`data/sources/eu/${country}`)) {
      const path = `data/sources/eu/${country}/${f}`,
        s = euSchema.parse(read(path));
      const d = dates.get(s.registryId);
      s.documentUpdatedAt =
        country === "FR" ? "2026-11-03" : d ? new Date(d).toISOString() : null;
      s.attribution =
        country === "ES"
          ? `Fuente de la información: Agencia Española de Medicamentos y Productos Sanitarios www.aemps.gob.es. CIMA, retrieved ${s.retrievedAt.slice(0, 10)}, document updated ${s.documentUpdatedAt ?? "not supplied by API"}. Extracted sections; original meaning preserved; no endorsement.`
          : `Base de données publique des médicaments, ANSM, HAS, UNCAM; database updated 2026-11-03, retrieved ${s.retrievedAt.slice(0, 10)}; extracted RCP sections, meaning preserved; no endorsement.`;
      save(path, s);
    }
  save("artifacts/M10b-licences.json", {
    checkedAt: new Date().toISOString(),
    ES: {
      terms: "https://www.aemps.gob.es/aviso-legal/",
      apiDocs: "https://cima.aemps.es/cima/resources/docs/CIMA_REST_API.pdf",
      summary:
        "AEMPS permits reproducing website content with source attribution and document update date. CIMA is not labelled CC0. Retrieval and available document update dates are recorded; absent dates remain null.",
      additionalNomenclatorNotice:
        "https://listadomedicamentos.aemps.gob.es/Aviso_Legal_Nomenclator.pdf",
      additionalNoticeScope:
        "The nomenclator-specific notice includes a private-copy/non-transfer restriction. Do not treat registry metadata or the entire nomenclator as an unrestricted redistributable dump.",
    },
    FR: {
      terms: "https://base-donnees-publique.medicaments.gouv.fr/telechargement",
      licence: "Licence Ouverte",
      summary:
        "Attribute BDPM and its update date, preserve meaning, keep data current, and imply no ANSM/HAS/UNCAM endorsement. Snapshot database update date: 2026-11-03.",
    },
  });
}
if (main("batch-metadata.ts")) metadata();
