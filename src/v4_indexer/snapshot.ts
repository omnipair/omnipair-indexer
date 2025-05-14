import * as splToken from '@solana/spl-token';
import { PublicKey } from "@solana/web3.js";
import { log } from "../logger/logger";
import pLimit from "p-limit";
import { updateOrInsertTokenBalance } from "./processor";
import { connection, conditionalVaultClient, ammClient } from "../connection";
import { db, schema, eq, inArray } from "@metadaoproject/indexer-db";

const logger = log.child({
  module: "V4_Dashboard_Snapshots",
});

// Constants
const BATCH_SIZE = 100;
const RPC_DELAY_MS = 500;
const DB_DELAY_MS = 500;
const UPDATE_THRESHOLD_HOURS = 2;
const IGNORE_VAULTS = [
  "EWd8BrTvAGNpB9nUk3ShtYNrjrQ6y8H8Ue73tNLgWKcq",    "vNxavVQBs4cSoRg8niaiRiBYwGa91s6qWHmHX81judq",
  "5hUd98YphMRc4yQ4PQtSc6rg7n9TY2GdDNcxj2aHT96P",    "HQrt8rDG6h4nfScLqU46KUnuqJJXFU23Lv7KBR82qJvU",
  "3EwTeDx5Mn5yiBhJ2NrsguqsrJwJym3Dba7sKdNFXGWY",    "A23ZGvaE6vqQDeYUjwpeVDKdAJzt4NQCpCmmfTjiAoHF",
  "Gz6o9Se6J7zyDzPscmTVwsAYLVr2qc3169v1RSqN3YCo",    "8XqtapzQjHVTwohJPJSW2CyKpfM4Fso16FsRe2dVVsdH",
  "6VBueYqnWqRH1L1qb3UVsNPbNGQMsg4Mqn7x618s58bW",    "AwcN3n1n6LEGGjGf3iJyubEQw3coFuXwbqgZDZKHbGwT",
  "2zuvRk139YBjgCBEK5AY8664s5oZGRkvYihRG4jcYZo6",    "61sHH8FP2Pxaooqsb12AhvgtBo9KvfSjzXw7kugezDoE",
  "43qJjEH37nhYXPDgMQs4cCKAQGgpS2Bf2o4BhrMps8VL",    "HuQNVwNpSgfzM2DK8MAysyzfhUb2fSDhzEks5CH3a3az",
  "GDn7zrBfeN1XQYEB7qABNby2AAB2uFjezma9tH43fEdF",    "HNJFJua4eAEH8duiAWE2qrNnKaSdu8L1pFVGWt6s7rpv",
  "62Z1g1Uy2uJeSY8EbaVQLioDAfgjC5dF2zCW4X1gUf4m",    "DbyBeF2pkncJQyMWLC8mfaE2HC2SFNES3idrpV3LS5Xq",
  "cWTH68NzarFJcP8YURGSGbxLgmAdSpuQVFxBiBcSMLx",     "EY1MQySDjv5bpadD4Y8mUtPTASEd7gLkS1XLYeeD4AUL",
  "7bZCUCCXxxeg3h7qYNVgQyqJsozfNaEu1RcxBJYbtT7V",    "EnBaT7yay1TenzwinnkvNwjbEPbY7nyPPygGPamDKoYT",
  "Gmpjh1unh4y4qydEQidGMGrf327Dc3a4UzZJ6w13Shfh",    "2uSSx3bTpMt46c9TuxRKhdvmeYnQprNZsLWZ95yBR1nK",
  "BbfSvg1TtCvko6WUGQznQBfG3UPy54JV9afKLEqP6Vxu",    "3REicenVnKn81zvZzPaNHe5DM2649a2meMrUTboezGxR",
  "DcfvHMs1q7nW993vup6K7xExGUrkDBHH7X7iRGD4mbu",     "GZZJuhZba7xpkxyqSNBhXX95JjSxhbj67oLdd9PKL2wd",
  "4n7sBhcx21j8bkjPjQU7wWHbTbb1M3k6BoT2DHfMCDX4",    "5Hc6K4ys3Mi5WyfeTbuRBxFeYxrQgJUZaPKVrE3HEFz2",
  "C1xgQiRhSnZJrYt1dTjxVoJ4bKaRRzMJxAvZmvjiu2kQ",    "9gu1MtZTi5u8PsQXFHLnqcs5tbDKhaVUoovvqD5b9yJn",
  "Gnf8WxvUcxTorMrvmQprscWugUNDP7jh5EE96VTKF55G",    "H9L6Rtg1Yr16gtiM7FniTcnDz3QLAKEPGPazEtVGtxsi",
  "9zHuD1tzxchtRJvfrPj5Dmw1eZpReyVTVeoRgT775bUX",    "9rhMU2s3T3BPMcmWBxBNJe2MabKjo72re5SgXmG8YbFv",
  "Hhxw7QbP7pCM9CLG2Cn3apVpQkMvnJcNLjgToTPoyFgA",    "G8qCfYzQNLsaSmzoekkTjErw3cyiS5McJFcMCzPHiHMv",
  "8YGXDbk78V2Je6z9iWHcfUSaMy8m3zqk8LpQfSsmUyrT",    "H1owpBVy6gxGVtrRvoLjc124hC3CMoBc5wTWKX9M61TJ",
  "EXNyksnS1u2XDn2MBajaAXiPzXniREr9KdGwtYAMeVV4",    "DNeseZwweMhyid2tELCYEkzggRiwqDBBKewcNR9rMrEZ",
  "6CeKuTMmtNYPymCXdgVvc37SQx7TDGRvdyCnFzi8ETWw",    "7EcEvD6Sfc33faoBcHaK2r1rqig75RD57hBEQwGMpCNo",
  "9tchjjcUFqnEJKFEstSu9Zc7pCxkfxk42au4Ga5u6gb",     "5rCG9kkFu7WE8AnrsC6ntS7TXLDTEkDMZYkSPySm7fod",
  "2rCHSeH8QPhmD6QbzaQXZ61nD65xM7jEgBPuNsoX6V4w",    "BkLxKfSwZP6mGKVS8p6LnJ9GX5acR2a2KFnzhmuWSLcZ",
  "3CufSrW5ehN72EMM4qP9pUTEU8ZaCEF8gMnBenpLDZz3",    "6F66JSmY4dwG5vv7Pnd9sCTn3z75juE4qfay3FSpeaSz",
  "ESC9yaVBeqF7hbAr8qmGYi9RhDaPPTsygZHfpuUUkDub",    "8ZfmUCiDgWakniBeaiY3hGJugKTTxJN9f3ijvNYaNKx4",
  "ABSjDh1qtkiDtCW1VHMPXpq4bQ1XCQCbF8Mg5q2oeLbQ",    "9aC4mHtRyqnPAbpKzP9eUfkuYxWtSap5sfNT7UYhqfQq",
  "8KyQ7r9QA7c1uo6GPgf85vWxZTjhb7HqkdiZYJiDGm9A",    "8BaaEyUg6CruD8S8zu651V9WEhFDM3oaAyC32ideRmYf",
  "EQt8frY4BNyXkNu4PtuacMZZcxzbMtHaMd2fRko4SMky",    "G1bwVYScXjgpbJ7cCCegVuQH4HrBKGdNTfZyiBBM9dDG",
  "7HuYm52S1zSSECxcX1yvFPCV3eUDt6VgHFFXFNf3YPSo",    "4AiuzCYGop2y6mRXtMVDPVPHkSwPwYWumw2QyCy71wui",
  "6srkryqhYPasiK5fPZ7s4e8E8YnAMTX8BAiHJGYsbFaa",    "2Wh3WU6VboQ7ntmWWUmx8bLZ1T3xdpsVumbBJwUTc7UK",
  "41Yr4bVKtPRt4NJebRN4HW7tMLrPBQxf1yGyvKNtR3T7",    "DpfnnXkWysLM4EktFkXvoC3CmhggpeXkzUSE7oYGpKd7",
  "Emwj8mF8jcgjEzueaKSir7WHXiocaLZKZnjvPsqfNfQn",    "2Vt8468q8pLyR5HiJHdDMc6xoJsYXRH8ucv81zzLhgUK",
  "AGvN2D6CAqrfvhZpBKiLhuAvsNchmxRtmNCeLQpsjNDN",    "FzxvLuAk4Rwj5JuS5T29th7J3yrNK56aZGYLjqL7stJf",
  "3WEfRDavyYnnP51L9qnSFcubCqBuwMaaJD18AcPGoYRJ",    "6zTzQbDSP9FndeybiLwXeFBDSDyYAzkH5JkQCgnkNseJ",
  "J2qpd55JofneFqjMmD2iwAstuUUEGQ2XnazngT5KW84X",    "GVgEooA7LdWuGNhsWuRSmzW8KqLGryeSKHwrt8pL9PsE",
  "5jFX4N5rCcBSiJH5wXmRGJNFZwR3Hmx3hM3emQFLkBVH",    "9vw9gyxSMvJA3su86ZxXZnw8r77SPYMbCxhcmDNWKg9c",
  "D8QnBCf9G7cW9Kv2ezWYcszRCoCSBJS4TApko2Asft5x",    "32RrtZrWiCh7cekBQ16KV8YoghpwhMGZrs1YEiNgNTks",
  "615tn3dDfu4hU447g1Me1CGUnwcczwKH7LSRZ3W6vs39",    "A4HJcWWfNL1eRaBiBN2X3CcufGckbzuC6s8bF8eA8ipi",
  "48hy5h9yhnf9KyWHNBmVozsfQ3H3LcAzgC5Hdijyxinx",    "EkEnZu3QCdrm5svTvtV4TzSQP8qCPBqvXPdg249vxaJC",
  "ACmKHNkhtH66iTDHRNAeoPeh1WmxS161JVDVw9oudfFN",    "HCEn1RCHvaH7ysENcH3SqEL3gMAnmN62FAjjDFqJPW6J",
  "DRENFkCtjHGt1XHzeCYTwiWuPLdJjFnJqfDZdN17JXM3",    "Bdrg3xVrEKfM9Wxju7cJqpug5j9pL1btEjbwG8ZFpa3T",
  "AxsRKwXcRQzhL9vtdrCdYoakkVEj2V9BDPdFJdZwCAkT",    "2vo6i1zRF3rPhkPeLxhGpNGYbzx4Dgsw8DGj7vB3SQVz",
  "HBDYAxMcNV7k6QzKskLhvCvy1cmL5TDYRAHK8G73DDrr",    "J43sBSj9TvdCvWRNT63rVQzfuJg3nvb6xVeZ9L6atjWU",
  "4g2WeSVL1Rg8wRFfJ2LBZK16xZ9fy1HWC4Hzmqwiz9t1",    "H3SrtLxw5yptWKvEFHWcU94PJJPoYjiTi9ms3KtF6Crb",
  "CBeNHkeo6zU7bEcii8ETrAVFMGVA9HEwnXrgNQHHsPxH",    "D15u9gLc38VuNzWtPjsA14AzT4tmUsyyAMJYxryhS6Md",
  "8ayBsgLVQoSpKthovENBcCa1TQAV9VGpti2yeAsUak4C",    "DAiRvHx9h8s62ac9naEVgQnE4q6WMCuE8KBe5MFdcXuM",
  "3coFXhJPjg99GnTE1fuAqgfCoPzuFDHsLoH9MBQKwyWr",    "Es1AobKSWMc2r3jjCkZinnVHb44wGh8rsU5EQCBC3G4q",
  "HWRFSLd8Sic8hBtybqduxkhcxhnFGntUzTjagZNAu1T7",    "C2zSagTvE9D1K6wCUUFJxLDr8kvR9rhW997Ys4BzHyry",
  "Cc8L8hDn4y18S7YSzp7Ay8xbxMnxy5w5cSGeDybMmZR9",    "CUfTrc6dU41XXeKYghZzhn9kf97dmtDj9iuSGNCq6oUq",
  "AFe4MFKPEsBZh9wBbQ5FbABY8Eid2KuRDhUSbamVxoZP",    "AQUk98xZ7ztYJ6ZoGqenJHkgSFCJj8c2p384yDG79E4o",
  "GmjypbNyjZ2Gx3fcFNixdB3PkayE4Pr7AHJpT2r1PbVA",    "5YPb9x8ZaAREEneo7NAYkNyLAZDFXUgxEmpSm6tqMh5f",
  "HpAQSAVGhj4MT2pgFMpuUMfM16FpQACJGRXyaLS2gyDB",    "3JWCpT4otT6yjZZ5kMiV132CSFkdyQtRS2q1owvyJgHX",
  "9cXoMEp514yVootDzfgA1uF9GrRay69RHCAWYaowKnzA",    "8iiEcrfQkHoe13qBSywVEYyZZC4Cv8to186SJSEFh9hs",
  "9TpBygcJf3rJ5gkxBqMqSf8VLGKLx1yS4qKAjcLm8G67",    "AcqrPLHEtnto24f2TyJmhPLaGD2K8DGSrSqVjoFkhei7",
  "5CxLfpBP6mRULQj7nodp1dcdRhfyqBdiks1HvkNQoUqi",    "4w7FyhBiZDaVbmWLNPuMtEJVEhwV2YW1cwPVfsdAm12F",
  "6J1jWmbo1JXvcrYzMHBSuSRs5GNLicihDcNsZGXPYLRA",    "6TSefpPz9pLDknYagD1CrrhAgHnsjJtCyqCoBaqdMypQ",
  "4E3YRBWvvUPjN9NcXwcJfmw9s77ZhqntNt1gP1oNJezx",    "ChSdAWDamzHNgVRUgigbzUT6bkzVciTKLPqF1dktiDc8",
  "2iT2ZUjjyJYkD8P2nSiCaFHQGKjuUVYkH6Eft72FvMTw",    "5nakPuzBCVQFfVf8hJiVdQN9P4hUW6nsFidVKPYETa6P",
  "4Jm92t6aRfwTPVL9CmmKZvFyCWqtYoxnTFfDkKobVvuR",    "4LeFDAxVCje3xixGxEmh6N7Tz8xpdP6gu5cYWr83Aoac",
  "4zkhLjGR9kpxav2jAghBENwPbMFa1ngthazdCkUenadN",    "6JKg73UmdxHZoGmipJGJBUGFjgF8KGeicFdZWdTdqmAL",
  "DksgK9WA2kA1Gzcbg8f6wSntYYYS7v36obwwj1Yj2Em8",    "EkEmgZ85nS2GH7Myin4LYeU6iDnuN6FWN6gGLoE5BPpR",
  "4SHPuYoAuZutFWr5WQfkjuPUDiym8yPWBP4UESzo1k9r",    "9xRTDyLBRp4GyxFFYhvHa9FsAbyycqikhLGpqj77fFBp",
  "8z2AXMmHP1fdDrM8imu1tzrfFaeHgPDUTDfzwsNewgqC",    "H9jELxzTvtm3jUVbcDR53M26T31vwmZz71ghavV6eoC6",
  "DqTDgwVRbzDeomHrs1nj1S8wpg9AYroX6V6jgwbAyqLR",    "CSgfzBmMbwrXLkEJRJYVgvzLv6J1CxkDa3hg8M3a3r38"
];

