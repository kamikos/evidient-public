import { Platform } from "react-native";
import { color, isDark } from "@/ui/theme";

/*
DIRECTION CONTRACT (impeccable, seed 860cda1a)
THESIS: Evidence as a printed Basel pharmaceutical plate: the interaction map is the page, refusing the clinical blue-card health app and the neon "AI graph".
OWN-WORLD: cool printed stock, ink rules, one flat colour field per harm category (ultramarine, vermilion, cadmium, magenta, emerald), Archivo + Archivo Narrow on a strict size ladder, line form (solid/dashed/dotted/doubled) for evidence depth.
STORY: see which combinations are documented, open one, read quote-backed sentences, see disagreement and gaps, then inspect how each claim was checked.
FIRST VIEWPORT: header rule with wordmark, chosen substances and add field; left catalogue index, centre grid-registered graph plate with legend, right colour-field evidence panel on selection.
FORM: Basel pharma plate, assigned candidate 3, seed key 860cda1a.
FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
*/

const css = `
:root { color-scheme: ${isDark ? "dark" : "light"}; }
html, body { background: ${color.paper}; color: ${color.ink}; }
body { -webkit-font-smoothing: antialiased; text-rendering: optimizeLegibility; }
::selection { background: ${color.selection}; color: ${color.ink}; }
:focus { outline: none; }
:focus-visible { outline: 2px solid ${color.focus}; outline-offset: 2px; }
input { caret-color: ${color.focus}; }
* { scrollbar-width: thin; scrollbar-color: ${color.ink} transparent; }
::-webkit-scrollbar { width: 8px; height: 8px; }
::-webkit-scrollbar-thumb { background: ${color.ink}; }
::-webkit-scrollbar-track { background: transparent; }
@media (prefers-reduced-motion: reduce) { * { transition-duration: 0ms !important; animation-duration: 0ms !important; } }
`;

export function installWebGlobals() {
  if (Platform.OS !== "web" || typeof document === "undefined") return;
  if (document.getElementById("evidient-globals")) return;
  const el = document.createElement("style");
  el.id = "evidient-globals";
  el.textContent = css;
  document.head.appendChild(el);
}
