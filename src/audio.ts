import type { Track } from './types';

class AudioEngine {
  public readonly canSetVolume: boolean;
  private audio: HTMLAudioElement;
  private audioCtx: AudioContext | null = null;
  private mediaSourceNode: MediaElementAudioSourceNode | null = null;
  private currentTrack: Track | null = null;
  private nextTrack: Track | null = null;
  private currentBlobUrl: string | null = null;
  private nextPreloadBlobUrl: string | null = null;
  private currentArtworkUrl: string | null = null;
  private listeners: Set<() => void> = new Set();
  private softwareVolume: number = 1;
  private activePreviewAudio: HTMLAudioElement | null = null;
  private previewStopListeners: Set<() => void> = new Set();
  private isAudioCtxConnected: boolean = false;

  constructor() {
    const testAudio = new Audio();
    try {
      testAudio.volume = 0.5;
      this.canSetVolume = testAudio.volume === 0.5;
    } catch {
      this.canSetVolume = false;
    }

    // Create audio element and mount to DOM so iOS WebKit never considers it unmounted background trash
    this.audio = document.createElement('audio');
    this.audio.id = 'app-background-audio';
    this.audio.preload = 'auto';
    this.audio.setAttribute('playsinline', 'true');
    this.audio.setAttribute('webkit-playsinline', 'true');
    this.audio.style.display = 'none';
    (this.audio as any).playsInline = true;

    this.mountAudioToDom();
    this.setupListeners();
    this.setupMediaSession();
    this.setupBackgroundKeepAlive();
  }

  private mountAudioToDom() {
    if (typeof document !== 'undefined') {
      if (document.body) {
        document.body.appendChild(this.audio);
      } else {
        window.addEventListener('DOMContentLoaded', () => {
          document.body.appendChild(this.audio);
        });
      }
    }
  }

  // Connects HTMLAudioElement to Web Audio API AudioContext for iOS system audio session activation
  private ensureAudioContextRunning() {
    try {
      const AudioCtxClass =
        window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtxClass) return;

      if (!this.audioCtx) {
        this.audioCtx = new AudioCtxClass();
      }

      if (this.audioCtx.state === 'suspended') {
        this.audioCtx.resume().catch(() => {});
      }

      if (!this.isAudioCtxConnected && this.audioCtx) {
        try {
          this.mediaSourceNode = this.audioCtx.createMediaElementSource(this.audio);
          this.mediaSourceNode.connect(this.audioCtx.destination);
          this.isAudioCtxConnected = true;
        } catch (e) {
          // If already connected, ignore
          this.isAudioCtxConnected = true;
        }
      }
    } catch (err) {
      console.warn('Web Audio AudioContext initialization:', err);
    }
  }

  // Prevents iOS from freezing the audio pipeline when switching to home screen or locking device
  private setupBackgroundKeepAlive() {
    if (typeof document === 'undefined') return;

    const handleVisibilityOrPageHide = () => {
      if (this.audioCtx && this.audioCtx.state === 'suspended') {
        this.audioCtx.resume().catch(() => {});
      }
      if (!this.audio.paused) {
        this.updateMediaSessionPlaybackState('playing');
        this.updatePositionState();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityOrPageHide);
    window.addEventListener('pagehide', handleVisibilityOrPageHide);
    window.addEventListener('freeze' as any, handleVisibilityOrPageHide);
  }

  private setupListeners() {
    this.audio.addEventListener('play', () => {
      this.ensureAudioContextRunning();
      this.updateMediaSessionPlaybackState('playing');
      this.updatePositionState();
      this.notify();
    });

    this.audio.addEventListener('pause', () => {
      this.updateMediaSessionPlaybackState('paused');
      this.updatePositionState();
      this.notify();
    });

    this.audio.addEventListener('timeupdate', () => {
      this.updatePositionState();
      this.notify();
    });

    this.audio.addEventListener('ended', () => {
      // Synchronous instant transition to next track to prevent iOS background session expiration
      if (this.nextTrack && this.nextPreloadBlobUrl) {
        const next = this.nextTrack;
        const nextUrl = this.nextPreloadBlobUrl;

        if (this.currentBlobUrl) {
          URL.revokeObjectURL(this.currentBlobUrl);
        }

        this.currentTrack = next;
        this.currentBlobUrl = nextUrl;
        this.nextTrack = null;
        this.nextPreloadBlobUrl = null;

        this.audio.src = nextUrl;
        this.updateMediaSessionMetadata(next);
        this.audio.play().catch((err) => {
          console.warn('Background auto-play error, invoking onTrackEnded fallback:', err);
          this.onTrackEnded();
        });
        this.notify();
      } else {
        this.onTrackEnded();
        this.notify();
      }
    });

    this.audio.addEventListener('loadedmetadata', () => {
      this.updatePositionState();
      this.notify();
    });
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
    this.pause();
    if (this.activePreviewAudio && this.activePreviewAudio !== audio) {
      try {
        this.activePreviewAudio.pause();
        this.activePreviewAudio.currentTime = 0;
      } catch {}
    }
    this.activePreviewAudio = audio;
  }

  // Pre-allocates next track blob URL for gapless & zero-delay background switching
  public setNextTrack(track: Track | null) {
    if (this.nextPreloadBlobUrl) {
      URL.revokeObjectURL(this.nextPreloadBlobUrl);
      this.nextPreloadBlobUrl = null;
    }

    this.nextTrack = track;
    if (track && track.audioBlob) {
      try {
        this.nextPreloadBlobUrl = URL.createObjectURL(track.audioBlob);
      } catch {}
    }
  }

  public async playTrack(track: Track) {
    this.ensureAudioContextRunning();
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
    this.updateMediaSessionPlaybackState('playing');
    this.notify();
  }

  public async togglePlay() {
    this.ensureAudioContextRunning();
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
    if (isFinite(seconds) && seconds >= 0) {
      this.audio.currentTime = seconds;
      this.updatePositionState();
    }
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

  private updateMediaSessionPlaybackState(state: 'playing' | 'paused' | 'none') {
    if ('mediaSession' in navigator) {
      navigator.mediaSession.playbackState = state;
    }
  }

  private updatePositionState() {
    if (!('mediaSession' in navigator) || !navigator.mediaSession.setPositionState) return;
    const dur = this.audio.duration;
    if (isFinite(dur) && dur > 0) {
      try {
        navigator.mediaSession.setPositionState({
          duration: dur,
          playbackRate: this.audio.playbackRate || 1,
          position: Math.min(this.audio.currentTime, dur),
        });
      } catch {}
    }
  }

  private setupMediaSession() {
    if (!('mediaSession' in navigator)) return;

    navigator.mediaSession.setActionHandler('play', () => {
      this.ensureAudioContextRunning();
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

    navigator.mediaSession.setActionHandler('seekforward', (details) => {
      const skipTime = details.seekOffset || 10;
      this.seek(this.audio.currentTime + skipTime);
    });

    navigator.mediaSession.setActionHandler('seekbackward', (details) => {
      const skipTime = details.seekOffset || 10;
      this.seek(Math.max(0, this.audio.currentTime - skipTime));
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
      artwork: [
        { src: artworkSrc, sizes: '96x96', type: artworkType },
        { src: artworkSrc, sizes: '128x128', type: artworkType },
        { src: artworkSrc, sizes: '256x256', type: artworkType },
        { src: artworkSrc, sizes: '512x512', type: artworkType },
      ],
    });
  }
}

export const audioEngine = new AudioEngine();
