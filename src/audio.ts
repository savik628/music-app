import type { Track } from './types';

class AudioEngine {
  private audio: HTMLAudioElement;
  private currentTrack: Track | null = null;
  private currentBlobUrl: string | null = null;
  private listeners: Set<() => void> = new Set();

  constructor() {
    this.audio = new Audio();
    this.setupListeners();
    this.setupMediaSession();
  }

  private setupListeners() {
    this.audio.addEventListener('play', () => this.notify());
    this.audio.addEventListener('pause', () => this.notify());
    this.audio.addEventListener('timeupdate', () => this.notify());
    this.audio.addEventListener('ended', () => {
      this.onTrackEnded();
      this.notify();
    });
    this.audio.addEventListener('loadedmetadata', () => this.notify());
  }

  public onTrackEnded: () => void = () => {};

  public subscribe(cb: () => void) {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  private notify() {
    this.listeners.forEach((cb) => cb());
  }

  public async playTrack(track: Track) {
    if (this.currentBlobUrl) {
      URL.revokeObjectURL(this.currentBlobUrl);
    }

    this.currentTrack = track;
    this.currentBlobUrl = URL.createObjectURL(track.audioBlob);
    this.audio.src = this.currentBlobUrl;

    try {
      await this.audio.play();
    } catch (err) {
      console.error('Audio playback error:', err);
    }

    this.updateMediaSessionMetadata(track);
    this.notify();
  }

  public async togglePlay() {
    if (!this.currentTrack) return;
    if (this.audio.paused) {
      await this.audio.play();
    } else {
      this.audio.pause();
    }
  }

  public pause() {
    this.audio.pause();
  }

  public seek(seconds: number) {
    this.audio.currentTime = seconds;
  }

  public setVolume(vol: number) {
    this.audio.volume = Math.max(0, Math.min(1, vol));
  }

  public getState() {
    return {
      track: this.currentTrack,
      isPlaying: !this.audio.paused,
      currentTime: this.audio.currentTime,
      duration: this.audio.duration || this.currentTrack?.duration || 0,
      volume: this.audio.volume,
    };
  }

  private setupMediaSession() {
    if (!('mediaSession' in navigator)) return;

    navigator.mediaSession.setActionHandler('play', () => this.togglePlay());
    navigator.mediaSession.setActionHandler('pause', () => this.togglePlay());
    navigator.mediaSession.setActionHandler('seekto', (details) => {
      if (details.seekTime !== undefined) {
        this.seek(details.seekTime);
      }
    });
  }

  public setMediaSessionActions(prev: () => void, next: () => void) {
    if (!('mediaSession' in navigator)) return;
    navigator.mediaSession.setActionHandler('previoustrack', prev);
    navigator.mediaSession.setActionHandler('nexttrack', next);
  }

  private updateMediaSessionMetadata(track: Track) {
    if (!('mediaSession' in navigator)) return;

    let artworkSrc = './favicon.svg';
    if (track.coverBlob) {
      artworkSrc = URL.createObjectURL(track.coverBlob);
    }

    navigator.mediaSession.metadata = new MediaMetadata({
      title: track.title,
      artist: track.artist,
      album: track.album,
      artwork: [{ src: artworkSrc, sizes: '512x512', type: 'image/png' }],
    });
  }
}

export const audioEngine = new AudioEngine();
