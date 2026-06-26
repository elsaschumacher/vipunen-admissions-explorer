import {
  Line,
  LineChart,
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { ProgramYear } from "../types.ts";

const axis = { stroke: "#5c6b7a", fontSize: 12 };
const grid = "#e2e8f0";

export default function TrendCharts({
  years,
  basis,
}: {
  years: ProgramYear[];
  basis: "all" | "first";
}) {
  const applicantsLabel = basis === "first" ? "Ensisijaiset" : "Hakijat";
  const data = [...years]
    .sort((a, b) => a.year - b.year)
    .map((y) => {
      const applicants = basis === "first" ? y.first_pref : y.applicants;
      return {
        year: y.year,
        [applicantsLabel]: applicants,
        Aloituspaikat: y.places,
        Valitut: y.selected,
        Aloittaneet: y.started,
        Hyväksymis_pct: applicants ? Math.round((y.selected / applicants) * 100) : null,
      };
    });

  return (
    <>
      <div className="chart-box">
        <div className="muted small">{applicantsLabel} vs. aloituspaikat</div>
        <ResponsiveContainer width="100%" height={260}>
          <BarChart data={data}>
            <CartesianGrid stroke={grid} strokeDasharray="3 3" />
            <XAxis dataKey="year" {...axis} />
            <YAxis {...axis} />
            <Tooltip contentStyle={{ background: "#ffffff", border: "1px solid #dde3ec", borderRadius: 8 }} />
            <Legend />
            <Bar dataKey={applicantsLabel} fill="#2563eb" />
            <Bar dataKey="Aloituspaikat" fill="#f9a84f" />
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="chart-box">
        <div className="muted small">Hyväksymisprosentti (%) ajan myötä</div>
        <ResponsiveContainer width="100%" height={220}>
          <LineChart data={data}>
            <CartesianGrid stroke={grid} strokeDasharray="3 3" />
            <XAxis dataKey="year" {...axis} />
            <YAxis {...axis} />
            <Tooltip contentStyle={{ background: "#ffffff", border: "1px solid #dde3ec", borderRadius: 8 }} />
            <Line type="monotone" dataKey="Hyväksymis_pct" name="Hyväksymis-%" stroke="#5ad19a" dot />
          </LineChart>
        </ResponsiveContainer>
      </div>

      <div className="chart-box">
        <div className="muted small">Valitut ja aloittaneet</div>
        <ResponsiveContainer width="100%" height={220}>
          <LineChart data={data}>
            <CartesianGrid stroke={grid} strokeDasharray="3 3" />
            <XAxis dataKey="year" {...axis} />
            <YAxis {...axis} />
            <Tooltip contentStyle={{ background: "#ffffff", border: "1px solid #dde3ec", borderRadius: 8 }} />
            <Legend />
            <Line type="monotone" dataKey="Valitut" stroke="#2563eb" dot />
            <Line type="monotone" dataKey="Aloittaneet" stroke="#c98bff" dot />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </>
  );
}
