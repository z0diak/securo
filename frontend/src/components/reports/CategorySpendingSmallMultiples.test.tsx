import { useState } from 'react'
import { screen, within } from '@testing-library/react'
import type { TFunction } from 'i18next'
import { describe, expect, it, vi } from 'vitest'

import { CategorySpendingSmallMultiples } from '@/components/reports/CategorySpendingSmallMultiples'
import type {
  CategorySpendingMatrixResponse,
  CategorySpendingPeriod,
  CategorySpendingPeriodValue,
  CategorySpendingRow,
} from '@/types'
import { renderWithProviders, t } from '@/test/utils'

const testT = t as unknown as TFunction

function period(month: string, label: string): CategorySpendingPeriod {
  const [year, monthNumber] = month.split('-').map(Number)
  const next = new Date(Date.UTC(year, monthNumber, 1))
  return {
    key: month,
    label,
    start: `${month}-01`,
    end: next.toISOString().slice(0, 10),
  }
}

const periods = [
  period('2026-04', 'April 2026'),
  period('2026-03', 'March 2026'),
  period('2026-02', 'February 2026'),
  period('2026-01', 'January 2026'),
]

function value(
  actual: number,
  budget: number | null,
): CategorySpendingPeriodValue {
  return {
    actual_amount: actual,
    budget_amount: budget,
    variance_amount: budget == null ? null : actual - budget,
    variance_percent: budget ? ((actual - budget) / budget) * 100 : null,
    percentage_used: budget ? (actual / budget) * 100 : null,
    status: budget == null
      ? 'no_budget'
      : actual > budget
        ? 'over'
        : actual < budget
          ? 'under'
          : 'on_budget',
    is_recurring_budget: false,
  }
}

function row(
  id: string,
  name: string,
  group: string,
  amountsByOldestMonth: number[],
  budgetsByOldestMonth: (number | null)[],
): CategorySpendingRow {
  const chronological = [...periods].reverse()
  const periodValues: CategorySpendingRow['periods'] = Object.fromEntries(
    chronological.map((item, index) => [
      item.key,
      value(amountsByOldestMonth[index], budgetsByOldestMonth[index]),
    ]),
  )

  return {
    category_id: id,
    category_name: name,
    category_icon: 'utensils',
    category_color: '#0EA5E9',
    group_id: `${group}-id`,
    group_name: group,
    total_amount: amountsByOldestMonth.reduce((sum, amount) => sum + amount, 0),
    average_amount: amountsByOldestMonth.reduce((sum, amount) => sum + amount, 0) / amountsByOldestMonth.length,
    latest_amount: amountsByOldestMonth.at(-1) ?? 0,
    trend_amount: 0,
    trend_percent: null,
    periods: periodValues,
  }
}

function matrix(rows = defaultRows()): CategorySpendingMatrixResponse {
  return {
    periods,
    rows,
    meta: {
      currency: 'USD',
      interval: 'monthly',
      type: 'expenses',
      period: null,
    },
  }
}

function defaultRows() {
  return [
    row('housing', 'Housing', 'Home', [900, 900, 900, 900], [1000, 1000, 1000, 1000]),
    row('groceries', 'Groceries', 'Home', [420, 480, 540, 610], [500, 500, 500, 500]),
    row('travel', 'Travel', 'Lifestyle', [800, 760, 120, 100], [900, 900, 900, 900]),
    row('dining', 'Dining', 'Lifestyle', [250, 260, 250, 255], [null, null, null, null]),
    row('utilities', 'Utilities', 'Home', [180, 170, 190, 185], [200, 200, 200, 200]),
    row('subscriptions', 'Subscriptions', 'Home', [100, 105, 98, 102], [120, 120, 120, 120]),
    row('pets', 'Pets', 'Family', [20, 25, 20, 25], [null, null, null, null]),
    row('books', 'Books', 'Learning', [10, 15, 10, 15], [null, null, null, null]),
  ]
}

function renderComponent({
  data = matrix(),
  isLoading = false,
  mask = (value: string) => value,
}: {
  data?: CategorySpendingMatrixResponse
  isLoading?: boolean
  mask?: (value: string) => string
} = {}) {
  const onDrillDown = vi.fn()

  function Harness() {
    const [showVariance, setShowVariance] = useState(true)
    return (
      <CategorySpendingSmallMultiples
        data={data}
        isLoading={isLoading}
        showVariance={showVariance}
        onShowVarianceChange={setShowVariance}
        onDrillDown={onDrillDown}
        formatCurrency={(value) => `$${value.toFixed(2)}`}
        formatMetricCurrency={(value) => `$${Math.round(value)}`}
        mask={mask}
        locale="en-US"
        t={testT}
      />
    )
  }

  return {
    ...renderWithProviders(<Harness />),
    onDrillDown,
  }
}

