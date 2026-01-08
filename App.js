
import React, { useState, useEffect, useRef } from 'react';
import htm from 'htm';
import TimerCard from './components/TimerCard.js';

const html = htm.bind(React.createElement);
const MAX_TIMERS = 8;
const DEFAULT_TIMER_SECONDS = 300;

export default function App() {
  const [timers, setTimers] = useState([]);
  const [role, setRole] = useState('standalone');
  const [peerId, setPeerId] = useState('');
  const [targetId, setTargetId] = useState('');
  const [connectionStatus, setConnectionStatus] = useState('disconnected');
  const [isDarkMode, setIsDarkMode] = useState(() => {
    const saved = localStorage.getItem('theme');
    return saved ? saved === 'dark' : window.matchMedia('(prefers-color-scheme: dark)').matches;
  });

  const peerRef = useRef(null);
  const connectionsRef = useRef([]);
  const timersRef = useRef(timers);

  // Sync state reference for peer callbacks
  useEffect(() => {
    timersRef.current = timers;
    localStorage.setItem('theme', isDarkMode ? 'dark' : 'light');
    if (role === 'master' && connectionsRef.current.length > 0) {
      const message = { type: 'SYNC_STATE', payload: { timers } };
      connectionsRef.current.forEach(conn => {
        if (conn.open) conn.send(message);
      });
    }
  }, [timers, role, isDarkMode]);

  // PeerJS Initialization
  useEffect(() => {
    const peer = new Peer();
    peerRef.current = peer;

    peer.on('open', (id) => setPeerId(id));

    peer.on('connection', (conn) => {
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

    return () => peer.destroy();
  }, []);

  // Timer Ticking Logic
  useEffect(() => {
    if (role === 'slave') return;
    const interval = setInterval(() => {
      setTimers(prev => prev.map(t => {
        if (t.isRunning && t.remainingSeconds > 0) {
          return { ...t, remainingSeconds: t.remainingSeconds - 1 };
        } else if (t.isRunning && t.remainingSeconds === 0) {
          return { ...t, isRunning: false };
        }
        return t;
      }));
    }, 1000);
    return () => clearInterval(interval);
  }, [role]);

  const addTimer = () => {
    if (timers.length >= MAX_TIMERS) return;
    const newTimer = {
      id: Math.random().toString(36).substr(2, 9),
      name: `Timer ${timers.length + 1}`,
      initialSeconds: DEFAULT_TIMER_SECONDS,
      remainingSeconds: DEFAULT_TIMER_SECONDS,
      isRunning: false
    };
    setTimers([...timers, newTimer]);
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

    conn.on('data', (data) => {
      if (data.type === 'SYNC_STATE') setTimers(data.payload.timers);
    });

    conn.on('close', () => {
      setRole('standalone');
      setConnectionStatus('disconnected');
    });
  };

  const toggleTheme = () => setIsDarkMode(!isDarkMode);

  return html`
    <div className=${`min-h-screen transition-colors duration-300 flex flex-col p-4 md:p-8 ${isDarkMode ? 'bg-slate-900 text-slate-100' : 'bg-slate-50 text-slate-900'}`}>
      <header className="max-w-7xl mx-auto w-full mb-10">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="flex items-center justify-between md:block w-full md:w-auto">
            <div className="flex items-center gap-3 mb-1">
              <div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center shadow-lg shadow-indigo-500/30">
                <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
              </div>
              <h1 className="text-3xl font-extrabold tracking-tight">DP Exam <span className="text-indigo-600">Sync</span></h1>
            </div>
            <button onClick=${toggleTheme} className="md:hidden p-2 rounded-xl border border-slate-700">
              ${isDarkMode ? '🌙' : '☀️'}
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button onClick=${toggleTheme} className="hidden md:flex items-center gap-2 px-3 py-2.5 rounded-xl border border-slate-700 font-bold text-sm">
              ${isDarkMode ? 'Light Mode' : 'Dark Mode'}
            </button>
            ${role !== 'slave' && html`
              <button onClick=${addTimer} className="px-4 py-2.5 bg-emerald-600 text-white rounded-xl font-bold text-sm shadow-lg shadow-emerald-500/20">Add Timer</button>
              <button onClick=${() => setTimers(timers.map(t => ({...t, isRunning: true})))} className="px-4 py-2.5 bg-indigo-600 text-white rounded-xl font-bold text-sm shadow-lg shadow-indigo-500/20">Start All</button>
            `}
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto w-full flex-1">
        ${timers.length === 0 ? html`
          <div className="h-64 border-2 border-dashed border-slate-700 rounded-3xl flex flex-col items-center justify-center text-slate-500">
            <p>No timers active. Click 'Add Timer' to begin.</p>
          </div>
        ` : html`
          <div className="grid gap-6 grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            ${timers.map(timer => html`
              <${TimerCard} 
                key=${timer.id} 
                timer=${timer} 
                isDarkMode=${isDarkMode} 
                isReadOnly=${role === 'slave'}
                onUpdate=${(id, updates) => setTimers(timers.map(t => t.id === id ? {...t, ...updates} : t))}
                onDelete=${(id) => setTimers(timers.filter(t => t.id !== id))}
              />
            `)}
          </div>
        `}
      </main>

      <footer className="mt-12 max-w-7xl mx-auto w-full">
        <div className=${`p-6 rounded-2xl border ${isDarkMode ? 'bg-slate-800/50 border-slate-700' : 'bg-white border-slate-200'}`}>
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
            <div>
              <p className="text-xs font-bold text-slate-500 uppercase tracking-widest">Peer Sync ID</p>
              <p className="text-sm font-mono text-indigo-400 select-all">${peerId || 'Initializing...'}</p>
            </div>
            ${role === 'standalone' ? html`
              <div className="flex gap-2">
                <input value=${targetId} onChange=${(e) => setTargetId(e.target.value)} placeholder="Enter Master ID" className="bg-slate-900 border border-slate-700 rounded-xl px-4 py-2 text-sm text-white" />
                <button onClick=${connectToPeer} className="bg-indigo-600 text-white px-6 py-2 rounded-xl font-bold text-sm shadow-md">Connect</button>
              </div>
            ` : html`
              <div className="flex items-center gap-4">
                <span className="text-sm font-bold text-indigo-400 capitalize">${role} Mode Active</span>
                <button onClick=${() => { connectionsRef.current.forEach(c => c.close()); setRole('standalone'); }} className="text-rose-500 font-bold text-sm">Disconnect</button>
              </div>
            `}
          </div>
        </div>
      </footer>
    </div>
  `;
}
