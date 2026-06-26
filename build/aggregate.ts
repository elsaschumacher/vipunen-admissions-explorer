// Aggregation rules for the Vipunen admissions dataset.
//
// GROUPING — a "program" is identified by institution + entry cycle + field:
//   - entry cycle = tutkinnonAloitussykli (Bologna cycle): "I sykli" = first-cycle
//     entry (high-schoolers apply directly to a bachelor / combined bachelor+master),
//     "II sykli" = master's entry (you already hold a bachelor), "III sykli" = doctoral.
//   - field = paaasiallinenTutkintoHakukohde with its degree-type prefix removed
//     ("Tekn. kand., tuotantotalous" and "Dipl.ins., tuotantotalous" both → "tuotantotalous").
// This keeps a combined bachelor+master program continuous across years even when
// Vipunen flip-flops whether it labels the main degree as the bachelor or the master,
// while keeping a separate master's-only (II sykli) entry distinct.
//
// METRICS — each application target (hakukohde) in a year is split into several source
// rows by valintatapajononTyyppi (selection track); metrics live on DIFFERENT rows:
//   - track = null            → carries aloituspaikatLkm (places)
//   - track = "Ei valittu"    → carries kaikkiHakijatLkm / ensisijaisetHakijatLkm
//   - named tracks (Todistusvalinta, Koepisteet, …) → valitut / vastaanottaneet / scores
// So per (program, year, hakutapa) we SUM each metric across all rows (null → 0).
// Scores are per-track and on different point scales, so they are kept per-track.

/** A raw row as returned by the Vipunen API (only the fields we use). */
export interface VipunenRow {
  koulutuksenAlkamisvuosi: number;
  koulutuksenAlkamiskausi: string | null;
  hakukohde: string | null;
  hakutapa: string | null;
  hakutyyppi: string | null;
  valintatapajononTyyppi: string | null;
  tutkinnonAloitussykli: string | null;
  kooditHakukohde: string | null;
  koulutusasteTaso2: string | null;
  koulutusalaTaso1: string | null;
  okmOhjauksenAla: string | null;
  paaasiallinenTutkintoHakukohde: string | null;
  koulutuksenKieli: string | null;
  maakuntaHakukohde: string | null;
  kuntaHakukohde: string | null;
  sektori: string | null;
  korkeakoulu: string | null;
  toimipiste: string | null;
  aloituspaikatLkm: number | null;
  kaikkiHakijatLkm: number | null;
  ensisijaisetHakijatLkm: number | null;
  valitutLkm: number | null;
  paikanVastaanottaneetLkm: number | null;
  aloittaneetLkm: number | null;
  alinHyvaksyttyPistemaara: number | null;
  ylinHyvaksyttyPistemaara: number | null;
}

export interface ProgramRow {
  program_id: string;
  korkeakoulu: string;
  sektori: string | null;
  program: string; // display name = major / study option
  field: string; // normalized major name (lowercase)
  degree_group: string | null; // the broader degree this major belongs to, e.g. "Tietotekniikka"
  entry_cycle: string; // friendly label: "Suora haku (kandi/perustutkinto)" / "Maisterihaku" / …
  cycle_code: string; // i | ii | iii | x
  degrees: string | null; // distinct main-degree labels seen, for info
  first_year: number | null;
  last_year: number | null;
  active: boolean; // had applicants/places in ACTIVE_FROM or later (current Opintopolku round)
  opintopolku_oid: string | null; // latest hakukohde OID
  opintopolku_koulutus_oid: string | null; // resolved koulutus OID → /konfo/fi/koulutus/<oid>
  koulutusala: string | null;
  ohjauksen_ala: string | null;
  maakunta: string | null;
  kunta: string | null;
}

export interface ProgramYearRow {
  program_id: string;
  year: number;
  hakutapa: string;
  places: number;
  applicants: number;
  first_pref: number;
  selected: number;
  accepted: number;
  started: number;
}

export interface ProgramTrackRow {
  program_id: string;
  year: number;
  hakutapa: string;
  track: string;
  selected: number;
  accepted: number;
  min_score: number | null;
  max_score: number | null;
}

export interface Aggregated {
  programs: ProgramRow[];
  programYears: ProgramYearRow[];
  programTracks: ProgramTrackRow[];
}

const n = (v: number | null | undefined): number => (typeof v === "number" ? v : 0);

// A program counts as "active" if it had applicants/places in this year or later
// (i.e. it appears in the current Opintopolku application round).
export const ACTIVE_FROM = 2025;

