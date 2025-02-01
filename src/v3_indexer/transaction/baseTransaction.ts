import { db, schema, eq } from "@metadaoproject/indexer-db";
import { TransactionRecord } from "@metadaoproject/indexer-db/lib/schema";
import { log } from "../../logger/logger";

const logger = log.child({
  module: "baseTransaction"
});

export abstract class BaseTransaction { 
  abstract persist(): Promise<boolean>;
  protected transactionRecord: TransactionRecord;

  constructor(transactionRecord: TransactionRecord) {
    this.transactionRecord = transactionRecord;
  }

  async saveRecord(): Promise<boolean> {
    // First insert the transaction record
    try {
      const upsertResult = await db.insert(schema.transactions)
        .values(this.transactionRecord)
        .onConflictDoUpdate({
          target: schema.transactions.txSig,
          set: this.transactionRecord,
        })
        .returning({ txSig: schema.transactions.txSig });
      
      if (
        upsertResult.length !== 1 ||
        upsertResult[0].txSig !== this.transactionRecord.txSig
      ) {
        logger.warn(`Failed to upsert ${this.transactionRecord.txSig}. ${JSON.stringify(this.transactionRecord)}`);
      }
    } catch (e) {
      logger.warn(e, `error saving transaction record ${this.transactionRecord.txSig}`);
      return false;
    }
    return true;
  }
}