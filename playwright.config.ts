import { defineConfig } from '@playwright/test';
export default defineConfig({
 testDir:'tests', testMatch:'*.spec.ts', use:{baseURL:'http://127.0.0.1:4191'},
 webServer:{command:'node node_modules/vite/bin/vite.js preview --host 127.0.0.1 --port 4191 --strictPort',url:'http://127.0.0.1:4191',reuseExistingServer:false},
});



