import {defineConfig} from '@playwright/test';
export default defineConfig({testDir:'tests/pages',use:{baseURL:'http://127.0.0.1:4173'},webServer:{command:'node node_modules/vite/bin/vite.js preview',url:'http://127.0.0.1:4173',reuseExistingServer:!process.env.CI},projects:[{name:'chromium',use:{browserName:'chromium'}}]});
