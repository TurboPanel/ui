import { expect, test } from '@playwright/test'
import { ENVIRONMENT_ID, mockApi, ORG_ID, PROJECT_ID } from './fixtures/api'

const PROJECT_URL = `/${ORG_ID}/projects/${PROJECT_ID}`
const ENVIRONMENT_URL = `${PROJECT_URL}/environments/${ENVIRONMENT_ID}`

test('sign in, Projects, theme switch, project and environment tabs', async ({
  page,
}, testInfo) => {
  const api = await mockApi(page)
  const pageErrors: string[] = []
  page.on('pageerror', (error) => pageErrors.push(error.message))

  // Sign in.
  await page.goto('/sign-in')
  await page.getByLabel(/email/i).first().fill('owner@example.test')
  await page.getByLabel(/password/i).first().fill('not-a-real-password')
  await page.getByRole('button', { name: 'Sign In', exact: true }).click()

  // Projects.
  await expect(page).toHaveURL(`/${ORG_ID}/projects`)
  await expect(page.getByText('1 project · 1 environment')).toBeVisible()
  await expect(page.getByText('Smoke Project')).toBeVisible()

  // Theme switch: the page background follows the choice.
  const html = page.locator('html')
  await page.getByRole('radio', { name: 'Dark' }).click()
  await expect(html).toHaveClass(/t_dark/)
  await page.getByRole('radio', { name: 'Light' }).click()
  await expect(html).toHaveClass(/t_light/)

  // Project tabs (the Environments tab is `overview`). A Compose project's
  // tab bar entries answer to the tab role.
  await page.getByText('Open', { exact: true }).first().click()
  await expect(page).toHaveURL(`${PROJECT_URL}/overview`)
  const projectTabs = page.getByRole('tablist', { name: 'Project sections' })
  for (const [label, path] of [
    ['Base', 'base'],
    ['Settings', 'settings'],
    ['Environments', 'overview'],
  ] as const) {
    await projectTabs.getByRole('tab', { name: label }).click()
    await expect(page).toHaveURL(`${PROJECT_URL}/${path}`)
  }

  // Environment tabs.
  await page.getByRole('button', { name: 'Open production' }).click()
  await expect(page).toHaveURL(ENVIRONMENT_URL)
  const environmentTabs = page.getByRole('tablist', {
    name: 'Environment sections',
  })
  for (const [label, path] of [
    ['Deployments', '/deployments'],
    ['Configuration', '/configuration'],
    ['Settings', '/settings'],
    ['Overview', ''],
  ] as const) {
    await environmentTabs.getByRole('tab', { name: label }).click()
    await expect(page).toHaveURL(`${ENVIRONMENT_URL}${path}`)
  }

  // A screen that throws is a failure; an unanswered API call is only noted,
  // so a new screen's request never breaks this test for an unrelated reason.
  expect(pageErrors).toEqual([])
  for (const call of new Set(api.unmocked)) {
    testInfo.annotations.push({ type: 'unmocked', description: call })
  }
})