// Types 
interface VaultAccount {
  publicKey: string;
  account: any;
  question?: any;
}

// Utility functions
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

async function getActiveVaults(): Promise<VaultAccount[]> {
  logger.info("Fetching conditional vaults from chain...");
  const allVaultAccounts = await conditionalVaultClient.vaultProgram.account.conditionalVault.all();
  logger.info(`Found ${allVaultAccounts.length} total conditional vaults`);
  
  const adjustedAllVaultAccounts = allVaultAccounts.filter(vault => !IGNORE_VAULTS.includes(vault.publicKey.toString()));
  logger.info(`Processing ${adjustedAllVaultAccounts.length} non-ignored vaults`);
  
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
            // Optionally fetch question for additional filtering
            try {
              const question = await conditionalVaultClient.fetchQuestion(vault.account.question);
              // Check if the question is resolved (has non-zero payoutDenominator)
              if (question && question.payoutDenominator > 0) {
                activeVaults.push({
                  publicKey: vaultKey,
                  account: vault.account,
                  question: question
                });
              } else {
                inactiveVaults.push(vaultKey);
              }
            } catch (error) {
              logger.warn(`Error fetching question for vault ${vaultKey}: ${error}`);
              // Still add the vault if we can't fetch the question
              activeVaults.push({
                publicKey: vaultKey,
                account: vault.account
              });
            }
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
  const conditionalMintPubkeys = new Map<string, PublicKey>();
  
  for (const vault of activeVaults) {
    if (vault.account.conditionalTokenMints && vault.account.conditionalTokenMints.length > 0) {
      for (const mint of vault.account.conditionalTokenMints) {
        const mintStr = mint.toString();
        conditionalMintPubkeys.set(mintStr, mint);
      }
    }
  }
  
  logger.info(`Found ${conditionalMintPubkeys.size} unique conditional token mints`);
  return conditionalMintPubkeys;
}

