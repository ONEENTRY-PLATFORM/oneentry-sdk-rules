/**
 * Детальная инспекция блоков — структура attributeValues, маркеры атрибутов
 * Запуск: node .claude/temp/inspect-blocks.mjs
 * Аргументы: node .claude/temp/inspect-blocks.mjs shop  ← pageUrl
 */
import { defineOneEntry } from 'oneentry';

const URL = 'https://react-native-course.oneentry.cloud';
const TOKEN = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJuYW1lIjoiZGVtbyBzaXRlIiwic2VyaWFsTnVtYmVyIjo1LCJpYXQiOjE3Mzk5NTg4MDEsImV4cCI6MjUyODgyNzE5OX0.REmrbGUmGuLKxTHxsIu9-HKv7FYLud5_UuiXQoZ_S_s';

const api = defineOneEntry(URL, { token: TOKEN });

const pageUrl = process.argv[2] || 'home';

async function run() {
  console.log(`\n=== BLOCKS for page "${pageUrl}" ===`);
  const blocks = await api.Pages.getBlocksByPageUrl(pageUrl);

  if (!Array.isArray(blocks)) {
    console.log('Error or no blocks:', blocks);
    return;
  }

  blocks
    .sort((a, b) => a.position - b.position)
    .forEach(block => {
      console.log(`\n--- [pos:${block.position}] ${block.identifier} ---`);
      console.log(`  title: "${block.localizeInfos?.title}"`);
      const attrs = block.attributeValues || {};
      Object.entries(attrs).forEach(([marker, attr]) => {
        const val = attr?.value;
        let preview = '';
        if (attr?.type === 'image' || attr?.type === 'groupOfImages') {
          preview = Array.isArray(val) ? `[${val.length} image(s)] ${val[0]?.downloadLink?.slice(0, 60)}...` : String(val);
        } else if (attr?.type === 'list') {
          preview = JSON.stringify(val)?.slice(0, 80);
        } else {
          preview = String(val)?.slice(0, 80);
        }
        console.log(`  attr [${attr?.type}] ${marker}: ${preview}`);
      });
    });
}

run().catch(console.error);
