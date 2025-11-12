import { Connection, PublicKey, AccountInfo, Transaction, SimulatedTransactionResponse } from '@solana/web3.js';

/**
 * RPC Client wrapper for Solana connection
 */
export class RpcClient {
  private connection: Connection;

  constructor(rpcEndpoint: string) {
    this.connection = new Connection(rpcEndpoint, {
      commitment: 'confirmed',
      confirmTransactionInitialTimeout: 60000,
    });
  }

  /**
   * Get account info
   */
  async getAccountInfo(pubkey: PublicKey): Promise<AccountInfo<Buffer> | null> {
    return this.connection.getAccountInfo(pubkey);
  }

  /**
   * Get multiple accounts
   */
  async getMultipleAccountsInfo(
    pubkeys: PublicKey[]
  ): Promise<(AccountInfo<Buffer> | null)[]> {
    return this.connection.getMultipleAccountsInfo(pubkeys);
  }

  /**
   * Get balance
   */
  async getBalance(pubkey: PublicKey): Promise<number> {
    return this.connection.getBalance(pubkey);
  }

  /**
   * Simulate transaction
   */
  async simulateTransaction(
    transaction: Transaction
  ): Promise<SimulatedTransactionResponse> {
    return this.connection.simulateTransaction(transaction);
  }

  /**
   * Get connection instance
   */
  getConnection(): Connection {
    return this.connection;
  }
}

/**
 * Get or create RPC client instance
 */
export function getRpcClient(rpcEndpoint: string): RpcClient {
  return new RpcClient(rpcEndpoint);
}

