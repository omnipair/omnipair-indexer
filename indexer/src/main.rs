use carbon_core::error::CarbonResult;
use carbon_omnipair_decoder::PROGRAM_ID as OMNIPAIR_PROGRAM_ID;
use clap::Parser;
use std::time::Duration;

mod config;
mod database;
mod datasources;
mod db_listener;
mod grpc_server;
mod health;
mod pipeline;
mod processors;
mod signals;
mod websocket_server;

use config::{Args, Config};
use health::run_health_server;
use pipeline::{create_pipeline, run_pipeline};
use signals::shutdown_signal_token;
use websocket_server::{start_websocket_server, WebSocketConfig, WebSocketServerState};

#[tokio::main]
pub async fn main() -> CarbonResult<()> {
    // Initialize environment and logging
    dotenv::dotenv().ok();
    env_logger::init();

    let args = Args::parse();
    let config = Config::from_args(args);

    log::info!("Starting Omnipair Indexer Daemon");
    log::info!("Program ID: {:?}", *OMNIPAIR_PROGRAM_ID);

    // Validate configuration
    if let Err(e) = config.validate() {
        log::error!("Configuration error: {}", e);
        return Err(carbon_core::error::Error::Custom(e).into());
    }

    // Log configuration
    config.log_configuration();

    // Initialize database connection pool
    log::info!("Initializing database connection pool...");
    if let Err(e) = database::init_db_pool().await {
        log::error!("Failed to initialize database pool: {}", e);
        return Err(e);
    }

    // Create broadcast channel for position updates (capacity: 100 messages)
    let (broadcast_tx, _broadcast_rx) = tokio::sync::broadcast::channel(100);

    // Start DB listener task if gRPC is enabled
    if config.grpc_port != 0 {
        let listener_tx = broadcast_tx.clone();
        let pool = database::get_db_pool()?.clone();

        tokio::spawn(async move {
            log::info!("Starting PostgreSQL LISTEN/NOTIFY listener task");
            if let Err(e) = db_listener::start_db_listener(&pool, listener_tx).await {
                log::error!("DB listener task failed: {}", e);
            }
        });
    }

    // Start gRPC server if enabled
    if config.grpc_port != 0 {
        let grpc_tx = broadcast_tx.clone();
        let grpc_port = config.grpc_port;

        tokio::spawn(async move {
            log::info!("Starting gRPC server task on port {}", grpc_port);
            if let Err(e) = grpc_server::start_grpc_server(grpc_tx, grpc_port).await {
                log::error!("gRPC server task failed: {}", e);
            }
        });
    }

    // Start health check server if enabled
    if config.health_port != 0 {
        log::info!(
            "Starting health check server on port {}",
            config.health_port
        );
        tokio::spawn(run_health_server(config.health_port));
    }

    // Start WebSocket server if enabled and store the state
    let websocket_server_state = if config.websocket_port != 0 {
        log::info!(
            "Starting WebSocket server on port {}",
            config.websocket_port
        );
        let ws_config = WebSocketConfig {
            port: config.websocket_port,
        };
        let cancellation_token = shutdown_signal_token();
        Some(start_websocket_server(ws_config, cancellation_token).await?)
    } else {
        None
    };

    // Main daemon loop with exponential backoff for reconnection
    run_daemon_loop(&config, websocket_server_state).await
}

async fn run_daemon_loop(
    config: &Config,
    websocket_state: Option<WebSocketServerState>,
) -> CarbonResult<()> {
    let mut retry_delay = Duration::from_secs(1);
    let max_retry_delay = Duration::from_secs(30);

    loop {
        log::info!("Starting indexer pipeline...");

        match run_indexer_instance(config, websocket_state.clone()).await {
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

async fn run_indexer_instance(
    config: &Config,
    websocket_state: Option<WebSocketServerState>,
) -> CarbonResult<()> {
    let pipeline = create_pipeline(config, websocket_state).await?;
    run_pipeline(pipeline).await
}
