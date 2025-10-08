import { Pool } from 'pg';
import dotenv from 'dotenv';
import { 
    calculateEmaFromPoolData, 
    fromNad, 
    toNad,
    DEFAULT_HALF_LIFE 
} from '../utils/emaCalculator';

dotenv.config();

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    max: 20,
    min: 5,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000,
});

const BATCH_SIZE = 1000;
const PAIR_BATCH_SIZE = 50;

interface SwapRow {
    id: number;
    pair: string;
    reserve0: string;
    reserve1: string;
    timestamp: string;
    tx_sig: string;
}

interface PairEmaState {
    lastPrice0Ema: number;
    lastPrice1Ema: number;
    lastUpdate: number;
}

async function getUniquePairs(): Promise<string[]> {
    console.log('Getting unique pairs...');
    
    const result = await pool.query(`
        SELECT DISTINCT pair 
        FROM swaps 
        WHERE pair IS NOT NULL 
        ORDER BY pair
    `);
    
    const pairs = result.rows.map(row => row.pair);
    console.log(`Found ${pairs.length} unique pairs`);
    
    return pairs;
}

async function getSwapsForPair(pair: string): Promise<SwapRow[]> {
    const result = await pool.query(`
        SELECT id, pair, reserve0, reserve1, timestamp, tx_sig
        FROM swaps 
        WHERE pair = $1 
        AND reserve0 IS NOT NULL 
        AND reserve1 IS NOT NULL 
        AND timestamp IS NOT NULL
        ORDER BY timestamp ASC, id ASC
    `, [pair]);
    
    return result.rows;
}

async function updateEmaBatch(updates: Array<{
    id: number;
    emaPrice: number;
}>): Promise<void> {
    if (updates.length === 0) return;
    
    const client = await pool.connect();
    
    try {
        await client.query('BEGIN');
        
        for (const update of updates) {
            await client.query(`
                UPDATE swaps 
                SET ema_price = $1 
                WHERE id = $2
            `, [update.emaPrice, update.id]);
        }
        
        await client.query('COMMIT');
    } catch (error) {
        await client.query('ROLLBACK');
        throw error;
    } finally {
        client.release();
    }
}

async function processPairSwaps(pair: string): Promise<number> {
    console.log(`Processing pair: ${pair}`);
    
    const swaps = await getSwapsForPair(pair);
    
    if (swaps.length === 0) {
        console.log(`No swaps found for pair: ${pair}`);
        return 0;
    }
    
    console.log(`Found ${swaps.length} swaps for pair: ${pair}`);
    
    let lastEma: PairEmaState | null = null;
    const updates: Array<{
        id: number;
        emaPrice: number;
    }> = [];
    
    for (let i = 0; i < swaps.length; i += BATCH_SIZE) {
        const batch = swaps.slice(i, i + BATCH_SIZE);
        
        for (const swap of batch) {
            try {
                let emaData;
                
                if (lastEma === null) {
                    emaData = calculateEmaFromPoolData(
                        swap.reserve0,
                        swap.reserve1
                    );
                } else {
                    emaData = calculateEmaFromPoolData(
                        swap.reserve0,
                        swap.reserve1,
                        lastEma.lastPrice0Ema,
                        lastEma.lastPrice1Ema,
                        lastEma.lastUpdate
                    );
                }
                
                const price0Ema = fromNad(emaData.price0Ema);
                
                updates.push({
                    id: swap.id,
                    emaPrice: price0Ema
                });
                
                lastEma = {
                    lastPrice0Ema: emaData.price0Ema,
                    lastPrice1Ema: emaData.price1Ema,
                    lastUpdate: Math.floor(new Date(swap.timestamp).getTime() / 1000)
                };
                
            } catch (error) {
                console.error(`Error processing swap ${swap.id}:`, error);
            }
        }
        
        if (updates.length > 0) {
            await updateEmaBatch(updates);
            console.log(`Updated ${updates.length} swaps for pair: ${pair}`);
            updates.length = 0;
        }
    }
    
    console.log(`Completed processing pair: ${pair} (${swaps.length} swaps)`);
    return swaps.length;
}

