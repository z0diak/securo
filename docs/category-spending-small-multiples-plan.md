# Category Spending Small Multiples Implementation Plan

## Objective

Replace the current Category Spending matrix on `/reports` with a small-multiples card layout that helps users quickly answer:

- How much do I usually spend per category?
- How volatile is that category month to month?
- Is spending meaningfully trending up or down over the selected period?
- How does each month compare with that category's budget, without requiring hover?
- Can I inspect several categories at once, while keeping each category visually separate?

Do not implement a one-category-at-a-time flow. Default view should show multiple useful categories immediately, and controls should make switching or selecting several categories cheap.

## Repo Guidance

Follow `AGENTS.md`:

- Create or use a feature branch from `securo/main`; never code directly on `securo/main`.
- Keep work frontend-scoped unless API limitations are discovered.
- Use existing React, TypeScript, Tailwind v4, shadcn/radix-style components, React Query, i18next, lucide-react, and app color semantics.
- Keep UI dense, practical, and scan-friendly.
- Use existing API wrappers in `frontend/src/lib/api.ts`.
- Use `CategoryIcon`, privacy masking, and current `TransactionDrillDown`.
- Add user-visible strings to every locale JSON file. At minimum English and PT-BR must be complete, but the existing i18n test expects all locale files to contain all English keys.

## Current State

Relevant existing files:

- `frontend/src/pages/reports.tsx`
- `frontend/src/lib/api.ts`
- `frontend/src/types/index.ts`
- `frontend/src/components/reports/CashflowSankey.tsx`
- `frontend/src/components/category-icon.tsx`
- `frontend/src/components/transaction-drill-down.tsx`
- `frontend/src/locales/*.json`

Existing endpoint:

```http
GET /api/reports/category-spending?months=12&interval=monthly&period=ytd&type=expenses
```

Existing response already contains:

- `periods`
- `rows`
- category name, icon, color, group
- per-period `actual_amount`
- per-period `budget_amount`
- per-period `variance_amount`
- per-period `percentage_used`
- per-period `status`

Assume no backend changes are needed for first implementation.

## UX Target

Category Spending tab should render:

- Top toolbar:
  - search input
  - quick filters: `Top spend`, `Over budget`, `Changed most`, `All`
  - custom selected category chips with remove buttons
  - budget overlay toggle, reusing current `showVariance` state
- Card grid:
  - mobile: 1 column
  - tablet: 2 columns
  - desktop: 3 columns
  - no nested cards; each repeated category card may be a card
- Each card:
  - category icon and category name
  - metrics: `Average / month`, `Std dev`, `Trend`
  - month-by-month mini bar chart
  - budget overlay when enabled
  - clickable month bars that open existing transaction drilldown

Avoid explanatory text blocks. Controls and labels are enough.

## Metrics

Use visible periods from the current range.

Important ordering:

- API periods may arrive newest first.
- Charts and trend math should use chronological order: oldest to newest.
- Display left-to-right oldest to newest, so trend direction maps naturally to time.

### Average / Month

```ts
averageMonthly = sum(actualAmounts) / periodCount
```

Include zero-spend months. A quiet month is real data.

Display as currency.

### Standard Deviation

Use population standard deviation over the same actual monthly values:

```ts
variance = sum((value - averageMonthly) ** 2) / periodCount
standardDeviation = Math.sqrt(variance)
```

Display as currency.

### Trend

Do not use only latest minus oldest; that is too noisy.

Compare early-period average with late-period average:

- 1-3 months: first 1 month vs last 1 month
- 4-8 months: first 2 months vs last 2 months
- 9-18 months: first 3 months vs last 3 months
- 19+ months: first 4 months vs last 4 months

```ts
trendAmount = lateAverage - earlyAverage
```

Significance threshold:

```ts
threshold = Math.max(averageMonthly * 0.10, standardDeviation * 0.35, 1)
isSignificant = Math.abs(trendAmount) >= threshold
```

Display:

- significant increase: red or rose, `+$X`
- significant decrease: green or emerald, `-$X`
- insignificant: muted gray, `Flat`

