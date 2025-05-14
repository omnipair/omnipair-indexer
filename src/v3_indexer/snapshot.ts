import * as splToken from '@solana/spl-token';
import { PublicKey } from "@solana/web3.js";
import { log } from "../logger/logger";
import pLimit from "p-limit";
import { updateOrInsertTokenBalance } from "../v4_indexer/processor";
import { connection, conditionalVaultClient } from "./connection";
import { db, schema, eq, or, inArray, not } from "@metadaoproject/indexer-db";

const logger = log.child({
  module: "V3_Dashboard_Snapshots"
});

// Constants
const BATCH_SIZE = 100;
const RPC_DELAY_MS = 500;
const UPDATE_THRESHOLD_HOURS = 2;
const IGNORE_VAULTS: string[] = [
  "7FjYuZrQ4cJWC2Laazv6aNRzT9SqEe4WPyxuGtYxfR6K", "7nYyCRBt9JXDBK3PmV2sc3YBU7EgiGi6HnzyawfaWsT8",
  "2Mvi8Ly4R67czMpofRzt88EsagzTdPAoMXKoDrA1hwWb", "2VPRMeEKu7gyjsjPuf7umNPdS1Vf4u7mgFCvrmMyAXYi",
  "Cem4aMrKseudNKddvkT5MxSSNSxc8wqjJmkRt8bBxgwC", "DbT3W5ZzcAnYJ6c3yP2b3EY6PUzxhtJ4L2hyK3ERMJW4",
  "FWRuGFUAkh9SSioRrqnSRTh4mYJwF71kRQCRvsXbdVxw", "EGZLrhDRix5eb3Hudhh9tmDCw7oMMoHqhfdF1B2hf1XY",
  "DNrvrRG7z2WTULZPkRo8XXXfyLbmFMvufBSD8dXdXiht", "5neXvHb6LgADp5V8TBLmGfx8CuiN3LnDYpSAwoqbpBTA",
  "5tUseGs8gVcctuYKNtMa228u8nVEEDFiB9Si2FnJE5Y6", "7wBfBAzpYJoc8m8R9XAynCmQkEnC1pS1izxzRR9WHsSi",
  "9XGQzfrMqEGEgTNH9YAsp9ekuWcJ753HX9gP9GFSo3oY", "6cQ5SHRBPij7KjYhH8TYtZCVBDimEiyBgw6REQCaoFg2",
  "BbMdKJQQQcUhkzQaxbukntvrpCAEjWyAx4FyEXPZz7zx", "7EGRToLkhz711j4R1xEqahqhbPmqSkyNzyXEWTKcpaCf",
  "6gPykAveFbbWseWUprsXmdYaxSz7NxebZCyUjwQ9zFT9", "J9Rm9zC1EPk3cnpUYKK2AK9d7CKEh9FSgPEov5pEqYLm",
  "7Wv4RyT7Mxb87NssY9zZ2SaHpKwARafhuw6ipRSgQh5i", "Bzkuf1ysd4B24pB6qsYZf2pSjGffjVFERH9MHp8CjJbp",
  "GVtRqsGshoHw1qTawHv6jHWTQWJTxZjoPNH76r64sNdD", "HHCVcodVvSMoCi9m5w8SRzzAvBGUAeVRaKAW2iRswVHG",
  "CCNy4X6QhKMbhr1pmtMz9NyiVSG37VUynMtcVWgVMiLm", "4jEizCQF6JaBUY5qAcDhfSJ4JJqvy9P1HxoAC6c8MLpU",
  "9fEPqxeZ3n6hZLSVQ5mTh1nnsHrMAPR18MrzGrzkCnPb", "GPJt56jgojzoqoTLcMCtH54XYLPdvsC1S3p6LbgFiizC",
  "FQN2MyHhBVCpVeE2i1Hs5wDbcCYPXiPHNBBJoTnFDWuQ", "7o1kFepeNn8XzadFoabUodXb1uNQRMacYRpo1jNthPrN",
  "C4vK1gHZnSc3FMWnmsTGBVKqek4ZWr5cX4QwgWzkVEbn", "Aq7YhgZGJWds1vnfWjms1rutDjA8niArnEZQtRXzkEg2",
  "AM7rmAhbfXG8HMu6ZgdH4qAh2PRtLugRGrXAuyN8bpFc", "hchEoVDiLNVJUWV6K1VpmbPctLQEuQ4Yxj46SJQyeey",
  "41bUooK7mtfjpYRi5W51g6jUmuQqVLTdHsJei22LVYiL", "4CQhsRPJZpuCS3BoWpnviwUDrTy47R6YYbj7C8GbAbKL",
  "FSvxVgHD4Y4KAMaSpNzPCF1UppMbw4V4iFMe33Xg5rSK", "4UgRqZYqNPag5DgwCuaY7ErreKdycxrQ5TAbRtnnXnxz",
  "a44hoFkWydyamkrf45PBB9z4iDmSwUtcQX3uJGkYiNL", "G8JDoLpccN5zriPUh7WWiLMsWwH14AdLNoHweANrJu4D",
  "E6L2LzHT9TYC5wWSPZxcGZzaMNoCxVX1VqMUg8wzikYE", "DM3FJQekZ629iMddvwxn7btUK6vzm1d97JuBjqYjaezw",
  "9gCiH8E4utkxrjdwaaCHYq8BcieHmXZxdW4ScEMjVfak", "Ckyg8kEgk6gbrxiMEJs5Vp3BGpVs33iauY9Hg9DzNR6i",
  "Gbs4qQfcJ7xZ71pX7mdxsnEc1z9Fq9r1K1oyn9xsgaEE", "6SGMTuc4iLrzftTnjjYBhBp3EJUp2iBrwQu3V2s2e6cs",
  "D6gqGdGjHoaLhsgeScdmXjbtH96ja78wzTjvq6XKzjun", "5Cgr5Aim22g5quEE7qPuFCyrchzRKcHdRMBqC6JMNygK",
  "GNX1qQFv3sx5w7EAizKVobtDNNo1742bhDVakgiMi4c5", "Hyr3GwpMZqkVJhuKHJNvsWuLE4TGTcqqDGJAFA5Sh43T",
  "CKJC9SkXw369scLhkfcRStNCcB6mu4KdGFWDt4WaWuuV", "FmtSD6hcDuzd7cJahQNycffUCjeEayDAoEzFP1D8LJbw",
  "EhZ9GuzrLAkBLLpwFHnQVkR8p7ZtGTitYn5n42QUkqAS", "9geLQefhDHsgRdYv7QrHXHodRr6JcEKU8enLqMd1JVw3",
  "9ZF513fSEH5HpfxpWEY43PdcPR87pH8ddJujCe4ZQwHs", "FP9JrDvZCszErhD7RQVcBEDARZrewQutqnbMfNK1J3WG",
  "6fbfmsqvwJjNVQyzUADr8mDNyXfJvuVF9uuqfuWEGgvS", "6Q5RGowKiPjs8bHpTD2HVkxz9Qv4ejsdnCLdCB6ipdt",
  "D32d1EU9dfbLLoBikQUqxK35jMhF8bxH9L2WaE8Qdc2h", "3YqzNfmUB5sTenS1r5V1Ux44dd1jNDLTt4YmJvjJfcEp",
  "8PrVLfrykSxCDF5jPi26U7mJ8ZYTAaZpAQj19zH1bcKK", "8X24YuNAxyjC3r6tcaQNhJJi7k9RuMfMMJWrBtGHto41",
  "DF22WCeXXfR6Wvh4A7XezPp656KShNa4G19bqdbTcN3J", "JAa8Lhjs1rLeWSgKcW1f4ZeDtaFQGGyjdyejJcu4e1rD",
  "6DkucJFH2c9KqF1NQYqU3TjzRpFm9Z2E4jkffSP7eCQU", "68xfL4LTkpr4TCCjnQPNPpm6JPtoQpKXUCGwMmHK1AhR",
  "5ewmez9armKeUJtJxLsoNgm1TKtZDSEAtUbHaorNo8A9", "2j7jzTghzriPZvs3NKU5uXJwdWwy9CnVuEPTsQEvbxcy",
  "2qX3yNiNxRkiFh8rZALkR5rgbAcmkWYiaPhiibiYqsuz", "8NL3g5QYvyW9D2BQ6ZqPuGV5DDGPwuMbuydMBB5W7Ndt",
  "HUv4RibPrVUE621msy46HGQAMPV6kUgBaHfgDHJWuLmM", "AmFef2t8TQiRgQVsKsUcRh6wUPKAH72RkfYqBcGgC6i3",
  "GNFY8yhuxCd9PSLaQAR3qfMZWh1YfSGRcgaHRuv2ifW7", "Fk1QZjyC7fMTdzMBcCsNQ2qQXjdYKoRduwXn4TDixozf",
  "4cZs3vSTAtutbEv79vHyJQxDrhxNvMo53LQ4f9gjENLM", "Bi27ad2SUYenT5TZN1D4qHyXnPpoTYzqNeMMeghv9VjD",
  "9aoAjchEveMA51anXKz7DtFLGo2Z15EHJEtd7cdxr8Xp", "BkeVWKTmfmVhLVt23dhLAW9dX6u8ni7PkPDih5Mr238z",
  "FgPSwuTNhf8n2gPuukkj3rSNjrFfuC6B2R1yGko1tMk6", "5pGmMcrjXcxQeSuYg9NPRVx7ufopbcP2zUuZ83bwQ8GQ",
  "3fbUFwfk6CyFjxF4wBQ1vEJ8c85VrpDBW1WVDjznxESp", "2fANULQaEwKBziYwNXFdksE7Ds8FdaBUkQZ298oNms51",
  "GBPiktHAgnyLp6UQjh5NcPhVsJC2Xw18S1gWNJnYPKgq", "EpLWkGkeqowgwtBsnTxTkF2hrtrjuByTE4ee5qUQUFP6",
  "FPWjcQtVkB2pP4QJL3gaPsypMvQXZRuF6Q3T18M3kehW", "3YgaF7qmXTAnnQk1Munc6jemBeqpQAgzp5iEsXB31cko",
  "GmS4o8QpofneSfY3J8EWednkquwXzYGMmXbCimvysKF6", "2k9qLzQrxsvR4SQyHT4j7oar9pW4XMAHHdiVS6C1C7bo",
  "DW3rozZFju5qwTrNwyDiQeecmdwGU3sJogUe81WaQkUT", "E49niTkjKmdwZehoNSD7ufWZpuRUSvS7WHvzLayYwDaF",
  "ExvfM7WgejdiTP9F914ZjNaHYtPYuLGCwvj3K2iLJ7XD", "2suSk8PSVfnfHR4VjTvFuCUFd4twmmPg1ACqcjNWNb3y",
  "5mriCRZdbAGV6ZJyieNdCQMZVf4PqRvngJ34yeqtaudx", "4Dk4ybWhibGCTZTjMtKn4XdLehX4cUeD7XXAumqJo59T",
  "bYDjYHV2EUvCixyQECqTunVVv5ddtgzmSehckgfGpFo", "G4GuGugaAXMbjzho4yoXvyrrxrmDUUWQk6vrYHaieLSF",
  "84TBamvocFkYzLcmCrnkjvZszqVhKih6ktxVB5rA9ffW", "4Kn8unQarMwXUHEiZgdg2PjJXnbsR9jnnuSwMZ8K2zUQ",
  "6LQg797nVEwVuPcZKEYfUaSZoSSg1nmWGcwunsVPkdzW", "A5BNZoTKu8ag9wTveVoyXQ17JMsMg4m9LsBnfus4u7mF",
  "HhqBU5cgHQ5XMxHeVo7HNYSXjfcKmuHMcqbTYAgF3P1", "8LoNv7fydB9D19Aqby82t8sgh8UXXHjo8vmKjtE6Gco",
  "EK71NNM5kpzS7RJWrob2HjTnuh8uQiky7HdBXTikyqkv", "AQ52twFUBkk1qkKwRW2daJekKFXaQP7E8PKimLzXG4w7",
  "AHpMbJPezqEL61ttepg8icjKVB8jb8D7XktDMz72Ykkv", "4JM5B43rTZfshjRHKkbksJTcYZb2pbwNQvsQgADir1Qw",
  "58CyFRCs5ZEcGtXAu89Dbj59D9xtGp4sQEmdke1WkqDM", "5cB29j2nMLMQ5skHfaJd8XSNboEKw4EWKjy1Mw65cUoR",
  "8Ra7CEAiUPy113KciSUPDnw5UZGFYok3Mxobc4Wsimaw", "6jPhac69Dbvi9K8MvRWYjjEWkU6evBtrhzukDVdQ1uJx",
  "3D7epB62vcSCSK3mJGFpfjPXvi95sCN4xg7LYHFTb9no", "2jj6Fp6fApZgdZD1f3UiULcHkUchVXz1izo3sFiSbn8t",
  "25Mo1ZiZmP5zBYbMQWjJe32hRxWZYWskNkVhh1iHUKjJ", "CRDj1XXoXuuboPopPc9vQJabK67LzLi5yZhoAyJQ8Te7",
  "6ikdAXVpnHbtAKnN91tquDS4bxJBGn5dLfwDXo5tjin1", "2TNGE1HVHXqZzTx2W7DCpDvMyXFsnSBrNiTKArpXd8AK",
  "FFWUZSa4GY553zyq3W78NJWUtWvE8RFR8GcfNiN8zwr", "5xCqZUi1juGQcqLU2HsetiufXQsMTxLQChtWSjVhT861",
  "FdLwniQ5bBxBupHvConmMeffUFGNkRgPbjFQ3hCNs8U2", "7X1ZBJ1kgdtAJEZkQ8RmtGNhfL8necGnnEBpdzDjD7we",
  "5cTJXqs3mHJUcGAU84HhUZcz6ANuEeUQZ61tvwDbbH4v", "3oYp7xnFRhAtGSV5RzBHUmDGce8bzNfao4vkT1Uq3GKa",
  "2gKGjwNdWPzLWrWnfsoJooUPnkZa8CgznHBeGhvRyj3L", "5BKvPg2aMatdY4bWHsxfEG7NkhBPEfXY742KtsJWneqB",
  "FLE8czUtZUiWF8EpjChVJ6ZReMzLNos8zaCLWv63inRF", "DnEok1n456RceUSvYwCYFUcdq4cZkrL4PUvrQ4jhpjWp",
  "A8pWoay2bgnQrg7yypUi9fLpYHc2nS4jrTTQtYVERzYp", "5b1B1NJQZPEXUZYNKXeb15pyBpc9EjNNz81dsT5eDxaS",
  "2X9VkZo8uaMdLr9c3b5dSa9ayforb9RqDCmJfLJ1VZYk", "2rhTiUujFrbMVk7AzRHjfkC5K5grvpeNvZSHdavSvsZj",
  "9DRVHYQ6uHgZcz4xstpPJNzwYAJAHLgBNagxKK6kSEtr", "2A3gpdNDeyJQyXFRZHPg9fZkH3Xpqmd2p2thT7drkq3u",
  "BwK5yY4uAWKUhHqa7qNcCAFxHzxUoVe89XUW9mvkSDQn", "4YgeqvTMAs3SmWCJtqZavg4944g7hma53T5LszFn4wPe",
  "Bt3vzqq869fiCdHa8SXGvRi3Pi5z5kVL6pPH86AYkb3k", "FruVqbP6hvDkGHdG2edeVF9DkLfhrfXLPwKSNUXyZHKp"
]

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
    // Get all token accounts we're about to process
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

    // Query the database for these accounts' update times
    const recentUpdates = await db.select({
      tokenAcct: schema.tokenAccts.tokenAcct,
      updatedAt: schema.tokenAccts.updatedAt
    })
    .from(schema.tokenAccts)
    .where(inArray(schema.tokenAccts.tokenAcct, tokenAccountsToProcess));

    // Calculate threshold timestamp
    const thresholdTime = Math.floor(Date.now() / 1000) - (UPDATE_THRESHOLD_HOURS * 60 * 60);

    // Create a set of recently updated accounts
    const recentlyUpdatedAccounts = new Set(
      recentUpdates
        .filter(account => account.updatedAt && new Date(account.updatedAt).getTime() / 1000 > thresholdTime)
        .map(account => account.tokenAcct)
    );

    // Filter out pairs that correspond to recently updated accounts
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
    const filteredPairs = await filterRecentlyUpdatedPairs(allActorMintPairs, conditionalMintPubkeys);

    const { tokenAccountCount, updatedBalanceCount, errorCount } = await processTokenAccounts(
      filteredPairs,
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