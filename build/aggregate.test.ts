import { describe, it, expect } from "vitest";
import { aggregate, programId, type VipunenRow } from "./aggregate.ts";

// Minimal row factory — only the fields aggregate() reads.
function row(p: Partial<VipunenRow>): VipunenRow {
  return {
    koulutuksenAlkamisvuosi: 2026,
    koulutuksenAlkamiskausi: "Syksy",
    hakukohde: "x",
    hakutapa: "Yhteishaku",
    hakutyyppi: "Varsinainen haku",
    valintatapajononTyyppi: null,
    koulutusasteTaso2: "Alempi korkeakoulututkinto",
    koulutusalaTaso1: "ICT",
    okmOhjauksenAla: "Tietojenkäsittely ja tietoliikenne",
    paaasiallinenTutkintoHakukohde: "Dipl.ins., tietotekniikka",
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

describe("programId", () => {
  it("makes a stable ascii slug, stripping Finnish diacritics", () => {
    expect(programId("Aalto-yliopisto", "Dipl.ins., tietotekniikka")).toBe(
      "aalto-yliopisto-dipl-ins-tietotekniikka",
    );
    expect(programId("Åbo Akademi", "Ekonomie kandidat")).toBe(
      "abo-akademi-ekonomie-kandidat",
    );
  });
});

describe("aggregate", () => {
  // Mirrors the real Aalto DI tietotekniikka 2026 shape: metrics spread across
  // selection-track rows. Places come from the null-track rows, applicants from
  // "Ei valittu", selected/accepted from named tracks.
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
    expect(py.places).toBe(142); // 92 + 50
    expect(py.applicants).toBe(1310); // 707 + 603
    expect(py.first_pref).toBe(550);
    expect(py.selected).toBe(101); // 74 + 27
    expect(py.accepted).toBe(80); // 60 + 20
  });

  it("keeps scores per-track (min/max), never summed", () => {
    const { programTracks } = aggregate(rows);
    expect(programTracks).toHaveLength(1);
    const t = programTracks[0];
    expect(t.track).toBe("Todistusvalinta");
    expect(t.min_score).toBe(18);
    expect(t.max_score).toBe(30);
    expect(t.selected).toBe(101);
  });

  it("produces exactly one program dimension row", () => {
    const { programs } = aggregate(rows);
    expect(programs).toHaveLength(1);
    expect(programs[0].korkeakoulu).toBe("Aalto-yliopisto");
  });

  it("skips rows missing institution or main degree", () => {
    const { programs } = aggregate([
      row({ korkeakoulu: null }),
      row({ paaasiallinenTutkintoHakukohde: null }),
    ]);
    expect(programs).toHaveLength(0);
  });
});
