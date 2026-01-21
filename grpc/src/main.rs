use clap::Parser;
use sqlx::PgPool;

mod db_listener;
mod grpc_server;

use grpc_server::stream::SwapsUpdate;

#[derive(Parser, Debug)]
#[command(name = "omnipair-grpc-server")]
#[command(about = "Standalone gRPC streaming server for Omnipair swap updates")]
struct Args {
    /// Port for the gRPC server
    #[arg(long, env = "GRPC_PORT", default_value = "50051")]
    grpc_port: u16,
}

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    // Initialize environment and logging
    dotenv::dotenv().ok();
    env_logger::init();

    let args = Args::parse();

    log::info!("Starting Omnipair gRPC Streaming Server");
    log::info!("gRPC port: {}", args.grpc_port);

    // Initialize database connection
    let database_url = std::env::var("DATABASE_URL")
        .expect("DATABASE_URL environment variable must be set");

    log::info!("Connecting to PostgreSQL...");
    let pool = PgPool::connect(&database_url).await?;

    // Test the connection
    sqlx::query("SELECT 1").fetch_one(&pool).await?;
    log::info!("Database connection established successfully");

    // Create broadcast channel for swap updates
    let (broadcast_tx, _broadcast_rx) = tokio::sync::broadcast::channel::<SwapsUpdate>(100);

    // Start DB listener task
    let listener_tx = broadcast_tx.clone();
    let listener_pool = pool.clone();
    tokio::spawn(async move {
        log::info!("Starting PostgreSQL LISTEN/NOTIFY listener task");
        if let Err(e) = db_listener::start_db_listener(&listener_pool, listener_tx).await {
            log::error!("DB listener task failed: {}", e);
        }
    });

    // Start gRPC server (blocking)
    log::info!("Starting gRPC server on port {}", args.grpc_port);
    grpc_server::start_grpc_server(broadcast_tx, args.grpc_port).await?;

    Ok(())
}
