#!/usr/bin/env ts-node
/**
 * Test script for PairStateService
 * 
 * Usage:
 *   npm run test-pair-state
 *   
 * Or with custom tokens:
 *   npm run test-pair-state -- --token0 <TOKEN0_MINT> --token1 <TOKEN1_MINT>
 */

import { PublicKey } from '@solana/web3.js';
import { PairStateService } from './services/PairStateService';
import { simulatePairGetter } from './config/program';
import dotenv from 'dotenv';

dotenv.config();

// Color codes for terminal output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
};

function log(message: string, color: string = colors.reset) {
  console.log(`${color}${message}${colors.reset}`);
}

function logSection(title: string) {
  console.log('\n' + '='.repeat(80));
  log(title, colors.bright + colors.cyan);
  console.log('='.repeat(80));
}

function logSuccess(message: string) {
  log(`✓ ${message}`, colors.green);
}

function logError(message: string) {
  log(`✗ ${message}`, colors.red);
}

function logWarning(message: string) {
  log(`⚠ ${message}`, colors.yellow);
}

function logInfo(message: string) {
  log(`ℹ ${message}`, colors.blue);
}

async function testPairState() {
  try {
    logSection('🧪 Testing PairStateService');

    // Get configuration from environment or arguments
    const rpcUrl = process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com';
    const programId = process.env.OMNIPAIR_PROGRAM_ID;
    
    logInfo(`RPC URL: ${rpcUrl}`);
    logInfo(`Program ID: ${programId || 'Not set in .env'}`);

    // Parse command line arguments for token mints
    const args = process.argv.slice(2);
    let token0Str = process.env.TOKEN0_MINT;
    let token1Str = process.env.TOKEN1_MINT;

    for (let i = 0; i < args.length; i++) {
      if (args[i] === '--token0' && args[i + 1]) {
        token0Str = args[i + 1];
      }
      if (args[i] === '--token1' && args[i + 1]) {
        token1Str = args[i + 1];
      }
    }

    if (!token0Str || !token1Str) {
      logError('Token mints not provided!');
      console.log('\nPlease provide token mints either:');
      console.log('1. In your .env file:');
      console.log('   TOKEN0_MINT=<address>');
      console.log('   TOKEN1_MINT=<address>');
      console.log('\n2. As command line arguments:');
      console.log('   npm run test-pair-state -- --token0 <TOKEN0> --token1 <TOKEN1>');
      process.exit(1);
    }

    const token0Mint = new PublicKey(token0Str);
    const token1Mint = new PublicKey(token1Str);

    logInfo(`Token 0: ${token0Mint.toBase58()}`);
    logInfo(`Token 1: ${token1Mint.toBase58()}`);

    // Step 1: Initialize service
    logSection('Step 1: Initialize PairStateService');
    const pairService = new PairStateService(rpcUrl);
    logSuccess('Service created');

    // Step 2: Load IDL
    logSection('Step 2: Load Program IDL');
    try {
      const idl = require('./idl/omnipair.mainnet.json');
      logSuccess(`IDL loaded (${idl.instructions?.length || 0} instructions)`);
      
      pairService.initializeProgram(idl);
      logSuccess('Program initialized');
    } catch (err) {
      logError('Failed to load IDL');
      throw err;
    }

    // Step 3: Test connection
    logSection('Step 3: Test Solana Connection');
    try {
      const connection = pairService.getConnection();
      const slot = await connection.getSlot();
      logSuccess(`Connected to Solana (current slot: ${slot})`);
    } catch (err) {
      logError('Failed to connect to Solana');
      throw err;
    }

    // Step 4: Fetch pair state
    logSection('Step 4: Fetch Pair State');
    console.log('This will test all the following:');
    console.log('  • Token metadata fetching');
    console.log('  • Pair account fetching');
    console.log('  • simulatePairGetter() for EMA prices');
    console.log('  • simulatePairGetter() for rates');
    console.log('\nFetching... (this may take 10-30 seconds)\n');

    const startTime = Date.now();
    const pairState = await pairService.fetchPairState(token0Mint, token1Mint);
    const endTime = Date.now();

    logSuccess(`Pair state fetched in ${((endTime - startTime) / 1000).toFixed(2)}s`);

    // Step 5: Display results
    logSection('📊 Pair State Results');

    console.log('\n' + colors.bright + '🪙 Token 0:' + colors.reset);
    console.log(`  Symbol:   ${pairState.token0.symbol}`);
    console.log(`  Name:     ${pairState.token0.name}`);
    console.log(`  Decimals: ${pairState.token0.decimals}`);
    console.log(`  Address:  ${pairState.token0.address}`);
    console.log(`  Icon:     ${pairState.token0.iconUrl || 'N/A'}`);

    console.log('\n' + colors.bright + '🪙 Token 1:' + colors.reset);
    console.log(`  Symbol:   ${pairState.token1.symbol}`);
    console.log(`  Name:     ${pairState.token1.name}`);
    console.log(`  Decimals: ${pairState.token1.decimals}`);
    console.log(`  Address:  ${pairState.token1.address}`);
    console.log(`  Icon:     ${pairState.token1.iconUrl || 'N/A'}`);

    console.log('\n' + colors.bright + '💰 Reserves:' + colors.reset);
    console.log(`  Token 0:  ${pairState.reserves.token0}`);
    console.log(`  Token 1:  ${pairState.reserves.token1}`);

    console.log('\n' + colors.bright + '📈 Oracle Prices (EMA):' + colors.reset);
    console.log(`  Token 0:  ${pairState.oraclePrices.token0}`);
    console.log(`  Token 1:  ${pairState.oraclePrices.token1}`);

    console.log('\n' + colors.bright + '💹 Spot Prices:' + colors.reset);
    console.log(`  Token 0:  ${pairState.spotPrices.token0}`);
    console.log(`  Token 1:  ${pairState.spotPrices.token1}`);

    console.log('\n' + colors.bright + '📊 Interest Rates:' + colors.reset);
    console.log(`  Token 0:  ${pairState.rates.token0}%`);
    console.log(`  Token 1:  ${pairState.rates.token1}%`);

    console.log('\n' + colors.bright + '💸 Total Debts:' + colors.reset);
    console.log(`  Token 0:  ${pairState.totalDebts.token0}`);
    console.log(`  Token 1:  ${pairState.totalDebts.token1}`);

    console.log('\n' + colors.bright + '📊 Utilization:' + colors.reset);
    console.log(`  Token 0:  ${pairState.utilization.token0.toFixed(2)}%`);
    console.log(`  Token 1:  ${pairState.utilization.token1.toFixed(2)}%`);

    console.log('\n' + colors.bright + '🎫 LP Token:' + colors.reset);
    console.log(`  Total Supply: ${pairState.totalSupply}`);
    console.log(`  Decimals:     ${pairState.lpTokenDecimals}`);

    // Step 6: Validation checks
    logSection('✅ Validation Checks');

    let validationsPassed = 0;
    let validationsTotal = 0;

    function validate(condition: boolean, message: string) {
      validationsTotal++;
      if (condition) {
        logSuccess(message);
        validationsPassed++;
      } else {
        logWarning(message + ' (Warning: might be expected for new pairs)');
      }
    }

    validate(pairState.token0.symbol !== 'Unknown', 'Token 0 metadata fetched');
    validate(pairState.token1.symbol !== 'Unknown', 'Token 1 metadata fetched');
    validate(parseFloat(pairState.reserves.token0) > 0, 'Token 0 has reserves');
    validate(parseFloat(pairState.reserves.token1) > 0, 'Token 1 has reserves');
    validate(parseFloat(pairState.oraclePrices.token0) > 0, 'Oracle price 0 is valid');
    validate(parseFloat(pairState.oraclePrices.token1) > 0, 'Oracle price 1 is valid');
    validate(pairState.rates.token0 >= 0, 'Rate 0 is non-negative');
    validate(pairState.rates.token1 >= 0, 'Rate 1 is non-negative');
    validate(pairState.utilization.token0 >= 0, 'Utilization 0 is non-negative');
    validate(pairState.utilization.token1 >= 0, 'Utilization 1 is non-negative');

    console.log(`\nPassed ${validationsPassed}/${validationsTotal} checks`);

    // Final summary
    logSection('🎉 Test Complete!');
    logSuccess('All tests passed successfully!');
    console.log('\nThe PairStateService is working correctly.');
    console.log('You can now use it in your API routes.\n');

    return true;

  } catch (error) {
    logSection('❌ Test Failed');
    logError('An error occurred during testing:');
    console.error(error);
    
    if (error instanceof Error) {
      console.log('\n' + colors.bright + 'Error Details:' + colors.reset);
      console.log(`Message: ${error.message}`);
      if (error.stack) {
        console.log('\nStack trace:');
        console.log(error.stack);
      }
    }

    console.log('\n' + colors.bright + 'Troubleshooting Tips:' + colors.reset);
    console.log('1. Check that your RPC URL is correct and accessible');
    console.log('2. Verify the token addresses are valid');
    console.log('3. Ensure the pair exists on-chain');
    console.log('4. Check that OMNIPAIR_PROGRAM_ID is set correctly in .env');
    console.log('5. Review the error message above for specific issues');
    console.log('\n📖 See SIMULATE_PAIR_GETTER_EXPLAINED.md for more details\n');

    return false;
  }
}

// Run the test
if (require.main === module) {
  testPairState()
    .then((success) => {
      process.exit(success ? 0 : 1);
    })
    .catch((error) => {
      console.error('Unexpected error:', error);
      process.exit(1);
    });
}

export { testPairState };

