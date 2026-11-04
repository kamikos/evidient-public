import { useState } from "react";
import { Linking, Pressable, StyleSheet, View } from "react-native";
import { Minus, Plus } from "lucide-react-native";
import { color, space } from "@/ui/theme";
import { T } from "./T";

// Attribution as required by each source's licence (see data/catalog-sources.md).
const SOURCES: { name: string; credit: string; url: string }[] = [
  { name: "FDA drug labels", credit: "U.S. Food and Drug Administration, via openFDA and DailyMed. Public domain.", url: "https://open.fda.gov/" },
  { name: "PubMed", credit: "U.S. National Library of Medicine. Abstracts are quoted briefly with links.", url: "https://pubmed.ncbi.nlm.nih.gov/" },
  { name: "RxNorm, RxNav, RxClass", credit: "U.S. National Library of Medicine. Public domain.", url: "https://lhncbc.nlm.nih.gov/RxNav/" },
  { name: "Poland", credit: "Centrum e-Zdrowia / URPL, Rejestr Produktów Leczniczych, accessed 3 Nov 2026. CC BY 4.0. Filtered and mapped.", url: "https://rejestry.ezdrowie.gov.pl/registry/rpl" },
  { name: "France", credit: "Base de données publique des médicaments, updated 3 Nov 2026. Licence Ouverte. Filtered and mapped; not endorsed by ANSM, HAS or UNCAM.", url: "https://base-donnees-publique.medicaments.gouv.fr/" },
  { name: "Italy", credit: "Agenzia Italiana del Farmaco (AIFA), retrieved 3 Nov 2026. CC BY 4.0. Filtered and mapped.", url: "https://www.aifa.gov.it/liste-dei-farmaci" },
  { name: "Canada", credit: "Contains information licensed under the Open Government Licence – Canada. Health Canada, Drug Product Database, retrieved 3 Nov 2026.", url: "https://open.canada.ca/en/open-government-licence-canada" },
  { name: "Norway", credit: "Direktoratet for medisinske produkter (DMP), FEST, 27 Oct 2026: brand names and interaction ratings. NLOD. Filtered, mapped, and shown with English renderings by a coding agent.", url: "https://www.dmp.no/" },
  { name: "Supplements", credit: "NIH Office of Dietary Supplements, Dietary Supplement Label Database. CC0.", url: "https://dsld.od.nih.gov/" },
];

export function SourcesCredits() {
  const [open, setOpen] = useState(false);
  return (
    <View>
      <Pressable onPress={() => setOpen((v) => !v)} accessibilityRole="button" accessibilityState={{ expanded: open }} style={styles.head}>
        <T v="small" style={{ color: color.ink }}>
          Sources and credits
        </T>
        {open ? <Minus size={14} color={color.ink} strokeWidth={2.25} /> : <Plus size={14} color={color.ink} strokeWidth={2.25} />}
      </Pressable>
      {open && (
        <View style={styles.list}>
          <T v="meta">
            Medicine names come from public registries and are mapped to English ingredient names by a script, without AI. No regulator endorses Evidient.
          </T>
          {SOURCES.map((s) => (
            <View key={s.name} style={{ gap: 1 }}>
              <T v="meta" style={{ color: color.ink }} onPress={() => Linking.openURL(s.url)} accessibilityRole="link">
                {s.name}
              </T>
              <T v="meta">{s.credit}</T>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: "row", alignItems: "center", gap: 6, alignSelf: "flex-start", minHeight: 32 },
  list: { gap: space[2], maxWidth: 720, paddingBottom: space[2] },
});