async function mapMintsToAmms(conditionalMints: Set<string>): Promise<Map<string, PublicKey[]>> {
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
  return mintToAmmsMap;
}

async function getUsersForAmms(amms: PublicKey[]): Promise<Map<string, string[]>> {
  const ammToUsersMap = new Map<string, string[]>();
  
  for (const ammPubkey of amms) {
    const ammAddr = ammPubkey.toString();
    
    // Get users who have swapped with this AMM
    const users = await db.selectDistinct({
      userAddr: schema.v0_4_swaps.userAddr
    })
    .from(schema.v0_4_swaps)
    .where(eq(schema.v0_4_swaps.ammAddr, ammAddr));
    
    // Filter out any null/undefined userAddrs and add to map
    const validUsers = users
      .map(user => user.userAddr)
      .filter((addr): addr is string => addr !== null && addr !== undefined);
    
    // Store the list of users for this specific AMM
    ammToUsersMap.set(ammAddr, validUsers);
  }
  
  return ammToUsersMap;
}

async function getMintUsersMapping(conditionalMints: Set<string>): Promise<Map<string, Map<string, string[]>>> {
  // First get mint -> AMMs mapping
  const mintToAmmsMap = await mapMintsToAmms(conditionalMints);
  
  // Initialize result: mint -> (AMM -> users)
  const mintToAmmToUsersMap = new Map<string, Map<string, string[]>>();
  
  // For each mint, get its AMMs and their users
  for (const [mint, amms] of mintToAmmsMap.entries()) {
    // Get the mapping of AMMs to their users
    const ammToUsersMap = await getUsersForAmms(amms);
    
    // Store this mapping for the current mint
    mintToAmmToUsersMap.set(mint, ammToUsersMap);
  }
  
  logger.info(`Created mapping of ${mintToAmmToUsersMap.size} mints to their AMMs and users`);
  return mintToAmmToUsersMap;
}