async function fillEmaPrices(): Promise<void> {
    console.log('Starting EMA price calculation for all swaps...\n');
    
    const startTime = Date.now();
    
    try {
        const pairs = await getUniquePairs();
        
        if (pairs.length === 0) {
            console.log('No pairs found in swaps table');
            return;
        }
        
        let totalSwaps = 0;
        let processedPairs = 0;
        
        for (let i = 0; i < pairs.length; i += PAIR_BATCH_SIZE) {
            const pairBatch = pairs.slice(i, i + PAIR_BATCH_SIZE);
            
            console.log(`Processing batch ${Math.floor(i / PAIR_BATCH_SIZE) + 1}/${Math.ceil(pairs.length / PAIR_BATCH_SIZE)}`);
            console.log(`Pairs: ${pairBatch.join(', ')}`);
            
            const promises = pairBatch.map(async (pair) => {
                try {
                    const swapCount = await processPairSwaps(pair);
                    return { pair, swapCount, success: true };
                } catch (error) {
                    console.error(`Error processing pair ${pair}:`, error);
                    return { pair, swapCount: 0, success: false, error };
                }
            });
            
            const results = await Promise.all(promises);
            
            for (const result of results) {
                if (result.success) {
                    totalSwaps += result.swapCount;
                    processedPairs++;
                    console.log(`${result.pair}: ${result.swapCount} swaps processed`);
                } else {
                    console.log(`${result.pair}: Failed to process`);
                }
            }
        }
        
        const endTime = Date.now();
        const duration = (endTime - startTime) / 1000;
        
        console.log('\nEMA price calculation completed!');
        console.log(`Summary:`);
        console.log(`   - Total pairs processed: ${processedPairs}/${pairs.length}`);
        console.log(`   - Total swaps updated: ${totalSwaps}`);
        console.log(`   - Duration: ${duration.toFixed(2)} seconds`);
        console.log(`   - Average: ${(totalSwaps / duration).toFixed(2)} swaps/second`);
        
    } catch (error) {
        console.error('Fatal error:', error);
        throw error;
    } finally {
        await pool.end();
    }
}

async function verifyResults(): Promise<void> {
    console.log('\nVerifying EMA calculation results...');
    
    try {
        const totalResult = await pool.query(`
            SELECT COUNT(*) as total_swaps
            FROM swaps
        `);
        
        const emaResult = await pool.query(`
            SELECT COUNT(*) as ema_swaps
            FROM swaps
            WHERE ema_price IS NOT NULL
        `);
        
        const totalSwaps = parseInt(totalResult.rows[0].total_swaps);
        const emaSwaps = parseInt(emaResult.rows[0].ema_swaps);
        
        console.log(`Verification Results:`);
        console.log(`   - Total swaps: ${totalSwaps}`);
        console.log(`   - Swaps with EMA: ${emaSwaps}`);
        console.log(`   - Coverage: ${((emaSwaps / totalSwaps) * 100).toFixed(2)}%`);
        
        if (emaSwaps === totalSwaps) {
            console.log('All swaps have EMA values!');
        } else {
            console.log('Some swaps are missing EMA values');
        }
        
        const sampleResult = await pool.query(`
            SELECT pair, reserve0, reserve1, ema_price, timestamp
            FROM swaps
            WHERE ema_price IS NOT NULL
            ORDER BY timestamp DESC
            LIMIT 5
        `);
        
        console.log('\nSample results:');
        console.log('Pair\t\t\tReserve0\tReserve1\tEMA Price');
        console.log('----\t\t\t--------\t--------\t---------');
        
        for (const row of sampleResult.rows) {
            const pair = row.pair.substring(0, 8) + '...';
            const reserve0 = (parseFloat(row.reserve0) / 1e6).toFixed(2) + 'M';
            const reserve1 = (parseFloat(row.reserve1) / 1e6).toFixed(2) + 'M';
            const emaPrice = parseFloat(row.ema_price).toFixed(6);
            
            console.log(`${pair}\t${reserve0}\t\t${reserve1}\t\t${emaPrice}`);
        }
        
    } catch (error) {
        console.error('Error verifying results:', error);
    }
}

async function main() {
    const args = process.argv.slice(2);
    const command = args[0];
    
    switch (command) {
        case 'fill':
            await fillEmaPrices();
            break;
        case 'verify':
            await verifyResults();
            break;
        case 'both':
            await fillEmaPrices();
            await verifyResults();
            break;
        default:
            console.log('Usage: npm run fill-ema [fill|verify|both]');
            console.log('  fill   - Fill EMA prices for all swaps');
            console.log('  verify - Verify EMA calculation results');
            console.log('  both   - Fill and verify');
            process.exit(1);
    }
}

if (require.main === module) {
    main().catch((error) => {
        console.error('Script failed:', error);
        process.exit(1);
    });
}

export { fillEmaPrices, verifyResults };