import * as splToken from '@solana/spl-token';
import { PublicKey } from "@solana/web3.js";
import { log } from "../logger/logger";
import pLimit from "p-limit";
import { updateOrInsertTokenBalance } from "../v4_indexer/processor";
import { connection, conditionalVaultClient } from "./connection";
import { db, schema, eq, or, inArray, not, and } from "@metadaoproject/indexer-db";

const logger = log.child({
  module: "V3_Dashboard_Snapshots"
});

// Constants
const BATCH_SIZE = 100;
const RPC_DELAY_MS = 500;
const UPDATE_THRESHOLD_HOURS = 6;
const IGNORE_VAULTS = process.env.V3_VAULT_BLACKLIST_DASHBOARDS 
  ? process.env.V3_VAULT_BLACKLIST_DASHBOARDS.split(',') 
  : [];

// Types
interface ActorMintPair {
  actorAddrStr: string;
  mintStr: string;
}

interface VaultAccount {
  publicKey: string;
  account: any;
}

// Utility Functions
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

function createTokenAccount(
  actorAddrStr: string,
  mintStr: string,
  conditionalMintPubkeys: Map<string, PublicKey>
): PublicKey | null {
  try {
    const actorPubkey = new PublicKey(actorAddrStr);
    const mintPubkey = conditionalMintPubkeys.get(mintStr);
    if (!mintPubkey) return null;
    
    return splToken.getAssociatedTokenAddressSync(
      mintPubkey,
      actorPubkey,
      true
    );
  } catch (error) {
    logger.debug(`Error creating token account for actor ${actorAddrStr} and mint ${mintStr}: ${error}`);
    return null;
  }
}

async function getActiveVaults(): Promise<VaultAccount[]> {
  logger.info("Fetching conditional vaults from chain...");
  const allVaultAccounts = await conditionalVaultClient.vaultProgram.account.conditionalVault.all();
  logger.info(`Found ${allVaultAccounts.length} total conditional vaults`);
  
  const adjustedAllVaultAccounts = allVaultAccounts.filter(vault => !IGNORE_VAULTS.includes(vault.publicKey.toString()));
  logger.info(`Processing ${adjustedAllVaultAccounts.length} non-zero vaults`);
  
  const activeVaults: VaultAccount[] = [];
  const inactiveVaults: string[] = [];

  try {
    logger.info('Fetching underlying accounts in batches of 100');
    const batches = [];
    
    for (let i = 0; i < adjustedAllVaultAccounts.length; i += BATCH_SIZE) {
      batches.push(adjustedAllVaultAccounts.slice(i, i + BATCH_SIZE));
    }
    
    logger.info(`Processing ${batches.length} batches of vaults`);
    
    for (const batch of batches) {
      const underlyingTokenAccounts = batch.map(vault => vault.account.underlyingTokenAccount);
      const underlyingAccounts = await splToken.getMultipleAccounts(connection, underlyingTokenAccounts);
      
      const vaultMap = new Map(
        batch.map(vault => [vault.publicKey.toBase58(), vault])
      );
      
      for (const underlyingAccount of underlyingAccounts) {
        const vaultKey = underlyingAccount.owner.toBase58();
        const vault = vaultMap.get(vaultKey);
        
        if (vault) {
          if (underlyingAccount.amount > 0) {
            activeVaults.push({
              publicKey: vaultKey,
              account: vault.account
            });
          } else {
            inactiveVaults.push(vaultKey);
          }
        }
      }
      
      await delay(RPC_DELAY_MS);
    }
  } catch (error) {
    logger.error(`Unable to fetch underlying accounts: ${error}`);
  }

  logger.info(`Found ${inactiveVaults.length} inactive vaults add to your ignore list`);
  logger.info(inactiveVaults.join(', '));
  logger.info(`Found ${activeVaults.length} active vaults with non-zero balances`);
  
  return activeVaults;
}

function collectConditionalMints(activeVaults: VaultAccount[]): Map<string, PublicKey> {
  const conditionalMints = new Set<string>();
  const conditionalMintPubkeys = new Map<string, PublicKey>();
  
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
  return conditionalMintPubkeys;
}

