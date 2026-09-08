import { createElement, useEffect, useId, useRef, useState } from 'react'
import {
  Animated,
  Platform,
  Pressable,
  StyleSheet,
  TextInput,
  View,
  type TextInputProps,
  type TextStyle,
} from 'react-native'
import { useReducedMotion } from 'react-native-reanimated'
import { EyeIcon, EyeSlashIcon } from '@/components/auth/auth-eye-icons'
import {
  authFormStyles,
  authFloatingWebInputStyle,
  webPointer,
} from '@/components/auth/auth-form-styles'
import { colors } from '@/lib/theme'

const LABEL_REST_TOP = 16
const LABEL_RAISED_TOP = 6
const LABEL_REST_SIZE = 16
const LABEL_RAISED_SIZE = 11
const LABEL_MOTION_MS = 160

type AuthFloatingFieldProps = Readonly<{
  label: string
  value: string
  onChangeText: (text: string) => void
  accentColor: string
  editable?: boolean
  autoComplete?: NonNullable<TextInputProps['autoComplete']>
  keyboardType?: NonNullable<TextInputProps['keyboardType']>
  secureTextEntry?: boolean
  showPasswordToggle?: boolean
  passwordVisible?: boolean
  onTogglePasswordVisible?: () => void
  returnKeyType?: NonNullable<TextInputProps['returnKeyType']>
  onSubmitEditing?: NonNullable<TextInputProps['onSubmitEditing']>
  /** Called after the field loses focus (e.g. deferred validation). */
  onBlur?: NonNullable<TextInputProps['onBlur']>
}>

type AuthFloatingLabelProps = Readonly<{
  label: string
  inputId: string
  raised: boolean
  color: string
  reduceMotion: boolean
  withToggle: boolean
}>

type FocusHost = {
  addEventListener: (
    type: string,
    listener: (event: { relatedTarget?: unknown; target?: unknown }) => void,
    options?: boolean,
  ) => void
  removeEventListener: (
    type: string,
    listener: (event: { relatedTarget?: unknown; target?: unknown }) => void,
    options?: boolean,
  ) => void
  contains?: (node: unknown) => boolean
}

function useWebFieldFocus(setFocused: (next: boolean) => void) {
  const ref = useRef<View>(null)
  useEffect(() => {
    if (Platform.OS !== 'web') return
    const node = ref.current as unknown as FocusHost | null
    if (!node?.addEventListener) return
    const onFocusIn = () => setFocused(true)
    const onFocusOut = (event: { relatedTarget?: unknown }) => {
      if (node.contains?.(event.relatedTarget ?? null)) return
      setFocused(false)
    }
    node.addEventListener('focusin', onFocusIn)
    node.addEventListener('focusout', onFocusOut)
    const onDocPointerDown = (event: { target?: unknown }) => {
      if (!node.contains?.(event.target ?? null)) setFocused(false)
    }
    const doc = globalThis.document as FocusHost | undefined
    doc?.addEventListener('mousedown', onDocPointerDown, true)
    return () => {
      node.removeEventListener('focusin', onFocusIn)
      node.removeEventListener('focusout', onFocusOut)
      doc?.removeEventListener('mousedown', onDocPointerDown, true)
    }
  }, [setFocused])
  return ref
}

function nativeLabelA11y() {
  return {
    accessibilityElementsHidden: true,
    importantForAccessibility: 'no-hide-descendants' as const,
  }
}

