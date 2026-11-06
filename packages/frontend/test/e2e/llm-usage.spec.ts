/*
 * SPDX-FileCopyrightText: lqvp
 * SPDX-License-Identifier: AGPL-3.0-only
 */
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { test, expect } from './fixtures.js';
import { api, BASE_URL, registerUser, resetState } from './utils.js';

// Match the backend test configuration rather than a developer's default database.
const requireBackend = createRequire(new URL('../../../backend/package.json', import.meta.url));
const { Client } = requireBackend('pg');
const { load } = requireBackend('js-yaml');
const config = load(readFileSync(fileURLToPath(new URL('../../../../.config/test.yml', import.meta.url)), 'utf8'));

test('admin statistics keep bigint counters exact, page missing users, and confirm retention changes', async ({ page }, testInfo) => {
 const pageErrors: string[] = [];
 page.on('pageerror', error => { if (!(error.message.includes('Failed to register a ServiceWorker') && error.message.includes('/sw.js') && error.message.includes('(404)'))) pageErrors.push(error.message); });
 await resetState();
 const registered = await registerUser('admin', 'usage-fixture-password', true);
 await api(BASE_URL, 'i/registry/set', { i: registered.token, scope: ['client', 'base'], key: 'accountSetupWizard', value: -1 });
 const account = { ...await api(BASE_URL, 'i', { i: registered.token }), token: registered.token };
 const db = new Client({ host: config.db.host, port: config.db.port, database: config.db.db, user: config.db.user, password: config.db.pass });
 await db.connect();
 const date = new Date().toISOString().slice(0, 10);
 try {
  await db.query(`INSERT INTO llm_usage_daily (date,"userId",purpose,model,requests,successes,failures,"inputTokens","inputSamples","totalTokens","totalSamples") SELECT $1,'fixture-'||i,'other','fixture-model',3,2,1,0,2,CASE WHEN i=1 THEN 9007199254739633::bigint ELSE 40 END,2 FROM generate_series(1,35) i`, [date]);
  await db.query(`INSERT INTO llm_usage_daily_total (date,purpose,model,requests,successes,failures,"inputTokens","inputSamples","totalTokens","totalSamples") VALUES ($1,'other','fixture-model',105,70,35,0,70,9007199254740993,70)`, [date]);
 } finally { await db.end(); }
 await page.addInitScript(account => {
  localStorage.setItem('account', JSON.stringify(account)); localStorage.setItem('lang', 'ja-JP');
  localStorage.setItem('lastVersion', '2026.10.1-tempura-2.0.23-dev');
  localStorage.setItem('modifiedVersionMustProminentlyOfferInAgplV3Section13Read', 'true');
 }, account);
 await page.goto('/admin/llm-usage');
 await page.getByText('期間内の利用アカウント数', { exact: true }).waitFor({ state: 'attached', timeout: 25000 });
 for (let i = 0; i < 8; i++) {
  const ok = page.getByRole('button', { name: 'OK', exact: true });
  const later = page.getByRole('button', { name: 'あとで', exact: true });
  const understood = page.getByRole('button', { name: 'わかった', exact: true });
  if (await ok.count()) await ok.last().click({ timeout: 1500 }).catch(() => {});
  else if (await later.count()) await later.last().click({ timeout: 1500 }).catch(() => {});
  else if (await understood.count()) await understood.last().click({ timeout: 1500 }).catch(() => {});
  else break;
 }
 const summary = page.getByTestId('usage-summary');
 await expect(summary).toContainText('105'); await expect(summary).toContainText('9,007,199,254,740,993');
 await page.locator('button').filter({ has: page.getByText('利用アカウント別', { exact: true }) }).click();
 await expect(page.getByText('削除済み・不明なアカウント', { exact: true })).toHaveCount(30);
 await page.locator('button').filter({ hasText: /^次\s*$/ }).click();
 await expect(page.getByText('削除済み・不明なアカウント', { exact: true })).toHaveCount(5);
 await page.locator('button').filter({ hasText: '戻る' }).click();
 await expect(page.getByText('削除済み・不明なアカウント', { exact: true })).toHaveCount(30);
 await page.route('**/api/admin/llm-usage/users', route => route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ error: { message: 'fixture-users-unavailable', code: 'INTERNAL_ERROR', id: 'fixture' } }) }));
 await page.goto('/admin/llm-usage');
 await expect(page.getByTestId('usage-summary')).toContainText('9,007,199,254,740,993');
 await page.locator('button').filter({ has: page.getByText('利用アカウント別', { exact: true }) }).click();
 await expect(page.getByText('fixture-users-unavailable', { exact: false })).toBeVisible();
 await page.screenshot({ path: testInfo.outputPath('users-error-isolated.png'), animations: 'disabled' });
 await page.locator('button').filter({ has: page.getByText('概要', { exact: true }) }).click();
 await expect(page.getByTestId('usage-summary')).toContainText('9,007,199,254,740,993');
 await page.screenshot({ path: testInfo.outputPath('overview-despite-users-error.png'), animations: 'disabled' });
 await page.unroute('**/api/admin/llm-usage/users');
 await page.goto('/admin/tempura-admin');
 await page.getByText('LLM設定', { exact: false }).first().click();
 const input = page.getByText('統計の保持月数', { exact: true }).locator('..').locator('input');
 await input.fill('6'); await input.press('Tab');
 const save = input.locator('xpath=ancestor::*[@role="group"][1]').locator('button').filter({ hasText: '保存' });
 let updates = 0;
 page.on('request', request => { if (request.url().endsWith('/api/admin/update-meta')) updates++; });
 await save.click(); await page.getByRole('button', { name: 'キャンセル', exact: true }).click();
 expect(updates).toBe(0);
 expect((await api(BASE_URL, 'admin/meta', { i: registered.token })).llmUsageRetentionMonths).toBe(12);
 await page.route('**/api/admin/update-meta', route => route.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ error: { message: 'Retention boundary changed. Confirm the server date again.', code: 'RETENTION_BOUNDARY_CHANGED', id: '44670c6f-a32d-49d0-a5ba-93df7c3f25ea' } }) }));
 await save.click(); await page.getByRole('button', { name: 'OK', exact: true }).last().click();
 await expect(page.getByText('サーバーの日付が変わり、削除の境界日が変わりました。保持期間は保存していません。もう一度保存して、新しい境界日を確認してください。', { exact: true })).toBeVisible();
 await expect(page.getByTestId('modal-dialog-ok')).toHaveCount(1);
 await expect(page.getByRole('button', { name: 'わかった', exact: true })).toBeVisible();
 await page.screenshot({ path: testInfo.outputPath('server-boundary-changed-once.png'), animations: 'disabled' });
 await page.getByRole('button', { name: 'わかった', exact: true }).click();
 expect(updates).toBe(1);
 expect((await api(BASE_URL, 'admin/meta', { i: registered.token })).llmUsageRetentionMonths).toBe(12);
 await page.unroute('**/api/admin/update-meta');
 await save.click(); await page.getByRole('button', { name: 'OK', exact: true }).last().click();
 await expect.poll(async () => (await api(BASE_URL, 'admin/meta', { i: registered.token })).llmUsageRetentionMonths).toBe(6);
 expect(updates).toBe(2);
 expect(pageErrors).toEqual([]);
});
