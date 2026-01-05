use crate::db_listener::PositionUpdateNotification;
use tokio::sync::broadcast;
use tokio_stream::wrappers::BroadcastStream;
use tokio_stream::StreamExt;
use tonic::{Request, Response, Status};

pub mod position_stream {
    tonic::include_proto!("omnipair.position_stream");
}

use position_stream::{
    position_stream_service_server::{PositionStreamService, PositionStreamServiceServer},
    PositionUpdate, StreamRequest,
};
use tonic_web::GrpcWebLayer;
use tower_http::cors::{Any, CorsLayer};

pub struct PositionStreamServer {
    broadcast_tx: broadcast::Sender<PositionUpdateNotification>,
}

impl PositionStreamServer {
    pub fn new(broadcast_tx: broadcast::Sender<PositionUpdateNotification>) -> Self {
        Self { broadcast_tx }
    }

    pub fn into_service(self) -> PositionStreamServiceServer<Self> {
        PositionStreamServiceServer::new(self)
    }
}

#[tonic::async_trait]
impl PositionStreamService for PositionStreamServer {
    type StreamPositionUpdatesStream = std::pin::Pin<
        Box<dyn tokio_stream::Stream<Item = Result<PositionUpdate, Status>> + Send + 'static>,
    >;

    async fn stream_position_updates(
        &self,
        request: Request<StreamRequest>,
    ) -> Result<Response<Self::StreamPositionUpdatesStream>, Status> {
        let req = request.into_inner();
        let pair_filter = req.pair_address;
        let user_filter = req.user_address;

        log::info!(
            "New gRPC stream connection - Filters: pair={:?}, user={:?}",
            pair_filter,
            user_filter
        );

        let rx = self.broadcast_tx.subscribe();
        let stream = BroadcastStream::new(rx).filter_map(move |result| {
            let pair_filter = pair_filter.clone();
            let user_filter = user_filter.clone();

            match result {
                Ok(notification) => {
                    // Apply filters if specified
                    let matches_pair = pair_filter
                        .as_ref()
                        .map(|f| notification.pair == *f)
                        .unwrap_or(true);

                    let matches_user = user_filter
                        .as_ref()
                        .map(|f| notification.signer == *f)
                        .unwrap_or(true);

                    if matches_pair && matches_user {
                        // Convert notification to gRPC message
                        let update = PositionUpdate {
                            pair: notification.pair,
                            signer: notification.signer,
                            position: notification.position,
                            collateral0: notification.collateral0,
                            collateral1: notification.collateral1,
                            debt0_shares: notification.debt0_shares,
                            debt1_shares: notification.debt1_shares,
                            collateral0_applied_min_cf_bps: notification
                                .collateral0_applied_min_cf_bps,
                            collateral1_applied_min_cf_bps: notification
                                .collateral1_applied_min_cf_bps,
                            transaction_signature: notification.transaction_signature,
                            slot: notification.slot,
                            event_timestamp: notification
                                .event_timestamp
                                .parse::<i64>()
                                .unwrap_or(0),
                        };

                        Some(Ok(update))
                    } else {
                        None
                    }
                }
                Err(e) => {
                    log::error!("Broadcast stream error: {}", e);
                    // On broadcast error (e.g., lagged), continue streaming
                    None
                }
            }
        });

        Ok(Response::new(Box::pin(stream)))
    }
}

pub async fn start_grpc_server(
    broadcast_tx: broadcast::Sender<PositionUpdateNotification>,
    port: u16,
) -> Result<(), Box<dyn std::error::Error>> {
    let addr = format!("0.0.0.0:{}", port).parse()?;
    let server = PositionStreamServer::new(broadcast_tx);

    log::info!("Starting gRPC server on {}", addr);

    tonic::transport::Server::builder()
        .accept_http1(true)
        .layer(CorsLayer::very_permissive())
        .layer(GrpcWebLayer::new())
        .add_service(server.into_service())
        .serve(addr)
        .await?;

    Ok(())
}
