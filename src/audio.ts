import type { Track } from './types';

class AudioEngine {
  public readonly canSetVolume: boolean;
  private audio: HTMLAudioElement;
  private currentTrack: Track | null = null;
  private currentBlobUrl: string | null = null;
  private currentArtworkUrl: string | null = null;
  private listeners: Set<() => void> = new Set();
  private softwareVolume: number = 1;
  private activePreviewAudio: HTMLAudioElement | null = null;
  private previewStopListeners: Set<() => void> = new Set();

  constructor() {
    const testAudio = new Audio();
    try {
      testAudio.volume = 0.5;
      this.canSetVolume = testAudio.volume === 0.5;
    } catch {
      this.canSetVolume = false;
    }

    this.audio = new Audio();
    // iOS Safari audio properties
    this.audio.preload = 'auto';
    (this.audio as any).playsInline = true;

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

  public onStopPreview(cb: () => void) {
    this.previewStopListeners.add(cb);
    return () => this.previewStopListeners.delete(cb);
  }

  public stopPreview() {
    if (this.activePreviewAudio) {
      try {
        this.activePreviewAudio.pause();
        this.activePreviewAudio.currentTime = 0;
      } catch {}
      this.activePreviewAudio = null;
    }
    this.previewStopListeners.forEach((cb) => cb());
  }

  public playPreview(audio: HTMLAudioElement) {
    // Mutual exclusion: pause library audio
    this.pause();

    // Stop previous preview if different
    if (this.activePreviewAudio && this.activePreviewAudio !== audio) {
      try {
        this.activePreviewAudio.pause();
        this.activePreviewAudio.currentTime = 0;
      } catch {}
    }
    this.activePreviewAudio = audio;
  }

  public async playTrack(track: Track) {
    // Mutual exclusion: stop any active preview
    this.stopPreview();

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
      this.stopPreview();
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
    const clamped = Math.max(0, Math.min(1, vol));
    this.softwareVolume = clamped;

    try {
      this.audio.volume = clamped;
    } catch {}
    this.notify();
  }

  public getState() {
    return {
      track: this.currentTrack,
      isPlaying: !this.audio.paused,
      currentTime: this.audio.currentTime,
      duration: this.audio.duration || this.currentTrack?.duration || 0,
      volume: this.softwareVolume,
    };
  }

  private setupMediaSession() {
    if (!('mediaSession' in navigator)) return;

    navigator.mediaSession.setActionHandler('play', () => {
      if (this.currentTrack) {
        this.stopPreview();
        this.audio.play().catch(() => {});
      }
    });
    navigator.mediaSession.setActionHandler('pause', () => {
      this.audio.pause();
    });
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

    if (this.currentArtworkUrl) {
      URL.revokeObjectURL(this.currentArtworkUrl);
      this.currentArtworkUrl = null;
    }

    let artworkSrc = './favicon.svg';
    let artworkType = 'image/svg+xml';
    if (track.coverBlob) {
      artworkSrc = URL.createObjectURL(track.coverBlob);
      this.currentArtworkUrl = artworkSrc;
      artworkType = track.coverBlob.type || 'image/jpeg';
    }

    navigator.mediaSession.metadata = new MediaMetadata({
      title: track.title,
      artist: track.artist,
      album: track.album,
      artwork: [{ src: artworkSrc, sizes: '512x512', type: artworkType }],
    });
  }
}

export const audioEngine = new AudioEngine();