function slug(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** Field name = paaasiallinenTutkintoHakukohde with the leading "<degree>," prefix removed. */
export function fieldOf(label: string): string {
  const parts = label.split(", ");
  return (parts.length > 1 ? parts.slice(1).join(", ") : label).trim().toLowerCase();
}

// Admission round / side-channel markers that prefix a hakukohde, e.g.
// "Haku avoimen yliopiston väylän kautta, Tietotekniikka, …" or
// "Päähaku, lääketieteen koulutusohjelma, …". Without stripping these the major
// would wrongly become "Päähaku"/"Haku …", collapsing unrelated programs together.
const CHANNEL_PREFIXES = [
  "haku ",
  "päähaku",
  "huvudansökan",
  "gemensam ansökan",
  "double degree",
  "siirtohaku",
  "avoimen väylä",
  "avoin väylä",
];

/**
 * Major / study option recovered from the hakukohde (application target), e.g.
 * "Tietotekniikka, tekniikan kandidaatti ja diplomi-insinööri (3 v + 2 v)" → "Tietotekniikka".
 * This is finer than the degree label and matches how institutions list their majors.
 */
export function majorName(hakukohde: string | null, fallbackLabel: string): string {
  if (!hakukohde) return fieldOf(fallbackLabel);
  let s = hakukohde;
  const low = s.toLowerCase();
  if (CHANNEL_PREFIXES.some((p) => low.startsWith(p)) && s.includes(",")) {
    s = s.slice(s.indexOf(",") + 1); // drop leading admission-channel segment
  }
  if (s.includes(";")) s = s.slice(s.lastIndexOf(";") + 1); // umbrella name → last part
  const segs = s.split(",").map((x) => x.trim());
  // AMK hakukohde are "<degree> (AMK), <field>" (degree-type first) → take the field;
  // university hakukohde are "<field>, <degree>" (field first) → take the first segment.
  const isAmkDegreeFirst = /\((ylempi\s+)?(amk|yamk)\)/i.test(segs[0]) && segs.length > 1;
  let field = isAmkDegreeFirst ? segs[1] : segs[0];
  field = field.replace(/\s*\([^)]*\)/g, "").trim(); // drop parentheticals
  return field || fieldOf(fallbackLabel);
}

/** The degree-type prefix, e.g. "Dipl.ins." from "Dipl.ins., tuotantotalous". */
export function degreeOf(label: string): string {
  const parts = label.split(", ");
  return parts.length > 1 ? parts[0].trim() : "";
}

/** Bologna cycle → short code used in the program id. */
export function cycleCode(sykli: string | null): string {
  switch (sykli) {
    case "I sykli":
      return "i";
    case "II sykli":
      return "ii";
    case "III sykli":
      return "iii";
    default:
      return "x";
  }
}

/** Bologna cycle → user-facing label describing who applies. */
export function cycleLabel(sykli: string | null): string {
  switch (sykli) {
    case "I sykli":
      return "Suora haku (kandi/perustutkinto)";
    case "II sykli":
      return "Maisterihaku";
    case "III sykli":
      return "Tohtorikoulutus";
    default:
      return "Muu / ei tietoa";
  }
}

/** Stable program id = institution + entry cycle + major/study option. */
export function programId(korkeakoulu: string, sykli: string | null, major: string): string {
  return `${slug(korkeakoulu)}__${cycleCode(sykli)}__${slug(major)}`;
}

function titleCase(field: string): string {
  return field.charAt(0).toUpperCase() + field.slice(1);
}

/**
 * A program row must identify an institution and a real degree. Excludes
 * non-degree offerings (open university, FITech, täydennyskoulutus, etc.),
 * which Vipunen marks with "Tieto puuttuu" / "Tutkintoon johtamaton koulutus".
 */
export function isUsableProgram(r: VipunenRow): boolean {
  return (
    Boolean(r.korkeakoulu) &&
    Boolean(r.paaasiallinenTutkintoHakukohde) &&
    r.paaasiallinenTutkintoHakukohde !== "Tieto puuttuu" &&
    r.tutkinnonAloitussykli !== "Tutkintoon johtamaton koulutus"
  );
}

function minOf(a: number | null, b: number | null): number | null {
  if (a == null) return b;
  if (b == null) return a;
  return Math.min(a, b);
}
function maxOf(a: number | null, b: number | null): number | null {
  if (a == null) return b;
  if (b == null) return a;
  return Math.max(a, b);
}

