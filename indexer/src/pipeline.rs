use std::sync::Arc;
use carbon_core::{error::CarbonResult, pipeline::Pipeline};
use carbon_omnipair_decoder::{OmnipairDecoder, PROGRAM_ID as OMNIPAIR_PROGRAM_ID};
use carbon_log_metrics::LogMetrics;

use crate::{
    config::Config,
    datasources::{create_helius_datasource, create_transaction_crawler_datasource},
    processors::OmnipairInstructionProcessor,
    websocket_server::WebSocketServerState,
};

/// Creates and configures the indexer pipeline based on the provided configuration
pub fn create_pipeline(config: &Config, websocket_state: Option<WebSocketServerState>) -> CarbonResult<Pipeline> {
    // Require Helius API key for transaction monitoring
    let api_key = config.helius_api_key.as_ref()
        .ok_or_else(|| carbon_core::error::Error::Custom(
            "HELIUS_API_KEY is required for Atlas WS".to_string()
        ))?;

    log::info!("Using Helius Atlas WebSocket for realtime transaction monitoring");

    // Create Atlas WebSocket datasource
    let atlas_datasource = create_helius_datasource(api_key, OMNIPAIR_PROGRAM_ID);

    // Create transaction crawler datasource (more efficient than block crawler)
    let _transaction_crawler_datasource = create_transaction_crawler_datasource(config.http_rpc_url.clone(), OMNIPAIR_PROGRAM_ID);

    // Create instruction processor with optional WebSocket state
    let instruction_processor = match websocket_state {
        Some(ws_state) => OmnipairInstructionProcessor::with_websocket_state(ws_state),
        None => OmnipairInstructionProcessor::new(),
    };

    // Build the pipeline
    let pipeline = Pipeline::builder()
        //.datasource(transaction_crawler_datasource)
        .datasource(atlas_datasource)
        .metrics(Arc::new(LogMetrics::new()))
        .metrics_flush_interval(3)
        .instruction(OmnipairDecoder, instruction_processor)
        .shutdown_strategy(carbon_core::pipeline::ShutdownStrategy::ProcessPending)
        .build()?;
    
    log::info!("Pipeline configured: historical transactions via RPC Transaction Crawler (TransactionUpdate)");

    Ok(pipeline)
}

/// Runs the indexer pipeline with graceful shutdown handling
pub async fn run_pipeline(mut pipeline: Pipeline) -> CarbonResult<()> {
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
        _ = crate::signals::shutdown_signal() => {
            log::info!("Received system shutdown signal");
            log::info!("Shutting down gracefully...");
            Ok(())
        }
    }
}
