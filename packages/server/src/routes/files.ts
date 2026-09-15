import type { FastifyInstance } from 'fastify';
import { Server as TusServer } from '@tus/server';
import { FileStore } from '@tus/file-store';
import { config } from '../config.js';
import { getDb, schema } from '../db/index.js';
import { generateSnowflake } from '../utils/snowflake.js';
import { verifyJwtAndUser, AuthError } from '../utils/auth.js';
import {
  parseUploadMetadata,
  extractExtension,
  buildTusMetadata,
  isOwnerOfUpload,
  type UploadMetadata,
} from '../utils/tusHooks.js';
import {
  generateThumbnail,
  isResizableImage,
  probeImageDimensions,
  probeMediaMeta,
  generateVideoThumbnail,
  thumbFilename,
} from '../utils/thumbnail.js';
import { classifyVideoPlayable } from '../utils/mediaPlayable.js';
import { eq } from 'drizzle-orm';
import type { Attachment } from '@vertex/shared';
import fs from 'node:fs';
import path from 'node:path';

// ─── Per-user rate limit for upload creation (30 creates / min) ─────────────
const UPLOAD_CREATE_LIMIT = 30;
const UPLOAD_CREATE_WINDOW_MS = 60_000;
const createCounts = new Map<string, { count: number; windowStart: number }>();

function checkCreateRateLimit(userId: string): boolean {
  const now = Date.now();
  const entry = createCounts.get(userId);
  if (!entry || now - entry.windowStart > UPLOAD_CREATE_WINDOW_MS) {
    createCounts.set(userId, { count: 1, windowStart: now });
    return true;
  }
  if (entry.count >= UPLOAD_CREATE_LIMIT) return false;
  entry.count += 1;
  return true;
}

// ─── Per-user rate limit for PATCH (slowloris defense, ~1000 / min / user) ──
// Production runs behind Caddy, so req.socket.remoteAddress is always
// 127.0.0.1 — keying on userId is the only meaningful identifier.
const PATCH_PER_USER_LIMIT = 1000;
const PATCH_WINDOW_MS = 60_000;
const patchCounts = new Map<string, { count: number; windowStart: number }>();

function withinPatchLimit(userId: string): boolean {
  const now = Date.now();
  const entry = patchCounts.get(userId);
  if (!entry || now - entry.windowStart > PATCH_WINDOW_MS) {
    patchCounts.set(userId, { count: 1, windowStart: now });
    return true;
  }
  if (entry.count >= PATCH_PER_USER_LIMIT) return false;
  entry.count += 1;
  return true;
}

// ─── Periodic prune of stale rate-limit entries (every 60s) ─────────────────
let rateLimitPruneTimer: ReturnType<typeof setInterval> | null = null;
function startRateLimitPruner(): void {
  if (rateLimitPruneTimer) return;
  rateLimitPruneTimer = setInterval(() => {
    const now = Date.now();
    for (const [k, v] of createCounts) {
      if (now - v.windowStart > UPLOAD_CREATE_WINDOW_MS) createCounts.delete(k);
    }
    for (const [k, v] of patchCounts) {
      if (now - v.windowStart > PATCH_WINDOW_MS) patchCounts.delete(k);
    }
  }, 60_000);
  // Don't keep the event loop alive solely for this timer
  if (typeof rateLimitPruneTimer.unref === 'function') rateLimitPruneTimer.unref();
}

// ─── Derive mimetype from metadata filename, falling back to octet-stream ───
const EXT_MIMETYPES: Record<string, string> = {
  '.webp': 'image/webp', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.png': 'image/png', '.gif': 'image/gif', '.svg': 'image/svg+xml',
  '.avif': 'image/avif', '.tiff': 'image/tiff', '.bmp': 'image/bmp',
  '.ico': 'image/x-icon',
  '.mp4': 'video/mp4', '.webm': 'video/webm', '.mov': 'video/quicktime',
  '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.wav': 'audio/wav',
  '.flac': 'audio/flac', '.aac': 'audio/aac', '.opus': 'audio/opus',
  '.pdf': 'application/pdf',
};

function mimetypeFromFilename(originalName: string): string {
  const ext = path.extname(originalName).toLowerCase();
  return EXT_MIMETYPES[ext] ?? 'application/octet-stream';
}

