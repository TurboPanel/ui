import { useMemo, useState } from 'react'
import { StyleSheet, Text, TextInput, View } from 'react-native'
import { useRouter, type Href } from 'expo-router'
import { SearchConfirm, SearchResultList } from '@/components/header-search'
import { useSearchItems } from '@/components/use-search-items'
import { rankSearchItems, type SearchItem } from '@/lib/search-index'
import { colors, spacing } from '@/lib/theme'

const HEADING_ID = 'search-screen-heading'

/**
 * The phone's Search tab: the same servers, projects, databases, pages and
 * actions as the header search, in a full-screen list with large rows. A
 * dangerous action asks first and then only opens its page.
 */
export function SearchScreen({ orgId }: Readonly<{ orgId: string }>) {
  const router = useRouter()
  const [query, setQuery] = useState('')
  const [pending, setPending] = useState<SearchItem | null>(null)
  const items = useSearchItems(orgId, true)
  const shown = useMemo(() => rankSearchItems(items, query), [items, query])
  const go = (item: SearchItem) => router.push(item.href as Href)
  const trimmed = query.trim()

  return (
    <View style={styles.screen}>
      <TextInput
        value={query}
        onChangeText={(text) => {
          setQuery(text)
          setPending(null)
        }}
        placeholder="Search or run an action"
        placeholderTextColor={colors.textDim}
        accessibilityLabel="Search"
        autoCapitalize="none"
        autoCorrect={false}
        returnKeyType="search"
        style={styles.input}
      />
      {pending ? (
        <SearchConfirm
          item={pending}
          onConfirm={() => go(pending)}
          onCancel={() => setPending(null)}
        />
      ) : (
        <>
          <Text id={HEADING_ID} style={styles.heading}>
            {trimmed ? 'Results' : 'Jump to'}
          </Text>
          {shown.length > 0 ? (
            <SearchResultList
              shown={shown}
              activeId={undefined}
              query={query}
              onHover={() => undefined}
              onPick={(item) => (item.danger ? setPending(item) : go(item))}
              labelledBy={HEADING_ID}
            />
          ) : (
            <Text style={styles.none}>
              {`Nothing matches “${trimmed}”. Try a server name, or an action like “Add server”.`}
            </Text>
          )}
        </>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  screen: { gap: spacing.sm, padding: spacing.md },
  input: {
    height: 44,
    paddingHorizontal: 14,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.sepStrong,
    backgroundColor: colors.field,
    color: colors.text,
    fontSize: 16,
  },
  heading: {
    color: colors.textDim,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    paddingHorizontal: spacing.sm,
  },
  none: { color: colors.textDim, fontSize: 14, textAlign: 'center', paddingVertical: 20 },
})
