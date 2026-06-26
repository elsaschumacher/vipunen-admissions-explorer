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

const axis = { stroke: "#9aa7b5", fontSize: 12 };
const grid = "#2d3744";

export default function TrendCharts({ years }: { years: ProgramYear[] }) {
  const data = [...years]
    .sort((a, b) => a.year - b.year)
    .map((y) => ({
      year: y.year,
      Hakijat: y.applicants,
      Aloituspaikat: y.places,
      Valitut: y.selected,
      Aloittaneet: y.started,
      Hyväksymis_pct: y.applicants ? Math.round((y.selected / y.applicants) * 100) : null,
    }));

  return (
    <>
      <div className="chart-box">
        <div className="muted small">Hakijat vs. aloituspaikat</div>
        <ResponsiveContainer width="100%" height={260}>
          <BarChart data={data}>
            <CartesianGrid stroke={grid} strokeDasharray="3 3" />
            <XAxis dataKey="year" {...axis} />
            <YAxis {...axis} />
            <Tooltip contentStyle={{ background: "#1a212b", border: "1px solid #2d3744" }} />
            <Legend />
            <Bar dataKey="Hakijat" fill="#4f9cf9" />
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
            <Tooltip contentStyle={{ background: "#1a212b", border: "1px solid #2d3744" }} />
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
            <Tooltip contentStyle={{ background: "#1a212b", border: "1px solid #2d3744" }} />
            <Legend />
            <Line type="monotone" dataKey="Valitut" stroke="#4f9cf9" dot />
            <Line type="monotone" dataKey="Aloittaneet" stroke="#c98bff" dot />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </>
  );
}
