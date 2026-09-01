import type {
  CategorySpendingPeriod,
  CategorySpendingPeriodValue,
  CategorySpendingRow,
} from '@/types'
import { normalizeText } from '@/lib/utils'

export const DEFAULT_VISIBLE_CATEGORY_COUNT = 6

export type CategorySpendingPreset =
  | 'top_spend'
  | 'over_budget'
  | 'changed_most'
  | 'all'

export interface CategoryTrendSummary {
  amount: number
  percent: number | null
  significant: boolean
  direction: 'up' | 'down' | 'flat'
}

export interface BudgetBarModel {
  actualHeight: number
  budgetHeight: number | null
  status: 'no_budget' | 'under' | 'over' | 'on_budget'
  actualLayer: 'front' | 'back'
  budgetLayer: 'front' | 'back' | null
}

export interface CategoryMonthlyValue {
  period: CategorySpendingPeriod
  actualAmount: number
  budgetAmount: number | null
  varianceAmount: number | null
  percentageUsed: number | null
  status: CategorySpendingPeriodValue['status']
}

export interface CategoryCardSummary {
  row: CategorySpendingRow
  periods: CategorySpendingPeriod[]
  values: CategoryMonthlyValue[]
  averageMonthly: number
  standardDeviation: number
  trend: CategoryTrendSummary
  totalActual: number
  totalOverage: number
  maxMonthlyActual: number
  minMonthlyActual: number
  maxActualOrBudget: number
  hasOverBudget: boolean
}

export interface CategoryCardFilterState {
  query?: string
  selectedCategoryIds?: string[]
}

type NumericValue = number | Pick<CategoryMonthlyValue, 'actualAmount'>

type BudgetBarSource =
  | Pick<CategoryMonthlyValue, 'actualAmount' | 'budgetAmount'>
  | Pick<CategorySpendingPeriodValue, 'actual_amount' | 'budget_amount'>

function actualOf(value: NumericValue): number {
  return typeof value === 'number' ? value : value.actualAmount
}

function barActualOf(value: BudgetBarSource): number {
  return 'actualAmount' in value ? value.actualAmount : value.actual_amount
}

function barBudgetOf(value: BudgetBarSource): number | null {
  return 'budgetAmount' in value ? value.budgetAmount : value.budget_amount
}

function clampPercent(value: number): number {
  if (!Number.isFinite(value)) return 0
  return Math.min(Math.max(value, 0), 100)
}

function average(values: number[]): number {
  if (values.length === 0) return 0
  return values.reduce((sum, value) => sum + value, 0) / values.length
}

export function orderedCategoryPeriods(periods: CategorySpendingPeriod[]): CategorySpendingPeriod[] {
  return [...periods].sort((a, b) => {
    const byStart = a.start.localeCompare(b.start)
    if (byStart !== 0) return byStart
    return a.key.localeCompare(b.key)
  })
}

export function categoryMonthlyValues(
  row: CategorySpendingRow,
  periods: CategorySpendingPeriod[],
): CategoryMonthlyValue[] {
  return orderedCategoryPeriods(periods).map((period) => {
    const value = row.periods[period.key]
    return {
      period,
      actualAmount: value?.actual_amount ?? 0,
      budgetAmount: value?.budget_amount ?? null,
      varianceAmount: value?.variance_amount ?? null,
      percentageUsed: value?.percentage_used ?? null,
      status: value?.status ?? 'no_budget',
    }
  })
}

export function averageMonthly(values: NumericValue[]): number {
  return average(values.map(actualOf))
}

export function standardDeviation(values: NumericValue[]): number {
  const amounts = values.map(actualOf)
  if (amounts.length === 0) return 0
  const mean = average(amounts)
  const variance = amounts.reduce((sum, value) => sum + (value - mean) ** 2, 0) / amounts.length
  return Math.sqrt(variance)
}

export function trendSummary(values: NumericValue[]): CategoryTrendSummary {
  const amounts = values.map(actualOf).filter((amount) => amount > 0)
  if (amounts.length === 0) {
    return { amount: 0, percent: null, significant: false, direction: 'flat' }
  }

  const periodCount = amounts.length
  const windowSize = periodCount <= 3
    ? 1
    : periodCount <= 8
      ? 2
      : periodCount <= 18
        ? 3
        : 4
  const earlyAverage = average(amounts.slice(0, windowSize))
  const lateAverage = average(amounts.slice(-windowSize))
  const amount = lateAverage - earlyAverage
  const percent = earlyAverage > 0 ? (amount / earlyAverage) * 100 : null
  const mean = averageMonthly(amounts)
  const deviation = standardDeviation(amounts)
  const threshold = Math.max(mean * 0.1, deviation * 0.35, 1)
  const significant = Math.abs(amount) >= threshold

  if (!significant) return { amount, percent, significant, direction: 'flat' }
  return { amount, percent, significant, direction: amount > 0 ? 'up' : 'down' }
}

