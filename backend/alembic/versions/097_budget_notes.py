"""Add optional notes to budgets.

Revision ID: 097
Revises: 096
"""
from alembic import op
import sqlalchemy as sa

revision = "097"
down_revision = "096"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("budgets", sa.Column("notes", sa.String(length=2000), nullable=True))


def downgrade() -> None:
    op.drop_column("budgets", "notes")
