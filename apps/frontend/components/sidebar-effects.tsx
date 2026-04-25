"use client";

import { useEffect, useRef, useState } from "react";

// Generate random box-shadow for stars
const generateStars = (count: number, color = "#FFF", glow = false) => {
  let value = "";
  for (let i = 0; i < count; i++) {
    const x = Math.floor(Math.random() * 320);
    const y = Math.floor(Math.random() * 2000);
    const blur = glow ? Math.floor(Math.random() * 4 + 1) : 0;
    value += `${x}px ${y}px ${blur ? blur + 'px ' : ''}${color}${i === count - 1 ? "" : ", "}`;
  }
  return value;
};

export function SidebarEffects() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [stars1, setStars1] = useState("");
  const [stars2, setStars2] = useState("");
  const [stars3, setStars3] = useState("");

  useEffect(() => {
    // Generate star maps once on mount
    setStars1(generateStars(120, "#FFF"));
    setStars2(generateStars(70, "#a5b4fc", true)); // slight violet
    setStars3(generateStars(30, "#67e8f9", true)); // slight cyan
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let animationId: number;
    let particles: any[] = [];

    const resize = () => {
      const parent = canvas.parentElement;
      if (parent) {
        canvas.width = parent.clientWidth;
        canvas.height = parent.clientHeight;
      }
    };

    window.addEventListener("resize", resize);
    resize(); // initial setup

    class Particle {
      x: number = 0;
      y: number = 0;
      size: number = 0;
      speedX: number = 0;
      speedY: number = 0;
      opacity: number = 0;
      isCy: boolean = false; // Is Cyan or Violet

      constructor() {
        this.reset(true);
      }

      reset(initial = false) {
        if (!canvas) return;
        this.x = initial ? Math.random() * canvas.width : -10;
        this.y = Math.random() * canvas.height;
        this.size = Math.random() * 2.5 + 0.5;
        this.speedX = Math.random() * 2 + 0.5;
        this.speedY = (Math.random() - 0.5) * 0.8;
        this.opacity = Math.random() * 0.5 + 0.2;
        this.isCy = Math.random() > 0.5;
      }

      update() {
        if (!canvas) return;
        this.x += this.speedX;
        this.y += this.speedY;

        if (this.x > canvas.width + 10 || this.y < -10 || this.y > canvas.height + 10) {
          this.reset();
        }
      }

      draw() {
        if (!ctx) return;
        // Vibrant particles for light mode
        const color = this.isCy ? `rgba(6, 182, 212, ${this.opacity})` : `rgba(139, 92, 246, ${this.opacity})`;
        
        ctx.shadowBlur = 8;
        ctx.shadowColor = color;
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
        ctx.fill();
        
        // Reset shadow for performance
        ctx.shadowBlur = 0;
      }
    }

    for (let i = 0; i < 60; i++) {
      particles.push(new Particle());
    }

    const animate = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      
      // We process animation every frame but light-mode handles visibility via css
      particles.forEach(p => {
        p.update();
        p.draw();
      });

      animationId = requestAnimationFrame(animate);
    };

    animate();

    return () => {
      window.removeEventListener("resize", resize);
      cancelAnimationFrame(animationId);
    };
  }, []);

  return (
    <div className="sidebar-effects-container">
      {/* Dark Mode: Galaxy Stars */}
      <div className="sidebar-galaxy">
        <div className="sidebar-star-layer" style={{ width: '1px', height: '1px', boxShadow: stars1, animation: 'starMoveSidebar 80s linear infinite' }}></div>
        <div className="sidebar-star-layer" style={{ width: '2px', height: '2px', boxShadow: stars2, opacity: 0.6, animation: 'starMoveSidebar 120s linear infinite' }}></div>
        <div className="sidebar-star-layer" style={{ width: '3px', height: '3px', boxShadow: stars3, opacity: 0.8, animation: 'starMoveSidebar 160s linear infinite' }}></div>
      </div>
      
      {/* Light Mode: Wind & Dust */}
      <canvas ref={canvasRef} className="sidebar-dust"></canvas>
    </div>
  );
}