async function filterRecentlyUpdatedAccounts(accounts: string[]): Promise<string[]> {
  try {
    if (accounts.length === 0) {
      return [];
    }
    
    // Query the database for these accounts' update times
    const recentUpdates = await db.select({
      tokenAcct: schema.tokenAccts.tokenAcct,
      updatedAt: schema.tokenAccts.updatedAt
    })
    .from(schema.tokenAccts)
    .where(inArray(schema.tokenAccts.tokenAcct, accounts));

    // Calculate threshold timestamp
    const thresholdTime = Math.floor(Date.now() / 1000) - (UPDATE_THRESHOLD_HOURS * 60 * 60);

    // Create a set of recently updated accounts
    const recentlyUpdatedAccounts = new Set(
      recentUpdates
        .filter(account => account.updatedAt && new Date(account.updatedAt).getTime() / 1000 > thresholdTime)
        .map(account => account.tokenAcct)
    );

    const filteredAccounts = accounts.filter(account => !recentlyUpdatedAccounts.has(account));

    logger.info(`Filtered out ${accounts.length - filteredAccounts.length} accounts that were updated in the last ${UPDATE_THRESHOLD_HOURS} hours`);
    return filteredAccounts;
  } catch (error) {
    logger.error(`Error filtering recently updated accounts: ${error}`);
    return accounts; // Return original accounts if filtering fails
  }
}

