"use client";

import React, { useEffect, useRef } from "react";
import Link from "next/link";
import { HOME_FAQ } from "@/lib/home-faq";

export function LandingPage() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const glowRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // The canvas cannot read a CSS custom property, so the theme is read off
    // the root the same way the stylesheet reads it. Light is the default: the
    // stylesheet puts its light palette on bare :root.
    const isLight = document.documentElement.getAttribute("data-theme") !== "dark";

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
        // Warm specks on a pale page, white on the night sky. Hard-coded
        // white was invisible in light mode and the canvas just burned
        // frames drawing nothing.
        ctx.fillStyle = isLight
          ? `rgba(166, 124, 0, ${this.opacity * 0.35})`
          : `rgba(255, 255, 255, ${this.opacity * 0.5})`;
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
        card.style.backgroundImage = `radial-gradient(circle at ${moveX}% ${moveY}%, var(--landing-sheen), transparent 50%)`;
      };
      const handleCardLeave = () => {
        card.style.transform = "translateY(0) rotateX(0) rotateY(0)";
        card.style.backgroundImage = "none";
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
    <div className="landing-wrapper" style={{ minHeight: "100vh", position: "relative", overflowX: "hidden" }}>
      <style jsx global>{`
        /* These used to be written onto :root, from inside this component, for
           the whole application. --text-muted became a slate meant for a dark
           page and stayed that way on every other screen the user then opened,
           in both themes. They are scoped to the landing page now, and the two
           palettes are declared rather than assumed. */
        .landing-wrapper {
          --landing-bg: #faf8f3;
          --landing-ink: #1a1710;
          --landing-dim: #6b6354;
          --landing-card: rgba(255, 255, 255, 0.72);
          --landing-card-line: rgba(26, 23, 16, 0.1);
          --landing-sheen: rgba(166, 124, 0, 0.06);
          --accent-primary: var(--accent);
          --accent-secondary: var(--accent);
          --accent-glow: color-mix(in oklab, var(--accent) 40%, transparent);
        }

        [data-theme="dark"] .landing-wrapper {
          --landing-bg: #030014;
          --landing-ink: #f8fafc;
          --landing-dim: #94a3b8;
          --landing-card: rgba(255, 255, 255, 0.05);
          --landing-card-line: rgba(255, 255, 255, 0.08);
          --landing-sheen: rgba(255, 255, 255, 0.08);
        }

        .landing-wrapper { background: var(--landing-bg); color: var(--landing-ink); }
        .landing-wrapper .muted,
        .landing-wrapper .hero-desc,
        .landing-wrapper .landing-dim { color: var(--landing-dim); }

        .landing-bg-glow {
          position: absolute;
          top: 0; left: 0; width: 100%; height: 100%;
          background: radial-gradient(circle at 15% 45%, color-mix(in oklab, var(--accent) 18%, transparent), transparent 45%),
                      radial-gradient(circle at 85% 25%, rgba(220, 38, 38, 0.1), transparent 45%);
          filter: blur(80px);
          opacity: 0.75;
          z-index: 0;
          pointer-events: none;
        }

        [data-theme="dark"] .landing-bg-glow {
          background: radial-gradient(circle at 15% 50%, color-mix(in oklab, var(--accent) 15%, transparent), transparent 40%),
                      radial-gradient(circle at 85% 30%, rgba(220, 38, 38, 0.14), transparent 40%),
                      radial-gradient(circle at 50% 50%, rgba(8, 5, 25, 1), #030014);
          opacity: 0.6;
        }

        /* A field of white stars on a pearl-white page is a field of nothing.
           The night sky belongs to the night. */
        .landing-stars-container,
        .landing-wrapper #sprinkles { display: none; }

        [data-theme="dark"] .landing-stars-container {
          display: block;
          position: absolute; top: 0; left: 0; width: 100%; height: 100%;
          z-index: 1; overflow: hidden;
        }

        [data-theme="dark"] .landing-wrapper #sprinkles { display: block; }

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
          background: linear-gradient(135deg, var(--accent), var(--accent), var(--accent));
          background-size: 200% auto;
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          animation: gradientFlow 4s linear infinite;
        }
        @keyframes gradientFlow { to { background-position: 200% center; } }

        .card-3d {
          background: var(--landing-card);
          border: 1px solid var(--landing-card-line);
          border-radius: 32px;
          backdrop-filter: blur(20px);
          transition: all 0.5s cubic-bezier(0.16, 1, 0.3, 1);
        }

        /* On a pale page the card needs a shadow to lift off it; on the dark
           one it needs a hairline to separate from it. */
        .landing-wrapper .card-3d { box-shadow: 0 18px 50px rgba(26, 23, 16, 0.08); }
        [data-theme="dark"] .landing-wrapper .card-3d { box-shadow: none; }

        /* The big ghosted 01 / 02 / 03 behind each step. White at 5% is
           invisible on white. */
        .landing-step-number {
          position: absolute;
          top: -20px;
          right: -10px;
          font-size: 8rem;
          font-weight: 900;
          color: var(--landing-ink);
          opacity: 0.06;
          pointer-events: none;
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
      <div ref={glowRef} className="mouse-glow" style={{ position: "fixed", width: "600px", height: "600px", background: "radial-gradient(circle, color-mix(in oklab, var(--accent) 8%, transparent), transparent 70%)", borderRadius: "50%", pointerEvents: "none", zIndex: 999, transform: "translate(-50%, -50%)", opacity: 0 }}></div>

      <main className="landing-main" style={{ padding: "120px 6% 60px", textAlign: "center", position: "relative", zIndex: 2 }}>
        <section className="hero" style={{ minHeight: "80vh", display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center" }}>
          <div className="hero-chip" style={{ background: "color-mix(in oklab, var(--accent) 10%, transparent)", border: "1px solid color-mix(in oklab, var(--accent) 20%, transparent)", padding: "8px 16px", borderRadius: "9999px", fontSize: "0.85rem", fontWeight: 700, color: "var(--accent)", marginBottom: "2rem" }}>Tournament software for pool rooms, clubs and bars</div>
          <h1 className="hero-title" style={{ fontSize: "clamp(3rem, 8vw, 6rem)", fontWeight: 900, lineHeight: 0.9, letterSpacing: "-2px", marginBottom: "2.5rem" }}>
            RUN THE NIGHT.<br />
            <span className="gradient-text">CROWN THE WINNER.</span>
          </h1>
          <p className="hero-desc" style={{ maxWidth: "700px", fontSize: "1.2rem", marginBottom: "3.5rem", lineHeight: 1.6 }}>Brackets, scoring and a live table for 8-ball and football nights. Set up in a minute, scored from the phone in your hand, on the wall for the room to see — and in the group chat before the next frame is racked. Free to enter, always.</p>
          <div className="hero-buttons" style={{ display: "flex", gap: "1.5rem" }}>
            <Link href="/run" style={{ background: "var(--gradient-fill)", color: "var(--on-gold)", padding: "1.25rem 2.5rem", borderRadius: "16px", textDecoration: "none", fontWeight: 800, fontSize: "1.1rem" }}>START A NIGHT →</Link>
            <Link href="#how-it-works" style={{ background: "var(--landing-card)", border: "1px solid var(--landing-card-line)", color: "var(--landing-ink)", padding: "1.25rem 2.5rem", borderRadius: "16px", textDecoration: "none", fontWeight: 800, fontSize: "1.1rem" }}>SEE HOW IT RUNS</Link>
          </div>
        </section>

        <section id="how-it-works" className="section reveal" style={{ marginTop: "120px" }}>
            <h2 style={{ fontSize: "3rem", fontWeight: 800, marginBottom: "1rem" }}>HOW A NIGHT RUNS</h2>
            <p className="muted" style={{ marginBottom: "4rem" }}>Three steps, about a minute.</p>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(300px, 100%), 1fr))", gap: "2.5rem", position: "relative" }}>
                <div className="card-3d" style={{ padding: "4rem 3rem", position: "relative", overflow: "hidden" }}>
                    <div className="landing-step-number">01</div>
                    <div style={{ background: "linear-gradient(135deg, var(--accent), var(--accent))", width: "60px", height: "60px", borderRadius: "16px", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "1.5rem", marginBottom: "2rem", boxShadow: "0 0 20px color-mix(in oklab, var(--accent) 40%, transparent)" }}>📊</div>
                    <h3 style={{ fontSize: "1.5rem", marginBottom: "1rem" }}>Set it up</h3>
                    <p className="landing-dim" style={{ lineHeight: 1.6 }}>Pick the game, say how many are playing and how many frames each. Names are optional — anyone who turns up later scans the code on the screen.</p>
                </div>
                <div className="card-3d" style={{ padding: "4rem 3rem", position: "relative", overflow: "hidden" }}>
                    <div className="landing-step-number">02</div>
                    <div style={{ background: "linear-gradient(135deg, #f59e0b, #ef4444)", width: "60px", height: "60px", borderRadius: "16px", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "1.5rem", marginBottom: "2rem", boxShadow: "0 0 20px rgba(245, 158, 11, 0.4)" }}>🛡️</div>
                    <h3 style={{ fontSize: "1.5rem", marginBottom: "1rem" }}>Score it</h3>
                    <p className="landing-dim" style={{ lineHeight: 1.6 }}>Two big buttons on the phone in your hand. It keeps working with no signal and catches up when the wifi does, so the board never waits.</p>
                </div>
                <div className="card-3d" style={{ padding: "4rem 3rem", position: "relative", overflow: "hidden" }}>
                    <div className="landing-step-number">03</div>
                    <div style={{ background: "linear-gradient(135deg, var(--gold), var(--team-blue))", width: "60px", height: "60px", borderRadius: "16px", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "1.5rem", marginBottom: "2rem", boxShadow: "0 0 20px rgba(16, 185, 129, 0.4)" }}>🏆</div>
                    <h3 style={{ fontSize: "1.5rem", marginBottom: "1rem" }}>Show the room</h3>
                    <p className="landing-dim" style={{ lineHeight: 1.6 }}>The table updates on any spare screen as frames finish, and the whole night goes to the group chat in one tap.</p>
                </div>
            </div>
        </section>

        <section className="section reveal" style={{ marginTop: "120px" }}>
            <h2 style={{ fontSize: "3rem", fontWeight: 800, marginBottom: "4rem" }}>WHY IT HOLDS UP ON A FRIDAY</h2>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(300px, 100%), 1fr))", gap: "2rem" }}>
                <div className="card-3d" style={{ padding: "3rem" }}>
                    <div style={{ fontSize: "3rem", marginBottom: "1rem" }}>⚡</div>
                    <h3>Works with no signal</h3>
                    <p className="landing-dim">Every tap is saved on the phone first and sent when it can. The board never waits for the bar&apos;s wifi.</p>
                </div>
                <div className="card-3d" style={{ padding: "3rem" }}>
                    <div style={{ fontSize: "3rem", marginBottom: "1rem" }}>💎</div>
                    <h3>One screen for the room</h3>
                    <p className="landing-dim">Scores, the clock and the table on any spare screen, with a code a walk-in can scan to enter.</p>
                </div>
                <div className="card-3d" style={{ padding: "3rem" }}>
                    <div style={{ fontSize: "3rem", marginBottom: "1rem" }}>🛡️</div>
                    <h3>Nothing to settle</h3>
                    <p className="landing-dim">Players earn WTA coins for frames played and won. No entry fee, no pot, nothing to cash out.</p>
                </div>
            </div>
        </section>

        <section className="section reveal" style={{ marginTop: "120px" }}>
            <h2 style={{ fontSize: "3rem", fontWeight: 800, marginBottom: "1rem" }}>WHO RUNS A NIGHT ON IT</h2>
            <p className="muted" style={{ marginBottom: "4rem", maxWidth: "700px", marginLeft: "auto", marginRight: "auto", lineHeight: 1.6 }}>Any room with a table, a screen and a crowd that likes to win.</p>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(260px, 100%), 1fr))", gap: "2rem", textAlign: "left" }}>
                <div className="card-3d" style={{ padding: "2.5rem" }}>
                    <h3>Pool rooms</h3>
                    <p className="landing-dim" style={{ lineHeight: 1.6 }}>A weekly 8-ball knockout on your quietest night: eight players, best of one frame, finished in about two hours with the bracket on the wall the whole time.</p>
                </div>
                <div className="card-3d" style={{ padding: "2.5rem" }}>
                    <h3>Bars and pubs</h3>
                    <p className="landing-dim" style={{ lineHeight: 1.6 }}>A reason for regulars to arrive at eight and stay past ten. The prize is a bar tab, which comes back to your till, and the result lands in the group chat that night.</p>
                </div>
                <div className="card-3d" style={{ padding: "2.5rem" }}>
                    <h3>Clubs and societies</h3>
                    <p className="landing-dim" style={{ lineHeight: 1.6 }}>Run a series across several nights and the standings carry from one to the next, so a season ends with a champion everyone saw coming.</p>
                </div>
                <div className="card-3d" style={{ padding: "2.5rem" }}>
                    <h3>Gaming cafés</h3>
                    <p className="landing-dim" style={{ lineHeight: 1.6 }}>Football nights with a clock, a steady scoreboard and rankings that follow each player from one night to the next.</p>
                </div>
            </div>
        </section>

        <section id="faq" className="section reveal" style={{ marginTop: "120px" }}>
            <h2 style={{ fontSize: "3rem", fontWeight: 800, marginBottom: "4rem" }}>QUESTIONS HOSTS ASK</h2>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(420px, 100%), 1fr))", gap: "1.5rem", textAlign: "left", maxWidth: "1100px", margin: "0 auto" }}>
                {HOME_FAQ.map(({ q, a }) => (
                    <div key={q} className="card-3d" style={{ padding: "2rem 2.5rem" }}>
                        <h3 style={{ fontSize: "1.15rem", marginBottom: "0.75rem" }}>{q}</h3>
                        <p className="landing-dim" style={{ lineHeight: 1.6, margin: 0 }}>{a}</p>
                    </div>
                ))}
            </div>
            <div className="hero-buttons" style={{ display: "flex", gap: "1.5rem", justifyContent: "center", marginTop: "4rem" }}>
                <Link href="/run" style={{ background: "var(--gradient-fill)", color: "var(--on-gold)", padding: "1.25rem 2.5rem", borderRadius: "16px", textDecoration: "none", fontWeight: 800, fontSize: "1.1rem" }}>START A NIGHT →</Link>
                <Link href="/playbook" style={{ background: "var(--landing-card)", border: "1px solid var(--landing-card-line)", color: "var(--landing-ink)", padding: "1.25rem 2.5rem", borderRadius: "16px", textDecoration: "none", fontWeight: 800, fontSize: "1.1rem" }}>READ THE HOST PLAYBOOK</Link>
            </div>
        </section>
      </main>

    </div>
  );
}
