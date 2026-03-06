/**
 * Общая инспекция API — маркеры страниц, меню, блоков, локалей, форм
 * Запуск: node .claude/temp/inspect-api.mjs
 */
import { defineOneEntry } from 'oneentry';

const URL = 'https://react-native-course.oneentry.cloud';
const TOKEN = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJuYW1lIjoiZGVtbyBzaXRlIiwic2VyaWFsTnVtYmVyIjo1LCJpYXQiOjE3Mzk5NTg4MDEsImV4cCI6MjUyODgyNzE5OX0.REmrbGUmGuLKxTHxsIu9-HKv7FYLud5_UuiXQoZ_S_s';

const api = defineOneEntry(URL, { token: TOKEN });

async function run() {
  console.log('\n=== LOCALES ===');
  const locales = await api.Locales.getLocales();
  console.log(JSON.stringify(locales, null, 2));

  console.log('\n=== ROOT PAGES ===');
  const rootPages = await api.Pages.getRootPages();
  if (Array.isArray(rootPages)) {
    rootPages.forEach(p => console.log(`  ${p.pageUrl} (id:${p.id}) — "${p.localizeInfos?.title}"`));
  }

  console.log('\n=== ALL PAGES ===');
  const allPages = await api.Pages.getPages();
  if (Array.isArray(allPages)) {
    allPages.forEach(p => console.log(`  ${p.pageUrl} (id:${p.id}, parentId:${p.parentId}) — "${p.localizeInfos?.title}"`));
  }

  console.log('\n=== HOME BLOCKS ===');
  const blocks = await api.Pages.getBlocksByPageUrl('home');
  if (Array.isArray(blocks)) {
    blocks.forEach(b => console.log(`  pos:${b.position} identifier:${b.identifier} — "${b.localizeInfos?.title}"`));
  }

  console.log('\n=== FORMS ===');
  const forms = await api.Forms.getAllForms();
  if (Array.isArray(forms)) {
    forms.forEach(f => console.log(`  ${f.identifier} — "${f.localizeInfos?.title}"`));
  }

  console.log('\n=== AUTH PROVIDERS ===');
  const providers = await api.AuthProvider.getAuthProviders();
  if (Array.isArray(providers)) {
    providers.forEach(p => console.log(`  ${p.identifier} — "${p.localizeInfos?.title}"`));
  }
}

run().catch(console.error);
