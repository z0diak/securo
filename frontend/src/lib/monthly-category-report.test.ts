import { describe, expect, it } from 'vitest'

import {
  progressModel,
  rowDrillDownFilter,
  rowSelectionKey,
  sectionScaleMax,
} from '@/lib/monthly-category-report'
import type { MonthlyCategoryReportResponse, MonthlyCategoryRow } from '@/types'

function row(id: string, actual: number, budget: number | null = null): MonthlyCategoryRow {
  return {
    category_id: id,
    category_name: id,
    category_icon: 'tag',
    category_color: '#10B981',
    group_id: null,
    group_name: null,
    actual_amount: actual,
    budget_amount: budget,
    variance_amount: budget == null ? null : actual - budget,
  }
}

const report = {
  start: '2026-02-01',
  end: '2026-03-01',
} as const

describe('progressModel', () => {
  it('fills against the budget and tones by usage', () => {
    expect(progressModel(50, 100, 0)).toEqual({ percent: 50, tone: 'ok' })
    expect(progressModel(95, 100, 0)).toEqual({ percent: 95, tone: 'warn' })
    expect(progressModel(150, 100, 0)).toEqual({ percent: 100, tone: 'over' })
  })

  it('treats net refunds as an empty bar', () => {
    expect(progressModel(-20, 100, 0)).toEqual({ percent: 0, tone: 'ok' })
  })

  it('reads any spend against a zero budget as over', () => {
    expect(progressModel(10, 0, 0)).toEqual({ percent: 100, tone: 'over' })
    expect(progressModel(0, 0, 0)).toEqual({ percent: 0, tone: 'ok' })
  })

  it('scales unbudgeted rows to the section max', () => {
    expect(progressModel(25, null, 100)).toEqual({ percent: 25, tone: 'neutral' })
    expect(progressModel(25, null, 0)).toEqual({ percent: 0, tone: 'neutral' })
  })
})

describe('rowDrillDownFilter', () => {
  it('scopes a category to the whole month inclusive', () => {
    expect(rowDrillDownFilter(row('cat-1', 10), 'expenses', report, '2026-05-01', 'T')).toEqual({
      title: 'T', category_id: 'cat-1', from: '2026-02-01', to: '2026-02-28',
    })
  })

  it('stops the current month at today', () => {
    expect(rowDrillDownFilter(row('cat-1', 10), 'expenses', report, '2026-02-10', 'T'))
      .toMatchObject({ to: '2026-02-10' })
  })

  it('splits uncategorized by section direction', () => {
    expect(rowDrillDownFilter(row('uncategorized', 10), 'expenses', report, '2026-05-01', 'T')).toMatchObject({
      uncategorized: true, type: 'debit',
    })
    expect(rowDrillDownFilter(row('uncategorized', 10), 'income', report, '2026-05-01', 'T')).toMatchObject({
      uncategorized: true, type: 'credit',
    })
  })
})

describe('rowSelectionKey / sectionScaleMax', () => {
  it('keeps uncategorized expense and income distinct', () => {
    expect(rowSelectionKey(row('uncategorized', 1), 'expenses'))
      .not.toBe(rowSelectionKey(row('uncategorized', 1), 'income'))
  })

  it('finds the largest row across groups', () => {
    const data = {
      expenses: {
        groups: [
          { rows: [row('a', 40), row('b', -5)] },
          { rows: [row('c', 90)] },
        ],
      },
    } as unknown as MonthlyCategoryReportResponse
    expect(sectionScaleMax(data, 'expenses')).toBe(90)
  })
})
