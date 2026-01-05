use serde::{Deserialize, Serialize};
use sqlx::postgres::{PgListener, PgPool};
use tokio::sync::broadcast;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PositionUpdateNotification {
    pub pair: String,
    pub signer: String,
    pub position: String,
    pub collateral0: String,
    pub collateral1: String,
    pub debt0_shares: String,
    pub debt1_shares: String,
    pub collateral0_applied_min_cf_bps: i32,
    pub collateral1_applied_min_cf_bps: i32,
    pub transaction_signature: String,
    pub slot: String,
    pub event_timestamp: String,
}

pub async fn start_db_listener(
    pool: &PgPool,
    sender: broadcast::Sender<PositionUpdateNotification>,
) -> Result<(), Box<dyn std::error::Error>> {
    log::info!("Starting PostgreSQL LISTEN/NOTIFY listener on channel 'user_position_updates'");

    let mut listener = PgListener::connect_with(pool).await?;
    listener.listen("user_position_updates").await?;

    log::info!("Successfully connected to PostgreSQL LISTEN channel");

    loop {
        match listener.recv().await {
            Ok(notification) => {
                log::debug!("Received notification: {}", notification.payload());

                match serde_json::from_str::<PositionUpdateNotification>(notification.payload()) {
                    Ok(payload) => {
                        log::info!(
                            "Parsed position update notification - Position: {}, Pair: {}, User: {}, TxSig: {}",
                            payload.position,
                            payload.pair,
                            payload.signer,
                            payload.transaction_signature
                        );

                        // Broadcast to all subscribed clients
                        // Ignore error if no receivers are listening
                        match sender.send(payload) {
                            Ok(receiver_count) => {
                                log::debug!("Broadcasted to {} gRPC clients", receiver_count);
                            }
                            Err(_) => {
                                log::debug!("No gRPC clients connected, skipping broadcast");
                            }
                        }
                    }
                    Err(e) => {
                        log::error!(
                            "Failed to parse notification payload: {}. Payload: {}",
                            e,
                            notification.payload()
                        );
                    }
                }
            }
            Err(e) => {
                log::error!(
                    "Error receiving notification: {}. Will attempt to reconnect...",
                    e
                );

                // Attempt to reconnect
                match PgListener::connect_with(pool).await {
                    Ok(mut new_listener) => {
                        match new_listener.listen("user_position_updates").await {
                            Ok(_) => {
                                log::info!("Successfully reconnected to PostgreSQL LISTEN channel");
                                listener = new_listener;
                            }
                            Err(e) => {
                                log::error!("Failed to re-subscribe to channel: {}", e);
                                tokio::time::sleep(tokio::time::Duration::from_secs(5)).await;
                            }
                        }
                    }
                    Err(e) => {
                        log::error!("Failed to reconnect to PostgreSQL: {}", e);
                        tokio::time::sleep(tokio::time::Duration::from_secs(5)).await;
                    }
                }
            }
        }
    }
}
