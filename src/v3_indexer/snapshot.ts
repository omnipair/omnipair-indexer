import * as splToken from '@solana/spl-token';
import { PublicKey } from "@solana/web3.js";
import { log } from "../logger/logger";
import pLimit from "p-limit";
import { updateOrInsertTokenBalance } from "../v4_indexer/processor";
import { connection, conditionalVaultClient } from "./connection";
import { db, schema, eq, or, inArray } from "@metadaoproject/indexer-db";

const logger = log.child({
  module: "market_actor_query"
});

/**
 * Captures token balance snapshot and finds all market accounts and their actors
 * for conditional token mints found in active vaults, then updates token balances
 * for those actors only for mints relevant to their markets.
 */
export async function captureTokenBalanceSnapshotV3(): Promise<{message: string, error: Error | undefined}> {
  try {
    logger.info("Starting token balance snapshot for active vaults");
    
    // Step 1: Get all conditional vaults directly from the chain
    logger.info("Fetching conditional vaults from chain...");
    const allVaultAccounts = await conditionalVaultClient.vaultProgram.account.conditionalVault.all();
    logger.info(`Found ${allVaultAccounts.length} total conditional vaults`);
    
    // Step 2: Filter vaults to only those with non-zero balances
    const activeVaults = [];
    for (const vaultData of allVaultAccounts) {
      try {
        const vault = vaultData.account;
        
        const underlyingAccount = await splToken.getAccount(connection, vault.underlyingTokenAccount);
        
        if (underlyingAccount.amount > 0) {
            activeVaults.push({
              publicKey: vaultData.publicKey,
              account: vault,
            });
        }
      } catch (error) {
        // Skip vaults with errors (e.g., closed accounts)
        logger.debug(`Skipping vault ${vaultData.publicKey.toString()}: ${error}`);
      }
    }
    
    logger.info(`Found ${activeVaults.length} active vaults with non-zero balances`);
    
    // Step 3: Collect all conditional token mints from active vaults
    const conditionalMints = new Set<string>();
    const conditionalMintPubkeys = new Map<string, PublicKey>(); // Map from string to PublicKey for easier lookups
    
    for (const vault of activeVaults) {
        if (vault.account.conditionalOnFinalizeTokenMint) {
            const mintStr = vault.account.conditionalOnFinalizeTokenMint.toString();
            conditionalMints.add(mintStr);
            conditionalMintPubkeys.set(mintStr, vault.account.conditionalOnFinalizeTokenMint);
        }
        if (vault.account.conditionalOnRevertTokenMint) {
            const mintStr = vault.account.conditionalOnRevertTokenMint.toString();
            conditionalMints.add(mintStr);
            conditionalMintPubkeys.set(mintStr, vault.account.conditionalOnRevertTokenMint);
        }
    }
    
    logger.info(`Found ${conditionalMints.size} unique conditional token mints`);
    
    // Step 4: Query the database to find markets where either base_mint_acct or quote_mint_acct 
    // matches one of our conditional mints
    logger.info(`Querying markets for conditional mints...`);
    
    const mintsArray = Array.from(conditionalMints);
    if (mintsArray.length === 0) {
        return {
            message: "No conditional mints found in active vaults",
            error: undefined
        };
    }
    
    const marketResults = await db.select({
      marketAcct: schema.markets.marketAcct,
      baseMintAcct: schema.markets.baseMintAcct,
      quoteMintAcct: schema.markets.quoteMintAcct
    })
    .from(schema.markets)
    .where(
      or(
        inArray(schema.markets.baseMintAcct, mintsArray),
        inArray(schema.markets.quoteMintAcct, mintsArray)
      )
    );
    
    logger.info(`Found ${marketResults.length} markets related to conditional tokens`);
    
    // Step 5: Create a mapping of markets to their mints for efficient lookups
    // This maps each market to the conditional mint(s) used in that market
    const marketToMintsMap = new Map<string, Set<string>>();
    
    for (const market of marketResults) {
        if (!market.marketAcct) continue;
        
        const marketAcct = market.marketAcct;
        marketToMintsMap.set(marketAcct, new Set<string>());
        
        // Add base mint if it's a conditional mint
        if (market.baseMintAcct && conditionalMints.has(market.baseMintAcct)) {
            marketToMintsMap.get(marketAcct)?.add(market.baseMintAcct);
        }
        
        // Add quote mint if it's a conditional mint
        if (market.quoteMintAcct && conditionalMints.has(market.quoteMintAcct)) {
            marketToMintsMap.get(marketAcct)?.add(market.quoteMintAcct);
        }
    }
    
    // Step 6: Get actors for each market and map them to relevant mints
    if (marketResults.length === 0) {
      return {
        message: "No markets found for conditional token mints",
        error: undefined
      };
    }
    
    // Create a list of all market accounts to query
    const marketAccounts = marketResults
      .filter(market => market.marketAcct) // Filter out any undefined
      .map(market => market.marketAcct as string); // Force TS to treat as string
    
    logger.info(`Querying actors for ${marketAccounts.length} markets...`);
    
    // This map will store actor pubkeys and the set of mint strings they should be checked for
    const actorToMintsMap = new Map<string, Set<string>>();
    
    // Rate limit database queries to avoid overwhelming the database
    const dbQueryLimit = pLimit(3);
    
    // Process markets in batches of 10 to avoid query size limitations
    const BATCH_SIZE = 10;
    const batches = [];
    
    for (let i = 0; i < marketAccounts.length; i += BATCH_SIZE) {
      batches.push(marketAccounts.slice(i, i + BATCH_SIZE));
    }
    
    const batchTasks = batches.map(batch => 
      dbQueryLimit(async () => {
        try {
          // Query all actors for the markets in this batch
          const actorResults = await db.select({
            marketAcct: schema.orders.marketAcct,
            actorAcct: schema.orders.actorAcct
          })
          .from(schema.orders)
          .where(inArray(schema.orders.marketAcct, batch))
          .orderBy(schema.orders.marketAcct);
          
          // Process results and map actors to the mints they should be checked for
          for (const row of actorResults) {
            if (!row.marketAcct || !row.actorAcct) continue;
            
            // Get the mints for this market
            const marketMints = marketToMintsMap.get(row.marketAcct);
            if (!marketMints || marketMints.size === 0) continue;
            
            // Initialize the actor in the map if not already present
            if (!actorToMintsMap.has(row.actorAcct)) {
                actorToMintsMap.set(row.actorAcct, new Set<string>());
            }
            
            // Add all mints from this market to the actor's set
            const actorMints = actorToMintsMap.get(row.actorAcct) as Set<string>;
            for (const mint of marketMints) {
                actorMints.add(mint);
            }
          }
        } catch (error) {
          logger.error(`Error querying actors for markets batch: ${error}`);
        }
      })
    );
    
    // Wait for all batches to complete
    await Promise.all(batchTasks);
    
    logger.info(`Found ${actorToMintsMap.size} unique actors across all markets`);
    
    // Step 7: Process token balances for all identified actors and their relevant mints
    logger.info(`Fetching token balances for ${actorToMintsMap.size} actors with their relevant mints...`);
    
    let tokenAccountCount = 0;
    let updatedBalanceCount = 0;
    let errorCount = 0;
    
    // Process actors with rate limiting
    const actorProcessLimit = pLimit(2);
    const actorTasks = Array.from(actorToMintsMap.entries()).map(([actorAddrStr, mintStrSet]) => 
      actorProcessLimit(async () => {
        try {
          const actorPubkey = new PublicKey(actorAddrStr);
          
          // Process only the mints relevant to this actor (from their market interactions)
          for (const mintStr of mintStrSet) {
            try {
              // Get the PublicKey for this mint
              const mintPubkey = conditionalMintPubkeys.get(mintStr);
              if (!mintPubkey) continue;
              
              // Find the actor's token account for this mint using ATA (most common token account type)
              const tokenAccount = splToken.getAssociatedTokenAddressSync(
                mintPubkey,
                actorPubkey,
                true,
              );
              
              tokenAccountCount++;
              
              // Process the token account
              try {
                // Get the token account info
                const tokenAccountInfo = await splToken.getAccount(connection, tokenAccount);
                
                // Only update accounts with non-zero balances
                if (tokenAccountInfo.amount > 0) {
                  // Update the token_accts table
                  logger.info(`Updating token account ${tokenAccount.toString()} with balance ${tokenAccountInfo.amount}`);
                //   await updateOrInsertTokenBalance(
                //     db,
                //     tokenAccount,
                //     BigInt(tokenAccountInfo.amount.toString()),
                //     mintPubkey,
                //     tokenAccountInfo.owner,
                //     "market_actor_snapshot",
                //     "0",
                //     Math.floor(Date.now() / 1000)
                //   );
                  
                  updatedBalanceCount++;
                }
              } catch (tokenError) {
                // Only log detailed errors for accounts that should exist
                if (!(tokenError instanceof splToken.TokenAccountNotFoundError)) {
                  logger.debug(`Error processing token account ${tokenAccount.toString()}: ${tokenError}`);
                  errorCount++;
                }
              }
              
              // Small delay between token accounts to avoid rate limits
              await delay(2000);
              
            } catch (mintError) {
              logger.debug(`Error finding token accounts for actor ${actorAddrStr} and mint ${mintStr}: ${mintError}`);
              errorCount++;
            }
          }
        } catch (actorError) {
          logger.warn(`Error processing actor ${actorAddrStr}: ${actorError}`);
          errorCount++;
        }
        
        // Small delay between actors to avoid rate limits
        await delay(2000);
      })
    );
    
    // Process actors in chunks to prevent memory issues with many promises
    const ACTOR_CHUNK_SIZE = 50;
    const actorChunks = [];
    
    for (let i = 0; i < actorTasks.length; i += ACTOR_CHUNK_SIZE) {
      actorChunks.push(actorTasks.slice(i, i + ACTOR_CHUNK_SIZE));
    }
    
    logger.info(`Processing ${actorChunks.length} chunks of actors...`);
    
    for (let i = 0; i < actorChunks.length; i++) {
      const chunk = actorChunks[i];
      logger.info(`Processing actor chunk ${i+1} of ${actorChunks.length}...`);
      
      // Wait for current chunk to complete
      await Promise.all(chunk);
      
      // Brief pause between chunks
      await delay(1000);
    }
    
    // Calculate average number of mints per actor for reporting
    let totalMintChecks = 0;
    for (const mintSet of actorToMintsMap.values()) {
        totalMintChecks += mintSet.size;
    }
    const avgMintsPerActor = actorToMintsMap.size > 0 ? 
        totalMintChecks / actorToMintsMap.size : 0;
    
    return {
      message: `Successfully analyzed ${conditionalMints.size} conditional mints and found ${marketResults.length} markets. Processed ${actorToMintsMap.size} unique actors with an average of ${avgMintsPerActor.toFixed(2)} mints per actor. Updated ${updatedBalanceCount} token balances from ${tokenAccountCount} token accounts. Encountered ${errorCount} errors.`,
      error: undefined
    };
    
  } catch (error) {
    logger.error("Error capturing token balance snapshot", error);
    return {
      message: "Failed to capture token balance snapshot",
      error: error instanceof Error ? error : new Error(String(error))
    };
  }
}

// Delay utility function
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));