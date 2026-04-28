"use client";

import React from "react";

interface ConfirmModalProps {
  isOpen: boolean;
  title: string;
  message: string;
  onConfirm: () => void;
  onCancel: () => void;
  confirmText?: string;
  cancelText?: string;
  isDanger?: boolean;
}

export function ConfirmModal({
  isOpen,
  title,
  message,
  onConfirm,
  onCancel,
  confirmText = "Confirm",
  cancelText = "Cancel",
  isDanger = false
}: ConfirmModalProps) {
  if (!isOpen) return null;

  return (
    <div 
      className="payment-overlay" 
      onClick={onCancel} 
      style={{ 
        backdropFilter: "blur(12px)", 
        zIndex: 2100,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "1rem",
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        animation: "fadeIn 0.3s ease"
      }}
    >
      <div 
        className="payment-modal-v2 scale-in" 
        onClick={e => e.stopPropagation()} 
        style={{ 
          position: "relative", 
          overflow: "hidden", 
          width: "100%",
          maxWidth: "400px",
          padding: "2.5rem 2rem",
          textAlign: "center",
          background: "var(--bg-topbar)",
          border: "1px solid var(--glass-border-color-hover)",
          borderRadius: "24px",
          boxShadow: "var(--shadow-lg), var(--shadow-glow)"
        }}
      >
        {/* Subtle Gradient Glow */}
        <div style={{ position: "absolute", top: "-50px", left: "-50px", width: "200px", height: "200px", background: isDanger ? "var(--red)" : "var(--accent)", filter: "blur(80px)", opacity: 0.15, zIndex: 0 }}></div>
        
        <div style={{ position: "relative", zIndex: 1 }}>
          <div style={{ fontSize: "3rem", marginBottom: "1rem" }}>
            {isDanger ? "⚠️" : "❓"}
          </div>
          <h3 style={{ fontSize: "1.75rem", fontWeight: 800, marginBottom: "0.75rem", color: "var(--text-primary)" }}>{title}</h3>
          <p style={{ marginBottom: "2rem", color: "var(--text-secondary)", fontSize: "1rem", lineHeight: 1.5 }}>{message}</p>
          
          <div style={{ display: "flex", gap: "1rem" }}>
            <button 
              onClick={onCancel}
              className="button-secondary"
              style={{ flex: 1, borderRadius: "12px", padding: "0.8rem" }}
            >
              {cancelText}
            </button>
            <button 
              onClick={onConfirm}
              className="button"
              style={{ 
                flex: 1, 
                borderRadius: "12px",
                padding: "0.8rem",
                background: isDanger ? "var(--red)" : "var(--gradient-primary)",
                boxShadow: isDanger ? "0 8px 24px rgba(255, 77, 77, 0.3)" : undefined,
                border: "none"
              }}
            >
              {confirmText}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
