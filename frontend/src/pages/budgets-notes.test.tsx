import { createContext } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import BudgetsPage from '@/pages/budgets'
import { renderWithProviders } from '@/test/utils'

const api = vi.hoisted(() => ({
  budgets: { list: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn() },
  categories: { list: vi.fn(), listIncludingHidden: vi.fn() },
  categoryGroups: { list: vi.fn() },
}))
const workspace = vi.hoisted(() => ({ canWrite: true }))
vi.mock('@/lib/api', () => api)
vi.mock('@/contexts/workspace-context', () => ({
  useWorkspace: () => workspace,
  WorkspaceContext: createContext(undefined),
}))
vi.mock('@/contexts/auth-context', () => ({ useAuth: () => ({ user: null }) }))
vi.mock('@/hooks/use-privacy-mode', () => ({ usePrivacyMode: () => ({ mask: (value: string) => value }) }))

const budget = { id: 'budget-1', category_id: 'food', amount: 500, month: '2026-11-01', is_recurring: false, notes: '日本語 العربية\nSecond line 😀' }

beforeEach(() => {
  vi.clearAllMocks()
  workspace.canWrite = true
  api.budgets.list.mockResolvedValue([budget])
  api.budgets.update.mockResolvedValue(budget)
  api.budgets.create.mockResolvedValue(budget)
  const categories = [{ id: 'food', name: 'Food', icon: 'utensils', color: '#6366f1', group_id: null }]
  api.categories.list.mockResolvedValue(categories)
  api.categories.listIncludingHidden.mockResolvedValue(categories)
  api.categoryGroups.list.mockResolvedValue([])
})

async function openEditor() {
  const result = renderWithProviders(<BudgetsPage />)
  await result.user.click(await screen.findByRole('button', { name: 'Edit' }))
  return result
}

describe('budget notes', () => {
  it('loads existing notes and saves an edit', async () => {
    const { user } = await openEditor()
    const notes = screen.getByRole('textbox', { name: 'Notes (optional)' })
    expect(notes).toHaveValue(budget.notes)
    fireEvent.change(notes, { target: { value: 'Árvíztűrő 日本語 😀' } })
    await user.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(api.budgets.update).toHaveBeenCalledWith('budget-1', { amount: 500, notes: 'Árvíztűrő 日本語 😀' }))
  })

  it('clears notes with null', async () => {
    const { user } = await openEditor()
    await user.clear(screen.getByRole('textbox', { name: 'Notes (optional)' }))
    await user.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(api.budgets.update).toHaveBeenCalledWith('budget-1', { amount: 500, notes: null }))
  })

  it('counts Unicode characters consistently with the API limit', async () => {
    const { user } = await openEditor()
    const notes = screen.getByRole('textbox', { name: 'Notes (optional)' })
    const save = screen.getByRole('button', { name: 'Save' })
    fireEvent.change(notes, { target: { value: '😀'.repeat(2001) } })
    expect(notes).toHaveAttribute('aria-invalid', 'true')
    expect(save).toBeDisabled()
    fireEvent.submit(save.closest('form')!)
    expect(api.budgets.update).not.toHaveBeenCalled()
    fireEvent.change(notes, { target: { value: '😀'.repeat(2000) } })
    expect(save).toBeEnabled()
    await user.click(save)
    await waitFor(() => expect(api.budgets.update).toHaveBeenCalledWith('budget-1', { amount: 500, notes: '😀'.repeat(2000) }))
  })

  it('includes notes when creating a budget', async () => {
    api.budgets.list.mockResolvedValue([])
    const { user } = renderWithProviders(<BudgetsPage />)
    await user.click(await screen.findByRole('button', { name: 'Add Budget' }))
    const dialog = screen.getByRole('dialog')
    await user.selectOptions(within(dialog).getByRole('combobox'), 'food')
    fireEvent.change(within(dialog).getByRole('spinbutton'), { target: { value: '250' } })
    fireEvent.change(within(dialog).getByRole('textbox', { name: 'Notes (optional)' }), { target: { value: '食費' } })
    await user.click(within(dialog).getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(api.budgets.create).toHaveBeenCalledWith(expect.objectContaining({ category_id: 'food', amount: 250, notes: '食費' })))
  })

  it('shows notes to read-only members', async () => {
    workspace.canWrite = false
    renderWithProviders(<BudgetsPage />)
    expect(await screen.findByText(/日本語 العربية/)).toHaveTextContent('Second line 😀')
    expect(screen.queryByRole('button', { name: 'Edit' })).not.toBeInTheDocument()
  })
})
