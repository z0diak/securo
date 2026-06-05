import { Fragment, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useDisplayLocale } from '@/hooks/use-display-locale'
import { useQuery } from '@tanstack/react-query'
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  ComposedChart,
  Line,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  ReferenceLine,
  ResponsiveContainer,
} from 'recharts'
import { ArrowDown, ArrowUp, HelpCircle, Minus } from 'lucide-react'
import { reports } from '@/lib/api'
import { Skeleton } from '@/components/ui/skeleton'
import { PageHeader } from '@/components/page-header'
import { usePrivacyMode } from '@/hooks/use-privacy-mode'
import { useAuth } from '@/contexts/auth-context'
import { CategoryIcon } from '@/components/category-icon'
import { TransactionDrillDown, type DrillDownFilter } from '@/components/transaction-drill-down'
import type { CategorySpendingMatrixResponse, CategorySpendingRow, CategoryTrendItem, ReportResponse } from '@/types'

function formatCurrency(value: number, currency = 'USD', locale = 'en-US') {
  return new Intl.NumberFormat(locale, { style: 'currency', currency }).format(value)
}

function formatCompact(value: number, currency = 'USD', locale = 'en-US') {
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    notation: 'compact',
    maximumFractionDigits: 1,
  }).format(value)
}

const COMPOSITION_TOP_N = 6

type RangeOption = { key: string; months: number; period?: 'ytd' }

const HISTORICAL_RANGE_OPTIONS: readonly RangeOption[] = [
  { key: '6m', months: 6 },
  { key: 'ytd', months: 12, period: 'ytd' },
  { key: '1y', months: 12 },
  { key: '2y', months: 24 },
]

const FORWARD_RANGE_OPTIONS: readonly RangeOption[] = [
  { key: '3m', months: 3 },
  { key: '6m', months: 6 },
  { key: '12m', months: 12 },
]

const HISTORICAL_INTERVAL_OPTIONS = [
  { key: 'daily', value: 'daily' },
  { key: 'weekly', value: 'weekly' },
  { key: 'monthly', value: 'monthly' },
  { key: 'yearly', value: 'yearly' },
] as const

const CASH_FLOW_INTERVAL_OPTIONS = [
  { key: 'daily', value: 'daily' },
  { key: 'weekly', value: 'weekly' },
  { key: 'monthly', value: 'monthly' },
] as const

const INTERVAL_LABELS: Record<string, string> = {
  daily: 'intervalDaily',
  weekly: 'intervalWeekly',
  monthly: 'intervalMonthly',
  yearly: 'intervalYearly',
}

const RANGE_LABELS: Record<string, string> = {
  '3m': 'range3m',
  '6m': 'range6m',
  '1y': 'range1y',
  ytd: 'rangeYtd',
  '12m': 'range12m',
  '2y': 'range2y',
}

interface ReportTab {
  key: string
  labelKey: string
  fetch?: (months: number, interval: string, period?: 'ytd') => Promise<ReportResponse>
  enabled: boolean
}

const REPORT_TABS: ReportTab[] = [
  { key: 'net_worth', labelKey: 'reports.netWorth', fetch: (m, i, p) => reports.netWorth(m, i, p), enabled: true },
  { key: 'income_expenses', labelKey: 'reports.incomeExpenses', fetch: (m, i, p) => reports.incomeExpenses(m, i, p), enabled: true },
  { key: 'category_spending', labelKey: 'reports.categorySpending', enabled: true },
  { key: 'cash_flow', labelKey: 'reports.cashFlow', fetch: (m, i) => reports.cashFlow(m, i), enabled: true },
]

