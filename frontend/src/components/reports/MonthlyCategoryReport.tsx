import { useState } from 'react'
import type { TFunction } from 'i18next'
import { ChevronDown, ChevronRight } from 'lucide-react'

import { CategoryIcon } from '@/components/category-icon'
import type { DrillDownFilter } from '@/components/transaction-drill-down'
import { Skeleton } from '@/components/ui/skeleton'
import {
  progressModel,
  rowDrillDownFilter,
  rowSelectionKey,
  sectionScaleMax,
  type MonthlySectionKind,
  type ProgressModel,
} from '@/lib/monthly-category-report'
import { cn } from '@/lib/utils'
import type {
  MonthlyCategoryGroup,
  MonthlyCategoryReportResponse,
  MonthlyCategoryRow,
  MonthlyCategorySection,
} from '@/types'

interface MonthlyCategoryReportProps {
  data: MonthlyCategoryReportResponse | undefined
  isLoading: boolean
  monthLabel: string
  /** Workspace today (YYYY-MM-DD); caps the current month's drill-down. */
  today: string
  selectedKey: string | null
  onDrillDown: (filter: DrillDownFilter, key: string) => void
  formatCurrency: (value: number, currency?: string) => string
  mask: (value: string) => string
  t: TFunction
}

const TONE_CLASSES: Record<Exclude<ProgressModel['tone'], 'neutral'>, string> = {
  ok: 'bg-emerald-500',
  warn: 'bg-amber-500',
  over: 'bg-rose-500',
}

export function MonthlyCategoryReport({
  data,
  isLoading,
  monthLabel,
  today,
  selectedKey,
  onDrillDown,
  formatCurrency,
  mask,
  t,
}: MonthlyCategoryReportProps) {
  if (isLoading || !data) {
    return (
      <div className="space-y-4" data-testid="monthly-category-loading">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-xl" />)}
        </div>
        <Skeleton className="h-72 rounded-xl" />
      </div>
    )
  }

  const money = (value: number) => mask(formatCurrency(value, data.currency))
  const sectionProps = { data, monthLabel, today, selectedKey, onDrillDown, money, t }
  const isEmpty = data.expenses.groups.length === 0 && data.income.groups.length === 0

  return (
    <div className="space-y-5">
      <SummaryTiles data={data} money={money} t={t} />
      {isEmpty ? (
        <p className="bg-card border border-border rounded-xl text-muted-foreground text-sm text-center py-16">
          {t('reports.monthly.noActivity', { month: monthLabel })}
        </p>
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-5 items-start">
          <SectionCard kind="expenses" {...sectionProps} />
          <SectionCard kind="income" {...sectionProps} />
        </div>
      )}
    </div>
  )
}

function SummaryTiles({
  data,
  money,
  t,
}: {
  data: MonthlyCategoryReportResponse
  money: (value: number) => string
  t: TFunction
}) {
  const { expenses, income, net_amount: net } = data
  const budget = expenses.budget_amount
  const budgetModel = budget != null ? progressModel(expenses.budgeted_actual_amount, budget, 0) : null
  const remaining = budget != null ? budget - expenses.budgeted_actual_amount : 0

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      <Tile label={t('reports.income')} value={money(income.total_amount)} valueClass="text-emerald-600 dark:text-emerald-400" />
      <Tile label={t('reports.expenses')} value={money(expenses.total_amount)} valueClass="text-rose-600 dark:text-rose-400" />
      <Tile
        label={t('reports.monthly.net')}
        value={money(net)}
        valueClass={net >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}
        hint={data.is_current_month ? t('reports.monthly.monthToDate') : undefined}
      />
      <div className="bg-card border border-border rounded-xl px-4 py-3">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">{t('reports.monthly.budget')}</p>
        {budget != null && budgetModel ? (
          <>
            <p className="mt-1 text-lg font-bold tabular-nums text-foreground">
              {money(expenses.budgeted_actual_amount)}
              <span className="text-sm font-medium text-muted-foreground"> / {money(budget)}</span>
            </p>
            <Bar model={budgetModel} />
            <p className={cn('mt-1 text-xs tabular-nums', remaining < 0 ? 'text-rose-600 dark:text-rose-400' : 'text-muted-foreground')}>
              {remaining < 0
                ? t('reports.monthly.overBy', { amount: money(-remaining) })
                : t('reports.monthly.left', { amount: money(remaining) })}
              {expenses.unbudgeted_actual_amount > 0 && (
                <> · {t('reports.monthly.unbudgeted', { amount: money(expenses.unbudgeted_actual_amount) })}</>
              )}
            </p>
          </>
        ) : (
          <p className="mt-2 text-sm text-muted-foreground">{t('reports.monthly.noBudgets')}</p>
        )}
      </div>
    </div>
  )
}

function Tile({ label, value, valueClass, hint }: { label: string; value: string; valueClass?: string; hint?: string }) {
  return (
    <div className="bg-card border border-border rounded-xl px-4 py-3">
      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">{label}</p>
      <p className={cn('mt-1 text-lg font-bold tabular-nums', valueClass ?? 'text-foreground')}>{value}</p>
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  )
}

function Bar({ model, color }: { model: ProgressModel; color?: string }) {
  return (
    <div className="mt-1.5 h-1.5 w-full rounded-full bg-muted overflow-hidden">
      <div
        className={cn('h-full rounded-full', model.tone !== 'neutral' && TONE_CLASSES[model.tone])}
        style={{
          width: `${model.percent}%`,
          ...(model.tone === 'neutral' ? { backgroundColor: color ?? '#6B7280' } : {}),
        }}
      />
    </div>
  )
}

