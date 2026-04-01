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
  const [isPaused, setIsPaused] = useState(false);
  const [playbackRate, setPlaybackRate] = useState(1.0);
  const [availableVoices, setAvailableVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [selectedVoiceURI, setSelectedVoiceURI] = useState<string>('');
  const [isLoading, setIsLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [isVoiceMode, setIsVoiceMode] = useState(false);
  const [savedScripts, setSavedScripts] = useState<{name: string, data: ScriptLine[], date: string}[]>([]);
  const recognitionRef = useRef<any>(null);

  // Load saved scripts from localStorage
  useEffect(() => {
    const saved = localStorage.getItem('rehearsal_scripts');
    if (saved) {
      try {
        setSavedScripts(JSON.parse(saved));
      } catch (e) {
        console.error("Errore nel caricamento dei copioni salvati", e);
      }
    }
  }, []);

  // Save script to localStorage when a new one is parsed
  const saveScript = (name: string, data: ScriptLine[]) => {
    const newSaved = [{ name, data, date: new Date().toLocaleDateString('it-IT') }, ...savedScripts].slice(0, 5);
    setSavedScripts(newSaved);
    localStorage.setItem('rehearsal_scripts', JSON.stringify(newSaved));
  };

  const deleteSavedScript = (index: number) => {
    const newSaved = savedScripts.filter((_, i) => i !== index);
    setSavedScripts(newSaved);
    localStorage.setItem('rehearsal_scripts', JSON.stringify(newSaved));
  };

  const loadSavedScript = (saved: {name: string, data: ScriptLine[]}) => {
    setScript(saved.data);
    setState('setup');
  };

  // Load voices
  useEffect(() => {
    const loadVoices = () => {
      const voices = window.speechSynthesis.getVoices();
      setAvailableVoices(voices);
      // Default to a "natural" sounding voice if possible
      const preferred = voices.find(v => v.name.includes('Google') || v.name.includes('Natural') || v.lang.includes('it-IT'));
      if (preferred && !selectedVoiceURI) {
        setSelectedVoiceURI(preferred.voiceURI);
      }
    };
    loadVoices();
    window.speechSynthesis.onvoiceschanged = loadVoices;
  }, [selectedVoiceURI]);

  // Simulated progress timer
  useEffect(() => {
    let interval: any;
    if (isLoading) {
      setProgress(0);
      interval = setInterval(() => {
        setProgress(prev => {
          if (prev < 30) return prev + 5;
          if (prev < 70) return prev + 2;
          if (prev < 90) return prev + 0.5;
          if (prev < 99) return prev + 0.1; // Slow down but never stop
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
      recognitionRef.current.lang = 'it-IT'; // Set to Italian for better recognition

      recognitionRef.current.onresult = (event: any) => {
        const last = event.results.length - 1;
        const text = event.results[last][0].transcript;
        console.log('Recognized:', text);
        
        // If it's the user's turn, advance on any detected speech (simple heuristic)
        if (state === 'rehearsal' && userCharacters.includes(script[currentIndex]?.character) && !isPaused) {
          nextLine();
        }
      };
    }
  }, [state, currentIndex, script, userCharacters, isPaused]);

  useEffect(() => {
    if (isVoiceMode && recognitionRef.current && !isPaused) {
      try {
        recognitionRef.current.start();
      } catch (e) {}
    } else if (recognitionRef.current) {
      recognitionRef.current.stop();
    }
    return () => recognitionRef.current?.stop();
  }, [isVoiceMode, isPaused]);

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
        throw new Error("Il file è vuoto.");
      }

      const parsed = await parseScript(text);
      setScript(parsed);
      saveScript(file.name, parsed);
      setState('setup');
    } catch (error) {
      console.error("Errore elaborazione file:", error);
      alert("Errore nell'elaborazione del copione. Assicurati che sia un file TXT o DOCX valido.");
    } finally {
      setIsLoading(false);
    }
  };

  const startRehearsal = () => {
    if (userCharacters.length === 0) {
      alert("Per favore, seleziona almeno un personaggio.");
      return;
    }
    setState('rehearsal');
    setCurrentIndex(0);
    setIsPaused(false);
  };

  const nextLine = () => {
    if (currentIndex < script.length - 1) {
      setCurrentIndex(prev => prev + 1);
    }
  };

  const skipToMyNextLine = () => {
    window.speechSynthesis.cancel();
    const nextUserIndex = script.findIndex((line, idx) => 
      idx > currentIndex && userCharacters.includes(line.character) && !line.isStageDirection
    );
    if (nextUserIndex !== -1) {
      setCurrentIndex(nextUserIndex);
    }
  };

  const resetRehearsal = () => {
    setCurrentIndex(0);
    window.speechSynthesis.cancel();
    setIsPaused(false);
  };

  // Handle TTS and Auto-advance
  useEffect(() => {
    if (state !== 'rehearsal' || currentIndex >= script.length || isPaused) return;

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
      
      // CLEAN TEXT: Remove anything inside parentheses or brackets
      const cleanText = currentLine.text.replace(/\([^)]*\)|\[[^\]]*\]/g, '').trim();
      
      if (!cleanText) {
        nextLine();
        return;
      }

      const utterance = new SpeechSynthesisUtterance(cleanText);
      utterance.rate = playbackRate;
      
      // Voice selection
      const voice = availableVoices.find(v => v.voiceURI === selectedVoiceURI);
      if (voice) {
        utterance.voice = voice;
      } else {
        // Fallback heuristic
        const voices = window.speechSynthesis.getVoices();
        const charIndex = characters.indexOf(currentLine.character);
        if (voices.length > 0) {
          utterance.voice = voices[charIndex % voices.length];
        }
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
  }, [currentIndex, state, script, userCharacters, characters, isPaused, playbackRate, selectedVoiceURI, availableVoices]);

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

  const APP_VERSION = "1.2.0";

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-4 md:p-8 relative">
      <AnimatePresence mode="wait">
        {state === 'upload' && (
          <motion.div
            key="upload"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="w-full max-w-2xl space-y-6"
          >
            <div className="glass-card p-8 text-center">
              <div className="w-20 h-20 bg-brand-blue rounded-full flex items-center justify-center mx-auto mb-6 shadow-inner">
                <Upload className={`text-white w-10 h-10 ${isLoading ? 'animate-bounce' : ''}`} />
              </div>
              <h1 className="text-3xl font-bold mb-2">Carica Copione</h1>
              <p className="text-slate-500 mb-8">Iniziamo. Carica il tuo copione teatrale (TXT o DOCX) per iniziare il ripasso.</p>
              
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
                    {progress < 30 ? "Lettura file..." : progress < 70 ? "Analisi personaggi..." : progress < 90 ? "Strutturazione copione..." : "Quasi fatto, sto finalizzando..."}
                  </p>
                  {progress > 90 && (
                    <p className="text-xs text-slate-400 mt-2">
                      L'operazione sta richiedendo più tempo per copioni complessi. Per favore attendi...
                    </p>
                  )}
                </div>
              ) : (
                <label className="btn-primary cursor-pointer inline-flex items-center gap-2">
                  Scegli File
                  <input type="file" accept=".txt,.docx" className="hidden" onChange={handleFileUpload} disabled={isLoading} />
                </label>
              )}
            </div>

            {savedScripts.length > 0 && !isLoading && (
              <div className="glass-card p-6">
                <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
                  <RotateCcw className="text-brand-purple" size={20} /> Copioni Recenti
                </h2>
                <div className="space-y-3">
                  {savedScripts.map((s, i) => (
                    <div key={i} className="flex items-center justify-between p-3 bg-white/50 rounded-xl hover:bg-white transition-colors group">
                      <button 
                        onClick={() => loadSavedScript(s)}
                        className="flex-1 text-left"
                      >
                        <p className="font-semibold text-slate-700">{s.name}</p>
                        <p className="text-xs text-slate-400">{s.date}</p>
                      </button>
                      <button 
                        onClick={() => deleteSavedScript(i)}
                        className="p-2 text-slate-300 hover:text-red-400 transition-colors"
                      >
                        <RotateCcw size={16} className="rotate-45" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
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
              <User className="text-brand-purple" /> Seleziona il Tuo Personaggio
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
                <RotateCcw size={18} /> Indietro
              </button>
              <button onClick={startRehearsal} className="btn-primary flex items-center gap-2">
                Inizia Ripasso <ChevronRight size={20} />
              </button>
            </div>
          </motion.div>
        )}

        {state === 'rehearsal' && (
          <motion.div
            key="rehearsal"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="w-full max-w-4xl h-[85vh] flex flex-col gap-4"
          >
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center px-4 gap-4">
              <div className="flex items-center gap-4">
                <button onClick={() => setState('setup')} className="p-2 hover:bg-white/50 rounded-full transition-colors">
                  <RotateCcw size={24} />
                </button>
                <h3 className="font-bold text-lg">Ripasso: {userCharacters.join(', ')}</h3>
              </div>
              
              <div className="flex flex-wrap items-center gap-3">
                {/* Voice Selection */}
                <select 
                  value={selectedVoiceURI}
                  onChange={(e) => setSelectedVoiceURI(e.target.value)}
                  className="text-xs p-2 rounded-lg bg-white border-none shadow-sm focus:ring-2 focus:ring-brand-purple"
                >
                  {availableVoices.map(v => (
                    <option key={v.voiceURI} value={v.voiceURI}>
                      {v.name} ({v.lang})
                    </option>
                  ))}
                </select>

                {/* Speed Control */}
                <div className="flex items-center gap-2 bg-white p-2 rounded-lg shadow-sm">
                  <span className="text-[10px] font-bold text-slate-400">VELOCITÀ</span>
                  <input 
                    type="range" 
                    min="0.5" 
                    max="2" 
                    step="0.1" 
                    value={playbackRate}
                    onChange={(e) => setPlaybackRate(parseFloat(e.target.value))}
                    className="w-20 accent-brand-purple"
                  />
                  <span className="text-xs font-mono w-8">{playbackRate}x</span>
                </div>

                <button 
                  onClick={() => setIsVoiceMode(!isVoiceMode)}
                  className={`p-2 rounded-lg transition-all flex items-center gap-2 ${isVoiceMode ? 'bg-brand-pink text-white shadow-lg' : 'bg-white text-slate-400'}`}
                  title="Modalità Vocale (Sperimentale)"
                >
                  {isVoiceMode ? <Mic size={18} /> : <MicOff size={18} />}
                  <span className="text-[10px] font-bold">VOCE</span>
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

            <div className="flex flex-col md:flex-row items-center justify-center gap-4 p-4">
              <div className="flex items-center gap-2 w-full md:w-auto">
                <button
                  onClick={() => setIsPaused(!isPaused)}
                  className={`flex-1 md:flex-none p-4 rounded-2xl shadow-lg font-bold flex items-center justify-center gap-2 transition-all ${
                    isPaused ? 'bg-brand-orange text-white' : 'bg-white text-slate-600'
                  }`}
                >
                  {isPaused ? <Play size={20} fill="currentColor" /> : <div className="w-5 h-5 flex gap-1 justify-center items-center"><div className="w-1.5 h-4 bg-current rounded-full"/><div className="w-1.5 h-4 bg-current rounded-full"/></div>}
                  {isPaused ? 'RIPRENDI' : 'PAUSA'}
                </button>

                <button
                  onClick={skipToMyNextLine}
                  className="flex-1 md:flex-none p-4 bg-white text-slate-600 rounded-2xl shadow-lg font-bold flex items-center justify-center gap-2 hover:bg-brand-purple hover:text-white transition-all"
                >
                  <ChevronRight size={20} /> SALTA ALLA MIA BATTUTA
                </button>
              </div>

              {userCharacters.includes(script[currentIndex]?.character) && !script[currentIndex]?.isStageDirection ? (
                <motion.button
                  initial={{ scale: 0.9, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={nextLine}
                  className="w-full max-w-md py-6 bg-brand-pink text-white rounded-2xl shadow-2xl font-bold text-xl flex items-center justify-center gap-3"
                >
                  <Play fill="currentColor" /> TOCCA O SPAZIO QUANDO HAI FINITO
                </motion.button>
              ) : (
                <div className="flex items-center gap-3 text-slate-400 font-medium animate-pulse">
                  {isPaused ? <span className="text-brand-orange">RIPASSO IN PAUSA</span> : <><Volume2 /> Ascoltando {script[currentIndex]?.character}...</>}
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

      {/* Version Indicator */}
      <div className="fixed bottom-4 right-4 text-[10px] font-mono text-slate-400 bg-white/50 px-2 py-1 rounded-md backdrop-blur-sm shadow-sm z-50">
        v{APP_VERSION}
      </div>
    </div>
  );
}
