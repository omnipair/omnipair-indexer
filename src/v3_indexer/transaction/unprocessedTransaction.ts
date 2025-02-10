import { db } from "@metadaoproject/indexer-db";
import { TransactionRecord } from "@metadaoproject/indexer-db/lib/schema";
import { log } from "../../logger/logger";
import { BaseTransaction } from "./baseTransaction";


const logger = log.child({
  module: "swap"
});


//this is just an error transaction.  It just saves the transaction record and stops further processing
//it only exists to have persistable be abstract.
export class UnprocessedTransaction extends BaseTransaction {
  constructor( transactionRecord: TransactionRecord) {
    super(transactionRecord);
  }

  async persist(): Promise<boolean> {
     //save the transaction record first
    this.saveRecord();

    try {
      const text = `INSERT INTO unprocessed_transactions (tx_sig) values($1) ON CONFLICT (tx_sig) DO NOTHING`;
      const res = await db.$client.query(text, [this.transactionRecord.txSig]);
      if (res.rowCount !== 1) {
        logger.warn(`Failed to insert unprocessed transaction ${this.transactionRecord.txSig}`);
      }
    } catch (e) {
      logger.warn(e, `error saving transaction record ${this.transactionRecord.txSig}`);
      return false;
    }
    return true;
  }
}