If privacy mode is active, mask money values but keep direction color and `Flat` label.

## Budget Overlay

Budget overlay must be readable without hover.

Use plain CSS/div bars rather than Recharts for the small cards. Reasons:

- easier to layer actual vs budget per month
- cheaper to render many cards
- easier to make click targets stable
- easier to test with DOM attributes

Each month slot uses one category-local y-scale:

```ts
slotMax = Math.max(actualAmount, budgetAmount ?? 0, maxActualOrBudgetInCard)
```

Use one shared max for all months in a card:

```ts
cardMax = Math.max(...periods.map((p) => Math.max(actual, budget ?? 0)), 1)
```

Then:

```ts
heightPercent = value / cardMax * 100
```

### No Budget

- Render only actual bar.
- Actual fill: category color with controlled opacity, or app primary/neutral if category color is hard to read.
- Month status marker: muted dash.

### Actual <= Budget

- Budget bar behind actual.
- Budget width: about 70%.
- Budget style: `bg-primary/10 border border-primary/25`.
- Actual bar in front.
- Actual width: about 44%.
- Actual style: emerald/muted or category color.
- Remaining budget is visible above actual because budget bar is taller.
- Month status marker: emerald dot.

### Actual > Budget

- Actual bar behind budget, full taller height.
- Actual style: rose fill.
- Budget bar in front, shorter and visible.
- Budget width: about 44%-52%, centered.
- Budget style: `bg-card border border-primary/50` or `bg-primary/20 border-primary/40`.
- Overspend is visible as rose area above budget.
- Month status marker: rose dot.

Keep exact amounts in tooltip and drilldown. Overlay is for visual reading; tooltip is for precision.

## Implementation Sequence

### 1. Prepare Branch

If not already on a feature/docs branch:

```bash
git fetch upstream
git switch main
git merge --ff-only upstream/main
git push origin main
git switch securo/main
git merge main
git push origin securo/main
git switch -c feature/category-spending-small-multiples
```

If already on a suitable feature branch with a clean worktree, continue there.

### 2. Extract Data Helpers

Create:

```text
frontend/src/lib/category-spending-small-multiples.ts
```

Export pure helpers:

- `orderedCategoryPeriods(periods)`
- `categoryMonthlyValues(row, periods)`
- `averageMonthly(values)`
- `standardDeviation(values)`
- `trendSummary(values)`
- `categoryCardSummary(row, periods)`
- `budgetBarModel(value, cardMax, showBudgetOverlay)`
- `filterCategoryCards(cards, state)`
- `sortCategoryCards(cards, preset)`
- `defaultVisibleCategoryIds(cards)`

Keep these helpers framework-free so tests are fast and precise.

Suggested types:

```ts
export type CategorySpendingPreset =
  | 'top_spend'
  | 'over_budget'
  | 'changed_most'
  | 'all'

export interface CategoryTrendSummary {
  amount: number
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
```

### 3. Add Component

Create:

```text
frontend/src/components/reports/CategorySpendingSmallMultiples.tsx
```

Props:

```ts
interface CategorySpendingSmallMultiplesProps {
  data?: CategorySpendingMatrixResponse
  isLoading: boolean
  showVariance: boolean
  onShowVarianceChange: (value: boolean) => void
  onDrillDown: (filter: DrillDownFilter) => void
  formatCurrency: (value: number, currency?: string) => string
  mask: (value: string) => string
  t: TFunction
}
```

Use existing app components where appropriate:

- `CategoryIcon`
- `Button` if button variant fits local pattern
- `Input`
- `Skeleton`
- `Popover` only if needed for category picker
- lucide icons: `Search`, `X`, `Check`, `ArrowUp`, `ArrowDown`, `Minus`

Use direct CSS/Tailwind bars for the mini charts.

Recommended state:

```ts
const [query, setQuery] = useState('')
const [preset, setPreset] = useState<CategorySpendingPreset>('top_spend')
const [selectedCategoryIds, setSelectedCategoryIds] = useState<string[]>([])
```

Behavior:

