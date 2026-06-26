// Aggregation rules for the Vipunen admissions dataset.
//
// Each application target (hakukohde) in a year is split into several source rows
// by valintatapajononTyyppi (selection track), and metrics live on DIFFERENT rows:
//   - track = null            → carries aloituspaikatLkm (places)
//   - track = "Ei valittu"    → carries kaikkiHakijatLkm / ensisijaisetHakijatLkm
//   - named tracks (Todistusvalinta, Koepisteet, …) → valitut / vastaanottaneet / scores
// So per (program, year, hakutapa) we SUM each metric across all rows (null → 0).
// Scores are per-track and on different point scales, so they are kept per-track,
// never summed.

/** A raw row as returned by the Vipunen API (only the fields we use). */
export interface VipunenRow {
  koulutuksenAlkamisvuosi: number;
  koulutuksenAlkamiskausi: string | null;
  hakukohde: string | null;
  hakutapa: string | null;
  hakutyyppi: string | null;
  valintatapajononTyyppi: string | null;
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
  program: string;
  koulutusala: string | null;
  ohjauksen_ala: string | null;
  degree_level: string | null;
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

/** Stable slug for a degree program = institution + main degree. */
export function programId(korkeakoulu: string, program: string): string {
  return (korkeakoulu + "__" + program)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** A program row must identify both an institution and a main degree. */
export function isUsableProgram(r: VipunenRow): boolean {
  return Boolean(r.korkeakoulu) && Boolean(r.paaasiallinenTutkintoHakukohde);
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
  const years = new Map<string, ProgramYearRow>();
  const tracks = new Map<string, ProgramTrackRow>();

  for (const r of rows) {
    if (!isUsableProgram(r)) continue;
    const korkeakoulu = r.korkeakoulu as string;
    const program = r.paaasiallinenTutkintoHakukohde as string;
    const pid = programId(korkeakoulu, program);
    const hakutapa = r.hakutapa || "Tuntematon";
    const year = r.koulutuksenAlkamisvuosi;

    // program dimension — keep the most recent metadata seen
    const existing = programs.get(pid);
    if (!existing) {
      programs.set(pid, {
        program_id: pid,
        korkeakoulu,
        sektori: r.sektori,
        program,
        koulutusala: r.koulutusalaTaso1,
        ohjauksen_ala: r.okmOhjauksenAla,
        degree_level: r.koulutusasteTaso2,
        maakunta: r.maakuntaHakukohde,
        kunta: r.kuntaHakukohde,
      });
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

  return {
    programs: [...programs.values()],
    programYears: [...years.values()],
    programTracks: [...tracks.values()],
  };
}
