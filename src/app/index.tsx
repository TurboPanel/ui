import { View, Text, StyleSheet } from 'react-native'

export default function ComingSoon() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>TurboPanel</Text>
      <Text style={styles.subtitle}>Coming Soon</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#fff',
  },
  subtitle: {
    fontSize: 18,
    color: '#888',
    marginTop: 8,
  },
})
