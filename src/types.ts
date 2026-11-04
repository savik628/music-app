export interface Track {
  id: string;
  title: string;
  artist: string;
  album: string;
  duration: number; // in seconds
  audioBlob: Blob;
  coverBlob?: Blob;
  year?: number;
  addedAt: number;
  isFavorite?: boolean;
}

export interface Playlist {
  id: string;
  name: string;
  trackIds: string[];
  createdAt: number;
}
