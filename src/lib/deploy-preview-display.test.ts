import { describe, expect, it } from 'vitest'
import { preparedPerServerCompose } from './deploy-preview-display'
import type { DeployPreviewServer } from './instance-api'

const FILE = {
  filename: 'compose.yaml',
  role: 'runtime' as const,
  content: 'services: {}\n',
}

function server(id: string, name: string): DeployPreviewServer {
  return { serverId: id, name, composeFiles: [FILE], services: ['adminer'] }
}

describe('preparedPerServerCompose', () => {
  it('hides a single-server duplicate of the top-level runtime file', () => {
    expect(preparedPerServerCompose([server('s1', 'au1')])).toEqual([])
    expect(preparedPerServerCompose(undefined)).toEqual([])
  })

  it('keeps per-host blocks when the plan spans servers', () => {
    const rows = [server('s1', 'au1'), server('s2', 'au2')]
    expect(preparedPerServerCompose(rows)).toEqual(rows)
  })
})
