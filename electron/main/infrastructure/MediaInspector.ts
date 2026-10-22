import { spawn } from 'child_process';
import * as path from 'path';

/**
 * Result of inspecting a finished media file with ffprobe.
 *
 * `verified` only means that ffprobe ran and returned parseable metadata. It
 * does not mean the file matches the requested quality.
 */
export interface MediaInspection {
    filePath: string;
    verified: boolean;
    container?: string;
    durationSeconds?: number;
    width?: number;
    height?: number;
    videoCodec?: string;
    audioCodec?: string;
    hasVideo: boolean;
    hasAudio: boolean;
    error?: string;
}

export interface DownloadOutputMetadata {
    outputPath: string;
    width?: number;
    height?: number;
    resolution?: string;
    qualityTier?: string;
    videoCodec?: string;
    audioCodec?: string;
    container?: string;
    hasVideo: boolean;
    hasAudio: boolean;
    verified: boolean;
    warning?: string;
    fallbackReason?: string;
}

export interface ResolutionReportInput {
    requestedQuality: string;
    requestedHeight?: number | null;
    actualWidth?: number;
    actualHeight?: number;
    verified: boolean;
    fallbackReason?: string;
    hasAudio?: boolean;
}

interface FfprobeStream {
    codec_type?: string;
    codec_name?: string;
    width?: number;
    height?: number;
    disposition?: {
        attached_pic?: number;
    };
}

interface FfprobeFormat {
    format_name?: string;
    duration?: string;
}

interface FfprobeOutput {
    streams?: FfprobeStream[];
    format?: FfprobeFormat;
}

/** The short side is the resolution tier for both landscape and portrait video. */
export function getQualityTier(width?: number, height?: number): number | null {
    if (
        typeof width !== 'number' ||
        typeof height !== 'number' ||
        !Number.isFinite(width) ||
        !Number.isFinite(height) ||
        width <= 0 ||
        height <= 0
    ) {
        return null;
    }

    return Math.round(Math.min(width, height));
}

export function formatDimensions(width?: number, height?: number): string | undefined {
    if (
        typeof width !== 'number' ||
        typeof height !== 'number' ||
        !Number.isFinite(width) ||
        !Number.isFinite(height) ||
        width <= 0 ||
        height <= 0
    ) {
        return undefined;
    }

    return `${Math.round(width)} × ${Math.round(height)}`;
}

/** Resolve the ffprobe executable that belongs to the configured ffmpeg. */
export function getFfprobeCommand(ffmpegLocation: string | null): string {
    if (!ffmpegLocation) return 'ffprobe';

    return path.join(
        ffmpegLocation,
        process.platform === 'win32' ? 'ffprobe.exe' : 'ffprobe'
    );
}

/** Pure parser used by the runtime inspector and by unit tests. */
export function parseFfprobeOutput(output: string, filePath: string): MediaInspection {
    let parsed: FfprobeOutput;
    try {
        parsed = JSON.parse(output) as FfprobeOutput;
    } catch {
        return {
            filePath,
            verified: false,
            hasVideo: false,
            hasAudio: false,
            error: 'ffprobe returned invalid JSON'
        };
    }

    if (typeof parsed !== 'object' || parsed === null) {
        return {
            filePath,
            verified: false,
            hasVideo: false,
            hasAudio: false,
            error: 'ffprobe returned invalid JSON'
        };
    }

    const streams = Array.isArray(parsed.streams) ? parsed.streams : [];
    const video = streams.find(stream =>
        stream.codec_type === 'video' && stream.disposition?.attached_pic !== 1
    );
    const audio = streams.find(stream => stream.codec_type === 'audio');
    const duration = Number(parsed.format?.duration);

    return {
        filePath,
        verified: true,
        container: parsed.format?.format_name,
        durationSeconds: Number.isFinite(duration) ? duration : undefined,
        width: typeof video?.width === 'number' ? video.width : undefined,
        height: typeof video?.height === 'number' ? video.height : undefined,
        videoCodec: video?.codec_name,
        audioCodec: audio?.codec_name,
        hasVideo: Boolean(video),
        hasAudio: Boolean(audio),
        error: !video && !audio ? 'No audio or video streams were found' : undefined
    };
}

/**
 * Inspect a completed file without making ffprobe a hard requirement. If the
 * tool is missing or unreadable, the result is explicitly unverified.
 */
export function inspectMediaFile(
    filePath: string,
    ffmpegLocation: string | null,
    timeoutMs = 15_000
): Promise<MediaInspection> {
    const command = getFfprobeCommand(ffmpegLocation);

    return new Promise(resolve => {
        let stdout = '';
        let stderr = '';
        let settled = false;
        let timeout: NodeJS.Timeout | null = null;

        const finish = (result: MediaInspection) => {
            if (settled) return;
            settled = true;
            if (timeout) clearTimeout(timeout);
            resolve(result);
        };

        let child: ReturnType<typeof spawn>;
        try {
            child = spawn(command, [
                '-v', 'error',
                '-print_format', 'json',
                '-show_format',
                '-show_streams',
                filePath
            ], { windowsHide: true });
        } catch (error) {
            finish({
                filePath,
                verified: false,
                hasVideo: false,
                hasAudio: false,
                error: error instanceof Error ? error.message : 'ffprobe could not be started'
            });
            return;
        }

        timeout = setTimeout(() => {
            child.kill('SIGKILL');
            finish({
                filePath,
                verified: false,
                hasVideo: false,
                hasAudio: false,
                error: `ffprobe timed out after ${Math.round(timeoutMs / 1000)} seconds`
            });
        }, timeoutMs);

        child.stdout?.on('data', data => {
            stdout += data.toString();
        });

        child.stderr?.on('data', data => {
            stderr += data.toString();
        });

        child.on('error', error => {
            finish({
                filePath,
                verified: false,
                hasVideo: false,
                hasAudio: false,
                error: error.message
            });
        });

        child.on('close', code => {
            if (code !== 0) {
                finish({
                    filePath,
                    verified: false,
                    hasVideo: false,
                    hasAudio: false,
                    error: stderr.trim() || `ffprobe exited with code ${code ?? 'unknown'}`
                });
                return;
            }

            finish(parseFfprobeOutput(stdout, filePath));
        });
    });
}

/**
 * Build a user-facing quality note. It never claims that the requested quality
 * was delivered when the measured output is lower or when it could not be
 * verified.
 */
export function buildResolutionReport(input: ResolutionReportInput): string | undefined {
    const notes: string[] = [];
    const actualTier = getQualityTier(input.actualWidth, input.actualHeight);
    const dimensions = formatDimensions(input.actualWidth, input.actualHeight);

    if (input.verified && actualTier !== null) {
        if (input.requestedHeight && actualTier < input.requestedHeight) {
            notes.push(
                `Requested ${input.requestedHeight}p; downloaded ${actualTier}p` +
                (dimensions ? ` (${dimensions})` : '') +
                '. The source or selected format only provided this quality.'
            );
        } else if (input.requestedHeight && actualTier > input.requestedHeight) {
            notes.push(
                `Downloaded ${actualTier}p, above the requested ${input.requestedHeight}p.`
            );
        }
    } else if (!input.verified || actualTier === null) {
        notes.push('The final resolution could not be verified.');
    }

    if (input.hasAudio === false) {
        notes.push('The downloaded file has no audio stream.');
    }

    if (input.fallbackReason) {
        notes.push(input.fallbackReason.endsWith('.') ? input.fallbackReason : `${input.fallbackReason}.`);
    }

    return notes.length > 0 ? notes.join(' ') : undefined;
}
