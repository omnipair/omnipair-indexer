use tokio::sync::broadcast;
use tokio_stream::wrappers::BroadcastStream;
use tokio_stream::StreamExt;
use tonic::{Request, Response, Status};

pub mod stream {
    tonic::include_proto!("omnipair.stream");
}

use stream::{
    stream_service_server::{StreamService, StreamServiceServer},
    SwapsRequest, SwapsUpdate,
};
use tonic_web::GrpcWebLayer;
use tower_http::cors::CorsLayer;

pub struct SwapStreamServer {
    broadcast_tx: broadcast::Sender<SwapsUpdate>,
}

impl SwapStreamServer {
    pub fn new(broadcast_tx: broadcast::Sender<SwapsUpdate>) -> Self {
        Self { broadcast_tx }
    }

    pub fn into_service(self) -> StreamServiceServer<Self> {
        StreamServiceServer::new(self)
    }
}

#[tonic::async_trait]
impl StreamService for SwapStreamServer {
    type StreamSwapsUpdatesStream = std::pin::Pin<
        Box<dyn tokio_stream::Stream<Item = Result<SwapsUpdate, Status>> + Send + 'static>,
    >;

    async fn stream_swaps_updates(
        &self,
        _request: Request<SwapsRequest>,
    ) -> Result<Response<Self::StreamSwapsUpdatesStream>, Status> {
        log::info!("New gRPC stream connection for swaps");

        let rx = self.broadcast_tx.subscribe();
        let stream = BroadcastStream::new(rx).filter_map(move |result| {
            match result {
                Ok(swap_update) => {
                    // No conversion needed - SwapsUpdate is used directly
                    Some(Ok(swap_update))
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
    broadcast_tx: broadcast::Sender<SwapsUpdate>,
    port: u16,
) -> Result<(), Box<dyn std::error::Error>> {
    let addr = format!("0.0.0.0:{}", port).parse()?;
    let server = SwapStreamServer::new(broadcast_tx);

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
