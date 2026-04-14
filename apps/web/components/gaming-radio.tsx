"use client";

import { useState, useRef, useEffect } from "react";

const STATIONS = [
  {
    name: "VCPR-WTA",
    description: "The vibe of the vice, the power of the arena.",
    url: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3",
    color: "#ec4899"
  },
  {
    name: "RADIO ESPANTOSO",
    description: "Jazz and Latin beats for strategic minds.",
    url: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-8.mp3",
    color: "#f59e0b"
  },
  {
    name: "FLASH FM",
    description: "High-energy pop from the golden era of gaming.",
    url: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-2.mp3",
    color: "#06b6d4"
  }
];

export function GamingRadio() {
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentStation, setCurrentStation] = useState(0);
  const [volume, setVolume] = useState(0.5);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const station = STATIONS[currentStation];

  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = volume;
    }
  }, [volume]);

  const togglePlay = () => {
    if (!audioRef.current) return;
    
    if (isPlaying) {
      audioRef.current.pause();
    } else {
      audioRef.current.play().catch(err => {
        console.error("Playback failed:", err);
      });
    }
    setIsPlaying(!isPlaying);
  };

  const nextStation = () => {
    setCurrentStation((prev) => (prev + 1) % STATIONS.length);
    setIsPlaying(false);
    setCurrentTime(0);
  };

  const handleTimeUpdate = () => {
    if (audioRef.current) {
      setCurrentTime(audioRef.current.currentTime);
    }
  };

  const handleLoadedMetadata = () => {
    if (audioRef.current) {
      setDuration(audioRef.current.duration);
    }
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const time = parseFloat(e.target.value);
    setCurrentTime(time);
    if (audioRef.current) {
      audioRef.current.currentTime = time;
    }
  };

  const formatTime = (time: number) => {
    const minutes = Math.floor(time / 60);
    const seconds = Math.floor(time % 60);
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  };

  return (
    <div className="gaming-radio" style={{
      background: "rgba(0,0,0,0.6)",
      borderRadius: "1.5rem",
      padding: "1.5rem",
      border: `1px solid ${station.color}44`,
      boxShadow: isPlaying ? `0 10px 30px -10px ${station.color}33` : "none",
      transition: "all 0.4s cubic-bezier(0.4, 0, 0.2, 1)",
      position: "relative",
      overflow: "hidden"
    }}>
      {/* Background Glow */}
      <div style={{
        position: "absolute",
        top: "-50%",
        right: "-20%",
        width: "150px",
        height: "150px",
        background: station.color,
        filter: "blur(60px)",
        opacity: isPlaying ? 0.15 : 0.05,
        zIndex: 0,
        transition: "all 1s ease"
      }}></div>

      <audio 
        ref={audioRef} 
        src={station.url} 
        onEnded={nextStation}
        onPlay={() => setIsPlaying(true)}
        onPause={() => setIsPlaying(false)}
        onTimeUpdate={handleTimeUpdate}
        onLoadedMetadata={handleLoadedMetadata}
      />

      <div style={{ display: "flex", alignItems: "center", gap: "1.5rem", position: "relative", zIndex: 1 }}>
        {/* Animated Visualizer Circle */}
        <div style={{ 
          width: "68px", 
          height: "68px", 
          borderRadius: "50%", 
          background: `conic-gradient(from 0deg, ${station.color}, transparent)`,
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          position: "relative",
          animation: isPlaying ? "rotate 3s linear infinite" : "none",
          boxShadow: isPlaying ? `0 0 25px ${station.color}44` : "none",
          transition: "all 0.3s ease"
        }}>
          <div style={{ 
            width: "58px", 
            height: "58px", 
            borderRadius: "50%", 
            background: "#0d0d12",
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            zIndex: 1
          }}>
             <span style={{ fontSize: "1.75rem", filter: isPlaying ? "none" : "grayscale(100%) opacity(0.5)" }}>
               {isPlaying ? "🎵" : "💤"}
             </span>
          </div>
        </div>

        {/* Info */}
        <div style={{ flex: 1 }}>
          <div style={{ 
            fontSize: "1.2rem", 
            fontWeight: 800, 
            color: station.color,
            textShadow: isPlaying ? `0 0 15px ${station.color}66` : "none",
            letterSpacing: "0.5px"
          }}>
            {station.name}
          </div>
          <div className="muted" style={{ fontSize: "0.8rem", marginTop: "0.2rem", opacity: 0.7 }}>
            {station.description}
          </div>
        </div>

        {/* Controls */}
        <div style={{ display: "flex", gap: "0.75rem", alignItems: "center" }}>
          <button 
            onClick={togglePlay}
            style={{
              background: `${station.color}11`,
              border: `1px solid ${station.color}33`,
              color: "white",
              fontSize: "1.5rem",
              width: "48px",
              height: "48px",
              borderRadius: "14px",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              transition: "all 0.2s"
            }}
            className="interactive-scale"
          >
            {isPlaying ? "⏸" : "▶️"}
          </button>
          <button 
            onClick={nextStation}
            style={{
              background: "none",
              border: "none",
              color: "white",
              fontSize: "1.5rem",
              cursor: "pointer",
              opacity: 0.6,
              transition: "opacity 0.2s"
            }}
            onMouseOver={(e) => e.currentTarget.style.opacity = "1"}
            onMouseOut={(e) => e.currentTarget.style.opacity = "0.6"}
            className="interactive-scale"
          >
            ⏭
          </button>
        </div>
      </div>

      {/* Progress Bar & Timer */}
      <div style={{ marginTop: "1.5rem", position: "relative", zIndex: 1 }}>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.7rem", color: "var(--text-muted)", marginBottom: "0.5rem", fontWeight: 600 }}>
          <span>{formatTime(currentTime)}</span>
          <span>{formatTime(duration)}</span>
        </div>
        <input 
          type="range" 
          min="0" 
          max={duration || 100} 
          value={currentTime} 
          onChange={handleSeek}
          style={{
            width: "100%",
            height: "4px",
            appearance: "none",
            background: `linear-gradient(to right, ${station.color} ${ (currentTime / (duration || 1)) * 100 }%, rgba(255,255,255,0.05) 0%)`,
            borderRadius: "2px",
            outline: "none",
            cursor: "pointer"
          }}
          className="radio-progress-slider"
        />
      </div>

      <div style={{ marginTop: "1.25rem", display: "flex", alignItems: "center", gap: "1rem", position: "relative", zIndex: 1 }}>
        <span style={{ fontSize: "0.65rem", fontWeight: 800, color: "var(--text-muted)" }}>VOL</span>
        <input 
          type="range" 
          min="0" 
          max="1" 
          step="0.05" 
          value={volume} 
          onChange={(e) => setVolume(parseFloat(e.target.value))}
          style={{
            flex: 1,
            height: "3px",
            appearance: "none",
            background: `linear-gradient(to right, white ${volume * 100}%, rgba(255,255,255,0.05) 0%)`,
            borderRadius: "2px",
            outline: "none"
          }}
          className="radio-volume-slider"
        />
      </div>

      <style jsx>{`
        input[type="range"]::-webkit-slider-thumb {
          appearance: none;
          width: 0;
          height: 0;
        }
        .gaming-radio:hover .radio-progress-slider::-webkit-slider-thumb,
        .gaming-radio:hover .radio-volume-slider::-webkit-slider-thumb {
          width: 12px;
          height: 12px;
          background: white;
          border-radius: 50%;
          border: 2px solid ${station.color};
        }
        @keyframes rotate {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}
