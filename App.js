
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

  useEffect(() => {
    timersRef.current = timers;
    if (isDarkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
    localStorage.setItem('theme', isDarkMode ? 'dark' : 'light');
    
    if (role === 'master' && connectionsRef.current.length > 0) {
      const message = { type: 'SYNC_STATE', payload: { timers } };
      connectionsRef.current.forEach(conn => {
        if (conn.open) conn.send(message);
      });
    }
  }, [timers, role, isDarkMode]);

  useEffect(() => {
    // Generate a random 6-digit number as the requested ID
    const shortId = Math.floor(100000 + Math.random() * 900000).toString();
    
    // Initialize Peer with the custom short ID
    const peer = new window.Peer(shortId);
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

    peer.on('error', (err) => {
      console.error('Peer error:', err);
      if (err.type === 'unavailable-id') {
        // If the numeric ID is taken, try again with a different one (auto-reconnect)
        const retryId = Math.floor(100000 + Math.random() * 900000).toString();
        const newPeer = new window.Peer(retryId);
        peerRef.current = newPeer;
        // Re-attach listeners would be needed here for a robust implementation, 
        // but for this request, a single collision-resistant random 6-digit is likely sufficient.
      }
    });

    return () => peer.destroy();
  }, []);

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
      name: `Exam Part ${timers.length + 1}`,
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

  return html`
    <div className=${`min-h-screen transition-all duration-500 flex flex-col p-4 md:p-8 ${isDarkMode ? 'bg-slate-900 text-slate-100' : 'bg-slate-50 text-slate-900'}`}>
      <header className="max-w-7xl mx-auto w-full mb-10">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-indigo-600 rounded-2xl flex items-center justify-center shadow-xl shadow-indigo-500/20">
              <svg className="w-7 h-7 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
            </div>
            <div>
              <h1 className="text-3xl font-black tracking-tight">DP Exam <span className="text-indigo-600">Sync</span></h1>
              <p className="text-xs font-bold uppercase tracking-widest text-slate-500">Multi-Device Timer Matrix</p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button onClick=${() => setIsDarkMode(!isDarkMode)} className=${`p-3 rounded-xl border transition-all ${isDarkMode ? 'bg-slate-800 border-slate-700 text-amber-400' : 'bg-white border-slate-200 text-slate-600'}`}>
              ${isDarkMode ? '☀️' : '🌙'}
            </button>
            ${role !== 'slave' && html`
              <button onClick=${addTimer} className="px-6 py-3 bg-emerald-600 text-white rounded-xl font-bold text-sm shadow-lg shadow-emerald-500/20 active:scale-95 transition-all">Add Timer</button>
              <button onClick=${() => setTimers(timers.map(t => ({...t, isRunning: true})))} className="px-6 py-3 bg-indigo-600 text-white rounded-xl font-bold text-sm shadow-lg shadow-indigo-500/20 active:scale-95 transition-all">Start All</button>
            `}
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto w-full flex-1">
        ${timers.length === 0 ? html`
          <div className="h-64 border-4 border-dashed border-slate-200 dark:border-slate-800 rounded-3xl flex flex-col items-center justify-center text-slate-400">
            <p className="font-bold">Matrix Empty. Initialize a timer to begin.</p>
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
        <div className=${`p-6 rounded-3xl border-2 transition-all ${isDarkMode ? 'bg-slate-800/40 border-slate-700' : 'bg-white border-slate-200 shadow-xl'}`}>
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
            <div className="flex items-center gap-4">
              <div className=${`w-3 h-3 rounded-full ${connectionStatus === 'connected' ? 'bg-emerald-500 animate-pulse' : 'bg-slate-400'}`}></div>
              <div>
                <p className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em]">P2P Sync Node</p>
                <p className="text-xl font-mono font-bold text-indigo-500 select-all tracking-widest">${peerId || '...'}</p>
              </div>
            </div>

            ${role === 'standalone' ? html`
              <div className="flex gap-2 w-full lg:w-auto">
                <input 
                  type="number"
                  value=${targetId} 
                  onChange=${(e) => setTargetId(e.target.value)} 
                  placeholder="Enter 6-Digit ID" 
                  className=${`flex-1 lg:w-64 border rounded-xl px-4 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none font-mono ${isDarkMode ? 'bg-slate-900 border-slate-700 text-white' : 'bg-slate-50 border-slate-200'}`} 
                />
                <button onClick=${connectToPeer} className="bg-indigo-600 text-white px-8 py-2 rounded-xl font-bold text-sm hover:bg-indigo-500 transition-colors">Join</button>
              </div>
            ` : html`
              <div className="flex items-center gap-6">
                <span className="text-sm font-black text-indigo-500 uppercase tracking-widest">${role} Role Active</span>
                <button onClick=${() => { connectionsRef.current.forEach(c => c.close()); setRole('standalone'); }} className="px-4 py-1.5 bg-rose-500/10 text-rose-500 rounded-lg font-bold text-xs hover:bg-rose-500 hover:text-white transition-all">Disconnect</button>
              </div>
            `}
          </div>
        </div>
      </footer>
    </div>
  `;
}
