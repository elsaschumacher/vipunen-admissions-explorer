import type { ProgramTrack } from "../types.ts";

export default function TrackTable({ tracks }: { tracks: ProgramTrack[] }) {
  if (tracks.length === 0) return <p className="muted">Ei valintatapakohtaisia tietoja.</p>;
  return (
    <table>
      <thead>
        <tr>
          <th>Valintatapa</th>
          <th className="num">Valitut</th>
          <th className="num">Vastaanottaneet</th>
        </tr>
      </thead>
      <tbody>
        {tracks.map((t) => (
          <tr key={t.track}>
            <td>{t.track}</td>
            <td className="num">{t.selected.toLocaleString("fi-FI")}</td>
            <td className="num">{t.accepted.toLocaleString("fi-FI")}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
