import { Connection, PublicKey, AccountInfo, Transaction, SimulatedTransactionResponse, RpcResponseAndContext, VersionedTransaction } from '@solana/web3.js';

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
   * Uses the new API only supports VersionedTransaction
   * @param transaction - The transaction to simulate
   * @returns The simulated transaction response
   */
  async simulateTransaction(
    transaction: Transaction
  ): Promise<SimulatedTransactionResponse> {
    // Convert legacy Transaction to VersionedTransaction for new API
    const message = transaction.compileMessage();
    const versionedTx = new VersionedTransaction(message);
    
    const result: RpcResponseAndContext<SimulatedTransactionResponse> = 
      await this.connection.simulateTransaction(versionedTx);
    return result.value;
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

