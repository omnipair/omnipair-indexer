use std::{collections::HashSet, sync::Arc, time::Duration};
use async_trait::async_trait;
use carbon_core::{
    error::CarbonResult,
    metrics::MetricsCollection,
    datasource::{AccountUpdate, Datasource, DatasourceId, Update, UpdateType},
};
use carbon_helius_atlas_ws_datasource::{Filters, HeliusWebsocket};
use carbon_rpc_transaction_crawler_datasource::{ConnectionConfig, Filters as TransactionFilters, RpcTransactionCrawler, RetryConfig};
use helius::types::{
    Cluster, RpcTransactionsConfig, TransactionSubscribeFilter, 
    TransactionSubscribeOptions, TransactionCommitment, 
    UiEnhancedTransactionEncoding, TransactionDetails as HeliusTransactionDetails
};
use solana_client::{
    nonblocking::rpc_client::RpcClient,
    rpc_config::{RpcProgramAccountsConfig, RpcBlockConfig},
};
use solana_transaction_status::{UiTransactionEncoding, TransactionDetails};
use solana_commitment_config::CommitmentConfig;
use solana_pubkey::Pubkey;
use solana_signature::Signature;
use tokio::sync::{mpsc::Sender, RwLock};
use tokio_util::sync::CancellationToken;

/// Creates a configured Helius Atlas WebSocket datasource for Omnipair transaction monitoring
pub fn create_helius_datasource(api_key: &str, program_id: Pubkey) -> HeliusWebsocket {
    let filters = Filters {
        accounts: vec![],
        transactions: Some(RpcTransactionsConfig {
            filter: TransactionSubscribeFilter {
                account_include: Some(vec![program_id.to_string()]),
                account_exclude: None,
                account_required: None,
                vote: Some(false),
                failed: Some(false),
                signature: None,
            },
            options: TransactionSubscribeOptions {
                commitment: Some(TransactionCommitment::Confirmed),
                encoding: Some(UiEnhancedTransactionEncoding::Base64),
                transaction_details: Some(HeliusTransactionDetails::Full),
                show_rewards: None,
                max_supported_transaction_version: Some(0),
            },
        }),
    };

    // Determine cluster based on environment variable
    let cluster = match std::env::var("CLUSTER").unwrap_or_default().to_lowercase().as_str() {
        "devnet" => Cluster::Devnet,
        _ => Cluster::MainnetBeta,
    };

    HeliusWebsocket::new(
        api_key.to_string(),
        filters,
        Arc::new(RwLock::new(HashSet::new())), // track deletions if you later add accounts
        cluster,
    )
}

/// Helper function to get the slot number for a given block number
/// This converts START_BLOCK to START_SLOT for the transaction crawler
async fn get_slot_for_block(rpc_url: &str, block_number: u64) -> Option<u64> {
    let rpc_client = RpcClient::new(rpc_url.to_string());
    
    // Get block information for the specified block number
    match rpc_client.get_block_with_config(
        block_number,
        RpcBlockConfig {
            encoding: Some(UiTransactionEncoding::Base64),
            transaction_details: Some(TransactionDetails::Full),
            rewards: Some(false),
            commitment: Some(CommitmentConfig::confirmed()),
            max_supported_transaction_version: Some(0),
        }
    ).await {
        Ok(_block) => {
            // The block's slot is the block number itself in Solana
            // Each block corresponds to a slot, but not every slot has a block
            log::info!("Found block {} at slot {}", block_number, block_number);
            Some(block_number)
        }
        Err(e) => {
            log::warn!("Failed to fetch block {}: {:?}", block_number, e);
            None
        }
    }
}

/// Helper function to find a signature at or before a given slot
/// This is used to convert START_SLOT to a before_signature for the transaction crawler
async fn find_signature_at_slot(rpc_url: &str, program_id: Pubkey, target_slot: u64) -> Option<Signature> {
    let rpc_client = RpcClient::new(rpc_url.to_string());
    
    log::info!("Searching for signature at or before slot {} for program {}", target_slot, program_id);
    
    let mut before_signature: Option<Signature> = None;
    let found_signature = false;
    let mut attempts = 0;
    const MAX_ATTEMPTS: u32 = 10; // Prevent infinite loops
    
    // Search through signatures in batches, going backwards in time
    while !found_signature && attempts < MAX_ATTEMPTS {
        attempts += 1;
        
        match rpc_client.get_signatures_for_address_with_config(
            &program_id,
            solana_client::rpc_client::GetConfirmedSignaturesForAddress2Config {
                before: before_signature,
                until: None,
                limit: Some(1000), // Get a large batch to search through
                commitment: Some(CommitmentConfig::confirmed()),
            }
        ).await {
            Ok(signatures) => {
                if signatures.is_empty() {
                    log::warn!("No more signatures found for program {}", program_id);
                    break;
                }
                
                log::info!("Fetched {} signatures, checking slots from {} to {}", 
                    signatures.len(), 
                    signatures.last().map(|s| s.slot).unwrap_or(0),
                    signatures.first().map(|s| s.slot).unwrap_or(0)
                );
                
                // Find the first signature at or before the target slot
                for sig_info in &signatures {
                    if sig_info.slot <= target_slot {
                        log::info!("Found signature {} at slot {} (target: {})", 
                            sig_info.signature, sig_info.slot, target_slot);
                        return Some(sig_info.signature.parse().ok()?);
                    }
                }
                
                // Update before_signature to continue searching backwards
                if let Some(last_sig) = signatures.last() {
                    before_signature = Some(last_sig.signature.parse().ok()?);
                    log::info!("Continuing search from signature {} at slot {}", 
                        last_sig.signature, last_sig.slot);
                } else {
                    break;
                }
            }
            Err(e) => {
                log::warn!("Failed to fetch signatures for slot conversion (attempt {}): {:?}", attempts, e);
                break;
            }
        }
    }
    
    if attempts >= MAX_ATTEMPTS {
        log::warn!("Reached maximum attempts ({}) while searching for signature at slot {}", MAX_ATTEMPTS, target_slot);
    }
    
    log::warn!("No signature found at or before slot {} for program {}", target_slot, program_id);
    None
}

