import { useMemo, useState } from "react";
import { addDays } from "./dateUtils";
import { formatShortDate, sleepDetailDateLabel } from "./diaryHelpers";
import { expenseBreakdown, formatMoneyCompact, getExpensePeriod, periodExpenseTotal } from "./lifeMetrics";
import type { AppSettings, DiaryEntry } from "./types";

export function VariableExpenseCard({
  entries,
  settings,
  today,
}: {
  entries: DiaryEntry[];
  settings: AppSettings;
  today: string;
}) {
  const period = useMemo(
    () => getExpensePeriod(today, settings.variableExpenseStartDay),
    [today, settings.variableExpenseStartDay],
  );
  const points = useMemo(() => {
    const byDate = new Map(entries.map((entry) => [entry.date, entry]));
    const result: Array<{ date: string; everyday: number; satisfaction: number; regret: number; total: number | null }> = [];
    const lastDate = today < period.end ? today : period.end;
    for (let date = period.start; date <= lastDate; date = addDays(date, 1)) {
      const entry = byDate.get(date);
      const expense = entry ? expenseBreakdown(entry) : null;
      result.push({
        date,
        everyday: expense?.everyday ?? 0,
        satisfaction: expense?.satisfaction ?? 0,
        regret: expense?.regret ?? 0,
        total: expense?.total ?? null,
      });
    }
    return result;
  }, [entries, period, today]);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const selected = points.find((point) => point.date === selectedDate) ?? null;
  const spent = useMemo(() => periodExpenseTotal(entries, period, today), [entries, period, today]);
  const remaining = settings.variableExpenseBudget - spent;
  const max = Math.max(1, ...points.map((point) => point.total ?? 0));
  const width = 640;
  const height = 190;
  const padding = { top: 12, right: 12, bottom: 32, left: 12 };
  const plotWidth = width - padding.left - padding.right;
  const plotHeight = height - padding.top - padding.bottom;
  const step = plotWidth / Math.max(points.length, 1);
  const barWidth = Math.max(5, Math.min(18, step - 3));

  return (
    <section className="sleep-card expense-card">
      <div className="expense-card-head">
        <div>
          <h2>今期の変動費</h2>
          <p>{formatShortDate(period.start)}〜{formatShortDate(period.end)}</p>
        </div>
        <strong className={remaining < 0 ? "expense-over" : ""}>
          {remaining >= 0 ? `残り ${remaining.toLocaleString("ja-JP")}円` : `超過 ${Math.abs(remaining).toLocaleString("ja-JP")}円`}
        </strong>
      </div>
      <div className="expense-legend" aria-label="変動費グラフの色分け">
        <span className="everyday">日常</span><span className="satisfaction">満足</span><span className="regret">反省</span>
      </div>
      <div className="sleep-chart-wrap">
        <svg className="expense-chart" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="今期の日別変動費グラフ">
          <rect className="sleep-chart-bg" width={width} height={height} rx="8" />
          {points.map((point, index) => {
            const x = padding.left + index * step + step / 2;
            const base = padding.top + plotHeight;
            const everydayHeight = (point.everyday / max) * plotHeight;
            const satisfactionHeight = (point.satisfaction / max) * plotHeight;
            const regretHeight = (point.regret / max) * plotHeight;
            const showLabel = index === 0 || index === points.length - 1 || index % 5 === 0;
            return (
              <g key={point.date}>
                {selectedDate === point.date && <rect className="expense-col-highlight" x={x - step / 2} y={padding.top} width={step} height={plotHeight} />}
                <rect className="expense-bar-everyday" x={x - barWidth / 2} y={base - everydayHeight} width={barWidth} height={everydayHeight} rx="2" />
                <rect className="expense-bar-satisfaction" x={x - barWidth / 2} y={base - everydayHeight - satisfactionHeight} width={barWidth} height={satisfactionHeight} rx="2" />
                <rect className="expense-bar-regret" x={x - barWidth / 2} y={base - everydayHeight - satisfactionHeight - regretHeight} width={barWidth} height={regretHeight} rx="2" />
                {showLabel && <text className="sleep-axis date" x={x} y={height - 10}>{formatShortDate(point.date)}</text>}
                <rect className="sleep-hit" x={x - step / 2} y={padding.top} width={step} height={plotHeight + padding.bottom - 4} onClick={() => setSelectedDate(selectedDate === point.date ? null : point.date)} />
              </g>
            );
          })}
        </svg>
      </div>
      {selected && (
        <div className="sleep-detail">
          <p className="sleep-detail-date">{sleepDetailDateLabel(selected.date)}</p>
          <p className="sleep-detail-meta">
            日常 {formatMoneyCompact(selected.total === null ? null : selected.everyday)}　満足 {formatMoneyCompact(selected.total === null ? null : selected.satisfaction)}　反省 {formatMoneyCompact(selected.total === null ? null : selected.regret)}　合計 {formatMoneyCompact(selected.total)}
          </p>
        </div>
      )}
      {points.every((point) => point.total === null) && <p className="empty">今期の変動費はまだ入力されていません。</p>}
    </section>
  );
}
