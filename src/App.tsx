/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Upload, Play, User, ChevronRight, ChevronLeft, RotateCcw, Mic, MicOff, Volume2, Sparkles } from 'lucide-react';
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
  const [showUserLine, setShowUserLine] = useState(false);
  const [playbackRate, setPlaybackRate] = useState(1.2);
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
      // Default to Google Italiano if possible
      const preferred = voices.find(v => v.name.includes('Google') && v.lang.includes('it-IT')) || 
                        voices.find(v => v.lang.includes('it-IT')) ||
                        voices.find(v => v.name.includes('Natural'));
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
      recognitionRef.current.interimResults = true; // Set to true for faster feedback
      recognitionRef.current.lang = 'it-IT';

      recognitionRef.current.onresult = (event: any) => {
        const last = event.results.length - 1;
        const transcript = event.results[last][0].transcript.toLowerCase().trim();
        console.log('Recognized:', transcript);
        
        // If it's the user's turn, check if they said the line
        if (state === 'rehearsal' && userCharacters.includes(script[currentIndex]?.character) && !isPaused) {
          const targetText = script[currentIndex].text.toLowerCase().replace(/[.,\/#!$%\^&\*;:{}=\-_`~()]/g,"").trim();
          
          // Split into words for better matching
          const targetWords = targetText.split(/\s+/);
          const transcriptWords = transcript.split(/\s+/);
          
          // Check if at least 60% of the target words are present in the transcript
          const matchedWords = targetWords.filter(word => transcript.includes(word));
          const matchRatio = matchedWords.length / targetWords.length;
          
          if (matchRatio >= 0.6 || transcript.includes(targetText)) {
             nextLine();
          }
        }
      };
    }
  }, [state, currentIndex, script, userCharacters, isPaused]);

  // Reset revealed state on line change
  useEffect(() => {
    setShowUserLine(false);
  }, [currentIndex]);

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

      // Fix common encoding issues for Italian accented characters
      const fixedText = text
        .replace(/Ã /g, 'à')
        .replace(/Ã¨/g, 'è')
        .replace(/Ã©/g, 'é')
        .replace(/Ã¬/g, 'ì')
        .replace(/Ã²/g, 'ò')
        .replace(/Ã¹/g, 'ù')
        .replace(/â€™/g, "'");

      const parsed = await parseScript(fixedText);
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

  const loadPreloadedScript = async () => {
    setIsLoading(true);
    try {
      // We'll try to fetch a local pre-parsed script if it exists
      const response = await fetch('/preloaded_script.json');
      if (!response.ok) {
        throw new Error("Nessun copione pre-caricato trovato. Per favore, carica il file DOCX o PDF in chat così posso prepararlo per te.");
      }
      const data = await response.json();
      if (!Array.isArray(data) || data.length === 0) {
        throw new Error("Il copione pre-caricato è vuoto o non è nel formato corretto.");
      }
      setScript(data);
      setState('setup');
    } catch (error: any) {
      console.error("Errore caricamento pre-caricato:", error);
      alert(error.message || "Non è stato possibile caricare o analizzare il copione pre-caricato.");
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

  const prevLine = () => {
    if (currentIndex > 0) {
      window.speechSynthesis.cancel();
      setCurrentIndex(prev => prev - 1);
      setIsPaused(false);
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
    let isMounted = true;
    
    // If it's a stage direction, skip it (or show it briefly)
    if (currentLine.isStageDirection) {
      const timer = setTimeout(() => {
        if (isMounted) nextLine();
      }, 1500);
      return () => {
        isMounted = false;
        clearTimeout(timer);
      };
    }

    // If it's NOT the user's character, read it aloud
    if (!userCharacters.includes(currentLine.character)) {
      setIsReading(true);
      
      const cleanText = currentLine.text.replace(/\([^)]*\)|\[[^\]]*\]/g, '').trim();
      
      if (!cleanText) {
        nextLine();
        return;
      }

      const utterance = new SpeechSynthesisUtterance(cleanText);
      utterance.rate = playbackRate;
      const voice = availableVoices.find(v => v.voiceURI === selectedVoiceURI);
      if (voice) utterance.voice = voice;
      utterance.onend = () => {
        if (isMounted) {
          setIsReading(false);
          nextLine();
        }
      };
      window.speechSynthesis.speak(utterance);
    } else {
      setIsReading(false);
    }

    return () => {
      isMounted = false;
      window.speechSynthesis.cancel();
    };
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

  const APP_VERSION = "1.6.0";
  const isUserTurn = state === 'rehearsal' && userCharacters.includes(script[currentIndex]?.character) && !script[currentIndex]?.isStageDirection;

  return (
    <div className={`min-h-screen flex flex-col items-center justify-center p-4 md:p-8 relative transition-colors duration-1000 ${
      isUserTurn ? 'bg-brand-pink/20' : 'bg-slate-50'
    }`}>
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
                <div className="flex flex-col gap-4 items-center">
                  <label className="btn-primary cursor-pointer inline-flex items-center gap-2 w-full max-w-xs justify-center">
                    Scegli File
                    <input type="file" accept=".txt,.docx" className="hidden" onChange={handleFileUpload} disabled={isLoading} />
                  </label>
                  
                  <button 
                    onClick={loadPreloadedScript}
                    className="text-sm text-brand-purple font-semibold hover:underline flex items-center gap-1"
                  >
                    <Sparkles size={16} /> Carica Copione Pre-caricato
                  </button>
                </div>
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
            className="w-full max-w-4xl h-[90vh] md:h-[85vh] flex flex-col gap-2 md:gap-4"
          >
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center px-4 gap-2 md:gap-4">
              <div className="flex items-center gap-3 w-full md:w-auto">
                <button onClick={() => setState('setup')} className="p-2 hover:bg-white/50 rounded-full transition-colors">
                  <RotateCcw size={20} className="md:w-6 md:h-6" />
                </button>
                <h3 className="font-bold text-sm md:text-lg truncate flex-1">Ripasso: {userCharacters.join(', ')}</h3>
              </div>
              
              <div className="flex items-center gap-2 w-full md:w-auto overflow-x-auto pb-1 md:pb-0 no-scrollbar">
                {/* Voice Selection */}
                <select 
                  value={selectedVoiceURI}
                  onChange={(e) => setSelectedVoiceURI(e.target.value)}
                  className="text-[10px] md:text-xs p-1.5 md:p-2 rounded-lg bg-white border-none shadow-sm focus:ring-2 focus:ring-brand-purple min-w-[100px]"
                >
                  {availableVoices.map(v => (
                    <option key={v.voiceURI} value={v.voiceURI}>
                      {v.name.split(' ')[0]} ({v.lang})
                    </option>
                  ))}
                </select>

                {/* Speed Control */}
                <div className="flex items-center gap-1.5 md:gap-2 bg-white p-1.5 md:p-2 rounded-lg shadow-sm shrink-0">
                  <span className="text-[8px] md:text-[10px] font-bold text-slate-400">VEL</span>
                  <input 
                    type="range" 
                    min="0.5" 
                    max="2" 
                    step="0.1" 
                    value={playbackRate}
                    onChange={(e) => setPlaybackRate(parseFloat(e.target.value))}
                    className="w-12 md:w-20 accent-brand-purple"
                  />
                  <span className="text-[10px] md:text-xs font-mono w-6 md:w-8">{playbackRate}x</span>
                </div>

                <button 
                  onClick={() => setIsVoiceMode(!isVoiceMode)}
                  className={`p-1.5 md:p-2 rounded-lg transition-all flex items-center gap-1 md:gap-2 shrink-0 ${isVoiceMode ? 'bg-brand-pink text-white shadow-lg' : 'bg-white text-slate-400'}`}
                  title="Modalità Vocale (Sperimentale)"
                >
                  {isVoiceMode ? <Mic size={14} className="md:w-[18px] md:h-[18px]" /> : <MicOff size={14} className="md:w-[18px] md:h-[18px]" />}
                  <span className="text-[8px] md:text-[10px] font-bold">VOCE</span>
                </button>
              </div>
            </div>

            <div className="flex-1 flex gap-2 overflow-hidden relative">
              <div 
                ref={scrollRef}
                className="flex-1 glass-card overflow-y-auto p-4 md:p-12 space-y-6 md:space-y-8 scroll-smooth"
              >
                {script.map((line, idx) => {
                  const isUser = userCharacters.includes(line.character);
                  const isActive = idx === currentIndex;
                  
                  if (line.isStageDirection) {
                    return (
                      <div 
                        key={idx} 
                        id={`line-${idx}`}
                        className={`text-center italic text-slate-400 text-xs md:text-sm transition-all duration-500 ${isActive ? 'scale-105 text-brand-orange' : 'opacity-50'}`}
                      >
                        [{line.text}]
                      </div>
                    );
                  }

                  return (
                    <div
                      key={idx}
                      id={`line-${idx}`}
                      onClick={() => {
                        window.speechSynthesis.cancel();
                        setCurrentIndex(idx);
                        setIsPaused(false);
                      }}
                      className={`flex flex-col gap-1 transition-all duration-500 cursor-pointer hover:bg-white/30 rounded-xl p-1.5 md:p-2 ${
                        isActive ? 'scale-[1.02] md:scale-105 opacity-100' : 'opacity-30 blur-[0.5px] md:blur-[1px]'
                      } ${isUser ? 'items-end' : 'items-start'}`}
                    >
                      <span className={`text-[8px] md:text-[10px] uppercase tracking-widest font-bold ${isUser ? 'text-brand-pink' : 'text-brand-blue'}`}>
                        {line.character}
                      </span>
                      <div className={`max-w-[85%] md:max-w-[80%] p-3 md:p-4 rounded-xl md:rounded-2xl text-base md:text-xl font-medium relative ${
                        isActive 
                          ? (isUser ? 'bg-brand-pink text-white shadow-xl' : 'bg-brand-blue text-white shadow-xl')
                          : 'bg-white text-slate-700'
                      }`}>
                        {isUser && isActive && !showUserLine ? (
                          <div className="flex flex-col items-center gap-2 py-2">
                            <span className="opacity-20 select-none">••••••••••••••••</span>
                            <button 
                              onClick={(e) => {
                                e.stopPropagation();
                                setShowUserLine(true);
                              }}
                              className="text-[10px] bg-white/20 hover:bg-white/30 px-3 py-1 rounded-full transition-colors"
                            >
                              MOSTRA SUGGERIMENTO
                            </button>
                          </div>
                        ) : (
                          line.text
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Script Minimap / Scroll Indicators */}
              <div className="hidden md:flex flex-col w-3 bg-white/20 rounded-full overflow-hidden relative my-12 mr-2">
                {script.map((line, idx) => {
                  const isUser = userCharacters.includes(line.character);
                  if (!isUser || line.isStageDirection) return null;
                  
                  const topPercent = (idx / script.length) * 100;
                  const isActive = idx === currentIndex;

                  return (
                    <button
                      key={idx}
                      onClick={() => {
                        window.speechSynthesis.cancel();
                        setCurrentIndex(idx);
                        setIsPaused(false);
                      }}
                      className={`absolute left-0 w-full h-1 rounded-full transition-all ${
                        isActive ? 'bg-brand-pink scale-y-150 z-10' : 'bg-brand-pink/40 hover:bg-brand-pink/70'
                      }`}
                      style={{ top: `${topPercent}%` }}
                      title={`Battuta di ${line.character}`}
                    />
                  );
                })}
                {/* Current Position Indicator */}
                <div 
                  className="absolute left-0 w-full h-0.5 bg-slate-400/50 transition-all duration-300"
                  style={{ top: `${(currentIndex / script.length) * 100}%` }}
                />
              </div>
            </div>

            <div className="flex flex-col md:flex-row items-center justify-center gap-3 md:gap-4 p-3 md:p-4">
              <div className="flex items-center gap-2 w-full md:w-auto justify-center">
                <button
                  onClick={prevLine}
                  disabled={currentIndex === 0}
                  className="p-3 md:p-4 bg-white text-slate-600 rounded-xl md:rounded-2xl shadow-lg font-bold flex items-center justify-center gap-2 hover:bg-slate-100 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                  title="Battuta Precedente"
                >
                  <ChevronLeft size={18} className="md:w-5 md:h-5" />
                </button>

                <button
                  onClick={() => setIsPaused(!isPaused)}
                  className={`flex-1 md:flex-none p-3 md:p-4 rounded-xl md:rounded-2xl shadow-lg font-bold flex items-center justify-center gap-2 transition-all min-w-[100px] ${
                    isPaused ? 'bg-brand-orange text-white' : 'bg-white text-slate-600'
                  }`}
                >
                  {isPaused ? <Play size={18} fill="currentColor" /> : <div className="w-4 h-4 md:w-5 md:h-5 flex gap-1 justify-center items-center"><div className="w-1 h-3 md:w-1.5 md:h-4 bg-current rounded-full"/><div className="w-1 h-3 md:w-1.5 md:h-4 bg-current rounded-full"/></div>}
                  <span className="text-sm md:text-base">{isPaused ? 'RIPRENDI' : 'PAUSA'}</span>
                </button>

                <button
                  onClick={skipToMyNextLine}
                  className="flex-1 md:flex-none p-3 md:p-4 bg-white text-slate-600 rounded-xl md:rounded-2xl shadow-lg font-bold flex items-center justify-center gap-2 hover:bg-brand-purple hover:text-white transition-all text-xs md:text-base"
                >
                  <ChevronRight size={18} className="md:w-5 md:h-5" /> <span className="hidden md:inline">SALTA ALLA MIA BATTUTA</span><span className="md:hidden">SALTA</span>
                </button>
              </div>

              {userCharacters.includes(script[currentIndex]?.character) && !script[currentIndex]?.isStageDirection ? (
                <div className="flex flex-col items-center gap-2 w-full max-w-md">
                  <motion.button
                    initial={{ scale: 0.9, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    whileTap={{ scale: 0.95 }}
                    onClick={nextLine}
                    className="w-full py-4 md:py-6 bg-brand-pink text-white rounded-xl md:rounded-2xl shadow-2xl font-bold text-base md:text-xl flex items-center justify-center gap-2 md:gap-3"
                  >
                    <Play fill="currentColor" size={18} className="md:w-5 md:h-5" /> <span className="text-sm md:text-base">TOCCA QUANDO HAI FINITO</span>
                  </motion.button>
                  {isVoiceMode && !isPaused && (
                    <div className="flex items-center gap-2 text-brand-pink text-[10px] font-bold animate-pulse">
                      <Mic size={12} /> STO ASCOLTANDO LA TUA BATTUTA...
                    </div>
                  )}
                </div>
              ) : (
                <div className="flex items-center gap-2 md:gap-3 text-slate-400 font-medium animate-pulse text-xs md:text-base">
                  {isPaused ? <span className="text-brand-orange">RIPASSO IN PAUSA</span> : <><Volume2 size={16} className="md:w-5 md:h-5" /> Ascoltando {script[currentIndex]?.character}...</>}
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