function cardIds(container: HTMLElement): string[] {
  return [...container.querySelectorAll('[data-testid^="category-card-"]')]
    .map((element) => element.getAttribute('data-testid')?.replace('category-card-', '') ?? '')
}

describe('CategorySpendingSmallMultiples', () => {
  it('renders card skeletons while loading', () => {
    renderComponent({ isLoading: true, data: undefined })

    expect(screen.getAllByTestId('category-card-skeleton')).toHaveLength(6)
  })

  it('shows multiple category cards by default', () => {
    const { container } = renderComponent()

    expect(cardIds(container).length).toBeGreaterThan(1)
    expect(screen.getByTestId('category-card-housing')).toBeInTheDocument()
    expect(screen.getByTestId('category-card-books')).toBeInTheDocument()
  })

  it('uses All as the default preset and orders presets predictably', () => {
    renderComponent()

    const presetGroup = screen.getByRole('group', { name: t('reports.categorySpending') })

    expect(within(presetGroup).getAllByRole('button').map((button) => button.textContent)).toEqual([
      t('reports.allCategories'),
      t('reports.topSpend'),
      t('reports.overBudget'),
      t('reports.changedMost'),
    ])
    expect(within(presetGroup).getByRole('button', { name: t('reports.allCategories') })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
  })

  it('hides lower-spend categories in Top spend preset', async () => {
    const { user } = renderComponent()

    await user.click(screen.getByRole('button', { name: t('reports.topSpend') }))

    expect(screen.getByTestId('category-card-housing')).toBeInTheDocument()
    expect(screen.queryByTestId('category-card-books')).not.toBeInTheDocument()
  })

  it('shows every category in All preset', () => {
    renderComponent()

    expect(screen.getByTestId('category-card-books')).toBeInTheDocument()
    expect(screen.getByTestId('category-card-pets')).toBeInTheDocument()
  })

  it('shows only over-budget categories in Over budget preset', async () => {
    const { user, container } = renderComponent()

    await user.click(screen.getByRole('button', { name: t('reports.overBudget') }))

    expect(cardIds(container)).toEqual(['groceries'])
  })

  it('prioritizes growing and falling categories in Changed most preset', async () => {
    const { user, container } = renderComponent()

    await user.click(screen.getByRole('button', { name: t('reports.changedMost') }))

    const firstTwo = cardIds(container).slice(0, 2)
    expect(firstTwo).toEqual(expect.arrayContaining(['groceries', 'travel']))
    expect(firstTwo).not.toContain('subscriptions')
  })

  it('filters visible cards by search', async () => {
    const { user, container } = renderComponent()

    await user.type(screen.getByLabelText(t('reports.searchCategories')), 'travel')

    expect(cardIds(container)).toEqual(['travel'])
  })

  it('selects two specific categories from the picker', async () => {
    const { user } = renderComponent()

    await user.click(screen.getByRole('button', { name: t('reports.selectCategories') }))
    await user.click(screen.getByRole('checkbox', { name: 'Books' }))
    await user.click(screen.getByRole('checkbox', { name: 'Pets' }))

    expect(screen.getByTestId('category-card-books')).toBeInTheDocument()
    expect(screen.getByTestId('category-card-pets')).toBeInTheDocument()
  })

  it('removes a selected category chip', async () => {
    const { user } = renderComponent()

    await user.click(screen.getByRole('button', { name: t('reports.selectCategories') }))
    await user.click(screen.getByRole('checkbox', { name: 'Books' }))
    await user.click(screen.getByRole('checkbox', { name: 'Pets' }))
    await user.click(screen.getByLabelText(t('reports.clearCategory', { category: 'Books' })))

    expect(screen.queryByTestId('category-card-books')).not.toBeInTheDocument()
    expect(screen.getByTestId('category-card-pets')).toBeInTheDocument()
  })

  it('rounds metric amounts and exposes metric hints', () => {
    renderComponent()

    const card = screen.getByTestId('category-card-groceries')

    expect(within(card).getByText('$513')).toBeInTheDocument()
    expect(within(card).getByText('$70')).toBeInTheDocument()
    expect(within(card).getByText('+$125')).toBeInTheDocument()
    expect(within(card).getByLabelText(t('reports.standardDeviation'))).toHaveAttribute(
      'title',
      [
        t('reports.standardDeviationHint'),
        `${t('reports.maximumSpend')}: $610`,
        `${t('reports.average')}: $513`,
        `${t('reports.minimumSpend')}: $420`,
      ].join('\n'),
    )
    expect(within(card).getByLabelText(t('reports.trendMetric'))).toHaveAttribute(
      'title',
      `${t('reports.trendAmount')}: +$125\n${t('reports.trendPercent')}: +28%`,
    )
  })

  it('uses abbreviated month labels on the x axis', () => {
    renderComponent()

    expect(within(screen.getByTestId('month-bar-groceries-2026-04')).getByText('Apr')).toBeInTheDocument()
    expect(within(screen.getByTestId('month-bar-groceries-2026-01')).getByText('Jan')).toBeInTheDocument()
  })

  it('shows budget overlay elements without hover', () => {
    const { container } = renderComponent()

    expect(container.querySelectorAll('[data-testid^="budget-bar-"]').length).toBeGreaterThan(0)
  })

  it('hides budget overlay elements when toggle is off', async () => {
    const { user, container } = renderComponent()

    await user.click(screen.getByLabelText(t('reports.budgetVariance')))

    expect(container.querySelectorAll('[data-testid^="budget-bar-"]')).toHaveLength(0)
  })

  it('keeps actual bars wide and renders budget bars thinner', async () => {
    const { user } = renderComponent()

    expect(screen.getByTestId('actual-bar-housing-2026-01')).toHaveClass('w-[72%]')
    expect(screen.getByTestId('budget-bar-housing-2026-01')).toHaveClass('w-[46%]')

    await user.click(screen.getByLabelText(t('reports.budgetVariance')))

    expect(screen.getByTestId('actual-bar-housing-2026-01')).toHaveClass('w-[72%]')
  })

  it('marks under-budget months with budget back and actual front', () => {
    renderComponent()

    const bar = screen.getByTestId('month-bar-housing-2026-01')
    expect(bar).toHaveAttribute('data-budget-layer', 'back')
    expect(bar).toHaveAttribute('data-actual-layer', 'front')
    expect(bar).toHaveAttribute('data-budget-status', 'under')
  })

  it('marks over-budget months with actual back and budget front', () => {
    renderComponent()

    const bar = screen.getByTestId('month-bar-groceries-2026-04')
    expect(bar).toHaveAttribute('data-budget-layer', 'front')
    expect(bar).toHaveAttribute('data-actual-layer', 'back')
    expect(bar).toHaveAttribute('data-budget-status', 'over')
  })

  it('opens drilldown from a month bar with inclusive period end', async () => {
    const { user, onDrillDown } = renderComponent()

    await user.click(screen.getByTestId('month-bar-groceries-2026-04'))

    expect(onDrillDown).toHaveBeenCalledWith(expect.objectContaining({
      category_id: 'groceries',
      type: 'debit',
      from: '2026-04-01',
      to: '2026-04-30',
    }))
  })

  it('masks metric and tooltip money values in privacy mode', () => {
    renderComponent({ mask: () => 'MASK' })

    const card = screen.getByTestId('category-card-groceries')
    expect(within(card).getAllByText('MASK').length).toBeGreaterThanOrEqual(3)
    expect(screen.getByTestId('month-bar-groceries-2026-04')).toHaveAttribute(
      'title',
      expect.stringContaining(`${t('reports.actual')}: MASK`),
    )
    expect(screen.getByTestId('month-bar-groceries-2026-04')).toHaveAttribute(
      'title',
      expect.stringContaining(`${t('reports.budget')}: MASK`),
    )
  })

  it('renders no data and no matching states', async () => {
    const empty = renderComponent({ data: matrix([]) })
    expect(screen.getByText(t('reports.noData'))).toBeInTheDocument()
    empty.unmount()

    const { user } = renderComponent()
    await user.type(screen.getByLabelText(t('reports.searchCategories')), 'zzzz')

    expect(screen.getByText(t('reports.noMatchingCategories'))).toBeInTheDocument()
  })
})
