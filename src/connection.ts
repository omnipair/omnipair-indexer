import { Connection, PublicKey } from "@solana/web3.js";
import { AnchorProvider, Wallet } from "@coral-xyz/anchor";
import dns from 'dns';
import { promisify } from 'util';

const resolve4 = promisify(dns.resolve4);

// Get RPC endpoint from environment variables
export const RPC_ENDPOINT = process.env.SOLANA_RPC_URL ?? process.env.RPC_ENDPOINT ?? "https://api.mainnet-beta.solana.com";
export const WS_ENDPOINT = process.env.SOLANA_WS_URL ?? process.env.WS_ENDPOINT ?? "wss://api.mainnet-beta.solana.com";

// Create Solana connection
export const connection: Connection = new Connection(RPC_ENDPOINT, {
  commitment: "confirmed",
  wsEndpoint: WS_ENDPOINT,
});

// Log connection details
try {
  const hostname = new URL(RPC_ENDPOINT).hostname;
  const addresses = await resolve4(hostname);
  console.log("Connecting to Solana RPC at IP:", addresses[0]);
} catch (error) {
  console.error('Error resolving RPC IP:', error);
  const hostname = new URL(RPC_ENDPOINT).hostname;
  console.log("Connecting to Solana RPC at hostname:", hostname);
}

// Create a readonly wallet for the indexer (we only read, never write)
export const readonlyWallet: Wallet = {
  publicKey: PublicKey.default,
  signTransaction: async () => {
    throw new Error("Indexer is read-only and cannot sign transactions");
  },
  signAllTransactions: async () => {
    throw new Error("Indexer is read-only and cannot sign transactions");
  },
} as Wallet;

// Create Anchor provider
export const provider = new AnchorProvider(connection, readonlyWallet, {
  commitment: "confirmed",
});

// Omnipair program ID (from the Rust program)
export const OMNIPAIR_PROGRAM_ID = new PublicKey("3tJrAXnjofAw8oskbMaSo9oMAYuzdBgVbW3TvQLdMEBd");

// Export connection for use in other modules
export default connection;