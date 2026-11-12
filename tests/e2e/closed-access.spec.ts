import { test,expect } from '@playwright/test';
test('public registration shows RP fields and stays usable on mobile',async({page})=>{
  await page.setViewportSize({width:390,height:844});await page.goto('/register');
  await expect(page.getByRole('heading',{name:'Заявка на доступ'})).toBeVisible();
  for(const name of ['Static ID','Имя и фамилия','Игровой номер телефона','Организация','Запрашиваемые полномочия','Ваш пароль','Повторите пароль'])await expect(page.getByLabel(name,{exact:true})).toBeVisible();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});
test('pending status requires authentication',async({request})=>{
 const r=await request.get('/auth/pending',{maxRedirects:0});expect(r.status()).toBe(307);expect(r.headers().location).toBe('/login');
});
for(const path of ['/app','/app/cases','/app/cases/10000000-0000-4000-8000-000000000001','/app/treasury','/app/documents','/app/reports','/app/admin','/app/cases/new','/app/export/audit','/app/export/treasury','/app/files/10000000-0000-4000-8000-000000000001']) {
  test('anonymous request is redirected: '+path,async({request})=>{
    const response=await request.get(path,{maxRedirects:0});
    expect(response.status()).toBe(307); expect(response.headers().location).toBe('/login');
  });
}
test('login offers reviewed access requests and carries security headers',async({page})=>{
  const response=await page.goto('/login');
  await expect(page.getByRole('heading',{name:'Вход в систему',exact:true})).toBeVisible();
  await expect(page.getByLabel('Static ID / email')).toBeVisible();
  expect(response?.headers()['x-robots-tag']).toContain('noindex');
  expect(response?.headers()['x-frame-options']).toBe('DENY');
  await expect(page.locator('a[href="/register"]').first()).toBeVisible();
});
test('login remains usable on narrow screens',async({page})=>{
  await page.setViewportSize({width:390,height:844});await page.goto('/login');
  await expect(page.getByRole('button',{name:'Войти в систему'})).toBeVisible();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
});
test('expired invitation explains the problem and offers password recovery',async({page})=>{
  await page.goto('/login?error_code=otp_expired&error_description=UNTRUSTED_TEXT');
  await expect(page.getByRole('alert').filter({hasText:'Ссылка недействительна'})).toBeVisible();
  await expect(page.getByText('UNTRUSTED_TEXT')).toHaveCount(0);
  await page.getByRole('link',{name:'Установить или восстановить пароль'}).click();
  await expect(page.getByRole('heading',{name:'Установка пароля'})).toBeVisible();
  await expect(page.getByLabel('Электронная почта')).toBeVisible();
});
test('missing callback code cannot grant a session or redirect outside the app',async({request})=>{
  const r=await request.get('/auth/callback?next=https://example.com',{maxRedirects:0});
  expect(r.status()).toBe(307);expect(r.headers().location).toContain('/login?error_code=otp_expired');
});
test('password creation requires an authenticated session',async({request})=>{
  const r=await request.get('/auth/password',{maxRedirects:0});
  expect(r.status()).toBe(307);expect(r.headers().location).toBe('/login');
});

