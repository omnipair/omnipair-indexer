use std::{collections::HashSet, sync::Arc};
use async_trait::async_trait;
use carbon_core::{
    error::CarbonResult,
    metrics::MetricsCollection,
    datasource::{AccountUpdate, Datasource, DatasourceId, Update, UpdateType},
};
use carbon_helius_atlas_ws_datasource::{Filters, HeliusWebsocket};
use helius::types::{
    Cluster, RpcTransactionsConfig, TransactionSubscribeFilter, 
    TransactionSubscribeOptions, TransactionCommitment, 
    UiEnhancedTransactionEncoding, TransactionDetails
};
use solana_client::{
    nonblocking::rpc_client::RpcClient,
    rpc_config::RpcProgramAccountsConfig,
};
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
