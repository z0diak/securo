import { fireEvent, screen, within } from '@testing-library/react'
import type { TFunction } from 'i18next'
import { describe, expect, it, vi } from 'vitest'

import { MonthlyCategoryReport } from '@/components/reports/MonthlyCategoryReport'
import type { MonthlyCategoryReportResponse, MonthlyCategoryRow } from '@/types'
import { renderWithProviders, t } from '@/test/utils'

const testT = t as unknown as TFunction

function row(
  id: string,
  name: string,
  actual: number,
  budget: number | null,
  group: { id: string; name: string } | null = null,
): MonthlyCategoryRow {
  return {
    category_id: id,
    category_name: name,
    category_icon: 'tag',
    category_color: '#10B981',
    group_id: group?.id ?? null,
    group_name: group?.name ?? null,
    actual_amount: actual,
    budget_amount: budget,
    variance_amount: budget == null ? null : actual - budget,
  }
}

const living = { id: 'g1', name: 'Living' }
const groceries = row('c1', 'Groceries', 230, 200, living)
const rent = row('c2', 'Rent', 900, 1000, living)
const fun = row('c3', 'Fun', 75, null)
const salary = row('c4', 'Salary', 3000, null)

const data: MonthlyCategoryReportResponse = {
  month: '2026-02',
  start: '2026-02-01',
  end: '2026-03-01',
  currency: 'USD',
  is_current_month: false,
  expenses: {
    total_amount: 1205,
    budget_amount: 1200,
    budgeted_actual_amount: 1130,
    unbudgeted_actual_amount: 75,
    groups: [
      { group_id: 'g1', group_name: 'Living', actual_amount: 1130, budget_amount: 1200, rows: [rent, groceries] },
      { group_id: null, group_name: null, actual_amount: 75, budget_amount: null, rows: [fun] },
    ],
  },
  income: {
    total_amount: 3000,
    budget_amount: null,
    budgeted_actual_amount: 0,
    unbudgeted_actual_amount: 3000,
    groups: [{ group_id: null, group_name: null, actual_amount: 3000, budget_amount: null, rows: [salary] }],
  },
  net_amount: 1795,
}

function renderReport(overrides: Partial<Parameters<typeof MonthlyCategoryReport>[0]> = {}) {
  const onDrillDown = vi.fn()
  renderWithProviders(
    <MonthlyCategoryReport
      data={data}
      isLoading={false}
      monthLabel="February 2026"
      today="2026-05-01"
      selectedKey={null}
      onDrillDown={onDrillDown}
      formatCurrency={(value) => `$${value.toFixed(2)}`}
      mask={(value) => value}
      t={testT}
      {...overrides}
    />,
  )
  return { onDrillDown }
}

describe('MonthlyCategoryReport', () => {
  it('shows totals, net and budget usage', () => {
    renderReport()
    expect(screen.getAllByText('$3000.00').length).toBeGreaterThan(0)
    expect(screen.getByText('$1795.00')).toBeInTheDocument()
    expect(screen.getAllByText(/\$1130\.00/).length).toBeGreaterThan(0)
  })

  it('lists expenses by group and income separately', () => {
    renderReport()
    const expenses = screen.getByRole('region', { name: t('reports.expenses') })
    const income = screen.getByRole('region', { name: t('reports.income') })
    expect(within(expenses).getByText('Living')).toBeInTheDocument()
    expect(within(expenses).getByText('Groceries')).toBeInTheDocument()
    expect(within(expenses).getByText('Fun')).toBeInTheDocument()
    expect(within(income).getByText('Salary')).toBeInTheDocument()
    expect(within(income).queryByText('Groceries')).toBeNull()
  })

  it('collapses a group', () => {
    renderReport()
    fireEvent.click(screen.getByRole('button', { name: /Living/ }))
    expect(screen.queryByText('Groceries')).toBeNull()
    expect(screen.getByText('Fun')).toBeInTheDocument()
  })

  it('opens the drill-down for the clicked category', () => {
    const { onDrillDown } = renderReport()
    fireEvent.click(screen.getByRole('button', { name: /Groceries/ }))
    expect(onDrillDown).toHaveBeenCalledWith(
      expect.objectContaining({ category_id: 'c1', from: '2026-02-01', to: '2026-02-28' }),
      'expenses:c1',
    )
  })

  it('marks the selected row', () => {
    renderReport({ selectedKey: 'income:c4' })
    expect(screen.getByRole('button', { name: /Salary/ })).toHaveAttribute('aria-pressed', 'true')
  })

  it('shows an empty state when nothing happened', () => {
    renderReport({
      data: {
        ...data,
        expenses: { ...data.expenses, total_amount: 0, budget_amount: null, budgeted_actual_amount: 0, unbudgeted_actual_amount: 0, groups: [] },
        income: { ...data.income, total_amount: 0, unbudgeted_actual_amount: 0, groups: [] },
        net_amount: 0,
      },
    })
    expect(screen.getByText(t('reports.monthly.noActivity', { month: 'February 2026' }))).toBeInTheDocument()
  })
})