/** Aggregate raw Vipunen rows into the three target tables. */
export function aggregate(rows: VipunenRow[]): Aggregated {
  const programs = new Map<string, ProgramRow>();
  const degreeSets = new Map<string, Set<string>>();
  const years = new Map<string, ProgramYearRow>();
  const tracks = new Map<string, ProgramTrackRow>();
  // per-program activity span + latest hakukohde OID (for the Opintopolku link)
  const stats = new Map<
    string,
    { first: number; last: number; oid: string | null; oidYear: number; oidApp: number }
  >();

  for (const r of rows) {
    if (!isUsableProgram(r)) continue;
    const korkeakoulu = r.korkeakoulu as string;
    const label = r.paaasiallinenTutkintoHakukohde as string;
    const major = majorName(r.hakukohde, label);
    const pid = programId(korkeakoulu, r.tutkinnonAloitussykli, major);
    const hakutapa = r.hakutapa || "Tuntematon";
    const year = r.koulutuksenAlkamisvuosi;

    // program dimension — keep the most recent metadata seen, collect degree labels
    if (!programs.has(pid)) {
      programs.set(pid, {
        program_id: pid,
        korkeakoulu,
        sektori: r.sektori,
        program: major,
        field: major.toLowerCase(),
        degree_group: titleCase(fieldOf(label)),
        entry_cycle: cycleLabel(r.tutkinnonAloitussykli),
        cycle_code: cycleCode(r.tutkinnonAloitussykli),
        degrees: null,
        first_year: null,
        last_year: null,
        active: false,
        opintopolku_oid: null,
        opintopolku_koulutus_oid: null,
        koulutusala: r.koulutusalaTaso1,
        ohjauksen_ala: r.okmOhjauksenAla,
        maakunta: r.maakuntaHakukohde,
        kunta: r.kuntaHakukohde,
      });
      degreeSets.set(pid, new Set());
    }
    const deg = degreeOf(label);
    if (deg) degreeSets.get(pid)!.add(deg);

    // activity span + latest OID (prefer the most recent year, then the largest hakukohde)
    const hasActivity = n(r.kaikkiHakijatLkm) > 0 || n(r.aloituspaikatLkm) > 0;
    if (hasActivity) {
      const s = stats.get(pid) ?? { first: year, last: year, oid: null, oidYear: -1, oidApp: -1 };
      s.first = Math.min(s.first, year);
      s.last = Math.max(s.last, year);
      const app = n(r.kaikkiHakijatLkm);
      if (r.kooditHakukohde && (year > s.oidYear || (year === s.oidYear && app > s.oidApp))) {
        s.oid = r.kooditHakukohde;
        s.oidYear = year;
        s.oidApp = app;
      }
      stats.set(pid, s);
    }

    // program_year facts — SUM across all track rows
    const yk = `${pid}|${year}|${hakutapa}`;
    const py =
      years.get(yk) ??
      {
        program_id: pid,
        year,
        hakutapa,
        places: 0,
        applicants: 0,
        first_pref: 0,
        selected: 0,
        accepted: 0,
        started: 0,
      };
    py.places += n(r.aloituspaikatLkm);
    py.applicants += n(r.kaikkiHakijatLkm);
    py.first_pref += n(r.ensisijaisetHakijatLkm);
    py.selected += n(r.valitutLkm);
    py.accepted += n(r.paikanVastaanottaneetLkm);
    py.started += n(r.aloittaneetLkm);
    years.set(yk, py);

    // program_track detail — only rows that represent an actual selection track
    const track = r.valintatapajononTyyppi;
    if (track && track !== "Ei valittu") {
      const tk = `${pid}|${year}|${hakutapa}|${track}`;
      const pt =
        tracks.get(tk) ??
        {
          program_id: pid,
          year,
          hakutapa,
          track,
          selected: 0,
          accepted: 0,
          min_score: null as number | null,
          max_score: null as number | null,
        };
      pt.selected += n(r.valitutLkm);
      pt.accepted += n(r.paikanVastaanottaneetLkm);
      pt.min_score = minOf(pt.min_score, r.alinHyvaksyttyPistemaara);
      pt.max_score = maxOf(pt.max_score, r.ylinHyvaksyttyPistemaara);
      tracks.set(tk, pt);
    }
  }

  // fold collected degree labels + activity stats into each program
  for (const [pid, set] of degreeSets) {
    programs.get(pid)!.degrees = [...set].sort().join(", ") || null;
  }
  for (const [pid, s] of stats) {
    const p = programs.get(pid)!;
    p.first_year = s.first;
    p.last_year = s.last;
    p.active = s.last >= ACTIVE_FROM;
    p.opintopolku_oid = s.oid;
  }

  return {
    programs: [...programs.values()],
    programYears: [...years.values()],
    programTracks: [...tracks.values()],
  };
}
