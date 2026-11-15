import uuid
from datetime import date, datetime, timezone
from decimal import Decimal

import pytest

from app.models.account import Account
from app.models.budget import Budget
from app.models.category import Category
from app.models.category_group import CategoryGroup
from app.models.transaction import Transaction
from app.services.report_service import _add_months, get_monthly_category_report


async def _account(session, user_id) -> Account:
    account = Account(
        id=uuid.uuid4(), user_id=user_id, name="Monthly", type="checking",
        balance=Decimal("0"), currency="BRL", is_closed=False,
    )
    session.add(account)
    await session.commit()
    return account


def _category(user, workspace, name, group=None, **kwargs) -> Category:
    return Category(
        id=uuid.uuid4(), user_id=user.id, workspace_id=workspace.id,
        name=name, icon="tag", color="#10B981",
        group_id=group.id if group else None, **kwargs,
    )


def _tx(user, workspace, account, category, amount, tx_type, day):
    return Transaction(
        id=uuid.uuid4(), user_id=user.id, workspace_id=workspace.id,
        account_id=account.id, category_id=category.id if category else None,
        description="Row", amount=Decimal(amount), currency="BRL", date=day,
        type=tx_type, source="manual", status="posted",
        created_at=datetime.now(timezone.utc),
    )


def _budget(user, workspace, category, amount, month):
    return Budget(
        id=uuid.uuid4(), user_id=user.id, workspace_id=workspace.id,
        category_id=category.id, amount=Decimal(amount), month=month,
        is_recurring=False,
    )


def _row(section, name):
    return next(
        row for group in section.groups for row in group.rows
        if row.category_name == name
    )


@pytest.mark.asyncio
async def test_monthly_report_splits_expenses_income_and_budgets(
    session, test_user, test_workspace,
):
    account = await _account(session, test_user.id)
    month = date.today().replace(day=1)
    previous = _add_months(month, -1)
    group = CategoryGroup(
        id=uuid.uuid4(), user_id=test_user.id, workspace_id=test_workspace.id,
        name="Living",
    )
    session.add(group)
    await session.flush()
    groceries = _category(test_user, test_workspace, "Groceries", group)
    rent = _category(test_user, test_workspace, "Rent", group)
    fun = _category(test_user, test_workspace, "Fun")
    salary = _category(test_user, test_workspace, "Salary")
    gym = _category(test_user, test_workspace, "Gym")
    moves = _category(test_user, test_workspace, "Moves", treat_as_transfer=True)
    session.add_all([groceries, rent, fun, salary, gym, moves])
    session.add_all([
        _budget(test_user, test_workspace, groceries, "200", month),
        _budget(test_user, test_workspace, rent, "1000", month),
        _tx(test_user, test_workspace, account, groceries, "250", "debit", month),
        _tx(test_user, test_workspace, account, groceries, "20", "credit", month),
        _tx(test_user, test_workspace, account, rent, "900", "debit", month),
        _tx(test_user, test_workspace, account, fun, "75", "debit", month),
        _tx(test_user, test_workspace, account, salary, "3000", "credit", month),
        _tx(test_user, test_workspace, account, moves, "500", "debit", month),
        # Last month only: must not surface as a zero row.
        _tx(test_user, test_workspace, account, gym, "40", "debit", previous),
        _tx(test_user, test_workspace, account, None, "15", "debit", month),
        _tx(test_user, test_workspace, account, None, "60", "credit", month),
    ])
    await session.commit()

    report = await get_monthly_category_report(
        session, test_workspace.id, test_user.id, month, "BRL",
    )

    assert report.currency == "BRL"
    assert report.month == month.strftime("%Y-%m")
    assert report.start == month.isoformat()
    assert report.end == _add_months(month, 1).isoformat()
    assert report.is_current_month is True

    expenses = report.expenses
    assert expenses.total_amount == 230 + 900 + 75 + 15
    assert expenses.budget_amount == 1200
    assert expenses.budgeted_actual_amount == 1130
    assert expenses.unbudgeted_actual_amount == 90
    names = {row.category_name for g in expenses.groups for row in g.rows}
    assert names == {"Groceries", "Rent", "Fun", "Uncategorized"}

    living = expenses.groups[0]
    assert living.group_name == "Living"
    assert living.actual_amount == 1130
    assert living.budget_amount == 1200
    assert [r.category_name for r in living.rows] == ["Rent", "Groceries"]
    # Ungrouped categories come last.
    assert expenses.groups[-1].group_id is None

    groceries_row = _row(expenses, "Groceries")
    assert groceries_row.actual_amount == 230
    assert groceries_row.variance_amount == 30
    assert _row(expenses, "Rent").variance_amount == -100
    assert _row(expenses, "Fun").variance_amount is None

    income = report.income
    assert income.total_amount == 3060
    assert income.budget_amount is None
    assert _row(income, "Salary").actual_amount == 3000
    assert _row(income, "Uncategorized").actual_amount == 60
    assert report.net_amount == 3060 - 1220