async function processUserMintTokenAccounts(
  mintToAmmToUsersMap: Map<string, Map<string, string[]>>,
  conditionalMintPubkeys: Map<string, PublicKey>
): Promise<{ updated: number, errors: number }> {
  let updated = 0;
  let errors = 0;
  
  const allTokenAccounts: { account: PublicKey, mint: PublicKey, mintStr: string }[] = [];
  
  for (const [mintStr, ammToUsersMap] of mintToAmmToUsersMap.entries()) {
    const mintPubkey = conditionalMintPubkeys.get(mintStr);
    if (!mintPubkey) continue;
    
    logger.info(`Processing mint ${mintStr}`);
    
    // Collect all unique users across all AMMs for this mint
    const uniqueUsers = new Set<string>();
    for (const users of ammToUsersMap.values()) {
      for (const user of users) {
        uniqueUsers.add(user);
      }
    }
    
    const userCount = uniqueUsers.size;
    logger.info(`Found ${userCount} unique users for mint ${mintStr}`);
    
    // Skip processing if no users found
    if (userCount === 0) {
      continue;
    }
    
    // Create token accounts for all user-mint pairs
    const userArray = Array.from(uniqueUsers);
    for (const userAddr of userArray) {
      try {
        const userPubkey = new PublicKey(userAddr);
        const tokenAccount = splToken.getAssociatedTokenAddressSync(
          mintPubkey,
          userPubkey,
          true
        );
        allTokenAccounts.push({ 
          account: tokenAccount, 
          mint: mintPubkey,
          mintStr 
        });
      } catch (error) {
        logger.debug(`Error creating token account for user ${userAddr} and mint ${mintStr}: ${error}`);
      }
    }
  }
  
  if (allTokenAccounts.length === 0) {
    logger.info("No valid token accounts created across all mints. Nothing to process.");
    return { updated, errors };
  }
  
  logger.info(`Created a total of ${allTokenAccounts.length} token accounts across all mints`);
  
  // Convert PublicKey objects to strings for filtering
  const allTokenAccountAddrs = allTokenAccounts.map(item => item.account.toString());
  
  logger.info("Filtering all token accounts to skip recently updated ones...");
  
  // Filter out recently updated accounts
  const filteredTokenAccountAddrs = await filterRecentlyUpdatedAccounts(allTokenAccountAddrs);
  
  if (filteredTokenAccountAddrs.length === 0) {
    logger.info("All token accounts were recently updated. Nothing to process.");
    return { updated, errors };
  }
  
  // Filter the original objects to match filtered addresses
  const filteredTokenAccounts = allTokenAccounts.filter(item => 
    filteredTokenAccountAddrs.includes(item.account.toString())
  );
  
  logger.info(`Processing ${filteredTokenAccounts.length} token accounts across all mints`);
  
  // Batch accounts for getMultipleAccounts calls (100 account limit)
  const ACCOUNT_BATCH_SIZE = 100;
  const accountBatches = [];
  for (let i = 0; i < filteredTokenAccounts.length; i += ACCOUNT_BATCH_SIZE) {
    accountBatches.push(filteredTokenAccounts.slice(i, i + ACCOUNT_BATCH_SIZE));
  }
  
  logger.info(`Split into ${accountBatches.length} batches (max 100 accounts per batch)`);
  
  // Rate limit batch processing
  const batchProcessLimit = pLimit(2);
  const batchProcessPromises = accountBatches.map((batch, batchIndex) =>
    batchProcessLimit(async () => {
      try {
        // Extract just the PublicKey objects for the API call
        const accountPublicKeys = batch.map(item => item.account);
        
        // Get token account info for the batch (max 100 accounts)
        const tokenAccountInfos = await splToken.getMultipleAccounts(connection, accountPublicKeys);
        
        const successCount = tokenAccountInfos.filter(info => info !== null).length;
        logger.info(`Retrieved ${successCount}/${batch.length} token account details (batch ${batchIndex + 1}/${accountBatches.length})`);
        
        // Update database with token balances
        for (let i = 0; i < tokenAccountInfos.length; i++) {
          const info = tokenAccountInfos[i];
          if (!info) continue;
          
          const { account, mint, mintStr } = batch[i];
          
          try {
            await updateOrInsertTokenBalance(
              db,
              account,
              BigInt(info.amount.toString() ?? "0"),
              mint,
              info.owner,
              "market_actor_snapshot",
              "0",
              Math.floor(Date.now() / 1000)
            );
            updated++;
          } catch (error) {
            logger.error(`Error updating token balance: ${error}`);
            errors++;
          }

          // await delay(DB_DELAY_MS);
        }
      } catch (error) {
        logger.error(`Error processing account batch ${batchIndex + 1}/${accountBatches.length}: ${error}`);
        errors++;
      }
      
      await delay(RPC_DELAY_MS);
    })
  );
  
  // Wait for all batches to be processed
  await Promise.all(batchProcessPromises);
  
  return { updated, errors };
}

export async function captureTokenBalanceSnapshotV4(): Promise<{message: string, error: Error | undefined}> {
  try {
    logger.info("Starting token balance snapshot for active vaults");
    
    const activeVaults = await getActiveVaults();
    
    const conditionalMintPubkeys = collectConditionalMints(activeVaults);
    const conditionalMints = new Set(conditionalMintPubkeys.keys());
    
    const mintToAmmToUsersMap = await getMintUsersMapping(conditionalMints);
    
    const result = await processUserMintTokenAccounts(mintToAmmToUsersMap, conditionalMintPubkeys);
    
    return {
      message: `Successfully updated ${result.updated} token balances in token_accts table. Encountered ${result.errors} errors.`,
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