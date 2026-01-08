
import React, { useState, useEffect, useRef } from 'react';
import htm from 'htm';
import TimerCard from './components/TimerCard.js';

const html = htm.bind(React.createElement);
const MAX_TIMERS = 12;
const MAX_CHILDREN = 4;
const DEFAULT_TIMER_SECONDS = 3600; 
const RECONNECT_INTERVAL = 3000;

export default function App() {
  const [timers, setTimers] = useState([]);
  const [role, setRole] = useState('standalone');
  const [peerId, setPeerId] = useState('');
  const [targetId, setTargetId] = useState('');
  const [connectedPeersCount, setConnectedPeersCount] = useState(0);
  const [connectionStatus, setConnectionStatus] = useState('disconnected');
  const [isServerConnected, setIsServerConnected] = useState(false);
  const [isDarkMode, setIsDarkMode] = useState(() => {
    const saved = localStorage.getItem('theme');
    return saved ? saved === 'dark' : window.matchMedia('(prefers-color-scheme: dark)').matches;
  });

  const peerRef = useRef(null);
  const connectionsRef = useRef([]); 
  const timersRef = useRef(timers);
  const reconnectTimeoutRef = useRef(null);
  const roleRef = useRef(role);
  const targetIdRef = useRef(targetId);

  useEffect(() => {
    roleRef.current = role;
    targetIdRef.current = targetId;
  }, [role, targetId]);

  // Sync timers and broadcast
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
        if (conn && conn.open) {
          conn.send(message);
        }
      });
    }
  }, [timers, role, isDarkMode]);

  // Initialize Peer and handle Signaling Server
  const initPeer = () => {
    if (peerRef.current && !peerRef.current.destroyed) return;

    // Generate a 4-digit ID instead of 6
    const shortId = Math.floor(1000 + Math.random() * 9000).toString();
    const peer = new window.Peer(shortId, {
      debug: 1,
      config: {
        'iceServers': [
          { url: 'stun:stun.l.google.com:19302' },
          { url: 'stun:stun1.l.google.com:19302' }
        ]
      }
    });

    peerRef.current = peer;

    peer.on('open', (id) => {
      setPeerId(id);
      setIsServerConnected(true);
    });

    peer.on('disconnected', () => {
      setIsServerConnected(false);
      console.log('Peer disconnected from signaling server. Attempting reconnection...');
      peer.reconnect();
    });

    peer.on('close', () => {
      setIsServerConnected(false);
      setConnectionStatus('disconnected');
    });

    peer.on('error', (err) => {
      console.error('PeerJS signaling error:', err);
      if (err.type === 'network' || err.type === 'server-error' || err.type === 'lost-connection') {
        setIsServerConnected(false);
        setTimeout(initPeer, RECONNECT_INTERVAL);
      }
    });

    // Master Logic: Handle incoming connections
    peer.on('connection', (conn) => {
      const activeConns = connectionsRef.current.filter(c => c.open);
      if (activeConns.length >= MAX_CHILDREN) {
        conn.on('open', () => {
          conn.send({ type: 'ERROR', message: 'Parent node full (Max 4).' });
          setTimeout(() => conn.close(), 500);
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
        conn.send({ type: 'SYNC_STATE', payload: { timers: timersRef.current } });
      });

      const handleCleanup = () => {
        connectionsRef.current = connectionsRef.current.filter(c => c.peer !== conn.peer);
        const remaining = connectionsRef.current.filter(c => c.open).length;
        setConnectedPeersCount(remaining);
        if (remaining === 0 && roleRef.current === 'master') {
          setRole('standalone');
          setConnectionStatus('disconnected');
        }
      };

      conn.on('close', handleCleanup);
      conn.on('error', handleCleanup);
    });
  };

  useEffect(() => {
    initPeer();
    return () => {
      if (peerRef.current) peerRef.current.destroy();
    };
  }, []);

  // Timer ticking for Master/Standalone
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

  // Connect function (Used by Slave)
  const connectToParent = (forcedId) => {
    const target = forcedId || targetId;
    if (!target || !peerRef.current || peerRef.current.destroyed) {
      if (!peerRef.current || peerRef.current.destroyed) initPeer();
      return;
    }
    
    setConnectionStatus('connecting');
    connectionsRef.current.forEach(c => c.close());
    
    const conn = peerRef.current.connect(target, { 
      reliable: true,
      label: 'sync-channel'
    });
    
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

    const handleChildDisconnect = () => {
      if (roleRef.current === 'slave') {
        setConnectionStatus('reconnecting');
        if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = setTimeout(() => connectToParent(target), RECONNECT_INTERVAL);
      }
    };

    conn.on('close', handleChildDisconnect);
    conn.on('error', handleChildDisconnect);
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
              <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500 flex items-center gap-2">
                ${isServerConnected ? html`<span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span> Signaling Online` : html`<span className="w-2 h-2 rounded-full bg-rose-500"></span> Server Offline`}
                ${role === 'slave' && html`<span className="text-emerald-500 ml-2">• P2P Active</span>`}
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
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto w-full flex-1">
        ${timers.length === 0 ? html`
          <div className="h-64 border-4 border-dashed border-slate-200 dark:border-slate-800 rounded-3xl flex flex-col items-center justify-center text-slate-400">
            <svg className="w-16 h-16 mb-4 opacity-10" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
            <p className="font-bold text-lg">Cluster Inactive</p>
            <p className="text-sm">Parent node must initialize sequences.</p>
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
                <p className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em]">Cluster ID: ${connectionStatus.toUpperCase()}</p>
                <div className="flex items-center gap-2">
                  <p className="text-xl font-mono font-bold text-indigo-500 select-all tracking-widest">${peerId || '...'}</p>
                  ${role === 'master' && html`
                    <span className="bg-indigo-600 text-white text-[10px] px-2 py-0.5 rounded-full font-bold uppercase tracking-tighter">
                      Parent • ${connectedPeersCount} / ${MAX_CHILDREN} Sync Active
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
                  placeholder="Parent ID" 
                  className=${`flex-1 lg:w-48 border rounded-xl px-4 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none font-mono ${isDarkMode ? 'bg-slate-900 border-slate-700 text-white' : 'bg-slate-50 border-slate-200'}`} 
                />
                <button onClick=${() => connectToParent()} className="bg-indigo-600 text-white px-8 py-2 rounded-xl font-bold text-sm hover:bg-indigo-500 transition-all shadow-lg shadow-indigo-500/20">Join Parent</button>
              </div>
            ` : html`
              <div className="flex items-center gap-6">
                <div className="flex flex-col items-end">
                   <span className="text-sm font-black text-indigo-500 uppercase tracking-widest">${role === 'slave' ? 'Child Node Synced' : 'Cluster Authority (Parent)'}</span>
                   ${role === 'slave' && connectionStatus === 'reconnecting' && html`<span className="text-[10px] text-amber-500 font-bold animate-pulse">Searching for Parent...</span>`}
                </div>
                <button onClick=${disconnectAll} className="px-4 py-2 bg-rose-500/10 text-rose-500 rounded-xl font-bold text-xs hover:bg-rose-500 hover:text-white transition-all">Disconnect</button>
              </div>
            `}
          </div>
        </div>
      </footer>
    </div>
  `;
}
