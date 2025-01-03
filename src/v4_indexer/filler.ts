import { ConfirmedSignatureInfo, Connection, PublicKey } from "@solana/web3.js";
import { AMM_PROGRAM_ID as V4_AMM_PROGRAM_ID, AUTOCRAT_PROGRAM_ID as V4_AUTOCRAT_PROGRAM_ID, CONDITIONAL_VAULT_PROGRAM_ID as V4_CONDITIONAL_VAULT_PROGRAM_ID } from "@metadaoproject/futarchy/v0.4";
import { db, schema, eq, asc } from "@metadaoproject/indexer-db";
import { log } from "../logger/logger";
import { index } from "./indexer";

const RPC_ENDPOINT = process.env.RPC_ENDPOINT;

if (!RPC_ENDPOINT) {
  throw new Error("RPC_ENDPOINT is not set");
}
const connection = new Connection(RPC_ENDPOINT);
const logger = log.child({
  module: "v4_filler"
});

// it's possible that there are signatures BEFORE the oldest signature
// because the indexer may not have been running when those signatures were created

// it's also possible that there are signatures AFTER the newest signature

// we assume that there aren't signatures between the oldest and newest signatures

// we split these into two functions:
// - backfillHistoricalSignatures
// - insertNewSignatures

const backfillHistoricalSignatures = async (
  programId: PublicKey,
) => {
  let backfilledSignatures: ConfirmedSignatureInfo[] = [];
  let oldestSignature = await db.select({ signature: schema.signatures.signature })
      .from(schema.signatures)
      .orderBy(asc(schema.signatures.slot))
      .limit(1)
      .then(signatures => signatures[0] ? signatures[0].signature : undefined);

  while (true) {
    const signatures = await connection.getSignaturesForAddress(
      programId,
      { before: oldestSignature, limit: 1000 },
      "confirmed"
    );

    if (signatures.length === 0) break;

    await insertSignatures(signatures, programId);

    //trigger indexing
    Promise.all(signatures.map(async (signature: ConfirmedSignatureInfo) => {
      await index(signature.signature, programId);
    }));

    backfilledSignatures = backfilledSignatures.concat(signatures);
    oldestSignature = signatures[signatures.length - 1].signature;

    logger.info(`backfilled ${backfilledSignatures.length} historical signatures so far...`);
  }

  logger.info(`now done backfilling. backfilled ${backfilledSignatures.length} historical signatures`);
  return backfilledSignatures;
};

const insertNewSignatures = async (programId: PublicKey) => {
  let allSignatures: ConfirmedSignatureInfo[] = [];
  //get latest signature from db indexers table latestTxSigProcessed
  let latestRecordedSignature = await getLatestTxSigProcessed();

  let oldestSignatureInserted: string | undefined;
  while (true) {
    const signatures = await connection.getSignaturesForAddress(
      programId,
      { limit: 1000, until: latestRecordedSignature, before: oldestSignatureInserted },
      "confirmed"
    );

    if (signatures.length === 0) break;

    await insertSignatures(signatures, programId);

    //trigger indexing
    //TODO: maybe only index if signature doesnt exist in signatures table (which would mean it wasnt indexed yet)
    Promise.all(signatures.map(async (signature: ConfirmedSignatureInfo) => {
      await index(signature.signature, programId);
    }));

    allSignatures = allSignatures.concat(signatures);
    if (!oldestSignatureInserted) setLatestTxSigProcessed(signatures[0].signature); //since getSignaturesForAddress is a backwards walk, this should be the latest signature
    oldestSignatureInserted = signatures[signatures.length - 1].signature;
  }

  return allSignatures;
}

const insertSignatures = async (signatures: ConfirmedSignatureInfo[], queriedAddr: PublicKey) => {
  
  try {
    await db.insert(schema.signatures).values(signatures.map(tx => ({
      signature: tx.signature,
      slot: tx.slot.toString(),
      didErr: tx.err !== null,
      err: tx.err ? JSON.stringify(tx.err) : null,
      blockTime: tx.blockTime ? new Date(tx.blockTime * 1000) : null,
    }))).onConflictDoNothing().execute();
  
    await db.insert(schema.signature_accounts).values(signatures.map(tx => ({
      signature: tx.signature,
      account: queriedAddr.toString()
    }))).onConflictDoNothing().execute();
  } catch (e) {
    logger.warn(e, "Error inserting the signatures");
  }
  
}

//set latestProcessedSlot in db
async function setLatestProcessedSlot(slot: number) {
  
  await db.update(schema.indexers)
      .set({ latestSlotProcessed: slot.toString() })
      .where(eq(schema.indexers.name, "v0_4_amm_indexer"))
      .execute();
    
  
}

//set latestTxSigProcessed
async function setLatestTxSigProcessed(signature: string) {
  await db.update(schema.indexers).set({ latestTxSigProcessed: signature }).where(eq(schema.indexers.name, "v0_4_amm_indexer")).execute();
}

//get latestTxSigProcessed
async function getLatestTxSigProcessed() {
  return await db.select({ signature: schema.indexers.latestTxSigProcessed })
      .from(schema.indexers)
      .where(eq(schema.indexers.name, "v0_4_amm_indexer"))
      .then(signatures => signatures[0] ? signatures[0].signature as string : undefined);

}


const programIds = [V4_CONDITIONAL_VAULT_PROGRAM_ID, V4_AMM_PROGRAM_ID, V4_AUTOCRAT_PROGRAM_ID];

export async function backfill(): Promise<Error | undefined> {
  const errors = await Promise.all(programIds.map(async (programId) => {
    try {
      const backfilledSignatures = await backfillHistoricalSignatures(programId);
      logger.info(`backfilled ${backfilledSignatures.length} signatures for ${programId.toString()}`);
      return null;
    } catch (error) {
      logger.error(
        error instanceof Error ? 
        `Error in backfill for ${programId.toString()}: ${error.message}` : 
        `Unknown error in backfill for ${programId.toString()}`
      );
      return error;
    }
  }));
  const errorMessage = errors.filter(Boolean).join('');
  return errorMessage ? new Error(errorMessage) : undefined;
}

export async function frontfill(): Promise<Error | undefined> {
  const errors = await Promise.all(programIds.map(async (programId) => {
    try {
      
      const newSignatures = await insertNewSignatures(programId);
      logger.info(`inserted up to ${newSignatures.length} new signatures for ${programId.toString()}`);
      return null;
      
    } catch (error) {
      logger.error(
        error instanceof Error ? 
        `Error in backfill for ${programId.toString()}: ${error.message}` : 
        `Unknown error in backfill for ${programId.toString()}`
      );
      return error;
    }
  }));
  const errorMessage = errors.filter(Boolean).join('');
  return errorMessage ? new Error(errorMessage) : undefined;
}
