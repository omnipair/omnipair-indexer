use axum::http;
use std::time::Duration;
use tokio::sync::broadcast;
use tokio_stream::wrappers::BroadcastStream;
use tokio_stream::StreamExt;
use tonic::{Request, Response, Status};
use tower_http::cors::{AllowOrigin, CorsLayer};

pub mod stream {
    tonic::include_proto!("omnipair.stream");
}

use stream::{
    stream_service_server::{StreamService, StreamServiceServer},
    SwapsRequest, SwapsUpdate,
};
use tonic_web::GrpcWebLayer;

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
        request: Request<SwapsRequest>,
    ) -> Result<Response<Self::StreamSwapsUpdatesStream>, Status> {
        let peer_addr = request.remote_addr();
        log::info!("New gRPC stream connection from {:?}", peer_addr);

        let rx = self.broadcast_tx.subscribe();
        let mut lag_count = 0u64;
        const MAX_LAG_THRESHOLD: u64 = 1000;

        let stream = BroadcastStream::new(rx).filter_map(move |result| match result {
            Ok(swap_update) => {
                if lag_count > 0 {
                    log::warn!(
                        "Client {:?} recovered from {} lag events",
                        peer_addr,
                        lag_count
                    );
                    lag_count = 0;
                }
                Some(Ok(swap_update))
            }
            Err(tokio_stream::wrappers::errors::BroadcastStreamRecvError::Lagged(skipped)) => {
                lag_count += skipped;
                log::error!(
                    "Client {:?} lagging: skipped {} messages (total lag: {})",
                    peer_addr,
                    skipped,
                    lag_count
                );

                if lag_count > MAX_LAG_THRESHOLD {
                    log::error!(
                        "Client {:?} exceeded lag threshold, disconnecting",
                        peer_addr
                    );
                    Some(Err(Status::resource_exhausted(
                        "Client too slow, connection terminated",
                    )))
                } else {
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

    // Configure CORS based on environment
    let is_production = std::env::var("NODE_ENV")
        .map(|env| env.to_lowercase() == "production")
        .unwrap_or(false);

    let allowed_origin = if is_production {
        log::info!("Running in production mode with restricted CORS");
        let allowed_origins = "https://omnipair.fi,https://legacy.omnipair.fi";

        let origins: Vec<_> = allowed_origins
            .split(',')
            .filter_map(|s| s.trim().parse::<http::HeaderValue>().ok())
            .collect();

        AllowOrigin::list(origins)
    } else {
        log::info!("Running in development mode with permissive CORS");
        AllowOrigin::any()
    };

    let cors = CorsLayer::new()
        .allow_origin(allowed_origin)
        .allow_methods([http::Method::POST, http::Method::OPTIONS])
        .allow_headers([
            http::header::CONTENT_TYPE,
            http::header::HeaderName::from_static("x-grpc-web"),
            http::header::HeaderName::from_static("grpc-timeout"),
        ])
        .expose_headers([
            http::header::HeaderName::from_static("grpc-status"),
            http::header::HeaderName::from_static("grpc-message"),
        ]);

    log::info!("gRPC server listening on {}", addr);

    tonic::transport::Server::builder()
        .accept_http1(true)
        .timeout(Duration::from_secs(30))
        .concurrency_limit_per_connection(256)
        .tcp_keepalive(Some(Duration::from_secs(60)))
        .tcp_nodelay(true)
        .layer(cors)
        .layer(GrpcWebLayer::new())
        .add_service(server.into_service())
        .serve(addr)
        .await?;

    Ok(())
}
