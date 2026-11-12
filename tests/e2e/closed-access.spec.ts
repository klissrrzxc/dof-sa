import { test,expect } from '@playwright/test';
for(const path of ['/app','/app/cases','/app/cases/10000000-0000-4000-8000-000000000001','/app/treasury','/app/documents','/app/reports','/app/admin']) {
  test('anonymous request is redirected: '+path,async({request})=>{
    const response=await request.get(path,{maxRedirects:0});
    expect(response.status()).toBe(307); expect(response.headers().location).toBe('/login');
  });
}
test('login has no signup or data and carries security headers',async({page})=>{
  const response=await page.goto('/login');
  await expect(page.getByRole('heading',{name:'Вход в рабочее пространство'})).toBeVisible();
  await expect(page.getByLabel('Электронная почта')).toBeVisible();
  expect(response?.headers()['x-robots-tag']).toContain('noindex');
  expect(response?.headers()['x-frame-options']).toBe('DENY');
  await expect(page.getByRole('link',{name:/регистрац/i})).toHaveCount(0);
});
test('login remains usable on narrow screens',async({page})=>{
  await page.setViewportSize({width:390,height:844});await page.goto('/login');
  await expect(page.getByRole('button',{name:'Войти в систему'})).toBeVisible();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
});
