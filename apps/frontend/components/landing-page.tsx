"use client";

import React, { useEffect, useRef } from "react";
import Link from "next/link";

export function LandingPage() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const glowRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let particles: any[] = [];

    function resize() {
      if (!canvas) return;
      const parent = canvas.parentElement;
      if (parent) {
        canvas.width = parent.clientWidth;
        canvas.height = parent.clientHeight;
      } else {
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;
      }
    }
    window.addEventListener("resize", resize);
    resize();

    class Particle {
      x: number = 0;
      y: number = 0;
      size: number = 0;
      speedX: number = 0;
      speedY: number = 0;
      opacity: number = 0;

      constructor() {
        this.reset();
      }
      reset() {
        if (!canvas) return;
        this.x = Math.random() * canvas.width;
        this.y = Math.random() * canvas.height;
        this.size = Math.random() * 2;
        this.speedX = (Math.random() - 0.5) * 0.5;
        this.speedY = (Math.random() - 0.5) * 0.5;
        this.opacity = Math.random();
      }
      update() {
        if (!canvas) return;
        this.x += this.speedX;
        this.y += this.speedY;
        if (this.x < 0 || this.x > canvas.width || this.y < 0 || this.y > canvas.height) {
          this.reset();
        }
      }
      draw() {
        if (!ctx) return;
        ctx.fillStyle = `rgba(255, 255, 255, ${this.opacity * 0.5})`;
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    for (let i = 0; i < 150; i++) {
      particles.push(new Particle());
    }

    let animationFrameId: number;
    function animate() {
      if (!ctx || !canvas) return;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      particles.forEach((p) => {
        p.update();
        p.draw();
      });
      animationFrameId = requestAnimationFrame(animate);
    }
    animate();

    const handleMouseMove = (e: MouseEvent) => {
      if (glowRef.current) {
        glowRef.current.style.opacity = "1";
        glowRef.current.style.left = e.clientX + "px";
        glowRef.current.style.top = e.clientY + "px";
      }

      const stars1 = document.querySelector(".stars-1") as HTMLElement;
      const stars2 = document.querySelector(".stars-2") as HTMLElement;
      if (stars1 && stars2) {
        const moveX = (e.clientX - window.innerWidth / 2) * 0.01;
        const moveY = (e.clientY - window.innerHeight / 2) * 0.01;
        stars1.style.transform = `translate(${moveX}px, ${moveY}px)`;
        stars2.style.transform = `translate(${moveX * 1.5}px, ${moveY * 1.5}px)`;
      }
    };

    document.addEventListener("mousemove", handleMouseMove);

    const observerOptions = { threshold: 0.15 };
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add("active");
        }
      });
    }, observerOptions);

    document.querySelectorAll(".reveal").forEach((el) => observer.observe(el));

    const cards = document.querySelectorAll(".card-3d");
    cards.forEach((card: any) => {
      const handleCardMove = (e: MouseEvent) => {
        const rect = card.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        const centerX = rect.width / 2;
        const centerY = rect.height / 2;
        const rotateX = (y - centerY) / 20;
        const rotateY = (centerX - x) / 20;
        card.style.transform = `translateY(-15px) rotateX(${rotateX}deg) rotateY(${rotateY}deg)`;
        const moveX = (x / rect.width) * 100;
        const moveY = (y / rect.height) * 100;
        card.style.backgroundImage = `radial-gradient(circle at ${moveX}% ${moveY}%, rgba(255,255,255,0.08), transparent 50%), linear-gradient(145deg, rgba(255,255,255,0.05), rgba(255,255,255,0.02))`;
      };
      const handleCardLeave = () => {
        card.style.transform = "translateY(0) rotateX(0) rotateY(0)";
        card.style.backgroundImage = "linear-gradient(145deg, rgba(255,255,255,0.05), rgba(255,255,255,0.02))";
      };
      card.addEventListener("mousemove", handleCardMove);
      card.addEventListener("mouseleave", handleCardLeave);
    });

    const generateStars = (count: number, width: number, height: number) => {
      let value = "";
      for (let i = 0; i < count; i++) {
        const x = Math.floor(Math.random() * width);
        const y = Math.floor(Math.random() * height);
        const opacity = Math.random() * 0.8 + 0.2;
        const size = Math.random() * 2 + 1;
        value += `${x}px ${y}px ${size}px rgba(255, 255, 255, ${opacity})${i === count - 1 ? "" : ", "}`;
      }
      return value;
    };

    const stars1 = document.querySelector(".stars-1") as HTMLElement;
    const stars2 = document.querySelector(".stars-2") as HTMLElement;
    if (stars1) stars1.style.boxShadow = generateStars(400, window.innerWidth * 2, 2000);
    if (stars2) stars2.style.boxShadow = generateStars(200, window.innerWidth * 2, 2000);

    return () => {
      window.removeEventListener("resize", resize);
      document.removeEventListener("mousemove", handleMouseMove);
      cancelAnimationFrame(animationFrameId);
    };
  }, []);

  return (
    <div className="landing-wrapper" style={{ color: "#f8fafc", minHeight: "100vh", position: "relative", overflowX: "hidden", background: "#030014" }}>
      <style jsx global>{`
        :root {
          --bg-deep: #080512;
          --accent-primary: #8b5cf6;
          --accent-secondary: #06b6d4;
          --accent-glow: rgba(139, 92, 246, 0.4);
          --glass-bg: rgba(255, 255, 255, 0.03);
          --glass-border: rgba(255, 255, 255, 0.08);
          --text-main: #f8fafc;
          --text-muted: #94a3b8;
        }

        .landing-bg-glow {
          position: absolute;
          top: 0; left: 0; width: 100%; height: 100%;
          background: radial-gradient(circle at 15% 50%, rgba(139, 92, 246, 0.15), transparent 40%),
                      radial-gradient(circle at 85% 30%, rgba(6, 182, 212, 0.15), transparent 40%),
                      radial-gradient(circle at 50% 50%, rgba(8, 5, 25, 1), #030014);
          filter: blur(80px);
          opacity: 0.6;
          z-index: 0;
          pointer-events: none;
        }

        .landing-stars-container {
          position: absolute; top: 0; left: 0; width: 100%; height: 100%;
          z-index: 1; overflow: hidden;
        }

        .star-layer { position: absolute; top: 0; left: 0; width: 200%; height: 200%; }
        .stars-1 {
          box-shadow: 156px 421px #FFF, 1205px 123px #FFF, 456px 892px #FFF, 1782px 345px #FFF, 567px 1234px #FFF;
          animation: starMove 100s linear infinite;
        }
        .stars-2 {
          box-shadow: 345px 123px #FFF, 901px 876px #FFF, 1234px 234px #FFF;
          opacity: 0.5; animation: starMove 150s linear infinite;
        }

        @keyframes starMove { from { transform: translateY(0); } to { transform: translateY(-1000px); } }

        .reveal { opacity: 0; transform: translateY(30px); transition: all 0.8s cubic-bezier(0.16, 1, 0.3, 1); }
        .reveal.active { opacity: 1; transform: translateY(0); }

        .gradient-text {
          background: linear-gradient(135deg, #8b5cf6, #06b6d4, #8b5cf6);
          background-size: 200% auto;
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          animation: gradientFlow 4s linear infinite;
        }
        @keyframes gradientFlow { to { background-position: 200% center; } }

        .card-3d {
          background: linear-gradient(145deg, rgba(255,255,255,0.05), rgba(255,255,255,0.02));
          border: 1px solid var(--glass-border);
          border-radius: 32px;
          backdrop-filter: blur(20px);
          transition: all 0.5s cubic-bezier(0.16, 1, 0.3, 1);
        }

        @media (max-width: 768px) {
          .landing-main { padding: 80px 1.5rem 40px !important; }
          .hero-buttons { flex-direction: column; width: 100%; gap: 1rem !important; }
          .hero-buttons a { width: 100%; text-align: center; padding: 1rem !important; }
          .hero-chip { margin-bottom: 1.5rem !important; font-size: 0.75rem !important; }
          .hero-title { margin-bottom: 1.5rem !important; }
          .hero-desc { font-size: 1rem !important; margin-bottom: 2.5rem !important; }
        }
      `}</style>

      <div className="landing-stars-container">
        <div className="star-layer stars-1"></div>
        <div className="star-layer stars-2"></div>
      </div>
      <canvas ref={canvasRef} id="sprinkles" style={{ position: "absolute", top: 0, left: 0, width: "100%", height: "100%", zIndex: 1, pointerEvents: "none" }}></canvas>
      <div className="landing-bg-glow"></div>
      <div ref={glowRef} className="mouse-glow" style={{ position: "fixed", width: "600px", height: "600px", background: "radial-gradient(circle, rgba(139, 92, 246, 0.08), transparent 70%)", borderRadius: "50%", pointerEvents: "none", zIndex: 999, transform: "translate(-50%, -50%)", opacity: 0 }}></div>

      <main className="landing-main" style={{ padding: "120px 6% 60px", textAlign: "center", position: "relative", zIndex: 2 }}>
        <section className="hero" style={{ minHeight: "80vh", display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center" }}>
          <div className="hero-chip" style={{ background: "rgba(139, 92, 246, 0.1)", border: "1px solid rgba(139, 92, 246, 0.2)", padding: "8px 16px", borderRadius: "9999px", fontSize: "0.85rem", fontWeight: 700, color: "#8b5cf6", marginBottom: "2rem" }}>Professional Tournament Infrastructure</div>
          <h1 className="hero-title" style={{ fontSize: "clamp(3rem, 8vw, 6rem)", fontWeight: 900, lineHeight: 0.9, letterSpacing: "-2px", marginBottom: "2.5rem" }}>
            POWERING GLOBAL.<br />
            <span className="gradient-text">ESPORTS EVENTS.</span>
          </h1>
          <p className="hero-desc" style={{ maxWidth: "700px", fontSize: "1.2rem", color: "#94a3b8", marginBottom: "3.5rem", lineHeight: 1.6 }}>The comprehensive SaaS platform for esports organizers, communities, and competitive events. Manage brackets, schedules, and tournament operations with professional-grade tools.</p>
          <div className="hero-buttons" style={{ display: "flex", gap: "1.5rem" }}>
            <Link href="/tournaments" style={{ background: "linear-gradient(135deg, #8b5cf6, #06b6d4)", color: "white", padding: "1.25rem 2.5rem", borderRadius: "16px", textDecoration: "none", fontWeight: 800, fontSize: "1.1rem" }}>EXPLORE PLATFORM →</Link>
            <Link href="#how-it-works" style={{ background: "rgba(255, 255, 255, 0.05)", border: "1px solid rgba(255, 255, 255, 0.1)", color: "white", padding: "1.25rem 2.5rem", borderRadius: "16px", textDecoration: "none", fontWeight: 800, fontSize: "1.1rem" }}>HOW IT WORKS</Link>
          </div>
        </section>

        <section id="how-it-works" className="section reveal" style={{ marginTop: "120px" }}>
            <h2 style={{ fontSize: "3rem", fontWeight: 800, marginBottom: "1rem" }}>EVENT LIFECYCLE</h2>
            <p className="muted" style={{ marginBottom: "4rem" }}>Three steps to professional event management.</p>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: "2.5rem", position: "relative" }}>
                <div className="card-3d" style={{ padding: "4rem 3rem", position: "relative", overflow: "hidden" }}>
                    <div style={{ position: "absolute", top: "-20px", right: "-10px", fontSize: "8rem", fontWeight: 900, opacity: 0.05, color: "white" }}>01</div>
                    <div style={{ background: "linear-gradient(135deg, #8b5cf6, #06b6d4)", width: "60px", height: "60px", borderRadius: "16px", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "1.5rem", marginBottom: "2rem", boxShadow: "0 0 20px rgba(139, 92, 246, 0.4)" }}>📊</div>
                    <h3 style={{ fontSize: "1.5rem", marginBottom: "1rem" }}>Configure Event</h3>
                    <p style={{ color: "#94a3b8", lineHeight: 1.6 }}>Organizers define rules, schedules, and participation parameters. Our infrastructure handles the complex backend orchestration.</p>
                </div>
                <div className="card-3d" style={{ padding: "4rem 3rem", position: "relative", overflow: "hidden" }}>
                    <div style={{ position: "absolute", top: "-20px", right: "-10px", fontSize: "8rem", fontWeight: 900, opacity: 0.05, color: "white" }}>02</div>
                    <div style={{ background: "linear-gradient(135deg, #f59e0b, #ef4444)", width: "60px", height: "60px", borderRadius: "16px", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "1.5rem", marginBottom: "2rem", boxShadow: "0 0 20px rgba(245, 158, 11, 0.4)" }}>🛡️</div>
                    <h3 style={{ fontSize: "1.5rem", marginBottom: "1rem" }}>Registration & Play</h3>
                    <p style={{ color: "#94a3b8", lineHeight: 1.6 }}>Participants register via secure participation fees. Real-time bracket management and automated score tracking begin.</p>
                </div>
                <div className="card-3d" style={{ padding: "4rem 3rem", position: "relative", overflow: "hidden" }}>
                    <div style={{ position: "absolute", top: "-20px", right: "-10px", fontSize: "8rem", fontWeight: 900, opacity: 0.05, color: "white" }}>03</div>
                    <div style={{ background: "linear-gradient(135deg, #10b981, #3b82f6)", width: "60px", height: "60px", borderRadius: "16px", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "1.5rem", marginBottom: "2rem", boxShadow: "0 0 20px rgba(16, 185, 129, 0.4)" }}>🏆</div>
                    <h3 style={{ fontSize: "1.5rem", marginBottom: "1rem" }}>Event Finalization</h3>
                    <p style={{ color: "#94a3b8", lineHeight: 1.6 }}>Validation of results and distribution of organizer-sponsored championship rewards based on verified performance.</p>
                </div>
            </div>
        </section>

        <section className="section reveal" style={{ marginTop: "120px" }}>
            <h2 style={{ fontSize: "3rem", fontWeight: 800, marginBottom: "4rem" }}>THE INFRASTRUCTURE EDGE</h2>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: "2rem" }}>
                <div className="card-3d" style={{ padding: "3rem" }}>
                    <div style={{ fontSize: "3rem", marginBottom: "1rem" }}>⚡</div>
                    <h3>Automated Orchestration</h3>
                    <p style={{ color: "#94a3b8" }}>Self-generating brackets and automated score validation.</p>
                </div>
                <div className="card-3d" style={{ padding: "3rem" }}>
                    <div style={{ fontSize: "3rem", marginBottom: "1rem" }}>💎</div>
                    <h3>Organizer Dashboard</h3>
                    <p style={{ color: "#94a3b8" }}>Comprehensive tools for community and event management.</p>
                </div>
                <div className="card-3d" style={{ padding: "3rem" }}>
                    <div style={{ fontSize: "3rem", marginBottom: "1rem" }}>🛡️</div>
                    <h3>Secure Settlement</h3>
                    <p style={{ color: "#94a3b8" }}>Automated reward distribution and participation verification.</p>
                </div>
            </div>
        </section>
      </main>

      <footer style={{ padding: "60px 6%", textAlign: "center", borderTop: "1px solid rgba(255,255,255,0.08)", fontSize: "0.85rem" }}>
        <div style={{ display: "flex", justifyContent: "center", flexWrap: "wrap", gap: "1.5rem", marginBottom: "2rem", color: "rgba(255,255,255,0.5)" }}>
          <Link href="/about" style={{ color: "inherit", textDecoration: "none" }}>About Us</Link>
          <Link href="/contact" style={{ color: "inherit", textDecoration: "none" }}>Contact Us</Link>
          <Link href="/terms" style={{ color: "inherit", textDecoration: "none" }}>Terms & Conditions</Link>
          <Link href="/privacy" style={{ color: "inherit", textDecoration: "none" }}>Privacy Policy</Link>
          <Link href="/refund" style={{ color: "inherit", textDecoration: "none" }}>Refund & Cancellation</Link>
          <Link href="/community-guidelines" style={{ color: "inherit", textDecoration: "none" }}>Community Guidelines</Link>
          <Link href="/skill-based-policy" style={{ color: "inherit", textDecoration: "none" }}>Skill-Based Policy</Link>
        </div>
        <p style={{ color: "rgba(255,255,255,0.3)", maxWidth: "800px", margin: "0 auto 2rem", lineHeight: 1.6 }}>
          WTA Arena is a professional tournament infrastructure platform. We provide software tools for esports organizers to host and manage community events. 
          WTA Arena does not facilitate betting or games of chance. Tournament outcomes are determined solely by player skill and organizer-defined rules. 
          Participants pay a participation fee to cover event operations and platform infrastructure.
        </p>
        <p style={{ color: "rgba(255,255,255,0.2)" }}>&copy; 2026 WTA ARENA PLATFORM. All rights reserved.</p>
      </footer>
    </div>
  );
}