export default function ReportsPage() {
  const { t } = useTranslation()
  const { mask, privacyMode, MASK } = usePrivacyMode()
  const { user } = useAuth()
  const userCurrency = user?.preferences?.currency_display ?? 'USD'
  const locale = useDisplayLocale()

  const [rangeKey, setRangeKey] = useState('1y')
  const [interval, setInterval] = useState('monthly')
  const [activeTab, setActiveTab] = useState('net_worth')
  const [compositionView, setCompositionView] = useState<string>('summary')
  const [sparklineView, setSparklineView] = useState<'byExpenses' | 'byIncome'>('byExpenses')
  const [sparklinePage, setSparklinePage] = useState(0)
  const [cashFlowBaseline, setCashFlowBaseline] = useState(false)
  const [showVariance, setShowVariance] = useState(true)
  const [drillDown, setDrillDown] = useState<DrillDownFilter | null>(null)

  const currentTab = REPORT_TABS.find((tab) => tab.key === activeTab) ?? REPORT_TABS[0]

  const isCashFlow = activeTab === 'cash_flow'
  const isCategorySpending = activeTab === 'category_spending'
  const rangeOptions = isCashFlow ? FORWARD_RANGE_OPTIONS : HISTORICAL_RANGE_OPTIONS
  const intervalOptions = isCashFlow
    ? CASH_FLOW_INTERVAL_OPTIONS
    : isCategorySpending
      ? [{ key: 'monthly', value: 'monthly' }] as const
      : HISTORICAL_INTERVAL_OPTIONS
  const selectedRange = rangeOptions.find((r) => r.key === rangeKey) ?? rangeOptions[0]
  const months = selectedRange.months
  const period = selectedRange.period

  const handleSelectTab = (key: string) => {
    setActiveTab(key)
    setCompositionView('summary')
    setSparklinePage(0)
    // Clamp months/interval to options supported by the new tab
    const nextRanges = key === 'cash_flow' ? FORWARD_RANGE_OPTIONS : HISTORICAL_RANGE_OPTIONS
    if (!nextRanges.some((r) => r.key === rangeKey)) {
      setRangeKey(key === 'cash_flow' ? '6m' : '1y')
    }
    const nextIntervals = key === 'cash_flow' ? CASH_FLOW_INTERVAL_OPTIONS : HISTORICAL_INTERVAL_OPTIONS
    if (!nextIntervals.some((i) => i.value === interval)) {
      setInterval(key === 'cash_flow' ? 'daily' : 'monthly')
    }
    if (key === 'category_spending') setInterval('monthly')
  }

  const { data, isLoading } = useQuery<ReportResponse>({
    queryKey: ['reports', activeTab, rangeKey, months, period ?? null, interval, isCashFlow ? cashFlowBaseline : false],
    queryFn: () =>
      isCashFlow
        ? reports.cashFlow(months, interval, cashFlowBaseline)
        : currentTab.fetch!(months, interval, period),
    enabled: currentTab.enabled && !isCategorySpending,
  })

  const { data: categoryData, isLoading: categoryLoading } = useQuery<CategorySpendingMatrixResponse>({
    queryKey: ['reports', 'category-spending', rangeKey, months, period ?? null],
    queryFn: () => reports.categorySpending(months, 'monthly', period),
    enabled: isCategorySpending,
  })

  const summary = data?.summary
  const trend = data?.trend ?? []
  const meta = data?.meta

  // For cash flow we split the line at `forecast_start_date` so the past
  // section renders solid and the forward projection renders dashed.
  // The boundary point is duplicated in both series so the line visually
  // connects without a gap.
  const forecastStart = meta?.forecast_start_date ?? null
  const chartData = trend.map((dp) => {
    const isPast = forecastStart ? dp.date < forecastStart : false
    const isBoundary = forecastStart ? dp.date === forecastStart : false
    return {
      date: dp.date,
      value: dp.value,
      valuePast: isPast || isBoundary ? dp.value : null,
      valueForecast: !isPast ? dp.value : null,
      ...dp.breakdowns,
    } as Record<string, string | number | null>
  })

  const allBreakdowns = summary?.breakdowns ?? []
  const breakdownData = allBreakdowns.filter((b) => b.value > 0)

  const colorMap: Record<string, string> = {}
  for (const b of allBreakdowns) {
    colorMap[b.key] = b.color
  }

  const changePrefix = (summary?.change_amount ?? 0) >= 0 ? '+' : ''
  const changeColor = (summary?.change_amount ?? 0) >= 0 ? 'text-emerald-600' : 'text-rose-500'

  const tooltipStyle = {
    background: 'var(--card)',
    color: 'var(--foreground)',
    border: '1px solid var(--border)',
    borderRadius: '0.75rem',
    boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
    fontSize: '12px',
  }

  const tooltipItemStyle = { color: 'var(--foreground)' }

  // Composition view options per report type
  const compositionOptions = meta?.type === 'income_expenses' || meta?.type === 'cash_flow'
    ? ['summary', 'byIncome', 'byExpenses'] as const
    : ['summary', 'detailed'] as const

  // Build donut data based on composition view
  const composition = data?.composition ?? []

  const donutData = (() => {
    if (compositionView === 'summary' || composition.length === 0) {
      const excludedKeys = new Set(['netIncome', 'startingBalance', 'endingBalance'])
      return breakdownData
        .filter((b) => b.value > 0 && !excludedKeys.has(b.key))
        .map((b) => ({
          name: t(`reports.${b.key}`, { defaultValue: b.label }),
          value: b.value,
          color: b.color,
        }))
    }

    let items = composition
    if (compositionView === 'byIncome') {
      items = composition.filter((c) => c.group === 'income')
    } else if (compositionView === 'byExpenses') {
      items = composition.filter((c) => c.group === 'expenses')
    }

    // Sort descending, take top N, bucket the rest into "Other"
    const sorted = [...items].sort((a, b) => b.value - a.value)
    const top = sorted.slice(0, COMPOSITION_TOP_N)
    const rest = sorted.slice(COMPOSITION_TOP_N)
    const otherValue = rest.reduce((sum, c) => sum + c.value, 0)

    const result = top.map((c) => {
      let name = c.label
      if (c.key === 'uncategorized') name = t('reports.uncategorized')
      else if (c.key === 'baseline') name = t('reports.baseline')
      return { name, value: c.value, color: c.color }
    })
    if (otherValue > 0) {
      result.push({ name: t('reports.other'), value: Math.round(otherValue * 100) / 100, color: '#6B7280' })
    }
    return result
  })()

  return (
    <div>
      <PageHeader
        section={t('reports.section')}
        title={t(currentTab.labelKey)}
        action={
          <div className="flex items-center gap-2">
            {isCashFlow && (
              <div
                className={`flex items-center gap-2 rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors ${
                  cashFlowBaseline
                    ? 'border-primary/40 bg-primary/10 text-primary'
                    : 'border-border bg-card text-muted-foreground'
                }`}
              >
                <button
                  type="button"
                  onClick={() => setCashFlowBaseline((v) => !v)}
                  className="flex items-center gap-2 hover:text-foreground transition-colors"
                  aria-pressed={cashFlowBaseline}
                >
                  <span
                    className={`relative inline-flex h-3.5 w-6 shrink-0 items-center rounded-full transition-colors ${
                      cashFlowBaseline ? 'bg-primary' : 'bg-muted'
                    }`}
                  >
                    <span
                      className={`inline-block h-2.5 w-2.5 transform rounded-full bg-white transition-transform ${
                        cashFlowBaseline ? 'translate-x-3' : 'translate-x-0.5'
                      }`}
                    />
                  </span>
                  {t('reports.includeEstimate')}
                </button>
                <span
                  title={t('reports.includeEstimateHelp')}
                  aria-label={t('reports.includeEstimateHelp')}
                  className="inline-flex cursor-help"
                >
                  <HelpCircle className="h-3.5 w-3.5 opacity-60" />
                </span>
              </div>
            )}
            <div className="flex items-center rounded-lg border border-border bg-card overflow-hidden">
              {rangeOptions.map((opt) => (
                <button
                  key={opt.key}
                  onClick={() => setRangeKey(opt.key)}
                  className={`px-3 py-1.5 text-xs font-semibold transition-colors ${
                    rangeKey === opt.key
                      ? 'bg-primary text-primary-foreground'
                      : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
                  }`}
                >
                  {t(`reports.${RANGE_LABELS[opt.key]}`)}
                </button>
              ))}
            </div>
            <div className="flex items-center rounded-lg border border-border bg-card overflow-hidden">
              {intervalOptions.map((opt) => (
                <button
                  key={opt.key}
                  onClick={() => setInterval(opt.value)}
                  className={`px-2.5 py-1.5 text-xs font-semibold transition-colors ${
                    interval === opt.value
                      ? 'bg-primary text-primary-foreground'
                      : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
                  }`}
                >
                  {t(`reports.${INTERVAL_LABELS[opt.key]}`)}
                </button>
              ))}
            </div>
          </div>
        }
      />

      {/* Tab Bar */}
      <div className="flex items-center gap-1 mb-5 border-b border-border">
        {REPORT_TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => { if (tab.enabled) handleSelectTab(tab.key) }}
            disabled={!tab.enabled}
            className={`relative px-4 py-2.5 text-sm font-medium transition-colors ${
              activeTab === tab.key
                ? 'text-foreground'
                : tab.enabled
                  ? 'text-muted-foreground hover:text-foreground'
                  : 'text-muted-foreground/50 cursor-not-allowed'
            }`}
          >
            {t(tab.labelKey)}
            {!tab.enabled && (
              <span className="ml-1.5 text-[10px] text-muted-foreground/50">
                {t('reports.comingSoon')}
              </span>
            )}
            {activeTab === tab.key && (
              <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary rounded-full" />
            )}
          </button>
        ))}
      </div>

      {isCategorySpending ? (
        <CategorySpendingReport
          data={categoryData}
          isLoading={categoryLoading}
          showVariance={showVariance}
          onShowVarianceChange={setShowVariance}
          onDrillDown={setDrillDown}
          formatCurrency={(value, currency = userCurrency) => formatCurrency(value, currency, locale)}
          mask={mask}
          t={t}
        />
      ) : (
      <>
      {/* Hero Card */}
      <div className="bg-card rounded-xl border border-border shadow-sm mb-5">
        <div className="px-5 py-4">
          {isLoading ? (
            <div className="flex items-center gap-8">
              <Skeleton className="h-16 w-48" />
              <div className="flex gap-6">
                <Skeleton className="h-12 w-28" />
                <Skeleton className="h-12 w-28" />
                <Skeleton className="h-12 w-28" />
              </div>
            </div>
          ) : (
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-0.5 uppercase tracking-wider">
                  {t(currentTab.labelKey)}
                </p>
                <div className="flex items-baseline gap-3">
                  <p className="text-3xl font-bold tabular-nums text-foreground">
                    {mask(formatCurrency(summary?.primary_value ?? 0, userCurrency, locale))}
                  </p>
                  {summary?.change_percent !== null && summary?.change_percent !== undefined && (
                    <span className={`text-sm font-semibold tabular-nums ${changeColor}`}>
                      {changePrefix}{summary.change_percent.toFixed(1)}%
                    </span>
                  )}
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {mask(`${changePrefix}${formatCurrency(summary?.change_amount ?? 0, userCurrency, locale)}`)}
                  {' '}{t(meta?.type === 'cash_flow' ? 'reports.vsToday' : 'reports.vsStart')}
                </p>
              </div>
              <div className="flex flex-wrap gap-6">
                {breakdownData.map((b) => (
                  <div key={b.key} className="min-w-0">
                    <div className="flex items-center gap-1.5 mb-0.5">
                      <div
                        className="w-2.5 h-2.5 rounded-full shrink-0"
                        style={{ backgroundColor: b.color }}
                      />
                      <p className="text-xs font-medium text-muted-foreground">
                        {t(`reports.${b.key}`, { defaultValue: b.label })}
                      </p>
                    </div>
                    <p className="text-lg font-bold tabular-nums text-foreground">
                      {mask(formatCurrency(b.value, userCurrency, locale))}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Main Trend Chart */}
      <div className="bg-card rounded-xl border border-border shadow-sm mb-5">
        <div className="px-5 pt-5 pb-2 flex items-center justify-between">
          <p className="text-sm font-semibold text-foreground">
            {t(currentTab.labelKey)} · {t('reports.trend')}
          </p>
          {meta && (
            <div className="flex items-center gap-3">
              {meta.series_keys.map((key) => (
                <div key={key} className="flex items-center gap-1.5">
                  <div
                    className="w-2 h-2 rounded-full"
                    style={{ backgroundColor: colorMap[key] || '#6366F1' }}
                  />
                  <span className="text-[11px] text-muted-foreground">
                    {t(`reports.${key}`, { defaultValue: key })}
                  </span>
                </div>
              ))}
              {meta.type === 'income_expenses' && (
                <div className="flex items-center gap-1.5">
                  <div className="w-3 h-0 border-t-2 border-dashed" style={{ borderColor: '#6366F1' }} />
                  <span className="text-[11px] text-muted-foreground">
                    {t('reports.netIncome')}
                  </span>
                </div>
              )}
              {meta.type === 'cash_flow' && (
                <div className="flex items-center gap-1.5">
                  <div className="w-3 h-0 border-t-2 border-dashed" style={{ borderColor: '#6366F1' }} />
                  <span className="text-[11px] text-muted-foreground">
                    {meta.baseline_active ? t('reports.forecastBaseline') : t('reports.forecast')}
                  </span>
                </div>
              )}
            </div>
          )}
        </div>
        <div className="px-1 pb-4" style={{ height: 320 }}>
          {isLoading ? (
            <div className="px-4">
              <Skeleton className="h-full w-full" />
            </div>
          ) : chartData.length > 0 ? (
            meta?.type === 'cash_flow' ? (() => {
              const startingBalance = summary?.breakdowns.find((b) => b.key === 'startingBalance')?.value ?? 0
              return (
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={chartData} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
                    <defs>
                      <linearGradient id="cashFlowGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#6366F1" stopOpacity={0.2} />
                        <stop offset="95%" stopColor="#6366F1" stopOpacity={0.02} />
                      </linearGradient>
                    </defs>
                    <XAxis
                      dataKey="date"
                      tick={{ fontSize: 10, fill: 'var(--muted-foreground)' }}
                      axisLine={false}
                      tickLine={false}
                      interval="preserveStartEnd"
                    />
                    <YAxis
                      tickFormatter={(v) => {
                        if (privacyMode) return ''
                        if (v === 0) return '0'
                        return formatCompact(v, userCurrency, locale)
                      }}
                      tick={{ fontSize: 10, fill: 'var(--muted-foreground)' }}
                      axisLine={false}
                      tickLine={false}
                      width={64}
                      tickCount={5}
                    />
                    <Tooltip
                      content={({ active, payload, label }) => {
                        if (!active || !payload || payload.length === 0) return null
                        const point = payload[0].payload as Record<string, number>
                        const balance = point.value ?? 0
                        const inflow = point.inflow ?? 0
                        const outflow = point.outflow ?? 0
                        return (
                          <div style={tooltipStyle} className="px-3 py-2">
                            <p className="text-xs font-medium mb-1">{label}</p>
                            <p className="text-xs" style={{ color: '#6366F1' }}>
                              {t('reports.balance', { defaultValue: 'Balance' })}:{' '}
                              {privacyMode ? MASK : formatCurrency(balance, userCurrency, locale)}
                            </p>
                            {inflow > 0 && (
                              <p className="text-xs" style={{ color: '#10B981' }}>
                                {t('reports.inflow')}:{' '}
                                {privacyMode ? MASK : `+${formatCurrency(inflow, userCurrency, locale)}`}
                              </p>
                            )}
                            {outflow > 0 && (
                              <p className="text-xs" style={{ color: '#F43F5E' }}>
                                {t('reports.outflow')}:{' '}
                                {privacyMode ? MASK : `-${formatCurrency(outflow, userCurrency, locale)}`}
                              </p>
                            )}
                          </div>
                        )
                      }}
                    />
                    <ReferenceLine
                      y={startingBalance}
                      stroke="var(--muted-foreground)"
                      strokeDasharray="4 4"
                      strokeOpacity={0.5}
                    />
                    {forecastStart && (
                      <ReferenceLine
                        x={forecastStart}
                        stroke="var(--muted-foreground)"
                        strokeDasharray="3 3"
                        strokeOpacity={0.6}
                        label={{
                          value: t('reports.today'),
                          position: 'insideTopRight',
                          fill: 'var(--muted-foreground)',
                          fontSize: 10,
                        }}
                      />
                    )}
                    <Area
                      type="monotone"
                      dataKey="valuePast"
                      stroke="#6366F1"
                      strokeWidth={2.5}
                      fill="url(#cashFlowGrad)"
                      dot={false}
                      activeDot={{ r: 4, fill: '#6366F1' }}
                      isAnimationActive={false}
                      connectNulls={false}
                    />
                    <Area
                      type="monotone"
                      dataKey="valueForecast"
                      stroke="#6366F1"
                      strokeWidth={2.5}
                      strokeDasharray="6 3"
                      fill="url(#cashFlowGrad)"
                      fillOpacity={0.4}
                      dot={false}
                      activeDot={{ r: 4, fill: '#6366F1' }}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              )
            })() : meta?.type === 'income_expenses' ? (
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={chartData} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 10, fill: 'var(--muted-foreground)' }}
                  axisLine={false}
                  tickLine={false}
                  interval="preserveStartEnd"
                />
                <YAxis
                  tickFormatter={(v) => {
                    if (privacyMode) return ''
                    if (v === 0) return '0'
                    return formatCompact(v, userCurrency, locale)
                  }}
                  tick={{ fontSize: 10, fill: 'var(--muted-foreground)' }}
                  axisLine={false}
                  tickLine={false}
                  width={64}
                  tickCount={5}
                />
                <Tooltip
                  formatter={(value?: number, name?: string) => [
                    privacyMode ? MASK : formatCurrency(value ?? 0, userCurrency, locale),
                    name === 'value'
                      ? t('reports.netIncome')
                      : t(`reports.${name ?? ''}`, { defaultValue: name ?? '' }),
                  ]}
                  labelFormatter={(label) => label}
                  contentStyle={tooltipStyle}
                />
                <ReferenceLine y={0} stroke="var(--border)" strokeDasharray="3 3" />
                <Bar dataKey="income" fill="#10B981" radius={[4, 4, 0, 0]} maxBarSize={24} />
                <Bar dataKey="expenses" fill="#F43F5E" radius={[4, 4, 0, 0]} maxBarSize={24} />
                <Line
                  type="monotone"
                  dataKey="value"
                  stroke="#6366F1"
                  strokeWidth={2}
                  strokeDasharray="6 3"
                  dot={false}
                  activeDot={{ r: 4, fill: '#6366F1' }}
                />
              </ComposedChart>
            </ResponsiveContainer>
            ) : (
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="netWorthGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#6366F1" stopOpacity={0.2} />
                    <stop offset="95%" stopColor="#6366F1" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 10, fill: 'var(--muted-foreground)' }}
                  axisLine={false}
                  tickLine={false}
                  interval="preserveStartEnd"
                />
                <YAxis
                  tickFormatter={(v) => {
                    if (privacyMode) return ''
                    if (v === 0) return '0'
                    return formatCompact(v, userCurrency, locale)
                  }}
                  tick={{ fontSize: 10, fill: 'var(--muted-foreground)' }}
                  axisLine={false}
                  tickLine={false}
                  width={64}
                  tickCount={5}
                />
                <Tooltip
                  formatter={(value?: number, name?: string) => [
                    privacyMode ? MASK : formatCurrency(value ?? 0, userCurrency, locale),
                    name === 'value'
                      ? t(currentTab.labelKey)
                      : t(`reports.${name ?? ''}`, { defaultValue: name ?? '' }),
                  ]}
                  labelFormatter={(label) => label}
                  contentStyle={tooltipStyle}
                />
                <Area
                  type="monotone"
                  dataKey="value"
                  stroke="#6366F1"
                  strokeWidth={2.5}
                  fill="url(#netWorthGrad)"
                  dot={false}
                  activeDot={{ r: 4, fill: '#6366F1' }}
                />
              </AreaChart>
            </ResponsiveContainer>
            )
          ) : (
            <p className="text-muted-foreground text-sm text-center py-16">
              {t('reports.noData')}
            </p>
          )}
        </div>
      </div>

      {/* Breakdown: Donut + Grouped Bar */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Donut Chart — Current Composition */}
        <div className="bg-card rounded-xl border border-border shadow-sm">
          <div className="px-5 pt-4 pb-2 flex items-center justify-between">
            <p className="text-sm font-semibold text-foreground">{t('reports.composition')}</p>
            <div className="flex items-center rounded-lg border border-border bg-muted/30 overflow-hidden">
              {compositionOptions.map((opt) => (
                <button
                  key={opt}
                  onClick={() => setCompositionView(opt)}
                  className={`px-2.5 py-1 text-[11px] font-semibold transition-colors ${
                    compositionView === opt
                      ? 'bg-primary text-primary-foreground'
                      : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
                  }`}
                >
                  {t(`reports.${opt}`)}
                </button>
              ))}
            </div>
          </div>
          <div className="px-1 pb-4">
            {isLoading ? (
              <div className="px-4" style={{ height: 200 }}>
                <Skeleton className="h-full w-full" />
              </div>
            ) : donutData.length > 0 ? (
              (() => {
                const donutTotal = donutData.reduce((s, d) => s + d.value, 0)
                const centerLabel = compositionView === 'byIncome'
                  ? t('reports.income')
                  : compositionView === 'byExpenses'
                    ? t('reports.expenses')
                    : meta?.type === 'income_expenses'
                      ? t('reports.netIncome')
                      : meta?.type === 'cash_flow'
                        ? t('reports.vsToday')
                        : t(currentTab.labelKey)
                const centerValue = compositionView === 'byIncome'
                  ? (summary?.breakdowns.find((b) => b.key === 'income' || b.key === 'projectedIncome')?.value ?? 0)
                  : compositionView === 'byExpenses'
                    ? (summary?.breakdowns.find((b) => b.key === 'expenses' || b.key === 'projectedExpenses')?.value ?? 0)
                    : meta?.type === 'cash_flow'
                      ? (summary?.change_amount ?? 0)
                      : (summary?.primary_value ?? 0)
                return (
                  <div className="flex flex-col items-center">
                    <div className="relative" style={{ width: 200, height: 200 }}>
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie
                            data={donutData}
                            cx="50%"
                            cy="50%"
                            innerRadius={55}
                            outerRadius={85}
                            paddingAngle={3}
                            dataKey="value"
                            strokeWidth={0}
                          >
                            {donutData.map((entry, idx) => (
                              <Cell key={idx} fill={entry.color} />
                            ))}
                          </Pie>
                          <Tooltip
                            formatter={(value?: number, name?: string) => {
                              const v = value ?? 0
                              const pct = donutTotal > 0 ? ((v / donutTotal) * 100).toFixed(1) : '0'
                              return [
                                privacyMode ? MASK : `${formatCurrency(v, userCurrency, locale)} (${pct}%)`,
                                name,
                              ]
                            }}
                            contentStyle={{ ...tooltipStyle, zIndex: 10 }}
                            itemStyle={tooltipItemStyle}
                            wrapperStyle={{ zIndex: 10 }}
                            offset={20}
                          />
                        </PieChart>
                      </ResponsiveContainer>
                      {/* Center label — positioned absolutely over the SVG */}
                      <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none" style={{ zIndex: 0 }}>
                        <span className="text-[10px] text-muted-foreground">{centerLabel}</span>
                        <span className="text-base font-bold text-foreground tabular-nums">
                          {mask(formatCompact(centerValue, userCurrency, locale))}
                        </span>
                      </div>
                    </div>
                    {/* Custom legend */}
                    <div className="flex flex-wrap justify-center gap-x-3 gap-y-1 px-3 mt-1">
                      {donutData.map((d) => (
                        <div key={d.name} className="flex items-center gap-1.5">
                          <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: d.color }} />
                          <span className="text-[11px] text-muted-foreground whitespace-nowrap">
                            {d.name}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )
              })()
            ) : (
              <p className="text-muted-foreground text-sm text-center py-16">
                {t('reports.noData')}
              </p>
            )}
          </div>
        </div>

        {/* Evolution / Category Sparklines */}
        <div className="lg:col-span-2 bg-card rounded-xl border border-border shadow-sm">
          <div className="px-5 pt-5 pb-2 flex items-center justify-between">
            <p className="text-sm font-semibold text-foreground">
              {meta?.type === 'income_expenses'
                ? t('reports.categoryTrends')
                : meta?.type === 'cash_flow'
                  ? t('reports.inflowOutflow')
                  : t('reports.evolution')}
            </p>
            {meta?.type === 'income_expenses' && (() => {
              const groupKey = sparklineView === 'byIncome' ? 'income' : 'expenses'
              const allItems = (data?.category_trend ?? []).filter((c) => c.group === groupKey)
              const totalPages = Math.ceil(allItems.length / 6)
              const hasPagination = totalPages > 1
              return (
                <div className="flex items-center gap-2">
                  {hasPagination && (
                    <div className="flex items-center gap-0.5">
                      <button
                        onClick={() => setSparklinePage((p) => Math.max(0, p - 1))}
                        disabled={sparklinePage === 0}
                        className="p-1 rounded text-muted-foreground hover:text-foreground disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6" /></svg>
                      </button>
                      <button
                        onClick={() => setSparklinePage((p) => Math.min(totalPages - 1, p + 1))}
                        disabled={sparklinePage >= totalPages - 1}
                        className="p-1 rounded text-muted-foreground hover:text-foreground disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6" /></svg>
                      </button>
                    </div>
                  )}
                  <div className="flex items-center rounded-lg border border-border bg-muted/30 overflow-hidden">
                    {(['byExpenses', 'byIncome'] as const).map((opt) => (
                      <button
                        key={opt}
                        onClick={() => { setSparklineView(opt); setSparklinePage(0) }}
                        className={`px-2.5 py-1 text-[11px] font-semibold transition-colors ${
                          sparklineView === opt
                            ? 'bg-primary text-primary-foreground'
                            : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
                        }`}
                      >
                        {t(`reports.${opt}`)}
                      </button>
                    ))}
                  </div>
                </div>
              )
            })()}
          </div>
          {meta?.type === 'income_expenses' ? (
            <div className="pb-4 overflow-hidden">
              {isLoading ? (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 px-4">
                  {Array.from({ length: 6 }).map((_, i) => (
                    <Skeleton key={i} className="h-20 w-full" />
                  ))}
                </div>
              ) : (() => {
                const groupKey = sparklineView === 'byIncome' ? 'income' : 'expenses'
                const allGroupItems: CategoryTrendItem[] = (data?.category_trend ?? []).filter(
                  (c) => c.group === groupKey
                )
                if (allGroupItems.length === 0) {
                  return (
                    <p className="text-muted-foreground text-sm text-center py-16">
                      {t('reports.noData')}
                    </p>
                  )
                }
                const totalPages = Math.ceil(allGroupItems.length / 6)
                const pages = Array.from({ length: totalPages }, (_, i) =>
                  allGroupItems.slice(i * 6, i * 6 + 6)
                )
                return (
                  <div
                    className="flex"
                    style={{
                      transform: `translateX(-${sparklinePage * 100}%)`,
                      transition: 'transform 300ms cubic-bezier(0.4, 0, 0.2, 1)',
                    }}
                  >
                    {pages.map((pageItems, pageIdx) => (
                      <div
                        key={pageIdx}
                        className="grid grid-cols-2 sm:grid-cols-3 gap-3 w-full shrink-0 px-4"
                      >
                        {pageItems.map((item) => {
                          const sparkData = item.series.map((s) => ({ date: s.date, v: s.value }))
                          const gradId = `grad-${item.key}-${item.group}-p${pageIdx}`
                          return (
                            <div
                              key={`${item.key}-${item.group}`}
                              className="rounded-lg border border-border/50 bg-muted/20 px-3 py-2"
                            >
                              <div className="flex items-center gap-1.5 mb-0.5">
                                <div
                                  className="w-2 h-2 rounded-full shrink-0"
                                  style={{ backgroundColor: item.color }}
                                />
                                <span className="text-[11px] text-muted-foreground truncate">
                                  {item.key === 'uncategorized' ? t('reports.uncategorized') : item.key === 'other' ? t('reports.other') : item.label}
                                </span>
                              </div>
                              <p className="text-xs font-bold tabular-nums text-foreground mb-1">
                                {mask(formatCompact(item.total, userCurrency, locale))}
                              </p>
                              <div style={{ height: 48 }}>
                                <ResponsiveContainer width="100%" height="100%">
                                  <AreaChart data={sparkData} margin={{ top: 2, right: 0, left: 0, bottom: 0 }}>
                                    <defs>
                                      <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor={item.color} stopOpacity={0.3} />
                                        <stop offset="95%" stopColor={item.color} stopOpacity={0.02} />
                                      </linearGradient>
                                    </defs>
                                    <XAxis dataKey="date" hide />
                                    <Tooltip
                                      formatter={(value?: number) => [
                                        privacyMode ? MASK : formatCurrency(value ?? 0, userCurrency, locale),
                                        item.label,
                                      ]}
                                      labelFormatter={(label) => label}
                                      contentStyle={{ ...tooltipStyle, padding: '4px 8px' }}
                                    />
                                    <Area
                                      type="monotone"
                                      dataKey="v"
                                      stroke={item.color}
                                      strokeWidth={1.5}
                                      fill={`url(#${gradId})`}
                                      dot={false}
                                      activeDot={{ r: 2, fill: item.color }}
                                    />
                                  </AreaChart>
                                </ResponsiveContainer>
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    ))}
                  </div>
                )
              })()}
            </div>
          ) : (
          <div className="px-1 pb-4" style={{ height: 280 }}>
            {isLoading ? (
              <div className="px-4">
                <Skeleton className="h-full w-full" />
              </div>
            ) : chartData.length > 0 && meta ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
                  <XAxis
                    dataKey="date"
                    tick={{ fontSize: 10, fill: 'var(--muted-foreground)' }}
                    axisLine={false}
                    tickLine={false}
                    interval="preserveStartEnd"
                  />
                  <YAxis
                    tickFormatter={(v) => {
                      if (privacyMode) return ''
                      if (v === 0) return '0'
                      return formatCompact(v, userCurrency, locale)
                    }}
                    tick={{ fontSize: 10, fill: 'var(--muted-foreground)' }}
                    axisLine={false}
                    tickLine={false}
                    width={64}
                    tickCount={5}
                  />
                  <Tooltip
                    content={({ active, payload, label }) => {
                      if (!active || !payload) return null
                      const items = payload.filter((p) => (p.value as number) > 0)
                      if (items.length === 0) return null
                      return (
                        <div style={tooltipStyle} className="px-3 py-2">
                          <p className="text-xs font-medium mb-1">{label}</p>
                          {items.map((p) => (
                            <p key={p.dataKey as string} className="text-xs" style={{ color: p.color }}>
                              {t(`reports.${p.dataKey}`, { defaultValue: p.name })}:{' '}
                              {privacyMode ? MASK : formatCurrency(p.value as number, userCurrency, locale)}
                            </p>
                          ))}
                        </div>
                      )
                    }}
                  />
                  <Legend
                    iconType="circle"
                    iconSize={8}
                    wrapperStyle={{ fontSize: '12px', paddingTop: '8px' }}
                    formatter={(value: string) => t(`reports.${value}`, { defaultValue: value })}
                  />
                  {(() => {
                    const barSeries = meta.type === 'cash_flow'
                      ? [
                          { key: 'inflow', color: '#10B981' },
                          { key: 'outflow', color: '#F43F5E' },
                        ]
                      : meta.series_keys.map((k) => ({ key: k, color: colorMap[k] || '#6366F1' }))
                    return barSeries
                      .filter(({ key }) => chartData.some((d) => (d[key] as number) > 0))
                      .map(({ key, color }, idx, arr) => (
                        <Bar
                          key={key}
                          dataKey={key}
                          stackId="stack"
                          fill={color}
                          radius={idx === arr.length - 1 ? [4, 4, 0, 0] : [0, 0, 0, 0]}
                          maxBarSize={32}
                        />
                      ))
                  })()}
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <p className="text-muted-foreground text-sm text-center py-16">
                {t('reports.noData')}
              </p>
            )}
          </div>
          )}
        </div>
      </div>
      </>
      )}
      <TransactionDrillDown filter={drillDown} onClose={() => setDrillDown(null)} />
    </div>
  )
}

function CategorySpendingReport({
  data,
  isLoading,
  showVariance,
  onShowVarianceChange,
  onDrillDown,
  formatCurrency,
  mask,
  t,
}: {
  data?: CategorySpendingMatrixResponse
  isLoading: boolean
  showVariance: boolean
  onShowVarianceChange: (value: boolean) => void
  onDrillDown: (filter: DrillDownFilter) => void
  formatCurrency: (value: number, currency?: string) => string
  mask: (value: string) => string
  t: ReturnType<typeof useTranslation>['t']
}) {
  const currency = data?.meta.currency ?? 'USD'
  const periods = useMemo(() => data?.periods ?? [], [data?.periods])
  const displayedPeriods = useMemo(() => [...periods].reverse(), [periods])
  const rows = useMemo(() => data?.rows ?? [], [data?.rows])
  const groupedRows = useMemo(() => {
    const groups = new Map<string, {
      key: string
      name: string
      latestAmount: number
      averageAmount: number
      periodTotals: Record<string, number>
      rows: CategorySpendingRow[]
    }>()

    for (const row of rows) {
      const key = row.group_id ?? 'ungrouped'
      if (!groups.has(key)) {
        groups.set(key, {
          key,
          name: row.group_name ?? t('reports.noGroup'),
          latestAmount: 0,
          averageAmount: 0,
          periodTotals: {},
          rows: [],
        })
      }
      const group = groups.get(key)!
      group.rows.push(row)
      for (const period of periods) {
        group.periodTotals[period.key] = (
          group.periodTotals[period.key] ?? 0
        ) + (row.periods[period.key]?.actual_amount ?? 0)
      }
    }

    const sortedGroups = Array.from(groups.values())
    for (const group of sortedGroups) {
      group.latestAmount = periods[0] ? group.periodTotals[periods[0].key] ?? 0 : 0
      const totalAcrossPeriods = periods.reduce(
        (sum, period) => sum + (group.periodTotals[period.key] ?? 0),
        0
      )
      group.averageAmount = periods.length > 0 ? totalAcrossPeriods / periods.length : 0
      group.rows.sort((a, b) => b.latest_amount - a.latest_amount)
    }
    sortedGroups.sort((a, b) => b.latestAmount - a.latestAmount)
    return sortedGroups
  }, [periods, rows, t])
  const tableWidth = useMemo(
    () => Math.max(760, 240 + 116 + displayedPeriods.length * 140),
    [displayedPeriods.length]
  )
  const topScrollRef = useRef<HTMLDivElement>(null)
  const headerScrollRef = useRef<HTMLDivElement>(null)
  const tableScrollRef = useRef<HTMLDivElement>(null)
  const syncingScroll = useRef(false)

  const syncScroll = (source: 'top' | 'table') => {
    if (syncingScroll.current) return
    const from = source === 'top' ? topScrollRef.current : tableScrollRef.current
    if (!from) return
    syncingScroll.current = true
    for (const target of [topScrollRef.current, headerScrollRef.current, tableScrollRef.current]) {
      if (target && target !== from) {
        target.scrollLeft = from.scrollLeft
      }
    }
    requestAnimationFrame(() => {
      syncingScroll.current = false
    })
  }

  const monthEnd = (exclusiveEnd: string) => {
    const [year, month, day] = exclusiveEnd.split('-').map(Number)
    const d = new Date(Date.UTC(year, month - 1, day))
    d.setUTCDate(d.getUTCDate() - 1)
    return d.toISOString().slice(0, 10)
  }

  return (
    <div className="bg-card rounded-xl border border-border shadow-sm">
      <div className="flex justify-end border-b border-border px-4 py-3">
        <div className="flex items-center gap-2">
          <label className="flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-2 text-xs font-semibold text-muted-foreground">
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

      <div className="sticky top-0 z-40 bg-card shadow-sm">
        <div
          ref={topScrollRef}
          onScroll={() => syncScroll('top')}
          className="h-6 overflow-x-auto border-b border-border bg-card"
          aria-label={t('reports.horizontalScroll')}
        >
          <div style={{ width: tableWidth, height: 1 }} />
        </div>

        <div ref={headerScrollRef} className="overflow-hidden border-b border-border">
          <table
            className="w-full table-fixed border-separate border-spacing-0 text-sm"
            style={{ minWidth: tableWidth }}
          >
            <colgroup>
              <col style={{ width: 240 }} />
              <col style={{ width: 116 }} />
              {displayedPeriods.map((period) => (
                <col key={period.key} style={{ width: 140 }} />
              ))}
            </colgroup>
            <thead>
              <tr className="bg-muted text-[11px] uppercase text-muted-foreground">
                <th className="sticky left-0 z-20 w-[240px] bg-muted px-4 py-3 text-left font-semibold">
                  {t('reports.category')}
                </th>
                <th className="w-[116px] bg-muted px-3 py-3 text-right font-semibold">{t('reports.average')}</th>
                {displayedPeriods.map((period) => (
                  <th key={period.key} className="w-[140px] bg-muted px-3 py-3 text-right font-semibold">
                    {period.label}
                  </th>
                ))}
              </tr>
            </thead>
          </table>
        </div>
      </div>

      <div
        ref={tableScrollRef}
        onScroll={() => syncScroll('table')}
        className="overflow-x-auto"
      >
        <table
          className="w-full table-fixed border-separate border-spacing-0 text-sm"
          style={{ minWidth: tableWidth }}
        >
          <colgroup>
            <col style={{ width: 240 }} />
            <col style={{ width: 116 }} />
            {displayedPeriods.map((period) => (
              <col key={period.key} style={{ width: 140 }} />
            ))}
          </colgroup>
          <tbody>
            {isLoading ? (
              Array.from({ length: 6 }).map((_, idx) => (
                <tr key={idx}>
                  <td className="sticky left-0 z-10 bg-card px-4 py-3">
                    <Skeleton className="h-9 w-44" />
                  </td>
                  <td colSpan={1 + displayedPeriods.length} className="px-3 py-3">
                    <Skeleton className="h-9 w-full" />
                  </td>
                </tr>
              ))
            ) : groupedRows.length === 0 ? (
              <tr>
                <td colSpan={2 + displayedPeriods.length} className="px-4 py-16 text-center text-sm text-muted-foreground">
                  {t('reports.noData')}
                </td>
              </tr>
            ) : (
              groupedRows.map((group) => (
                <Fragment key={group.key}>
                  <tr className="bg-muted/40">
                    <td className="sticky left-0 z-20 border-t border-border bg-muted px-4 py-2.5">
                      <div className="min-w-0">
                        <div className="truncate text-sm font-bold text-foreground">{group.name}</div>
                      </div>
                    </td>
                    <td className="border-t border-border px-3 py-2.5 text-right font-bold tabular-nums text-foreground">
                      {mask(formatCurrency(group.averageAmount, currency))}
                    </td>
                    {displayedPeriods.map((period) => (
                      <td key={period.key} className="border-t border-border px-3 py-2.5 text-right font-bold tabular-nums text-foreground">
                        {mask(formatCurrency(group.periodTotals[period.key] ?? 0, currency))}
                      </td>
                    ))}
                  </tr>
                  {group.rows.map((row) => (
                    <tr key={row.category_id} className="group">
                      <td className="sticky left-0 z-10 border-t border-border bg-card px-4 py-2.5 group-hover:bg-muted/30">
                        <div className="flex min-w-0 items-center gap-3 pl-3">
                          <CategoryIcon icon={row.category_icon} color={row.category_color} size="sm" />
                          <div className="min-w-0">
                            <div className="truncate font-semibold text-foreground">{row.category_name}</div>
                          </div>
                        </div>
                      </td>
                      <td className="border-t border-border px-3 py-2.5 text-right tabular-nums text-muted-foreground">
                        {mask(formatCurrency(row.average_amount, currency))}
                      </td>
                      {displayedPeriods.map((period) => {
                        const value = row.periods[period.key] ?? { actual_amount: 0, status: 'no_budget' as const }
                        return (
                          <td key={period.key} className="border-t border-border px-2 py-2 text-right">
                            <button
                              type="button"
                              className="w-full rounded-lg px-2 py-1.5 text-right transition-colors hover:bg-muted/60"
                              onClick={() => onDrillDown({
                                title: t('reports.drillDownCategory', { category: row.category_name, month: period.label }),
                                category_id: row.category_id,
                                type: 'debit',
                                from: period.start,
                                to: monthEnd(period.end),
                              })}
                            >
                              <div className="font-semibold tabular-nums text-foreground">
                                {mask(formatCurrency(value.actual_amount, currency))}
                              </div>
                              {showVariance && (
                                <VarianceLine value={value} mask={mask} formatCurrency={(amount) => formatCurrency(amount, currency)} t={t} />
                              )}
                            </button>
                          </td>
                        )
                      })}
                    </tr>
                  ))}
                </Fragment>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function VarianceLine({
  value,
  mask,
  formatCurrency,
  t,
}: {
  value: {
    budget_amount?: number | null
    variance_amount?: number | null
    percentage_used?: number | null
    status: string
  }
  mask: (value: string) => string
  formatCurrency: (value: number) => string
  t: ReturnType<typeof useTranslation>['t']
}) {
  if (value.budget_amount == null || value.variance_amount == null) {
    return (
      <div className="mt-1 flex items-center justify-end gap-1 text-[11px] text-muted-foreground">
        <Minus className="h-3 w-3" />
        {t('reports.noBudget')}
      </div>
    )
  }

  const under = value.variance_amount < 0
  const over = value.variance_amount > 0
  const Icon = over ? ArrowUp : under ? ArrowDown : Minus
  const color = over ? 'text-rose-600' : under ? 'text-emerald-600' : 'text-muted-foreground'
  const barColor = over ? 'bg-rose-500' : under ? 'bg-emerald-500' : 'bg-muted-foreground'
  const percent = Math.min(Math.max(value.percentage_used ?? 0, 0), 125)

  return (
    <div className="mt-1">
      <div className={`flex items-center justify-end gap-1 text-[11px] font-medium tabular-nums ${color}`}>
        <Icon className="h-3 w-3" />
        {over ? t('reports.overBudget') : under ? t('reports.underBudget') : t('reports.onBudget')}
        <span>{mask(formatCurrency(Math.abs(value.variance_amount)))}</span>
      </div>
      <div className="ml-auto mt-1 h-1 w-20 overflow-hidden rounded-full bg-muted">
        <div className={`h-full ${barColor}`} style={{ width: `${percent}%` }} />
      </div>
    </div>
  )
}
