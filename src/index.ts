import { backfillDaos, backfillProposals, backfillTokenSupply, backfillTransactions } from "./v3_indexer";
import { log } from "./logger/logger";
import { subscribeAll } from "./txLogHandler";
import { frontfill as v4_frontfill, backfill as v4_backfill } from "./v4_indexer/filler";
import { CronJob } from "cron";
import http from "http";
import {  updatePrices } from "./priceHandler";

const logger = log.child({
  module: "main"
});

interface cronFunction {
  (): Promise<Error | undefined>;
}

class CronRunResult {
  name: string;
  error: Error | undefined;
  start: Date;
  end: Date;

  constructor(name: string, error: Error | undefined, start: Date, end: Date) {
    this.name = name;
    this.error = error;
    this.start = start;
    this.end = end;
  }
}
const healthMap = new Map<string, CronRunResult>();

async function main() {

  //first lets backfill v3
  let err = await backfillV3();
  if (err) {
    logger.error(err, "Error backfilling v3");
  }
  //now lets do v4
  err = await backfillV4();
  if (err) {
    logger.error(err, "Error backfilling v4");
  }

  //lets start our crons now
  
  startCron("backfillV3", "*/10 * * * *", backfillV3);
  startCron("backfillV4", "*/10 * * * *", backfillV4);
  startCron("frontfillV4", "*/10 * * * *", frontfillV4);
  startCron("priceHandler", "* * * * *", priceHandler);

  //start tx log subscription
  subscribeAll();

  const server = http.createServer((_req: any, res: any) => {
    
    res.writeHead(200, { 'Content-Type': 'text/html' });
    let html = "<html><body>";
    html += "<h1>Health Check</h1>";
    html += "<table>";
    html += "<tr><th>Name</th><th>Error</th><th>Start</th><th>End</th></tr>";
    for (const result of healthMap.values()) {
      html += `<tr><td>${result.name}</td><td>${result.error?.message || 'None'}</td><td>${result.start.toISOString()}</td><td>${result.end.toISOString()}</td></tr>`;
    }
    html += "</table>";
    html += "</body></html>";
    res.end(html);
   
  });

  server.listen(8080, () => {
    console.log('Server running at http://localhost:8080/');
  });
}


function startCron(cronName: string, cronFrequency: string, cf: cronFunction) {
  
  healthMap.set(cronName, new CronRunResult(cronName, new Error("This job has not started yet"), new Date(), new Date()));

  //every 10 minutes
  const cronJob = new CronJob(cronFrequency, async () => {
    const start = new Date();
    let err = await cf();
    const end = new Date();
    healthMap.set(cronName, new CronRunResult(cronName, err, start, end));
  });
  cronJob.start();
}


/**
 * Backfill V3
 * @returns {Promise<Error | undefined>}
 */
async function backfillV3(): Promise<Error | undefined> {
  
  const backfillTasks = [
    { fn: backfillDaos, name: 'backfillDaos' },
    { fn: backfillProposals, name: 'backfillProposals' },
    { fn: backfillTokenSupply, name: 'backfillTokenSupply' },
    { fn: backfillTransactions, name: 'backfillTransactions' }
  ];

  let errors: string[] = [];
  for (const task of backfillTasks) {
    try {
      const error = await task.fn();
      if (error) {
        errors.push(`${task.name}: ${error}`);
      }
    } catch (error) {
      errors.push(`${task.name}: ${error}`);
    }
  }

  const errorMessage = errors.filter(Boolean).join('');
  return errorMessage ? new Error(errorMessage) : undefined;
}

async function backfillV4(): Promise<Error | undefined> {
  return await v4_backfill();
}

async function frontfillV4(): Promise<Error | undefined> {
  return await v4_frontfill();
}

async function priceHandler(): Promise<Error | undefined> {
  return await updatePrices();
}

// Run the main function
main();
