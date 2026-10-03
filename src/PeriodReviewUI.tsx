import { useEffect, useMemo, useState } from "react";
import {
  addDays,
  addMonths,
  isFirstDayOfMonth,
  isLastDayOfMonth,
  isSunday,
  monthOf,
  weekStartOf,
  weekStartsEndingInMonth,
} from "./dateUtils";
import { formatWeekRange } from "./periodReviews";
import type { MonthlyReview, WeeklyReview } from "./types";

type SaveWeekly = (weekStart: string, goalTheme: string, reflection: string) => void | Promise<void>;
type SaveMonthly = (month: string, goalTheme: string, reflection: string) => void | Promise<void>;

export function PeriodGoalSummary({ weekly, monthly }: { weekly?: WeeklyReview; monthly?: MonthlyReview }) {
  const [expanded, setExpanded] = useState<"week" | "month" | null>(null);
  const weekText = weekly?.goalTheme.trim() ?? "";
  const monthText = monthly?.goalTheme.trim() ?? "";

  useEffect(() => setExpanded(null), [weekly?.weekStart, monthly?.month]);
  if (!weekText && !monthText) return null;

  return (
    <section className="period-goals" aria-label="今週と今月の目標・テーマ">
      {weekText && (
        <div className="period-goal-item primary-goal">
          <p className="period-goal-label">今週</p>
          <p className={expanded === "week" ? "period-goal-text expanded" : "period-goal-text week-preview"}>{weekText}</p>
          <button className="text-toggle" type="button" onClick={() => setExpanded(expanded === "week" ? null : "week")}>
            {expanded === "week" ? "閉じる" : "続きを読む"}
          </button>
        </div>
      )}
      {monthText && (
        <div className="period-goal-item">
          <p className="period-goal-label">今月</p>
          <p className={expanded === "month" ? "period-goal-text expanded" : "period-goal-text month-preview"}>{monthText}</p>
          <button className="text-toggle" type="button" onClick={() => setExpanded(expanded === "month" ? null : "month")}>
            {expanded === "month" ? "閉じる" : "続きを読む"}
          </button>
        </div>
      )}
    </section>
  );
}

function BoundaryPanel({
  title,
  reflectionLabel,
  goalLabel,
  reflection,
  goalTheme,
  onSave,
}: {
  title: string;
  reflectionLabel: string;
  goalLabel: string;
  reflection: string;
  goalTheme: string;
  onSave: (reflection: string, goalTheme: string) => void | Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [reflectionDraft, setReflectionDraft] = useState(reflection);
  const [goalDraft, setGoalDraft] = useState(goalTheme);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setOpen(false);
    setReflectionDraft(reflection);
    setGoalDraft(goalTheme);
  }, [title, reflection, goalTheme]);

  async function save() {
    setSaving(true);
    try {
      await onSave(reflectionDraft, goalDraft);
      setOpen(false);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="boundary-review">
      <button className="details-toggle period-entry-toggle" type="button" onClick={() => setOpen((value) => !value)}>
        {open ? `${title}を閉じる` : title}
      </button>
      {open && (
        <div className="period-editor-panel">
          <label>
            {reflectionLabel}
            <textarea
              className="period-reflection-input"
              value={reflectionDraft}
              onChange={(event) => setReflectionDraft(event.target.value)}
              placeholder="その期間をどう捉えたか、自分の言葉で書く"
            />
          </label>
          <label>
            {goalLabel}
            <textarea
              className="period-goal-input"
              value={goalDraft}
              onChange={(event) => setGoalDraft(event.target.value)}
              placeholder="理由、迷い、優先順位も含めて書く"
            />
          </label>
          <button className="primary" type="button" disabled={saving} onClick={() => void save()}>
            {saving ? "保存中..." : "原文のまま保存"}
          </button>
        </div>
      )}
    </div>
  );
}

export function BoundaryReviewEntries({
  date,
  weeklyReviews,
  monthlyReviews,
  onSaveWeekly,
  onSaveMonthly,
}: {
  date: string;
  weeklyReviews: WeeklyReview[];
  monthlyReviews: MonthlyReview[];
  onSaveWeekly: SaveWeekly;
  onSaveMonthly: SaveMonthly;
}) {
  const currentWeekStart = weekStartOf(date);
  const nextWeekStart = addDays(currentWeekStart, 7);
  const currentMonth = monthOf(date);
  const previousMonth = addMonths(currentMonth, -1);
  const nextMonth = addMonths(currentMonth, 1);
  const currentWeek = weeklyReviews.find((item) => item.weekStart === currentWeekStart);
  const nextWeek = weeklyReviews.find((item) => item.weekStart === nextWeekStart);
  const currentMonthReview = monthlyReviews.find((item) => item.month === currentMonth);
  const previousMonthReview = monthlyReviews.find((item) => item.month === previousMonth);
  const nextMonthReview = monthlyReviews.find((item) => item.month === nextMonth);

  return (
    <section className="period-entry-area">
      {isSunday(date) && (
        <BoundaryPanel
          title="今週の振り返りと来週の目標を書く"
          reflectionLabel="今週の振り返り"
          goalLabel="来週の目標・テーマ"
          reflection={currentWeek?.reflection ?? ""}
          goalTheme={nextWeek?.goalTheme ?? ""}
          onSave={async (reflection, goalTheme) => {
            await onSaveWeekly(currentWeekStart, currentWeek?.goalTheme ?? "", reflection);
            await onSaveWeekly(nextWeekStart, goalTheme, nextWeek?.reflection ?? "");
          }}
        />
      )}
      {isLastDayOfMonth(date) && (
        <BoundaryPanel
          title="今月の振り返りと来月の目標を書く"
          reflectionLabel="今月の振り返り"
          goalLabel="来月の目標・テーマ"
          reflection={currentMonthReview?.reflection ?? ""}
          goalTheme={nextMonthReview?.goalTheme ?? ""}
          onSave={async (reflection, goalTheme) => {
            await onSaveMonthly(currentMonth, currentMonthReview?.goalTheme ?? "", reflection);
            await onSaveMonthly(nextMonth, goalTheme, nextMonthReview?.reflection ?? "");
          }}
        />
      )}
      {isFirstDayOfMonth(date) && (
        <BoundaryPanel
          title="先月の振り返りと今月の目標を書く"
          reflectionLabel="先月の振り返り"
          goalLabel="今月の目標・テーマ"
          reflection={previousMonthReview?.reflection ?? ""}
          goalTheme={currentMonthReview?.goalTheme ?? ""}
          onSave={async (reflection, goalTheme) => {
            await onSaveMonthly(previousMonth, previousMonthReview?.goalTheme ?? "", reflection);
            await onSaveMonthly(currentMonth, goalTheme, currentMonthReview?.reflection ?? "");
          }}
        />
      )}
    </section>
  );
}

