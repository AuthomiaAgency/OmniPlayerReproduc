import React, { useState, useEffect, useRef } from 'react';
import { Play, Pause, SkipBack, SkipForward, Shuffle, Repeat, ListMusic, Folder, X, Youtube, Volume2, Settings, Plus, PlayCircle, Trash2 } from 'lucide-react';
import { Track, extractColors, parseUniversalUrl, readLocalFile } from '../utils/media';

declare global {
  interface Window {
    YT: any;
    onYouTubeIframeAPIReady: () => void;
  }
}

export default function MusicWidget() {
  const [queue, setQueue] = useState<Track[]>([]);
  const [currentIndex, setCurrentIndex] = useState<number>(-1);
  const [isPlaying, setIsPlaying] = useState(false);
  const isInitialLoadRef = useRef(true);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const [showQueue, setShowQueue] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [isShuffle, setIsShuffle] = useState(false);
  const [isRepeat, setIsRepeat] = useState(false);
  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [ytReady, setYtReady] = useState(false);
  const [isDarkMode, setIsDarkMode] = useState(() => {
    const saved = localStorage.getItem('omni_dark_mode');
    return saved ? JSON.parse(saved) : false;
  });
  const [pendingTracks, setPendingTracks] = useState<Track[]>([]);
  const [visualizerMode, setVisualizerMode] = useState<'cover' | 'video' | 'disk'>(() => {
    return (localStorage.getItem('omni_visualizer') as any) || 'cover';
  });
  const [playedIndices, setPlayedIndices] = useState<number[]>([]);
  const [customVisualizerUrl, setCustomVisualizerUrl] = useState('https://imagine-public.x.ai/imagine-public/share-videos/9d2dad47-191d-4a68-9acd-72cc8016d2c8.mp4?cache=1');
  
  const [colors, setColors] = useState({
    bg: '#ffffff',
    accent: '#000000',
    pastel: '#fdfdfd',
    dark: '#000000'
  });

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const ytPlayerRef = useRef<any>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const currentTrack = currentIndex >= 0 && currentIndex < queue.length ? queue[currentIndex] : null;

  // --- Load Queue from LocalStorage ---
  useEffect(() => {
    try {
      const savedQueue = localStorage.getItem('omni_queue');
      const savedIndex = localStorage.getItem('omni_index');
      if (savedQueue) {
        const parsedQueue = JSON.parse(savedQueue) as Track[];
        const ytTracks = parsedQueue.filter(t => t.source === 'youtube');
        if (ytTracks.length > 0) {
          setQueue(ytTracks);
          setIsPlaying(false); // Ensure paused on load
          if (savedIndex) {
            const idx = parseInt(savedIndex, 10);
            setCurrentIndex(idx >= 0 && idx < ytTracks.length ? idx : 0);
          }
        }
      }
    } catch (e) {
      console.error("Failed to load queue from storage", e);
    }
  }, []);

  // --- Scroll to Current Song in Queue ---
  const queueItemRefs = useRef<(HTMLDivElement | null)[]>([]);
  useEffect(() => {
    if (showQueue && currentIndex >= 0 && queueItemRefs.current[currentIndex]) {
      queueItemRefs.current[currentIndex]?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }, [showQueue, currentIndex]);

  // --- Save Dark Mode to LocalStorage ---
  useEffect(() => {
    localStorage.setItem('omni_dark_mode', JSON.stringify(isDarkMode));
  }, [isDarkMode]);

  // --- Save Visualizer Mode to LocalStorage ---
  useEffect(() => {
    localStorage.setItem('omni_visualizer', visualizerMode);
  }, [visualizerMode]);

  // --- Mutually Exclusive Shuffle/Repeat ---
  const toggleShuffle = () => {
    const nextShuffle = !isShuffle;
    setIsShuffle(nextShuffle);
    if (nextShuffle) {
      setPlayedIndices([currentIndex]);
      setIsRepeat(false);
    } else {
      setPlayedIndices([]);
    }
  };

  const toggleRepeat = () => {
    setIsRepeat(!isRepeat);
    if (!isRepeat) setIsShuffle(false); // Disable shuffle if enabling repeat
  };

  // --- Save Queue to LocalStorage ---
  useEffect(() => {
    try {
      const ytTracks = queue.filter(t => t.source === 'youtube');
      localStorage.setItem('omni_queue', JSON.stringify(ytTracks));
      localStorage.setItem('omni_index', currentIndex.toString());
    } catch (e) {
      console.error("Failed to save queue to storage", e);
    }
  }, [queue, currentIndex]);

  // --- YouTube API Initialization ---
  useEffect(() => {
    if (!window.YT) {
      const tag = document.createElement('script');
      tag.src = 'https://www.youtube.com/iframe_api';
      window.onYouTubeIframeAPIReady = () => {
        ytPlayerRef.current = new window.YT.Player('youtube-hidden-player', {
          height: '0',
          width: '0',
          playerVars: { autoplay: 0, controls: 0, disablekb: 1, fs: 0, rel: 0 },
          events: {
            onReady: () => {
              setYtReady(true);
              if (ytPlayerRef.current?.pauseVideo) ytPlayerRef.current.pauseVideo();
            },
            onStateChange: (e: any) => {
              if (e.data === window.YT.PlayerState.PLAYING) {
                if (isInitialLoadRef.current) {
                  isInitialLoadRef.current = false;
                  ytPlayerRef.current.pauseVideo();
                  return;
                }
                setIsPlaying(true);
              }
              if (e.data === window.YT.PlayerState.PAUSED) setIsPlaying(false);
              if (e.data === window.YT.PlayerState.ENDED) handleNextRef.current();
            }
          }
        });
      };
      const firstScriptTag = document.getElementsByTagName('script')[0];
      firstScriptTag?.parentNode?.insertBefore(tag, firstScriptTag);
    } else if (window.YT && window.YT.Player && !ytPlayerRef.current) {
      setYtReady(true);
    }
  }, []);

  // --- Color Extraction Effect ---
  useEffect(() => {
    if (currentTrack?.coverUrl) {
      extractColors(currentTrack.coverUrl).then(newColors => {
        setColors(newColors);
      });
    } else {
      setColors({ bg: '#ffffff', accent: '#000000', pastel: '#fdfdfd', dark: '#000000' });
    }
  }, [currentTrack?.coverUrl]);

  // --- Track Change Logic ---
  useEffect(() => {
    if (!currentTrack) {
      if (ytPlayerRef.current?.stopVideo) {
        ytPlayerRef.current.stopVideo();
      }
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.src = '';
      }
      setProgress(0);
      setDuration(0);
      return;
    }

    if (currentTrack.source === 'local') {
      if (ytPlayerRef.current?.pauseVideo) ytPlayerRef.current.pauseVideo();
      
      if (!audioRef.current) audioRef.current = new Audio();
      if (currentTrack.file) {
        const url = URL.createObjectURL(currentTrack.file);
        audioRef.current.src = url;
        audioRef.current.loop = isRepeat;
        if (isPlaying) audioRef.current.play().catch(console.error);
        return () => URL.revokeObjectURL(url);
      }
    } else if (currentTrack.source === 'youtube' && ytReady) {
      if (audioRef.current) audioRef.current.pause();
      
      if (ytPlayerRef.current?.loadVideoById) {
        ytPlayerRef.current.loadVideoById(currentTrack.id);
        if (isPlaying) ytPlayerRef.current.playVideo();
      }
    }
  }, [currentTrack, ytReady]);

  // --- Play/Pause Sync ---
  useEffect(() => {
    if (currentTrack?.source === 'local' && audioRef.current) {
      if (isPlaying) audioRef.current.play().catch(console.error);
      else audioRef.current.pause();
    } else if (currentTrack?.source === 'youtube' && ytPlayerRef.current?.playVideo) {
      if (isPlaying) ytPlayerRef.current.playVideo();
      else ytPlayerRef.current.pauseVideo();
    }
  }, [isPlaying]);

  // --- Volume Sync ---
  useEffect(() => {
    if (audioRef.current) audioRef.current.volume = volume;
    if (ytPlayerRef.current?.setVolume) ytPlayerRef.current.setVolume(volume * 100);
  }, [volume]);

  // --- Progress Sync ---
  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (isPlaying) {
      interval = setInterval(() => {
        if (currentTrack?.source === 'local' && audioRef.current) {
          setProgress(audioRef.current.currentTime);
          setDuration(audioRef.current.duration || 0);
        } else if (currentTrack?.source === 'youtube' && ytPlayerRef.current?.getCurrentTime) {
          setProgress(ytPlayerRef.current.getCurrentTime());
          setDuration(ytPlayerRef.current.getDuration() || 0);
        }
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [isPlaying, currentTrack]);

  // --- Refs for Stale Closures ---
  const handleNextRef = useRef<() => void>(() => {});

  // --- Controls ---
  const togglePlay = () => setIsPlaying(!isPlaying);

  const handleNext = () => {
    if (queue.length === 0) return;

    // Handle Repeat
    if (isRepeat) {
      handleSeek({ target: { value: '0' } } as any);
      setIsPlaying(true);
      return;
    }

    // Handle Shuffle
    if (isShuffle) {
      const unplayed = queue.map((_, i) => i).filter(i => !playedIndices.includes(i));
      let nextIdx;
      if (unplayed.length === 0) {
        // All played, reset
        nextIdx = Math.floor(Math.random() * queue.length);
        setPlayedIndices([nextIdx]);
      } else {
        nextIdx = unplayed[Math.floor(Math.random() * unplayed.length)];
        setPlayedIndices([...playedIndices, nextIdx]);
      }
      setCurrentIndex(nextIdx);
    } else {
      // Normal logic
      setCurrentIndex((prev) => (prev + 1) % queue.length);
    }
    setIsPlaying(true);
  };

  useEffect(() => {
    handleNextRef.current = handleNext;
  }, [handleNext]);

  const handlePrev = () => {
    if (queue.length === 0) return;
    if (progress > 3 || queue.length === 1) {
      handleSeek({ target: { value: '0' } } as any);
      setIsPlaying(true);
      return;
    }
    setCurrentIndex((prev) => (prev - 1 + queue.length) % queue.length);
    setIsPlaying(true);
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const time = Number(e.target.value);
    setProgress(time);
    if (currentTrack?.source === 'local' && audioRef.current) {
      audioRef.current.currentTime = time;
    } else if (currentTrack?.source === 'youtube' && ytPlayerRef.current?.seekTo) {
      ytPlayerRef.current.seekTo(time, true);
    }
  };

  const removeFromQueue = (e: React.MouseEvent, indexToRemove: number) => {
    e.stopPropagation();
    setQueue(prev => prev.filter((_, i) => i !== indexToRemove));
    
    if (currentIndex === indexToRemove) {
      if (queue.length <= 1) {
        setCurrentIndex(-1);
        setIsPlaying(false);
      } else if (indexToRemove === queue.length - 1) {
        setCurrentIndex(indexToRemove - 1);
      }
    } else if (currentIndex > indexToRemove) {
      setCurrentIndex(prev => prev - 1);
    }
  };

  // --- Input Handlers ---
  const handleUrlSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputValue.trim()) return;
    
    setIsLoading(true);
    
    // Split by whitespace or commas to allow multiple URLs
    const urls = inputValue.split(/[\s,]+/).filter(url => url.trim().startsWith('http'));
    let allNewTracks: Track[] = [];

    for (const url of urls) {
      try {
        const tracks = await parseUniversalUrl(url.trim());
        if (tracks && tracks.length > 0) {
          allNewTracks = [...allNewTracks, ...tracks];
        }
      } catch (err) {
        console.error("Error parsing URL:", url);
      }
    }
    
    if (allNewTracks.length > 0) {
      setPendingTracks(allNewTracks);
    } else {
      alert('No se pudieron encontrar canciones. Asegúrate de usar enlaces válidos de YouTube.');
    }
    setIsLoading(false);
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    
    setIsLoading(true);
    const newTracks: Track[] = [];
    
    for (let i = 0; i < files.length; i++) {
      const track = await readLocalFile(files[i]);
      newTracks.push(track);
    }
    
    setQueue(prev => [...prev, ...newTracks]);
    if (currentIndex === -1) {
      setCurrentIndex(queue.length);
      setIsPlaying(false);
    }
    setIsLoading(false);
    setShowSettings(false);
  };

  const formatTime = (seconds: number) => {
    if (isNaN(seconds)) return "0:00";
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  // --- Dynamic CSS Variables for Theming ---
  // Theme is now managed via CSS variables passed to the main div


  const widgetStyle = {} as React.CSSProperties;

  const renderSourceIcon = (source?: string, color?: string) => {
    if (source === 'youtube') return <Youtube size={20} className="text-[#ff0000]" />;
    if (source === 'local') return <Folder size={20} className="text-blue-500" />;
    return <PlayCircle size={20} color={color || "var(--t-text)"} />;
  };

  return (
    <div 
      className={`@container w-full h-full flex flex-col transition-all duration-500 ease-in-out font-sans relative ${isDarkMode ? 'dark' : ''}`}
      style={{ 
        '--t-bg': isDarkMode ? '#191919' : '#ffffff',
        '--t-text': isDarkMode ? '#ffffff' : '#000000',
        '--t-border': isDarkMode ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)',
        '--t-muted': isDarkMode ? 'rgba(255,255,255,0.6)' : 'rgba(0,0,0,0.6)',
        '--t-track': isDarkMode ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)',
        '--t-fill': isDarkMode ? '#ffffff' : '#000000',
        '--c-pastel': isDarkMode ? '#252525' : colors.pastel,
        backgroundColor: 'var(--t-bg)', 
        color: 'var(--t-text)'
      } as React.CSSProperties}
    >
      {/* Hidden YouTube Player */}
      <div id="youtube-hidden-player" className="absolute opacity-0 pointer-events-none w-0 h-0" />

      {/* Main Content Area */}
      <div className="flex-1 relative flex flex-col overflow-hidden">
        
        {(!currentTrack) ? (
            <div className="flex-1 flex flex-col items-center justify-center text-center p-6" style={{ backgroundColor: 'var(--t-bg)' }}>
              <div 
                className="w-24 h-24 border rounded-full flex items-center justify-center mb-6 transition-all"
                style={{ borderColor: 'var(--t-border)', backgroundColor: 'var(--t-bg)' }}
              >
                <PlayCircle size={48} color="var(--t-muted)" />
              </div>
              <h3 className="text-2xl font-black mb-2" style={{ color: 'var(--t-text)' }}>Sin Música</h3>
              <p className="font-bold mb-8" style={{ color: 'var(--t-muted)' }}>Añade un enlace de YouTube o un archivo MP3 local.</p>
              <button 
                onClick={() => setShowSettings(true)}
                className="px-6 py-3 font-black uppercase tracking-wider border rounded-xl transition-all hover:opacity-80"
                style={{ 
                  backgroundColor: 'var(--t-text)', 
                  color: 'var(--t-bg)', 
                  borderColor: 'var(--t-border)'
                }}
              >
                Añadir Música
              </button>
            </div>
        ) : (
          <>
            {/* Top Section: Visualizer */}
            <div className="flex-1 relative w-full h-full min-h-[45%] bg-black overflow-hidden flex items-center justify-center">
              {visualizerMode === 'cover' && (
                <img 
                  src={currentTrack.coverUrl} 
                  alt="Cover" 
                  className={`w-full h-full object-cover transition-transform duration-700 ${currentTrack.source === 'youtube' ? 'scale-[1.35]' : ''}`}
                  crossOrigin="anonymous"
                />
              )}
              {visualizerMode === 'video' && (
                <video
                  src={customVisualizerUrl || 'https://i.imgur.com/1Z8z9qR.mp4'}
                  autoPlay
                  loop
                  muted
                  className="w-full h-full object-cover"
                />
              )}
              {visualizerMode === 'disk' && (
                <div className="w-full h-full flex items-center justify-center p-4">
                  <div className="w-40 h-40 md:w-48 md:h-48 rounded-full animate-spin-slow border-8 border-dashed flex items-center justify-center" style={{ borderColor: colors.accent }}>
                    <img src={currentTrack.coverUrl} className="w-32 h-32 md:w-40 md:h-40 object-cover rounded-full" />
                  </div>
                </div>
              )}
              <div 
                className="absolute inset-x-0 bottom-0 h-40" 
                style={{ background: `linear-gradient(to top, var(--t-bg) 10%, transparent)` }} 
              />
            </div>

            {/* Bottom Section: Info & Controls */}
            <div className="w-full shrink-0 flex flex-col p-6 pt-0 relative z-10" style={{ backgroundColor: 'var(--t-bg)' }}>
              
              {/* Title, Artist, and Top Buttons */}
              <div className="flex items-end justify-between mb-6">
                <div className="flex-1 min-w-0 pr-4">
                  <h2 className={`font-black line-clamp-2 leading-tight mb-1 font-serif text-3xl md:text-4xl`} style={{ color: 'var(--t-text)' }}>
                    {currentTrack.title}
                  </h2>
                  <p className="font-bold truncate text-sm md:text-base uppercase tracking-widest" style={{ color: 'var(--t-muted)' }}>
                    {currentTrack.source === 'local' ? '' : currentTrack.artist}
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button 
                    onClick={() => setShowSettings(!showSettings)}
                    className="p-2 rounded-lg border transition-all hover:opacity-80"
                    style={{ borderColor: 'var(--t-border)', backgroundColor: 'var(--t-bg)' }}
                    title="Configuración / Añadir"
                  >
                    <Settings size={20} color="var(--t-text)" />
                  </button>
                  <button 
                    onClick={() => setShowQueue(!showQueue)}
                    className="p-2 rounded-lg border transition-all hover:opacity-80"
                    style={{ borderColor: 'var(--t-border)', backgroundColor: 'var(--t-bg)' }}
                    title="Cola de Reproducción"
                  >
                    <ListMusic size={20} color="var(--t-text)" />
                  </button>
                </div>
              </div>

              {/* Custom Progress Bar */}
              <div className="w-full mb-4">
                <div className="relative w-full h-6 flex items-center group">
                  {/* Track Background */}
                  <div className="absolute w-full h-2 rounded-full" style={{ backgroundColor: 'var(--t-track)' }}></div>
                  {/* Track Fill */}
                  <div className="absolute h-2 rounded-full pointer-events-none" style={{ width: `${duration ? (progress / duration) * 100 : 0}%`, backgroundColor: 'var(--t-fill)' }}></div>
                  {/* Thumb */}
                  <div className="absolute h-4 w-4 rounded-full shadow-md pointer-events-none transition-transform group-hover:scale-125" style={{ left: `${duration ? (progress / duration) * 100 : 0}%`, transform: 'translateX(-50%)', backgroundColor: 'var(--t-text)', border: '2px solid var(--t-bg)' }}></div>
                  {/* Actual Input */}
                  <input 
                    type="range" 
                    min={0} 
                    max={duration || 100} 
                    value={progress} 
                    onChange={handleSeek}
                    className="absolute w-full h-full opacity-0 cursor-pointer"
                    disabled={!currentTrack}
                  />
                </div>
                <div className="flex justify-between text-xs font-bold mt-1 font-mono" style={{ color: 'var(--t-text)' }}>
                  <span>{formatTime(progress)}</span>
                  <span>{formatTime(duration)}</span>
                </div>
              </div>

              {/* Playback Controls */}
              <div className="flex items-center justify-between w-full mb-4">
                <button 
                  onClick={toggleShuffle} 
                  className="p-2 border-2 rounded-lg transition-colors"
                  style={{ 
                    borderColor: isShuffle ? 'var(--t-text)' : 'var(--t-border)',
                    backgroundColor: isShuffle ? 'var(--t-text)' : 'transparent',
                    color: isShuffle ? 'var(--t-bg)' : 'var(--t-text)'
                  }}
                >
                  <Shuffle size={20} />
                </button>
                
                <div className="flex items-center gap-4">
                  <button onClick={handlePrev} className="p-2 hover:scale-110 transition-transform" style={{ color: 'var(--t-text)' }}>
                    <SkipBack size={28} fill="currentColor" />
                  </button>
                  <button 
                    onClick={togglePlay} 
                    className="w-16 h-16 flex items-center justify-center rounded-full border transition-all hover:scale-105"
                    style={{ 
                      backgroundColor: 'var(--c-acc)', 
                      borderColor: 'var(--t-border)'
                    }}
                  >
                    {isPlaying ? (
                      <Pause size={32} fill={isDarkMode ? 'white' : 'black'} className={isDarkMode ? 'text-white' : 'text-black'} />
                    ) : (
                      <Play size={32} fill={isDarkMode ? 'white' : 'black'} className={`ml-1 ${isDarkMode ? 'text-white' : 'text-black'}`} />
                    )}
                  </button>
                  <button onClick={handleNext} className="p-2 hover:scale-110 transition-transform" style={{ color: 'var(--t-text)' }}>
                    <SkipForward size={28} fill="currentColor" />
                  </button>
                </div>

                <button 
                  onClick={toggleRepeat} 
                  className="p-2 border-2 rounded-lg transition-colors"
                  style={{ 
                    borderColor: isRepeat ? 'var(--t-text)' : 'var(--t-border)',
                    backgroundColor: isRepeat ? 'var(--t-text)' : 'transparent',
                    color: isRepeat ? 'var(--t-bg)' : 'var(--t-text)'
                  }}
                >
                  <Repeat size={20} />
                </button>
              </div>

              {/* Custom Volume Control */}
              <div className="flex items-center space-x-3 w-full mt-2">
                <Volume2 size={20} color="var(--t-text)" />
                <div className="relative flex-1 h-6 flex items-center group">
                  <div className="absolute w-full h-2 rounded-full" style={{ backgroundColor: 'var(--t-track)' }}></div>
                  <div className="absolute h-2 rounded-full pointer-events-none" style={{ width: `${volume * 100}%`, backgroundColor: 'var(--t-fill)' }}></div>
                  <div className="absolute h-4 w-4 rounded-full shadow-md pointer-events-none transition-transform group-hover:scale-125" style={{ left: `${volume * 100}%`, transform: 'translateX(-50%)', backgroundColor: 'var(--t-text)', border: '2px solid var(--t-bg)' }}></div>
                  <input 
                    type="range" 
                    min={0} 
                    max={1} 
                    step={0.01}
                    value={volume} 
                    onChange={(e) => setVolume(Number(e.target.value))}
                    className="absolute w-full h-full opacity-0 cursor-pointer"
                    disabled={!currentTrack}
                  />
                </div>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Settings / Add Modal */}
      {showSettings && (
        <div className="absolute inset-0 z-40 backdrop-blur-md flex flex-col p-6 border-b animate-in fade-in duration-200" style={{ backgroundColor: 'var(--t-bg)', borderColor: 'var(--t-border)' }}>
          <div className="flex justify-between items-center mb-8">
            <h3 className="text-2xl font-black uppercase tracking-wider" style={{ color: 'var(--t-text)' }}>Configuración</h3>
            <button 
              onClick={() => { setShowSettings(false); setPendingTracks([]); }} 
              className="p-2 border rounded-lg transition-colors hover:opacity-80"
              style={{ borderColor: 'var(--t-border)', backgroundColor: 'var(--t-bg)' }}
            >
              <X size={24} color="var(--t-text)" />
            </button>
          </div>
          
          <div className="space-y-8 flex-1 overflow-y-auto max-w-2xl mx-auto w-full">
            {pendingTracks.length > 0 ? (
              <div className="flex flex-col h-full animate-in slide-in-from-right-4">
                <div className="flex items-center justify-between mb-4">
                  <h4 className="font-black text-xl uppercase" style={{ color: 'var(--t-text)' }}>
                    {pendingTracks.length} Canciones Encontradas
                  </h4>
                </div>
                <div className="flex-1 overflow-y-auto space-y-2 mb-6 max-h-[400px] pr-2">
                  {pendingTracks.map((t, i) => (
                    <div key={i} className="flex items-center gap-3 p-3 border rounded-xl" style={{ borderColor: 'var(--t-border)', backgroundColor: 'var(--c-pastel)' }}>
                      <img src={t.coverUrl} className="w-12 h-12 object-cover rounded-lg border" style={{ borderColor: 'var(--t-border)' }} />
                      <div className="flex-1 min-w-0">
                        <p className="font-bold text-sm truncate" style={{ color: 'var(--t-text)' }}>{t.title}</p>
                        <p className="text-xs font-bold uppercase truncate" style={{ color: 'var(--t-muted)' }}>{t.artist}</p>
                      </div>
                      <a href={t.originalUrl} target="_blank" rel="noreferrer" className="p-2 opacity-50 hover:opacity-100 transition-opacity" title="Ver original">
                        <Youtube size={18} color="var(--t-text)" />
                      </a>
                    </div>
                  ))}
                </div>
                <div className="flex gap-3 mt-auto pt-4 border-t" style={{ borderColor: 'var(--t-border)' }}>
                  <button
                    onClick={() => setPendingTracks([])}
                    className="flex-1 py-3 border rounded-xl font-black uppercase tracking-wider transition-all hover:opacity-80"
                    style={{ borderColor: 'var(--t-border)', color: 'var(--t-text)' }}
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={() => {
                      setQueue(prev => [...prev, ...pendingTracks]);
                      if (currentIndex === -1) {
                        setCurrentIndex(queue.length);
                        setIsPlaying(false);
                      }
                      setPendingTracks([]);
                      setInputValue('');
                      setShowSettings(false);
                    }}
                    className="flex-1 py-3 border rounded-xl font-black uppercase tracking-wider transition-all hover:opacity-80"
                    style={{ borderColor: 'var(--t-border)', backgroundColor: 'var(--t-text)', color: 'var(--t-bg)' }}
                  >
                    Añadir a la Cola
                  </button>
                </div>
              </div>
            ) : (
              <>
                {/* Visualizer Settings */}
                <div className="p-4 border rounded-xl mb-6 space-y-4" style={{ borderColor: 'var(--t-border)', backgroundColor: 'var(--c-pastel)' }}>
                  <span className="font-black uppercase tracking-wider block" style={{ color: 'var(--t-text)' }}>Visualización</span>
                  <div className="flex gap-2">
                    {(['cover', 'video', 'disk'] as const).map((mode) => (
                      <button
                        key={mode}
                        onClick={() => setVisualizerMode(mode)}
                        className={`flex-1 py-2 border rounded-lg font-bold uppercase text-xs ${visualizerMode === mode ? 'opacity-100' : 'opacity-50'}`}
                        style={{ borderColor: 'var(--t-border)', backgroundColor: visualizerMode === mode ? 'var(--t-text)' : 'transparent', color: visualizerMode === mode ? 'var(--t-bg)' : 'var(--t-text)' }}
                      >
                        {mode}
                      </button>
                    ))}
                  </div>
                  {visualizerMode === 'video' && (
                    <input
                      type="text"
                      value={customVisualizerUrl}
                      onChange={(e) => setCustomVisualizerUrl(e.target.value)}
                      placeholder="URL de video (.mp4)"
                      className="w-full p-2 border rounded-lg text-sm"
                      style={{ borderColor: 'var(--t-border)', backgroundColor: 'var(--t-bg)', color: 'var(--t-text)' }}
                    />
                  )}
                </div>

                {/* Dark Mode Toggle */}
                <div className="flex items-center justify-between p-4 border rounded-xl mb-6" style={{ borderColor: 'var(--t-border)', backgroundColor: 'var(--c-pastel)' }}>
                  <span className="font-black uppercase tracking-wider" style={{ color: 'var(--t-text)' }}>Modo Oscuro</span>
                  <button 
                    onClick={() => setIsDarkMode(!isDarkMode)}
                    className="w-14 h-8 rounded-full border relative transition-colors"
                    style={{ borderColor: 'var(--t-border)', backgroundColor: isDarkMode ? 'var(--c-acc)' : 'var(--t-track)' }}
                  >
                    <div 
                      className={`absolute top-0.5 w-6 h-6 rounded-full transition-transform duration-300 ${isDarkMode ? 'translate-x-6' : 'translate-x-1'}`} 
                      style={{ backgroundColor: 'var(--t-border)' }} 
                    />
                  </button>
                </div>

                <form onSubmit={handleUrlSubmit} className="space-y-3">
              <label className="font-black text-lg uppercase flex items-center gap-2" style={{ color: 'var(--t-text)' }}>
                <Youtube size={24} /> YouTube
              </label>
              <p className="text-sm font-bold" style={{ color: 'var(--t-muted)' }}>Pega un enlace de video, una playlist, o <strong>varios enlaces separados por espacios o saltos de línea</strong>.</p>
              <div className="flex flex-col space-y-3">
                <textarea 
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                  placeholder="https://youtube.com/watch?v=...&#10;https://youtube.com/watch?v=..."
                  className="w-full p-3 border rounded-xl font-medium outline-none transition-all resize-none min-h-[120px]"
                  style={{ 
                    borderColor: 'var(--t-border)', 
                    backgroundColor: 'var(--t-bg)', 
                    color: 'var(--t-text)'
                  }}
                />
                
                <button 
                  type="submit" 
                  disabled={isLoading}
                  className="w-full py-3 border rounded-xl font-black uppercase tracking-wider flex items-center justify-center space-x-2 transition-all hover:opacity-80 disabled:opacity-50"
                  style={{ borderColor: 'var(--t-border)', backgroundColor: 'var(--t-text)', color: 'var(--t-bg)' }}
                >
                  {isLoading ? <span>Procesando...</span> : <><Plus size={20} /><span>Añadir a la Cola</span></>}
                </button>
              </div>
            </form>

            <div className="relative flex items-center py-4">
              <div className="flex-grow border-t" style={{ borderColor: 'var(--t-border)' }}></div>
              <span className="flex-shrink-0 mx-4 font-black uppercase" style={{ color: 'var(--t-text)' }}>O</span>
              <div className="flex-grow border-t" style={{ borderColor: 'var(--t-border)' }}></div>
            </div>

            <div className="space-y-3">
              <label className="font-black text-lg uppercase flex items-center gap-2" style={{ color: 'var(--t-text)' }}>
                <Folder size={24} /> Archivos Locales
              </label>
              <p className="text-sm font-bold" style={{ color: 'var(--t-muted)' }}>Carga archivos MP3 directamente desde tu dispositivo.</p>
              <input 
                type="file" 
                ref={fileInputRef} 
                onChange={handleFileSelect} 
                accept="audio/*" 
                multiple 
                className="hidden" 
              />
              <button 
                onClick={() => fileInputRef.current?.click()}
                disabled={isLoading}
                className="w-full py-4 border rounded-xl font-black uppercase tracking-wider flex items-center justify-center space-x-2 transition-all hover:opacity-80"
                style={{ 
                  borderColor: 'var(--t-border)', 
                  backgroundColor: '#3b82f6', 
                  color: '#ffffff'
                }}
              >
                <Folder size={20} />
                <span>Seleccionar MP3s</span>
              </button>
            </div>
            </>
            )}
          </div>
        </div>
      )}

      {/* Queue Sidebar Overlay */}
      <div 
        className={`absolute inset-y-0 right-0 w-80 z-30 transform transition-transform duration-300 ease-in-out border-l flex flex-col ${showQueue ? 'translate-x-0' : 'translate-x-full'}`}
        style={{ backgroundColor: 'var(--t-bg)', borderColor: 'var(--t-border)' }}
      >
        <div className="p-4 flex items-center justify-between border-b shrink-0" style={{ backgroundColor: 'var(--c-pastel)', borderColor: 'var(--t-border)' }}>
          <h3 className="font-black uppercase tracking-wider flex items-center space-x-2" style={{ color: 'var(--t-text)' }}>
            <ListMusic size={18} />
            <span>Cola ({queue.length})</span>
          </h3>
          <button 
            onClick={() => setShowQueue(false)} 
            className="p-1 border rounded transition-colors"
            style={{ borderColor: 'var(--t-border)', color: 'var(--t-text)' }}
          >
            <X size={18} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-2 space-y-2" style={{ backgroundColor: 'var(--t-bg)' }}>
          {queue.length === 0 ? (
            <p className="font-bold text-sm text-center mt-8" style={{ color: 'var(--t-muted)' }}>La cola está vacía</p>
          ) : (
            queue.map((track, idx) => (
              <div 
                key={`${track.id}-${idx}`}
                ref={el => queueItemRefs.current[idx] = el}
                onClick={() => {
                  setCurrentIndex(idx);
                  setIsPlaying(true);
                  setShowQueue(false);
                }}
                className={`flex items-center space-x-3 p-2 rounded-lg border cursor-pointer transition-all ${idx === currentIndex ? '' : 'border-transparent hover:border-black/20'}`}
                style={{ 
                  borderColor: idx === currentIndex ? 'var(--t-border)' : 'transparent',
                  backgroundColor: idx === currentIndex ? 'var(--c-pastel)' : 'transparent'
                }}
              >
                <div className="relative w-12 h-12 shrink-0 border rounded overflow-hidden" style={{ borderColor: 'var(--t-border)' }}>
                  <img src={track.coverUrl} alt="" className="w-full h-full object-cover" crossOrigin="anonymous" />
                  <div className="absolute bottom-0 right-0 p-0.5" style={{ backgroundColor: 'var(--t-bg)' }}>
                    {renderSourceIcon(track.source, 'var(--t-text)')}
                  </div>
                </div>
                <div className="flex-1 min-w-0">
                  <p className={`text-sm font-bold truncate`} style={{ color: idx === currentIndex ? 'var(--t-text)' : 'var(--t-muted)' }}>
                    {track.title}
                  </p>
                  <p className="text-xs font-bold uppercase truncate" style={{ color: 'var(--t-muted)' }}>
                    {track.source === 'local' ? '' : track.artist}
                  </p>
                </div>
                <button 
                  onClick={(e) => removeFromQueue(e, idx)}
                  className="p-2 rounded hover:bg-red-500 hover:text-white transition-colors"
                  style={{ color: 'var(--t-muted)' }}
                  title="Eliminar de la cola"
                >
                  <Trash2 size={16} />
                </button>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