@pytest.mark.asyncio
async def test_monthly_report_budget_without_spend_is_listed(
    session, test_user, test_workspace,
):
    month = _add_months(date.today().replace(day=1), -2)
    travel = _category(test_user, test_workspace, "Travel")
    session.add(travel)
    session.add(_budget(test_user, test_workspace, travel, "300", month))
    await session.commit()

    report = await get_monthly_category_report(
        session, test_workspace.id, test_user.id, month, "BRL",
    )
    row = _row(report.expenses, "Travel")
    assert row.actual_amount == 0
    assert row.variance_amount == -300
    assert report.is_current_month is False
    assert report.income.groups == []


@pytest.mark.asyncio
async def test_monthly_report_rejects_future_month(session, test_user, test_workspace):
    with pytest.raises(ValueError):
        await get_monthly_category_report(
            session, test_workspace.id, test_user.id,
            _add_months(date.today().replace(day=1), 1), "BRL",
        )


@pytest.mark.asyncio
async def test_monthly_report_routes_mixed_categories_by_budget_and_net(
    session, test_user, test_workspace,
):
    account = await _account(session, test_user.id)
    month = date.today().replace(day=1)
    clothes = _category(test_user, test_workspace, "Clothes")
    resale = _category(test_user, test_workspace, "Resale")
    session.add_all([clothes, resale])
    session.add_all([
        _budget(test_user, test_workspace, clothes, "100", month),
        # Budgeted: refunds above spend stay in expenses as negative spend.
        _tx(test_user, test_workspace, account, clothes, "50", "debit", month),
        _tx(test_user, test_workspace, account, clothes, "80", "credit", month),
        # Unbudgeted: net credits move to income at their net.
        _tx(test_user, test_workspace, account, resale, "10", "debit", month),
        _tx(test_user, test_workspace, account, resale, "100", "credit", month),
    ])
    await session.commit()

    report = await get_monthly_category_report(
        session, test_workspace.id, test_user.id, month, "BRL",
    )
    clothes_row = _row(report.expenses, "Clothes")
    assert clothes_row.actual_amount == -30
    assert clothes_row.variance_amount == -130
    assert _row(report.income, "Resale").actual_amount == 90
    assert all(
        row.category_name != "Resale"
        for group in report.expenses.groups for row in group.rows
    )
    assert report.expenses.total_amount == -30
    assert report.net_amount == 120


@pytest.mark.asyncio
async def test_monthly_report_api(client, auth_headers):
    month = date.today().strftime("%Y-%m")
    resp = await client.get(
        "/api/reports/monthly-category", params={"month": month}, headers=auth_headers,
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["month"] == month
    assert set(data) >= {"expenses", "income", "net_amount", "currency"}


@pytest.mark.asyncio
@pytest.mark.parametrize("month", ["2025-13", "2025-1", "bad"])
async def test_monthly_report_api_rejects_bad_month(client, auth_headers, month):
    resp = await client.get(
        "/api/reports/monthly-category", params={"month": month}, headers=auth_headers,
    )
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_monthly_report_api_rejects_future_month(client, auth_headers):
    future = _add_months(date.today().replace(day=1), 1).strftime("%Y-%m")
    resp = await client.get(
        "/api/reports/monthly-category", params={"month": future}, headers=auth_headers,
    )
    assert resp.status_code == 422
