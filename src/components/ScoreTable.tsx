import type { AdmissionScore } from "../types.ts";

const fmt = (v: number | null) =>
  v == null ? "–" : v.toLocaleString("fi-FI", { maximumFractionDigits: 2 });

export default function ScoreTable({ scores }: { scores: AdmissionScore[] }) {
  if (scores.length === 0) return null;
  const year = Math.max(...scores.map((s) => s.year));
  const rows = scores
    .filter((s) => s.year === year)
    .sort((a, b) => a.jono.localeCompare(b.jono, "fi"));
  if (rows.length === 0) return null;
  return (
    <>
      <h2>Pisterajat {year} (valintatavoittain)</h2>
      <table>
        <thead>
          <tr>
            <th>Valintatapa</th>
            <th className="num">Alin hyväksytty</th>
            <th className="num">Ylin hyväksytty</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((s) => (
            <tr key={s.jono}>
              <td>{s.jono}</td>
              <td className="num">{fmt(s.min_score)}</td>
              <td className="num">{fmt(s.max_score)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="muted small" style={{ marginTop: 8 }}>
        Lähde: Vipunen, korkeakoulujen yhteishaun pisterajat. Eri valintatapojen
        pisteet ovat omilla asteikoillaan.
      </p>
    </>
  );
}
