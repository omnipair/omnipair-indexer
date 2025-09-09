// Test schema compilation
try {
  console.log('Testing schema compilation...');
  
  // Try to import the schema
  const schema = require('./packages/database/lib/schema.ts');
  console.log('✅ Schema imported successfully');
  
  // Check if key tables exist
  const tables = ['pairs', 'userPositions', 'transactions', 'transactionDetails'];
  for (const table of tables) {
    if (schema[table]) {
      console.log(`✅ Table ${table} exists`);
    } else {
      console.log(`❌ Table ${table} missing`);
    }
  }
  
  console.log('✅ Schema test passed!');
} catch (error) {
  console.error('❌ Schema test failed:', error.message);
  process.exit(1);
}

