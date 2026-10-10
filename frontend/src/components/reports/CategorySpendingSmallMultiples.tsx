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
  signedAxisTicks,
  sortCategoryCards,
  type CategoryCardSummary,
  type CategoryMonthlyValue,
  type CategorySpendingPreset,
  zeroLinePercent,
} from '@/lib/category-spending-small-multiples'
import { cn } from '@/lib/utils'
import type { CategorySpendingMatrixResponse } from '@/types'

// Plot geometry shared by the bars (MonthBar) and the gridlines/axis labels.
// Plot box is `py-1` below the button top; 1px is the baseline border.
const PLOT_TOP = '0.25rem'
const PLOT_HEIGHT = '6rem'
const PLOT_INNER_HEIGHT = `(${PLOT_HEIGHT} - 1px)`

// Bar column sizing: 12 months fit a card without a scrollbar once the card is
// at least 26rem wide. The grid adds columns only while cards keep that width,
// so wide screens get more cards and narrow ones get fewer. (Class names stay
// literal so Tailwind can see them.)
const BAR_COLUMN_MIN = '1.35rem'
const BAR_COLUMN_PX = 26
const CARD_GRID_CLASS = 'grid gap-4 grid-cols-[repeat(auto-fill,minmax(min(100%,26rem),1fr))]'

