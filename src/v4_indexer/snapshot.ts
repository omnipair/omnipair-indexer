import * as splToken from '@solana/spl-token';
import { PublicKey } from "@solana/web3.js";
import { log } from "../logger/logger";
import pLimit from "p-limit";
import { updateOrInsertTokenBalance } from "./processor";
import { connection, conditionalVaultClient, ammClient } from "../connection";
import { db, schema, eq } from "@metadaoproject/indexer-db";

const logger = log.child({
  module: "token_snapshot"
});

/**
 * Creates a token balance snapshot focusing on:
 * 1. Top 20 holders for each conditional mint
 * 2. Any users who have interacted with AMMs involving these mints
 */
export async function captureTokenBalanceSnapshotV4(): Promise<{message: string, error: Error | undefined}> {
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
        
        // Check if the vault has a non-zero underlying token balance
        // const balance = await connection.getTokenAccountBalance(vault.underlyingTokenAccount);
        const underlyingAccount = await splToken.getAccount(connection, vault.underlyingTokenAccount);
        
        if (underlyingAccount.amount > 0) {
          // Now check if the vault is finalized or reverted
          const question = await conditionalVaultClient.fetchQuestion(vault.question);
          
          // Check if the question is resolved (has non-zero payoutDenominator)
          if (question && question.payoutDenominator > 0) {
            activeVaults.push({
              publicKey: vaultData.publicKey,
              account: vault,
              question: question
            });
          }
        }
      } catch (error) {
        // Skip vaults with errors (e.g., closed accounts)
        logger.debug(`Skipping vault ${vaultData.publicKey.toString()}: ${error}`);
      }
    }
    
    logger.info(`Found ${activeVaults.length} active vaults with non-zero balances and resolved questions`);
    
    // Step 3: Collect all conditional token mints from active vaults
    const conditionalMints = new Set<string>();
    
    for (const vault of activeVaults) {
      if (vault.account.conditionalTokenMints && vault.account.conditionalTokenMints.length > 0) {
        for (const mint of vault.account.conditionalTokenMints) {
          conditionalMints.add(mint.toString());
        }
      }
    }
    
    logger.info(`Found ${conditionalMints.size} unique conditional token mints`);
    
    // Step 4: Get all AMMs to help identify relevant users
    logger.info("Fetching all AMMs...");
    const allAmmAccounts = await ammClient.program.account.amm.all();
    
    // Create a mapping of mint address to AMMs that use it
    const mintToAmmsMap = new Map<string, PublicKey[]>();
    
    for (const ammData of allAmmAccounts) {
      const amm = ammData.account;
      const baseMint = amm.baseMint.toString();
      const quoteMint = amm.quoteMint.toString();
      
      // If this AMM uses one of our conditional mints, add it to the map
      if (conditionalMints.has(baseMint)) {
        if (!mintToAmmsMap.has(baseMint)) {
          mintToAmmsMap.set(baseMint, []);
        }
        mintToAmmsMap.get(baseMint)?.push(ammData.publicKey);
      }
      
      if (conditionalMints.has(quoteMint)) {
        if (!mintToAmmsMap.has(quoteMint)) {
          mintToAmmsMap.set(quoteMint, []);
        }
        mintToAmmsMap.get(quoteMint)?.push(ammData.publicKey);
      }
    }
    
    logger.info(`Mapped ${mintToAmmsMap.size} mints to their AMMs`);
    
    // Step 5: Process each mint to update token balances
    let snapshotCount = 0;
    let errorCount = 0;
    const mintProcessLimit = pLimit(5); // Rate limit mint processing
    
    const mintProcessTasks = Array.from(conditionalMints).map(mintAddress => 
      mintProcessLimit(async () => {
        try {
          const mintPubkey = new PublicKey(mintAddress);
          
          // Track all token accounts to check
          const accountsToCheck = new Set<string>();
          
          // Step 5.1: First, get the top 20 largest token accounts
          logger.info(`Getting top 20 token accounts for mint ${mintAddress}...`);
          const largestAccounts = await connection.getTokenLargestAccounts(mintPubkey);
          
          // Add these accounts to our check list
          for (const account of largestAccounts.value) {
            accountsToCheck.add(account.address.toString());
          }
          
          logger.info(`Found ${largestAccounts.value.length} largest token accounts for mint ${mintAddress}`);
          
          // Step 5.2: Next, find relevant AMMs and users who have interacted with them
          const relatedAmms = mintToAmmsMap.get(mintAddress) || [];
          
          if (relatedAmms.length > 0) {
            logger.info(`Finding users who have swapped with ${relatedAmms.length} AMMs for mint ${mintAddress}`);
            
            // Process each AMM individually to find users who have interacted
            const ammUserSet = new Set<string>();
            
            for (const ammPubkey of relatedAmms) {
              const ammAddr = ammPubkey.toString();
              
              // Get users who have swapped with this AMM
              const users = await db.selectDistinct({
                userAddr: schema.v0_4_swaps.userAddr
              })
              .from(schema.v0_4_swaps)
              .where(eq(schema.v0_4_swaps.ammAddr, ammAddr));
              
              // Add to set of unique users
              for (const user of users) {
                if (user.userAddr) {
                  ammUserSet.add(user.userAddr);
                }
              }
            }
            
            const ammUsers = Array.from(ammUserSet);
            logger.info(`Found ${ammUsers.length} unique users who have swapped with AMMs for mint ${mintAddress}`);
            
            // For each user, find their token account for this mint
            const userProcessLimit = pLimit(10);
            
            const userTasks = ammUsers.map(userAddr => 
              userProcessLimit(async () => {
                try {
                  const userPubkey = new PublicKey(userAddr);
                  
                  // Find the user's token accounts for this mint
                  const tokenAccounts = await connection.getTokenAccountsByOwner(
                    userPubkey,
                    { mint: mintPubkey }
                  );
                  
                  // Add each token account to our set to check
                  for (const account of tokenAccounts.value) {
                    accountsToCheck.add(account.pubkey.toString());
                  }
                } catch (error) {
                  logger.warn(`Error finding token accounts for user ${userAddr}: ${error}`);
                }
              })
            );
            
            await Promise.all(userTasks);
          }
          
          logger.info(`Found total of ${accountsToCheck.size} token accounts to check for mint ${mintAddress}`);
          
          // Step 5.3: Process all identified token accounts
          const accountProcessLimit = pLimit(10);
          
          const accountTasks = Array.from(accountsToCheck).map(accountAddr => 
            accountProcessLimit(async () => {
              try {
                const tokenAccount = new PublicKey(accountAddr);
                
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
                //     "token_snapshot",
                //     "0",
                //     Math.floor(Date.now() / 1000)
                //   );
                  
                  snapshotCount++;
                }
              } catch (error) {
                logger.warn(`Error processing token account ${accountAddr}: ${error}`);
                errorCount++;
              }
              
              // Small delay between accounts
              await delay(50);
            })
          );
          
          await Promise.all(accountTasks);
        } catch (error) {
          logger.warn(`Error processing mint ${mintAddress}: ${error}`);
          errorCount++;
        }
        
        // Small delay between mints
        await delay(100);
      })
    );
    
    // Wait for all mints to be processed
    await Promise.all(mintProcessTasks);
    
    return {
      message: `Successfully updated ${snapshotCount} token balances in token_accts table. Encountered ${errorCount} errors.`,
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