async function getMarketActors(conditionalMints: Set<string>): Promise<{
  marketToMintsMap: Map<string, Set<string>>;
  actorToMintsMap: Map<string, Set<string>>;
  marketResults: any[];
}> {
  const mintsArray = Array.from(conditionalMints);
  if (mintsArray.length === 0) {
    return { marketToMintsMap: new Map(), actorToMintsMap: new Map(), marketResults: [] };
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

  const marketToMintsMap = new Map<string, Set<string>>();
  for (const market of marketResults) {
    if (!market.marketAcct) continue;
    
    const marketAcct = market.marketAcct;
    marketToMintsMap.set(marketAcct, new Set<string>());
    
    if (market.baseMintAcct && conditionalMints.has(market.baseMintAcct)) {
      marketToMintsMap.get(marketAcct)?.add(market.baseMintAcct);
    }
    if (market.quoteMintAcct && conditionalMints.has(market.quoteMintAcct)) {
      marketToMintsMap.get(marketAcct)?.add(market.quoteMintAcct);
    }
  }

  const marketAccounts = marketResults
    .filter(market => market.marketAcct)
    .map(market => market.marketAcct as string);

  const actorToMintsMap = new Map<string, Set<string>>();

  try {
    const actorResults = await db.selectDistinct({
      marketAcct: schema.orders.marketAcct,
      actorAcct: schema.orders.actorAcct
    })
    .from(schema.orders)
    .where(inArray(schema.orders.marketAcct, marketAccounts))
    .orderBy(schema.orders.actorAcct, schema.orders.marketAcct);

    for (const row of actorResults) {
      if (!row.marketAcct || !row.actorAcct) continue;
      
      const marketMints = marketToMintsMap.get(row.marketAcct);
      if (!marketMints || marketMints.size === 0) continue;
      
      if (!actorToMintsMap.has(row.actorAcct)) {
        actorToMintsMap.set(row.actorAcct, new Set<string>());
      }
      
      const actorMints = actorToMintsMap.get(row.actorAcct) as Set<string>;
      for (const mint of marketMints) {
        actorMints.add(mint);
      }
    }
  } catch (error) {
    logger.error(`Error querying actors for markets: ${error}`);
  }

  logger.info(`Found ${actorToMintsMap.size} unique actors across all markets`);
  return { marketToMintsMap, actorToMintsMap, marketResults };
}

async function processTokenAccounts(
  pairs: ActorMintPair[],
  conditionalMintPubkeys: Map<string, PublicKey>
): Promise<{ tokenAccountCount: number; updatedBalanceCount: number; errorCount: number }> {
  let tokenAccountCount = 0;
  let updatedBalanceCount = 0;
  let errorCount = 0;

  const actorProcessLimit = pLimit(2);
  const batches = [];
  
  for (let i = 0; i < pairs.length; i += BATCH_SIZE) {
    batches.push(pairs.slice(i, i + BATCH_SIZE));
  }
  
  logger.info(`Processing ${batches.length} batches of actor-mint pairs`);
  
  for (const batch of batches) {
    try {
      const tokenAccounts = batch.map(({ actorAddrStr, mintStr }) => 
        createTokenAccount(actorAddrStr, mintStr, conditionalMintPubkeys)
      );
      
      const validTokenAccounts = tokenAccounts.filter((account): account is PublicKey => account !== null);
      const tokenAccountInfos = await splToken.getMultipleAccounts(connection, validTokenAccounts);
      
      for (let i = 0; i < tokenAccountInfos.length; i++) {
        const tokenAccountInfo = tokenAccountInfos[i];
        const { actorAddrStr, mintStr } = batch[i];

        if (tokenAccountInfo) {
          const mintPubkey = conditionalMintPubkeys.get(mintStr);
          if (!mintPubkey) continue;
          await updateOrInsertTokenBalance(
            db,
            validTokenAccounts[i],
            BigInt(tokenAccountInfo.amount.toString() ?? "0"),
            mintPubkey,
            tokenAccountInfo.owner, // TODO: This should be actor acct given we're likely going to insert even if it doesn't exist as we expect it to...
            "market_actor_snapshot",
            "0",
            Math.floor(Date.now() / 1000)
          );
          updatedBalanceCount++;
        }
        tokenAccountCount++;
      }
      
      await delay(RPC_DELAY_MS);
    } catch (error) {
      logger.error(`Error processing batch of token accounts: ${error}`);
      errorCount++;
    }
  }

  return { tokenAccountCount, updatedBalanceCount, errorCount };
}

async function filterRecentlyUpdatedPairs(
  pairs: ActorMintPair[],
  conditionalMintPubkeys: Map<string, PublicKey>
): Promise<ActorMintPair[]> {
  try {
    const tokenAccountsToProcess = pairs.map(({ actorAddrStr, mintStr }) => {
      const actorPubkey = new PublicKey(actorAddrStr);
      const mintPubkey = conditionalMintPubkeys.get(mintStr);
      if (!mintPubkey) return null;
      
      return splToken.getAssociatedTokenAddressSync(
        mintPubkey,
        actorPubkey,
        true
      ).toString();
    }).filter((account): account is string => account !== null);

    const recentUpdates = await db.select({
      tokenAcct: schema.tokenAccts.tokenAcct,
      updatedAt: schema.tokenAccts.updatedAt
    })
    .from(schema.tokenAccts)
    .where(inArray(schema.tokenAccts.tokenAcct, tokenAccountsToProcess));

    const thresholdTime = Math.floor(Date.now() / 1000) - (UPDATE_THRESHOLD_HOURS * 60 * 60);

    const recentlyUpdatedAccounts = new Set(
      recentUpdates
        .filter(account => account.updatedAt && new Date(account.updatedAt).getTime() / 1000 > thresholdTime)
        .map(account => account.tokenAcct)
    );

    const filteredPairs = pairs.filter(({ actorAddrStr, mintStr }) => {
      const actorPubkey = new PublicKey(actorAddrStr);
      const mintPubkey = conditionalMintPubkeys.get(mintStr);
      if (!mintPubkey) return false;

      const tokenAccount = splToken.getAssociatedTokenAddressSync(
        mintPubkey,
        actorPubkey,
        true
      ).toString();

      return !recentlyUpdatedAccounts.has(tokenAccount);
    });

    logger.info(`Filtered out ${pairs.length - filteredPairs.length} pairs that were updated in the last ${UPDATE_THRESHOLD_HOURS} hours`);
    return filteredPairs;
  } catch (error) {
    logger.error(`Error filtering recently updated accounts: ${error}`);
    return pairs; // Return original pairs if filtering fails
  }
}

async function filterZeroBalanceAccounts(
  pairs: ActorMintPair[],
  conditionalMintPubkeys: Map<string, PublicKey>
): Promise<ActorMintPair[]> {
  try {
    const tokenAccountsToProcess = pairs.map(({ actorAddrStr, mintStr }) => {
      const actorPubkey = new PublicKey(actorAddrStr);
      const mintPubkey = conditionalMintPubkeys.get(mintStr);
      if (!mintPubkey) return null;
      
      return splToken.getAssociatedTokenAddressSync(
        mintPubkey,
        actorPubkey,
        true
      ).toString();
    }).filter((account): account is string => account !== null);

    if (tokenAccountsToProcess.length === 0) {
      return pairs;
    }

    const zeroBalanceAccounts = await db.select({
      tokenAcct: schema.tokenAccts.tokenAcct
    })
    .from(schema.tokenAccts)
    .where(
      and(
        inArray(schema.tokenAccts.tokenAcct, tokenAccountsToProcess),
        eq(schema.tokenAccts.amount, "0") 
      )
    );

    const zeroBalanceSet = new Set(
      zeroBalanceAccounts.map(account => account.tokenAcct)
    );

    const filteredPairs = pairs.filter(({ actorAddrStr, mintStr }) => {
      const actorPubkey = new PublicKey(actorAddrStr);
      const mintPubkey = conditionalMintPubkeys.get(mintStr);
      if (!mintPubkey) return false;

      const tokenAccount = splToken.getAssociatedTokenAddressSync(
        mintPubkey,
        actorPubkey,
        true
      ).toString();

      return !zeroBalanceSet.has(tokenAccount);
    });

    logger.info(`Filtered out ${pairs.length - filteredPairs.length} pairs with zero balances`);
    return filteredPairs;
  } catch (error) {
    logger.error(`Error filtering zero balance accounts: ${error}`);
    return pairs; // Return original pairs if filtering fails
  }
}

export async function captureTokenBalanceSnapshotV3(): Promise<{message: string, error: Error | undefined}> {
  try {
    logger.info("Starting token balance snapshot for active vaults");
    
    const activeVaults = await getActiveVaults();
    const conditionalMintPubkeys = collectConditionalMints(activeVaults);
    const { actorToMintsMap, marketResults } = await getMarketActors(new Set(conditionalMintPubkeys.keys()));

    if (marketResults.length === 0) {
      return {
        message: "No markets found for conditional token mints",
        error: undefined
      };
    }

    const allActorMintPairs: ActorMintPair[] = [];
    for (const [actorAddrStr, mintStrSet] of actorToMintsMap.entries()) {
      for (const mintStr of mintStrSet) {
        allActorMintPairs.push({ actorAddrStr, mintStr });
      }
    }

    // Filter out recently updated pairs
    const filteredByTimePairs = await filterRecentlyUpdatedPairs(allActorMintPairs, conditionalMintPubkeys);
    
    // Filter out zero balance accounts
    const fullyFilteredPairs = await filterZeroBalanceAccounts(filteredByTimePairs, conditionalMintPubkeys);

    const { tokenAccountCount, updatedBalanceCount, errorCount } = await processTokenAccounts(
      fullyFilteredPairs,
      conditionalMintPubkeys
    );

    let totalMintChecks = 0;
    for (const mintSet of actorToMintsMap.values()) {
      totalMintChecks += mintSet.size;
    }
    const avgMintsPerActor = actorToMintsMap.size > 0 ? 
      totalMintChecks / actorToMintsMap.size : 0;

    return {
      message: `Successfully analyzed ${conditionalMintPubkeys.size} conditional mints and found ${marketResults.length} markets. Processed ${actorToMintsMap.size} unique actors with an average of ${avgMintsPerActor.toFixed(2)} mints per actor. Updated ${updatedBalanceCount} token balances from ${tokenAccountCount} token accounts. Encountered ${errorCount} errors.`,
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