interface SectionCardProps {
  kind: MonthlySectionKind
  data: MonthlyCategoryReportResponse
  monthLabel: string
  today: string
  selectedKey: string | null
  onDrillDown: (filter: DrillDownFilter, key: string) => void
  money: (value: number) => string
  t: TFunction
}

function SectionCard({ kind, data, monthLabel, today, selectedKey, onDrillDown, money, t }: SectionCardProps) {
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set())
  const section: MonthlyCategorySection = data[kind]
  const scaleMax = sectionScaleMax(data, kind)
  const showGroupHeaders = section.groups.some((group) => group.group_id !== null)

  const toggle = (key: string) => setCollapsed((prev) => {
    const next = new Set(prev)
    if (next.has(key)) next.delete(key)
    else next.add(key)
    return next
  })

  return (
    <section className="bg-card border border-border rounded-xl overflow-hidden" aria-label={t(`reports.${kind}`)}>
      <header className="flex items-baseline justify-between gap-3 px-4 py-3 border-b border-border">
        <h3 className="text-sm font-semibold text-foreground">{t(`reports.${kind}`)}</h3>
        <p className="text-sm font-bold tabular-nums text-foreground">
          {money(section.total_amount)}
          {section.budget_amount != null && (
            <span className="font-medium text-muted-foreground"> · {t('reports.monthly.budgetOf', { amount: money(section.budget_amount) })}</span>
          )}
        </p>
      </header>
      {section.groups.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-10">
          {t(kind === 'income' ? 'reports.monthly.noIncome' : 'reports.monthly.noExpenses')}
        </p>
      ) : (
        <div className="divide-y divide-border">
          {section.groups.map((group) => {
            const groupKey = group.group_id ?? 'ungrouped'
            const isCollapsed = collapsed.has(groupKey)
            return (
              <div key={groupKey}>
                {showGroupHeaders && (
                  <GroupHeader
                    group={group}
                    collapsed={isCollapsed}
                    onToggle={() => toggle(groupKey)}
                    money={money}
                    t={t}
                  />
                )}
                {!isCollapsed && group.rows.map((row) => {
                  const key = rowSelectionKey(row, kind)
                  const name = row.category_id === 'uncategorized' ? t('reports.uncategorized') : row.category_name
                  return (
                    <CategoryRow
                      key={key}
                      row={row}
                      name={name}
                      scaleMax={scaleMax}
                      selected={selectedKey === key}
                      onClick={() => onDrillDown(
                        rowDrillDownFilter(
                          row, kind, data, today,
                          t('reports.drillDownCategory', { category: name, month: monthLabel }),
                        ),
                        key,
                      )}
                      money={money}
                      t={t}
                    />
                  )
                })}
              </div>
            )
          })}
        </div>
      )}
    </section>
  )
}

function GroupHeader({
  group,
  collapsed,
  onToggle,
  money,
  t,
}: {
  group: MonthlyCategoryGroup
  collapsed: boolean
  onToggle: () => void
  money: (value: number) => string
  t: TFunction
}) {
  const Chevron = collapsed ? ChevronRight : ChevronDown
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={!collapsed}
      className="w-full flex items-center gap-2 px-4 py-2 bg-muted/40 hover:bg-muted/60 transition-colors text-left"
    >
      <Chevron className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
      <span className="flex-1 min-w-0 truncate text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {group.group_name ?? t('reports.monthly.ungrouped')}
      </span>
      <span className="text-xs font-semibold tabular-nums text-foreground">
        {money(group.actual_amount)}
        {group.budget_amount != null && (
          <span className="font-medium text-muted-foreground"> / {money(group.budget_amount)}</span>
        )}
      </span>
    </button>
  )
}

function CategoryRow({
  row,
  name,
  scaleMax,
  selected,
  onClick,
  money,
  t,
}: {
  row: MonthlyCategoryRow
  name: string
  scaleMax: number
  selected: boolean
  onClick: () => void
  money: (value: number) => string
  t: TFunction
}) {
  const model = progressModel(row.actual_amount, row.budget_amount, scaleMax)
  const variance = row.variance_amount
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={cn(
        'w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors',
        selected ? 'bg-primary/10' : 'hover:bg-muted/50',
      )}
    >
      <CategoryIcon icon={row.category_icon} color={row.category_color} size="sm" />
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline justify-between gap-3">
          <span className="truncate text-sm font-medium text-foreground">{name}</span>
          <span className="shrink-0 text-sm font-semibold tabular-nums text-foreground">
            {money(row.actual_amount)}
            {row.budget_amount != null && (
              <span className="font-medium text-muted-foreground"> / {money(row.budget_amount)}</span>
            )}
          </span>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex-1 min-w-0">
            <Bar model={model} color={row.category_color} />
          </div>
          {variance != null && (
            <span
              className={cn(
                'shrink-0 mt-1 text-xs tabular-nums',
                variance > 0 ? 'text-rose-600 dark:text-rose-400' : 'text-muted-foreground',
              )}
            >
              {variance > 0
                ? t('reports.monthly.overBy', { amount: money(variance) })
                : t('reports.monthly.left', { amount: money(-variance) })}
            </span>
          )}
        </div>
      </div>
    </button>
  )
}
