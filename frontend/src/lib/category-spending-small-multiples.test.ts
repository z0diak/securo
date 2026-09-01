import { describe, expect, it } from 'vitest'

import type {
  CategorySpendingPeriod,
  CategorySpendingPeriodValue,
  CategorySpendingRow,
} from '@/types'
import {
  averageMonthly,
  budgetBarModel,
  categoryCardSummary,
  categoryMonthlyValues,
  defaultVisibleCategoryIds,
  filterCategoryCards,
  orderedCategoryPeriods,
  sortCategoryCards,
  standardDeviation,
  trendSummary,
} from '@/lib/category-spending-small-multiples'

function period(month: string): CategorySpendingPeriod {
  return {
    key: month,
    label: month,
    start: `${month}-01`,
    end: nextMonth(month),
  }
}

function nextMonth(month: string): string {
  const [year, monthNumber] = month.split('-').map(Number)
  const date = new Date(Date.UTC(year, monthNumber, 1))
  return date.toISOString().slice(0, 10)
}

function value(
  actual: number,
  budget: number | null = null,
  status: CategorySpendingPeriodValue['status'] = budget == null
    ? 'no_budget'
    : actual > budget
      ? 'over'
      : actual < budget
        ? 'under'
        : 'on_budget',
): CategorySpendingPeriodValue {
  return {
    actual_amount: actual,
    budget_amount: budget,
    variance_amount: budget == null ? null : actual - budget,
    variance_percent: budget ? ((actual - budget) / budget) * 100 : null,
    percentage_used: budget ? (actual / budget) * 100 : null,
    status,
    is_recurring_budget: false,
  }
}

function row(
  id: string,
  amounts: number[],
  options: {
    name?: string
    group?: string | null
    budgets?: (number | null)[]
    periods?: CategorySpendingPeriod[]
  } = {},
): CategorySpendingRow {
  const periods = options.periods ?? amounts.map((_, index) => period(`2026-0${index + 1}`))
  const periodValues = Object.fromEntries(
    amounts.map((amount, index) => {
      const budget = options.budgets?.[index] ?? null
      return [periods[index].key, value(amount, budget)]
    }),
  )

  return {
    category_id: id,
    category_name: options.name ?? id,
    category_icon: 'utensils',
    category_color: '#10B981',
    group_id: options.group ? `${options.group}-id` : null,
    group_name: options.group ?? null,
    total_amount: amounts.reduce((sum, amount) => sum + amount, 0),
    average_amount: averageMonthly(amounts),
    latest_amount: amounts.at(-1) ?? 0,
    trend_amount: 0,
    trend_percent: null,
    periods: periodValues,
  }
}