// ─── Windows-safe commit of a staged tus file ────────────────────────────────
// Node v24 (and libvips/sharp) can leave the staging file open on Windows when
// onUploadFinish runs — the tus write stream's fd isn't necessarily released
// and sharp keeps a mapped handle on real images. `fs.renameSync` then throws
// EBUSY ("resource busy or locked"), which surfaced as an HTTP 500 on every
// avatar/banner upload. Rename is preferred (atomic, cheap); on EBUSY/EPERM we
// back off briefly and, if still locked, fall back to a copy (Windows share-read
// allows copying a locked file) followed by a best-effort unlink. The copy
// leaves the source in .tus/ when it can't be unlinked — the tus expiration
// sweep reaps it because the sidecar's stored offset (0 at create) still
// differs from size. Returns true if the source was removed (atomic path).
const RENAME_RETRY_MS = 50;
const RENAME_MAX_ATTEMPTS = 4;
const RENAME_WINDOWS_CODES = new Set(['EBUSY', 'EPERM', 'EACCES']);

async function commitStagedFile(src: string, dst: string): Promise<boolean> {
  for (let attempt = 1; attempt <= RENAME_MAX_ATTEMPTS; attempt += 1) {
    try {
      fs.renameSync(src, dst);
      return true;
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code ?? '';
      if (!RENAME_WINDOWS_CODES.has(code)) throw err;
      if (attempt < RENAME_MAX_ATTEMPTS) {
        await new Promise<void>((r) => {
          setTimeout(r, RENAME_RETRY_MS * attempt);
        });
      }
    }
  }
  // File still locked — copy (works while source is shared-readable) and
  // unlink best-effort. The caller must leave the tus sidecar in place so the
  // expiration sweep knows this staging entry is still incomplete.
  console.warn(
    `[files] rename of ${path.basename(src)} is EBUSY/EPERM after retries — committing via copy`,
  );
  fs.copyFileSync(src, dst);
  try {
    fs.unlinkSync(src);
    return true;
  } catch {
    return false;
  }
}