function AuthFloatingLabel({
  label,
  inputId,
  raised,
  color,
  reduceMotion,
  withToggle,
}: AuthFloatingLabelProps) {
  const [raiseAnim] = useState(
    () => new Animated.Value(raised ? 1 : 0),
  )

  useEffect(() => {
    if (Platform.OS === 'web') return
    Animated.timing(raiseAnim, {
      toValue: raised ? 1 : 0,
      duration: reduceMotion ? 0 : LABEL_MOTION_MS,
      useNativeDriver: false,
    }).start()
  }, [raiseAnim, raised, reduceMotion])

  const labelStyle = [
    authFormStyles.floatingLabel,
    withToggle && authFormStyles.floatingLabelWithToggle,
  ]

  if (Platform.OS === 'web') {
    const webStyle = {
      ...StyleSheet.flatten(labelStyle),
      top: raised ? LABEL_RAISED_TOP : LABEL_REST_TOP,
      fontSize: raised ? LABEL_RAISED_SIZE : LABEL_REST_SIZE,
      color,
      pointerEvents: 'none',
      userSelect: 'none',
      cursor: 'text',
      zIndex: 1,
      margin: 0,
      transitionProperty: 'top, font-size, color',
      transitionDuration: reduceMotion ? '0ms' : `${LABEL_MOTION_MS}ms`,
      transitionTimingFunction: 'ease-out',
    }
    // Native <label htmlFor> so a click on the moving caption focuses the
    // input instead of selecting "Email"/"Password" or blurring on mouseup.
    return createElement('label', {
      htmlFor: inputId,
      'aria-hidden': true,
      style: webStyle,
    }, label)
  }

  const labelTop = raiseAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [LABEL_REST_TOP, LABEL_RAISED_TOP],
  })
  const labelFontSize = raiseAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [LABEL_REST_SIZE, LABEL_RAISED_SIZE],
  })

  return (
    <View
      pointerEvents="none"
      style={[
        authFormStyles.floatingLabelLayer,
        withToggle && authFormStyles.floatingLabelLayerWithToggle,
      ]}
    >
      <Animated.Text
        pointerEvents="none"
        {...nativeLabelA11y()}
        style={[
          labelStyle,
          {
            top: labelTop,
            fontSize: labelFontSize,
            color,
            pointerEvents: 'none',
          },
        ]}
      >
        {label}
      </Animated.Text>
    </View>
  )
}

export function AuthFloatingField({
  label,
  value,
  onChangeText,
  accentColor,
  editable = true,
  autoComplete,
  keyboardType,
  secureTextEntry,
  showPasswordToggle = false,
  passwordVisible = false,
  onTogglePasswordVisible,
  returnKeyType,
  onSubmitEditing,
  onBlur,
}: AuthFloatingFieldProps) {
  const inputId = useId()
  const [focused, setFocused] = useState(false)
  const fieldRef = useWebFieldFocus(setFocused)
  const raised = focused || value.length > 0
  const reduceMotion = useReducedMotion() === true
  const labelColor = focused ? accentColor : colors.textLabel

  return (
    <View
      ref={fieldRef}
      style={[
        authFormStyles.floatingField,
        focused && { borderColor: accentColor },
      ]}
    >
      <AuthFloatingLabel
        label={label}
        inputId={inputId}
        raised={raised}
        color={labelColor}
        reduceMotion={reduceMotion}
        withToggle={showPasswordToggle}
      />
      <TextInput
        nativeID={inputId}
        value={value}
        onChangeText={onChangeText}
        onFocus={() => setFocused(true)}
        onBlur={(event) => {
          setFocused(false)
          onBlur?.(event)
        }}
        {...(Platform.OS === 'web'
          ? {
              // RN Web sometimes focuses the DOM node without firing
              // `onFocus` when the caption is the visual click target.
              onMouseDown: () => setFocused(true),
            }
          : {})}
        autoComplete={autoComplete}
        keyboardType={keyboardType}
        autoCapitalize="none"
        autoCorrect={false}
        editable={editable}
        secureTextEntry={secureTextEntry}
        returnKeyType={returnKeyType}
        onSubmitEditing={onSubmitEditing}
        accessibilityLabel={label}
        style={[
          Platform.OS === 'web'
            ? (authFloatingWebInputStyle as unknown as TextStyle)
            : authFormStyles.floatingInputNative,
          showPasswordToggle && authFormStyles.floatingInputWithToggle,
        ]}
      />
      {showPasswordToggle ? (
        <Pressable
          onPress={onTogglePasswordVisible}
          style={[authFormStyles.passwordToggle, webPointer]}
          accessibilityRole="button"
          accessibilityLabel={passwordVisible ? 'Hide password' : 'Show password'}
          hitSlop={4}
        >
          {passwordVisible ? (
            <EyeSlashIcon color={colors.textMuted} />
          ) : (
            <EyeIcon color={colors.textMuted} />
          )}
        </Pressable>
      ) : null}
    </View>
  )
}