describe('category spending small multiple helpers', () => {
  it('orders periods chronologically even when API returns newest first', () => {
    const periods = [period('2026-03'), period('2026-01'), period('2026-02')]

    expect(orderedCategoryPeriods(periods).map((item) => item.key)).toEqual([
      '2026-01',
      '2026-02',
      '2026-03',
    ])
  })

  it('builds monthly values with zero fill for missing period entries', () => {
    const periods = [period('2026-03'), period('2026-02'), period('2026-01')]
    const spending = row('groceries', [10, 30], { periods: [periods[2], periods[0]] })

    expect(categoryMonthlyValues(spending, periods).map((item) => item.actualAmount)).toEqual([10, 0, 30])
  })

  it('includes zero months in averages', () => {
    expect(averageMonthly([12, 0, 6])).toBe(6)
  })

  it('uses population standard deviation', () => {
    expect(standardDeviation([2, 4, 4, 4, 5, 5, 7, 9])).toBe(2)
  })

  it('compares early-window average vs late-window average for trend', () => {
    const trend = trendSummary([10, 20, 30, 60])

    expect(trend.amount).toBe(30)
    expect(trend.percent).toBe(200)
  })

  it('skips zero-spend months when calculating trend', () => {
    const trend = trendSummary([10, 0, 0, 40])

    expect(trend.amount).toBe(30)
    expect(trend.percent).toBe(300)
    expect(trend.direction).toBe('up')
  })

  it('marks meaningful late growth as up', () => {
    expect(trendSummary([10, 10, 40, 40])).toMatchObject({
      significant: true,
      direction: 'up',
    })
  })

  it('marks meaningful late decline as down', () => {
    expect(trendSummary([40, 40, 10, 10])).toMatchObject({
      significant: true,
      direction: 'down',
    })
  })

  it('marks noise below threshold as flat', () => {
    expect(trendSummary([100, 105, 101, 104])).toMatchObject({
      significant: false,
      direction: 'flat',
    })
  })

  it('handles all-zero categories without NaN', () => {
    const trend = trendSummary([0, 0, 0, 0])

    expect(Number.isNaN(trend.amount)).toBe(false)
    expect(trend.percent).toBeNull()
    expect(trend.direction).toBe('flat')
  })

  it('sorts top spend by average and limits default cards', () => {
    const periods = [period('2026-01'), period('2026-02')]
    const cards = [
      row('low', [1, 1], { periods }),
      row('high', [9, 9], { periods }),
      row('mid', [5, 5], { periods }),
      row('extra-1', [4, 4], { periods }),
      row('extra-2', [3, 3], { periods }),
      row('extra-3', [2, 2], { periods }),
      row('extra-4', [0.5, 0.5], { periods }),
    ].map((item) => categoryCardSummary(item, periods))

    expect(sortCategoryCards(cards, 'top_spend')[0].row.category_id).toBe('high')
    expect(defaultVisibleCategoryIds(cards)).toEqual(['high', 'mid', 'extra-1', 'extra-2', 'extra-3', 'low'])
  })

  it('filters over-budget categories and sorts by total overage', () => {
    const periods = [period('2026-01'), period('2026-02')]
    const cards = [
      row('under', [5, 6], { budgets: [10, 10], periods }),
      row('small-over', [12, 8], { budgets: [10, 10], periods }),
      row('big-over', [30, 12], { budgets: [10, 10], periods }),
    ].map((item) => categoryCardSummary(item, periods))

    expect(sortCategoryCards(cards, 'over_budget').map((card) => card.row.category_id)).toEqual([
      'big-over',
      'small-over',
    ])
  })

  it('sorts changed-most by absolute significant trend amount', () => {
    const periods = [period('2026-01'), period('2026-02'), period('2026-03'), period('2026-04')]
    const cards = [
      row('flat', [100, 105, 101, 104], { periods }),
      row('falling', [80, 80, 10, 10], { periods }),
      row('growing', [10, 10, 100, 100], { periods }),
    ].map((item) => categoryCardSummary(item, periods))

    expect(sortCategoryCards(cards, 'changed_most').map((card) => card.row.category_id)).toEqual([
      'growing',
      'falling',
      'flat',
    ])
  })

  it('matches category and group names case-insensitively', () => {
    const periods = [period('2026-01')]
    const cards = [
      row('one', [10], { name: 'Groceries', group: 'Home', periods }),
      row('two', [10], { name: 'Flights', group: 'Travel', periods }),
    ].map((item) => categoryCardSummary(item, periods))

    expect(filterCategoryCards(cards, { query: 'HOME' }).map((card) => card.row.category_id)).toEqual(['one'])
    expect(filterCategoryCards(cards, { query: 'flight' }).map((card) => card.row.category_id)).toEqual(['two'])
  })

  it('models no-budget bars with actual only', () => {
    expect(budgetBarModel({ actualAmount: 50, budgetAmount: null }, 100, true)).toMatchObject({
      actualHeight: 50,
      budgetHeight: null,
      status: 'no_budget',
      actualLayer: 'front',
      budgetLayer: null,
    })
  })

  it('puts budget behind and actual in front when under budget', () => {
    expect(budgetBarModel({ actualAmount: 40, budgetAmount: 80 }, 100, true)).toMatchObject({
      actualHeight: 40,
      budgetHeight: 80,
      status: 'under',
      actualLayer: 'front',
      budgetLayer: 'back',
    })
  })

  it('puts actual behind and budget in front when over budget', () => {
    expect(budgetBarModel({ actualAmount: 120, budgetAmount: 80 }, 120, true)).toMatchObject({
      actualHeight: 100,
      budgetHeight: 66.66666666666666,
      status: 'over',
      actualLayer: 'back',
      budgetLayer: 'front',
    })
  })

  it('clamps bar heights between 0 and 100', () => {
    const high = budgetBarModel({ actualAmount: 500, budgetAmount: 250 }, 100, true)
    const low = budgetBarModel({ actualAmount: -10, budgetAmount: -5 }, 100, true)

    expect(high.actualHeight).toBe(100)
    expect(high.budgetHeight).toBe(100)
    expect(low.actualHeight).toBe(0)
    expect(low.budgetHeight).toBe(0)
  })

  it('keeps zero card max finite', () => {
    const model = budgetBarModel({ actualAmount: 0, budgetAmount: 0 }, 0, true)

    expect(Number.isFinite(model.actualHeight)).toBe(true)
    expect(Number.isFinite(model.budgetHeight)).toBe(true)
  })
})