function ReviewAccordion({
  label,
  goalTheme,
  reflection,
  onSave,
}: {
  label: string;
  goalTheme: string;
  reflection: string;
  onSave: (goalTheme: string, reflection: string) => void | Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [goalDraft, setGoalDraft] = useState(goalTheme);
  const [reflectionDraft, setReflectionDraft] = useState(reflection);

  useEffect(() => {
    setOpen(false);
    setEditing(false);
    setGoalDraft(goalTheme);
    setReflectionDraft(reflection);
  }, [label, goalTheme, reflection]);

  async function save() {
    await onSave(goalDraft, reflectionDraft);
    setEditing(false);
    setOpen(true);
  }

  return (
    <article className="period-record">
      <button className="period-record-heading" type="button" onClick={() => setOpen((value) => !value)}>
        <span>{open ? "▼" : "▶"}</span>
        <strong>{label}</strong>
      </button>
      {!open && goalTheme.trim() && <p className="period-record-preview">{goalTheme}</p>}
      {open && !editing && (
        <div className="period-record-body">
          <h3>目標・テーマ</h3>
          <p>{goalTheme.trim() || "未入力"}</p>
          <h3>振り返り</h3>
          <p>{reflection.trim() || "未入力"}</p>
          <button type="button" onClick={() => setEditing(true)}>編集する</button>
        </div>
      )}
      {open && editing && (
        <div className="period-editor-panel">
          <label>
            目標・テーマ
            <textarea className="period-goal-input" value={goalDraft} onChange={(event) => setGoalDraft(event.target.value)} />
          </label>
          <label>
            振り返り
            <textarea className="period-reflection-input" value={reflectionDraft} onChange={(event) => setReflectionDraft(event.target.value)} />
          </label>
          <div className="action-row">
            <button className="primary" type="button" onClick={() => void save()}>原文のまま保存</button>
            <button type="button" onClick={() => setEditing(false)}>キャンセル</button>
          </div>
        </div>
      )}
    </article>
  );
}

export function MonthlyReviewHub({
  selectedMonth,
  onMonthChange,
  weeklyReviews,
  monthlyReviews,
  onSaveWeekly,
  onSaveMonthly,
}: {
  selectedMonth: string;
  onMonthChange: (month: string) => void;
  weeklyReviews: WeeklyReview[];
  monthlyReviews: MonthlyReview[];
  onSaveWeekly: SaveWeekly;
  onSaveMonthly: SaveMonthly;
}) {
  const monthReview = monthlyReviews.find((item) => item.month === selectedMonth);
  const weeks = useMemo(() => weekStartsEndingInMonth(selectedMonth), [selectedMonth]);
  const monthLabel = `${Number(selectedMonth.slice(0, 4))}年${Number(selectedMonth.slice(5, 7))}月`;

  return (
    <section className="monthly-review-hub">
      <div className="month-switcher">
        <button type="button" onClick={() => onMonthChange(addMonths(selectedMonth, -1))}>前月</button>
        <input aria-label="表示する月" type="month" value={selectedMonth} onChange={(event) => onMonthChange(event.target.value)} />
        <button type="button" onClick={() => onMonthChange(addMonths(selectedMonth, 1))}>翌月</button>
      </div>
      <h2>{monthLabel}の目標と振り返り</h2>
      <ReviewAccordion
        label="月の目標・テーマと振り返り"
        goalTheme={monthReview?.goalTheme ?? ""}
        reflection={monthReview?.reflection ?? ""}
        onSave={(goalTheme, reflection) => onSaveMonthly(selectedMonth, goalTheme, reflection)}
      />
      <h3 className="week-records-title">週ごとの記録</h3>
      <div className="period-record-list">
        {weeks.map((weekStart) => {
          const review = weeklyReviews.find((item) => item.weekStart === weekStart);
          return (
            <ReviewAccordion
              key={weekStart}
              label={formatWeekRange(weekStart)}
              goalTheme={review?.goalTheme ?? ""}
              reflection={review?.reflection ?? ""}
              onSave={(goalTheme, reflection) => onSaveWeekly(weekStart, goalTheme, reflection)}
            />
          );
        })}
      </div>
    </section>
  );
}
