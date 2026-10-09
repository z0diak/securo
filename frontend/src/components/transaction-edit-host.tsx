import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { TransactionDialog, type TransactionSavePayload } from '@/components/transaction-dialog'
import {
  accounts as accountsApi,
  categories as categoriesApi,
  categoryGroups as categoryGroupsApi,
  recurring,
  transactions,
} from '@/lib/api'
import { extractApiError } from '@/lib/api-errors'
import { isManualInstallmentSeriesRow } from '@/lib/installment-series'
import { invalidateFinancialQueries } from '@/lib/invalidate-queries'
import type { Transaction, TransactionApplyScope, TransactionEditPayload } from '@/types'

type TransactionUpdatePayload = TransactionEditPayload & {
  apply_to_transfer_pair?: boolean
  apply_to?: TransactionApplyScope
}

type PendingTransferCategoryUpdate = {
  id: string
  data: TransactionUpdatePayload
}

/**
 * The Transactions page's edit dialog, for surfaces that only need to correct
 * an existing transaction (reports drill-down, for one). Saving, deleting or
 * unlinking refreshes every financial query, so open reports recalculate.
 */
export function TransactionEditHost({
  transaction,
  onClose,
}: {
  transaction: Transaction | null
  onClose: () => void
}) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const open = !!transaction
  const [pendingTransferCategoryUpdate, setPendingTransferCategoryUpdate] =
    useState<PendingTransferCategoryUpdate | null>(null)
  const [pendingSeriesDeleteId, setPendingSeriesDeleteId] = useState<string | null>(null)

  const { data: categoriesList } = useQuery({
    queryKey: ['categories'],
    queryFn: () => categoriesApi.list(),
    enabled: open,
  })
  const { data: categoryGroupsList } = useQuery({
    queryKey: ['categoryGroups'],
    queryFn: () => categoryGroupsApi.list(),
    enabled: open,
  })
  const { data: accountsList } = useQuery({
    queryKey: ['accounts'],
    queryFn: () => accountsApi.list(),
    enabled: open,
  })
  const { data: recurringList } = useQuery({
    queryKey: ['recurring'],
    queryFn: () => recurring.list(),
    enabled: open,
  })
  const recurringById = useMemo(
    () => new Map((recurringList ?? []).map((item) => [item.id, item])),
    [recurringList],
  )

  const refresh = () => invalidateFinancialQueries(queryClient)

  const updateMutation = useMutation({
    mutationFn: ({ id, ...data }: TransactionUpdatePayload & { id: string }) =>
      transactions.update(id, data),
    onSuccess: () => {
      refresh()
      onClose()
      toast.success(t('transactions.updated'))
    },
    onError: (error) => toast.error(extractApiError(error)),
  })

  const deleteMutation = useMutation({
    mutationFn: (payload: { id: string; applyTo?: TransactionApplyScope }) =>
      transactions.delete(payload.id, payload.applyTo ?? 'this'),
    onSuccess: () => {
      refresh()
      onClose()
      toast.success(t('transactions.deleted'))
    },
    onError: (error) => toast.error(extractApiError(error)),
  })

  const unlinkTransferMutation = useMutation({
    mutationFn: (pairId: string) => transactions.unlinkTransfer(pairId),
    onSuccess: () => {
      refresh()
      onClose()
    },
    onError: (error) => toast.error(extractApiError(error)),
  })

  const handleClose = () => {
    setPendingTransferCategoryUpdate(null)
    updateMutation.reset()
    onClose()
  }

  const handleSave = (data: TransactionSavePayload) => {
    if (!transaction) return
    const isTransferCategoryChange =
      !!transaction.transfer_pair_id &&
      Object.prototype.hasOwnProperty.call(data, 'category_id') &&
      data.category_id !== transaction.category_id

    if (isTransferCategoryChange) {
      setPendingTransferCategoryUpdate({ id: transaction.id, data })
      return
    }
    updateMutation.mutate({ id: transaction.id, ...data })
  }

  const submitTransferCategoryUpdate = (applyToTransferPair: boolean) => {
    if (!pendingTransferCategoryUpdate) return
    const { id, data } = pendingTransferCategoryUpdate
    updateMutation.mutate({ id, ...data, apply_to_transfer_pair: applyToTransferPair })
    setPendingTransferCategoryUpdate(null)
  }

  const submitSeriesDelete = (scope: TransactionApplyScope) => {
    if (!pendingSeriesDeleteId) return
    deleteMutation.mutate({ id: pendingSeriesDeleteId, applyTo: scope })
    setPendingSeriesDeleteId(null)
  }

  const busy = updateMutation.isPending || deleteMutation.isPending

  return (
    <>
      <TransactionDialog
        open={open}
        onClose={handleClose}
        transaction={transaction}
        categories={categoriesList ?? []}
        categoryGroups={categoryGroupsList ?? []}
        accounts={accountsList ?? []}
        recurringMatch={
          transaction?.recurring_transaction_id
            ? recurringById.get(transaction.recurring_transaction_id)
            : undefined
        }
        onSave={handleSave}
        onDelete={transaction ? () => {
          if (isManualInstallmentSeriesRow(transaction)) {
            setPendingSeriesDeleteId(transaction.id)
          } else {
            deleteMutation.mutate({ id: transaction.id })
          }
        } : undefined}
        onUnlinkTransfer={(pairId) => unlinkTransferMutation.mutate(pairId)}
        onIgnoreChanged={refresh}
        loading={busy || unlinkTransferMutation.isPending}
        error={updateMutation.error ? extractApiError(updateMutation.error) : null}
        isSynced={transaction?.source === 'sync'}
      />

      <Dialog
        open={!!pendingTransferCategoryUpdate}
        onOpenChange={(next) => {
          if (!next) setPendingTransferCategoryUpdate(null)
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('transactions.confirmTransferCategoryTitle')}</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            {t('transactions.confirmTransferCategoryDesc')}
          </p>
          <DialogFooter className="flex-row flex-nowrap items-center justify-end gap-2 sm:space-x-0">
            <Button
              className="shrink-0"
              variant="outline"
              onClick={() => setPendingTransferCategoryUpdate(null)}
            >
              {t('common.cancel')}
            </Button>
            <Button
              className="min-w-0 flex-1 truncate"
              variant="outline"
              onClick={() => submitTransferCategoryUpdate(false)}
              disabled={updateMutation.isPending}
            >
              {t('transactions.confirmTransferCategorySingle')}
            </Button>
            <Button
              className="min-w-0 flex-1 truncate"
              onClick={() => submitTransferCategoryUpdate(true)}
              disabled={updateMutation.isPending}
            >
              {updateMutation.isPending
                ? t('common.loading')
                : t('transactions.confirmTransferCategoryBoth')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={!!pendingSeriesDeleteId}
        onOpenChange={(next) => {
          if (!next) setPendingSeriesDeleteId(null)
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('transactions.installmentScopeTitle')}</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            {t('transactions.installmentScopeDeleteDesc')}
          </p>
          <DialogFooter className="flex-col sm:flex-row sm:justify-end gap-2">
            <Button
              autoFocus
              onClick={() => submitSeriesDelete('this')}
              disabled={busy}
              className="justify-center"
            >
              {busy ? t('common.loading') : t('transactions.installmentScopeThis')}
            </Button>
            <Button
              variant="outline"
              onClick={() => submitSeriesDelete('future')}
              disabled={busy}
              className="justify-center"
            >
              {t('transactions.installmentScopeFuture')}
            </Button>
            <Button
              variant="outline"
              onClick={() => submitSeriesDelete('all')}
              disabled={busy}
              className="justify-center"
            >
              {t('transactions.installmentScopeAll')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
