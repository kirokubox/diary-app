import { useMemo, useState } from "react";
import { buildSleepChartPoints, formatChartTime, formatWakeTick, sleepDetailDateLabel, sleepHoursMeta } from "./diaryHelpers";
import type { SleepChartPoint } from "./diaryHelpers";
import { formatHoursCompact, recentSleepAverageMinutes } from "./lifeMetrics";
import type { DiaryEntry } from "./types";

export function RecentSleepCard({
  entries,
  dayBoundaryTime,
  onOpenDate,
}: {
  entries: DiaryEntry[];
  dayBoundaryTime: string;
  onOpenDate: (date: string) => void | Promise<void>;
}) {
  const chartPoints = useMemo(() => buildSleepChartPoints(entries, dayBoundaryTime), [entries, dayBoundaryTime]);
  const average = useMemo(
    () => formatHoursCompact(recentSleepAverageMinutes(entries, dayBoundaryTime)),
    [entries, dayBoundaryTime],
  );
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  // 14件の窓から外れた日付は find で見つからず、詳細も自然に閉じる
  const selectedPoint = chartPoints.find((point) => point.date === selectedDate) ?? null;
  const drawablePoints = chartPoints.filter((point) => point.totalHours !== null || point.wakeTime !== null);
  const hasSleep = chartPoints.some((point) => point.totalHours !== null);
  const hasWake = chartPoints.some((point) => point.wakeTime !== null);

  if (!hasSleep && !hasWake) {
    return (
      <section className="sleep-card">
        <div className="sleep-card-head">
          <div>
            <h2>最近の眠り</h2>
            <p>棒：睡眠　線：起床</p>
          </div>
          <span>直近7日平均：-</span>
        </div>
        <p className="empty">最近の眠りを表示するには、起床時間と睡眠時間を記録してください。</p>
      </section>
    );
  }

  const width = 640;
  const height = 220;
  const padding = { top: 18, right: 44, bottom: 36, left: 48 };
  const plotWidth = width - padding.left - padding.right;
  const plotHeight = height - padding.top - padding.bottom;
  const maxSleep = Math.max(4, Math.ceil(Math.max(...chartPoints.map((point) => point.totalHours ?? 0))));
  const wakeValues = chartPoints.map((point) => point.wakeTime).filter((value): value is number => value !== null);
  const rawWakeMin = wakeValues.length > 0 ? Math.min(...wakeValues) : 4;
  const rawWakeMax = wakeValues.length > 0 ? Math.max(...wakeValues) : 8;
  const wakeMin = Math.max(0, Math.floor(rawWakeMin - 0.5));
  const wakeMax = Math.min(24, Math.ceil(rawWakeMax + 0.5));
  const wakeRange = Math.max(1, wakeMax - wakeMin);
  const xStep = chartPoints.length > 1 ? plotWidth / (chartPoints.length - 1) : plotWidth;
  const barWidth = Math.min(24, Math.max(10, plotWidth / Math.max(chartPoints.length, 1) - 12));
  const sleepTicks = [0, Math.ceil(maxSleep / 2), maxSleep];
  const wakeTicks = [wakeMin, wakeMin + wakeRange / 2, wakeMax];
  const linePoints = chartPoints
    .map((point, index) => {
      if (point.wakeTime === null) return null;
      const x = padding.left + index * xStep;
      const y = padding.top + ((wakeMax - point.wakeTime) / wakeRange) * plotHeight;
      return `${x},${y}`;
    })
    .filter((value): value is string => value !== null)
    .join(" ");

  function xOf(index: number) {
    return padding.left + index * xStep;
  }

  function sleepY(hours: number) {
    return padding.top + plotHeight - (hours / maxSleep) * plotHeight;
  }

  return (
    <section className="sleep-card">
      <div className="sleep-card-head">
        <div>
          <h2>最近の眠り</h2>
          <p>棒：睡眠　線：起床</p>
        </div>
        <span>直近7日平均：{average}</span>
      </div>
      <div className="sleep-chart-wrap" aria-label="直近14日分の睡眠時間、仮眠時間、起床時間グラフ">
        <svg className="sleep-chart" viewBox={`0 0 ${width} ${height}`} role="img">
          <rect className="sleep-chart-bg" x="0" y="0" width={width} height={height} rx="8" />
          {sleepTicks.map((tick) => {
            const y = sleepY(tick);
            return (
              <g key={`sleep-${tick}`}>
                <line className="sleep-grid-line" x1={padding.left} x2={width - padding.right} y1={y} y2={y} />
                <text className="sleep-axis right" x={width - 8} y={y + 4}>
                  {tick}h
                </text>
              </g>
            );
          })}
          {wakeTicks.map((tick) => {
            const y = padding.top + ((wakeMax - tick) / wakeRange) * plotHeight;
            return (
              <text className="sleep-axis left" key={`wake-${tick}`} x={8} y={y + 4}>
                {formatWakeTick(tick)}
              </text>
            );
          })}
          {chartPoints.map((point, index) => {
            const x = xOf(index);
            const sleep = point.sleepHours ?? 0;
            const nap = point.totalHours === null ? 0 : point.napHours;
            const sleepHeight = plotHeight - (sleepY(sleep) - padding.top);
            const napHeight = (nap / maxSleep) * plotHeight;
            const baseY = padding.top + plotHeight;
            const showLabel = chartPoints.length <= 8 || index % 2 === 0 || index === chartPoints.length - 1;
            return (
              <g key={point.date}>
                {selectedDate === point.date && (
                  <rect
                    className="sleep-col-highlight"
                    x={x - xStep / 2}
                    y={padding.top}
                    width={xStep}
                    height={plotHeight}
                    rx="4"
                  />
                )}
                {point.totalHours !== null && (
                  <>
                    <rect
                      className="sleep-bar-main"
                      x={x - barWidth / 2}
                      y={baseY - sleepHeight}
                      width={barWidth}
                      height={sleepHeight}
                      rx="4"
                    />
                    {nap > 0 && (
                      <rect
                        className="sleep-bar-nap"
                        x={x - barWidth / 2}
                        y={baseY - sleepHeight - napHeight}
                        width={barWidth}
                        height={napHeight}
                        rx="4"
                      />
                    )}
                  </>
                )}
                {showLabel && (
                  <text className="sleep-axis date" x={x} y={height - 10}>
                    {point.label}
                  </text>
                )}
                <rect
                  className="sleep-hit"
                  x={x - xStep / 2}
                  y={padding.top}
                  width={xStep}
                  height={plotHeight + padding.bottom - 6}
                  onClick={() => setSelectedDate(selectedDate === point.date ? null : point.date)}
                />
              </g>
            );
          })}
          {linePoints && <polyline className="wake-line" points={linePoints} />}
          {chartPoints.map((point, index) => {
            if (point.wakeTime === null) return null;
            const x = xOf(index);
            const y = padding.top + ((wakeMax - point.wakeTime) / wakeRange) * plotHeight;
            return <circle className="wake-dot" cx={x} cy={y} key={`wake-dot-${point.date}`} r="4" />;
          })}
        </svg>
      </div>
      {selectedPoint && (
        <div className="sleep-detail">
          <p className="sleep-detail-date">{sleepDetailDateLabel(selectedPoint.date)}</p>
          <p className="sleep-detail-meta">
            就寝 {selectedPoint.bedTime ?? "-"}　起床{" "}
            {formatChartTime(selectedPoint.wakeTime)}　睡眠 {sleepHoursMeta(selectedPoint.sleepHours) || "-"}　仮眠{" "}
            {selectedPoint.napHours.toFixed(1)}h
          </p>
          <button className="sleep-detail-open" type="button" onClick={() => onOpenDate(selectedPoint.date)}>
            この日の日記を見る
          </button>
        </div>
      )}
      {drawablePoints.length < 2 && <p className="subtle">記録が増えると、最近の眠りの流れが見えやすくなります。</p>}
    </section>
  );
}
