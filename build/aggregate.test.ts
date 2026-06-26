import { describe, it, expect } from "vitest";
import { aggregate, programId, fieldOf, cycleLabel, type VipunenRow } from "./aggregate.ts";

// Minimal row factory — only the fields aggregate() reads.
function row(p: Partial<VipunenRow>): VipunenRow {
  return {
    koulutuksenAlkamisvuosi: 2026,
    koulutuksenAlkamiskausi: "Syksy",
    hakukohde: "x",
    hakutapa: "Yhteishaku",
    hakutyyppi: "Varsinainen haku",
    valintatapajononTyyppi: null,
    tutkinnonAloitussykli: "I sykli",
    koulutusasteTaso2: "Ylempi korkeakoulututkinto",
    koulutusalaTaso1: "ICT",
    okmOhjauksenAla: "Tietojenkäsittely ja tietoliikenne",
    paaasiallinenTutkintoHakukohde: "Dipl.ins., tuotantotalous",
    koulutuksenKieli: "suomi",
    maakuntaHakukohde: "Uusimaa",
    kuntaHakukohde: "Espoo",
    sektori: "Yliopistokoulutus",
    korkeakoulu: "Aalto-yliopisto",
    toimipiste: "Aalto",
    aloituspaikatLkm: null,
    kaikkiHakijatLkm: null,
    ensisijaisetHakijatLkm: null,
    valitutLkm: null,
    paikanVastaanottaneetLkm: null,
    aloittaneetLkm: null,
    alinHyvaksyttyPistemaara: null,
    ylinHyvaksyttyPistemaara: null,
    ...p,
  };
}

describe("helpers", () => {
  it("fieldOf strips the degree-type prefix", () => {
    expect(fieldOf("Tekn. kand., tuotantotalous")).toBe("tuotantotalous");
    expect(fieldOf("Dipl.ins., tuotantotalous")).toBe("tuotantotalous");
    expect(fieldOf("Insinööri (AMK), tuotantotalous")).toBe("tuotantotalous");
  });

  it("programId is stable across kand/DI relabeling but differs by cycle", () => {
    const a = programId("Aalto-yliopisto", "I sykli", fieldOf("Tekn. kand., tuotantotalous"));
    const b = programId("Aalto-yliopisto", "I sykli", fieldOf("Dipl.ins., tuotantotalous"));
    const master = programId("Aalto-yliopisto", "II sykli", fieldOf("Dipl.ins., tuotantotalous"));
    expect(a).toBe(b); // same program despite different label
    expect(a).not.toBe(master); // master's entry is a separate program
  });

  it("cycleLabel describes who applies", () => {
    expect(cycleLabel("I sykli")).toMatch(/kandi|perustutkinto/i);
    expect(cycleLabel("II sykli")).toBe("Maisterihaku");
  });
});

describe("aggregate — metric summing", () => {
  // Mirrors the real Aalto tuotantotalous 2026 shape (all I sykli).
  const rows = [
    row({ valintatapajononTyyppi: null, aloituspaikatLkm: 92 }),
    row({ valintatapajononTyyppi: null, aloituspaikatLkm: 50 }),
    row({ valintatapajononTyyppi: "Ei valittu", kaikkiHakijatLkm: 707, ensisijaisetHakijatLkm: 300 }),
    row({ valintatapajononTyyppi: "Ei valittu", kaikkiHakijatLkm: 603, ensisijaisetHakijatLkm: 250 }),
    row({ valintatapajononTyyppi: "Todistusvalinta", valitutLkm: 74, paikanVastaanottaneetLkm: 60, alinHyvaksyttyPistemaara: 18, ylinHyvaksyttyPistemaara: 30 }),
    row({ valintatapajononTyyppi: "Todistusvalinta", valitutLkm: 27, paikanVastaanottaneetLkm: 20, alinHyvaksyttyPistemaara: 22, ylinHyvaksyttyPistemaara: 28 }),
  ];

  it("sums each metric across the rows where it is populated", () => {
    const { programYears } = aggregate(rows);
    expect(programYears).toHaveLength(1);
    const py = programYears[0];
    expect(py.places).toBe(142);
    expect(py.applicants).toBe(1310);
    expect(py.first_pref).toBe(550);
    expect(py.selected).toBe(101);
    expect(py.accepted).toBe(80);
  });

  it("keeps scores per-track (min/max), never summed", () => {
    const { programTracks } = aggregate(rows);
    expect(programTracks).toHaveLength(1);
    const t = programTracks[0];
    expect(t.track).toBe("Todistusvalinta");
    expect(t.min_score).toBe(18);
    expect(t.max_score).toBe(30);
  });

  it("skips rows missing institution or main degree", () => {
    const { programs } = aggregate([
      row({ korkeakoulu: null }),
      row({ paaasiallinenTutkintoHakukohde: null }),
    ]);
    expect(programs).toHaveLength(0);
  });
});

describe("aggregate — cycle/field grouping", () => {
  it("merges kand- and DI-labeled rows of the same field+cycle into one program", () => {
    const { programs, programYears } = aggregate([
      row({ koulutuksenAlkamisvuosi: 2015, paaasiallinenTutkintoHakukohde: "Tekn. kand., tuotantotalous", valintatapajononTyyppi: "Ei valittu", kaikkiHakijatLkm: 400 }),
      row({ koulutuksenAlkamisvuosi: 2024, paaasiallinenTutkintoHakukohde: "Dipl.ins., tuotantotalous", valintatapajononTyyppi: "Ei valittu", kaikkiHakijatLkm: 1200 }),
    ]);
    expect(programs).toHaveLength(1);
    expect(programs[0].program).toBe("Tuotantotalous");
    expect(programs[0].degrees).toBe("Dipl.ins., Tekn. kand."); // both labels recorded
    expect(programYears.map((y) => y.year).sort()).toEqual([2015, 2024]); // continuous
  });

  it("keeps master's-only (II sykli) as a separate program", () => {
    const { programs } = aggregate([
      row({ paaasiallinenTutkintoHakukohde: "Dipl.ins., tuotantotalous", tutkinnonAloitussykli: "I sykli" }),
      row({ paaasiallinenTutkintoHakukohde: "Dipl.ins., tuotantotalous", tutkinnonAloitussykli: "II sykli", hakutapa: "Erillishaku" }),
    ]);
    expect(programs).toHaveLength(2);
    const cycles = programs.map((p) => p.entry_cycle).sort();
    expect(cycles).toContain("Maisterihaku");
  });
});
