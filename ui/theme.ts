/*
 * Evidient visual world: "Basel pharma plate".
 * 1950s–70s Swiss pharmaceutical graphics: strict modular grid, flush-left grotesk,
 * flat saturated colour fields that carry information, geometric marks instead of pictures.
 * Evidence depth is carried by LINE FORM, never by hue (solid / dashed / dotted / doubled).
 */
import { Appearance, Platform } from "react-native";
import type { EvidenceDepth, HarmCategory, SignalLevel, SubstanceKind } from "@/shared/contract";

export type ThemePref = "system" | "light" | "dark";
const PREF_KEY = "evidient.theme";

export function readThemePref(): ThemePref {
  try {
    if (typeof localStorage !== "undefined") {
      const v = localStorage.getItem(PREF_KEY);
      if (v === "light" || v === "dark") return v;
    }
  } catch {
    // storage blocked: follow the system
  }
  return "system";
}

/** Styles are created at module load, so the theme is chosen once; switching reloads the page. */
export function setThemePref(pref: ThemePref) {
  try {
    if (pref === "system") localStorage.removeItem(PREF_KEY);
    else localStorage.setItem(PREF_KEY, pref);
  } catch {
    // ignore: the reload will simply follow the system
  }
  if (Platform.OS === "web" && typeof location !== "undefined") location.reload();
}

function systemDark() {
  if (Platform.OS === "web") return typeof window !== "undefined" && !!window.matchMedia?.("(prefers-color-scheme: dark)").matches;
  return Appearance.getColorScheme() === "dark";
}

export const themePref = readThemePref();
export const isDark = themePref === "dark" || (themePref === "system" && systemDark());

type Palette = {
  paper: string;
  paperDeep: string;
  ink: string;
  inkSoft: string;
  inkFaint: string;
  rule: string;
  ruleFaint: string;
  recede: string;
  focus: string;
  selection: string;
  hover: string;
};

const light: Palette = {
  paper: "#F4F5F2", // cool printed stock, not cream
  paperDeep: "#E8EAE6", // recessed plate / pressed state
  ink: "#111311",
  inkSoft: "#454944", // secondary text, 8.6:1 on paper
  inkFaint: "#6E736C", // tertiary / hairline labels, 4.7:1 on paper
  rule: "#111311",
  ruleFaint: "#C9CCC6",
  recede: "#B9BDB6", // unrelated graph matter when an edge is focused
  focus: "#1F3FBF",
  selection: "rgba(31, 63, 191, 0.18)",
  hover: "rgba(17, 19, 17, 0.05)",
};

/** The same plate printed in reverse: bone ink on a near-black stock. */
const dark: Palette = {
  paper: "#121412",
  paperDeep: "#1D201D",
  ink: "#E9EBE6",
  inkSoft: "#B3B8B0", // ~9:1 on paper
  inkFaint: "#8B9188", // ~5.6:1 on paper
  rule: "#E9EBE6",
  ruleFaint: "#353A34",
  recede: "#3C413B",
  focus: "#8EA2FF",
  selection: "rgba(142, 162, 255, 0.25)",
  hover: "rgba(233, 235, 230, 0.06)",
};

export const color: Palette = isDark ? dark : light;

/**
 * One flat field per harm category. Text colour on the field is chosen for >=4.5:1.
 * `line` is the stroke on the plate: the field colour on light stock, a brighter cut on dark stock.
 */