/// Creates a configured RPC Transaction Crawler datasource for Omnipair transaction monitoring
/// This is more efficient than the block crawler as it pre-filters transactions by program ID
pub async fn create_transaction_crawler_datasource(htt_rpc_url: String, program_id: Pubkey, start_block: Option<u64>) -> CarbonResult<RpcTransactionCrawler> {
    let connection_config = ConnectionConfig::new(
        100, // batch_limit: fetch 100 signatures at a time
        Duration::from_secs(5), // polling_interval: check for new transactions every 5 seconds
        5, // max_concurrent_requests: fetch up to 5 transactions concurrently
        RetryConfig::no_retry(), // retry_config: no retry for faster processing
        None, // max_signature_channel_size: use default
        None, // max_transaction_channel_size: use default
        true, // blocking_send: use blocking send for reliability
    );

    // Convert START_BLOCK to until_signature if provided
    // We use until_signature because the crawler processes newest first, and we want to start from START_BLOCK
    let until_signature = if let Some(block_number) = start_block {
        if block_number == 0 {
            log::info!("START_BLOCK is 0, starting from most recent transactions");
            None
        } else {
            log::info!("Converting START_BLOCK {} to slot and signature for transaction crawler", block_number);
            
            // First, get the slot for this block
            match get_slot_for_block(&htt_rpc_url, block_number).await {
                Some(slot) => {
                    log::info!("Block {} corresponds to slot {}", block_number, slot);
                    
                    // Then find a signature at or before this slot
                    match find_signature_at_slot(&htt_rpc_url, program_id, slot).await {
                        Some(sig) => {
                            log::info!("Found signature {} at slot {} (block {}) or earlier", sig, slot, block_number);
                            Some(sig)
                        }
                        None => {
                            log::warn!("No signature found at or before slot {} (block {}), starting from most recent", slot, block_number);
                            None
                        }
                    }
                }
                None => {
                    log::warn!("Failed to find slot for block {}, starting from most recent", block_number);
                    None
                }
            }
        }
    } else {
        log::info!("No START_BLOCK provided, starting from most recent transactions");
        None
    };

    let filters = TransactionFilters::new(
        None, // accounts: no additional filtering (program ID is handled by the account parameter)
        None, // before_signature: start from most recent (crawler processes newest first)
        until_signature, // until_signature: stop at START_BLOCK signature (process from START_BLOCK to current)
    );
    
    // Log the final filter configuration
    match &until_signature {
        Some(sig) => log::info!("Transaction crawler configured to process from signature: {} to current", sig),
        None => log::info!("Transaction crawler configured to start from most recent transactions"),
    }

    Ok(RpcTransactionCrawler::new(
        htt_rpc_url,
        program_id, // account: the program ID to monitor (this does the pre-filtering)
        connection_config,
        filters,
        Some(CommitmentConfig::confirmed()),
    ))
}

/// GPA Backfill Datasource for historical account data (kept for future use)
pub struct GpaBackfillDatasource {
    pub rpc_url: String,
    pub program_id: Pubkey,
    pub config: Option<RpcProgramAccountsConfig>,
}

#[async_trait]
impl Datasource for GpaBackfillDatasource {
    async fn consume(
        &self,
        id: DatasourceId,
        sender: Sender<(Update, DatasourceId)>,
        _cancellation_token: CancellationToken,
        _metrics: Arc<MetricsCollection>,
    ) -> CarbonResult<()> {
        let rpc_client = RpcClient::new(self.rpc_url.clone());

        let slot = rpc_client.get_slot().await
            .map_err(|_| carbon_core::error::Error::FailedToConsumeDatasource(
                "Failed to fetch slot".to_string(),
            ))?;

        let program_accounts = match &self.config {
            Some(config) => {
                rpc_client
                    .get_program_accounts_with_config(&self.program_id, config.clone())
                    .await
            }
            None => rpc_client.get_program_accounts(&self.program_id).await,
        }
        .map_err(|_| carbon_core::error::Error::FailedToConsumeDatasource(
            "Failed to fetch program accounts".to_string(),
        ))?;

        log::info!("Found {} program accounts for backfill", program_accounts.len());

        let id_for_loop = id.clone();

        for (pubkey, account) in program_accounts {
            if let Err(e) = sender.try_send((
                Update::Account(AccountUpdate {
                    pubkey,
                    account,
                    slot,
                    transaction_signature: None,
                }),
                id_for_loop.clone(),
            )) {
                log::error!("Failed to send account update: {:?}", e);
            }
        }

        Ok(())
    }

    fn update_types(&self) -> Vec<UpdateType> {
        vec![UpdateType::AccountUpdate]
    }
}
