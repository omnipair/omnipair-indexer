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
    UiEnhancedTransactionEncoding, TransactionDetails
};
use solana_client::{
    nonblocking::rpc_client::RpcClient,
    rpc_config::RpcProgramAccountsConfig,
};
use solana_commitment_config::CommitmentConfig;
use solana_pubkey::Pubkey;
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
                transaction_details: Some(TransactionDetails::Full),
                show_rewards: None,
                max_supported_transaction_version: Some(0),
            },
        }),
    };

    HeliusWebsocket::new(
        api_key.to_string(),
        filters,
        Arc::new(RwLock::new(HashSet::new())), // track deletions if you later add accounts
        Cluster::MainnetBeta,
    )
}

/// Creates a configured RPC Transaction Crawler datasource for Omnipair transaction monitoring
/// This is more efficient than the block crawler as it pre-filters transactions by program ID
pub fn create_transaction_crawler_datasource(htt_rpc_url: String, program_id: Pubkey) -> RpcTransactionCrawler {
    let connection_config = ConnectionConfig::new(
        100, // batch_limit: fetch 100 signatures at a time
        Duration::from_secs(5), // polling_interval: check for new transactions every 5 seconds
        5, // max_concurrent_requests: fetch up to 5 transactions concurrently
        RetryConfig::no_retry(), // retry_config: no retry for faster processing
        None, // max_signature_channel_size: use default
        None, // max_transaction_channel_size: use default
        true, // blocking_send: use blocking send for reliability
    );

    let filters = TransactionFilters::new(
        None, // accounts: no additional filtering (program ID is handled by the account parameter)
        None, // before_signature: start from most recent
        None, // until_signature: no end limit
    );

    RpcTransactionCrawler::new(
        htt_rpc_url,
        program_id, // account: the program ID to monitor (this does the pre-filtering)
        connection_config,
        filters,
        Some(CommitmentConfig::confirmed()),
    )
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