- Default: top spend cards, sorted by average monthly spend, limit 6 or 9.
- Preset buttons clear custom selection.
- Category picker checkboxes create custom selection.
- Custom selection can show any number of categories, but keep layout usable; do not hard-limit below 8.
- Search filters the currently visible set; in picker search filters all categories.
- `All` shows all categories sorted by average monthly spend.
- `Over budget` shows categories with at least one over-budget month, sorted by total overage.
- `Changed most` shows categories sorted by absolute significant trend amount.

### 4. Replace Current Category Spending Body

In `frontend/src/pages/reports.tsx`:

- Remove or stop rendering the old matrix `CategorySpendingReport`.
- Import and render `CategorySpendingSmallMultiples`.
- Keep page-level state:
  - `showVariance`
  - `drillDown`
  - range controls
  - `categoryData` React Query call
- Keep existing `TransactionDrillDown`.

Do not touch other report tabs except imports made necessary by extraction.

### 5. Drilldown

Each month bar must be a button.

Click opens:

```ts
onDrillDown({
  title: t('reports.drillDownCategory', {
    category: row.category_name,
    month: period.label,
  }),
  category_id: row.category_id,
  type: 'debit',
  from: period.start,
  to: monthEnd(period.end),
})
```

Reuse existing month-end logic or extract it into the helper file if needed.

### 6. Tooltip

Implement lightweight hover/focus tooltip if practical.

Tooltip should show:

- month label
- actual
- budget when present
- variance when present

Tooltip is not required for budget comprehension, because overlay is visible by default when enabled.

### 7. i18n

Add keys under `reports` in every `frontend/src/locales/*.json` file.

Likely keys:

- `averagePerMonth`
- `standardDeviation`
- `trend`
- `topSpend`
- `overBudget`
- `changedMost`
- `allCategories`
- `searchCategories`
- `selectCategories`
- `selectedCategories`
- `flatTrend`
- `budget`
- `actual`
- `noMatchingCategories`
- `clearCategory`

Run locale tests after edits. Existing `frontend/src/locales/i18n.test.ts` should catch missing keys, extra keys, and placeholder mismatches.

## Required Tests

Create tests before or alongside implementation. Do not leave this as manual-only UI work.

### Pure Helper Tests

Create:

```text
frontend/src/lib/category-spending-small-multiples.test.ts
```

Cover:

- Orders periods chronological even when API returns newest first.
- Builds monthly values with zero fill for missing period entries.
- Average includes zero months.
- Standard deviation uses population formula.
- Trend compares early-window average vs late-window average.
- Trend is red/up when late average meaningfully exceeds early average.
- Trend is green/down when late average meaningfully falls below early average.
- Trend is gray/flat when difference is below threshold.
- Trend handles all-zero category without NaN.
- `top_spend` sorts by average monthly spend and limits default cards.
- `over_budget` includes any category with an over-budget month and sorts by total overage.
- `changed_most` sorts by absolute significant trend amount.
- Search matches category name and group name case-insensitively.
- Budget bar model with no budget renders only actual layer.
- Under-budget model puts budget behind and actual in front.
- Over-budget model puts actual behind and budget in front.
- Bar heights clamp between 0 and 100.
- Zero card max does not produce NaN or Infinity.

Use small factory helpers in test file, not huge fixtures.

### Component Tests

Create:

```text
frontend/src/components/reports/CategorySpendingSmallMultiples.test.tsx
```

Use `renderWithProviders` from `frontend/src/test/utils.tsx`.

Mock data should include:

- at least 4 periods
- 5-8 categories
- one under-budget category
- one over-budget category
- one no-budget category
- one growing trend
- one falling trend
- one flat trend

Cover:

