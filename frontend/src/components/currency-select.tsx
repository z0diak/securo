import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { CheckIcon, ChevronDownIcon } from 'lucide-react'

import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
import { cn, normalizeText } from '@/lib/utils'

// Shared across the setup and register flows. A compact dropdown keeps these
// forms short instead of rendering one button per currency in a tall grid.
export const CURRENCIES = [
  { code: 'USD', flag: '\u{1F1FA}\u{1F1F8}', symbol: '$' },
  { code: 'EUR', flag: '\u{1F1EA}\u{1F1FA}', symbol: '€' },
  { code: 'GBP', flag: '\u{1F1EC}\u{1F1E7}', symbol: '£' },
  { code: 'AZN', flag: '\u{1F1E6}\u{1F1FF}', symbol: '₼' },
  { code: 'BRL', flag: '\u{1F1E7}\u{1F1F7}', symbol: 'R$' },
  { code: 'CAD', flag: '\u{1F1E8}\u{1F1E6}', symbol: 'C$' },
  { code: 'AUD', flag: '\u{1F1E6}\u{1F1FA}', symbol: 'A$' },
  { code: 'CHF', flag: '\u{1F1E8}\u{1F1ED}', symbol: 'Fr' },
  { code: 'ARS', flag: '\u{1F1E6}\u{1F1F7}', symbol: '$' },
  { code: 'JPY', flag: '\u{1F1EF}\u{1F1F5}', symbol: '¥' },
  { code: 'MXN', flag: '\u{1F1F2}\u{1F1FD}', symbol: '$' },
  { code: 'INR', flag: '\u{1F1EE}\u{1F1F3}', symbol: '₹' },
  { code: 'SEK', flag: '\u{1F1F8}\u{1F1EA}', symbol: 'kr' },
  { code: 'DKK', flag: '\u{1F1E9}\u{1F1F0}', symbol: 'kr' },
  { code: 'NOK', flag: '\u{1F1F3}\u{1F1F4}', symbol: 'kr' },
  { code: 'PLN', flag: '\u{1F1F5}\u{1F1F1}', symbol: 'zł' },
  { code: 'CZK', flag: '\u{1F1E8}\u{1F1FF}', symbol: 'Kč' },
  { code: 'HUF', flag: '\u{1F1ED}\u{1F1FA}', symbol: 'Ft' },
  { code: 'RON', flag: '\u{1F1F7}\u{1F1F4}', symbol: 'lei' },
  { code: 'CRC', flag: '\u{1F1E8}\u{1F1F7}', symbol: '₡' },
  { code: 'IDR', flag: '\u{1F1EE}\u{1F1E9}', symbol: 'Rp' },
  { code: 'COP', flag: '\u{1F1E8}\u{1F1F4}', symbol: '$' },
  { code: 'CLP', flag: '\u{1F1E8}\u{1F1F1}', symbol: '$' },
  { code: 'DOP', flag: '\u{1F1E9}\u{1F1F4}', symbol: 'RD$' },
  { code: 'KZT', flag: '\u{1F1F0}\u{1F1FF}', symbol: '₸' },
  { code: 'RUB', flag: '\u{1F1F7}\u{1F1FA}', symbol: '₽' },
  { code: 'GTQ', flag: '\u{1F1EC}\u{1F1F9}', symbol: 'Q' },
  { code: 'PHP', flag: '\u{1F1F5}\u{1F1ED}', symbol: '₱' },
  { code: 'UAH', flag: '\u{1F1FA}\u{1F1E6}', symbol: '₴' },
  { code: 'NZD', flag: '\u{1F1F3}\u{1F1FF}', symbol: 'NZ$' },
  { code: 'VND', flag: '\u{1F1FB}\u{1F1F3}', symbol: '₫' },
  { code: 'SGD', flag: '\u{1F1F8}\u{1F1EC}', symbol: 'S$' },
  { code: 'TRY', flag: '\u{1F1F9}\u{1F1F7}', symbol: '₺' },
  { code: 'PKR', flag: '\u{1F1F5}\u{1F1F0}', symbol: '₨' },
  { code: 'MDL', flag: '\u{1F1F2}\u{1F1E9}', symbol: 'L' },
  { code: 'AED', flag: '\u{1F1E6}\u{1F1EA}', symbol: 'د.إ' },
  { code: 'THB', flag: '\u{1F1F9}\u{1F1ED}', symbol: '฿' },
  { code: 'EGP', flag: '\u{1F1EA}\u{1F1EC}', symbol: 'E£' },
  { code: 'MYR', flag: '\u{1F1F2}\u{1F1FE}', symbol: 'RM' },
  { code: 'CNY', flag: '\u{1F1E8}\u{1F1F3}', symbol: '¥' },
  { code: 'SAR', flag: '\u{1F1F8}\u{1F1E6}', symbol: 'ر.س' },
  { code: 'QAR', flag: '\u{1F1F6}\u{1F1E6}', symbol: 'ر.ق' },
  { code: 'JMD', flag: '\u{1F1EF}\u{1F1F2}', symbol: 'J$' },
  { code: 'RSD', flag: '\u{1F1F7}\u{1F1F8}', symbol: 'RSD' },
] as const

