'use client';

import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  Legend
} from 'recharts';

type AllTimePoint = { date: string; cw: number; cl: number };
type Last14Point = { date: string; wins: number; losses: number };
type Match = { timestamp: string | number | Date; result: 'win' | 'loss' };

interface DashboardChartsProps {
  chartAll: AllTimePoint[];
  chart14: Last14Point[];
  recentMatches?: Match[];
}

function buildAllTimeFromMatches(matches: Match[] = []): AllTimePoint[] {
  if (!matches || matches.length === 0) return [];
  const sorted = [...matches].sort(
    (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
  );
  const first = new Date(sorted[0].timestamp);
  const start = new Date(first.getFullYear(), first.getMonth(), first.getDate());
  const end = new Date();
  const byDay: Record<string, { wins: number; losses: number }> = {};
  for (const m of sorted) {
    const key = new Date(m.timestamp).toISOString().slice(0, 10);
    if (!byDay[key]) byDay[key] = { wins: 0, losses: 0 };
    if (m.result === 'win') byDay[key].wins += 1; else byDay[key].losses += 1;
  }
  const rows: AllTimePoint[] = [];
  const d = new Date(start);
  let cw = 0, cl = 0;
  while (d <= end) {
    const key = d.toISOString().slice(0, 10);
    const day = byDay[key] || { wins: 0, losses: 0 };
    cw += day.wins; cl += day.losses;
    rows.push({ date: key, cw, cl });
    d.setDate(d.getDate() + 1);
  }
  return rows;
}

export default function DashboardCharts({ chartAll, chart14, recentMatches }: DashboardChartsProps) {
  const derivedAll = (!chartAll || chartAll.length === 0)
    ? buildAllTimeFromMatches(recentMatches)
    : chartAll;

  const allTimeData = (derivedAll || []).map(d => ({ ...d, date: (d.date || '').slice(5) }));
  const last14Data = (chart14 || []).map(d => ({ ...d, date: (d.date || '').slice(5) }));

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
      <div className="bg-gray-800 p-4 rounded-lg h-[22rem]">
        <div className="text-sm text-gray-300 mb-2">All-time (from first battle)</div>
        <div className="w-full h-full">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={allTimeData} margin={{ left: 15, right: 10, top: 10, bottom: 10 }}>
              <XAxis dataKey="date" tick={{ fill: '#9CA3AF', fontSize: 11 }} tickLine={false} axisLine={{ stroke: '#374151' }} minTickGap={20} />
              <YAxis tick={{ fill: '#9CA3AF', fontSize: 11 }} tickLine={false} axisLine={{ stroke: '#374151' }} allowDecimals={false} />
              <Tooltip contentStyle={{ background: '#111827', border: '1px solid #374151', color: '#E5E7EB' }} />
              <Legend wrapperStyle={{ color: '#9CA3AF' }} />
              <Line type="monotone" dataKey="cw" stroke="#10B981" strokeWidth={2} dot={false} name="Cumulative Wins" />
              <Line type="monotone" dataKey="cl" stroke="#EF4444" strokeWidth={2} dot={false} name="Cumulative Losses" />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="bg-gray-800 p-4 rounded-lg h-[22rem]">
        <div className="text-sm text-gray-300 mb-2">Last 14 days</div>
        <div className="w-full h-full">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={last14Data} margin={{ left: 15, right: 10, top: 10, bottom: 10 }}>
              <XAxis dataKey="date" tick={{ fill: '#9CA3AF', fontSize: 11 }} tickLine={false} axisLine={{ stroke: '#374151' }} minTickGap={20} />
              <YAxis tick={{ fill: '#9CA3AF', fontSize: 11 }} tickLine={false} axisLine={{ stroke: '#374151' }} allowDecimals={false} />
              <Tooltip contentStyle={{ background: '#111827', border: '1px solid #374151', color: '#E5E7EB' }} />
              <Legend wrapperStyle={{ color: '#9CA3AF' }} />
              <Line type="monotone" dataKey="wins" stroke="#10B981" strokeWidth={2} dot={false} name="Wins" />
              <Line type="monotone" dataKey="losses" stroke="#EF4444" strokeWidth={2} dot={false} name="Losses" />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}