type Category = { field: string; on: string; line: string; label: string; short: string };
const fields: Record<HarmCategory, Omit<Category, "line"> & { darkLine: string }> = {
  // Kinds of harm use cool and earthy hues only. Warm hues (red, orange, amber) are reserved for warning levels.
  cns_depression: { field: "#1F3FBF", on: "#FFFFFF", darkLine: "#6F86F2", label: "Central nervous system depression", short: "CNS depression" },
  serotonin: { field: "#6E3FC2", on: "#FFFFFF", darkLine: "#A584F0", label: "Serotonin toxicity", short: "Serotonin" },
  bleeding: { field: "#0E7480", on: "#FFFFFF", darkLine: "#3FB5C1", label: "Bleeding", short: "Bleeding" },
  liver: { field: "#56632A", on: "#FFFFFF", darkLine: "#A2B15A", label: "Liver injury", short: "Liver" },
  reaction: { field: "#2F4858", on: "#FFFFFF", darkLine: "#86A4B8", label: "Acute reaction", short: "Reaction" },
  efficacy: { field: "#5B5F59", on: "#FFFFFF", darkLine: "#9DA29A", label: "Changed drug effect", short: "Effect change" },
  other: { field: isDark ? "#E9EBE6" : "#111311", on: isDark ? "#111311" : "#FFFFFF", darkLine: "#E9EBE6", label: "Other effects", short: "Other effects" },
};
export const category = Object.fromEntries(
  Object.entries(fields).map(([k, { darkLine, ...v }]) => [k, { ...v, line: isDark ? darkLine : v.field }]),
) as Record<HarmCategory, Category>;

/**
 * Warning level colour: a warm ramp, never green (no colour may read as "safe").
 * `field` is the result-page header, `on` its text, `mark` the meter bars and map lines (>=3:1 on paper).
 */
type Severity = { field: string; on: string; mark: string };
const severityLight: Record<SignalLevel, Severity> = {
  serious_warning: { field: "#C42318", on: "#FFFFFF", mark: "#C42318" },
  label_advises_against: { field: "#E26A12", on: "#111311", mark: "#B85200" },
  label_mentions: { field: "#EDB817", on: "#111311", mark: "#9A7200" },
  label_no_interaction: { field: "#E8EAE6", on: "#111311", mark: "#6E736C" },
  studies_only: { field: "#5B5F59", on: "#FFFFFF", mark: "#6E736C" },
};
const severityDark: Record<SignalLevel, Severity> = {
  serious_warning: { field: "#C42318", on: "#FFFFFF", mark: "#FF6B5E" },
  label_advises_against: { field: "#E26A12", on: "#111311", mark: "#FF9A45" },
  label_mentions: { field: "#EDB817", on: "#111311", mark: "#F2C94C" },
  label_no_interaction: { field: "#1D201D", on: "#F2F3F0", mark: "#8B9188" },
  studies_only: { field: "#5B5F59", on: "#FFFFFF", mark: "#9DA29A" },
};
export const severity = isDark ? severityDark : severityLight;

export type LineForm = EvidenceDepth | "conflict";

export const lineForm: Record<LineForm, { label: string; describe: string }> = {
  human_studies: { label: "Human studies", describe: "At least one human study supports a claim" },
  label_only: { label: "Label only", describe: "Only regulatory label text supports the claims" },
  limited: { label: "Limited", describe: "Case reports, mechanism or animal data only" },
  conflict: { label: "Sources disagree", describe: "Sources report opposing findings" },
};

export const kindMark: Record<SubstanceKind, { label: string }> = {
  rx: { label: "Prescription" },
  otc: { label: "Over the counter" },
  alcohol: { label: "Alcohol" },
};

export const font = {
  regular: "Archivo_400Regular",
  medium: "Archivo_500Medium",
  semibold: "Archivo_600SemiBold",
  bold: "Archivo_700Bold",
  narrow: "ArchivoNarrow_500Medium",
  narrowBold: "ArchivoNarrow_700Bold",
} as const;

/** Strict size ladder. Nothing outside it. */
export const size = { xs: 12, sm: 14, md: 16, lg: 20, xl: 28, xxl: 44, display: 72 } as const;

export const space = { 1: 4, 2: 8, 3: 12, 4: 16, 5: 24, 6: 32, 7: 48, 8: 64 } as const;

/** Modular grid unit the graph registers to. */
export const GRID = 24;

export const motion = {
  // exponential ease-out; spring for the registration moment
  durationFast: 160,
  durationBase: 320,
  spring: { damping: 22, stiffness: 220, mass: 0.9 },
} as const;

export const breakpoint = { wide: 960 } as const;

export const DISCLAIMER =
  "This shows what labels and studies say, not what's right for you. Ask a pharmacist or doctor before you change how you take a medicine.";

/** One wording for "absence is not evidence of no risk", everywhere. */
export const NO_RISK_CAVEAT = "A gap here doesn't mean there's no risk.";
