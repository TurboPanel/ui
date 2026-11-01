/**
 * Test support for the Access screens (not shipped: only test files import it).
 * Plain DOM stand-ins for the `@/components/ui` pieces those screens use, so a
 * test reads labels, values and disabled states without React Native.
 */
import type { ReactNode } from 'react'

type Children = Readonly<{ children?: ReactNode }>

type ButtonProps = Readonly<{ label: string; disabled?: boolean; onPress?: () => void }>

function StubButton({ label, disabled, onPress }: ButtonProps) {
  return (
    <button type="button" disabled={Boolean(disabled)} onClick={() => onPress?.()}>
      {label}
    </button>
  )
}

type Option = Readonly<{
  value: string | null
  label: string
  disabled?: boolean
  detail?: string | null
}>

function StubSelect({
  value,
  options,
  disabled,
  accessibilityLabel,
  onChange,
}: Readonly<{
  value: string | null
  options: readonly Option[]
  disabled?: boolean
  accessibilityLabel?: string
  onChange: (value: string | null) => void
}>) {
  return (
    <div>
      <select
        aria-label={accessibilityLabel}
        value={value ?? ''}
        disabled={Boolean(disabled)}
        onChange={(event) => onChange(event.target.value)}
      >
        {options.map((option) => (
          <option
            key={option.value ?? ''}
            value={option.value ?? ''}
            disabled={Boolean(option.disabled)}
          >
            {option.label}
          </option>
        ))}
      </select>
      {options.map((option) =>
        option.detail ? <small key={`${option.value}-detail`}>{option.detail}</small> : null
      )}
    </div>
  )
}

function StubTextField({
  label,
  value,
  onChangeText,
}: Readonly<{ label: string; value?: string; onChangeText?: (value: string) => void }>) {
  return (
    <input
      aria-label={label}
      value={value ?? ''}
      onChange={(event) => onChangeText?.(event.target.value)}
    />
  )
}

export const accessUiStub = {
  Badge: ({ label }: Readonly<{ label: string }>) => <b>{label}</b>,
  Button: StubButton,
  ButtonRow: ({ children }: Children) => <div>{children}</div>,
  ConfirmButton: ({
    label,
    disabled,
    onConfirm,
  }: Readonly<{ label: string; disabled?: boolean; onConfirm: () => void }>) => (
    <StubButton label={label} disabled={disabled} onPress={onConfirm} />
  ),
  DataTable: ({ children }: Children) => (
    <table>
      <tbody>{children}</tbody>
    </table>
  ),
  DataTableRow: ({ children }: Children) => <tr>{children}</tr>,
  DataTableCell: ({ children }: Children) => <td>{children}</td>,
  DataTableEmpty: ({ children }: Children) => (
    <tr>
      <td>{children}</td>
    </tr>
  ),
  InlineNotice: ({ title, body }: Readonly<{ title: string; body?: string }>) => (
    <p>
      {title} {body}
    </p>
  ),
  LoadingState: () => <span>Loading</span>,
  SectionPanel: ({ title, children }: Readonly<{ title: string; children?: ReactNode }>) => (
    <section>
      <h2>{title}</h2>
      {children}
    </section>
  ),
  Select: StubSelect,
  TextField: StubTextField,
  TextLink: ({ label, onPress }: Readonly<{ label: string; onPress: () => void }>) => (
    <StubButton label={label} onPress={onPress} />
  ),
}

export const panelStylesStub = {
  panelStyles: { pageTitle: {}, pageCopy: {}, muted: {}, error: {} },
}
