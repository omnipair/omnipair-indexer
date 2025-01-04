import { db, eq, schema } from "@metadaoproject/indexer-db";
import { PricesRecord, PricesType } from "@metadaoproject/indexer-db/lib/schema";
import { connection } from "./connection";
import { log } from "./logger/logger";

const logger = log.child({
  module: "priceHandler"
});

interface PriceData {
  id: string;
  type: string;
  price: string;
}

const baseUrl = "https://api.jup.ag/price/v2?ids=";

export async function updatePrices(): Promise<{message:string, error: Error|undefined}> {

  const startTime = performance.now();
  //get all the daos that are not hidden
  const results = await db.select({
    baseAcct: schema.daos.baseAcct
  }).from(schema.daos)
    .leftJoin(schema.daoDetails, eq(schema.daoDetails.daoId, schema.daos.daoId))
    .where(eq(schema.daoDetails.isHide, false)).execute();

  
  let ids = "";
  for (const res of results) {
    ids += res.baseAcct + ",";
  }

  const url = baseUrl + ids;
  const response = await fetch(url);
  const data = await response.json();
  const slot = await connection.getSlot();

  let missingPrices = [];
  let errors = [];
  for (const [tokenId, priceData] of Object.entries(data.data)) {
    
    if (priceData) {
      const pd = priceData as PriceData;
      
      const newPrice: PricesRecord = {
        marketAcct: pd.id,
        price: pd.price,
        pricesType: PricesType.Spot,
        createdBy: "jupiter-quotes-indexer",
        updatedSlot: slot?.toString() ?? "0",
      };

      try {
        await db.insert(schema.prices)
          .values(newPrice)
          .onConflictDoNothing()
          .execute();
      } catch (error) {
        logger.error(`Error inserting price for ${tokenId}: ${error}`);
        errors.push(`Error inserting price for ${tokenId}: ${error}`);
      }

    } else {
      logger.warn(`No price data found for ${tokenId}`);
      missingPrices.push(tokenId);
    }
    
  }

  const endTime = performance.now();
  const missingPricesMessage = missingPrices.filter(Boolean).join('<br>');
  const message = `Updated prices in ${(endTime - startTime)/1000}s missing <br>${missingPricesMessage}`;
  logger.info(message);

  return {message: message, error: errors.length > 0 ? new Error(errors.join('\n')) : undefined};
}
