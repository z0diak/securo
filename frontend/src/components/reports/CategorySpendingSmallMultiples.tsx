import { useMemo, useState, type ReactNode } from 'react'
import type { TFunction } from 'i18next'
import { ArrowDown, ArrowUp, Check, HelpCircle, Minus, Search, X } from 'lucide-react'

import { CategoryIcon } from '@/components/category-icon'
import type { DrillDownFilter } from '@/components/transaction-drill-down'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Skeleton } from '@/components/ui/skeleton'
import {
  budgetBarModel,
  categoryCardSummary,
  DEFAULT_VISIBLE_CATEGORY_COUNT,
  filterCategoryCards,
  inclusivePeriodEnd,
  sortCategoryCards,
  type CategoryCardSummary,
  type CategoryMonthlyValue,
  type CategorySpendingPreset,
} from '@/lib/category-spending-small-multiples'
import { cn } from '@/lib/utils'
import type { CategorySpendingMatrixResponse } from '@/types'

const PRESETS: { key: CategorySpendingPreset; labelKey: string }[] = [
  { key: 'all', labelKey: 'reports.allCategories' },
  { key: 'top_spend', labelKey: 'reports.topSpend' },
  { key: 'over_budget', labelKey: 'reports.overBudget' },
  { key: 'changed_most', labelKey: 'reports.changedMost' },
]

export interface CategorySpendingSmallMultiplesProps {
  data?: CategorySpendingMatrixResponse
  isLoading: boolean
  showVariance: boolean
  onShowVarianceChange: (value: boolean) => void
  onDrillDown: (filter: DrillDownFilter) => void
  formatCurrency: (value: number, currency?: string) => string
  formatMetricCurrency?: (value: number, currency?: string) => string
  mask: (value: string) => string
  locale?: string
  t: TFunction
}

