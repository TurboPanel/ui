import { StyleSheet } from 'react-native'
import { colors } from '@/lib/admin-theme'

export const adminStyles = StyleSheet.create({
  inlineLabel: {
    color: colors.textLabel,
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginTop: 8,
    marginBottom: 4,
  },
  muted: {
    color: colors.textFaint,
    fontSize: 13,
  },
  input: {
    borderWidth: 1,
    borderColor: colors.borderChip,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: colors.text,
    backgroundColor: colors.bgInput,
    fontSize: 14,
    fontFamily: 'monospace',
  },
  button: {
    marginTop: 2,
    backgroundColor: colors.text,
    borderRadius: 8,
    paddingVertical: 10,
    alignItems: 'center',
  },
  buttonSecondary: {
    marginTop: 2,
    backgroundColor: colors.bgSecondary,
    borderWidth: 1,
    borderColor: colors.borderChip,
    borderRadius: 8,
    paddingVertical: 10,
    alignItems: 'center',
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  buttonText: {
    color: colors.buttonText,
    fontSize: 14,
    fontWeight: '600',
  },
  buttonSecondaryText: {
    color: colors.textBody,
    fontSize: 14,
    fontWeight: '600',
  },
  scrollInset: {
    maxHeight: 400,
    marginTop: 4,
    padding: 10,
    borderRadius: 8,
    backgroundColor: colors.bgInset,
    borderWidth: 1,
    borderColor: colors.borderArea,
  },
  logLine: {
    color: colors.log,
    fontSize: 12,
    fontFamily: 'monospace',
    marginBottom: 4,
  },
  error: {
    color: colors.errorText,
    fontSize: 12,
    marginTop: 10,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 8,
  },
  dotOk: {
    backgroundColor: colors.accent,
  },
  dotBad: {
    backgroundColor: colors.error,
  },
  rowText: {
    color: colors.textBody,
    fontSize: 14,
    flex: 1,
  },
  fleetCount: {
    color: colors.textDim,
    fontSize: 12,
    fontFamily: 'monospace',
  },
  targets: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  addressResults: {
    marginTop: 4,
    gap: 8,
  },
  detailCard: {
    padding: 10,
    borderRadius: 8,
    backgroundColor: colors.bgInset,
    borderWidth: 1,
    borderColor: colors.borderArea,
    gap: 4,
  },
  detailTitle: {
    color: colors.accent,
    fontSize: 13,
    fontFamily: 'monospace',
    fontWeight: '600',
  },
  detailLine: {
    color: colors.stdout,
    fontSize: 12,
    fontFamily: 'monospace',
  },
  detailLabel: {
    color: colors.textMuted,
  },
})
