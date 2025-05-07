import { Connection } from "@solana/web3.js";
import { AnchorProvider, Wallet } from "@coral-xyz/anchor";
import { ConditionalVaultClient, AmmClient, LaunchpadClient, AutocratClient } from "@metadaoproject/futarchy/v0.4";
import { exec } from "child_process";
import dns from 'dns';
import { promisify } from 'util';

const resolve4 = promisify(dns.resolve4);

export const RPC_ENDPOINT = process.env.RPC_ENDPOINT ?? "";

if (!RPC_ENDPOINT) {
  throw new Error("RPC_ENDPOINT is not set");
}

export const connection: Connection = new Connection(RPC_ENDPOINT, "confirmed");

async function getServerIP(url: string): Promise<string> {
  try {
    const hostname = new URL(url).hostname;
    const addresses = await resolve4(hostname);
    return addresses[0];
  } catch (error) {
    console.error('Error resolving IP:', error);
    const hostname = new URL(url).hostname;
    return hostname;
  }
}

// Get server IP and ping it
getServerIP(RPC_ENDPOINT).then(ip => {
  exec(`ping -c 1 ${ip}`, (error, stdout, stderr) => {
    if (error) {
      console.error(`Error executing ping: ${error}`);
      return;
    }
    console.log(`Output: ${stdout}`);
    if (stderr) {
      console.error(`Stderr: ${stderr}`);
    }
  });
});

// the indexer will only be reading, not writing
export const readonlyWallet: Wallet = undefined as unknown as Wallet;
export const provider = new AnchorProvider(connection, readonlyWallet, {
  commitment: "confirmed",
});

export const ammClient = AmmClient.createClient({ provider });
export const conditionalVaultClient = ConditionalVaultClient.createClient({ provider });
export const launchpadClient = LaunchpadClient.createClient({ provider });
export const autocratClient = AutocratClient.createClient({ provider });