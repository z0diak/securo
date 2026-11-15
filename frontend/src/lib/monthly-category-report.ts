import type { DrillDownFilter } from '@/components/transaction-drill-down'
import { inclusivePeriodEnd } from '@/lib/category-spending-small-multiples'
import type { MonthlyCategoryReportResponse, MonthlyCategoryRow } from '@/types'

export type MonthlySectionKind = 'expenses' | 'income'

export type BudgetTone = 'ok' | 'warn' | 'over'

/** Share of the budget used at which a bar turns amber. */
export const BUDGET_WARN_RATIO = 0.9

export interface ProgressModel {
  /** Filled width, 0–100. */
  percent: number
  tone: BudgetTone | 'neutral'
}

/**
 * Bar model for one amount. With a budget the bar fills against it (capped at
 * 100%); without one it scales to the largest amount shown alongside it.
 */
export function progressModel(actual: number, budget: number | null, scaleMax: number): ProgressModel {
  const positive = Math.max(actual, 0)
  if (budget != null && budget > 0) {
    const ratio = positive / budget
    return {
      percent: Math.min(ratio, 1) * 100,
      tone: ratio > 1 ? 'over' : ratio >= BUDGET_WARN_RATIO ? 'warn' : 'ok',
    }
  }
  if (budget != null) {
    // A zero budget is blown by any spend.
    return { percent: positive > 0 ? 100 : 0, tone: positive > 0 ? 'over' : 'ok' }
  }
  return { percent: scaleMax > 0 ? (positive / scaleMax) * 100 : 0, tone: 'neutral' }
}

/** Drill-down filter listing the month's transactions behind one row. */
export function rowDrillDownFilter(
  row: MonthlyCategoryRow,
  kind: MonthlySectionKind,
  report: Pick<MonthlyCategoryReportResponse, 'start' | 'end'>,
  today: string,
  title: string,
): DrillDownFilter {
  // The report counts actuals up to today, so later projections stay out.
  const monthEnd = inclusivePeriodEnd(report.end)
  const range = { from: report.start, to: today < monthEnd ? today : monthEnd }
  if (row.category_id === 'uncategorized') {
    // Uncategorized splits by direction; a category shows its net.
    return { title, uncategorized: true, type: kind === 'income' ? 'credit' : 'debit', ...range }
  }
  return { title, category_id: row.category_id, ...range }
}

/** Stable key for the drill-down selection, unique across both sections. */
export function rowSelectionKey(row: MonthlyCategoryRow, kind: MonthlySectionKind): string {
  return `${kind}:${row.category_id}`
}

/** Largest positive row amount in a section, for scaling unbudgeted bars. */
export function sectionScaleMax(report: MonthlyCategoryReportResponse, kind: MonthlySectionKind): number {
  return report[kind].groups.reduce(
    (max, group) => group.rows.reduce((m, row) => Math.max(m, row.actual_amount), max),
    0,
  )
}