export interface CurrencyOption {
  code: string
  flag?: string
  symbol?: string
  name?: string
}

interface CurrencySelectProps {
  value: string
  onChange: (code: string) => void
  /**
   * Currencies to offer. Defaults to the built-in list; pages that load the
   * server's list from `currencies.list` pass it here. The current value is
   * always shown, even when the list has not loaded or does not include it.
   */
  options?: readonly CurrencyOption[]
  id?: string
  disabled?: boolean
  className?: string
}

function currencyName(code: string, language: string): string | undefined {
  try {
    return new Intl.DisplayNames([language, 'en'], { type: 'currency' }).of(code)
  } catch {
    return undefined
  }
}

/**
 * A searchable currency picker. Open it and type a code ("brl"), a name
 * ("real", "dolar") or a symbol ("R$") to narrow the list; Enter picks the
 * highlighted row. Code matches that start with the query sort first.
 */
export function CurrencySelect({
  value,
  onChange,
  options = CURRENCIES,
  id,
  disabled = false,
  className,
}: CurrencySelectProps) {
  const { t, i18n } = useTranslation()
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')

  const items = useMemo(() => {
    const list: CurrencyOption[] = options.some((c) => c.code === value)
      ? [...options]
      : [{ code: value }, ...options]
    return list.map((c) => ({
      ...c,
      name: c.name || currencyName(c.code, i18n.language),
    }))
  }, [options, value, i18n.language])

  const selected = items.find((c) => c.code === value)

  function handleOpenChange(next: boolean) {
    setOpen(next)
    if (!next) setSearch('')
  }

  function choose(code: string) {
    onChange(code)
    handleOpenChange(false)
  }

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <button
          type="button"
          id={id}
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className={cn(
            'flex h-9 w-full cursor-pointer items-center justify-between gap-2 rounded-md border border-input bg-card px-3 py-2 text-left text-sm shadow-xs transition-[color,box-shadow] outline-hidden focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-input/30 dark:hover:bg-input/50',
            className,
          )}
        >
          <span className="flex min-w-0 items-center gap-2 truncate">
            {selected?.flag && <span className="text-base leading-none">{selected.flag}</span>}
            <span className="font-medium">{value}</span>
            {selected?.symbol && (
              <span className="text-xs text-muted-foreground">{selected.symbol}</span>
            )}
          </span>
          <ChevronDownIcon className="size-4 shrink-0 opacity-50" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-[var(--radix-popover-trigger-width)] min-w-64 overflow-hidden p-0"
      >
        <Command
          filter={(itemValue, query) => {
            const haystack = normalizeText(itemValue)
            const needle = normalizeText(query.trim())
            if (!needle) return 1
            if (haystack.startsWith(needle)) return 2
            return haystack.includes(needle) ? 1 : 0
          }}
        >
          <CommandInput
            placeholder={t('common.searchCurrency')}
            value={search}
            onValueChange={setSearch}
          />
          <CommandList>
            <CommandEmpty>{t('common.noCurrencyFound')}</CommandEmpty>
            <CommandGroup>
              {items.map(({ code, flag, symbol, name }) => (
                <CommandItem
                  key={code}
                  value={`${code} ${name ?? ''} ${symbol ?? ''}`}
                  onSelect={() => choose(code)}
                  className="cursor-pointer"
                >
                  {flag && <span className="text-base leading-none">{flag}</span>}
                  <span className="font-medium">{code}</span>
                  {name && (
                    <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
                      {name}
                    </span>
                  )}
                  {symbol && !name && (
                    <span className="flex-1 text-xs text-muted-foreground">{symbol}</span>
                  )}
                  {code === value && <CheckIcon className="size-4 shrink-0" />}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
