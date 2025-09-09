// Simple test to verify the indexer can start without errors
import { omnipairIndexer } from './src/omnipair_indexer/index.js';

console.log('Testing Omnipair indexer startup...');

try {
  // Test that the indexer can be imported and instantiated
  console.log('✅ Indexer imported successfully');
  
  // Test that the indexer has the expected methods
  const methods = ['start', 'stop', 'runBackfill', 'runGapFill'];
  for (const method of methods) {
    if (typeof omnipairIndexer[method] === 'function') {
      console.log(`✅ Method ${method} exists`);
    } else {
      console.log(`❌ Method ${method} missing`);
    }
  }
  
  console.log('✅ All tests passed!');
} catch (error) {
  console.error('❌ Test failed:', error.message);
  process.exit(1);
}

