import Dexie from 'dexie';

// Create a local database in the browser
export const db = new Dexie('IMFLBillingDB');

// Define the schema. Only indexed fields need to be listed.
// We must index 'barcode', 'item_code' and 'sort_key' so offline search is lightning fast.
db.version(1).stores({
  products: 'id, barcode, item_code, name, company_id' 
});

// Version 2: Add sort_key index
db.version(2).stores({
  products: 'id, barcode, sort_key, item_code, name, company_id'
});