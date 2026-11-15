from pydantic import BaseModel


class ReportBreakdown(BaseModel):
    key: str
    label: str
    value: float
    color: str


class ReportSummary(BaseModel):
    primary_value: float
    change_amount: float
    change_percent: float | None
    breakdowns: list[ReportBreakdown]


class ReportCompositionItem(BaseModel):
    key: str
    label: str
    value: float
    color: str
    group: str


class ReportDataPoint(BaseModel):
    date: str
    value: float
    breakdowns: dict[str, float]
    change: float | None = None
    composition: list[ReportCompositionItem] = []


class ReportMeta(BaseModel):
    type: str
    series_keys: list[str]
    currency: str
    interval: str
    forecast_start_date: str | None = None
    baseline_active: bool = False
    baseline_lookback_days: int | None = None


class CategoryTrendItem(BaseModel):
    key: str
    label: str
    color: str
    total: float
    group: str
    series: list[ReportDataPoint]


class CategorySpendingPeriod(BaseModel):
    key: str
    label: str
    start: str
    end: str


class CategorySpendingPeriodValue(BaseModel):
    actual_amount: float
    budget_amount: float | None = None
    variance_amount: float | None = None
    variance_percent: float | None = None
    percentage_used: float | None = None
    status: str
    is_recurring_budget: bool = False


class CategorySpendingRow(BaseModel):
    category_id: str
    category_name: str
    category_icon: str
    category_color: str
    group_id: str | None = None
    group_name: str | None = None
    total_amount: float
    average_amount: float
    latest_amount: float
    trend_amount: float
    trend_percent: float | None = None
    periods: dict[str, CategorySpendingPeriodValue]


class CategorySpendingMeta(BaseModel):
    currency: str
    interval: str
    type: str
    period: str | None = None


class CategorySpendingMatrixResponse(BaseModel):
    periods: list[CategorySpendingPeriod]
    rows: list[CategorySpendingRow]
    meta: CategorySpendingMeta


class MonthlyCategoryRow(BaseModel):
    category_id: str
    category_name: str
    category_icon: str
    category_color: str
    group_id: str | None = None
    group_name: str | None = None
    # Spend for expense rows, earnings for income rows; positive is the
    # section's natural direction (expense rows go negative on net refunds).
    actual_amount: float
    budget_amount: float | None = None
    # Actual minus budget: positive is over budget.
    variance_amount: float | None = None


class MonthlyCategoryGroup(BaseModel):
    group_id: str | None = None
    group_name: str | None = None
    actual_amount: float
    budget_amount: float | None = None
    rows: list[MonthlyCategoryRow]


class MonthlyCategorySection(BaseModel):
    total_amount: float
    budget_amount: float | None = None
    # Actual of budgeted categories only, so it compares 1:1 to the budget.
    budgeted_actual_amount: float
    unbudgeted_actual_amount: float
    groups: list[MonthlyCategoryGroup]


class MonthlyCategoryReportResponse(BaseModel):
    month: str
    start: str
    end: str
    currency: str
    is_current_month: bool
    expenses: MonthlyCategorySection
    income: MonthlyCategorySection
    net_amount: float


class ReportResponse(BaseModel):
    summary: ReportSummary
    trend: list[ReportDataPoint]
    meta: ReportMeta
    composition: list[ReportCompositionItem] = []
    category_trend: list[CategoryTrendItem] = []