- Loading state renders card skeletons.
- Default render shows multiple category cards, not one.
- Default top-spend preset hides lower spend categories when over the default limit.
- `All` preset shows every category.
- `Over budget` preset shows only categories with over-budget months.
- `Changed most` preset prioritizes growing/falling categories over flat categories.
- Search filters visible cards.
- Category picker can select two specific categories and both cards render together.
- Removing selected chip removes that category card.
- Budget toggle hides budget overlay elements.
- Budget toggle shows overlay elements without requiring hover.
- Under-budget month has budget-back/actual-front DOM markers.
- Over-budget month has actual-back/budget-front DOM markers.
- Clicking a month bar calls `onDrillDown` with category id, debit type, period start, and inclusive month end.
- Privacy mask is applied to average, standard deviation, trend amount, actual tooltip text, and budget tooltip text.
- Empty data renders `reports.noData` or new `reports.noMatchingCategories` as appropriate.

Testing tip: add stable attributes for chart internals:

```tsx
data-testid={`category-card-${row.category_id}`}
data-testid={`month-bar-${row.category_id}-${period.key}`}
data-budget-layer={model.budgetLayer ?? 'none'}
data-actual-layer={model.actualLayer}
data-budget-status={model.status}
```

These attributes make visual logic testable without asserting Tailwind class internals.

### Locale Tests

No new locale test file required unless existing coverage is insufficient.

Run:

```bash
docker compose run --rm frontend_npm npm run test -- src/locales/i18n.test.ts
```

This should verify all locale JSON files stay aligned.

### Page Wiring Test

If `reports.tsx` already has no page test, do not build a broad full-page integration test unless cheap. Prefer component tests above.

If adding a page-level test is straightforward, cover one thing only:

- Category Spending tab renders `CategorySpendingSmallMultiples` with API data and preserves range query behavior.

Do not duplicate all component behavior at page level.

## Validation Commands

During iteration:

```bash
docker compose run --rm frontend_npm npm run test -- src/lib/category-spending-small-multiples.test.ts
docker compose run --rm frontend_npm npm run test -- src/components/reports/CategorySpendingSmallMultiples.test.tsx
docker compose run --rm frontend_npm npm run test -- src/locales/i18n.test.ts
```

Before handoff:

```bash
docker compose run --rm frontend_npm npm run test
docker compose run --rm frontend_npm npm run lint
docker compose run --rm frontend_npm npm run build
```

If Docker is unavailable, run equivalent commands from `frontend`:

```bash
npm run test
npm run lint
npm run build
```

Report any checks not run and why.

## Manual QA

Check `/reports` -> `Category Spending`.

Desktop:

- 1Y shows readable 3-column grid.
- 20+ categories are manageable via presets/search/all.
- Default view shows several categories immediately.
- User can inspect multiple custom categories at once.
- Metrics fit card width and use tabular numbers.
- Trend up/down/flat colors make sense.
- Budget overlay is understandable without hover.
- Over-budget actual bar remains visible above budget.
- Under-budget remaining budget remains visible above actual.
- Month bar click opens transaction drilldown.

Mobile:

- Cards stack in one column.
- Toolbar wraps without text overlap.
- Chips wrap cleanly.
- Month bars remain tappable.
- No metric text overlaps.

Privacy:

- Enable privacy mode.
- Confirm all currency values on cards, bars, tooltip, and drilldown entry points are masked.

Ranges:

- Test `6M`, `YTD`, `1Y`, `2Y`.
- Trend windows update with period count.
- Month labels remain compact.

Dark mode, if available:

- Cards, borders, budget overlays, and rose/emerald statuses remain legible.

## Acceptance Criteria

- Category Spending no longer defaults to the old wide numeric matrix.
- User sees multiple category cards immediately.
- Each card shows:
  - Average / month
  - Standard deviation
  - Trend
  - monthly actual bars
  - budget overlay when enabled
- Budget overlay communicates under/over state without hover.
- Multiple category inspection is supported by presets and custom selection.
- Existing drilldown behavior is preserved.
- Existing privacy masking is preserved.
- All new user-visible strings are translated in every locale file.
- Required helper and component tests are added and pass.
- Full frontend test, lint, and build checks pass before handoff.

## Deferred Work

- Dedicated heatmap/table view toggle.
- CSV export.
- Backend-calculated trend metrics.
- Per-category custom budget display preferences.
- Saved category comparison sets.
