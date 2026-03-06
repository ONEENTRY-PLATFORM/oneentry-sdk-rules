/**
 * Инспекция товаров — структура attributeValues, статусы, pageUrl
 * Запуск: node .claude/temp/inspect-products.mjs
 * Аргументы: node .claude/temp/inspect-products.mjs ship_designer  ← pageUrl категории
 */
import { defineOneEntry } from 'oneentry';

const URL = 'https://react-native-course.oneentry.cloud';
const TOKEN = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJuYW1lIjoiZGVtbyBzaXRlIiwic2VyaWFsTnVtYmVyIjo1LCJpYXQiOjE3Mzk5NTg4MDEsImV4cCI6MjUyODgyNzE5OX0.REmrbGUmGuLKxTHxsIu9-HKv7FYLud5_UuiXQoZ_S_s';

const api = defineOneEntry(URL, { token: TOKEN });

const pageUrl = process.argv[2];

async function run() {
  console.log('\n=== PRODUCT STATUSES ===');
  const statuses = await api.ProductStatuses.getProductStatuses();
  if (Array.isArray(statuses)) {
    statuses.forEach(s => console.log(`  ${s.identifier} — "${s.localizeInfos?.title}"`));
  }

  let products;
  if (pageUrl) {
    console.log(`\n=== PRODUCTS by pageUrl "${pageUrl}" (limit 3) ===`);
    products = await api.Products.getProductsByPageUrl(pageUrl, [], undefined, { limit: 3 });
  } else {
    console.log('\n=== ALL PRODUCTS (limit 3) ===');
    products = await api.Products.getProducts([], undefined, { limit: 3 });
  }

  const items = products?.items || products || [];
  if (!Array.isArray(items) || items.length === 0) {
    console.log('No products or error:', products);
    return;
  }

  const first = items[0];
  console.log(`\n--- First product: id:${first.id} "${first.localizeInfos?.title}" ---`);
  console.log(`  statusIdentifier: ${first.statusIdentifier}`);
  console.log(`  pageUrl: ${first.pageUrl}`);
  console.log(`  price: ${first.price}`);

  console.log('\n  attributeValues:');
  const attrs = first.attributeValues || {};
  Object.entries(attrs).forEach(([marker, attr]) => {
    const val = attr?.value;
    let preview = '';
    if (attr?.type === 'image' || attr?.type === 'groupOfImages') {
      preview = Array.isArray(val) ? `[${val.length} imgs] ${val[0]?.downloadLink?.slice(0, 60)}` : String(val);
    } else if (typeof val === 'object') {
      preview = JSON.stringify(val)?.slice(0, 80);
    } else {
      preview = String(val)?.slice(0, 80);
    }
    console.log(`    [${attr?.type}] ${marker}: ${preview}`);
  });
}

run().catch(console.error);
