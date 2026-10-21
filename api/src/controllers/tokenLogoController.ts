import { Request, Response } from 'express';
import { TOKEN_LOGO_CACHE_CONTROL } from '../config/tokenLogos';
import { getTokenLogoService, isTokenMint } from '../services/tokenLogoService';

export async function getTokenLogo(req: Request, res: Response): Promise<void> {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
  if (!isTokenMint(req.params.mint)) {
    res.status(400).json({ success: false, error: 'Valid token mint is required' });
    return;
  }
  try {
    const service = getTokenLogoService();
    if (!service) {
      res.status(404).json({ success: false, error: 'Token logo cache is disabled' });
      return;
    }
    const image = await service.storage.get(req.params.mint);
    if (!image) {
      service.forget(req.params.mint);
      res.status(404).json({ success: false, error: 'Token logo is not cached yet' });
      return;
    }
    res.setHeader('Content-Type', 'image/webp');
    res.setHeader('Cache-Control', TOKEN_LOGO_CACHE_CONTROL);
    if (image.etag) res.setHeader('ETag', image.etag);
    if (image.lastModified) res.setHeader('Last-Modified', image.lastModified.toUTCString());
    // Express handles conditional GET/HEAD when sending a Buffer with validators.
    res.send(image.body);
  } catch (error) {
    console.error('Failed to serve cached token logo:', error instanceof Error ? error.message : 'unknown error');
    res.status(503).json({ success: false, error: 'Token logo temporarily unavailable' });
  }
}
