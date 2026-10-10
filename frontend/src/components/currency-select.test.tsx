import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { screen } from '@testing-library/react'

import { CURRENCIES, CurrencySelect } from '@/components/currency-select'
import { renderWithProviders } from '@/test/utils'

describe('CURRENCIES', () => {
  it('has no duplicate codes', () => {
    const codes = CURRENCIES.map((c) => c.code)
    expect(new Set(codes).size).toBe(codes.length)
  })

  it('gives every entry a flag and a symbol', () => {
    // A blank cell in the dropdown is how a half-added currency shows up.
    for (const { code, flag, symbol } of CURRENCIES) {
      expect(code, `${code} code`).toMatch(/^[A-Z]{3}$/)
      expect(flag, `${code} flag`).not.toBe('')
      expect(symbol, `${code} symbol`).not.toBe('')
    }
  })

  it('includes the two currencies the product treats as first class', () => {
    const codes = CURRENCIES.map((c) => c.code)
    expect(codes).toContain('USD')
    expect(codes).toContain('BRL')
  })

  it('formats every listed currency without throwing', () => {
    // Intl rejects a code it does not know, and this list feeds the setup
    // screen where a throw would block the whole first-run flow.
    for (const { code } of CURRENCIES) {
      expect(() =>
        new Intl.NumberFormat('en-US', {
          style: 'currency',
          currency: code,
        }).format(1),
      ).not.toThrow()
    }
  })
})

describe('CurrencySelect', () => {
  it('shows the current selection', () => {
    renderWithProviders(<CurrencySelect value="BRL" onChange={vi.fn()} />)

    expect(screen.getByRole('combobox')).toHaveTextContent('BRL')
  })

  it('lists every supported currency when opened', async () => {
    const { user } = renderWithProviders(
      <CurrencySelect value="USD" onChange={vi.fn()} />,
    )

    await user.click(screen.getByRole('combobox'))

    const options = await screen.findAllByRole('option')
    expect(options).toHaveLength(CURRENCIES.length)
  })

  it('reports the chosen code', async () => {
    const onChange = vi.fn()
    const { user } = renderWithProviders(
      <CurrencySelect value="USD" onChange={onChange} />,
    )

    await user.click(screen.getByRole('combobox'))
    await user.click(await screen.findByRole('option', { name: /BRL/ }))

    expect(onChange).toHaveBeenCalledWith('BRL')
  })

  it('shows the new currency once the parent commits it', async () => {
    // The callback firing is only half of it. A select that reports BRL and
    // keeps displaying USD looks broken to the user, and asserting on the
    // mock alone would not notice.
    function Controlled() {
      const [value, setValue] = useState('USD')
      return <CurrencySelect value={value} onChange={setValue} />
    }

    const { user } = renderWithProviders(<Controlled />)
    expect(screen.getByRole('combobox')).toHaveTextContent('USD')

    await user.click(screen.getByRole('combobox'))
    await user.click(await screen.findByRole('option', { name: /BRL/ }))

    expect(screen.getByRole('combobox')).toHaveTextContent('BRL')
  })

  it('takes an id so a label can point at it', () => {
    renderWithProviders(
      <>
        <label htmlFor="currency">Currency</label>
        <CurrencySelect id="currency" value="USD" onChange={vi.fn()} />
      </>,
    )

    expect(screen.getByLabelText('Currency')).toBeInTheDocument()
  })
})

describe('CurrencySelect search', () => {
  it('narrows the list by typed code', async () => {
    const { user } = renderWithProviders(
      <CurrencySelect value="USD" onChange={vi.fn()} />,
    )

    await user.click(screen.getByRole('combobox'))
    await user.type(screen.getByPlaceholderText(/search/i), 'brl')

    const options = await screen.findAllByRole('option')
    expect(options).toHaveLength(1)
    expect(options[0]).toHaveTextContent('BRL')
  })

  it('picks the highlighted match with Enter', async () => {
    const onChange = vi.fn()
    const { user } = renderWithProviders(
      <CurrencySelect value="USD" onChange={onChange} />,
    )

    await user.click(screen.getByRole('combobox'))
    await user.type(screen.getByPlaceholderText(/search/i), 'jp{Enter}')

    expect(onChange).toHaveBeenCalledWith('JPY')
  })

  it('matches by currency name and by symbol', async () => {
    const { user } = renderWithProviders(
      <CurrencySelect value="USD" onChange={vi.fn()} />,
    )

    await user.click(screen.getByRole('combobox'))
    await user.type(screen.getByPlaceholderText(/search/i), 'zloty')
    expect(await screen.findByRole('option', { name: /PLN/ })).toBeInTheDocument()

    await user.clear(screen.getByPlaceholderText(/search/i))
    await user.type(screen.getByPlaceholderText(/search/i), 'R$')
    expect(await screen.findByRole('option', { name: /BRL/ })).toBeInTheDocument()
  })

  it('ranks a code prefix ahead of other matches', async () => {
    const { user } = renderWithProviders(
      <CurrencySelect value="EUR" onChange={vi.fn()} />,
    )

    await user.click(screen.getByRole('combobox'))
    await user.type(screen.getByPlaceholderText(/search/i), 'us')

    const options = await screen.findAllByRole('option')
    expect(options[0]).toHaveTextContent('USD')
  })

  it('shows an empty state when nothing matches', async () => {
    const { user } = renderWithProviders(
      <CurrencySelect value="USD" onChange={vi.fn()} />,
    )

    await user.click(screen.getByRole('combobox'))
    await user.type(screen.getByPlaceholderText(/search/i), 'zzzz')

    expect(screen.queryAllByRole('option')).toHaveLength(0)
  })

  it('offers the server list and keeps an unlisted current value', async () => {
    const { user } = renderWithProviders(
      <CurrencySelect
        value="XYZ"
        onChange={vi.fn()}
        options={[{ code: 'EUR', symbol: '€', name: 'Euro', flag: '' }]}
      />,
    )

    expect(screen.getByRole('combobox')).toHaveTextContent('XYZ')
    await user.click(screen.getByRole('combobox'))
    expect(await screen.findAllByRole('option')).toHaveLength(2)
  })
})
