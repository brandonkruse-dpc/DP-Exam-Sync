
import React, { useState, useEffect, useRef } from 'react';
import htm from 'htm';
import TimerCard from './components/TimerCard.js';

const html = htm.bind(React.createElement);
const MAX_TIMERS = 12;
const MAX_SLAVES = 4;
const DEFAULT_TIMER_SECONDS = 3600; // Default to 1 hour
const RECONNECT_INTERVAL = 3000;

export default function App() {
  const [timers, setTimers] = useState([]);
  const [role, setRole] = useState('standalone');
  const [peerId, setPeerId] = useState('');
  const [targetId, setTargetId] = useState('');
  const [connectedPeersCount, setConnectedPeersCount] = useState(0);
  const [connectionStatus, setConnectionStatus] = useState('disconnected');
  const [isDarkMode, setIsDarkMode] = useState(() => {
    const saved = localStorage.getItem('theme');
    return saved ? saved === 'dark' : window.matchMedia('(prefers-color-scheme: dark)').matches;
  });

  const peerRef = useRef(null);
  const connectionsRef = useRef([]); // Master stores many, Slave stores one
  const timersRef = useRef(timers);
  const reconnectTimeoutRef = useRef(null);

  // Persistence and Theme Sync
  useEffect(() => {
    timersRef.current = timers;
    if (isDarkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
    localStorage.setItem('theme', isDarkMode ? 'dark' : 'light');
    
    // Broadcast state to all connected peers if we are the master
    if (role === 'master' && connectionsRef.current.length > 0) {
      const message = { type: 'SYNC_STATE', payload: { timers } };
      connectionsRef.current.forEach(conn => {
        if (conn && conn.open) {
          conn.send(message);
        }
      });
    }
  }, [timers, role, isDarkMode]);

  // PeerJS Initialization
  useEffect(() => {
    const shortId = Math.floor(100000 + Math.random() * 900000).toString();
    const peer = new window.Peer(shortId, {
      debug: 1
    });
    peerRef.current = peer;

    peer.on('open', (id) => setPeerId(id));

    // Master Logic: Handle incoming connections
    peer.on('connection', (conn) => {
      // Limit to MAX_SLAVES
      const activeConns = connectionsRef.current.filter(c => c.open);
      if (activeConns.length >= MAX_SLAVES) {
        conn.on('open', () => {
          conn.send({ type: 'ERROR', message: 'Master node reached maximum capacity (4 clients).' });
          setTimeout(() => conn.close(), 1000);
        });
        return;
      }

      setRole('master');
      setConnectionStatus('connected');
      
      conn.on('open', () => {
        if (!connectionsRef.current.find(c => c.peer === conn.peer)) {
          connectionsRef.current.push(conn);
        }
        setConnectedPeersCount(connectionsRef.current.filter(c => c.open).length);
        // Immediate initial sync
        conn.send({ type: 'SYNC_STATE', payload: { timers: timersRef.current } });
      });

      conn.on('close', () => {
        connectionsRef.current = connectionsRef.current.filter(c => c.peer !== conn.peer);
        const remaining = connectionsRef.current.filter(c => c.open).length;
        setConnectedPeersCount(remaining);
        if (remaining === 0) {
          setRole('standalone');
          setConnectionStatus('disconnected');
        }
      });

      conn.on('error', () => {
        connectionsRef.current = connectionsRef.current.filter(c => c.peer !== conn.peer);
        setConnectedPeersCount(connectionsRef.current.filter(c => c.open).length);
      });
    });

    peer.on('disconnected', () => {
      peer.reconnect();
    });

    peer.on('error', (err) => {
      console.error('Peer error:', err);
      if (err.type === 'unavailable-id') {
        // ID Collision, unlikely but possible
        window.location.reload();
      }
    });

    return () => {
      if (peerRef.current) peerRef.current.destroy();
    };
  }, []);

  // Timer Ticking Logic (Master & Standalone only)
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

  // Slave Reconnection logic
  const attemptReconnect = (target) => {
    if (role !== 'slave' || !target) return;
    console.log(`Attempting auto-reconnect to ${target}...`);
    connectToPeer(target);
  };

  const connectToPeer = (idToConnect) => {
    const target = idToConnect || targetId;
    if (!target || !peerRef.current) return;
    
    setConnectionStatus('connecting');
    const conn = peerRef.current.connect(target, { reliable: true });
    
    conn.on('open', () => {
      setRole('slave');
      setConnectionStatus('connected');
      connectionsRef.current = [conn];
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
      }
    });

    conn.on('data', (data) => {
      if (data.type === 'SYNC_STATE') {
        setTimers(data.payload.timers);
      } else if (data.type === 'ERROR') {
        alert(data.message);
        disconnectAll();
      }
    });

    conn.on('close', () => {
      if (role === 'slave') {
        setConnectionStatus('reconnecting');
        reconnectTimeoutRef.current = setTimeout(() => attemptReconnect(target), RECONNECT_INTERVAL);
      } else {
        setConnectionStatus('disconnected');
        setRole('standalone');
      }
    });

    conn.on('error', (err) => {
      console.error("Connection error:", err);
      setConnectionStatus('error');
      if (role === 'slave') {
        reconnectTimeoutRef.current = setTimeout(() => attemptReconnect(target), RECONNECT_INTERVAL);
      }
    });
  };

  const disconnectAll = () => {
    if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
    connectionsRef.current.forEach(c => c.close());
    connectionsRef.current = [];
    setRole('standalone');
    setConnectionStatus('disconnected');
    setConnectedPeersCount(0);
  };

  const addTimer = () => {
    if (timers.length >= MAX_TIMERS) return;
    const newTimer = {
      id: Math.random().toString(36).substr(2, 9),
      name: `Exam Segment ${timers.length + 1}`,
      initialSeconds: DEFAULT_TIMER_SECONDS,
      remainingSeconds: DEFAULT_TIMER_SECONDS,
      isRunning: false
    };
    setTimers([...timers, newTimer]);
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
              <p className="text-xs font-bold uppercase tracking-widest text-slate-500">
                ${role === 'slave' ? html`<span className="text-emerald-500 animate-pulse">Syncing Active</span>` : 'Global Synchronized Timer Array'}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button onClick=${() => setIsDarkMode(!isDarkMode)} className=${`p-3 rounded-xl border transition-all ${isDarkMode ? 'bg-slate-800 border-slate-700 text-amber-400' : 'bg-white border-slate-200 text-slate-600'}`}>
              ${isDarkMode ? '☀️' : '🌙'}
            </button>
            ${role !== 'slave' && html`
              <button onClick=${addTimer} className="px-5 py-3 bg-emerald-600 text-white rounded-xl font-bold text-sm shadow-lg shadow-emerald-500/20 active:scale-95 transition-all">Add Timer</button>
              <button onClick=${() => setTimers(timers.map(t => ({...t, isRunning: true})))} className="px-5 py-3 bg-indigo-600 text-white rounded-xl font-bold text-sm shadow-lg shadow-indigo-500/20 active:scale-95 transition-all">Start All</button>
              <button onClick=${() => setTimers(timers.map(t => ({...t, isRunning: false})))} className=${`px-5 py-3 rounded-xl font-bold text-sm transition-all ${isDarkMode ? 'bg-slate-700 text-white' : 'bg-slate-200 text-slate-700'}`}>Pause All</button>
            `}
            ${role === 'slave' && html`
               <div className="px-5 py-3 bg-indigo-600/10 text-indigo-500 rounded-xl font-bold text-sm border border-indigo-500/20">
                  Slave Monitoring Mode
               </div>
            `}
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto w-full flex-1">
        ${timers.length === 0 ? html`
          <div className="h-64 border-4 border-dashed border-slate-200 dark:border-slate-800 rounded-3xl flex flex-col items-center justify-center text-slate-400">
            <svg className="w-16 h-16 mb-4 opacity-10" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
            <p className="font-bold text-lg">No timers active.</p>
            <p className="text-sm">Master node must deploy sequences to display here.</p>
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
              <div className=${`w-4 h-4 rounded-full ${connectionStatus === 'connected' ? 'bg-emerald-500' : connectionStatus === 'connecting' || connectionStatus === 'reconnecting' ? 'bg-amber-500 animate-pulse' : 'bg-slate-400'}`}></div>
              <div>
                <p className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em]">Network Status: ${connectionStatus.toUpperCase()}</p>
                <div className="flex items-center gap-2">
                  <p className="text-xl font-mono font-bold text-indigo-500 select-all tracking-widest">${peerId || '...'}</p>
                  ${role === 'master' && html`
                    <span className="bg-indigo-600 text-white text-[10px] px-2 py-0.5 rounded-full font-bold uppercase tracking-tighter">
                      Master • ${connectedPeersCount} / ${MAX_SLAVES} Clients Connected
                    </span>
                  `}
                </div>
              </div>
            </div>

            ${role === 'standalone' ? html`
              <div className="flex gap-2 w-full lg:w-auto">
                <input 
                  type="text"
                  value=${targetId} 
                  onChange=${(e) => setTargetId(e.target.value)} 
                  placeholder="Enter Master 6-Digit ID" 
                  className=${`flex-1 lg:w-64 border rounded-xl px-4 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none font-mono ${isDarkMode ? 'bg-slate-900 border-slate-700 text-white' : 'bg-slate-50 border-slate-200'}`} 
                />
                <button onClick=${() => connectToPeer()} className="bg-indigo-600 text-white px-8 py-2 rounded-xl font-bold text-sm hover:bg-indigo-500 transition-all shadow-lg shadow-indigo-500/20">Join Network</button>
              </div>
            ` : html`
              <div className="flex items-center gap-6">
                <div className="flex flex-col items-end">
                   <span className="text-sm font-black text-indigo-500 uppercase tracking-widest">${role === 'slave' ? 'Connected to Master Node' : 'Broadcasting Cluster'}</span>
                   ${role === 'slave' && connectionStatus === 'reconnecting' && html`<span className="text-[10px] text-amber-500 font-bold">Auto-reconnect active...</span>`}
                </div>
                <button onClick=${disconnectAll} className="px-4 py-2 bg-rose-500/10 text-rose-500 rounded-xl font-bold text-xs hover:bg-rose-500 hover:text-white transition-all">Disconnect</button>
              </div>
            `}
          </div>
        </div>
        <p className="text-[10px] text-center mt-4 text-slate-500 font-medium tracking-tight">
           * Support for up to 4 synchronized secondary screens. Slaves will automatically attempt to reconnect if the session is interrupted.
        </p>
      </footer>
    </div>
  `;
}
