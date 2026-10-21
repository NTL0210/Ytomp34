/**
 * ToolLocator
 *
 * Finds a runnable yt-dlp command. The app-managed binary is preferred, but
 * system installs, Python module installs and youtube-dl are accepted as
 * fallbacks so a missing/corrupted yt-dlp.exe does not brick the app.
 */

import { spawn } from 'child_process';

export interface ToolCandidate {
    id: 'bundled' | 'system' | 'python' | 'py' | 'youtube-dl';
    label: string;
    command: string;
    /** Arguments that must precede yt-dlp's own arguments. */
    prefixArgs: string[];
}

export interface ResolvedTool extends ToolCandidate {
    version: string;
}

export function buildYtDlpCandidates(bundledPath?: string): ToolCandidate[] {
    const candidates: ToolCandidate[] = [];

    if (bundledPath) {
        candidates.push({
            id: 'bundled',
            label: 'bundled yt-dlp',
            command: bundledPath,
            prefixArgs: []
        });
    }

    candidates.push(
        {
            id: 'system',
            label: 'yt-dlp from PATH',
            command: 'yt-dlp',
            prefixArgs: []
        },
        {
            id: 'python',
            label: 'python -m yt_dlp',
            command: 'python',
            prefixArgs: ['-m', 'yt_dlp']
        },
        {
            id: 'py',
            label: 'py -m yt_dlp',
            command: 'py',
            prefixArgs: ['-m', 'yt_dlp']
        },
        {
            id: 'youtube-dl',
            label: 'youtube-dl',
            command: 'youtube-dl',
            prefixArgs: []
        }
    );

    return candidates;
}

/**
 * Spawn a candidate with `--version` and report whether it works.
 */
export function testToolCandidate(
    candidate: ToolCandidate,
    timeoutMs = 10_000
): Promise<ResolvedTool | null> {
    return new Promise(resolve => {
        let stdout = '';
        let settled = false;

        const child = spawn(
            candidate.command,
            [...candidate.prefixArgs, '--version'],
            { windowsHide: true }
        );

        const finish = (tool: ResolvedTool | null) => {
            if (settled) return;
            settled = true;
            clearTimeout(timeout);
            resolve(tool);
        };

        const timeout = setTimeout(() => {
            child.kill('SIGKILL');
            finish(null);
        }, timeoutMs);

        child.stdout.on('data', data => {
            stdout += data.toString();
        });

        child.on('error', () => finish(null));

        child.on('close', code => {
            const version = stdout.trim().split('\n')[0];
            finish(code === 0 && version ? { ...candidate, version } : null);
        });
    });
}

/**
 * Return the first candidate that runs, preserving list order.
 */
export async function resolveFirstRunnableTool(
    candidates: ToolCandidate[]
): Promise<ResolvedTool | null> {
    for (const candidate of candidates) {
        const resolved = await testToolCandidate(candidate);
        if (resolved) {
            return resolved;
        }
    }
    return null;
}
