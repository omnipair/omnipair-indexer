fn main() -> Result<(), Box<dyn std::error::Error>> {
    let out_dir = std::path::PathBuf::from(std::env::var("OUT_DIR")?);

    tonic_build::configure()
        .build_server(true)
        .build_client(false)
        .type_attribute(".", "#[derive(serde::Serialize, serde::Deserialize)]")
        .file_descriptor_set_path(out_dir.join("stream_descriptor.bin"))
        .compile_protos(&["proto/stream.proto"], &["proto"])?;
    Ok(())
}