export async function filesRoutes(app: FastifyInstance): Promise<void> {
  // Ensure tus staging directory exists
  fs.mkdirSync(config.tusUploadDir, { recursive: true });
  startRateLimitPruner();

  const tusServer = new TusServer({
    path: '/api/files',
    datastore: new FileStore({
      directory: config.tusUploadDir,
      expirationPeriodInMilliseconds: config.tusExpirationMs,
    }),
    respectForwardedHeaders: true,
    relativeLocation: false,
    disableTerminationForFinishedUploads: true,

    // ── Auth: verify JWT on every incoming request ─────────────────────────
    async onIncomingRequest(req, _res, uploadId) {
      const authHeader = req.headers.authorization;
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        throw { status_code: 401, body: 'Missing or invalid authorization header' };
      }
      const token = authHeader.slice(7);
      let identity: { userId: string; username: string; homeInstance: string | null };
      try {
        identity = await verifyJwtAndUser(token);
      } catch (err) {
        if (err instanceof AuthError) {
          throw { status_code: err.statusCode, body: err.message };
        }
        throw { status_code: 401, body: 'Invalid or expired token' };
      }
      const userId = identity.userId;

      // Attach userId to the raw request so downstream hooks can read it.
      (req as NodeJS.Dict<unknown> & typeof req).userId = userId;

      // Ownership guard for any method that targets a specific upload by id.
      // PATCH/HEAD/DELETE/GET all leak or modify state otherwise:
      //  - DELETE: any authed user could cancel any upload
      //  - HEAD:   leaks Upload-Metadata (userId, snowflakeId, originalName)
      //  - GET:    streams partial file contents during the .tus staging window
      //  - PATCH:  writes bytes into someone else's upload
      const guarded = req.method === 'PATCH' || req.method === 'HEAD'
        || req.method === 'DELETE' || req.method === 'GET';
      if (guarded && uploadId) {
        // PATCH-specific slowloris/rate defense (per-user, see comment above).
        if (req.method === 'PATCH') {
          if (!withinPatchLimit(userId)) {
            throw { status_code: 429, body: 'PATCH rate limit exceeded' };
          }
        }

        let upload;
        try {
          upload = await tusServer.datastore.getUpload(uploadId);
        } catch (err: unknown) {
          // Let tus format 404 / 410 errors with status_code; let other
          // errors propagate so the caller sees the underlying failure.
          if (err !== null && typeof err === 'object' && 'status_code' in err) {
            throw err;
          }
          throw err;
        }
        if (!isOwnerOfUpload(upload.metadata as UploadMetadata, userId)) {
          throw { status_code: 403, body: 'Forbidden: you do not own this upload' };
        }
      }
    },

    // ── Upload create: assign snowflake + validate size + store userId ─────
    async onUploadCreate(req, res, upload) {
      const userId: string = (req as NodeJS.Dict<unknown> & typeof req).userId as string;

      // Per-user create rate limit
      if (!checkCreateRateLimit(userId)) {
        throw { status_code: 429, body: 'Upload creation rate limit exceeded' };
      }

      // Read dynamic upload limit from instance_settings, fall back to config
      const db = getDb();
      const settings = db
        .select({ maxUploadSizeBytes: schema.instanceSettings.maxUploadSizeBytes })
        .from(schema.instanceSettings)
        .where(eq(schema.instanceSettings.id, 1))
        .get();
      const maxSize = settings?.maxUploadSizeBytes ?? config.maxUploadSize;

      if (upload.size !== undefined && upload.size > maxSize) {
        throw { status_code: 413, body: 'File too large' };
      }

      // Extract originalName from existing metadata (decoded by tus already)
      const rawMetaHeader = req.headers['upload-metadata'] as string | undefined;
      const parsedMeta = parseUploadMetadata(rawMetaHeader ?? null);
      const originalName = parsedMeta.originalName ?? parsedMeta.filename;
      if (!originalName || !originalName.trim()) {
        throw {
          status_code: 400,
          body: 'Upload-Metadata missing required field: filename',
        };
      }

      // Assign snowflake and embed userId into tus metadata
      const snowflakeId = generateSnowflake();
      const augmented = buildTusMetadata({ snowflakeId, userId, originalName });

      // tus's metadata type is Record<string, string | null>. buildTusMetadata
      // returns UploadMetadata with optional fields; we filter undefined to
      // satisfy that constraint (all three fields are guaranteed strings here
      // since we just constructed them above).
      const mergedMetadata: Record<string, string | null> = {};
      for (const [k, v] of Object.entries({ ...upload.metadata, ...augmented })) {
        if (v !== undefined) mergedMetadata[k] = v;
      }

      return { res, metadata: mergedMetadata };
    },

    // ── Upload finish: media-process FIRST, then rename as commit point,
    //    then INSERT. Rename is the atomicity barrier — if anything before
    //    rename throws, the file stays in .tus/ where the tus expiration
    //    sweep + cleanupStorage will eventually reap it. If INSERT throws
    //    after rename, we best-effort delete the renamed file (and the
    //    unlinked-attachment janitor would catch any survivors).
    async onUploadFinish(req, res, upload) {
      const requestUserId: string = (req as NodeJS.Dict<unknown> & typeof req).userId as string;
      const meta = upload.metadata ?? {};

      console.log('[VERTEX AVATAR UPLOAD TRACE] onUploadFinish called');
      console.log('[VERTEX AVATAR UPLOAD TRACE] requestUserId:', requestUserId);
      console.log('[VERTEX AVATAR UPLOAD TRACE] upload metadata:', meta);
      console.log('[VERTEX AVATAR UPLOAD TRACE] upload id:', upload.id);

      const snowflakeId = meta.snowflakeId ?? null;
      const storedUserId = meta.userId ?? null;
      const originalName = meta.originalName ?? 'upload';

      console.log('[VERTEX AVATAR UPLOAD TRACE] snowflakeId:', snowflakeId);
      console.log('[VERTEX AVATAR UPLOAD TRACE] storedUserId:', storedUserId);
      console.log('[VERTEX AVATAR UPLOAD TRACE] originalName:', originalName);

      // Defense in depth: re-verify ownership
      if (!snowflakeId || !storedUserId || storedUserId !== requestUserId) {
        throw { status_code: 403, body: 'Forbidden: ownership mismatch' };
      }

      const ext = extractExtension(originalName);
      const filename = `${snowflakeId}${ext}`;
      const srcPath = path.join(config.tusUploadDir, upload.id);
      const dstPath = path.join(config.uploadDir, filename);

      // Ensure upload dir exists (may differ from tus staging dir) — needed
      // before media processing because thumbnails are written there.
      fs.mkdirSync(config.uploadDir, { recursive: true });

      const mimetype = mimetypeFromFilename(originalName);

      // ── Media processing (on the still-staging file in .tus/) ────────────
      // Wrapped defensively: any failure here must not abort the upload —
      // we still want the file to land and get an attachments row, just
      // without thumb/dimensions/duration metadata.
      let stagedThumbName: string | null = null;
      let width: number | null = null;
      let height: number | null = null;
      let duration: number | null = null;
      // Tri-state web-playability for video (null = unknown/optimistic). Lets
      // the client render a download fallback for codecs the browser can't
      // decode (e.g. HEVC .mov) instead of a dead <video> stuck at 0:00.
      let playable: boolean | null = null;
      try {
        if (isResizableImage(mimetype)) {
          stagedThumbName = await generateThumbnail(srcPath, mimetype, config.uploadDir);
          const dims = await probeImageDimensions(srcPath);
          if (dims) {
            width = dims.width;
            height = dims.height;
          }
        } else if (mimetype.startsWith('video/')) {
          const videoThumb = await generateVideoThumbnail(srcPath, config.uploadDir);
          if (videoThumb) {
            stagedThumbName = videoThumb.thumbnailFilename;
            width = videoThumb.width;
            height = videoThumb.height;
          }
          const mediaMeta = await probeMediaMeta(srcPath, mimetype);
          if (mediaMeta) {
            duration = mediaMeta.duration ?? null;
            if (width === null && mediaMeta.width) width = mediaMeta.width;
            if (height === null && mediaMeta.height) height = mediaMeta.height;
            playable = classifyVideoPlayable(mimetype, mediaMeta.codec);
          }
        } else if (mimetype.startsWith('audio/')) {
          const mediaMeta = await probeMediaMeta(srcPath, mimetype);
          if (mediaMeta?.duration) duration = mediaMeta.duration;
        }
      } catch (err) {
        console.error('[files] Media processing failed (non-fatal):', err);
        // Reset to a clean baseline; if a partial thumb was written we
        // attempt to clean it up below.
        if (stagedThumbName) {
          try {
            fs.unlinkSync(path.join(config.uploadDir, stagedThumbName));
          } catch { /* ignore */ }
          stagedThumbName = null;
        }
        width = null; height = null; duration = null; playable = null;
      }

      // ── Commit point: move .tus/<id> → uploads/<snowflakeId><ext> ────────
      // After this succeeds we own a permanent file. If anything below
      // throws we must delete it (or the unlinked-attachment janitor will).
      // Windows-safe: on EBUSY/EPERM the file is committed via copy instead of
      // rename (see commitStagedFile). A copy-committed source is left in
      // .tus/ when unlink fails — the sidecar is then kept (see below) so the
      // tus expiration sweep reaps the pair.
      const committed = await commitStagedFile(srcPath, dstPath);

      // The thumb generators name their output `<basename(srcPath)>_thumb.webp`
      // — i.e. `<uploadId>_thumb.webp`. Rename it to the canonical
      // `<snowflakeId>_thumb.webp` so storageJanitor's reference set matches.
      let thumbnailFilename: string | null = null;
      if (stagedThumbName) {
        const stagedThumbPath = path.join(config.uploadDir, stagedThumbName);
        const finalThumbName = thumbFilename(filename);
        const finalThumbPath = path.join(config.uploadDir, finalThumbName);
        try {
          const thumbCommitted = await commitStagedFile(stagedThumbPath, finalThumbPath);
          thumbnailFilename = thumbCommitted ? finalThumbName : null;
          if (!thumbCommitted) {
            try { fs.unlinkSync(stagedThumbPath); } catch { /* ignore */ }
          }
        } catch (err) {
          console.error('[files] Thumbnail rename failed (non-fatal):', err);
          try { fs.unlinkSync(stagedThumbPath); } catch { /* ignore */ }
          thumbnailFilename = null;
        }
      }

      // Best-effort: delete tus .json sidecar. Only when the staging file was
      // fully removed — if it was copy-committed and the lock prevented the
      // source unlink, the sidecar must stay so the expiration sweep cleans the
      // orphan (its stored offset still differs from size).
      if (committed) {
        const sidecarPath = `${srcPath}.json`;
        if (fs.existsSync(sidecarPath)) {
          try { fs.unlinkSync(sidecarPath); } catch { /* ignore */ }
        }
      }

      const size = upload.size ?? fs.statSync(dstPath).size;
      const now = Date.now();

      // ── Insert attachments row ───────────────────────────────────────────
      try {
        const db = getDb();
        db.insert(schema.attachments).values({
          id: snowflakeId,
          uploaderId: storedUserId,
          messageId: null,
          dmMessageId: null,
          filename,
          originalName,
          mimetype,
          size,
          thumbnailFilename,
          width,
          height,
          duration,
          playable,
          createdAt: now,
        }).run();
      } catch (err) {
        // INSERT failed after the rename succeeded — best-effort delete the
        // committed file + thumbnail so we don't leak an orphan. The
        // storageJanitor unlinked-attachment sweep would also catch it
        // eventually, but this keeps the failure window small.
        try { fs.unlinkSync(dstPath); } catch { /* ignore */ }
        if (thumbnailFilename) {
          try { fs.unlinkSync(path.join(config.uploadDir, thumbnailFilename)); } catch { /* ignore */ }
        }
        throw err;
      }

      const attachment: Attachment = {
        id: snowflakeId,
        messageId: '',
        filename,
        originalName,
        mimetype,
        size,
        thumbnailFilename: thumbnailFilename ?? undefined,
        width: width ?? undefined,
        height: height ?? undefined,
        duration: duration ?? undefined,
        playable,
        createdAt: now,
      };

      return {
        res,
        status_code: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(attachment),
      };
    },
  });

  // Register the content-type parser that tus requires
  app.addContentTypeParser(
    'application/offset+octet-stream',
    (_request, _payload, done) => done(null),
  );

  // Delegate all /api/files and /api/files/* requests to tus.
  // reply.hijack() tells Fastify the response is being managed externally —
  // prevents lifecycle races (double-send, reply timing) under load.
  //
  // tus manages CORS itself and unconditionally sets
  // `Access-Control-Expose-Headers` to its own constant list — which omits
  // `Upload-Expires`. Without it the browser refuses to let tus-js-client read
  // that header cross-origin. The response object is hijacked, so @fastify/cors
  // and our own reply.header() calls are overwritten by tus before the headers
  // are flushed. We therefore wrap res.setHeader: any time tus re-asserts the
  // expose header, we immediately replace it with our expanded list.
  const exposedHeaders = [
    'Authorization',
    'Content-Type',
    'Location',
    'Tus-Resumable',
    'Tus-Version',
    'Tus-Extension',
    'Tus-Max-Size',
    'Tus-Checksum-Algorithm',
    'Upload-Offset',
    'Upload-Length',
    'Upload-Metadata',
    'Upload-Expires',
    'Upload-Concat',
    'Upload-Defer-Length',
    'X-HTTP-Method-Override',
    'X-Requested-With',
    'X-Forwarded-Host',
    'X-Forwarded-Proto',
    'Forwarded',
  ].join(', ');

  function exposeTusResponseHeaders(res: import('node:http').ServerResponse): void {
    const origSetHeader = res.setHeader.bind(res);
    res.setHeader = ((name: string | number | readonly string[], value: string | number | readonly string[]) => {
      origSetHeader(name as string, value);
      if (String(name).toLowerCase() === 'access-control-expose-headers') {
        origSetHeader('Access-Control-Expose-Headers', exposedHeaders);
      }
    }) as typeof res.setHeader;
  }

  app.all('/api/files', (request, reply) => {
    reply.hijack();
    if (request.headers.origin) exposeTusResponseHeaders(reply.raw);
    tusServer.handle(request.raw, reply.raw);
  });
  app.all('/api/files/*', (request, reply) => {
    reply.hijack();
    if (request.headers.origin) exposeTusResponseHeaders(reply.raw);
    tusServer.handle(request.raw, reply.raw);
  });
}
