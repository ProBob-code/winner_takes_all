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
        // Fallback for autoplay block
      });
    }
    setIsPlaying(!isPlaying);
  };

  const nextStation = () => {
    setCurrentStation((prev) => (prev + 1) % STATIONS.length);
    setIsPlaying(false);
  };

  return (
    <div className="gaming-radio" style={{
      background: "rgba(0,0,0,0.4)",
      borderRadius: "1.25rem",
      padding: "1.5rem",
      border: `1px solid ${station.color}33`,
      transition: "all 0.4s ease"
    }}>
      <audio 
        ref={audioRef} 
        src={station.url} 
        onEnded={nextStation}
        onPlay={() => setIsPlaying(true)}
        onPause={() => setIsPlaying(false)}
      />

      <div style={{ display: "flex", alignItems: "center", gap: "1.5rem" }}>
        {/* Animated Visualizer Circle */}
        <div style={{ 
          width: "64px", 
          height: "64px", 
          borderRadius: "50%", 
          background: `conic-gradient(from 0deg, ${station.color}, transparent)`,
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          position: "relative",
          animation: isPlaying ? "rotate 3s linear infinite" : "none",
          boxShadow: isPlaying ? `0 0 20px ${station.color}66` : "none"
        }}>
          <div style={{ 
            width: "54px", 
            height: "54px", 
            borderRadius: "50%", 
            background: "#0a0a0f",
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            zIndex: 1
          }}>
             <span style={{ fontSize: "1.5rem" }}>{isPlaying ? "📻" : "💤"}</span>
          </div>
        </div>

        {/* Info */}
        <div style={{ flex: 1 }}>
          <div style={{ 
            fontSize: "1.1rem", 
            fontWeight: 700, 
            color: station.color,
            textShadow: `0 0 10px ${station.color}44` 
          }}>
            {station.name}
          </div>
          <div className="muted" style={{ fontSize: "0.85rem", marginTop: "0.2rem" }}>
            {station.description}
          </div>
        </div>

        {/* Controls */}
        <div style={{ display: "flex", gap: "1rem", alignItems: "center" }}>
          <button 
            onClick={togglePlay}
            style={{
              background: "none",
              border: "none",
              color: "white",
              fontSize: "2rem",
              cursor: "pointer",
              transition: "transform 0.2s"
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
              opacity: 0.7
            }}
            className="interactive-scale"
          >
            ⏭
          </button>
        </div>
      </div>

      <div style={{ marginTop: "1.5rem", display: "flex", alignItems: "center", gap: "1rem" }}>
        <span style={{ fontSize: "0.8rem", opacity: 0.5 }}>VOL</span>
        <input 
          type="range" 
          min="0" 
          max="1" 
          step="0.05" 
          value={volume} 
          onChange={(e) => setVolume(parseFloat(e.target.value))}
          style={{
            flex: 1,
            height: "4px",
            appearance: "none",
            background: "rgba(255,255,255,0.1)",
            borderRadius: "2px"
          }}
        />
      </div>
    </div>
  );
}