export function categoryCardSummary(
  row: CategorySpendingRow,
  periods: CategorySpendingPeriod[],
): CategoryCardSummary {
  const values = categoryMonthlyValues(row, periods)
  const actuals = values.map((value) => value.actualAmount)
  const totalActual = actuals.reduce((sum, value) => sum + value, 0)
  const totalOverage = values.reduce((sum, value) => {
    if (value.budgetAmount == null) return sum
    return sum + Math.max(value.actualAmount - value.budgetAmount, 0)
  }, 0)

  return {
    row,
    periods: values.map((value) => value.period),
    values,
    averageMonthly: averageMonthly(actuals),
    standardDeviation: standardDeviation(actuals),
    trend: trendSummary(actuals),
    totalActual,
    totalOverage,
    maxMonthlyActual: Math.max(...actuals, 0),
    minMonthlyActual: actuals.length > 0 ? Math.min(...actuals) : 0,
    maxActualOrBudget: Math.max(
      ...values.map((value) => Math.max(value.actualAmount, value.budgetAmount ?? 0)),
      1,
    ),
    hasOverBudget: values.some((value) => value.budgetAmount != null && value.actualAmount > value.budgetAmount),
  }
}

export function budgetBarModel(
  value: BudgetBarSource,
  cardMax: number,
  showBudgetOverlay: boolean,
): BudgetBarModel {
  const actualAmount = Math.max(barActualOf(value), 0)
  const budgetAmount = barBudgetOf(value)
  const max = Math.max(cardMax, 1)
  const actualHeight = clampPercent((actualAmount / max) * 100)

  if (!showBudgetOverlay || budgetAmount == null) {
    return {
      actualHeight,
      budgetHeight: null,
      status: 'no_budget',
      actualLayer: 'front',
      budgetLayer: null,
    }
  }

  const safeBudget = Math.max(budgetAmount, 0)
  const budgetHeight = clampPercent((safeBudget / max) * 100)
  const status: BudgetBarModel['status'] = actualAmount > safeBudget
    ? 'over'
    : actualAmount < safeBudget
      ? 'under'
      : 'on_budget'

  return {
    actualHeight,
    budgetHeight,
    status,
    actualLayer: status === 'over' ? 'back' : 'front',
    budgetLayer: status === 'over' ? 'front' : 'back',
  }
}

export function filterCategoryCards(
  cards: CategoryCardSummary[],
  state: CategoryCardFilterState,
): CategoryCardSummary[] {
  const selected = new Set(state.selectedCategoryIds ?? [])
  const hasSelection = selected.size > 0
  const query = normalizeText(state.query?.trim() ?? '')

  return cards.filter((card) => {
    if (hasSelection && !selected.has(card.row.category_id)) return false
    if (!query) return true
    const haystack = normalizeText(`${card.row.category_name} ${card.row.group_name ?? ''}`)
    return haystack.includes(query)
  })
}

export function sortCategoryCards(
  cards: CategoryCardSummary[],
  preset: CategorySpendingPreset,
): CategoryCardSummary[] {
  const sorted = [...cards]

  if (preset === 'over_budget') {
    return sorted
      .filter((card) => card.hasOverBudget)
      .sort((a, b) => b.totalOverage - a.totalOverage || b.averageMonthly - a.averageMonthly)
  }

  if (preset === 'changed_most') {
    return sorted.sort((a, b) => {
      const aTrend = a.trend.significant ? Math.abs(a.trend.amount) : 0
      const bTrend = b.trend.significant ? Math.abs(b.trend.amount) : 0
      return bTrend - aTrend || b.averageMonthly - a.averageMonthly
    })
  }

  return sorted.sort((a, b) => b.averageMonthly - a.averageMonthly)
}

export function defaultVisibleCategoryIds(cards: CategoryCardSummary[]): string[] {
  return sortCategoryCards(cards, 'top_spend')
    .slice(0, DEFAULT_VISIBLE_CATEGORY_COUNT)
    .map((card) => card.row.category_id)
}

export function inclusivePeriodEnd(exclusiveEnd: string): string {
  const [year, month, day] = exclusiveEnd.split('-').map(Number)
  const date = new Date(Date.UTC(year, month - 1, day))
  date.setUTCDate(date.getUTCDate() - 1)
  return date.toISOString().slice(0, 10)
}
