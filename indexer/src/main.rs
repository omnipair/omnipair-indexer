use std::{collections::HashSet, env, sync::Arc, time::Duration};

use {
    async_trait::async_trait,
    carbon_core::{
        error::CarbonResult,
        metrics::MetricsCollection,
        processor::Processor,
        datasource::{AccountUpdate, Datasource, DatasourceId, Update, UpdateType},
        instruction::{DecodedInstruction, InstructionMetadata, NestedInstructions},
    },
    carbon_omnipair_decoder::{
        instructions::OmnipairInstruction,
        OmnipairDecoder,
        PROGRAM_ID as OMNIPAIR_PROGRAM_ID,
    },
    carbon_helius_atlas_ws_datasource::{Filters, HeliusWebsocket},
    helius::types::{
        Cluster, RpcTransactionsConfig, TransactionSubscribeFilter, 
        TransactionSubscribeOptions, TransactionCommitment, 
        UiEnhancedTransactionEncoding, TransactionDetails
    },
    solana_client::{
        nonblocking::rpc_client::RpcClient,
        rpc_config::RpcProgramAccountsConfig,
    },
    clap::Parser,
    solana_pubkey::Pubkey,
    tokio::sync::{mpsc::Sender, RwLock},
    tokio_util::sync::CancellationToken,
    carbon_log_metrics::LogMetrics,
};

#[derive(Parser, Debug)]
#[command(version, about = "Omnipair Indexer Daemon")]
struct Args {
    /// RPC WebSocket URL (falls back to RPC_WS_URL env) - used for account monitoring
    #[arg(long)]
    rpc_ws_url: Option<String>,

    /// Helius API key for transaction monitoring (falls back to HELIUS_API_KEY env)
    #[arg(long)]
    helius_api_key: Option<String>,

    /// Enable account monitoring via RPC program subscribe (default: false)
    #[arg(long, default_value_t = false)]
    enable_account_monitoring: bool,

    /// Health check port (0 disables /health endpoint)
    #[arg(long, default_value_t = 8080)]
    health_port: u16,
}

#[tokio::main]
pub async fn main() -> CarbonResult<()> {
    // Initialize environment and logging
    dotenv::dotenv().ok();
    env_logger::init();

    let args = Args::parse();
    
    log::info!("Starting Omnipair Indexer Daemon");
    log::info!("Program ID: {}", OMNIPAIR_PROGRAM_ID);

    // Start health check server if port is specified
    if args.health_port != 0 {
        log::info!("Starting health check server on port {}", args.health_port);
        tokio::spawn(run_health_server(args.health_port));
    }

    // Get Helius API key (optional)
    let helius_api_key = args.helius_api_key.or_else(|| env::var("HELIUS_API_KEY").ok());

    // Get RPC WebSocket URL (only used if account monitoring is enabled)
    let rpc_ws_url = if args.enable_account_monitoring {
        Some(args.rpc_ws_url.unwrap_or_else(|| {
            env::var("RPC_WS_URL").unwrap_or_else(|_| "wss://api.mainnet-beta.solana.com/".to_string())
        }))
    } else {
        None
    };

    if helius_api_key.is_some() {
        log::info!("Transaction monitoring: Helius Atlas WebSocket");
    } else {
        log::error!("HELIUS_API_KEY is required for transaction monitoring");
        return Err(carbon_core::error::Error::Custom("HELIUS_API_KEY is required".to_string()).into());
    }
    
    if let Some(ref url) = rpc_ws_url {
        log::info!("Account monitoring: Enabled via {}", url);
    } else {
        log::info!("Account monitoring: Disabled");
    }

    // Main daemon loop with exponential backoff for reconnection
    let mut retry_delay = Duration::from_secs(1);
    let max_retry_delay = Duration::from_secs(30);

    loop {
        log::info!("Starting indexer pipeline...");

        match run_indexer_pipeline(helius_api_key.as_deref(), rpc_ws_url.as_deref()).await {
            Ok(_) => {
                log::warn!("Pipeline finished unexpectedly, restarting...");
            }
            Err(e) => {
                log::error!("Pipeline error: {:?}", e);
                log::info!("Retrying in {}s...", retry_delay.as_secs());
                tokio::time::sleep(retry_delay).await;
                
                // Exponential backoff with max limit
                retry_delay = (retry_delay * 2).min(max_retry_delay);
                continue;
            }
        }

        // Reset delay on successful run
        retry_delay = Duration::from_secs(1);
        
        log::info!("Restarting pipeline in {}s...", retry_delay.as_secs());
        tokio::time::sleep(retry_delay).await;
    }
}

