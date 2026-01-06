use {
    carbon_core::error::CarbonResult, carbon_omnipair_decoder::PROGRAM_ID as OMNIPAIR_PROGRAM_ID,
    clap::Parser, std::time::Duration,
};

mod config;
mod database;
mod datasources;
mod health;
mod pipeline;
mod processors;
mod signals;
mod websocket_server;

use {
    config::{Args, Config},
    health::run_health_server,
    pipeline::{create_pipeline, run_pipeline},
    signals::shutdown_signal_token,
    websocket_server::{start_websocket_server, WebSocketConfig, WebSocketServerState},
};

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
        return Err(carbon_core::error::Error::Custom(e));
    }

    // Log configuration
    config.log_configuration();

    // Initialize database connection pool
    log::info!("Initializing database connection pool...");
    if let Err(e) = database::init_db_pool().await {
        log::error!("Failed to initialize database pool: {}", e);
        return Err(e);
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
