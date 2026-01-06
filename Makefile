help:
	@echo "Available targets:"
	@echo "  lint    - Run all lints (fmt + clippy)"
	@echo "  fmt     - Format code with rustfmt"
	@echo "  clippy  - Run clippy lints"
	@echo "  test    - Run test suite"
	@echo "  build   - Build workspace"
	@echo "  fix     - Auto-fix lints where possible"
	@echo "  ci      - Run full CI checks locally"
	@echo "  clean   - Clean build artifacts"

lint: fmt clippy

fmt:
	cargo +nightly fmt --all --check

clippy:
	cargo clippy --workspace --all-targets --all-features

test:
	cargo test --workspace --all-features --lib --bins --tests

build:
	cargo build --workspace --release

fix:
	cargo +nightly fmt --all
	cargo clippy --workspace --all-targets --all-features --fix --allow-dirty --allow-staged

ci: lint test build
	@echo "✅ All CI checks passed!"

clean:
	cargo clean

.PHONY: help lint fmt clippy test build fix ci clean