async fn run_indexer_pipeline(helius_api_key: Option<&str>, _rpc_ws_url: Option<&str>) -> CarbonResult<()> {
    // 1) Require Helius API key
    let api_key = helius_api_key.ok_or_else(|| {
        carbon_core::error::Error::Custom("HELIUS_API_KEY is required for Atlas WS".to_string())
    })?;

    log::info!("Using Helius Atlas WebSocket for realtime transaction monitoring");

    // 2) Configure transaction subscription with proper filtering

    // 3) Create Atlas WS datasource with proper filter structure
    let filters = Filters {
        accounts: vec![],
        transactions: Some(RpcTransactionsConfig {
            filter: TransactionSubscribeFilter {
                account_include: Some(vec![OMNIPAIR_PROGRAM_ID.to_string()]),
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

    let atlas = HeliusWebsocket::new(
        api_key.to_string(),
        filters,
        Arc::new(RwLock::new(HashSet::new())),        // track deletions if you later add accounts
        Cluster::MainnetBeta,
    );

    // Create processors
    let instruction_processor = OmnipairInstructionProcessor;

    // 4) Build pipeline: ONLY Atlas WS datasource
    let mut pipeline = carbon_core::pipeline::Pipeline::builder()
        .datasource(atlas)
        .metrics(Arc::new(LogMetrics::new()))
        .metrics_flush_interval(3)
        .instruction(OmnipairDecoder, instruction_processor) // will fire on TransactionUpdate
        .shutdown_strategy(carbon_core::pipeline::ShutdownStrategy::ProcessPending)
        .build()?;
    
    log::info!("Pipeline configured: realtime events via Helius Atlas WS (TransactionUpdate)");

    log::info!("Pipeline configured, starting execution...");

    // Run pipeline with graceful shutdown handling
    tokio::select! {
        result = pipeline.run() => {
            match result {
                Ok(_) => {
                    log::info!("Pipeline completed successfully");
                    Ok(())
                }
                Err(e) => {
                    log::error!("Pipeline execution failed: {:?}", e);
                    Err(e)
                }
            }
        }
        _ = tokio::signal::ctrl_c() => {
            log::info!("Received shutdown signal (Ctrl+C)");
            log::info!("Shutting down gracefully...");
            Ok(())
        }
        _ = shutdown_signal() => {
            log::info!("Received system shutdown signal");
            log::info!("Shutting down gracefully...");
            Ok(())
        }
    }
}

async fn run_health_server(port: u16) {
    use axum::{routing::get, Router, Json};
    use serde_json::{json, Value};

    async fn health_check() -> Json<Value> {
        Json(json!({
            "status": "healthy",
            "service": "omnipair-indexer",
            "timestamp": chrono::Utc::now().to_rfc3339(),
            "uptime": format!("{}s", std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap_or_default()
                .as_secs()),
        }))
    }

    let app = Router::new()
        .route("/health", get(health_check))
        .route("/", get(health_check)); // Also respond to root path

    let listener = match tokio::net::TcpListener::bind(("0.0.0.0", port)).await {
        Ok(listener) => listener,
        Err(e) => {
            log::error!("Failed to bind health server to port {}: {:?}", port, e);
            return;
        }
    };

    log::info!("Health server listening on http://0.0.0.0:{}", port);
    log::info!("Health endpoint: http://0.0.0.0:{}/health", port);

    if let Err(e) = axum::serve(listener, app).await {
        log::warn!("Health server stopped: {:?}", e);
    }
}

async fn shutdown_signal() {
    #[cfg(unix)]
    {
        use tokio::signal::unix::{signal, SignalKind};
        
        let mut sigterm = signal(SignalKind::terminate()).unwrap();
        let mut sigint = signal(SignalKind::interrupt()).unwrap();
        
        tokio::select! {
            _ = sigterm.recv() => {
                log::info!("Received SIGTERM");
            }
            _ = sigint.recv() => {
                log::info!("Received SIGINT");
            }
        }
    }
    
    #[cfg(not(unix))]
    {
        // On non-Unix systems, just wait indefinitely
        // The ctrl_c handler above will handle shutdown
        std::future::pending::<()>().await;
    }
}

pub struct OmnipairInstructionProcessor;

#[async_trait]
impl Processor for OmnipairInstructionProcessor {
    type InputType = (
        InstructionMetadata,
        DecodedInstruction<OmnipairInstruction>,
        NestedInstructions,
        solana_instruction::Instruction,
    );

    async fn process(
        &mut self,
        (_metadata, instruction, _nested_instructions, _raw_instruction): Self::InputType,
        _metrics: Arc<MetricsCollection>,
    ) -> CarbonResult<()> {
        // Process different instruction types
        log::info!("Processing instruction: {:?}", instruction.data);
        
        match instruction.data {
            OmnipairInstruction::SwapEvent(swap_event) => {
                log::info!(
                    "SwapEvent processed - User: {:#?}",
                    swap_event,
                );
                
                // TODO: Add database write logic
            }
            _ => {}
        }

        Ok(())
    }
}

// GPA Backfill Datasource (kept for future use)
pub struct GpaBackfillDatasource {
    pub rpc_url: String,
    pub program_id: Pubkey,
    pub config: Option<RpcProgramAccountsConfig>,
}

impl GpaBackfillDatasource {
    pub fn new(
        rpc_url: String,
        program_id: Pubkey,
        config: Option<RpcProgramAccountsConfig>,
    ) -> Self {
        Self {
            rpc_url,
            program_id,
            config,
        }
    }
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

        let Ok(slot) = rpc_client.get_slot().await else {
            return Err(carbon_core::error::Error::FailedToConsumeDatasource(
                "Failed to fetch slot".to_string(),
            ));
        };

        let program_accounts = match &self.config {
            Some(config) => {
                rpc_client
                    .get_program_accounts_with_config(&self.program_id, config.clone())
                    .await
            }
            None => rpc_client.get_program_accounts(&self.program_id).await,
        };

        let Ok(program_accounts) = program_accounts else {
            return Err(carbon_core::error::Error::FailedToConsumeDatasource(
                "Failed to fetch program accounts".to_string(),
            ));
        };

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

    fn update_types(&self) -> Vec<carbon_core::datasource::UpdateType> {
        vec![UpdateType::AccountUpdate]
    }
}