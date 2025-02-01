import { db, eq, schema } from "@metadaoproject/indexer-db";
import { OrdersRecord, TakesRecord, TokenRecord, TransactionRecord } from "@metadaoproject/indexer-db/lib/schema";
import { log } from "../../logger/logger";
import { BaseTransaction } from "./baseTransaction";


const logger = log.child({
  module: "swap"
});

export class SwapTransaction extends BaseTransaction {
  protected ordersRecord: OrdersRecord;
  protected takesRecord: TakesRecord;
  
  constructor(
    ordersRecord: OrdersRecord,
    takesRecord: TakesRecord,
    transactionRecord: TransactionRecord,    
  ) {
    super(transactionRecord);
    this.ordersRecord = ordersRecord;
    this.takesRecord = takesRecord;
    
    //this.priceRecord = priceRecord;
  }

  async persist(): Promise<boolean> {
    try {
      //save the transaction record first
      this.saveRecord();

      // Insert user if they aren't already in the database
      await db.insert(schema.users)
        .values({ userAcct: this.ordersRecord.actorAcct })
        .onConflictDoNothing()
        .returning({ userAcct: schema.users.userAcct });
        

      const orderInsertRes = await db.insert(schema.orders)
        .values(this.ordersRecord)
        .onConflictDoNothing()
        .returning({ txSig: schema.orders.orderTxSig });
        
      if (orderInsertRes.length > 0) {
        console.log( "successfully inserted swap order record", orderInsertRes[0].txSig );
      }
      
      const takeInsertRes = await db.insert(schema.takes)
        .values(this.takesRecord)
        .onConflictDoNothing()
        .returning({ txSig: schema.takes.orderTxSig });
        
      if (takeInsertRes.length > 0) {
        logger.info(`successfully inserted swap take record. ${takeInsertRes[0].txSig}` );
      }
    } catch (e) {
      logger.error(e, `error with persisting swap: ${e}`);
      return false;
    }

    return true;
  }
}
