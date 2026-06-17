import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Bot } from 'lucide-react';
import Assistant3D from './AIAssistant/Assistant3D';
import EvidenceAssistant, { AssistantChartData } from './EvidenceAssistant';

interface FloatingEvidenceAssistantProps {
  onSendMessage: (text: string) => Promise<{ answer: string; followUps: string[]; chart: AssistantChartData | null }>;
  hidden?: boolean;
}

export default function FloatingEvidenceAssistant({ onSendMessage, hidden }: FloatingEvidenceAssistantProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isHovered, setIsHovered] = useState(false);

  if (hidden) return null;

  return (
    <div className="fixed bottom-6 right-6 z-[100] flex flex-col items-end">
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.95 }}
            transition={{ duration: 0.2 }}
            className="mb-4 bg-white rounded-2xl shadow-2xl border border-neutral-200 overflow-hidden flex flex-col pointer-events-auto"
            style={{ width: '400px', height: '600px', maxHeight: 'calc(100vh - 120px)' }}
          >
            {/* Header */}
            <div className="bg-black text-white px-4 py-3 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2">
                <Bot className="w-4 h-4 text-cyan-400" />
                <span className="font-bold text-sm tracking-tight">Evidence AI</span>
                <span className="text-[9px] font-mono bg-neutral-800 text-neutral-300 px-1.5 py-0.5 rounded tracking-widest uppercase ml-1">Live</span>
              </div>
              <button 
                onClick={() => setIsOpen(false)}
                className="text-neutral-400 hover:text-white transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            
            {/* Chat Body */}
            <div className="flex-1 min-h-0 bg-neutral-50 relative">
              <EvidenceAssistant 
                compact={true} 
                onSendMessage={onSendMessage} 
              />
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <button
        onClick={() => setIsOpen(!isOpen)}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        className="relative group focus:outline-none pointer-events-auto flex items-center justify-center transition-transform hover:scale-105"
        style={{ width: '80px', height: '80px' }}
      >
        {/* Glow backdrop behind the 3D canvas */}
        <div className={`absolute inset-0 bg-cyan-500/20 blur-xl rounded-full transition-opacity duration-300 ${isHovered || isOpen ? 'opacity-100' : 'opacity-0'}`} />
        
        {/* The 3D hologram Canvas */}
        <div className="w-full h-full relative z-10">
          <Assistant3D isHovered={isHovered || isOpen} />
        </div>

        {/* Hover Tooltip when closed */}
        {!isOpen && (
          <div className="absolute right-full mr-4 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none whitespace-nowrap">
            <div className="bg-neutral-900 text-white text-xs font-bold px-3 py-1.5 rounded-lg shadow-lg flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse" />
              Ask Evidence AI
            </div>
          </div>
        )}
      </button>
    </div>
  );
}
