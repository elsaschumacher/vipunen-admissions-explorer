import { describe, it, expect } from "vitest";
import { aggregate, programId, fieldOf, majorName, cycleLabel, type VipunenRow } from "./aggregate.ts";

// Minimal row factory — only the fields aggregate() reads.
function row(p: Partial<VipunenRow>): VipunenRow {
  return {
    koulutuksenAlkamisvuosi: 2026,
    koulutuksenAlkamiskausi: "Syksy",
    hakukohde: "Tuotantotalous, tekniikan kandidaatti ja diplomi-insinööri (3 v + 2 v)",
    hakutapa: "Yhteishaku",
    hakutyyppi: "Varsinainen haku",
    valintatapajononTyyppi: null,
    tutkinnonAloitussykli: "I sykli",
    kooditHakukohde: "1.2.246.562.20.111",
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
  });

  it("majorName recovers the study option from the hakukohde", () => {
    expect(majorName("Tietotekniikka, tekniikan kandidaatti ja diplomi-insinööri (3 v + 2 v)", "x")).toBe("Tietotekniikka");
    expect(majorName("Informaatioverkostot, tekniikan kandidaatti ja diplomi-insinööri", "x")).toBe("Informaatioverkostot");
    // admission side-channel prefix is dropped
    expect(majorName("Haku avoimen yliopiston väylän kautta, Tietotekniikka, tekniikan kandidaatti", "x")).toBe("Tietotekniikka");
    // admission-round prefixes are dropped (would otherwise collapse to "Päähaku")
    expect(majorName("Päähaku, lääketieteen koulutusohjelma (opetus suomeksi), lääketieteen lisensiaatti", "x")).toBe("lääketieteen koulutusohjelma");
    expect(majorName("Huvudansökan, utbildningsprogrammet i medicin, medicine licentiat", "x")).toBe("utbildningsprogrammet i medicin");
    // semicolon umbrella → last part
    expect(majorName("Computer, Communication and Information Sciences; Computer Science, Master of Science (Technology)", "x")).toBe("Computer Science");
    // null falls back to the degree field
    expect(majorName(null, "Dipl.ins., tuotantotalous")).toBe("tuotantotalous");
  });

  it("programId differs by cycle, same for the same major", () => {
    const bach = programId("Aalto-yliopisto", "I sykli", "Tietotekniikka");
    const master = programId("Aalto-yliopisto", "II sykli", "Tietotekniikka");
    expect(bach).not.toBe(master);
  });

  it("cycleLabel describes who applies", () => {
    expect(cycleLabel("I sykli")).toMatch(/kandi|perustutkinto/i);
    expect(cycleLabel("II sykli")).toBe("Maisterihaku");
  });
});

describe("aggregate — metric summing", () => {
  // One major (Tuotantotalous), metrics spread across selection-track rows.
  const rows = [
    row({ valintatapajononTyyppi: null, aloituspaikatLkm: 92 }),
    row({ valintatapajononTyyppi: null, aloituspaikatLkm: 50 }),
    row({ valintatapajononTyyppi: "Ei valittu", kaikkiHakijatLkm: 707, ensisijaisetHakijatLkm: 300 }),
    row({ valintatapajononTyyppi: "Ei valittu", kaikkiHakijatLkm: 603, ensisijaisetHakijatLkm: 250 }),
    row({ valintatapajononTyyppi: "Todistusvalinta", valitutLkm: 74, paikanVastaanottaneetLkm: 60, alinHyvaksyttyPistemaara: 18, ylinHyvaksyttyPistemaara: 30 }),
    row({ valintatapajononTyyppi: "Todistusvalinta", valitutLkm: 27, paikanVastaanottaneetLkm: 20, alinHyvaksyttyPistemaara: 22, ylinHyvaksyttyPistemaara: 28 }),
  ];

  it("sums each metric across the rows where it is populated", () => {
    const { programs, programYears } = aggregate(rows);
    expect(programs).toHaveLength(1);
    expect(programs[0].program).toBe("Tuotantotalous");
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
    expect(t.min_score).toBe(18);
    expect(t.max_score).toBe(30);
  });

  it("skips rows missing institution or main degree", () => {
    const { programs } = aggregate([row({ korkeakoulu: null }), row({ paaasiallinenTutkintoHakukohde: null })]);
    expect(programs).toHaveLength(0);
  });
});

describe("aggregate — major-level grouping", () => {
  it("splits majors that share one degree label (e.g. Tietotekniikka vs Informaatioverkostot)", () => {
    const { programs } = aggregate([
      row({ hakukohde: "Tietotekniikka, tekniikan kandidaatti ja diplomi-insinööri" }),
      row({ hakukohde: "Informaatioverkostot, tekniikan kandidaatti ja diplomi-insinööri" }),
    ]);
    expect(programs.map((p) => p.program).sort()).toEqual(["Informaatioverkostot", "Tietotekniikka"]);
    // both still report their broader degree group
    expect(programs[0].degree_group).toBe("Tuotantotalous"); // from fallback label in factory
  });

  it("merges the same major across years despite kand/DI relabeling", () => {
    const { programs, programYears } = aggregate([
      row({ koulutuksenAlkamisvuosi: 2015, paaasiallinenTutkintoHakukohde: "Tekn. kand., tuotantotalous" }),
      row({ koulutuksenAlkamisvuosi: 2024, paaasiallinenTutkintoHakukohde: "Dipl.ins., tuotantotalous" }),
    ]);
    expect(programs).toHaveLength(1);
    expect(programs[0].degrees).toBe("Dipl.ins., Tekn. kand.");
    expect(programYears.map((y) => y.year).sort()).toEqual([2015, 2024]);
  });

  it("flags activity span, active=false for discontinued, and keeps latest OID", () => {
    const { programs } = aggregate([
      row({ koulutuksenAlkamisvuosi: 2016, kaikkiHakijatLkm: 100, kooditHakukohde: "oid-old" }),
      row({ koulutuksenAlkamisvuosi: 2020, kaikkiHakijatLkm: 120, kooditHakukohde: "oid-new" }),
    ]);
    expect(programs[0].first_year).toBe(2016);
    expect(programs[0].last_year).toBe(2020);
    expect(programs[0].active).toBe(false); // last activity 2020 < 2025
    expect(programs[0].opintopolku_oid).toBe("oid-new"); // latest year's OID
  });

  it("active=true when there is recent activity", () => {
    const { programs } = aggregate([row({ koulutuksenAlkamisvuosi: 2026, kaikkiHakijatLkm: 50 })]);
    expect(programs[0].active).toBe(true);
  });

  it("keeps master's entry (II sykli) separate from the bachelor major", () => {
    const { programs } = aggregate([
      row({ tutkinnonAloitussykli: "I sykli" }),
      row({ tutkinnonAloitussykli: "II sykli", hakutapa: "Erillishaku", hakukohde: "Industrial Engineering and Management, Master of Science (Technology)" }),
    ]);
    expect(programs).toHaveLength(2);
    expect(programs.map((p) => p.entry_cycle)).toContain("Maisterihaku");
  });
});
