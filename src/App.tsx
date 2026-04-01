/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Upload, Play, User, ChevronRight, RotateCcw, Mic, MicOff, Volume2 } from 'lucide-react';
import { AppState, ScriptLine } from './types';
import { parseScript } from './services/geminiService';
import mammoth from 'mammoth';

export default function App() {
  const [state, setState] = useState<AppState>('upload');
  const [script, setScript] = useState<ScriptLine[]>([]);
  const [characters, setCharacters] = useState<string[]>([]);
  const [userCharacters, setUserCharacters] = useState<string[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isReading, setIsReading] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [isVoiceMode, setIsVoiceMode] = useState(false);
  const recognitionRef = useRef<any>(null);

  // Simulated progress timer
  useEffect(() => {
    let interval: any;
    if (isLoading) {
      setProgress(0);
      interval = setInterval(() => {
        setProgress(prev => {
          if (prev < 30) return prev + 5;
          if (prev < 70) return prev + 2;
          if (prev < 95) return prev + 0.5;
          return prev;
        });
      }, 200);
    } else {
      setProgress(0);
    }
    return () => clearInterval(interval);
  }, [isLoading]);

  // Initialize Speech Recognition
  useEffect(() => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (SpeechRecognition) {
      recognitionRef.current = new SpeechRecognition();
      recognitionRef.current.continuous = true;
      recognitionRef.current.interimResults = false;
      recognitionRef.current.lang = 'en-US'; // Default, could be dynamic

      recognitionRef.current.onresult = (event: any) => {
        const last = event.results.length - 1;
        const text = event.results[last][0].transcript;
        console.log('Recognized:', text);
        
        // If it's the user's turn, advance on any detected speech (simple heuristic)
        if (state === 'rehearsal' && userCharacters.includes(script[currentIndex]?.character)) {
          nextLine();
        }
      };
    }
  }, [state, currentIndex, script, userCharacters]);

  useEffect(() => {
    if (isVoiceMode && recognitionRef.current) {
      recognitionRef.current.start();
    } else if (recognitionRef.current) {
      recognitionRef.current.stop();
    }
    return () => recognitionRef.current?.stop();
  }, [isVoiceMode]);

  const scrollRef = useRef<HTMLDivElement>(null);

  // Extract unique characters when script is loaded
  useEffect(() => {
    if (script.length > 0) {
      const chars = Array.from(new Set(script.map(line => line.character))).filter(c => c !== 'STAGE');
      setCharacters(chars);
    }
  }, [script]);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsLoading(true);
    
    try {
      let text = "";
      if (file.name.endsWith('.docx')) {
        const arrayBuffer = await file.arrayBuffer();
        const result = await mammoth.extractRawText({ arrayBuffer });
        text = result.value;
      } else {
        text = await file.text();
      }

      if (!text.trim()) {
        throw new Error("The file is empty.");
      }

      const parsed = await parseScript(text);
      setScript(parsed);
      setState('setup');
    } catch (error) {
      console.error("File processing error:", error);
      alert("Failed to process script. Please ensure it's a valid TXT or DOCX file.");
    } finally {
      setIsLoading(false);
    }
  };

  const startRehearsal = () => {
    if (userCharacters.length === 0) {
      alert("Please select at least one character.");
      return;
    }
    setState('rehearsal');
    setCurrentIndex(0);
  };

  const nextLine = () => {
    if (currentIndex < script.length - 1) {
      setCurrentIndex(prev => prev + 1);
    }
  };

  const resetRehearsal = () => {
    setCurrentIndex(0);
    window.speechSynthesis.cancel();
  };

  // Handle TTS and Auto-advance
  useEffect(() => {
    if (state !== 'rehearsal' || currentIndex >= script.length) return;

    const currentLine = script[currentIndex];
    
    // If it's a stage direction, skip it (or show it briefly)
    if (currentLine.isStageDirection) {
      // Auto-advance stage directions after a small delay
      const timer = setTimeout(() => nextLine(), 1500);
      return () => clearTimeout(timer);
    }

    // If it's NOT the user's character, read it aloud
    if (!userCharacters.includes(currentLine.character)) {
      setIsReading(true);
      const utterance = new SpeechSynthesisUtterance(currentLine.text);
      
      // Try to find a suitable voice
      const voices = window.speechSynthesis.getVoices();
      // Simple heuristic for different voices
      const charIndex = characters.indexOf(currentLine.character);
      if (voices.length > 0) {
        utterance.voice = voices[charIndex % voices.length];
      }

      utterance.onend = () => {
        setIsReading(false);
        nextLine();
      };

      window.speechSynthesis.speak(utterance);
    } else {
      // It's the user's turn. Wait for input.
      setIsReading(false);
    }

    return () => window.speechSynthesis.cancel();
  }, [currentIndex, state, script, userCharacters, characters]);

  // Handle Spacebar
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Space' && state === 'rehearsal') {
        e.preventDefault();
        const currentLine = script[currentIndex];
        if (userCharacters.includes(currentLine.character)) {
          nextLine();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [state, currentIndex, script, userCharacters]);

  // Scroll to active line
  useEffect(() => {
    const activeElement = document.getElementById(`line-${currentIndex}`);
    if (activeElement && scrollRef.current) {
      activeElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [currentIndex]);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-4 md:p-8">
      <AnimatePresence mode="wait">
        {state === 'upload' && (
          <motion.div
            key="upload"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="glass-card p-8 w-full max-w-md text-center"
          >
            <div className="w-20 h-20 bg-brand-blue rounded-full flex items-center justify-center mx-auto mb-6 shadow-inner">
              <Upload className={`text-white w-10 h-10 ${isLoading ? 'animate-bounce' : ''}`} />
            </div>
            <h1 className="text-3xl font-bold mb-2">Upload Script</h1>
            <p className="text-slate-500 mb-8">Let's get started. Upload your theater script (TXT or DOCX) to begin rehearsing.</p>
            
            {isLoading ? (
              <div className="space-y-4">
                <div className="w-full bg-slate-100 h-3 rounded-full overflow-hidden">
                  <motion.div 
                    className="h-full bg-brand-blue"
                    initial={{ width: 0 }}
                    animate={{ width: `${progress}%` }}
                    transition={{ ease: "linear" }}
                  />
                </div>
                <p className="text-sm font-medium text-brand-blue animate-pulse">
                  {progress < 30 ? "Reading file..." : progress < 70 ? "Analyzing characters..." : "Structuring script..."}
                </p>
              </div>
            ) : (
              <label className="btn-primary cursor-pointer inline-flex items-center gap-2">
                Choose File
                <input type="file" accept=".txt,.docx" className="hidden" onChange={handleFileUpload} disabled={isLoading} />
              </label>
            )}
          </motion.div>
        )}

        {state === 'setup' && (
          <motion.div
            key="setup"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 1.05 }}
            className="glass-card p-8 w-full max-w-2xl"
          >
            <h2 className="text-2xl font-bold mb-6 flex items-center gap-2">
              <User className="text-brand-purple" /> Select Your Character
            </h2>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-8">
              {characters.map(char => (
                <button
                  key={char}
                  onClick={() => {
                    setUserCharacters(prev => 
                      prev.includes(char) ? prev.filter(c => c !== char) : [...prev, char]
                    );
                  }}
                  className={`pill text-left border-2 ${
                    userCharacters.includes(char) 
                      ? 'bg-brand-purple border-brand-purple text-white shadow-lg' 
                      : 'bg-white border-slate-100 text-slate-600 hover:border-brand-purple/30'
                  }`}
                >
                  {char}
                </button>
              ))}
            </div>
            <div className="flex justify-between items-center">
              <button onClick={() => setState('upload')} className="text-slate-400 hover:text-slate-600 flex items-center gap-1">
                <RotateCcw size={18} /> Back
              </button>
              <button onClick={startRehearsal} className="btn-primary flex items-center gap-2">
                Start Rehearsal <ChevronRight size={20} />
              </button>
            </div>
          </motion.div>
        )}

        {state === 'rehearsal' && (
          <motion.div
            key="rehearsal"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="w-full max-w-4xl h-[80vh] flex flex-col gap-4"
          >
            <div className="flex justify-between items-center px-4">
              <div className="flex items-center gap-4">
                <button onClick={() => setState('setup')} className="p-2 hover:bg-white/50 rounded-full transition-colors">
                  <RotateCcw size={24} />
                </button>
                <h3 className="font-bold text-lg">Rehearsing: {userCharacters.join(', ')}</h3>
              </div>
              <div className="flex items-center gap-2">
                <button 
                  onClick={() => setIsVoiceMode(!isVoiceMode)}
                  className={`p-3 rounded-full transition-all ${isVoiceMode ? 'bg-brand-pink text-white shadow-lg' : 'bg-white text-slate-400'}`}
                  title="Voice Mode (Experimental)"
                >
                  {isVoiceMode ? <Mic size={20} /> : <MicOff size={20} />}
                </button>
              </div>
            </div>

            <div 
              ref={scrollRef}
              className="flex-1 glass-card overflow-y-auto p-6 md:p-12 space-y-8 scroll-smooth"
            >
              {script.map((line, idx) => {
                const isUser = userCharacters.includes(line.character);
                const isActive = idx === currentIndex;
                
                if (line.isStageDirection) {
                  return (
                    <div 
                      key={idx} 
                      id={`line-${idx}`}
                      className={`text-center italic text-slate-400 text-sm transition-all duration-500 ${isActive ? 'scale-110 text-brand-orange' : 'opacity-50'}`}
                    >
                      [{line.text}]
                    </div>
                  );
                }

                return (
                  <div
                    key={idx}
                    id={`line-${idx}`}
                    className={`flex flex-col gap-1 transition-all duration-500 ${
                      isActive ? 'scale-105 opacity-100' : 'opacity-30 blur-[1px]'
                    } ${isUser ? 'items-end' : 'items-start'}`}
                  >
                    <span className={`text-[10px] uppercase tracking-widest font-bold ${isUser ? 'text-brand-pink' : 'text-brand-blue'}`}>
                      {line.character}
                    </span>
                    <div className={`max-w-[80%] p-4 rounded-2xl text-lg md:text-xl font-medium ${
                      isActive 
                        ? (isUser ? 'bg-brand-pink text-white shadow-xl' : 'bg-brand-blue text-white shadow-xl')
                        : 'bg-white text-slate-700'
                    }`}>
                      {line.text}
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="flex justify-center p-4">
              {userCharacters.includes(script[currentIndex]?.character) && !script[currentIndex]?.isStageDirection ? (
                <motion.button
                  initial={{ scale: 0.9, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={nextLine}
                  className="w-full max-w-md py-6 bg-brand-pink text-white rounded-2xl shadow-2xl font-bold text-xl flex items-center justify-center gap-3"
                >
                  <Play fill="currentColor" /> TAP OR SPACE WHEN DONE
                </motion.button>
              ) : (
                <div className="flex items-center gap-3 text-slate-400 font-medium animate-pulse">
                  <Volume2 /> Listening to {script[currentIndex]?.character}...
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Background Decorations */}
      <div className="fixed inset-0 -z-10 overflow-hidden pointer-events-none">
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-brand-blue/20 rounded-full blur-3xl animate-pulse" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-brand-purple/20 rounded-full blur-3xl animate-pulse" style={{ animationDelay: '2s' }} />
        <div className="absolute top-[20%] right-[10%] w-[20%] h-[20%] bg-brand-pink/10 rounded-full blur-3xl" />
      </div>
    </div>
  );
}
