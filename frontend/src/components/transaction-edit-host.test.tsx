import { screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { TransactionEditHost } from '@/components/transaction-edit-host'
import { renderWithProviders, t } from '@/test/utils'
import type { Transaction } from '@/types'

const api = vi.hoisted(() => ({
  transactions: {
    update: vi.fn(),
    delete: vi.fn(),
    unlinkTransfer: vi.fn(),
  },
  categories: { list: vi.fn() },
  categoryGroups: { list: vi.fn() },
  accounts: { list: vi.fn() },
  recurring: { list: vi.fn() },
}))

vi.mock('@/lib/api', () => api)

// The real dialog is covered by its own tests; here it is a stand-in that
// exposes the callbacks the host wires up.
vi.mock('@/components/transaction-dialog', () => ({
  TransactionDialog: ({ open, transaction, onSave, onDelete, onClose }: {
    open: boolean
    transaction: Transaction | null
    onSave: (data: Record<string, unknown>) => void
    onDelete?: () => void
    onClose: () => void
  }) => (open ? (
    <div role="dialog" aria-label="edit-transaction">
      <span>{transaction?.description}</span>
      <button onClick={() => onSave({ category_id: 'new-category' })}>save-category</button>
      <button onClick={() => onSave({ description: 'Renamed' })}>save-description</button>
      <button onClick={() => onDelete?.()}>delete</button>
      <button onClick={onClose}>close</button>
    </div>
  ) : null),
}))

function tx(overrides: Partial<Transaction> = {}): Transaction {
  return {
    id: 'tx-1',
    description: 'Groceries run',
    category_id: 'old-category',
    transfer_pair_id: null,
    ...overrides,
  } as Transaction
}

beforeEach(() => {
  vi.clearAllMocks()
  api.categories.list.mockResolvedValue([])
  api.categoryGroups.list.mockResolvedValue([])
  api.accounts.list.mockResolvedValue([])
  api.recurring.list.mockResolvedValue([])
  api.transactions.update.mockResolvedValue({})
  api.transactions.delete.mockResolvedValue({})
})

describe('TransactionEditHost', () => {
  it('renders nothing until a transaction is chosen', () => {
    renderWithProviders(<TransactionEditHost transaction={null} onClose={vi.fn()} />)

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(api.categories.list).not.toHaveBeenCalled()
  })

  it('saves a correction, closes, and refreshes reports and the drill-down list', async () => {
    const onClose = vi.fn()
    const { user, queryClient } = renderWithProviders(
      <TransactionEditHost transaction={tx()} onClose={onClose} />,
    )
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries')

    await user.click(screen.getByText('save-description'))

    await waitFor(() => expect(onClose).toHaveBeenCalled())
    expect(api.transactions.update).toHaveBeenCalledWith('tx-1', { description: 'Renamed' })
    const keys = invalidate.mock.calls.map(([filters]) => (filters as { queryKey: string[] }).queryKey[0])
    expect(keys).toEqual(expect.arrayContaining(['reports', 'drill-down', 'transactions', 'budgets']))
  })

  it('deletes through the same refresh path', async () => {
    const onClose = vi.fn()
    const { user, queryClient } = renderWithProviders(
      <TransactionEditHost transaction={tx()} onClose={onClose} />,
    )
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries')

    await user.click(screen.getByText('delete'))

    await waitFor(() => expect(onClose).toHaveBeenCalled())
    expect(api.transactions.delete).toHaveBeenCalledWith('tx-1', 'this')
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['reports'] })
  })

  it('asks before changing the category of a transfer, then applies to the pair', async () => {
    const onClose = vi.fn()
    const { user } = renderWithProviders(
      <TransactionEditHost transaction={tx({ transfer_pair_id: 'pair-1' })} onClose={onClose} />,
    )

    await user.click(screen.getByText('save-category'))
    expect(api.transactions.update).not.toHaveBeenCalled()
    expect(screen.getByText(t('transactions.confirmTransferCategoryTitle'))).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: t('transactions.confirmTransferCategoryBoth') }))

    await waitFor(() => expect(api.transactions.update).toHaveBeenCalledWith('tx-1', {
      category_id: 'new-category',
      apply_to_transfer_pair: true,
    }))
  })

  it('updates a plain transaction category without prompting', async () => {
    const { user } = renderWithProviders(
      <TransactionEditHost transaction={tx()} onClose={vi.fn()} />,
    )

    await user.click(screen.getByText('save-category'))

    await waitFor(() => expect(api.transactions.update).toHaveBeenCalledWith('tx-1', {
      category_id: 'new-category',
    }))
    expect(screen.queryByText(t('transactions.confirmTransferCategoryTitle'))).not.toBeInTheDocument()
  })
})
