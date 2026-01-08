
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Timer, SyncRole, SyncMessage } from './types';
import { MAX_TIMERS, DEFAULT_TIMER_SECONDS } from './constants';
import TimerCard from './components/TimerCard';

declare var Peer: any;

const App: React.FC = () => {
  const [timers, setTimers] = useState<Timer[]>([]);
  const [role, setRole] = useState<SyncRole>('standalone');
  const [peerId, setPeerId] = useState<string>('');
  const [targetId, setTargetId] = useState<string>('');
  const [connectionStatus, setConnectionStatus] = useState<string>('disconnected');
  const [isDarkMode, setIsDarkMode] = useState<boolean>(() => {
    const saved = localStorage.getItem('theme');
    return saved ? saved === 'dark' : window.matchMedia('(prefers-color-scheme: dark)').matches;
  });
  
  const peerRef = useRef<any>(null);
  const connectionsRef = useRef<any[]>([]);
  const timerIntervalRef = useRef<number | null>(null);

  // Persistence for theme
  useEffect(() => {
    localStorage.setItem('theme', isDarkMode ? 'dark' : 'light');
  }, [isDarkMode]);

  // Initialize Peer
  useEffect(() => {
    const peer = new Peer();
    peerRef.current = peer;

    peer.on('open', (id: string) => {
      setPeerId(id);
    });

    peer.on('connection', (conn: any) => {
      setRole('master');
      setConnectionStatus('connected');
      connectionsRef.current.push(conn);
      
      conn.on('open', () => {
        conn.send({ type: 'SYNC_STATE', payload: { timers: timersRef.current } });
      });

      conn.on('close', () => {
        connectionsRef.current = connectionsRef.current.filter(c => c !== conn);
        if (connectionsRef.current.length === 0) setConnectionStatus('disconnected');
      });
    });

    return () => {
      if (peerRef.current) peerRef.current.destroy();
    };
  }, []);

  const timersRef = useRef(timers);
  useEffect(() => {
    timersRef.current = timers;
    if (role === 'master' && connectionsRef.current.length > 0) {
      const message: SyncMessage = { type: 'SYNC_STATE', payload: { timers } };
      connectionsRef.current.forEach(conn => {
        if (conn.open) conn.send(message);
      });
    }
  }, [timers, role]);

  useEffect(() => {
    if (role === 'slave') return;

    timerIntervalRef.current = window.setInterval(() => {
      setTimers(prev => prev.map(t => {
        if (t.isRunning && t.remainingSeconds > 0) {
          return { ...t, remainingSeconds: t.remainingSeconds - 1, lastUpdated: Date.now() };
        } else if (t.isRunning && t.remainingSeconds === 0) {
          return { ...t, isRunning: false, lastUpdated: Date.now() };
        }
        return t;
      }));
    }, 1000);

    return () => {
      if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
    };
  }, [role]);

  const addTimer = () => {
    if (timers.length >= MAX_TIMERS) return;
    const newTimer: Timer = {
      id: Math.random().toString(36).substr(2, 9),
      name: `Timer ${timers.length + 1}`,
      initialSeconds: DEFAULT_TIMER_SECONDS,
      remainingSeconds: DEFAULT_TIMER_SECONDS,
      isRunning: false,
      lastUpdated: Date.now(),
    };
    setTimers([...timers, newTimer]);
  };

  const deleteTimer = (id: string) => {
    setTimers(timers.filter(t => t.id !== id));
  };

  const updateTimer = (id: string, updates: Partial<Timer>) => {
    setTimers(timers.map(t => t.id === id ? { ...t, ...updates, lastUpdated: Date.now() } : t));
  };

  const startAll = () => {
    setTimers(timers.map(t => ({ ...t, isRunning: true, lastUpdated: Date.now() })));
  };

  const pauseAll = () => {
    setTimers(timers.map(t => ({ ...t, isRunning: false, lastUpdated: Date.now() })));
  };

  const connectToPeer = () => {
    if (!targetId || !peerRef.current) return;
    setConnectionStatus('connecting');
    const conn = peerRef.current.connect(targetId);
    
    conn.on('open', () => {
      setRole('slave');
      setConnectionStatus('connected');
      connectionsRef.current = [conn];
    });

    conn.on('data', (data: any) => {
      if (data.type === 'SYNC_STATE') {
        setTimers(data.payload.timers);
      }
    });

    conn.on('close', () => {
      setRole('standalone');
      setConnectionStatus('disconnected');
    });

    conn.on('error', () => {
      setConnectionStatus('error');
    });
  };

  const disconnectSync = () => {
    connectionsRef.current.forEach(c => c.close());
    connectionsRef.current = [];
    setRole('standalone');
    setConnectionStatus('disconnected');
  };

  const toggleTheme = () => setIsDarkMode(!isDarkMode);

  return (
    <div className={`min-h-screen transition-colors duration-300 flex flex-col p-4 md:p-8 ${isDarkMode ? 'bg-slate-900 text-slate-100' : 'bg-slate-50 text-slate-900'}`}>
      {/* Header */}
      <header className="max-w-7xl mx-auto w-full mb-10">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="flex items-center justify-between md:block w-full md:w-auto">
            <div className="flex items-center gap-3 mb-1">
              <div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center shadow-lg shadow-indigo-500/30">
                <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <div>
                <h1 className={`text-3xl font-extrabold tracking-tight ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>
                  DP Exam <span className="text-indigo-600">Sync</span>
                </h1>
                <p className={`text-sm font-medium ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>Precision Exam Synchronization</p>
              </div>
            </div>
            
            {/* Mobile Theme Toggle */}
            <button 
              onClick={toggleTheme}
              className={`md:hidden p-2 rounded-xl border transition-all ${isDarkMode ? 'bg-slate-800 border-slate-700 text-amber-400' : 'bg-white border-slate-200 text-slate-600'}`}
            >
              {isDarkMode ? (
                <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 20 20"><path d="M10 2a1 1 0 011 1v1a1 1 0 11-2 0V3a1 1 0 011-1zm4 8a4 4 0 11-8 0 4 4 0 018 0zm-.464 4.95l.707.707a1 1 0 001.414-1.414l-.707-.707a1 1 0 00-1.414 1.414zm2.12-10.607a1 1 0 010 1.414l-.706.707a1 1 0 11-1.414-1.414l.707-.707a1 1 0 011.414 0zM17 11a1 1 0 100-2h-1a1 1 0 100 2h1zm-7 4a1 1 0 011 1v1a1 1 0 11-2 0v-1a1 1 0 011-1zM5.05 6.464A1 1 0 106.465 5.05l-.708-.707a1 1 0 00-1.414 1.414l.707.707zm1.414 8.486l-.707.707a1 1 0 01-1.414-1.414l.707-.707a1 1 0 011.414 1.414zM4 11a1 1 0 100-2H3a1 1 0 000 2h1z" fillRule="evenodd" clipRule="evenodd" /></svg>
              ) : (
                <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 20 20"><path d="M17.293 13.293A8 8 0 016.707 2.707a8.001 8.001 0 1010.586 10.586z" /></svg>
              )}
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {/* Desktop Theme Toggle */}
            <button 
              onClick={toggleTheme}
              className={`hidden md:flex items-center gap-2 px-3 py-2.5 rounded-xl border transition-all font-bold text-sm ${isDarkMode ? 'bg-slate-800 border-slate-700 text-amber-400' : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-100'}`}
              title="Toggle Light/Dark Theme"
            >
              {isDarkMode ? (
                <>
                  <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20"><path d="M10 2a1 1 0 011 1v1a1 1 0 11-2 0V3a1 1 0 011-1zm4 8a4 4 0 11-8 0 4 4 0 018 0zm-.464 4.95l.707.707a1 1 0 001.414-1.414l-.707-.707a1 1 0 00-1.414 1.414zm2.12-10.607a1 1 0 010 1.414l-.706.707a1 1 0 11-1.414-1.414l.707-.707a1 1 0 011.414 0zM17 11a1 1 0 100-2h-1a1 1 0 100 2h1zm-7 4a1 1 0 011 1v1a1 1 0 11-2 0v-1a1 1 0 011-1zM5.05 6.464A1 1 0 106.465 5.05l-.708-.707a1 1 0 00-1.414 1.414l.707.707zm1.414 8.486l-.707.707a1 1 0 01-1.414-1.414l.707-.707a1 1 0 011.414 1.414zM4 11a1 1 0 100-2H3a1 1 0 000 2h1z" fillRule="evenodd" clipRule="evenodd" /></svg>
                  Light Mode
                </>
              ) : (
                <>
                  <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20"><path d="M17.293 13.293A8 8 0 016.707 2.707a8.001 8.001 0 1010.586 10.586z" /></svg>
                  Dark Mode
                </>
              )}
            </button>

            {role !== 'slave' && (
              <>
                <button 
                  onClick={startAll}
                  className="flex items-center gap-2 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-bold text-sm transition-all shadow-lg shadow-indigo-500/20 active:scale-95"
                >
                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" clipRule="evenodd" /></svg>
                  Start All
                </button>
                <button 
                  onClick={pauseAll}
                  className={`flex items-center gap-2 px-4 py-2.5 rounded-xl font-bold text-sm transition-all active:scale-95 ${isDarkMode ? 'bg-slate-700 hover:bg-slate-600 text-white' : 'bg-slate-200 hover:bg-slate-300 text-slate-700'}`}
                >
                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zM7 8a1 1 0 012 0v4a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v4a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" /></svg>
                  Pause All
                </button>
                <button 
                  onClick={addTimer}
                  disabled={timers.length >= MAX_TIMERS}
                  className="flex items-center gap-2 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white disabled:opacity-50 disabled:cursor-not-allowed rounded-xl font-bold text-sm transition-all shadow-lg shadow-emerald-500/20 active:scale-95"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 4v16m8-8H4" /></svg>
                  Add Timer
                </button>
              </>
            )}
          </div>
        </div>
      </header>

      {/* Main Grid */}
      <main className="max-w-7xl mx-auto w-full flex-1">
        {timers.length === 0 ? (
          <div className={`h-64 border-2 border-dashed rounded-3xl flex flex-col items-center justify-center ${isDarkMode ? 'border-slate-800 text-slate-600' : 'border-slate-200 text-slate-400'}`}>
            <svg className="w-12 h-12 mb-4 opacity-20" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <p className="font-medium">No timers active. Click 'Add Timer' to begin.</p>
          </div>
        ) : (
          <div className={`grid gap-6 grid-cols-1 ${
            timers.length === 1 ? 'max-w-xl mx-auto' :
            timers.length === 2 ? 'md:grid-cols-2 max-w-4xl mx-auto' :
            timers.length === 3 ? 'md:grid-cols-2 lg:grid-cols-3' :
            'md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4'
          }`}>
            {timers.map(timer => (
              <TimerCard 
                key={timer.id} 
                timer={timer} 
                onUpdate={updateTimer} 
                onDelete={deleteTimer}
                isReadOnly={role === 'slave'}
                isDarkMode={isDarkMode}
              />
            ))}
          </div>
        )}
      </main>

      {/* Sync Footer */}
      <footer className="mt-12 max-w-7xl mx-auto w-full">
        <div className={`backdrop-blur-sm border rounded-2xl p-6 ${isDarkMode ? 'bg-slate-800/50 border-slate-700/50' : 'bg-white border-slate-200 shadow-sm'}`}>
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
            <div className="flex items-center gap-4">
              <div className={`w-3 h-3 rounded-full ${connectionStatus === 'connected' ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]' : 'bg-slate-400'}`}></div>
              <div>
                <p className={`text-xs font-bold uppercase tracking-widest mb-1 ${isDarkMode ? 'text-slate-500' : 'text-slate-400'}`}>Peer Sync Network</p>
                <p className={`text-sm font-mono-custom ${isDarkMode ? 'text-slate-300' : 'text-slate-600'}`}>
                  Local ID: <span className="text-indigo-600 font-bold select-all cursor-pointer">{peerId || 'Initializing...'}</span>
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-4">
              {role === 'standalone' ? (
                <div className="flex items-center gap-2">
                  <input 
                    type="text" 
                    placeholder="Enter Master ID" 
                    value={targetId}
                    onChange={(e) => setTargetId(e.target.value)}
                    className={`border rounded-xl px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 w-48 md:w-64 ${isDarkMode ? 'bg-slate-900 border-slate-700 text-white' : 'bg-slate-50 border-slate-200 text-slate-900'}`}
                  />
                  <button 
                    onClick={connectToPeer}
                    disabled={!targetId || connectionStatus === 'connecting'}
                    className="px-6 py-2 bg-indigo-600 hover:bg-indigo-500 text-white disabled:opacity-50 rounded-xl text-sm font-bold transition-all whitespace-nowrap shadow-md"
                  >
                    {connectionStatus === 'connecting' ? 'Linking...' : 'Connect to Master'}
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-4">
                  <div className="text-sm">
                    <span className={isDarkMode ? 'text-slate-500' : 'text-slate-500'}>Sync Role: </span>
                    <span className="font-bold text-indigo-600 capitalize">{role}</span>
                  </div>
                  <button 
                    onClick={disconnectSync}
                    className="px-6 py-2 bg-rose-500/10 text-rose-600 border border-rose-200 hover:bg-rose-500 hover:text-white rounded-xl text-sm font-bold transition-all"
                  >
                    Disconnect
                  </button>
                </div>
              )}
            </div>
            
            <div className={`text-[10px] max-w-xs leading-tight ${isDarkMode ? 'text-slate-500' : 'text-slate-400'}`}>
              * Real-time P2P sync across devices. For best results, use on the same network.
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default App;
