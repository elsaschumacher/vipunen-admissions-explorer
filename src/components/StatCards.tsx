import type { ProgramYear } from "../types.ts";

function pct(num: number, den: number): string {
  if (!den) return "–";
  return `${Math.round((num / den) * 100)} %`;
}
function ratio(num: number, den: number): string {
  if (!den) return "–";
  return `${(num / den).toFixed(1)}×`;
}

export default function StatCards({
  py,
  basis,
}: {
  py: ProgramYear;
  basis: "all" | "first";
}) {
  // Which applicant figure drives the derived ratios.
  const applicants = basis === "first" ? py.first_pref : py.applicants;
  const applicantsLabel = basis === "first" ? "Ensisijaiset hakijat" : "Hakijat";
  const applicantsSub =
    basis === "first"
      ? `${py.applicants.toLocaleString("fi-FI")} kaikkiaan`
      : `${py.first_pref.toLocaleString("fi-FI")} ensisijaista`;

  return (
    <div className="cards">
      <Card label="Aloituspaikat" value={py.places} />
      <Card label={applicantsLabel} value={applicants} sub={applicantsSub} />
      <Card label="Valitut" value={py.selected} />
      <Card label="Paikan vastaanottaneet" value={py.accepted} />
      <Card label="Aloittaneet" value={py.started} />
      <Card
        label="Hyväksymisprosentti"
        rawValue={pct(py.selected, applicants)}
        sub={basis === "first" ? "valitut / ensisijaiset" : "valitut / hakijat"}
      />
      <Card
        label="Hakupaine"
        rawValue={ratio(applicants, py.places)}
        sub={basis === "first" ? "ensisijaiset / paikka" : "hakijat / paikka"}
      />
      {py.min_score != null && (
        <Card
          label="Hyväksytyt pisteet"
          rawValue={
            py.max_score != null && py.max_score !== py.min_score
              ? `${py.min_score}–${py.max_score}`
              : `${py.min_score}`
          }
          sub="alin–ylin hyväksytty"
        />
      )}
    </div>
  );
}

function Card({
  label,
  value,
  rawValue,
  sub,
}: {
  label: string;
  value?: number;
  rawValue?: string;
  sub?: string;
}) {
  const display = rawValue ?? (value != null ? value.toLocaleString("fi-FI") : "–");
  return (
    <div className="card">
      <div className="label">{label}</div>
      <div className="value">{display}</div>
      {sub && <div className="sub">{sub}</div>}
    </div>
  );
}