export function CategorySpendingSmallMultiples({
  data,
  isLoading,
  showVariance,
  onShowVarianceChange,
  onDrillDown,
  formatCurrency,
  formatMetricCurrency,
  mask,
  locale = 'en-US',
  t,
}: CategorySpendingSmallMultiplesProps) {
  const [query, setQuery] = useState('')
  const [pickerQuery, setPickerQuery] = useState('')
  const [preset, setPreset] = useState<CategorySpendingPreset>('all')
  const [selectedCategoryIds, setSelectedCategoryIds] = useState<string[]>([])

  const currency = data?.meta.currency ?? 'USD'
  const cards = useMemo(
    () => data?.rows.map((row) => categoryCardSummary(row, data.periods)) ?? [],
    [data],
  )
  const cardsById = useMemo(
    () => new Map(cards.map((card) => [card.row.category_id, card])),
    [cards],
  )
  const selectedCards = useMemo(
    () => selectedCategoryIds
      .map((id) => cardsById.get(id))
      .filter((card): card is CategoryCardSummary => Boolean(card)),
    [cardsById, selectedCategoryIds],
  )

  const visibleCards = useMemo(() => {
    const baseCards = selectedCategoryIds.length > 0
      ? selectedCards
      : sortCategoryCards(cards, preset)

    const limitedCards = selectedCategoryIds.length > 0 || preset === 'all' || preset === 'over_budget'
      ? baseCards
      : baseCards.slice(0, DEFAULT_VISIBLE_CATEGORY_COUNT)

    return filterCategoryCards(limitedCards, { query })
  }, [cards, preset, query, selectedCards, selectedCategoryIds.length])

  const pickerCards = useMemo(
    () => filterCategoryCards(sortCategoryCards(cards, 'top_spend'), { query: pickerQuery }),
    [cards, pickerQuery],
  )

  const formatMoney = (value: number) => mask(formatCurrency(value, currency))
  const formatRoundedMoney = (value: number) => {
    const formatter = formatMetricCurrency ?? formatCurrency
    return mask(formatter(Math.round(value), currency))
  }
  const formatSignedRoundedMoney = (value: number) => {
    const formatter = formatMetricCurrency ?? formatCurrency
    const formatted = formatter(Math.round(Math.abs(value)), currency)
    const masked = mask(formatted)
    if (masked !== formatted) return masked
    return `${value >= 0 ? '+' : '-'}${formatted}`
  }

  const setPresetAndClearSelection = (nextPreset: CategorySpendingPreset) => {
    setPreset(nextPreset)
    setSelectedCategoryIds([])
  }

  const toggleCategory = (categoryId: string) => {
    setSelectedCategoryIds((current) =>
      current.includes(categoryId)
        ? current.filter((id) => id !== categoryId)
        : [...current, categoryId],
    )
  }

  const removeCategory = (categoryId: string) => {
    setSelectedCategoryIds((current) => current.filter((id) => id !== categoryId))
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 rounded-xl border border-border bg-card p-3 shadow-sm">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex min-w-0 flex-1 flex-col gap-2 sm:flex-row sm:items-center">
            <div className="relative min-w-0 flex-1 sm:max-w-xs">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={t('reports.searchCategories')}
                aria-label={t('reports.searchCategories')}
                className="pl-9"
              />
            </div>
            <div className="flex flex-wrap gap-1.5" role="group" aria-label={t('reports.categorySpending')}>
              {PRESETS.map((item) => {
                const active = selectedCategoryIds.length === 0 && preset === item.key
                return (
                  <Button
                    key={item.key}
                    type="button"
                    variant={active ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setPresetAndClearSelection(item.key)}
                    aria-pressed={active}
                  >
                    {t(item.labelKey)}
                  </Button>
                )
              })}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Popover>
              <PopoverTrigger asChild>
                <Button type="button" variant="outline" size="sm">
                  <Check className="h-4 w-4" />
                  {t('reports.selectCategories')}
                </Button>
              </PopoverTrigger>
              <PopoverContent align="end" className="w-72 p-3">
                <div className="space-y-3">
                  <Input
                    value={pickerQuery}
                    onChange={(event) => setPickerQuery(event.target.value)}
                    placeholder={t('reports.searchCategories')}
                    aria-label={t('reports.searchCategories')}
                  />
                  <div className="max-h-72 space-y-1 overflow-y-auto pr-1">
                    {pickerCards.length === 0 ? (
                      <p className="py-6 text-center text-sm text-muted-foreground">
                        {t('reports.noMatchingCategories')}
                      </p>
                    ) : (
                      pickerCards.map((card) => {
                        const checked = selectedCategoryIds.includes(card.row.category_id)
                        return (
                          <label
                            key={card.row.category_id}
                            className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-2 text-sm hover:bg-muted"
                          >
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() => toggleCategory(card.row.category_id)}
                              className="h-4 w-4 accent-primary"
                              aria-label={card.row.category_name}
                            />
                            <CategoryIcon
                              icon={card.row.category_icon}
                              color={card.row.category_color}
                              size="sm"
                            />
                            <span className="min-w-0 flex-1 truncate font-medium">
                              {card.row.category_name}
                            </span>
                            {checked && <Check className="h-4 w-4 text-primary" />}
                          </label>
                        )
                      })
                    )}
                  </div>
                </div>
              </PopoverContent>
            </Popover>

            <label className="flex h-9 items-center gap-2 rounded-lg border border-border bg-background px-3 text-xs font-semibold text-muted-foreground">
              <input
                type="checkbox"
                checked={showVariance}
                onChange={(event) => onShowVarianceChange(event.target.checked)}
                className="h-3.5 w-3.5 accent-primary"
              />
              {t('reports.budgetVariance')}
            </label>
          </div>
        </div>

        {selectedCards.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-xs font-medium text-muted-foreground">
              {t('reports.selectedCategories')}
            </span>
            {selectedCards.map((card) => (
              <span
                key={card.row.category_id}
                className="inline-flex max-w-full items-center gap-1 rounded-full border border-border bg-background px-2 py-1 text-xs font-medium"
              >
                <span className="truncate">{card.row.category_name}</span>
                <button
                  type="button"
                  onClick={() => removeCategory(card.row.category_id)}
                  title={t('reports.clearCategory', { category: card.row.category_name })}
                  aria-label={t('reports.clearCategory', { category: card.row.category_name })}
                  className="rounded-full p-0.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                >
                  <X className="h-3 w-3" />
                </button>
              </span>
            ))}
          </div>
        )}
      </div>

      {isLoading ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: DEFAULT_VISIBLE_CATEGORY_COUNT }).map((_, index) => (
            <Skeleton
              key={index}
              data-testid="category-card-skeleton"
              className="h-72 rounded-xl"
            />
          ))}
        </div>
      ) : cards.length === 0 ? (
        <p className="rounded-xl border border-border bg-card py-16 text-center text-sm text-muted-foreground shadow-sm">
          {t('reports.noData')}
        </p>
      ) : visibleCards.length === 0 ? (
        <p className="rounded-xl border border-border bg-card py-16 text-center text-sm text-muted-foreground shadow-sm">
          {t('reports.noMatchingCategories')}
        </p>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {visibleCards.map((card) => (
            <CategoryCard
              key={card.row.category_id}
              card={card}
              showVariance={showVariance}
              onDrillDown={onDrillDown}
              formatMoney={formatMoney}
              formatRoundedMoney={formatRoundedMoney}
              formatSignedRoundedMoney={formatSignedRoundedMoney}
              locale={locale}
              t={t}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function CategoryCard({
  card,
  showVariance,
  onDrillDown,
  formatMoney,
  formatRoundedMoney,
  formatSignedRoundedMoney,
  locale,
  t,
}: {
  card: CategoryCardSummary
  showVariance: boolean
  onDrillDown: (filter: DrillDownFilter) => void
  formatMoney: (value: number) => string
  formatRoundedMoney: (value: number) => string
  formatSignedRoundedMoney: (value: number) => string
  locale: string
  t: TFunction
}) {
  const TrendIcon = card.trend.direction === 'up'
    ? ArrowUp
    : card.trend.direction === 'down'
      ? ArrowDown
      : Minus
  const trendColor = card.trend.direction === 'up'
    ? 'text-rose-600'
    : card.trend.direction === 'down'
      ? 'text-emerald-600'
      : 'text-muted-foreground'
  const trendValue = card.trend.direction === 'flat'
    ? t('reports.flatTrend')
    : formatSignedRoundedMoney(card.trend.amount)
  const trendPercent = formatPercent(card.trend.percent ?? 0)
  const standardDeviationHint = [
    t('reports.standardDeviationHint'),
    `${t('reports.maximumSpend')}: ${formatRoundedMoney(card.maxMonthlyActual)}`,
    `${t('reports.average')}: ${formatRoundedMoney(card.averageMonthly)}`,
    `${t('reports.minimumSpend')}: ${formatRoundedMoney(card.minMonthlyActual)}`,
  ].join('\n')
  const trendHint = [
    `${t('reports.trendAmount')}: ${formatSignedRoundedMoney(card.trend.amount)}`,
    `${t('reports.trendPercent')}: ${trendPercent}`,
  ].join('\n')

  return (
    <article
      data-testid={`category-card-${card.row.category_id}`}
      className="min-w-0 rounded-xl border border-border bg-card p-4 shadow-sm"
    >
      <div className="flex min-w-0 items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <CategoryIcon
            icon={card.row.category_icon}
            color={card.row.category_color}
            size="md"
          />
          <div className="min-w-0">
            <h3 className="truncate text-sm font-semibold text-foreground">
              {card.row.category_name}
            </h3>
            {card.row.group_name && (
              <p className="truncate text-xs text-muted-foreground">{card.row.group_name}</p>
            )}
          </div>
        </div>
      </div>

      <dl className="mt-4 grid grid-cols-3 gap-2">
        <Metric label={t('reports.averagePerMonth')} value={formatRoundedMoney(card.averageMonthly)} />
        <Metric
          label={t('reports.standardDeviation')}
          value={formatRoundedMoney(card.standardDeviation)}
          hint={standardDeviationHint}
        />
        <Metric
          label={t('reports.trendMetric')}
          value={trendValue}
          icon={<TrendIcon className="h-3.5 w-3.5 shrink-0" />}
          hint={trendHint}
          valueClassName={trendColor}
        />
      </dl>

      <div className="mt-4 overflow-x-auto pb-1">
        <div
          className="grid min-w-full items-end gap-1"
          style={{
            gridTemplateColumns: `repeat(${card.values.length}, minmax(1.55rem, 1fr))`,
            minWidth: `${Math.max(card.values.length * 28, 260)}px`,
          }}
        >
          {card.values.map((value) => (
            <MonthBar
              key={value.period.key}
              card={card}
              value={value}
              showVariance={showVariance}
              onDrillDown={onDrillDown}
              formatMoney={formatMoney}
              locale={locale}
              t={t}
            />
          ))}
        </div>
      </div>
    </article>
  )
}

function Metric({
  label,
  value,
  icon,
  hint,
  valueClassName,
}: {
  label: string
  value: string
  icon?: ReactNode
  hint?: string
  valueClassName?: string
}) {
  return (
    <div
      className="min-w-0 rounded-lg border border-border bg-background px-2.5 py-2"
      title={hint}
    >
      <dt className="flex min-w-0 items-center gap-1 text-[11px] font-medium text-muted-foreground">
        <span className="min-w-0 truncate">{label}</span>
        {hint && (
          <span
            aria-label={label}
            title={hint}
            tabIndex={0}
            className="inline-flex shrink-0 cursor-help text-muted-foreground"
          >
            <HelpCircle className="h-3 w-3" aria-hidden="true" />
          </span>
        )}
      </dt>
      <dd className={cn('mt-1 flex min-w-0 items-center gap-1 text-sm font-semibold tabular-nums text-foreground', valueClassName)}>
        {icon}
        <span className="min-w-0 truncate">{value}</span>
      </dd>
    </div>
  )
}

function MonthBar({
  card,
  value,
  showVariance,
  onDrillDown,
  formatMoney,
  locale,
  t,
}: {
  card: CategoryCardSummary
  value: CategoryMonthlyValue
  showVariance: boolean
  onDrillDown: (filter: DrillDownFilter) => void
  formatMoney: (value: number) => string
  locale: string
  t: TFunction
}) {
  const model = budgetBarModel(value, card.maxActualOrBudget, showVariance)
  const actualColor = model.status === 'over'
    ? undefined
    : card.row.category_color || 'var(--primary)'
  const tooltip = [
    value.period.label,
    `${t('reports.actual')}: ${formatMoney(value.actualAmount)}`,
    value.budgetAmount == null ? null : `${t('reports.budget')}: ${formatMoney(value.budgetAmount)}`,
    value.varianceAmount == null ? null : `${t('reports.budgetVariance')}: ${formatMoney(Math.abs(value.varianceAmount))}`,
  ].filter((line): line is string => Boolean(line)).join('\n')

  const openDrillDown = () => {
    onDrillDown({
      title: t('reports.drillDownCategory', {
        category: card.row.category_name,
        month: value.period.label,
      }),
      category_id: card.row.category_id,
      type: 'debit',
      from: value.period.start,
      to: inclusivePeriodEnd(value.period.end),
    })
  }

  return (
    <button
      type="button"
      data-testid={`month-bar-${card.row.category_id}-${value.period.key}`}
      data-budget-layer={model.budgetLayer ?? 'none'}
      data-actual-layer={model.actualLayer}
      data-budget-status={model.status}
      title={tooltip}
      aria-label={`${card.row.category_name} ${value.period.label}`}
      onClick={openDrillDown}
      className="flex h-36 min-w-0 flex-col items-center justify-end rounded-lg px-0.5 py-1 transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
    >
      <span className="relative flex h-24 w-full items-end justify-center border-b border-border/70">
        {model.budgetLayer === 'back' && (
          <BudgetBar categoryId={card.row.category_id} value={value} model={model} layer="back" />
        )}
        {model.actualLayer === 'back' && (
          <ActualBar categoryId={card.row.category_id} value={value} model={model} color={actualColor} layer="back" />
        )}
        {model.budgetLayer === 'front' && (
          <BudgetBar categoryId={card.row.category_id} value={value} model={model} layer="front" />
        )}
        {model.actualLayer === 'front' && (
          <ActualBar categoryId={card.row.category_id} value={value} model={model} color={actualColor} layer="front" />
        )}
      </span>
      <StatusMarker status={model.status} />
      <span className="mt-1 block w-full truncate text-center text-[10px] text-muted-foreground">
        {compactPeriodLabel(value.period, locale)}
      </span>
    </button>
  )
}

function ActualBar({
  categoryId,
  value,
  model,
  color,
  layer,
}: {
  categoryId: string
  value: CategoryMonthlyValue
  model: ReturnType<typeof budgetBarModel>
  color: string | undefined
  layer: 'front' | 'back'
}) {
  return (
    <span
      data-testid={`actual-bar-${categoryId}-${value.period.key}`}
      data-layer={layer}
      className={cn(
        'absolute bottom-0 rounded-t-md',
        layer === 'back' ? 'z-0 w-[72%]' : 'z-10 w-[72%]',
        model.status === 'over' ? 'bg-rose-500/75' : 'bg-primary/75',
      )}
      style={{
        height: `${model.actualHeight}%`,
        backgroundColor: color,
      }}
    />
  )
}

function BudgetBar({
  categoryId,
  value,
  model,
  layer,
}: {
  categoryId: string
  value: CategoryMonthlyValue
  model: ReturnType<typeof budgetBarModel>
  layer: 'front' | 'back'
}) {
  return (
    <span
      data-testid={`budget-bar-${categoryId}-${value.period.key}`}
      data-layer={layer}
      className={cn(
        'absolute bottom-0 rounded-t-sm border',
        layer === 'back'
          ? 'z-0 w-[46%] border-primary/25 bg-primary/10'
          : 'z-20 w-[46%] border-primary/50 bg-card',
      )}
      style={{ height: `${model.budgetHeight ?? 0}%` }}
    />
  )
}

function StatusMarker({ status }: { status: ReturnType<typeof budgetBarModel>['status'] }) {
  if (status === 'no_budget') {
    return <span className="mt-1 h-1 w-3 rounded-full bg-muted-foreground/30" />
  }

  return (
    <span
      className={cn(
        'mt-1 h-1.5 w-1.5 rounded-full',
        status === 'over'
          ? 'bg-rose-500'
          : status === 'under'
            ? 'bg-emerald-500'
            : 'bg-primary',
      )}
    />
  )
}

function compactPeriodLabel(period: CategoryMonthlyValue['period'], locale: string): string {
  const date = new Date(`${period.start}T00:00:00Z`)
  if (!Number.isNaN(date.getTime())) {
    return new Intl.DateTimeFormat(locale, {
      month: 'short',
      timeZone: 'UTC',
    }).format(date)
  }

  return period.label
    .replace(/\s+\d{4}$/u, '')
    .replace(/^January$/u, 'Jan')
    .replace(/^February$/u, 'Feb')
    .replace(/^March$/u, 'Mar')
    .replace(/^April$/u, 'Apr')
    .replace(/^June$/u, 'Jun')
    .replace(/^July$/u, 'Jul')
    .replace(/^August$/u, 'Aug')
    .replace(/^September$/u, 'Sep')
    .replace(/^October$/u, 'Oct')
    .replace(/^November$/u, 'Nov')
    .replace(/^December$/u, 'Dec')
    .replace(/^(\d{4})-(\d{2})$/u, '$2')
}

function formatPercent(value: number): string {
  const rounded = Math.round(value)
  const sign = rounded > 0 ? '+' : ''
  return `${sign}${rounded}%`
}