const tickTop = (percent: number) =>
  `calc(${PLOT_TOP} + ${PLOT_HEIGHT} - 1px - ${percent / 100} * ${PLOT_INNER_HEIGHT})`

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
    () => data?.rows.map((row) => categoryCardSummary(
      row.category_id === 'uncategorized'
        ? { ...row, category_name: t('reports.uncategorized') }
        : row,
      data.periods,
    )) ?? [],
    [data, t],
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

  const axisFormatter = useMemo(
    () => new Intl.NumberFormat(locale, { notation: 'compact', maximumFractionDigits: 1 }),
    [locale],
  )
  const formatAxisMoney = (value: number) => mask(axisFormatter.format(value))

  const setPresetAndClearSelection =(nextPreset: CategorySpendingPreset) => {
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
    // data-wide-content lets the app layout widen its page container for this view.
    <div data-wide-content className="space-y-4">
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
        <div className={CARD_GRID_CLASS}>
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
        <div className={CARD_GRID_CLASS}>
          {visibleCards.map((card) => (
            <CategoryCard
              key={card.row.category_id}
              card={card}
              showVariance={showVariance}
              onDrillDown={onDrillDown}
              formatMoney={formatMoney}
              formatRoundedMoney={formatRoundedMoney}
              formatSignedRoundedMoney={formatSignedRoundedMoney}
              formatAxisMoney={formatAxisMoney}
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
  formatAxisMoney,
  locale,
  t,
}: {
  card: CategoryCardSummary
  showVariance: boolean
  onDrillDown: (filter: DrillDownFilter) => void
  formatMoney: (value: number) => string
  formatRoundedMoney: (value: number) => string
  formatSignedRoundedMoney: (value: number) => string
  formatAxisMoney: (value: number) => string
  locale: string
  t: TFunction
}) {
  const hasSpend = card.maxMonthlyActual > 0 || card.negativeMax > 0
  const ticks = useMemo(
    () => (hasSpend ? signedAxisTicks(card.maxActualOrBudget, card.negativeMax) : []),
    [hasSpend, card.maxActualOrBudget, card.negativeMax],
  )
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

      <div className="mt-4 flex pb-1">
        <div className="relative w-9 shrink-0" aria-hidden="true">
          {ticks.map((tick) => (
            <span
              key={tick.value}
              data-testid={`axis-label-${card.row.category_id}-${tick.value}`}
              className="absolute right-1 translate-y-1/2 text-[10px] leading-none tabular-nums text-muted-foreground"
              style={{ top: tickTop(tick.percent) }}
            >
              {formatAxisMoney(tick.value)}
            </span>
          ))}
        </div>
        <div className="relative min-w-0 flex-1 overflow-x-auto">
          <div
            className="relative"
            style={{ minWidth: `${Math.max(card.values.length * BAR_COLUMN_PX, 224)}px` }}
          >
            {ticks.map((tick) => (
              <span
                key={tick.value}
                aria-hidden="true"
                className="pointer-events-none absolute inset-x-0 border-t border-dashed border-border/60"
                style={{ top: tickTop(tick.percent) }}
              />
            ))}
            <div
              className="relative grid items-end gap-1"
              style={{
                gridTemplateColumns: `repeat(${card.values.length}, minmax(${BAR_COLUMN_MIN}, 1fr))`,
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
  const model = budgetBarModel(value, card.maxActualOrBudget, showVariance, card.negativeMax)
  const zeroPercent = zeroLinePercent(card.maxActualOrBudget, card.negativeMax)
  const netIncome = value.actualAmount < 0
  const actualColor = model.status === 'over'
    ? undefined
    : card.row.category_color || 'var(--primary)'
  const tooltip = [
    value.period.label,
    `${t('reports.actual')}: ${formatMoney(value.actualAmount)}`,
    netIncome ? `${t('reports.netIncome')}: ${formatMoney(Math.abs(value.actualAmount))}` : null,
    value.budgetAmount == null ? null : `${t('reports.budget')}: ${formatMoney(value.budgetAmount)}`,
    value.varianceAmount == null ? null : `${t('reports.budgetVariance')}: ${formatMoney(Math.abs(value.varianceAmount))}`,
  ].filter((line): line is string => Boolean(line)).join('\n')

  const openDrillDown = () => {
    onDrillDown({
      title: t('reports.drillDownCategory', {
        category: card.row.category_name,
        month: value.period.label,
      }),
      ...(card.row.category_id === 'uncategorized'
        ? { uncategorized: true }
        : { category_id: card.row.category_id }),
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
      className="flex min-w-0 flex-col items-center rounded-lg px-0.5 py-1 transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
    >
      <span className="relative block h-24 w-full">
        <span className="absolute inset-x-0 bottom-px top-0">
          <span
            aria-hidden="true"
            className="absolute inset-x-0 h-px bg-border/70"
            style={{ bottom: `calc(${zeroPercent}% - 1px)` }}
          />
          {model.budgetLayer === 'back' && (
            <BudgetBar categoryId={card.row.category_id} value={value} model={model} zeroPercent={zeroPercent} layer="back" />
          )}
          {model.actualLayer === 'back' && (
            <ActualBar categoryId={card.row.category_id} value={value} model={model} zeroPercent={zeroPercent} color={actualColor} layer="back" />
          )}
          {model.budgetLayer === 'front' && (
            <BudgetBar categoryId={card.row.category_id} value={value} model={model} zeroPercent={zeroPercent} layer="front" />
          )}
          {model.actualLayer === 'front' && (
            <ActualBar categoryId={card.row.category_id} value={value} model={model} zeroPercent={zeroPercent} color={actualColor} layer="front" />
          )}
        </span>
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
  zeroPercent,
  color,
  layer,
}: {
  categoryId: string
  value: CategoryMonthlyValue
  model: ReturnType<typeof budgetBarModel>
  zeroPercent: number
  color: string | undefined
  layer: 'front' | 'back'
}) {
  // Net-income month: income exceeded spending, drawn below the zero line.
  if (value.actualAmount < 0) {
    return (
      <span
        data-testid={`actual-bar-${categoryId}-${value.period.key}`}
        data-layer={layer}
        data-direction="negative"
        className="absolute left-1/2 z-10 w-[72%] -translate-x-1/2 rounded-b-md bg-emerald-500/75"
        style={{ top: `${100 - zeroPercent}%`, height: `${model.negativeHeight}%` }}
      />
    )
  }

  return (
    <span
      data-testid={`actual-bar-${categoryId}-${value.period.key}`}
      data-layer={layer}
      className={cn(
        'absolute left-1/2 -translate-x-1/2 rounded-t-md',
        layer === 'back' ? 'z-0 w-[72%]' : 'z-10 w-[72%]',
        model.status === 'over' ? 'bg-rose-500/75' : 'bg-primary/75',
      )}
      style={{
        bottom: `${zeroPercent}%`,
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
  zeroPercent,
  layer,
}: {
  categoryId: string
  value: CategoryMonthlyValue
  model: ReturnType<typeof budgetBarModel>
  zeroPercent: number
  layer: 'front' | 'back'
}) {
  return (
    <span
      data-testid={`budget-bar-${categoryId}-${value.period.key}`}
      data-layer={layer}
      className={cn(
        'absolute left-1/2 -translate-x-1/2 rounded-t-sm border',
        layer === 'back'
          ? 'z-0 w-[46%] border-primary/25 bg-primary/10'
          : 'z-20 w-[46%] border-primary/50 bg-card',
      )}
      style={{ bottom: `${zeroPercent}%`, height: `${model.budgetHeight ?? 0}%` }}
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
