export interface PlaylistEntry {
  readonly id: string;
  readonly url: string;
  readonly title: string;
  readonly duration: number;
  readonly thumbnailUrl: string;
}

export interface PlaylistInfo {
  readonly id: string;
  readonly title: string;
  readonly entries: PlaylistEntry[];
  readonly totalEntries: number;
  readonly truncated: boolean;
}
