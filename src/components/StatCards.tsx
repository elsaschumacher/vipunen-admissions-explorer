import type { ProgramYear } from "../types.ts";

function pct(num: number, den: number): string {
  if (!den) return "–";
  return `${Math.round((num / den) * 100)} %`;
}
function ratio(num: number, den: number): string {
  if (!den) return "–";
  return `${(num / den).toFixed(1)}×`;
}

export default function StatCards({ py }: { py: ProgramYear }) {
  return (
    <div className="cards">
      <Card label="Aloituspaikat" value={py.places} />
      <Card label="Hakijat" value={py.applicants} sub={`${py.first_pref} ensisijaista`} />
      <Card label="Valitut" value={py.selected} />
      <Card label="Paikan vastaanottaneet" value={py.accepted} />
      <Card label="Aloittaneet" value={py.started} />
      <Card
        label="Hyväksymisprosentti"
        rawValue={pct(py.selected, py.applicants)}
        sub="valitut / hakijat"
      />
      <Card
        label="Hakupaine"
        rawValue={ratio(py.applicants, py.places)}
        sub="hakijat / paikka"
      />
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
