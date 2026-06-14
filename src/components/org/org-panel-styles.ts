import { StyleSheet } from 'react-native'
import { colors } from '@/lib/theme'

export const orgPanelStyles = StyleSheet.create({
  muted: {
    color: colors.textFaint,
    fontSize: 13,
  },
  error: {
    color: colors.errorText,
    fontSize: 12,
    marginTop: 10,
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
