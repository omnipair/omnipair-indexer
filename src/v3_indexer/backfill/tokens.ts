import { provider } from "../../connection";
import { schema, eq, db } from "@metadaoproject/indexer-db";
import { PublicKey } from "@solana/web3.js";
import { getMint } from "@solana/spl-token";
import { log } from "../../logger/logger";
import pLimit from "p-limit";

const logger = log.child({
  module: "backfill-token-supply"
});

const limit = pLimit(20);


export async function backfillTokenSupply(): Promise<Error | null>{
    
  const startTime = performance.now()
  

  //get all the tokens
  const mintAccounts = await db.select({ acct: schema.tokens.mintAcct }).from(schema.tokens);
  logger.info(`Backfilling token supply with ${mintAccounts.length} tokens`);

  //use plimit to concurrently run all the updates
  const tasks = mintAccounts.map(mint => limit(() => updateMint(mint.acct)));
  const errors = await Promise.all(tasks);
  errors.forEach(err => {
    if (err) logger.error(err);
  });

  const endTime = performance.now()
  logger.info(`Backfilling token supply took ${(endTime - startTime)/1000} seconds`);

  return null;
}

async function updateMint(mintAcct: string): Promise<Error | null> {
  let mint = new PublicKey(mintAcct);
  let storedMint;
  try {
    storedMint = await getMint(provider.connection, mint);
  } catch (err) {

    //this probably shouldnt alert, but we can trim that down with time
    logger.error(err, `Mint ${mint.toString()} not found`);
    return err instanceof Error ? err : new Error(String(err));
  }

  await db.update(schema.tokens)
      .set({ supply: storedMint.supply.toString(), updatedAt: new Date() })
      .where(eq(schema.tokens.mintAcct, mint.toString()));
  
  return null;
}
