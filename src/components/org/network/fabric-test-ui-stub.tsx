/** DOM stand-ins for the `@/components/ui` pieces the TurboFabric controls use (tests only). */
import type { ReactNode } from 'react'

type Children = Readonly<{ children?: ReactNode }>

export const fabricUiStub = {
  Badge: ({ label }: Readonly<{ label: string }>) => <span>{label}</span>,
  Button: ({
    label,
    onPress,
    disabled,
  }: Readonly<{ label: string; onPress?: () => void; disabled?: boolean }>) => (
    <button type="button" disabled={disabled} onClick={onPress}>
      {label}
    </button>
  ),
  ButtonRow: ({ children }: Children) => <div>{children}</div>,
  FormField: ({ label, children }: Children & Readonly<{ label: string }>) => (
    <fieldset>
      <legend>{label}</legend>
      {children}
    </fieldset>
  ),
  ModalSheet: ({
    visible,
    title,
    children,
    footer,
  }: Children & Readonly<{ visible: boolean; title: string; footer?: ReactNode }>) =>
    visible ? (
      <dialog open aria-label={title}>
        {children}
        {footer}
      </dialog>
    ) : null,
  SegmentedControl: ({
    options,
    value,
    onChange,
    disabled,
  }: Readonly<{
    options: readonly { value: string; label: string }[]
    value: string
    onChange: (next: string) => void
    disabled?: boolean
  }>) => (
    <div role="tablist">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          role="tab"
          aria-selected={option.value === value}
          disabled={disabled}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  ),
  SettingRow: ({ label, children }: Children & Readonly<{ label: string }>) => (
    <div>
      <span>{label}</span>
      {children}
    </div>
  ),
  Toggle: ({
    value,
    onValueChange,
    disabled,
    accessibilityLabel,
  }: Readonly<{
    value: boolean
    onValueChange: (next: boolean) => void
    disabled?: boolean
    accessibilityLabel?: string
  }>) => (
    <button
      type="button"
      role="switch"
      aria-checked={value}
      aria-label={accessibilityLabel}
      disabled={disabled}
      onClick={() => onValueChange(!value)}
    />
  ),
}

export const panelStylesStub = {
  panelStyles: new Proxy({}, { get: () => ({}) }),
}
